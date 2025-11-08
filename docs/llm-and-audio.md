## Daydreams Ax & ElevenLabs

### Ax client

- `src/ai/client.ts` instantiates the raw Daydreams Ax SDK:
  ```ts
  const ax = ai({
    name: "openai",
    apiKey: process.env.OPENAI_API_KEY!,
    config: { model: "gpt-4.1-mini", stream: true },
  });
  ```
- No x402 router is involved; usage is billed to the Daydreams key tied to `OPENAI_API_KEY`.
- Set `USE_REAL_LLM=true` to enable live refinement; otherwise the deterministic fallback runs.

### Refinement flow

1. `refineFlow` (AxFlow pipeline) rewrites the user prompt based on `prompt`, `seconds`, and `instrumental` flags.
2. On success we log `[ai] refined prompt { original, refined, seconds }` and return the Ax model identifier (may be `"unknown"` when the SDK does not report it).
3. If Ax throws, we attempt OpenRouter (`OPENROUTER_*` envs) as a secondary provider.
4. If both fail, we fall back to the user prompt plus structured guidance:
   ```
   "{user prompt}. Run time should land around {seconds} seconds ... Instrumental only; no vocals or lyrics."
   ```

### Ax troubleshooting

- `/api/ax/challenge` hits `https://api-beta.daydreams.systems/v1/chat/completions` with `model:gpt-5` and returns the raw response (status, body) for debugging.
- Logs:
  - `[ai] refinePrompt Ax error { message }` includes prompt preview and attempt metadata.
  - `[ai] OpenRouter refine failed ...` clarifies when fallbacks are rate-limited.
- If you need x402-backed LLM billing again, swap `src/ai/client.ts` back to `createAxLLMClient` once the router issue is resolved.

### ElevenLabs integration

- Controlled via `USE_REAL_ELEVENLABS` (default `false`).
- When live:
  - Requires `ELEVENLABS_API_KEY`, optional `ELEVENLABS_MODEL_ID`, and respects `ELEVENLABS_MAX_SECONDS`.
  - Posts to `ELEVENLABS_API_URL` and returns a data URL containing the encoded MP3.
- Placeholder mode:
  - Returns `ELEVENLABS_PLACEHOLDER_URL` (configurable), allowing CI/dry-run testing without consuming credits.
- Health endpoint exposes `mode`, `ready`, and `maxSeconds`.

### Instrumental enforcement

- Both Ax refinement and ElevenLabs request logic append “Instrumental only; no vocals or lyrics” when `ELEVENLABS_INSTRUMENTAL_ONLY=true`.
- If you want to allow vocals, set that env to `false` (remember to update docs for reviewers).

### Observability

- `[music] run start` / `[music] run success` log run IDs, provider, duration, and timing.
- `[music] elevenlabs success` includes a base64 preview (truncated) for quick validation.
- Health endpoint reflects Ax/ElevenLabs readiness and includes friendly messages when keys are missing or live calls are disabled due to `NODE_ENV=test`.
