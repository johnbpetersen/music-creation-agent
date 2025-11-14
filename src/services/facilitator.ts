export interface FacilitatorVerifyParams {
  facilitatorUrl: string;
  x402Version: number;
  paymentRequirements: PaymentRequirements;
  paymentPayload: PaymentPayload;
  expected: {
    chain: string;
    asset: string;
    payTo: string;
    amountAtomic: string;
  };
}

export interface FacilitatorVerifySuccess {
  ok: true;
  amountPaidAtomic: string;
  providerRaw: unknown;
}

export interface FacilitatorVerifyFailure {
  ok: false;
  status: number | null;
  message: string;
  detail?: string;
}

type FacilitatorVerifyResult =
  | FacilitatorVerifySuccess
  | FacilitatorVerifyFailure;

function normalizeHex(value: string) {
  return value.toLowerCase();
}

function toDecimalString(value: string | number | bigint) {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") return Math.trunc(value).toString();
  return value.replace(/^0+(\d)/, "$1") || "0";
}

export async function verifyAuthorizationWithFacilitator(
  params: FacilitatorVerifyParams
): Promise<FacilitatorVerifyResult> {
  const { facilitatorUrl, x402Version, paymentRequirements, paymentPayload, expected } =
    params;

  const url = new URL("/verify", facilitatorUrl).toString();

  const normalizedAuthorization = {
    from: normalizeHex(paymentPayload.payload.authorization.from),
    to: normalizeHex(paymentPayload.payload.authorization.to),
    value: toDecimalString(paymentPayload.payload.authorization.value),
    validAfter: toDecimalString(paymentPayload.payload.authorization.validAfter),
    validBefore: toDecimalString(paymentPayload.payload.authorization.validBefore),
    nonce: normalizeHex(paymentPayload.payload.authorization.nonce),
  };

  const payload = {
    x402Version,
    paymentPayload: {
      x402Version: paymentPayload.x402Version,
      scheme: paymentPayload.scheme,
      network: paymentPayload.network,
      payload: {
        signature: normalizeHex(paymentPayload.payload.signature),
        authorization: normalizedAuthorization,
      },
    },
    paymentRequirements: {
      ...paymentRequirements,
      maxAmountRequired: toDecimalString(paymentRequirements.maxAmountRequired),
      payTo: paymentRequirements.payTo.toLowerCase(),
      asset: paymentRequirements.asset.toLowerCase(),
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
      accept: "application/json",
      "user-agent": "music-creation-agent/1.0 (+x402-verify)",
    },
    body: JSON.stringify(payload),
  }).catch((error: any) => {
    return {
      ok: false,
      status: null,
      message:
        error?.message ?? "Unable to reach facilitator verification service",
    } as FacilitatorVerifyFailure;
  });

  if (!(res instanceof Response)) {
    console.warn("[facilitator] verify request failed", {
      status: res.status,
      message: res.message,
    });
    return res;
  }

  const status = res.status;
  const text = await res.text();
  let json: any = null;

  if (
    res.headers
      .get("content-type")
      ?.toLowerCase()
      .includes("application/json")
  ) {
    try {
      json = text ? JSON.parse(text) : null;
    } catch (error) {
      console.warn("[facilitator] failed to parse JSON", {
        status,
        text: text.slice(0, 200),
        error: (error as Error).message,
      });
      return {
        ok: false,
        status,
        message: "Failed to parse facilitator response",
        detail: text,
      };
    }
  }

  if (!res.ok) {
    const message =
      json?.error?.message ??
      json?.message ??
      `Facilitator returned ${status}`;
    const failure: FacilitatorVerifyFailure = {
      ok: false,
      status,
      message,
      detail: text,
    };
    console.warn("[facilitator] verification rejected", {
      status,
      message,
    });
    return failure;
  }

  const verified =
    json?.verified === true ||
    json?.isValid === true ||
    json?.valid === true;

  if (!verified) {
    const message =
      json?.error?.message ?? "Facilitator did not verify authorization";
    const failure: FacilitatorVerifyFailure = {
      ok: false,
      status,
      message,
      detail: text,
    };
    console.warn("[facilitator] verification invalid", {
      status,
      message,
    });
    return failure;
  }

  const amountPaid =
    typeof json.amountAtomic === "string"
      ? json.amountAtomic
      : toDecimalString(json.amount ?? expected.amountAtomic);

  const responseTo = json.to ?? json.payTo;
  const responseAsset = json.asset ?? json.symbol;
  const responseChain = json.chain ?? json.network;

  if (
    responseTo &&
    normalizeHex(responseTo) !== normalizeHex(expected.payTo)
  ) {
    const failure: FacilitatorVerifyFailure = {
      ok: false,
      status,
      message: "Payment sent to wrong address",
      detail: `Expected ${expected.payTo}, got ${responseTo}`,
    };
    console.warn("[facilitator] verification mismatch", failure);
    return failure;
  }

  if (
    responseAsset &&
    normalizeHex(responseAsset) !== normalizeHex(expected.asset)
  ) {
    const failure: FacilitatorVerifyFailure = {
      ok: false,
      status,
      message: "Wrong asset used for payment",
      detail: `Expected ${expected.asset}, got ${responseAsset}`,
    };
    console.warn("[facilitator] verification mismatch", failure);
    return failure;
  }

  if (
    responseChain &&
    responseChain.toLowerCase() !== expected.chain.toLowerCase()
  ) {
    const failure: FacilitatorVerifyFailure = {
      ok: false,
      status,
      message: "Payment made on wrong network",
      detail: `Expected ${expected.chain}, got ${responseChain}`,
    };
    console.warn("[facilitator] verification mismatch", failure);
    return failure;
  }

  console.info("[facilitator] verification ok", {
    amountAtomic: amountPaid,
    expectedPayTo: expected.payTo,
    chain: expected.chain,
  });

  return {
    ok: true,
    amountPaidAtomic: amountPaid,
    providerRaw: json,
  };
}
import type { PaymentPayload, PaymentRequirements } from "x402/types";
