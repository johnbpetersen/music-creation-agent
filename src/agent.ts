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
registerX402ConfirmRoute(app);
registerHealthRoute(app);
registerAxChallengeRoute(app);

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
