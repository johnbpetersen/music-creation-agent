export {};

type X402WebClient = {
  fetch: typeof fetch;
};

type CreateX402Web = () => X402WebClient;

type GlobalScope = typeof globalThis & {
  __createX402Web?: CreateX402Web;
  x402Web?: {
    createX402Web?: CreateX402Web;
  };
  __musicUi?: {
    validate: () => void;
  };
};

const globalScope = globalThis as GlobalScope;

const getCreateX402Web = (): CreateX402Web => {
  if (globalScope.__createX402Web) {
    return globalScope.__createX402Web;
  }
  if (globalScope.x402Web?.createX402Web) {
    return globalScope.x402Web.createX402Web;
  }
  throw new Error("x402-web client unavailable");
};

const form = document.getElementById("music-form") as HTMLFormElement | null;
const promptInput = document.getElementById("prompt") as HTMLInputElement | null;
const secondsInput = document.getElementById("seconds") as HTMLInputElement | null;
const payButton = document.getElementById("pay-button") as HTMLButtonElement | null;
const statusEl = document.getElementById("status") as HTMLParagraphElement | null;
const audioEl = document.getElementById("player") as HTMLAudioElement | null;

if (!form || !promptInput || !secondsInput || !payButton || !statusEl || !audioEl) {
  throw new Error("UI elements missing");
}

const safeStatusEl = statusEl!;
const safePayButton = payButton!;
const safeAudioEl = audioEl!;
const safePromptInput = promptInput!;
const safeSecondsInput = secondsInput!;

const x402 = getCreateX402Web()();

function sanitizeSeconds(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return NaN;
  return Math.floor(parsed);
}

async function runPayment(prompt: string, seconds: number) {
  safeStatusEl.textContent = "Paying…";
  safePayButton.disabled = true;
  try {
    const response = await x402.fetch("/entrypoints/music/invoke", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        input: { prompt, seconds },
      }),
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Request failed: ${message}`);
    }
    const data = await response.json();
    const trackUrl: unknown = data?.output?.trackUrl;
    if (typeof trackUrl !== "string" || !trackUrl) {
      throw new Error("Missing trackUrl in response");
    }
    safeAudioEl.src = trackUrl;
    safeStatusEl.textContent = "Ready! Press play.";
  } catch (error) {
    console.error("music ui error:", error);
    safeStatusEl.textContent =
      error instanceof Error ? error.message : "Payment failed.";
  } finally {
    safePayButton.disabled = false;
  }
}

function validate() {
  const prompt = safePromptInput.value.trim();
  const seconds = sanitizeSeconds(safeSecondsInput.value);
  const valid =
    prompt.length > 0 && Number.isInteger(seconds) && seconds >= 5 && seconds <= 120;
  safePayButton.disabled = !valid;
}

safePromptInput.addEventListener("input", validate);
safeSecondsInput.addEventListener("input", validate);
validate();

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const prompt = safePromptInput.value.trim();
  const seconds = sanitizeSeconds(safeSecondsInput.value);
  if (prompt.length === 0 || !Number.isInteger(seconds)) {
    return;
  }
  void runPayment(prompt, seconds);
});

globalScope.__musicUi = { validate };
