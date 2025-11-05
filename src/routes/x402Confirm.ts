import { z } from "zod";
import type { Context, Hono } from "hono";
import { exact } from "x402/schemes";
import { PaymentRequirementsSchema } from "x402/types";
import { musicEntrypoint, musicInputSchema } from "../entrypoints/music";
import { env } from "../config/env";
import { getChainConfig } from "../config/chain";
import {
  getMusicPrice,
  MUSIC_DEFAULT_TIMEOUT_SECONDS,
  MUSIC_OUTPUT_STRUCTURE,
  MUSIC_PATH,
} from "../payments/musicPricing";
import { verifyAuthorizationWithFacilitator } from "../services/facilitator";
import { settleAuthorization } from "../services/settlement";

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

    const authorization = decoded.payload.authorization;
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

    const requestUrl = new URL(c.req.url);
    const resourceUrl = `${requestUrl.origin}${MUSIC_PATH}`;

    const paymentRequirements = PaymentRequirementsSchema.parse({
      scheme: "exact",
      network: chainConfig.network,
      maxAmountRequired: expectedAtomic,
      resource: resourceUrl,
      description:
        musicEntrypoint.description ??
        "Refine a music prompt with Ax LLM and render a track via ElevenLabs.",
      mimeType: "application/json",
      outputSchema: MUSIC_OUTPUT_STRUCTURE,
      payTo: payToAddress,
      maxTimeoutSeconds: MUSIC_DEFAULT_TIMEOUT_SECONDS,
      asset: chainConfig.usdcAddress,
      extra: { name: "USDC", version: "2" },
    });

    const verification = await verifyAuthorizationWithFacilitator({
      facilitatorUrl: env.FACILITATOR_URL,
      x402Version: decoded.x402Version,
      paymentRequirements: {
        ...paymentRequirements,
        resource: paymentRequirements.resource ?? resourceUrl,
        maxAmountRequired: expectedAtomic,
        mimeType: paymentRequirements.mimeType ?? "application/json",
        description:
          paymentRequirements.description ??
          musicEntrypoint.description ??
          "Music generation entrypoint",
        outputSchema:
          paymentRequirements.outputSchema ?? MUSIC_OUTPUT_STRUCTURE,
        maxTimeoutSeconds:
          paymentRequirements.maxTimeoutSeconds ?? MUSIC_DEFAULT_TIMEOUT_SECONDS,
        extra: paymentRequirements.extra ?? { name: "USDC", version: "2" },
      },
      paymentPayload: decoded,
      expected: {
        chain: chainConfig.network,
        asset: chainConfig.usdcAddress,
        payTo: payToAddress,
        amountAtomic: expectedAtomic,
      },
    });

    if (!verification.ok) {
      return respondError(
        c,
        400,
        "VERIFY_FAILED",
        verification.message,
        verification.detail
      );
    }

    let settlementTxHash: string | undefined;

    if (env.SETTLE_TRANSACTIONS === "true") {
      const settleKey = env.SETTLE_PRIVATE_KEY;
      if (!settleKey) {
        console.warn(
          "[x402-confirm] Settlement requested but SETTLE_PRIVATE_KEY missing"
        );
      } else {
        try {
          settlementTxHash = await settleAuthorization({
            authorization: {
              ...authorization,
              signature,
            },
            usdcContract: chainConfig.usdcAddress as `0x${string}`,
            chainId: chainConfig.chainId,
            rpcUrl: env.SETTLE_RPC_URL ?? chainConfig.rpcUrl,
            privateKey: settleKey as `0x${string}`,
          });
          console.info("[x402-confirm] Settlement broadcast", {
            txHash: settlementTxHash,
          });
        } catch (error) {
          console.error("[x402-confirm] Settlement failed", error);
        }
      }
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
        refinedPrompt: handlerResult.output.refinedPrompt,
        price: {
          cents: priceCents,
          amountAtomic: expectedAtomic,
        },
        requestId: runId,
        provider: handlerResult.model,
        settlementTxHash,
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
