import { describe, expect, it, mock } from "bun:test";
import { createSigner } from "x402-fetch";
import { createPaymentHeader } from "x402/client";
import type { Hex } from "x402-fetch";
import type { PaymentRequirements } from "x402/types";
import { app } from "../src/agent";
import { env } from "../src/config/env";
import { getChainConfig } from "../src/config/chain";
import { getMusicPrice } from "../src/payments/musicPricing";

describe("music endpoint paywall", () => {
  it("returns 402 with x402 requirements when unpaid", async () => {
    const res = await app.fetch(
      new Request("http://localhost/entrypoints/music/invoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          input: { prompt: "lofi beats", seconds: 45 },
        }),
      })
    );

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.x402Version).toBe(1);
    expect(Array.isArray(body.accepts)).toBe(true);
    expect(body.accepts.length).toBeGreaterThan(0);

    const requirement = body.accepts[0];
    expect(requirement.network).toBe(getChainConfig(env).network);
    expect(requirement.maxAmountRequired).toBe("1498500");
    expect(requirement.asset).toBe(
      "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
    );
    expect(requirement.payTo.toLowerCase()).toMatch(/^0x[0-9a-f]{40}$/);
  });

  it("confirms payment via facilitator and returns track", async () => {
    const chain = getChainConfig(env);
    const payTo =
      (env.PAY_TO as `0x${string}` | undefined) ??
      "0xb308ed39d67D0d4BAe5BC2FAEF60c66BBb6AE429";
    const { atomic: requiredAtomic } = getMusicPrice(45);

    const requirements: PaymentRequirements = {
      scheme: "exact",
      network: chain.network,
      maxAmountRequired: requiredAtomic,
      resource: "https://music-creation-agent.local/entrypoints/music/invoke",
      description: "Music generation entrypoint",
      mimeType: "application/json",
      outputSchema: undefined,
      payTo,
      maxTimeoutSeconds: 300,
      asset: chain.usdcAddress,
      extra: { name: "USDC", version: "2" },
    };

    const signer = await createSigner(
      chain.network,
      "0x7957791df726a7136ab5203afc5b273c0f971b31d0b1d07e6ea7f64311bf1c55" as Hex
    );

    const paymentHeader = await createPaymentHeader(signer, 1, requirements);

    const originalFetch = global.fetch;
    const verifyMock = mock(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
            ? input.toString()
            : input instanceof Request
            ? input.url
            : "";

        if (url.endsWith("/verify")) {
          const body = init?.body ? JSON.parse(init.body as string) : {};
          expect(body.paymentRequirements.maxAmountRequired).toBe(requiredAtomic);
          expect(body.paymentRequirements.payTo).toBe(
            payTo.toLowerCase()
          );
          expect(body.paymentRequirements.asset).toBe(
            chain.usdcAddress.toLowerCase()
          );
          expect(body.paymentPayload.payload.authorization.value).toBe(
            requiredAtomic
          );
          return new Response(
            JSON.stringify({
              verified: true,
              amountAtomic: requiredAtomic,
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }

        return originalFetch(input as any, init as any);
      }
    );

    global.fetch = verifyMock as unknown as typeof fetch;

    try {
      const res = await app.fetch(
        new Request("http://localhost/api/x402/confirm", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            input: { prompt: "lofi focus", seconds: 45 },
            paymentHeader,
          }),
        })
      );

      if (res.status !== 200) {
        const text = await res.text();
        console.error("confirm failed", res.status, text);
        throw new Error(`Unexpected status ${res.status}`);
      }

      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.trackUrl).toMatch(/^https?:\/\//);
      expect(typeof json.refinedPrompt).toBe("string");
      expect(json.refinedPrompt.length).toBeGreaterThan(0);
      const verifyHits = verifyMock.mock.calls.filter(([input]) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
            ? input.toString()
            : input instanceof Request
            ? input.url
            : "";
        return url.endsWith("/verify");
      }).length;
      expect(verifyHits).toBe(1);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("prints deterministic track url in dry-run", () => {
    const result = Bun.spawnSync([
      "bun",
      "run",
      "scripts/music-pay.ts",
      "--prompt",
      "t",
      "--seconds",
      "45",
      "--dry-run",
    ]);

    expect(result.exitCode).toBe(0);
    const stdout = new TextDecoder().decode(result.stdout).trim();
    const lastLine = stdout.split(/\r?\n/).pop() ?? "";
    expect(lastLine).toBe("OK: trackUrl=https://dry-run.tracks/t-45.mp3");
  });
});
