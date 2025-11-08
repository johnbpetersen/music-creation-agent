## Happy-Path Validation Guide

Use this checklist to demonstrate the full Daydreams flow (Ax refinement → ElevenLabs generation → x402 payment + settlement). It covers both the CLI helper and the `/ui` experience.

---

### 1. Pre-flight Checks

1. **Funding**
   - Buyer wallet (`PAYER_PRIVATE_KEY` in `.env.buyer`) holds enough USDC and ETH on the configured `X402_CHAIN` (Base or Base Sepolia).
   - Settlement wallet (`SETTLE_PRIVATE_KEY` in `.env`) holds Base ETH for gas when `SETTLE_TRANSACTIONS=true`.
2. **Environment**
   - `FACILITATOR_URL=https://facilitator.daydreams.systems`.
   - `USE_REAL_LLM=true`, `USE_REAL_ELEVENLABS=true` for live demo; leave `false` if you prefer fallbacks.
   - `SETTLE_TRANSACTIONS=true` only when you’re ready to broadcast settlement transactions.
3. **Health**
   ```bash
   curl http://localhost:8787/api/health | jq
   ```
   Ensure `daydreamsAx.ready`, `elevenLabs.ready`, and (if settlement requested) `settlement.ready` are `true`.
4. **Daydreams readiness snapshot**
   ```bash
   bun run scripts/daydreams-check.ts
   ```
   Captures `/api/health` and `/api/ax/challenge` output for your submission notes (set `API_BASE_URL` to target remote deployments).

---

### 2. CLI Flow (`scripts/music-pay.ts`)

1. Copy `.env.buyer.example` → `.env.buyer` and fill in keys.
2. Run:
   ```bash
   bun run scripts/music-pay.ts --prompt "spanish guitar edm" --seconds 45
   ```
3. Expected output:
   - Initial `402` response logged (`[music-pay] fetching payment requirements ...`).
   - Second request returns `OK: trackUrl=...`.
4. Server logs should include:
   - `[music-payments] computed price …`
   - `[facilitator]` verification success (no warnings).
   - `[x402-confirm] Settlement broadcast { txHash }` when settlement is enabled.
   - `[ai] refined prompt { ... }` followed by `[music] elevenlabs success { ... }`.
5. Verify settlement hash on BaseScan (mainnet or Sepolia). You should see a `transferWithAuthorization` call moving the correct USDC amount from the buyer to `PAY_TO`.

---

### 3. Browser UI (`/ui`)

1. Build once: `bun run ui:build`. Run dev server: `bun run dev`.
2. Visit `http://localhost:8787/ui`.
3. Connect wallet (MetaMask or Coinbase extension). Ensure the wallet switches to the chain advertised in `/ui/config.json`.
4. Enter prompt + seconds (e.g., “lofi sunrise”, `60`), hit **Pay & Create**.
5. Wallet signs the authorization; the UI indicates each step (“Requesting payment requirements…”, “Signing authorization…”, “Submitting payment…”).
6. Success indicators:
   - Audio player loads the returned `trackUrl`.
   - Download link appears when ElevenLabs returns real audio.
   - Refined prompt box shows the LLM output for audit.
7. Backend logs mirror the CLI flow. Capture the settlement hash + `[music] run success … provider=elevenlabs` for your submission notes.

---

### 4. Ax / ElevenLabs Verification

- **Ax usage**: In the Daydreams console (or OpenAI usage page) confirm token consumption around the run time. We expect a handful of tokens per refinement.
- **ElevenLabs**: Check your ElevenLabs dashboard for a matching generation, or rely on `[music] elevenlabs success` logs which include a truncated data URL preview.
- If Ax fails, you’ll see `[ai] refinePrompt Ax error` and the fallback plan kicks in. Include at least one log screenshot showing Ax success for the bounty submission.

---

### 5. Troubleshooting quick hits

| Symptom | Likely Cause | Fix |
| --- | --- | --- |
| `401`/`403` from Daydreams API | Invalid `OPENAI_API_KEY` | Reissue key, redeploy, hit `/api/ax/challenge`. |
| Facilitator rejects payment (`VERIFY_FAILED`) | Wrong `PAY_TO`, amount, or network | Re-check `.env`, ensure buyer signed the latest requirements. |
| Settlement skipped | No `SETTLE_PRIVATE_KEY` or running in `NODE_ENV=test` | Supply a key & restart (only outside test/CI). |
| UI stuck on “Requesting payment requirements…” | API server unreachable or returning non-JSON | Check dev server logs, ensure `/entrypoints/music/invoke` is accessible. |
| Audio missing | ElevenLabs in placeholder mode | Set `USE_REAL_ELEVENLABS=true` and provide `ELEVENLABS_API_KEY`. |

---

### 6. Submission Artifacts

For the bounty submission include:

- Health check JSON showing all services ready.
- CLI or UI console output proving the 402 → paid flow, plus the settlement tx hash.
- Screenshot or log snippet of `[ai] refined prompt …` to confirm Ax.
- Link to the generated track (data URL or uploaded MP3).
- Optional: BaseScan links + Daydreams usage screenshot to illustrate both USDC payment and LLM consumption.
