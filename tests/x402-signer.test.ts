import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createWalletClient, custom } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { signX402Payment } from "../src/services/x402-signer";

const transport = custom({
  request: async () => {
    throw new Error("transport not implemented");
  },
});

const account = privateKeyToAccount(
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
);

const walletClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport,
});

describe("signX402Payment", () => {
  const realNow = Date.now;
  const fixedNow = 1_700_000_000_000;
  const challenge = {
    challengeId: "test",
    amountAtomic: "3000000",
    payTo: "0x41733E18fA8FEbE0a0c350aA5B63f955F06BD363" as const,
    expiresAt: "2025-10-31T16:00:00.000Z",
  };

  beforeEach(() => {
    Date.now = () => fixedNow;
  });

  afterEach(() => {
    Date.now = realNow;
  });

  it("produces a normalized ERC-3009 authorization payload", async () => {
    const result = await signX402Payment(walletClient, challenge, 84532);

    expect(result.signature.startsWith("0x")).toBe(true);
    expect(result.signature.length).toBe(132);

    const { authorization } = result;
    expect(authorization.from).toBe(account.address.toLowerCase());
    expect(authorization.to).toBe(challenge.payTo.toLowerCase());
    expect(authorization.value).toBe("3000000");
    expect(authorization.validAfter).toBe(Math.trunc(fixedNow / 1000) - 60);
    const expectedValidBefore = Math.trunc(
      Date.parse(challenge.expiresAt!) / 1000
    );
    expect(authorization.validBefore).toBe(expectedValidBefore);
    expect(authorization.nonce.startsWith("0x")).toBe(true);
    expect(authorization.nonce.length).toBe(66);
  });
});
