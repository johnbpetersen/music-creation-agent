import {
  http,
  createWalletClient,
  createPublicClient,
  parseSignature,
  recoverTypedDataAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";

const TRANSFER_WITH_AUTH_ABI = [
  {
    name: "transferWithAuthorization",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

const TRANSFER_WITH_AUTH_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

function splitSignature(signature: `0x${string}`) {
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) {
    throw new Error(
      `Invalid signature format: expected 65-byte hex string, received ${signature.length}`
    );
  }

  const r = `0x${signature.slice(2, 66)}` as `0x${string}`;
  const s = `0x${signature.slice(66, 130)}` as `0x${string}`;
  const vHex = signature.slice(130, 132);
  const v = Number.parseInt(vHex, 16);

  return { r, s, v };
}

function getChain(chainId: number) {
  switch (chainId) {
    case 8453:
      return base;
    case 84532:
      return baseSepolia;
    default:
      return {
        id: chainId,
        name: `chain-${chainId}`,
        nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
        rpcUrls: {
          default: { http: [] },
          public: { http: [] },
        },
      } as const;
  }
}

export async function settleAuthorization(params: {
  authorization: {
    from: string;
    to: string;
    value: string;
    validAfter: string;
    validBefore: string;
    nonce: string;
    signature: `0x${string}`;
  };
  usdcContract: `0x${string}`;
  chainId: number;
  rpcUrl: string;
  privateKey: `0x${string}`;
}): Promise<string> {
  const { authorization, usdcContract, chainId, rpcUrl, privateKey } = params;

  const account = privateKeyToAccount(privateKey);
  const chain = getChain(chainId);

  const transport = http(rpcUrl);

  const walletClient = createWalletClient({
    account,
    chain,
    transport,
  });

  const publicClient = createPublicClient({
    chain,
    transport,
  });

  const { r, s, v } = splitSignature(authorization.signature);

  const hash = await walletClient.writeContract({
    address: usdcContract,
    abi: TRANSFER_WITH_AUTH_ABI,
    functionName: "transferWithAuthorization",
    args: [
      authorization.from as `0x${string}`,
      authorization.to as `0x${string}`,
      BigInt(authorization.value),
      BigInt(authorization.validAfter),
      BigInt(authorization.validBefore),
      authorization.nonce as `0x${string}`,
      v,
      r,
      s,
    ],
  });

  await publicClient.waitForTransactionReceipt({ hash });

  return hash;
}

type AuthorizationLike = {
  from: string;
  to: string;
  value: string | number | bigint;
  validAfter: string | number | bigint;
  validBefore: string | number | bigint;
  nonce: string;
};

export interface SignatureVerificationResult {
  ok: boolean;
  recovered?: `0x${string}`;
  error?: string;
}

export async function verifyAuthorizationSignature(params: {
  authorization: AuthorizationLike;
  signature: string;
  chainId: number;
  usdcContract: `0x${string}`;
  tokenName: string;
  tokenVersion: string;
}): Promise<SignatureVerificationResult> {
  const {
    authorization,
    signature,
    chainId,
    usdcContract,
    tokenName,
    tokenVersion,
  } = params;

  try {
    const structuredSignature = parseSignature(signature as `0x${string}`);

    const domain = {
      name: tokenName,
      version: tokenVersion,
      chainId,
      verifyingContract: usdcContract,
    } as const;

    const message = {
      from: authorization.from as `0x${string}`,
      to: authorization.to as `0x${string}`,
      value: BigInt(authorization.value),
      validAfter: BigInt(authorization.validAfter),
      validBefore: BigInt(authorization.validBefore),
      nonce: authorization.nonce as `0x${string}`,
    } as const;

    const recovered = await recoverTypedDataAddress({
      domain,
      types: TRANSFER_WITH_AUTH_TYPES,
      primaryType: "TransferWithAuthorization",
      message,
      signature: structuredSignature,
    });

    const recoveredMatches =
      recovered.toLowerCase() === (authorization.from as string).toLowerCase();

    if (!recoveredMatches) {
      console.warn("[settlement] recovered address mismatch", {
        expectedFrom: authorization.from,
        recovered,
      });
    }

    return {
      ok: recoveredMatches,
      recovered,
    };
  } catch (error) {
    console.error("[settlement] signature verification failed", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
