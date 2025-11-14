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
const refinedContainer = document.getElementById("refined-container") as HTMLElement | null;
const refinedPromptEl = document.getElementById("refined-prompt") as HTMLElement | null;
const pricePreview = document.getElementById("price-preview") as HTMLElement | null;
const stateIndicator = document.getElementById("state-indicator") as HTMLElement | null;
const trackUrlRow = document.getElementById("track-url-row") as HTMLElement | null;
const trackUrlValue = document.getElementById("track-url-value") as HTMLElement | null;
const copyTrackButton = document.getElementById("copy-track") as HTMLButtonElement | null;

if (
  !form ||
  !promptInput ||
  !secondsInput ||
  !payButton ||
  !statusEl ||
  !audioEl ||
  !connectButton ||
  !walletBadge ||
  !downloadLink ||
  !refinedContainer ||
  !refinedPromptEl ||
  !pricePreview ||
  !stateIndicator ||
  !trackUrlRow ||
  !trackUrlValue ||
  !copyTrackButton
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
const safeRefinedContainer = refinedContainer!;
const safeRefinedPromptEl = refinedPromptEl!;
const safePricePreview = pricePreview!;
const safeStateIndicator = stateIndicator!;
const safeTrackUrlRow = trackUrlRow!;
const safeTrackUrlValue = trackUrlValue!;
const safeCopyTrackButton = copyTrackButton!;

const DEFAULT_USD_RATE_PER_SECOND = 0.0333;
const MIN_SECONDS = 5;
const MAX_SECONDS = 120;

type UiState = "ready" | "paying" | "generating" | "done" | "error";

let uiReady = false;
let currentChainId: number | null = null;
let currentNetwork: UiNetwork | null = null;
let usdRatePerSecond = DEFAULT_USD_RATE_PER_SECOND;

const uiStateLabels: Record<UiState, string> = {
  ready: "Ready",
  paying: "Awaiting payment",
  generating: "Generating",
  done: "Ready to play",
  error: "Needs attention",
};

function setUiState(state: UiState) {
  safeStateIndicator.dataset.state = state;
  safeStateIndicator.textContent = uiStateLabels[state] ?? state;
}

function clampSeconds(value: number) {
  return Math.max(MIN_SECONDS, Math.min(MAX_SECONDS, value));
}

function sanitizeSeconds(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return NaN;
  const floored = Math.floor(parsed);
  if (!Number.isFinite(floored)) return NaN;
  return clampSeconds(floored);
}

function updatePricePreview(explicitSeconds?: number) {
  const seconds =
    typeof explicitSeconds === "number" && Number.isFinite(explicitSeconds)
      ? explicitSeconds
      : sanitizeSeconds(safeSecondsInput.value);

  if (!Number.isFinite(seconds)) {
    safePricePreview.textContent = "$0.00";
    return;
  }

  const price = seconds * usdRatePerSecond;
  safePricePreview.textContent = `$${price.toFixed(2)}`;
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
  safeRefinedContainer.style.display = "none";
  safeRefinedPromptEl.textContent = "";
  safeTrackUrlValue.textContent = "";
  safeTrackUrlRow.style.display = "none";
  safeCopyTrackButton.disabled = true;
  safeCopyTrackButton.textContent = "Copy link";
}

function setTrack(url: string, provider?: string | null) {
  safeAudioEl.src = url;
  const isPlaceholder =
    provider === "elevenlabs-placeholder" ||
    /placeholder/i.test(url);
  if (isPlaceholder) {
    safeDownloadLink.style.display = "none";
    safeDownloadLink.removeAttribute("href");
    safeDownloadLink.removeAttribute("download");
  } else {
    safeDownloadLink.href = url;
    safeDownloadLink.download = `music-track-${Date.now()}.mp3`;
    safeDownloadLink.style.display = "inline";
  }
  safeTrackUrlValue.textContent = url;
  safeTrackUrlRow.style.display = "block";
  safeCopyTrackButton.disabled = false;
  safeCopyTrackButton.textContent = "Copy link";
  return isPlaceholder;
}

function setRefinedPrompt(refined?: unknown) {
  if (typeof refined === "string" && refined.trim().length > 0) {
    safeRefinedPromptEl.textContent = refined.trim();
    safeRefinedContainer.style.display = "block";
  } else {
    safeRefinedPromptEl.textContent = "";
    safeRefinedContainer.style.display = "none";
  }
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
    seconds >= MIN_SECONDS &&
    seconds <= MAX_SECONDS;
  const walletConnected = isWalletReady(currentChainId);
  safePayButton.disabled = !(uiReady && validInput && walletConnected);
  updatePricePreview(seconds);
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

  setUiState("paying");
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
      setUiState("generating");
      const trackUrl: unknown = data?.output?.trackUrl;
      if (typeof trackUrl !== "string" || !trackUrl) {
        throw new Error("Missing trackUrl in response");
      }
      const placeholder = setTrack(trackUrl, data?.provider);
      setRefinedPrompt(data?.output?.refinedPrompt ?? data?.refinedPrompt);
      setStatus(
        placeholder
          ? "Fallback audio loaded (no download)."
          : "Ready! Press play."
      );
      setUiState("done");
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
    setUiState("generating");

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

    const provider =
      typeof confirmData?.provider === "string"
        ? confirmData.provider
        : typeof confirmData?.model === "string"
          ? confirmData.model
          : undefined;
    const placeholder = setTrack(trackUrl, provider);
    setRefinedPrompt(
      confirmData?.refinedPrompt ?? confirmData?.output?.refinedPrompt
    );
    setStatus(
      placeholder
        ? "Fallback audio loaded (no download)."
        : "Ready! Press play."
    );
    setUiState("done");
  } catch (error) {
    console.error("music ui error:", error);
    resetTrack();
    setStatus(error instanceof Error ? error.message : "Payment failed.");
    setUiState("error");
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
    usdRatePerSecond =
      typeof config.usdRatePerSecond === "number"
        ? config.usdRatePerSecond
        : DEFAULT_USD_RATE_PER_SECOND;
    uiReady = true;
    setStatus("Wallet not connected.");
    setUiState("ready");
    validate();
  } catch (error) {
    console.error("Failed to initialise UI config:", error);
    setStatus("Failed to load configuration. Refresh and try again.");
    setUiState("error");
  }
}

