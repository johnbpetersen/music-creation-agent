import { randomBytes } from "crypto";
import type { Address, Hex, WalletClient } from "viem";
import { ChainMetadata, type X402Network } from "../config/chain";

export const USDC_CONTRACTS = {
  8453: ChainMetadata.base.usdcAddress,
  84532: ChainMetadata["base-sepolia"].usdcAddress,
} as const;

export interface PaymentChallenge {
  challengeId: string;
  payTo?: Address;
  pay_to?: Address;
  amountAtomic?: string | number;
  amount?: string | number;
  amount_atomic?: number;
  chain?: string;
  chainId?: number;
  asset?: string;
  tokenAddress?: string;
  expiresAt?: string;
  expires_at?: string;
  expiry?: string;
  expiresAtSec?: number;
}

export interface X402Authorization {
  signature: `0x${string}`;
  authorization: {
    from: `0x${string}`;
    to: `0x${string}`;
    value: string;
    validAfter: number;
    validBefore: number;
    nonce: `0x${string}`;
  };
}

function getRandomValues(size: number): Uint8Array {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.getRandomValues === "function"
  ) {
    return globalThis.crypto.getRandomValues(new Uint8Array(size));
  }

  return Uint8Array.from(randomBytes(size));
}

function generateNonce(): Hex {
  const bytes = getRandomValues(32);
  return `0x${Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}` as Hex;
}

function getUSDCAddress(chainId: number): Address {
  const address = USDC_CONTRACTS[chainId as keyof typeof USDC_CONTRACTS];
  if (!address) {
    throw new Error(`USDC contract not configured for chain ID ${chainId}`);
  }
  return address;
}

function getNetworkName(chainId: number): X402Network {
  switch (chainId) {
    case 8453:
      return "base";
    case 84532:
      return "base-sepolia";
    default:
      throw new Error(`Unsupported chain ID: ${chainId}`);
  }
}

export async function signX402Payment(
  client: WalletClient,
  challenge: PaymentChallenge,
  chainId: number
): Promise<X402Authorization> {
  if (!client.account) {
    throw new Error("Wallet not connected");
  }

  const userAddress = client.account.address;
  const usdcAddress = getUSDCAddress(chainId);
  const network = getNetworkName(chainId);

  const iso =
    challenge.expiresAt ??
    (challenge as any).expires_at ??
    (challenge as any).expiry ??
    null;

  if (!iso) {
    throw new Error("Invalid expiresAt: missing on challenge");
  }

  const expiresAtMs = Date.parse(iso);
  if (!Number.isFinite(expiresAtMs)) {
    throw new Error(`Invalid expiresAt: "${iso}"`);
  }

  const amountAtomic =
    challenge.amountAtomic ??
    challenge.amount ??
    (challenge as any).amount_atomic ??
    "";
  const amountAtomicString = String(amountAtomic);
  if (!/^\d+$/.test(amountAtomicString)) {
    throw new Error(`Invalid amountAtomic string: "${amountAtomicString}"`);
  }

  const payTo = challenge.payTo ?? (challenge as any).pay_to;
  if (!payTo) {
    throw new Error("Invalid payTo: missing on challenge");
  }

  const value = BigInt(amountAtomicString);
  const normalizedValue = value.toString();

  const validBefore = challenge.expiresAtSec
    ? BigInt(challenge.expiresAtSec)
    : BigInt(Math.trunc(expiresAtMs / 1000));

  const nowSec = Math.trunc(Date.now() / 1000);
  const validAfter = BigInt(nowSec - 60);

  const chainIdNumber = Number(chainId);
  if (!Number.isInteger(chainIdNumber)) {
    throw new Error(`Invalid chainId: ${chainId}. Must be an integer.`);
  }

  const nonce = generateNonce().toLowerCase() as Hex;

  const authorization = {
    from: userAddress,
    to: payTo as Address,
    value,
    validAfter,
    validBefore,
    nonce,
  };

  const domain = {
    name: "USD Coin",
    version: "2",
    chainId: chainIdNumber,
    verifyingContract: usdcAddress,
  } as const;

  const types = {
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  } as const;

  const amountUSD = (Number(normalizedValue) / 1_000_000).toFixed(6);

  console.log("[x402] signing:", {
    value: normalizedValue,
    amountUSD: `$${amountUSD}`,
    to: payTo,
    from: userAddress,
    validAfter: Number(validAfter),
    validBefore: Number(validBefore),
    nonce: `${nonce.slice(0, 10)}...`,
    chainId: chainIdNumber,
  });

  try {
    const signature = await client.signTypedData({
      account: client.account,
      domain,
      types,
      primaryType: "TransferWithAuthorization",
      message: authorization,
    });

    console.log("[x402] signature created:", `${signature.slice(0, 10)}...`);

    return {
      signature: signature.toLowerCase() as `0x${string}`,
      authorization: {
        from: authorization.from.toLowerCase() as `0x${string}`,
        to: authorization.to.toLowerCase() as `0x${string}`,
        value: normalizedValue,
        validAfter: Number(authorization.validAfter),
        validBefore: Number(authorization.validBefore),
        nonce: authorization.nonce.toLowerCase() as `0x${string}`,
      },
    };
  } catch (error: any) {
    console.error("[x402-signer] Signing error:", error);

    if (error?.message?.includes("User rejected")) {
      throw new Error(
        "Payment signature rejected. Please approve the transaction in your wallet."
      );
    }

    if (error?.message?.includes("Chain mismatch")) {
      throw new Error(
        `Please switch to ${network === "base" ? "Base" : "Base Sepolia"} network in your wallet.`
      );
    }

    throw new Error(`Failed to sign payment: ${error?.message || "Unknown error"}`);
  }
}

export function validateChain(
  chainId: number,
  expectedNetwork: X402Network
): boolean {
  const expected = expectedNetwork === "base" ? 8453 : 84532;
  return chainId === expected;
}

export function getExpectedChainId(network: X402Network): number {
  return network === "base" ? 8453 : 84532;
}

export function formatUSDCAmount(atomicAmount: number): string {
  return (atomicAmount / 1_000_000).toFixed(2);
}
