import CoinbaseWalletSDK from "@coinbase/wallet-sdk";
import { base, baseSepolia } from "viem/chains";
import {
  createWalletClient,
  custom,
  type Address,
  type WalletClient,
} from "viem";
import type { UiChainConfig, UiNetwork } from "./config";

export type WalletProviderPreference = "metamask" | "coinbase" | "any";

export interface WalletState {
  isConnected: boolean;
  address: Address | null;
  chainId: number | null;
  client: WalletClient | null;
  provider: any | null;
}

type WalletListener = (state: WalletState) => void;

interface WalletBridge {
  configure(config: UiChainConfig): void;
  connect(prefer?: WalletProviderPreference): Promise<WalletState>;
  disconnect(): void;
  getState(): WalletState;
  subscribe(listener: WalletListener): () => void;
}

declare global {
  interface Window {
    __walletBridge?: WalletBridge;
  }
}

const noopBridge: WalletBridge = {
  configure() {
    throw new Error("Wallet bridge not available");
  },
  async connect() {
    throw new Error("Wallet bridge not available");
  },
  disconnect() {
    /* noop */
  },
  getState() {
    return {
      isConnected: false,
      address: null,
      chainId: null,
      client: null,
      provider: null,
    };
  },
  subscribe() {
    return () => undefined;
  },
};

const globalScope = globalThis as typeof globalThis & {
  __walletBridge?: WalletBridge;
};

