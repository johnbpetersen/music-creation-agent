import { config } from "dotenv";
import {
  createSigner,
  decodeXPaymentResponse,
  type Hex,
} from "x402-fetch";
import {
  createPaymentHeader,
  selectPaymentRequirements,
} from "x402/client";
import { exact } from "x402/schemes";
import { PaymentRequirementsSchema } from "x402/types";

config({ path: ".env.buyer" });

type CliOptions = {
  prompt?: string;
  seconds?: number;
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

  return { prompt: prompt?.trim(), seconds, dryRun };
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
  const cli = parseArgs(process.argv.slice(2));

  const prompt =
    cli.prompt ??
    process.env.MUSIC_PROMPT ??
    process.env.PROMPT ??
    undefined;

  const seconds =
    cli.seconds ??
    (() => {
      const envSeconds =
        process.env.MUSIC_SECONDS ?? process.env.SECONDS ?? undefined;
      if (envSeconds === undefined) return undefined;
      const value = Number(envSeconds);
      return Number.isFinite(value) ? Math.floor(value) : undefined;
    })();

  const dryRun =
    cli.dryRun ||
    ["true", "1", "yes"].includes(
      (process.env.MUSIC_DRY_RUN ?? "").toLowerCase()
    );

  if (!prompt || !prompt.trim()) {
    throw new Error(
      "Missing prompt. Provide --prompt \"...\" or set MUSIC_PROMPT / PROMPT in .env.buyer."
    );
  }

  if (
    typeof seconds !== "number" ||
    !Number.isInteger(seconds) ||
    seconds < 5 ||
    seconds > 120
  ) {
    throw new Error(
      "Missing or invalid seconds. Provide --seconds 45 or set MUSIC_SECONDS / SECONDS (integer 5-120)."
    );
  }

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

  const payload = {
    input: {
      prompt,
      seconds,
    },
  };

  console.log("[music-pay] fetching payment requirements from", `${baseURL}${endpointPath}`);
  const initialRes = await fetch(`${baseURL}${endpointPath}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (initialRes.status !== 402) {
    const text = await initialRes.text();
    throw new Error(
      `Unexpected initial status (${initialRes.status}): ${text}`
    );
  }

  const { accepts, x402Version } = await initialRes.json();
  const parsedRequirements = accepts.map((entry: unknown) =>
    PaymentRequirementsSchema.parse(entry)
  );
  const requirement = selectPaymentRequirements(
    parsedRequirements,
    network,
    "exact"
  );

  const signer = await createSigner(network, payerKey);
  const paymentHeader = await createPaymentHeader(
    signer,
    x402Version,
    requirement
  );

  console.log("[music-pay] retrying with payment header");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35_000);

  const response = await fetch(`${baseURL}${endpointPath}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-PAYMENT": paymentHeader,
    },
    body: JSON.stringify(payload),
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));

  const text = await response.text();
  console.log("[music-pay] response status", response.status);
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
