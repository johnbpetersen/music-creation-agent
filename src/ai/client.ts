import { createAxLLMClient } from "@lucid-dreams/agent-kit";
import { privateKeyToAccount } from "viem/accounts";

const axClient = createAxLLMClient({
  model: process.env.AX_MODEL || process.env.AXLLM_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini",
  logger: {
    warn(message, error) {
      if (error) console.warn(`[ai] ${message}`, error);
      else console.warn(`[ai] ${message}`);
    },
  },
});

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
