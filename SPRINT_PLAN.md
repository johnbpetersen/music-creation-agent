# X402 Payment Integration Sprints

Objective: deliver a reliable x402-powered payment experience that lets a user submit a music prompt, complete ERC-3009 settlement, and receive a generated track without relying on the legacy browser helper.

Assumptions:
- Base Sepolia is our primary test network; Base mainnet support follows once flows are stable.
- Facilitator URL and RPC endpoints will be available via env variables.
- Team cadence: one sprint ≈ 1 week.

---

## Sprint 1 – Foundation & Environment Readiness
**Goal:** establish the shared primitives (env config, signer utilities, chain metadata) needed for wallet-driven payments.

- Audit existing payment touchpoints (CLI scripts, API routes, UI calls) and document integration points.
- Define required env surface: payer keys, facilitator URLs, RPC hosts, chain IDs; update `.env.example`, docs, and validation helpers.
- Bring in viem dependency + create `src/services/x402-signer.ts` (or equivalent) with nonce generation, expiry normalization, and network helpers.
- Implement chain config helper (Base vs Base Sepolia) consumable by both client and server.
- Add unit tests for signer normalization and env schema.

**Deliverables**
- Env documentation + sample files updated.
- Signer service exporting `signX402Payment`, `validateChain`, and helpers.
- Passing unit tests covering signer and env logic.

**Exit Criteria**
- Running the signer locally produces deterministic payloads (logged via temporary harness).
- Team members can boot the app with new env requirements satisfied.

---

## Sprint 2 – Client Wallet Integration & UI Flow
**Goal:** enable users to connect wallets and sign ERC-3009 authorizations from the music UI.

- Port/adapt `useWalletConnect` hook (MetaMask + Coinbase support, Base chain switching).
- Wire chain config helper into the hook and UI.
- Implement payment modal (or existing UI component updates) to handle: wallet connect, countdown display, sign & pay, manual hash fallback placeholder.
- Integrate signer service into the modal; ensure signatures post to a stub confirm endpoint.
- Add smoke tests (Playwright/Cypress or Bun test DOM harness) for wallet connect + modal state transitions (mock wallet).

**Deliverables**
- New UI flow behind feature flag (e.g., `X402_CLIENT_ENABLED`).
- Reusable wallet connect hook with error handling.
- Payment modal rendered from music prompt path with mocked confirm response.

**Exit Criteria**
- Demo: connect wallet (mock provider), sign, see payload hit stub endpoint in dev tools.
- QA checklist for UX states (expired challenge, retry, disconnect).

---

## Sprint 3 – Server Verification & Music Invocation
**Goal:** complete end-to-end verification by calling the facilitator and triggering song generation (no RPC fallback).

- Add `/api/x402/confirm` (or reuse existing route) that accepts signed authorization payloads.
- Integrate the facilitator verification helper, adapting logging/metrics to our stack.
- Implement challenge lifecycle: store issued challenge metadata; mark fulfilled/expired.
- On successful verification, invoke the existing music creation entrypoint and return track metadata to the UI.
- Add integration tests mocking facilitator success/failure and wrong payer scenarios.
- Instrument metrics/logging for verification attempts, failures, and latencies.

**Deliverables**
- Working confirm endpoint with facilitator-only flow.
- Updated scripts/tests confirming a full pay → song loop in local dev (using Base Sepolia).
- Monitoring hooks (logs/metrics) aligned with project standards.

**Exit Criteria**
- Manual test: run UI → sign → facilitator verifies → track plays.
- All integration tests green in CI.

---

## Sprint 4 – Settlement, Tooling, and Hardening
**Goal:** polish the flow, add optional settlement automation, and ensure documentation/testing readiness for release.

- (Optional) Implement facilitator settlement helper; document operational runbooks.
- Update CLI/debug scripts to hit new confirm endpoint (deprecate legacy helper usage).
- Add end-to-end regression test covering facilitator downtime → RPC fallback → success.
- Conduct security review (signature validation, replay protection, nonce handling).
- Finalize README/Operator docs for deployment (env vars, troubleshooting, known issues).

**Deliverables**
- Optional settlement module configured (or clear decision documented if deferred).
- Updated tooling + docs reflecting new flow.
- Comprehensive test suite including fallback/resilience cases.

**Exit Criteria**
- Release checklist signed off (docs, tests, monitoring).
- Stakeholder demo showing primary flow + fallback handling.

---

## Sprint 5 – Live LLM & Audio Production
**Goal:** enable real Daydreams Ax refinements and ElevenLabs music generation end-to-end, with credits and observability in place.

- Provision Daydreams Ax agent credentials (`OPENAI_API_KEY`) and toggle `USE_REAL_LLM=true`; capture refined prompts in logs/analytics for debugging.
- Configure ElevenLabs API key + model, set `USE_REAL_ELEVENLABS=true`, and add guardrails for credit usage (duration caps, throttling, friendly failure message).
- Implement health/status checks so the UI surfaces when LLM or ElevenLabs are degraded, including opt-in fallback to placeholder audio.
- Update `/api/health` (or add new endpoint) to expose Ax/ElevenLabs readiness for the UI and operator dashboards.
- Add integration tests that stub Ax + ElevenLabs clients, asserting we send refined prompts and parse the provider’s response format.
- Refresh documentation: setup guide for Ax agent + ElevenLabs, credit monitoring tips, and rollback plan.

**Deliverables**
- Production-ready env configuration with secrets stored in deployment platform.
- Verified runbook for enabling/disabling real services (including fallback path).
- Tests covering success and failure of both external providers.

**Exit Criteria**
- Manual run on staging pays, refines via Daydreams Ax, and returns an ElevenLabs audio URL.
- Health checks report “live” status, and documentation is updated for operations/on-call.

---

### Backlog / Stretch
- Base mainnet launch readiness (env toggles, higher limits).
- Additional wallet providers (WalletConnect, Rainbow).
- UI polish (payment history, more granular error messaging).
- Performance tuning for challenge issuance and track generation pipeline.

---

**Next Step:** Start with Sprint 1 tasks, ensuring environment groundwork is complete before enabling wallet-driven flows.
