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

### Available scripts

- `bun run dev` – start the agent in watch mode.
- `bun run start` – start the agent once.
- `bun run agent` – run the agent module directly (helpful for quick experiments).
- `bunx tsc --noEmit` – type-check the project.
- `bun test` – run unit tests (including music paywall and CLI dry-run coverage).

### Music entrypoint

The project now exposes a paid `music` entrypoint that refines a prompt with Daydreams’ Ax LLM client and generates a track via ElevenLabs. Call it with:

```sh
curl -X POST http://localhost:8787/entrypoints/music/invoke \
  -H "content-type: application/json" \
  -d '{"input":{"prompt":"upbeat synthwave", "seconds":45}}'
```

The music entrypoint applies a dynamic paywall where the price equals `seconds * 5` cents (Base Sepolia USDC). An unpaid call returns the x402 `accepts` requirements with that per-request rate.

Use the helper script to exercise the flow:

```sh
# Preview the track URL without hitting the network (CI-safe)
bun run scripts/music-pay.ts --prompt "upbeat synthwave" --seconds 45 --dry-run

# Real payment flow (requires funding the buyer wallet)
bun run scripts/music-pay.ts --prompt "upbeat synthwave" --seconds 45
```

When payments are required for other entrypoints, wrap the request with `scripts/pay.ts` or `scripts/pay-debug.ts`.

### Environment toggles

- `ELEVENLABS_API_KEY` *(optional)* – enable real ElevenLabs Music generation.
- `USE_REAL_ELEVENLABS=true` – switch from placeholder URLs to live ElevenLabs calls.
- `USE_REAL_LLM=true` – send refinement prompts through the configured Ax LLM; otherwise a deterministic fallback string is used.
- Existing payment variables (`FACILITATOR_URL`, `NETWORK`, `PAY_TO`, etc.) continue to drive x402 payments via the Daydreams facilitator.

### Next steps

- Update `src/agent.ts` with your use case.
- Wire up `@lucid-dreams/agent-kit` configuration and secrets (see `AGENTS.md` in the repo for details).
- Copy `.env.example` to `.env` and fill in the values for your environment.
- Deploy with your preferred Bun-compatible platform when you're ready.