function createRealBridge(): WalletBridge {
  let chainConfig: UiChainConfig | null = null;
  let state: WalletState = {
    isConnected: false,
    address: null,
    chainId: null,
    client: null,
    provider: null,
  };

  const listeners = new Set<WalletListener>();

  function emit() {
    for (const listener of listeners) {
      listener({ ...state });
    }
  }

  function updateState(next: Partial<WalletState>) {
    state = { ...state, ...next };
    emit();
  }

  function requireConfig() {
    if (!chainConfig) {
      throw new Error("Wallet bridge not configured");
    }
    return chainConfig;
  }

  function getInjectedProvider(prefer: WalletProviderPreference = "any"): any | undefined {
    if (typeof window === "undefined") return undefined;

    const eth: any = (window as any).ethereum;
    const cbExtension: any = (window as any).coinbaseWalletExtension;

    const providers: any[] = [];

    if (eth) {
      if (Array.isArray(eth.providers)) {
        providers.push(...eth.providers);
      } else {
        providers.push(eth);
      }
    }

    if (cbExtension && !providers.includes(cbExtension)) {
      providers.push(cbExtension);
    }

    if (providers.length === 0) return undefined;

    const find = (fn: (provider: any) => boolean) => providers.find(fn);
    const coinbase = find((p) => p?.isCoinbaseWallet === true);
    const metamask = find((p) => p?.isMetaMask === true && !p?.isBraveWallet);

    if (prefer === "coinbase") {
      return coinbase ?? metamask ?? providers[0];
    }

    if (prefer === "metamask") {
      return metamask ?? coinbase ?? providers[0];
    }

    return coinbase ?? metamask ?? providers[0];
  }

  function ensureRequestPolyfill(provider: any) {
    if (!provider) return provider;

    if (typeof provider.request === "function") {
      return provider;
    }

    const hasSend = typeof provider.send === "function";
    const hasSendAsync = typeof provider.sendAsync === "function";

    let requestImpl: (args: { method: string; params?: any[] }) => Promise<any>;

    if (hasSendAsync) {
      requestImpl = ({ method, params = [] }) =>
        new Promise((resolve, reject) => {
          provider.sendAsync(
            { method, params, id: Date.now(), jsonrpc: "2.0" },
            (err: any, res: any) => {
              if (err) return reject(err);
              resolve(res?.result);
            }
          );
        });
    } else if (hasSend) {
      requestImpl = ({ method, params = [] }) => {
        try {
          const result = provider.send(method, params);
          return result && typeof result.then === "function"
            ? result
            : Promise.resolve(result);
        } catch (firstErr) {
          try {
            const result = provider.send({
              method,
              params,
              id: Date.now(),
              jsonrpc: "2.0",
            });
            return result && typeof result.then === "function"
              ? result
              : Promise.resolve(result);
          } catch (secondErr) {
            return Promise.reject(
              new Error(`send failed with both signatures: ${firstErr}; ${secondErr}`)
            );
          }
        }
      };
    } else {
      console.warn(
        "[wallet] Provider missing request/send/sendAsync; cannot polyfill"
      );
      return provider;
    }

    return Object.create(provider, {
      request: {
        value: requestImpl,
        writable: false,
        enumerable: false,
        configurable: false,
      },
    });
  }

  async function ensureChain(provider: any, config: UiChainConfig) {
    try {
      const currentChain = await provider.request({ method: "eth_chainId" });
      if (typeof currentChain === "string" && currentChain.toLowerCase() === config.chainIdHex.toLowerCase()) {
        return;
      }

      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: config.chainIdHex }],
        });
      } catch (switchErr: any) {
        if (switchErr?.code === 4902) {
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: config.chainIdHex,
                chainName: config.chainLabel,
                nativeCurrency: {
                  name: "Ether",
                  symbol: "ETH",
                  decimals: 18,
                },
                rpcUrls: [config.rpcUrl],
                blockExplorerUrls: [config.explorerUrl],
              },
            ],
          });
        } else {
          throw switchErr;
        }
      }
    } catch (error) {
      console.warn("[wallet] ensureChain warning:", (error as Error).message);
    }
  }

  async function connectInjected(prefer: WalletProviderPreference, config: UiChainConfig) {
    const injected = getInjectedProvider(prefer);
    if (!injected) {
      throw new Error(
        "No wallet extension detected. Please install Coinbase Wallet or MetaMask."
      );
    }

    const provider = ensureRequestPolyfill(injected);
    if (typeof provider.request !== "function") {
      throw new Error(
        "Wallet extension is not EIP-1193 compatible. Please update your wallet."
      );
    }

    const accounts: string[] = await provider.request({
      method: "eth_requestAccounts",
    });
    if (!accounts || accounts.length === 0) {
      throw new Error("Wallet did not return any accounts. Please unlock your wallet.");
    }

    const address = accounts[0] as Address;

    await ensureChain(provider, config);

    const viemChain =
      config.network === "base" ? base : baseSepolia;

    const client = createWalletClient({
      account: address,
      chain: viemChain,
      transport: custom(provider),
    });

    return { address, client, chainId: config.chainId, provider };
  }

  async function connectCoinbaseSdk(config: UiChainConfig) {
    const sdk = new CoinbaseWalletSDK({ appName: "Music Creator" });
    const sdkProvider: any = sdk.makeWeb3Provider(config.rpcUrl, config.chainId);
    const provider = ensureRequestPolyfill(sdkProvider);

    if (typeof provider.request !== "function") {
      throw new Error("Coinbase SDK provider is not EIP-1193 compatible.");
    }

    const accounts: string[] = await provider.request({
      method: "eth_requestAccounts",
    });

    if (!accounts || accounts.length === 0) {
      throw new Error("Coinbase Wallet SDK did not return any accounts.");
    }

    const address = accounts[0] as Address;

    await ensureChain(provider, config);

    const viemChain =
      config.network === "base" ? base : baseSepolia;

    const client = createWalletClient({
      account: address,
      chain: viemChain,
      transport: custom(provider),
    });

    return { address, client, chainId: config.chainId, provider };
  }

  function attachProviderListeners(provider: any) {
    if (!provider?.on) return;

    const handleAccountsChanged = (accounts: string[]) => {
      if (!accounts || accounts.length === 0) {
        disconnect();
      } else {
        updateState({
          address: accounts[0] as Address,
        });
      }
    };

    const handleChainChanged = (chainIdHex: string) => {
      const parsed = parseInt(chainIdHex, 16);
      updateState({ chainId: Number.isFinite(parsed) ? parsed : null });
    };

    provider.on("accountsChanged", handleAccountsChanged);
    provider.on("chainChanged", handleChainChanged);

    return () => {
      provider.removeListener?.("accountsChanged", handleAccountsChanged);
      provider.removeListener?.("chainChanged", handleChainChanged);
    };
  }

  let cleanupProviderListeners: (() => void) | null = null;

  async function connect(prefer: WalletProviderPreference = "coinbase") {
    const config = requireConfig();

    try {
      let connection;
      try {
        connection = await connectInjected(prefer, config);
      } catch (err: any) {
        if (
          prefer === "coinbase" &&
          err?.message?.includes("No wallet extension detected")
        ) {
          connection = await connectCoinbaseSdk(config);
        } else {
          throw err;
        }
      }

      cleanupProviderListeners?.();
      cleanupProviderListeners = attachProviderListeners(connection.provider);

      updateState({
        isConnected: true,
        address: connection.address,
        chainId: connection.chainId,
        client: connection.client,
        provider: connection.provider,
      });

      return state;
    } catch (error: any) {
      updateState({
        isConnected: false,
        address: null,
        chainId: null,
        client: null,
        provider: null,
      });
      throw error;
    }
  }

  function disconnect() {
    cleanupProviderListeners?.();
    cleanupProviderListeners = null;
    updateState({
      isConnected: false,
      address: null,
      chainId: null,
      client: null,
      provider: null,
    });
  }

  return {
    configure(config: UiChainConfig) {
      chainConfig = config;
    },
    async connect(prefer?: WalletProviderPreference) {
      return connect(prefer);
    },
    disconnect,
    getState() {
      return { ...state };
    },
    subscribe(listener: WalletListener) {
      listeners.add(listener);
      listener({ ...state });
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const activeBridge = globalScope.__walletBridge ?? createRealBridge();
globalScope.__walletBridge = activeBridge;

export function configureWallet(config: UiChainConfig) {
  activeBridge.configure(config);
}

export function connectWallet(prefer?: WalletProviderPreference) {
  return activeBridge.connect(prefer);
}

export function disconnectWallet() {
  return activeBridge.disconnect();
}

export function getWalletState() {
  return activeBridge.getState();
}

export function subscribeWallet(listener: WalletListener) {
  return activeBridge.subscribe(listener);
}
