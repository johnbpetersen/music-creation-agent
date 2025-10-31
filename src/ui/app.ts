type X402WebClient = {
  fetch: typeof fetch;
};

type CreateX402Web = () => X402WebClient;

declare global {
  interface Window {
    __musicUi?: {
      validate: () => void;
    };
    x402Web?: {
      createX402Web?: CreateX402Web;
    };
    __createX402Web?: CreateX402Web;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var __createX402Web: CreateX402Web | undefined;
}

const getCreateX402Web = (): CreateX402Web => {
  if (typeof window !== "undefined" && window.__createX402Web) {
    return window.__createX402Web;
  }
  if (typeof globalThis !== "undefined" && globalThis.__createX402Web) {
    return globalThis.__createX402Web;
  }
  if (typeof window !== "undefined" && window.x402Web?.createX402Web) {
    return window.x402Web.createX402Web as CreateX402Web;
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

const x402 = getCreateX402Web()();

function sanitizeSeconds(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return NaN;
  return Math.floor(parsed);
}

async function runPayment(prompt: string, seconds: number) {
  statusEl.textContent = "Paying…";
  payButton.disabled = true;
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
    audioEl.src = trackUrl;
    statusEl.textContent = "Ready! Press play.";
  } catch (error) {
    console.error("music ui error:", error);
    statusEl.textContent = error instanceof Error ? error.message : "Payment failed.";
  } finally {
    payButton.disabled = false;
  }
}

function validate() {
  const prompt = promptInput.value.trim();
  const seconds = sanitizeSeconds(secondsInput.value);
  const valid =
    prompt.length > 0 && Number.isInteger(seconds) && seconds >= 5 && seconds <= 120;
  payButton.disabled = !valid;
}

promptInput.addEventListener("input", validate);
secondsInput.addEventListener("input", validate);
validate();

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const prompt = promptInput.value.trim();
  const seconds = sanitizeSeconds(secondsInput.value);
  if (prompt.length === 0 || !Number.isInteger(seconds)) {
    return;
  }
  void runPayment(prompt, seconds);
});

declare global {
  interface Window {
    __musicUi?: {
      validate: () => void;
    };
  }
}

if (typeof window !== "undefined") {
  window.__musicUi = { validate };
}
