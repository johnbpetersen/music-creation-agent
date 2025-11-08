import { createAgentApp, AgentKitConfig } from "@lucid-dreams/agent-kit";
import { musicEntrypoint } from "./entrypoints/music";
import {
  createMusicPricingMiddleware,
  MUSIC_PATH,
} from "./payments/musicPricing";
import { env } from "./config/env";
import { getChainConfig } from "./config/chain";
import { registerX402ConfirmRoute } from "./routes/x402Confirm";
import { registerHealthRoute } from "./routes/health";
import { registerAxChallengeRoute } from "./routes/axChallenge";
import { USD_RATE_PER_SECOND } from "./payments/musicPricing";

/**
 * This example shows how to combine `createAxLLMClient` with a small AxFlow
 * pipeline. The flow creates a short summary for a topic and then follows up
 * with a handful of ideas the caller could explore next.
 *
 * Required environment variables:
 *   - OPENAI_API_KEY   (passed through to @ax-llm/ax)
 *   - PRIVATE_KEY      (used for x402 payments)
 */

const configOverrides: AgentKitConfig = {
  payments: {
    facilitatorUrl: env.FACILITATOR_URL,
    payTo:
      (env.PAY_TO as `0x${string}` | undefined) ??
      "0xb308ed39d67D0d4BAe5BC2FAEF60c66BBb6AE429",
    network: (env.NETWORK ?? getChainConfig(env).network) as any,
    defaultPrice: env.DEFAULT_PRICE,
  },
};

const agentApp = createAgentApp(
  {
    name: "daydreams-music-maker",
    version: "1.0.0",
    description:
      "Paid Ax-refined music generation with ElevenLabs audio and x402 settlements on Base.",
  },
  {
    config: configOverrides,
  }
);

const { app, addEntrypoint, config } = agentApp;
const chainConfig = getChainConfig(env);
registerX402ConfirmRoute(app);
registerHealthRoute(app);
registerAxChallengeRoute(app);
app.get("/", (c) => {
  const uiUrl = "/ui";
  const apiEndpoint = "/entrypoints/music/invoke";
  return c.html(
    `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Daydreams Music Maker</title>
    <style>
      body { font-family: sans-serif; margin: 2rem; line-height: 1.6; }
      h1 { margin-bottom: 0.5rem; }
      code { background: #f4f4f4; padding: 0.1rem 0.3rem; border-radius: 3px; }
      .card { border: 1px solid #e0e0e0; padding: 1rem; border-radius: 8px; margin-top: 1rem; }
      a.button { display: inline-block; padding: 0.6rem 1rem; background: #2563eb; color: white; border-radius: 4px; text-decoration: none; }
    </style>
  </head>
  <body>
    <h1>Daydreams Music Maker</h1>
    <p>Ax-refined prompts + ElevenLabs audio. Pay via x402: $${USD_RATE_PER_SECOND.toFixed(
      4
    )} per second (5s min).</p>
    <div class="card">
      <h2>Wallet-friendly UI</h2>
      <p>Use the hosted UI to connect your wallet, preview pricing, and pay/settle automatically.</p>
      <p><a class="button" href="${uiUrl}">Open the Music UI</a></p>
    </div>
    <div class="card">
      <h2>API Access</h2>
      <p>POST <code>${apiEndpoint}</code> with:</p>
<pre>{
  "input": {
    "prompt": "cinematic brass and pads",
    "seconds": 60
  }
}</pre>
      <p>First call returns 402 with an x402 challenge. Pay + replay to receive your track URL.</p>
    </div>
    <p><a href="/.well-known/agent.json">View agent manifest</a></p>
  </body>
</html>`
  );
});

const paymentsConfig = config.payments;
const facilitatorUrlString =
  typeof paymentsConfig.facilitatorUrl === "string"
    ? paymentsConfig.facilitatorUrl
    : String(paymentsConfig.facilitatorUrl ?? "");
if (facilitatorUrlString.includes("daydreams.systems")) {
  console.info("[payments] Using Daydreams facilitator", {
    url: facilitatorUrlString,
  });
} else {
  console.warn("[payments] Non-Daydreams facilitator configured", {
    url: facilitatorUrlString,
  });
}
const musicPayTo =
  typeof paymentsConfig.payTo === "string" &&
  paymentsConfig.payTo.startsWith("0x")
    ? (paymentsConfig.payTo as `0x${string}`)
    : undefined;

if (musicPayTo) {
  app.use(
    MUSIC_PATH,
    createMusicPricingMiddleware({
      payTo: musicPayTo,
      facilitatorUrl: paymentsConfig.facilitatorUrl,
      usdcAddress: chainConfig.usdcAddress,
      network: paymentsConfig.network as any,
      description: musicEntrypoint.description,
    })
  );
} else {
  console.warn(
    "[agent-kit:music-payments] Unable to initialise music pricing middleware; payTo must be an EVM address."
  );
}

addEntrypoint(musicEntrypoint);

export { app };
