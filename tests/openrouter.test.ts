import { describe, expect, it, mock, afterEach } from "bun:test";
import { refineWithOpenRouter, isOpenRouterEnabled } from "../src/ai/openrouter";
import { env } from "../src/config/env";

describe("openrouter client", () => {
  const originalFetch = globalThis.fetch;
  const originalConfig = {
    apiKey: env.OPENROUTER_API_KEY,
    model: env.OPENROUTER_MODEL,
    base: env.OPENROUTER_BASE_URL,
  };

  afterEach(() => {
    globalThis.fetch = originalFetch;
    (env as any).OPENROUTER_API_KEY = originalConfig.apiKey;
    (env as any).OPENROUTER_MODEL = originalConfig.model;
    (env as any).OPENROUTER_BASE_URL = originalConfig.base;
  });

  it("refines prompt via OpenRouter and returns content", async () => {
    (env as any).OPENROUTER_API_KEY = "test-key";
    (env as any).OPENROUTER_MODEL = "deepseek/deepseek-v3.1";
    (env as any).OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

    const mockResponse = {
      choices: [
        {
          message: {
            content:
              "Compose a 30-second instrumental lo-fi track with warm piano, vinyl crackle, and relaxed hip-hop drums.",
          },
        },
      ],
    };

    globalThis.fetch = mock(async (_input, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(init.body as string) : null;
      expect(body?.model).toBe("deepseek/deepseek-v3.1");
      expect(body?.messages?.length).toBeGreaterThan(0);
      return new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    expect(isOpenRouterEnabled()).toBe(true);

    const result = await refineWithOpenRouter({
      prompt: "lofi chill beats",
      seconds: 30,
      instrumental: true,
    });

    expect(result.refinedPrompt).toContain("instrumental");
    expect(result.model).toBe("deepseek/deepseek-v3.1");
  });

  it("throws when OpenRouter is not configured", async () => {
    (env as any).OPENROUTER_API_KEY = undefined;

    await expect(
      refineWithOpenRouter({
        prompt: "test",
        seconds: 10,
        instrumental: false,
      })
    ).rejects.toThrow("OpenRouter not configured");
  });

  it("propagates non-200 responses", async () => {
    (env as any).OPENROUTER_API_KEY = "test-key";
    (env as any).OPENROUTER_MODEL = "deepseek/deepseek-v3.1";

    globalThis.fetch = mock(async () => {
      return new Response("error", { status: 500, statusText: "Server Error" });
    }) as typeof fetch;

    await expect(
      refineWithOpenRouter({
        prompt: "test prompt",
        seconds: 15,
        instrumental: false,
      })
    ).rejects.toThrow("OpenRouter request failed");
  });

});
