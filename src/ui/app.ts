import type { PaymentRequirements } from "x402/types";
import { PaymentRequirementsSchema } from "x402/types";
import {
  createPaymentHeader as createPaymentHeaderInternal,
  selectPaymentRequirements as selectPaymentRequirementsInternal,
} from "x402/client";
import { fetchUiChainConfig } from "./config";
import {
  configureWallet,
  connectWallet,
  disconnectWallet,
  getWalletState,
  subscribeWallet,
} from "./wallet";
import type { UiNetwork } from "./config";

type GlobalScope = typeof globalThis & {
  __musicUi?: {
    validate: () => void;
  };
  __walletBridge?: unknown;
  __x402Helpers?: {
    createPaymentHeader?: typeof createPaymentHeaderInternal;
    selectPaymentRequirements?: typeof selectPaymentRequirementsInternal;
  };
};

const globalScope = globalThis as GlobalScope;

const createPaymentHeader =
  globalScope.__x402Helpers?.createPaymentHeader ?? createPaymentHeaderInternal;
const selectPaymentRequirements =
  globalScope.__x402Helpers?.selectPaymentRequirements ??
  selectPaymentRequirementsInternal;

const form = document.getElementById("music-form") as HTMLFormElement | null;
const promptInput = document.getElementById("prompt") as HTMLInputElement | null;
const secondsInput = document.getElementById("seconds") as HTMLInputElement | null;
const payButton = document.getElementById("pay-button") as HTMLButtonElement | null;
const connectButton = document.getElementById("connect-button") as HTMLButtonElement | null;
const statusEl = document.getElementById("status") as HTMLParagraphElement | null;
const walletBadge = document.getElementById("wallet-status") as HTMLSpanElement | null;
const audioEl = document.getElementById("player") as HTMLAudioElement | null;
const downloadLink = document.getElementById("download-link") as HTMLAnchorElement | null;

if (
  !form ||
  !promptInput ||
  !secondsInput ||
  !payButton ||
  !statusEl ||
  !audioEl ||
  !connectButton ||
  !walletBadge ||
  !downloadLink
) {
  throw new Error("UI elements missing");
}

const safeStatusEl = statusEl!;
const safePayButton = payButton!;
const safeAudioEl = audioEl!;
const safePromptInput = promptInput!;
const safeSecondsInput = secondsInput!;
const safeConnectButton = connectButton!;
const safeWalletBadge = walletBadge!;
const safeDownloadLink = downloadLink!;

let uiReady = false;
let currentChainId: number | null = null;
let currentNetwork: UiNetwork | null = null;

function sanitizeSeconds(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return NaN;
  return Math.floor(parsed);
}

function setStatus(message: string) {
  safeStatusEl.textContent = message;
}

function resetTrack() {
  safeAudioEl.removeAttribute("src");
  safeAudioEl.load();
  safeDownloadLink.style.display = "none";
  safeDownloadLink.removeAttribute("href");
  safeDownloadLink.removeAttribute("download");
}

function setTrack(url: string) {
  safeAudioEl.src = url;
  safeDownloadLink.href = url;
  safeDownloadLink.download = `music-track-${Date.now()}.mp3`;
  safeDownloadLink.style.display = "inline";
}

function updateWalletBadge() {
  const state = getWalletState();
  if (state.isConnected && state.address) {
    const short = `${state.address.slice(0, 6)}…${state.address.slice(-4)}`;
    safeWalletBadge.textContent = `Connected: ${short}`;
    safeConnectButton.textContent = "Disconnect Wallet";
  } else {
    safeWalletBadge.textContent = "Wallet not connected";
    safeConnectButton.textContent = "Connect Wallet";
  }
}

function isWalletReady(chainId: number | null) {
  const state = getWalletState();
  if (!state.isConnected || !state.client || !chainId) return false;
  return state.chainId === chainId;
}

function validate() {
  const prompt = safePromptInput.value.trim();
  const seconds = sanitizeSeconds(safeSecondsInput.value);
  const validInput =
    prompt.length > 0 &&
    Number.isInteger(seconds) &&
    seconds >= 5 &&
    seconds <= 120;
  const walletConnected = isWalletReady(currentChainId);
  safePayButton.disabled = !(uiReady && validInput && walletConnected);
}

