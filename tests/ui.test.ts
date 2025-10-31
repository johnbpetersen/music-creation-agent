import { describe, expect, it, mock } from "bun:test";

describe("ui app", () => {
  it("pays via x402-web and sets audio src", async () => {
    const mockFetch = mock(async () => {
      return new Response(
        JSON.stringify({
          output: { trackUrl: "https://tracks.local/song.mp3" },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });

    const createX402Web = mock(() => ({ fetch: mockFetch }));

    const events = new Map<string, (event: Event) => void>();

    const promptInput = {
      value: "lofi vibes",
      addEventListener: (type: string, handler: () => void) => {
        events.set(`prompt:${type}`, handler as any);
      },
    } as HTMLInputElement;

    const secondsInput = {
      value: "45",
      addEventListener: (type: string, handler: () => void) => {
        events.set(`seconds:${type}`, handler as any);
      },
    } as HTMLInputElement;

    const statusEl = {
      textContent: "",
    } as HTMLParagraphElement;

    const audioEl = {
      src: "",
    } as HTMLAudioElement;

    const payButton = {
      disabled: true,
    } as HTMLButtonElement;

    const formHandlers = new Map<string, (event: Event) => void>();

    const formEl = {
      addEventListener: (type: string, handler: (event: Event) => void) => {
        formHandlers.set(type, handler);
      },
    } as HTMLFormElement;

    (globalThis as any).window = globalThis;
    (globalThis as any).document = {
      getElementById(id: string) {
        switch (id) {
          case "music-form":
            return formEl;
          case "prompt":
            return promptInput;
          case "seconds":
            return secondsInput;
          case "pay-button":
            return payButton;
          case "status":
            return statusEl;
          case "player":
            return audioEl;
          default:
            return null;
        }
      },
    };

    (globalThis as any).__createX402Web = createX402Web;

    await import("../src/ui/app");

    const submit = formHandlers.get("submit");
    submit?.({ preventDefault() {} } as unknown as Event);

    await Promise.resolve();
    await Promise.resolve();

    expect(createX402Web).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe("/entrypoints/music/invoke");

    const audio = document.getElementById("player") as HTMLAudioElement;
    expect(audio.src).toContain("https://tracks.local/song.mp3");

    delete (globalThis as any).__createX402Web;
    delete (globalThis as any).document;
    delete (globalThis as any).window;
  });
});
