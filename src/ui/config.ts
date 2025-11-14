export type UiNetwork = "base" | "base-sepolia";

export interface UiChainConfig {
  network: UiNetwork;
  chainId: number;
  chainIdHex: string;
  chainLabel: string;
  rpcUrl: string;
  explorerUrl: string;
  usdcAddress: `0x${string}`;
  facilitatorUrl: string;
  payTo: `0x${string}`;
  usdRatePerSecond: number;
}

let cachedConfig: UiChainConfig | null = null;

export async function fetchUiChainConfig(): Promise<UiChainConfig> {
  if (cachedConfig) return cachedConfig;

  const res = await fetch("/ui/config.json", {
    headers: { "accept": "application/json" },
  });

  if (!res.ok) {
    throw new Error(`Failed to load UI config (${res.status})`);
  }

  const data = (await res.json()) as Partial<UiChainConfig>;

  if (
    !data ||
    typeof data.chainId !== "number" ||
    typeof data.chainIdHex !== "string" ||
    typeof data.chainLabel !== "string" ||
    typeof data.network !== "string" ||
    typeof data.rpcUrl !== "string" ||
    typeof data.explorerUrl !== "string" ||
    typeof data.usdcAddress !== "string" ||
    typeof data.facilitatorUrl !== "string" ||
    typeof data.payTo !== "string" ||
    typeof data.usdRatePerSecond !== "number"
  ) {
    throw new Error("Malformed UI config response");
  }

  cachedConfig = {
    network: data.network as UiNetwork,
    chainId: data.chainId,
    chainIdHex: data.chainIdHex,
    chainLabel: data.chainLabel,
    rpcUrl: data.rpcUrl,
    explorerUrl: data.explorerUrl,
    usdcAddress: data.usdcAddress as `0x${string}`,
    facilitatorUrl: data.facilitatorUrl,
    payTo: data.payTo as `0x${string}`,
    usdRatePerSecond: data.usdRatePerSecond,
  };

  return cachedConfig;
}

export function getCachedUiChainConfig(): UiChainConfig | null {
  return cachedConfig;
}
