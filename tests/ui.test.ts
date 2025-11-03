import { describe, expect, it, mock } from "bun:test";

describe("ui app", () => {
  it("connects wallet, pays, and sets audio src", async () => {
    const fetchMock = mock(async (input: RequestInfo, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof Request
          ? input.url
          : "";

      if (url.endsWith("/ui/config.json")) {
        return new Response(
          JSON.stringify({
            network: "base-sepolia",
            chainId: 84532,
            chainIdHex: "0x14a74",
            chainLabel: "Base Sepolia",
            rpcUrl: "https://sepolia.base.org",
            explorerUrl: "https://sepolia.basescan.org",
            usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
            facilitatorUrl: "https://facilitator.test",
            payTo: "0x41733E18fA8FEbE0a0c350aA5B63f955F06BD363",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (
        url.endsWith("/entrypoints/music/invoke") &&
        init?.headers &&
        (init.headers as Record<string, string>)["x-payment"]
      ) {
        return new Response(
          JSON.stringify({
            output: { trackUrl: "https://tracks.local/song.mp3" },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.endsWith("/entrypoints/music/invoke")) {
        return new Response(
          JSON.stringify({
            x402Version: 1,
            accepts: [
              {
                scheme: "exact",
                network: "base-sepolia",
                maxAmountRequired: "3000",
                resource: "https://example.com/entrypoints/music/invoke",
                description: "Music",
                mimeType: "application/json",
                outputSchema: {},
                payTo: "0x41733E18fA8FEbE0a0c350aA5B63f955F06BD363",
                maxTimeoutSeconds: 300,
                asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
                extra: { name: "USDC", version: "2" },
              },
            ],
          }),
          { status: 402, headers: { "content-type": "application/json" } }
        );
      }

      return new Response("Not Found", { status: 404 });
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const walletListeners = new Set<(state: any) => void>();
    let configuredChainId = 0;

    const initialState = {
      isConnected: false,
      address: null,
      chainId: null,
      client: null,
      provider: null,
    };

    let state = { ...initialState };

    const notify = () => {
      for (const listener of walletListeners) {
        listener({ ...state });
      }
    };

    const walletBridge = {
      configure(config: any) {
        configuredChainId = config.chainId;
      },
      async connect() {
        state = {
          isConnected: true,
          address: "0x123400000000000000000000000000000000abcd",
          chainId: configuredChainId,
          client: {} as any,
          provider: {},
        };
        notify();
        return { ...state };
      },
      disconnect() {
        state = { ...initialState };
        notify();
      },
      getState() {
        return { ...state };
      },
      subscribe(listener: (state: any) => void) {
        walletListeners.add(listener);
        listener({ ...state });
        return () => walletListeners.delete(listener);
      },
    };

    (globalThis as any).__walletBridge = walletBridge;

    const createPaymentHeader = mock(async () => "mock-header");
    const selectPaymentRequirements = mock((reqs: any[]) => reqs[0]);

    (globalThis as any).__x402Helpers = {
      createPaymentHeader,
      selectPaymentRequirements,
    };

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

    const connectButton = {
      textContent: "Connect Wallet",
      addEventListener: (type: string, handler: (event: Event) => void) => {
        if (type === "click") events.set("connect:click", handler);
      },
    } as HTMLButtonElement;

    const walletStatus = {
      textContent: "Wallet not connected",
    } as HTMLSpanElement;

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
          case "connect-button":
            return connectButton;
          case "wallet-status":
            return walletStatus;
          case "status":
            return statusEl;
          case "player":
            return audioEl;
          default:
            return null;
        }
      },
    };

    await import("../src/ui/app");

    const connectHandler = events.get("connect:click");
    connectHandler?.({ preventDefault() {} } as unknown as Event);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(walletStatus.textContent).toContain("Connected");

    const submit = formHandlers.get("submit");
    submit?.({ preventDefault() {} } as unknown as Event);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(createPaymentHeader).toHaveBeenCalledTimes(1);
    expect(audioEl.src).toContain("https://tracks.local/song.mp3");

    delete (globalThis as any).__walletBridge;
    delete (globalThis as any).__x402Helpers;
    delete (globalThis as any).document;
    delete (globalThis as any).window;
  });
});
