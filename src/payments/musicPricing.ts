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

const USDC_BASE_SEPOLIA_ASSET = {
  address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const,
  decimals: 6,
  eip712: {
    name: "USDC",
    version: "2",
  },
};

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

function centsToAtomicAmount(cents: number): string {
  // USDC has 6 decimals, so shift cents (10^-2) by 6 -> multiply by 10^4.
  const atomic = BigInt(Math.max(0, cents)) * 10_000n;
  return atomic.toString();
}

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
  network?: Network;
  description?: string;
};

export function createMusicPricingMiddleware({
  payTo,
  facilitatorUrl,
  network = DEFAULT_NETWORK,
  description = musicEntrypoint.description ?? "Music generation entrypoint",
}: MusicPricingOptions): MiddlewareHandler {
  return async (c, next) => {
    let seconds = 0;
    try {
      const cloned = c.req.raw.clone();
      const payload = await cloned.json();
      const parsedSeconds = deriveSeconds(payload);
      if (typeof parsedSeconds === "number" && parsedSeconds > 0) {
        seconds = Math.floor(parsedSeconds);
      }
    } catch {
      // Ignore body parsing failures; we'll fall back to zero-second pricing.
    }

    const priceCents = seconds * 5;
    const priceAtomic = centsToAtomicAmount(priceCents);

    const middleware = paymentMiddleware(
      payTo,
      {
        [MUSIC_ROUTE_KEY]: {
          price: {
            amount: priceAtomic,
            asset: USDC_BASE_SEPOLIA_ASSET,
          },
          network,
          config: {
            description,
            mimeType: "application/json",
            maxTimeoutSeconds: DEFAULT_TIMEOUT_SECONDS,
            inputSchema: inputStructure,
            outputSchema: outputStructure,
            resource: c.req.url,
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
