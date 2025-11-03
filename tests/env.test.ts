import { describe, expect, it } from "bun:test";
import { parseEnv } from "../src/config/env";

describe("parseEnv", () => {
  it("provides defaults for Base Sepolia", () => {
    const env = parseEnv({} as NodeJS.ProcessEnv);

    expect(env.FACILITATOR_URL).toBe("https://facilitator.daydreams.systems");
    expect(env.X402_CHAIN).toBe("base-sepolia");
    expect(env.X402_CHAIN_ID).toBe(84532);
    expect(env.X402_TOKEN_ADDRESS).toBe(
      "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
    );
    expect(env.X402_RPC_URL).toBe("https://sepolia.base.org");
  });

  it("derives Base mainnet config when provided", () => {
    const env = parseEnv({
      X402_CHAIN: "base",
      BASE_MAINNET_RPC_URL: "https://example.base.org",
    } as NodeJS.ProcessEnv);

    expect(env.X402_CHAIN).toBe("base");
    expect(env.X402_CHAIN_ID).toBe(8453);
    expect(env.X402_RPC_URL).toBe("https://example.base.org");
    expect(env.X402_TOKEN_ADDRESS).toBe(
      "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
    );
  });
});
