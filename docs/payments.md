## Payments, Facilitator & Settlement

### Overview

1. Client POSTs `/entrypoints/music/invoke`.
2. Middleware (`createMusicPricingMiddleware`) prices the request: `price = seconds * 5¢`, rejects unpaid requests with `402` + x402 requirements.
3. Buyer signs an ERC‑3009 authorization and replays the request with `X-PAYMENT`.
4. Server verifies via the Daydreams facilitator (`/verify`) and, if enabled, settles to the `PAY_TO` wallet using `transferWithAuthorization`.
5. Music entrypoint runs Ax refinement + ElevenLabs generation and returns the track.

### Facilitator configuration

- Default: `https://facilitator.daydreams.systems`.
- Override via `FACILITATOR_URL` when testing third-party facilitators.
- `/api/x402/confirm` logs whether the Daydreams facilitator is active:
  - `[payments] Using Daydreams facilitator { url }`
  - `[payments] Non-Daydreams facilitator configured { url }`

### Environment keys

| Variable | Purpose |
| --- | --- |
| `PAY_TO` | Recipient of USDC on Base/Base Sepolia. |
| `NETWORK` / `X402_CHAIN` | Chain selector (`base` or `base-sepolia`). |
| `SETTLE_TRANSACTIONS` | When `true`, auto-broadcasts settlement (disabled during tests). |
| `SETTLE_PRIVATE_KEY` | EOA paying gas for `transferWithAuthorization`. |
| `SETTLE_RPC_URL` | RPC endpoint for the settlement chain. |

### CLI buyer flow

`bun run scripts/music-pay.ts --prompt "lofi" --seconds 45`

Reads `.env.buyer`, performs the 402 round-trip, signs the authorization (with `x402-fetch`), and prints the resulting `trackUrl`. Add `--dry-run` to skip network/payment logic.

### UI flow

- Build UI: `bun run ui:build`.
- Visit `/ui`, connect wallet (MetaMask or Coinbase extension), enter prompt/duration, click **Pay & Create**.
- Wallet signs the ERC‑3009 authorization, the browser POSTs `/api/x402/confirm`, facilitator verifies, server settles, UI plays the returned track.

### Settlement verification

- Successful runs log `[x402-confirm] Settlement broadcast { txHash }`.
- Inspect the hash on BaseScan (mainnet or Sepolia depending on `X402_CHAIN`).
  - Contract: USDC (`0x833589fC…` on Base, `0x036CbD5…` on Sepolia).
  - Input: `transferWithAuthorization(...)`.
  - Internal transfers show USDC moving from buyer → `PAY_TO`.
- If `SETTLE_TRANSACTIONS=true` but keys are missing or `NODE_ENV=test`, the server logs why settlement was skipped.

### Pricing guardrails

- Price is deterministic (`seconds * 5¢`). The middleware parses `input.seconds`, clamps to integers, and ensures the facilitator payload matches the required amount.
- `/api/x402/confirm` re-computes the price and rejects mismatched authorizations (`WRONG_AMOUNT`, `WRONG_RECIPIENT`, `WRONG_NETWORK` errors).

### Health & telemetry

- `/api/health` reports settlement readiness and facilitator status so operators can confirm configuration before running bounty demos.
- Logs to watch:
  - `[music-payments] computed price …`
  - `[facilitator] verification rejected/invalid` (details when `/verify` responds with errors).
  - `[x402-confirm] Settlement failed` (RPC issues, wrong keys, etc.).
