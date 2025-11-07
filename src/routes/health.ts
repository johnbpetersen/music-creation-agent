import type { Hono } from "hono";
import { env } from "../config/env";
import { isAxConfigured } from "../ai/client";
import { getElevenLabsStatus } from "../ai/elevenlabs";

export function registerHealthRoute(app: Hono) {
  app.get("/api/health", (c) => {
    const axRequested = env.USE_REAL_LLM === "true";
    const axConfigured = isAxConfigured();
    const axReady = !axRequested || axConfigured;

    const elevenStatus = getElevenLabsStatus();
    const elevenReady = elevenStatus.ready;
    const settlementRequested = env.SETTLE_TRANSACTIONS === "true";
    const settlementHasKey =
      typeof env.SETTLE_PRIVATE_KEY === "string" &&
      env.SETTLE_PRIVATE_KEY.length > 0;
    const settlementBlockedByTestEnv =
      settlementRequested &&
      (env.NODE_ENV === "test" || process.env.NODE_ENV === "test");
    const settlementActive = settlementRequested && !settlementBlockedByTestEnv;
    const settlementReady = settlementActive && settlementHasKey;

    const ok =
      axReady && elevenReady && (!settlementActive || settlementReady);

    return c.json({
      ok,
      services: {
        daydreamsAx: {
          mode: axRequested ? "live" : "fallback",
          configured: axConfigured,
          ready: axReady,
          message: axReady
            ? undefined
            : "Ax LLM agent not configured. Set OPENAI_API_KEY and USE_REAL_LLM=true.",
        },
        elevenLabs: {
          mode: elevenStatus.mode,
          ready: elevenStatus.ready,
          maxSeconds: elevenStatus.maxSeconds,
          message: elevenStatus.message,
        },
        settlement: {
          requested: settlementRequested,
          active: settlementActive,
          ready: settlementReady,
          message: settlementRequested
            ? settlementBlockedByTestEnv
              ? "Settlement disabled while NODE_ENV=test."
              : !settlementHasKey
                ? "SETTLE_PRIVATE_KEY missing; settlement disabled."
                : undefined
            : "Disabled (SETTLE_TRANSACTIONS!=true).",
        },
      },
    });
  });
}
