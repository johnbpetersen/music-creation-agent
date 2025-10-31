import { config } from "dotenv";
import {
  wrapFetchWithPayment,
  createSigner,
  decodeXPaymentResponse,
  type Hex,
} from "x402-fetch";

config({ path: ".env.buyer" });

type CliOptions = {
  prompt: string;
  seconds: number;
  dryRun: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  let prompt: string | undefined;
  let seconds: number | undefined;
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--prompt") {
      prompt = argv[++i];
      continue;
    }
    if (arg === "--seconds") {
      const value = Number(argv[++i]);
      seconds = Number.isFinite(value) ? Math.floor(value) : NaN;
      continue;
    }
    throw new Error(`Unsupported argument: ${arg}`);
  }

  if (!prompt || !prompt.trim()) {
    throw new Error("--prompt is required");
  }

  if (
    typeof seconds !== "number" ||
    !Number.isInteger(seconds) ||
    seconds < 5 ||
    seconds > 120
  ) {
    throw new Error("--seconds must be an integer between 5 and 120");
  }

  return { prompt: prompt.trim(), seconds, dryRun };
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function formatOk(trackUrl: string) {
  console.log(`OK: trackUrl=${trackUrl}`);
}

async function run() {
  const { prompt, seconds, dryRun } = parseArgs(process.argv.slice(2));

  if (dryRun) {
    const slug = toSlug(`${prompt}-${seconds}`);
    const trackUrl = `https://dry-run.tracks/${slug}.mp3`;
    formatOk(trackUrl);
    return;
  }

  const payerKey = process.env.PAYER_PRIVATE_KEY as Hex | undefined;
  if (!payerKey) {
    throw new Error("Missing PAYER_PRIVATE_KEY in .env.buyer");
  }

  const baseURL =
    process.env.RESOURCE_SERVER_URL ?? "http://localhost:8787";
  const endpointPath =
    process.env.ENDPOINT_PATH ?? "/entrypoints/music/invoke";
  const network = (process.env.NETWORK ?? "base-sepolia") as any;
  const facilitatorUrl =
    process.env.FACILITATOR_URL ?? "https://facilitator.daydreams.systems";

  const signer = await createSigner(network, payerKey);
  const fetchWithPayment = wrapFetchWithPayment(fetch, signer, {
    chain: network,
    facilitatorUrl,
    maxPaymentAtomic: "10000000", // 10 USDC in atomic units
    maxTotalAtomic: "10000000",
  } as any);

  const payload = {
    input: {
      prompt,
      seconds,
    },
  };

  const response = await fetchWithPayment(`${baseURL}${endpointPath}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  if (!response.ok) {
    throw new Error(
      `Request failed (${response.status}): ${
        typeof body === "string" ? body : JSON.stringify(body)
      }`
    );
  }

  const trackUrl = body?.output?.trackUrl;
  if (!trackUrl || typeof trackUrl !== "string") {
    throw new Error("Missing trackUrl in response payload");
  }

  const receiptHeader = response.headers.get("x-payment-response");
  if (receiptHeader) {
    try {
      decodeXPaymentResponse(receiptHeader);
    } catch (error) {
      console.warn("Failed to decode x-payment-response:", error);
    }
  }

  formatOk(trackUrl);
}

run().catch((error) => {
  console.error("music-pay error:", error?.message ?? error);
  process.exit(1);
});
