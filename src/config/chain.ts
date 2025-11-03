import type { AppEnv } from "./env";

export type X402Network = "base" | "base-sepolia";

export interface ChainConfig {
  network: X402Network;
  chainId: number;
  chainLabel: string;
  rpcUrl: string;
  explorerUrl: string;
  usdcAddress: `0x${string}`;
}

const CHAIN_METADATA: Record<
  X402Network,
  Omit<ChainConfig, "network">
> = {
  base: {
    chainId: 8453,
    chainLabel: "Base",
    rpcUrl: "https://mainnet.base.org",
    explorerUrl: "https://basescan.org",
    usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  },
  "base-sepolia": {
    chainId: 84532,
    chainLabel: "Base Sepolia",
    rpcUrl: "https://sepolia.base.org",
    explorerUrl: "https://sepolia.basescan.org",
    usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  },
};

export function getChainConfig(env: AppEnv): ChainConfig {
  const metadata = CHAIN_METADATA[env.X402_CHAIN];

  return {
    network: env.X402_CHAIN,
    chainId: env.X402_CHAIN_ID ?? metadata.chainId,
    chainLabel: metadata.chainLabel,
    rpcUrl:
      env.X402_CHAIN === "base"
        ? env.BASE_MAINNET_RPC_URL ?? metadata.rpcUrl
        : env.BASE_SEPOLIA_RPC_URL ?? metadata.rpcUrl,
    explorerUrl: metadata.explorerUrl,
    usdcAddress: (env.X402_TOKEN_ADDRESS ?? metadata.usdcAddress) as `0x${string}`,
  };
}

export const ChainMetadata = CHAIN_METADATA;
