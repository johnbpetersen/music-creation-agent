## music-creation-agent

This project was scaffolded with `create-agent-kit` and ships with a ready-to-run agent app built on [`@lucid-dreams/agent-kit`](https://www.npmjs.com/package/@lucid-dreams/agent-kit).

### Quick start

```sh
bun install
bun run dev
```

The dev command runs `bun` in watch mode, starts the HTTP server, and reloads when you change files inside `src/`.

### Project structure

- `src/agent.ts` – defines your agent manifest and entrypoints.
- `src/index.ts` – boots a Bun HTTP server with the agent.
- See [`docs/`](docs/README.md) for detailed Daydreams-focused setup, payment, LLM, and UI guides prepared for the bounty review.

### Available scripts

- `bun run dev` – start the agent in watch mode.
- `bun run start` – start the agent once.
- `bun run agent` – run the agent module directly (helpful for quick experiments).
- `bun run ui:build` – bundle the browser UI (re-run after editing `src/ui/app.ts`).
- `bunx tsc --noEmit` – type-check the project.
- `bun test` – run unit tests (including music paywall and CLI dry-run coverage).

### Music entrypoint

The project now exposes a paid `music` entrypoint that refines a prompt with Daydreams’ Ax LLM client and generates a track via ElevenLabs. Call it with:

```sh
curl -X POST http://localhost:8787/entrypoints/music/invoke \
  -H "content-type: application/json" \
  -d '{"input":{"prompt":"upbeat synthwave", "seconds":45}}'
```

The music entrypoint applies a dynamic paywall where the price equals `seconds * $0.0333` (Base USDC, $2.00 per minute). An unpaid call returns the x402 `accepts` requirements with that per-request rate.

Use the helper script to exercise the flow:

```sh
# Preview the track URL without hitting the network (CI-safe)
bun run scripts/music-pay.ts --prompt "upbeat synthwave" --seconds 45 --dry-run

# Real payment flow (requires funding the buyer wallet)
bun run scripts/music-pay.ts --prompt "upbeat synthwave" --seconds 45
```

When payments are required for other entrypoints, wrap the request with `scripts/pay.ts` or `scripts/pay-debug.ts`.

### Minimal browser UI

1. Bundle the client: `bun run ui:build`
2. Start the server: `bun run dev`
3. Visit [http://localhost:8787/ui](http://localhost:8787/ui), connect your wallet, enter a prompt + duration, then click **Pay & Create**. The UI signs an ERC-3009 authorization with your wallet and replays the request with the payment header.

### Environment configuration

Copy `.env.example` to `.env` and update the values that apply to your setup:

- **Server basics**
  - `PORT` *(default 8787)* – HTTP port exposed by the agent.
  - `API_BASE_URL` – optional origin override (used for absolute callback URLs).
- **x402 payments**
  - `PAY_TO` – receiving address for USDC payments. Defaults to the demo wallet if omitted.
  - `FACILITATOR_URL` – x402 facilitator endpoint. Defaults to the Daydreams public facilitator.
  - `NETWORK` – legacy agent-kit selector (`base` or `base-sepolia`); defaults to `base-sepolia`.
  - `X402_CHAIN` – canonical chain selector for signer and verification helpers (`base` or `base-sepolia`).
  - `X402_CHAIN_ID`, `X402_TOKEN_ADDRESS` – optional overrides for chain metadata; inferred from `X402_CHAIN` when not provided.
  - `BASE_MAINNET_RPC_URL`, `BASE_SEPOLIA_RPC_URL` – RPC endpoints used by verification fallbacks; seeded with public Base URLs.
- **Daydreams Ax LLM**
  - `OPENAI_API_KEY` – Daydreams agent key used to refine prompts.
  - `USE_REAL_LLM=true` – opt-in to live refinements (leave `false` for deterministic fallbacks).
  - `AX_MODEL` *(optional, default `gpt-4.1-mini`)* – override the Daydreams model if you prefer a cheaper tier.
- **ElevenLabs music**
  - `USE_REAL_ELEVENLABS=true` – enable live audio generation.
  - `ELEVENLABS_API_KEY` – API key with music credits.
  - `ELEVENLABS_MODEL_ID` *(default `eleven_music_v1`)* – target model.
  - `ELEVENLABS_MAX_SECONDS` *(default `90`)* – upper bound enforced when live generation is on.
  - Optional overrides: `ELEVENLABS_API_URL`, `ELEVENLABS_PLACEHOLDER_URL`.
- **Other secrets**
  - `PRIVATE_KEY` – signer key for settlement scripts (optional unless settling on-chain).
- **Settlement (optional)**
  - `SETTLE_TRANSACTIONS=true` – automatically broadcast ERC-3009 settle transactions after verification. Defaults to `false` and is ignored during tests/CI.
  - `SETTLE_PRIVATE_KEY` – key used to settle payments (defaults to `PRIVATE_KEY` if omitted).
  - `SETTLE_RPC_URL` – RPC endpoint for the settlement chain (defaults to the chain RPC).
  - Always ensure the settling key is funded and only enable this flag in trusted environments.

Once everything is set, hit `GET /api/health` to confirm the Daydreams Ax agent and ElevenLabs integration are in the expected mode (`live` vs `fallback`).

### Next steps

- Update `src/agent.ts` with your use case.
- Wire up `@lucid-dreams/agent-kit` configuration and secrets (see `AGENTS.md` in the repo for details).
- Copy `.env.example` to `.env` and fill in the values for your environment.
- Copy `.env.buyer.example` to `.env.buyer` if you plan to use the music payment CLI helper.
- Deploy with your preferred Bun-compatible platform when you're ready.
