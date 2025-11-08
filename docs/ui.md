## Browser UI Walkthrough

### Build & Serve

```bash
bun run ui:build   # bundles src/ui/app.ts -> public/ui
bun run dev       # serves API + UI at http://localhost:8787
```

Visit `http://localhost:8787/ui`.

### Wallet support

- MetaMask (desktop) and Coinbase Wallet extension are both supported.
- The UI auto-detects injected providers; falls back to Coinbase Wallet SDK if only Coinbase is available.
- When the user clicks **Connect Wallet**, `wallet.ts` ensures the chain matches `/ui/config.json` (Base or Base Sepolia) and prompts the wallet to switch/add the network if needed.

### Payment flow

1. Enter prompt + seconds (5–120). Validation disables the **Pay & Create** button until input is valid and the wallet is connected to the correct chain.
2. On **Pay & Create**:
   - The UI calls `/entrypoints/music/invoke`.
   - If unpaid, the server returns `402` with x402 requirements; the UI parses them and uses `x402/client` helpers to produce the `X-PAYMENT` header.
   - Wallet signs the ERC‑3009 authorization using viem’s `signTypedData`.
   - Browser POSTs `/api/x402/confirm` with the payment header.
3. Once the response returns:
   - Audio player loads the `trackUrl`.
   - Download link is enabled unless we returned the placeholder data URL.
   - The refined prompt is shown under the player (useful for QA/Daydreams review).

### UI config endpoint

`/ui/config.json` exposes chain metadata (network, chainId, RPC, payTo, facilitator) to the browser. This is generated at request time by `src/index.ts` from `env`/`getChainConfig`.

### Testing

- `tests/ui.test.ts` uses a mocked DOM + wallet bridge to ensure the UI flow constructs payment headers and updates the audio player.
- For manual testing, open devtools and watch console output:
  - `[music ui error] …` when the browser encounters issues.
  - Status text updates inline with the user interactions (“Requesting payment requirements…”, “Signing authorization…”, etc.).

### Demo tips for Daydreams

- Keep `USE_REAL_LLM`/`USE_REAL_ELEVENLABS` consistent with what you’re showcasing; the UI displays placeholder vs live audio messaging automatically.
- Monitor the backend logs for `[music-payments]`, `[facilitator]`, and `[x402-confirm]` while driving the UI so you can point to settlement tx hashes immediately after the flow completes.
