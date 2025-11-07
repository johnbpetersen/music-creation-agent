import { ai, type AxAI } from "@ax-llm/ax";
import { privateKeyToAccount } from "viem/accounts";
import { env } from "../config/env";

type AxClient = {
  ax: AxAI | null;
  isConfigured: () => boolean;
};

const MODEL_FALLBACK =
  env.AX_MODEL ?? env.AXLLM_MODEL ?? env.OPENAI_MODEL ?? "gpt-4.1-mini";
const OPENAI_API_KEY = (process.env.OPENAI_API_KEY ?? "").trim();
const OPENAI_API_URL = (process.env.OPENAI_API_URL ?? "").trim();

let axInstance: AxAI | null = null;

if (!OPENAI_API_KEY) {
  console.warn(
    "[ai] OPENAI_API_KEY missing — deterministic fallbacks will be used."
  );
} else {
  try {
    axInstance = ai({
      name: "openai",
      apiKey: OPENAI_API_KEY,
      ...(OPENAI_API_URL ? { apiURL: OPENAI_API_URL } : {}),
      config: {
        model: MODEL_FALLBACK,
        stream: true,
      },
      options: {
        debug: env.NODE_ENV !== "production",
      },
    });
  } catch (error) {
    console.warn(
      "[ai] Failed to initialise Daydreams Ax client",
      error instanceof Error ? error.message : error
    );
  }
}

const axClient: AxClient = {
  ax: axInstance,
  isConfigured: () => Boolean(axInstance),
};

if (!axClient.isConfigured()) {
  console.warn(
    "[ai] Ax LLM not configured — deterministic fallbacks will be used."
  );
} else {
  try {
    const pk = (process.env.PRIVATE_KEY || "").trim();
    if (/^0x[0-9a-fA-F]{64}$/.test(pk)) {
      const acct = privateKeyToAccount(pk as `0x${string}`);
      console.info("[ai] Ax payer address", { address: acct.address });
    } else {
      console.warn(
        "[ai] Ax payer PRIVATE_KEY not set or invalid (expected 0x + 64 hex)"
      );
    }
  } catch (err) {
    console.warn(
      "[ai] Unable to derive Ax payer address",
      (err as Error)?.message
    );
  }
}

export function getAxClient() {
  return axClient;
}

export function isAxConfigured() {
  return axClient.isConfigured();
}
