import { z } from "zod";
import type { Context, Hono } from "hono";
import { exact } from "x402/schemes";
import { musicEntrypoint, musicInputSchema } from "../entrypoints/music";
import { env } from "../config/env";
import { getChainConfig } from "../config/chain";
import { getMusicPrice } from "../payments/musicPricing";
import {
  verifyAuthorizationWithFacilitator,
  type FacilitatorAuthorization,
} from "../services/facilitator";

const ConfirmRequestSchema = z.object({
  input: musicInputSchema,
  paymentHeader: z.string().min(1),
});

const chainConfig = getChainConfig(env);
const payToAddress: `0x${string}` =
  (env.PAY_TO as `0x${string}` | undefined) ??
  "0xb308ed39d67D0d4BAe5BC2FAEF60c66BBb6AE429";

function respondError(
  c: Context,
  status: number,
  code: string,
  message: string,
  detail?: unknown
) {
  return c.json(
    {
      ok: false,
      code,
      message,
      detail,
    },
    status
  );
}

export function registerX402ConfirmRoute(app: Hono) {
  app.post("/api/x402/confirm", async (c) => {
    let parsed;
    try {
      const body = await c.req.json();
      parsed = ConfirmRequestSchema.safeParse(body);
    } catch (error) {
      return respondError(
        c,
        400,
        "INVALID_JSON",
        "Unable to parse request body",
        error instanceof Error ? error.message : String(error)
      );
    }

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return respondError(
        c,
        400,
        "INVALID_REQUEST",
        issue?.message ?? "Invalid confirm payload"
      );
    }

    const { input, paymentHeader } = parsed.data;

    let decoded;
    try {
      decoded = exact.evm.decodePayment(paymentHeader);
    } catch (error) {
      return respondError(
        c,
        400,
        "INVALID_PAYMENT_HEADER",
        "Failed to decode payment header",
        error instanceof Error ? error.message : String(error)
      );
    }

    if (decoded.scheme !== "exact") {
      return respondError(
        c,
        400,
        "UNSUPPORTED_SCHEME",
        `Unsupported scheme: ${decoded.scheme}`
      );
    }

    if (decoded.network !== chainConfig.network) {
      return respondError(
        c,
        400,
        "WRONG_NETWORK",
        `Payment signed for ${decoded.network}, expected ${chainConfig.network}`
      );
    }

    const signature = decoded.payload.signature;
    if (typeof signature !== "string" || signature.length === 0) {
      return respondError(
        c,
        400,
        "MISSING_SIGNATURE",
        "Payment header missing signature."
      );
    }

    const authorization = {
      ...decoded.payload.authorization,
      signature,
    } as FacilitatorAuthorization;
    const normalizedTo = authorization.to.toLowerCase();
    const normalizedExpectedTo = payToAddress.toLowerCase();

    if (normalizedTo !== normalizedExpectedTo) {
      return respondError(
        c,
        400,
        "WRONG_RECIPIENT",
        "Authorization recipient does not match payTo"
      );
    }

    const { cents: priceCents, atomic: expectedAtomic } = getMusicPrice(
      input.seconds
    );

    if (expectedAtomic === "0") {
      return respondError(
        c,
        400,
        "INVALID_PRICE",
        "Unable to determine payment amount for the request"
      );
    }

    const normalizedValue = BigInt(authorization.value).toString();
    if (normalizedValue !== expectedAtomic) {
      return respondError(
        c,
        400,
        "WRONG_AMOUNT",
        `Authorization amount ${normalizedValue} does not match required amount ${expectedAtomic}`
      );
    }

    const verifyResult = await verifyAuthorizationWithFacilitator({
      facilitatorUrl: env.FACILITATOR_URL,
      chainId: chainConfig.chainId,
      tokenAddress: chainConfig.usdcAddress,
      payTo: payToAddress,
      amountAtomic: expectedAtomic,
      authorization,
    });

    if (!verifyResult.ok) {
      return respondError(
        c,
        400,
        "VERIFY_FAILED",
        verifyResult.message,
        verifyResult.detail
      );
    }

    const controller = new AbortController();
    const runId = crypto.randomUUID();

    try {
      const handlerResult = await musicEntrypoint.handler({
        input,
        key: musicEntrypoint.key,
        signal: controller.signal,
        headers: new Headers(),
        runId,
      });

      const trackUrl = handlerResult.output.trackUrl;

      return c.json({
        ok: true,
        trackUrl,
        price: {
          cents: priceCents,
          amountAtomic: expectedAtomic,
        },
        requestId: runId,
        provider: handlerResult.model,
      });
    } catch (error) {
      return respondError(
        c,
        500,
        "MUSIC_ERROR",
        "Failed to generate track",
        error instanceof Error ? error.message : String(error)
      );
    }
  });
}
