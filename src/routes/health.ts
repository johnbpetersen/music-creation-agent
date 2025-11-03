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

    const ok = axReady && elevenReady;

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
      },
    });
  });
}
