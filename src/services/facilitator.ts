export interface FacilitatorAuthorization {
  from: `0x${string}`;
  to: `0x${string}`;
  value: string | number | bigint;
  validAfter: string | number | bigint;
  validBefore: string | number | bigint;
  nonce: `0x${string}`;
  signature: `0x${string}`;
}

export interface FacilitatorVerifyParams {
  facilitatorUrl: string;
  chainId: number;
  tokenAddress: `0x${string}`;
  payTo: `0x${string}`;
  amountAtomic: string;
  authorization: FacilitatorAuthorization;
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
  const { facilitatorUrl, chainId, tokenAddress, payTo, amountAtomic, authorization } =
    params;

  const url = new URL("/verify", facilitatorUrl).toString();

  const payload = {
    scheme: "erc3009" as const,
    chainId,
    tokenAddress: normalizeHex(tokenAddress),
    payTo: normalizeHex(payTo),
    amountAtomic: toDecimalString(amountAtomic),
    authorization: {
      from: normalizeHex(authorization.from),
      to: normalizeHex(authorization.to),
      value: toDecimalString(authorization.value),
      validAfter: toDecimalString(authorization.validAfter),
      validBefore: toDecimalString(authorization.validBefore),
      nonce: normalizeHex(authorization.nonce),
      signature: normalizeHex(authorization.signature),
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
    return res;
  }

  const status = res.status;
  let text: string | undefined;
  let json: any = null;

  try {
    text = await res.text();
    json = text ? JSON.parse(text) : null;
  } catch (error) {
    console.warn("[facilitator] failed to parse JSON", {
      status,
      text: text?.slice(0, 200),
      error: (error as Error).message,
    });
    return {
      ok: false,
      status,
      message: "Failed to parse facilitator response",
      detail: text,
    };
  }

  if (!res.ok) {
    const message =
      json?.error?.message ??
      json?.message ??
      `Facilitator returned ${status}`;
    return {
      ok: false,
      status,
      message,
      detail: text,
    };
  }

  if (json?.verified !== true) {
    const message =
      json?.error?.message ?? "Facilitator did not verify authorization";
    return {
      ok: false,
      status,
      message,
      detail: text,
    };
  }

  const amountPaid =
    typeof json.amountAtomic === "string"
      ? json.amountAtomic
      : toDecimalString(json.amount ?? amountAtomic);

  return {
    ok: true,
    amountPaidAtomic: amountPaid,
    providerRaw: json,
  };
}
