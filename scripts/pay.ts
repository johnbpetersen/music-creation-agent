// scripts/pay.ts
import { config } from "dotenv";
import {
  wrapFetchWithPayment,
  decodeXPaymentResponse,
  createSigner,
  type Hex,
} from "x402-fetch";

// Load a dedicated buyer env so you don't mix keys
config({ path: ".env.buyer" });

const payerKey = process.env.PAYER_PRIVATE_KEY as Hex | string;
const baseURL = process.env.RESOURCE_SERVER_URL ?? "http://localhost:8787";
const endpointPath =
  process.env.ENDPOINT_PATH ?? "/entrypoints/brainstorm/invoke";
const network = process.env.NETWORK ?? "base-sepolia";
const facilitatorUrl =
  process.env.FACILITATOR_URL ?? "https://facilitator.daydreams.systems";
const topic = process.env.TOPIC ?? "daydreams x402 agent kit";

if (!payerKey) {
  console.error("Missing PAYER_PRIVATE_KEY in .env.buyer");
  process.exit(1);
}

const url = `${baseURL}${endpointPath}`;

async function main() {
  // payer signer on Base Sepolia
  const signer = await createSigner(network as any, payerKey);
  const fetchWithPayment = wrapFetchWithPayment(fetch, signer, {
    chain: network,
    facilitatorUrl,
    // caps large enough to cover your price (0.003 USDC = 3000 atomic)
    maxPaymentAtomic: "20000", // 0.02 USDC
    maxTotalAtomic: "20000",
  } as any);

  const res = await fetchWithPayment(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ input: { topic } }),
  });

  const text = await res.text();
  let body: any;
  try { body = JSON.parse(text); } catch { body = text; }

  console.log("STATUS", res.status);
  console.log("BODY", body);

  const hdr = res.headers.get("x-payment-response");
  if (hdr) console.log("x402 receipt:", decodeXPaymentResponse(hdr));
}

main().catch((e) => {
  console.error("Buyer error:", e?.response?.data ?? e);
  process.exit(1);
});