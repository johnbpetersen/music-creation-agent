import type { MiddlewareHandler } from "hono";
import { paymentMiddleware } from "x402-hono";
import type { Network, Resource } from "x402/types";
import { toJsonSchemaOrUndefined } from "@lucid-dreams/agent-kit";
import {
  musicEntrypoint,
  musicInputSchema,
  musicOutputSchema,
} from "../entrypoints/music";

const MUSIC_ROUTE_KEY = "POST /entrypoints/music/invoke";
const MUSIC_PATH = "/entrypoints/music/invoke";
const DEFAULT_NETWORK: Network = "base-sepolia";
const DEFAULT_TIMEOUT_SECONDS = 300;
const MIN_SECONDS_BILLED = 5;
const USDC_MICRO_PER_SECOND = 33_300n; // $0.0333 per second
export const USD_RATE_PER_SECOND = Number(USDC_MICRO_PER_SECOND) / 1_000_000;
export const USDC_EIP712_EXTRA = { name: "USDC", version: "2" } as const;

const requestSchema = toJsonSchemaOrUndefined(musicInputSchema);
const responseSchema = toJsonSchemaOrUndefined(musicOutputSchema);

const inputStructure =
  requestSchema !== undefined
    ? {
        bodyType: "json" as const,
        bodyFields: {
          input: requestSchema,
        },
      }
    : { bodyType: "json" as const };

const outputStructure =
  responseSchema !== undefined ? { output: responseSchema } : undefined;

function deriveSeconds(body: unknown): number | undefined {
  if (
    typeof body === "object" &&
    body !== null &&
    "input" in body &&
    typeof (body as any).input === "object" &&
    (body as any).input !== null
  ) {
    const seconds = Number((body as any).input.seconds);
    if (Number.isFinite(seconds)) {
      return seconds;
    }
  }
  return undefined;
}

export type MusicPricingOptions = {
  payTo: `0x${string}`;
  facilitatorUrl: Resource;
  usdcAddress: `0x${string}`;
  network?: Network;
  description?: string;
};

export function getMusicPrice(seconds: number): {
  cents: number;
  atomic: string;
} {
  const billedSeconds = Math.max(MIN_SECONDS_BILLED, Math.floor(seconds));
  const atomicAmount = BigInt(billedSeconds) * USDC_MICRO_PER_SECOND;
  const cents = Number(atomicAmount) / 10_000;
  return { cents, atomic: atomicAmount.toString() };
}

export function createMusicPricingMiddleware({
  payTo,
  facilitatorUrl,
  usdcAddress,
  network = DEFAULT_NETWORK,
  description = musicEntrypoint.description ?? "Music generation entrypoint",
}: MusicPricingOptions): MiddlewareHandler {
  return async (c, next) => {
    const resourceUrl = new URL(c.req.url).toString() as Resource;

    let seconds = 0;
    try {
      const cloned = c.req.raw.clone();
      const payload = await cloned.json();
      const parsedSeconds = deriveSeconds(payload);
      console.info(
        "[music-payments] parsed payload",
        { parsedSeconds, payload }
      );
      if (typeof parsedSeconds === "number" && parsedSeconds > 0) {
        seconds = Math.floor(parsedSeconds);
      }
    } catch (error) {
      console.warn(
        "[music-payments] failed to parse request body for pricing",
        error
      );
    }

    const { cents: priceCents, atomic: priceAtomic } = getMusicPrice(seconds);
    const priceUsd = priceCents / 100;
    console.info(
      "[music-payments] computed price",
      `${priceUsd.toFixed(4)} USD`,
      "(atomic",
      priceAtomic,
      ") for",
      c.req.url
    );

    const middleware = paymentMiddleware(
      payTo,
      {
        [MUSIC_ROUTE_KEY]: {
          price: {
            amount: priceAtomic,
            asset: {
              address: usdcAddress,
              decimals: 6,
              eip712: USDC_EIP712_EXTRA,
            },
          },
          network,
          config: {
            description,
            mimeType: "application/json",
            maxTimeoutSeconds: DEFAULT_TIMEOUT_SECONDS,
            inputSchema: inputStructure,
            outputSchema: outputStructure,
            resource: resourceUrl,
            discoverable: true,
          },
        },
      },
      { url: facilitatorUrl }
    );

    return middleware(c, next);
  };
}

export { MUSIC_PATH };
export const MUSIC_INPUT_STRUCTURE = inputStructure;
export const MUSIC_OUTPUT_STRUCTURE = outputStructure;
export const MUSIC_DEFAULT_TIMEOUT_SECONDS = DEFAULT_TIMEOUT_SECONDS;