async function runPayment(prompt: string, seconds: number) {
  const wallet = getWalletState();
  if (!wallet.isConnected || !wallet.client) {
    setStatus("Connect your wallet before paying.");
    return;
  }

  if (wallet.chainId !== currentChainId) {
    setStatus("Wallet is on the wrong network. Switch networks and try again.");
    return;
  }

  setStatus("Requesting payment requirements…");
  safePayButton.disabled = true;
  resetTrack();

  try {
    const initialResponse = await fetch("/entrypoints/music/invoke", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: { prompt, seconds } }),
    });

    if (initialResponse.status !== 402) {
      if (!initialResponse.ok) {
        const text = await initialResponse.text();
        throw new Error(text || `Unexpected status ${initialResponse.status}`);
      }

      const data = await initialResponse.json();
      const trackUrl: unknown = data?.output?.trackUrl;
      if (typeof trackUrl !== "string" || !trackUrl) {
        throw new Error("Missing trackUrl in response");
      }
      setTrack(trackUrl);
      setStatus("Ready! Press play.");
      return;
    }

    const body = await initialResponse.json();
    const accepts: unknown[] = Array.isArray(body?.accepts) ? body.accepts : [];
    const x402Version = body?.x402Version;

    if (!accepts.length || typeof x402Version !== "number") {
      throw new Error("Malformed x402 requirements");
    }

    const requirements: PaymentRequirements[] = accepts.map((entry) =>
      PaymentRequirementsSchema.parse(entry)
    );

    const chainState = currentChainId;
    if (!chainState) {
      throw new Error("Chain configuration missing");
    }

    const network = requirements[0]?.network;

    const selected = selectPaymentRequirements(
      requirements,
      currentNetwork ?? network,
      "exact"
    );

    setStatus("Signing authorization…");

    const paymentHeader = await createPaymentHeader(
      wallet.client,
      x402Version,
      selected
    );

    setStatus("Submitting payment…");

    const confirmResponse = await fetch("/api/x402/confirm", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        input: { prompt, seconds },
        paymentHeader,
        paymentRequirements: selected,
      }),
    });

    if (!confirmResponse.ok) {
      const text = await confirmResponse.text();
      throw new Error(text || `Payment failed (${confirmResponse.status})`);
    }

    const confirmData = await confirmResponse.json();

    if (confirmData?.ok === false) {
      throw new Error(confirmData?.message ?? "Payment verification failed.");
    }

    const trackUrl: unknown = confirmData?.trackUrl ?? confirmData?.output?.trackUrl;
   if (typeof trackUrl !== "string" || !trackUrl) {
      throw new Error("Payment succeeded but track URL missing.");
    }

    setTrack(trackUrl);
    setStatus("Ready! Press play.");
  } catch (error) {
    console.error("music ui error:", error);
    resetTrack();
    setStatus(error instanceof Error ? error.message : "Payment failed.");
  } finally {
    validate();
  }
}

async function init() {
  try {
    const config = await fetchUiChainConfig();
    configureWallet(config);
    currentChainId = config.chainId;
    currentNetwork = config.network;
    uiReady = true;
    setStatus("Wallet not connected.");
    validate();
  } catch (error) {
    console.error("Failed to initialise UI config:", error);
    setStatus("Failed to load configuration. Refresh and try again.");
  }
}

safePromptInput.addEventListener("input", validate);
safeSecondsInput.addEventListener("input", validate);

subscribeWallet(() => {
  updateWalletBadge();
  validate();
});

safeConnectButton.addEventListener("click", async () => {
  const isConnected = getWalletState().isConnected;
  if (isConnected) {
    disconnectWallet();
    setStatus("Wallet disconnected.");
    validate();
    return;
  }

  setStatus("Connecting wallet…");
  try {
    await connectWallet("coinbase");
    setStatus("Wallet connected. Ready to pay.");
  } catch (error: any) {
    console.error("Wallet connect failed:", error);
    setStatus(error?.message || "Failed to connect wallet.");
  } finally {
    validate();
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const prompt = safePromptInput.value.trim();
  const seconds = sanitizeSeconds(safeSecondsInput.value);
  if (prompt.length === 0 || !Number.isInteger(seconds)) {
    return;
  }
  void runPayment(prompt, seconds);
});

updateWalletBadge();
validate();
void init();

globalScope.__musicUi = { validate };
