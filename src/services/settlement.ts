import { http, createWalletClient, createPublicClient } from "viem";
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
