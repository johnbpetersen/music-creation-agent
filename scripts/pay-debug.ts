import { config } from "dotenv";
import {
  createSigner,
  type Hex,
} from "x402-fetch";
import {
  createPaymentHeader,
  selectPaymentRequirements,
} from "x402/client";
import { PaymentRequirementsSchema } from "x402/types";
import { exact } from "x402/schemes";
import { decodeXPaymentResponse } from "x402-fetch";

config({ path: ".env.buyer" });

const payerKey = process.env.PAYER_PRIVATE_KEY as Hex;
const baseURL = process.env.RESOURCE_SERVER_URL ?? "";
const endpointPath = process.env.ENDPOINT_PATH ?? "";
const network = (process.env.NETWORK ?? "base-sepolia") as any;
const facilitatorUrl =
  process.env.FACILITATOR_URL ?? "https://facilitator.daydreams.systems";
const topic = process.env.TOPIC ?? "debug payment";

if (!payerKey) throw new Error("Missing PAYER_PRIVATE_KEY");
if (!baseURL) throw new Error("Missing RESOURCE_SERVER_URL");
if (!endpointPath) throw new Error("Missing ENDPOINT_PATH");

const url = `${baseURL}${endpointPath}`;

async function main() {
  console.log("Requesting payment requirements from", url);
  const initial = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ input: { topic } }),
  });

  console.log("Initial status:", initial.status);

  if (initial.status !== 402) {
    const bodyText = await initial.text();
    console.log("Unexpected response:", bodyText);
    return;
  }

  const { accepts, x402Version } = await initial.json();
  console.log("x402Version:", x402Version);
  console.log("Payment requirements count:", accepts.length);

  const parsedRequirements = accepts.map((entry: unknown, idx: number) => {
    const parsed = PaymentRequirementsSchema.parse(entry);
    console.log(`Requirement[${idx}]`, parsed);
    return parsed;
  });

  const requirement = selectPaymentRequirements(
    parsedRequirements,
    network,
    "exact"
  );
  console.log("Selected requirement:", requirement);

  const signer = await createSigner(network, payerKey);
  console.log("Signer chain:", (signer as any)?.chain ?? "unknown");

  const paymentHeader = await createPaymentHeader(
    signer,
    x402Version,
    requirement
  );
  console.log("Payment header:", paymentHeader)
  
  const decodedPayment = exact.evm.decodePayment(paymentHeader);
  console.log("Decoded payment:", decodedPayment);

  const verifyPayload = {
    x402Version,
    paymentPayload: decodedPayment,
    paymentRequirements: requirement,
  };

  console.log("Verifying with facilitator:", facilitatorUrl);
  const verifyResponse = await fetch(`${facilitatorUrl}/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(verifyPayload),
  });
  console.log("Facilitator verify status:", verifyResponse.status);
  const verifyText = await verifyResponse.text();
  console.log("Facilitator verify body:", verifyText);
  if (!verifyResponse.ok) {
    console.error("Facilitator verification failed; aborting before settlement.");
    return;
  }

  const paidResponse = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-payment": paymentHeader,
    },
    body: JSON.stringify({ input: { topic } }),
  });

  console.log("Paid status:", paidResponse.status);
  const text = await paidResponse.text();
  console.log("Paid body:", text);

  const receiptHeader = paidResponse.headers.get("x-payment-response");
  if (receiptHeader) {
    try {
      const decoded = decodeXPaymentResponse(receiptHeader);
      console.log("Decoded receipt:", decoded);
    } catch (error) {
      console.warn("Failed to decode receipt:", error);
    }
  } else {
    console.warn("No x-payment-response header present.");
  }
}

main().catch((error) => {
  console.error("Debug script error:", error);
  process.exit(1);
});
