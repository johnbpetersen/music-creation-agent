import { describe, expect, it } from "bun:test";
import { createMusicEntrypoint } from "../src/entrypoints/music";

type HandlerCtx = Parameters<
  ReturnType<typeof createMusicEntrypoint>["handler"]
>[0];

function createCtx(input: unknown): HandlerCtx {
  return {
    key: "music",
    input,
    signal: new AbortController().signal,
    headers: new Headers(),
    runId: "test-run",
  };
}

describe("music entrypoint", () => {
  const refineCalls: Array<{ prompt: string; seconds: number }> = [];
  const generateCalls: Array<{ prompt: string; seconds: number }> = [];

  const entrypoint = createMusicEntrypoint({
    refine: async (prompt, seconds) => {
      refineCalls.push({ prompt, seconds });
      return {
        refinedPrompt: `${prompt} refined`,
        model: "stub-llm",
      };
    },
    generate: async ({ prompt, seconds }) => {
      generateCalls.push({ prompt, seconds });
      return {
        trackUrl: `https://tracks.local/${prompt.replace(/\s+/g, "-")}.mp3`,
        provider: "stub-elevenlabs",
      };
    },
  });

  it("rejects when seconds are below minimum", async () => {
    await expect(
      entrypoint.handler(createCtx({ prompt: "Test", seconds: 4 }))
    ).rejects.toThrow("seconds must be at least 5.");
  });

  it("rejects when seconds exceed maximum", async () => {
    await expect(
      entrypoint.handler(createCtx({ prompt: "Test", seconds: 121 }))
    ).rejects.toThrow("seconds must be at most 120.");
  });

  it("rejects when prompt is blank", async () => {
    await expect(
      entrypoint.handler(createCtx({ prompt: "   ", seconds: 30 }))
    ).rejects.toThrow("Prompt cannot be empty.");
  });

  it("returns trackUrl when adapters succeed", async () => {
    refineCalls.length = 0;
    generateCalls.length = 0;

    const result = await entrypoint.handler(
      createCtx({ prompt: "lofi focus", seconds: 45 })
    );

    expect(result.output.trackUrl).toBe(
      "https://tracks.local/lofi-focus-refined.mp3"
    );
    expect(result.model).toBe("stub-llm");
    expect(refineCalls).toEqual([{ prompt: "lofi focus", seconds: 45 }]);
    expect(generateCalls).toEqual([
      { prompt: "lofi focus refined", seconds: 45 },
    ]);
  });
});
