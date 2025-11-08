## Setup & Environment

### Prerequisites

- Bun 1.1+ (tested on 1.3.1).
- Node tooling optional (TypeScript, ESLint), but not required when using Bun.
- Git, curl, and a Base wallet (for tests on Base Sepolia or Base mainnet).
- Daydreams developer kit credentials (OPENAI_API_KEY) and ElevenLabs API key for live audio.

### Install

```bash
bun install
```

### Environment files

1. Copy the examples:
   ```bash
   cp .env.example .env
   cp .env.buyer.example .env.buyer
   ```
2. Populate `.env`:
   - `FACILITATOR_URL` should point at the Daydreams facilitator (`https://facilitator.daydreams.systems`).
   - `PAY_TO` is the wallet collecting USDC. Defaults to the Daydreams demo address.
   - `OPENAI_API_KEY` is your Daydreams Ax key.
   - `SETTLE_TRANSACTIONS` stays `false` until you are ready to broadcast ERC‑3009 settlements, then set it true and supply `SETTLE_PRIVATE_KEY` + `SETTLE_RPC_URL`.
   - ElevenLabs keys are optional unless `USE_REAL_ELEVENLABS=true`.
3. Populate `.env.buyer` when you want to call the music entrypoint from the CLI:
   - `PAYER_PRIVATE_KEY` must hold USDC and ETH (for gas) on the configured chain.
   - Point `RESOURCE_SERVER_URL` at your deployment or `http://localhost:8787`.

### Running locally

```bash
bun run dev
```

This boots the Hono server, x402 middleware, and serves `/ui`. Production UI lives at `https://music-creation-agent-production.up.railway.app/ui`.

### Health check

`GET /api/health` returns:

```json
{
  "ok": true,
  "services": {
    "daydreamsAx": { "mode": "live", "configured": true, "ready": true },
    "elevenLabs": { "mode": "placeholder", "ready": true },
    "settlement": { "requested": false, "active": false, "ready": false }
  }
}
```

- `daydreamsAx.mode` flips to `live` when `USE_REAL_LLM=true` and `OPENAI_API_KEY` is present.
- `elevenLabs.mode` flips to `live` when `USE_REAL_ELEVENLABS=true` and the key is configured.
- `settlement.active` only becomes true when `SETTLE_TRANSACTIONS=true` and we’re not running tests.

### Tests

```bash
bun test
```

All integration tests run without network access. Settlement is automatically disabled in the test environment so CI cannot trigger chain calls.