safePromptInput.addEventListener("input", validate);
safeSecondsInput.addEventListener("input", () => {
  updatePricePreview();
  validate();
});
safeSecondsInput.addEventListener("blur", () => {
  const sanitized = sanitizeSeconds(safeSecondsInput.value);
  if (Number.isFinite(sanitized)) {
    safeSecondsInput.value = `${sanitized}`;
  }
  updatePricePreview(sanitized);
  validate();
});

subscribeWallet(() => {
  updateWalletBadge();
  validate();
});

safeCopyTrackButton.addEventListener("click", async () => {
  const url = safeTrackUrlValue.textContent?.trim();
  if (!url) return;
  if (!navigator?.clipboard?.writeText) {
    setStatus("Clipboard is unavailable in this browser.");
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    safeCopyTrackButton.textContent = "Copied!";
    setTimeout(() => {
      safeCopyTrackButton.textContent = "Copy link";
    }, 1500);
  } catch (error) {
    console.error("Failed to copy track URL:", error);
    setStatus("Failed to copy link. Copy it manually above.");
  }
});

safeConnectButton.addEventListener("click", async () => {
  const isConnected = getWalletState().isConnected;
  if (isConnected) {
    disconnectWallet();
    setStatus("Wallet disconnected.");
    setUiState("ready");
    validate();
    return;
  }

  setStatus("Connecting wallet…");
  try {
    await connectWallet("coinbase");
    setStatus("Wallet connected. Ready to pay.");
    setUiState("ready");
  } catch (error: any) {
    console.error("Wallet connect failed:", error);
    setStatus(error?.message || "Failed to connect wallet.");
    setUiState("error");
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
