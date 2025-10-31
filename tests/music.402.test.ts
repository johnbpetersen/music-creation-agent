import { describe, expect, it } from "bun:test";
import { app } from "../src/agent";

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
    expect(requirement.network).toBe("base-sepolia");
    expect(requirement.maxAmountRequired).toBe("2250000");
    expect(requirement.asset).toBe(
      "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
    );
    expect(requirement.payTo.toLowerCase()).toMatch(/^0x[0-9a-f]{40}$/);
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
