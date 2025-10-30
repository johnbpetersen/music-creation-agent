import { createAxLLMClient } from "@lucid-dreams/agent-kit";

const axClient = createAxLLMClient({
  logger: {
    warn(message, error) {
      if (error) console.warn(`[ai] ${message}`, error);
      else console.warn(`[ai] ${message}`);
    },
  },
});

if (!axClient.isConfigured()) {
  console.warn("[ai] Ax LLM not configured — deterministic fallbacks will be used.");
}

export function getAxClient() {
  return axClient;
}

export function isAxConfigured() {
  return axClient.isConfigured();
}
