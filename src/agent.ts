import { z } from "zod";
import { createAgentApp, AgentKitConfig } from "@lucid-dreams/agent-kit";
import { flow } from "@ax-llm/ax";
import { getAxClient } from "./ai/client";
import { musicEntrypoint } from "./entrypoints/music";
import {
  createMusicPricingMiddleware,
  MUSIC_PATH,
} from "./payments/musicPricing";

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
    facilitatorUrl:
      (process.env.FACILITATOR_URL as any) ??
      "https://facilitator.daydreams.systems",
    payTo:
      (process.env.PAY_TO as `0x${string}`) ??
      "0xb308ed39d67D0d4BAe5BC2FAEF60c66BBb6AE429",
    network: (process.env.NETWORK as any) ?? "base-sepolia",
    defaultPrice: process.env.DEFAULT_PRICE,
  },
};

const axClient = getAxClient();

const brainstormingFlow = flow<{ topic: string }>()
  .node(
    "summarizer",
    'topic:string -> summary:string "Two concise sentences describing the topic."'
  )
  .node(
    "ideaGenerator",
    'summary:string -> ideas:string[] "Three short follow-up ideas."'
  )
  .execute("summarizer", (state) => ({
    topic: state.topic,
  }))
  .execute("ideaGenerator", (state) => ({
    summary: state.summarizerResult.summary as string,
  }))
  .returns((state) => ({
    summary: state.summarizerResult.summary as string,
    ideas: Array.isArray(state.ideaGeneratorResult.ideas)
      ? (state.ideaGeneratorResult.ideas as string[])
      : [],
  }));

const agentApp = createAgentApp(
  {
    name: "ax-flow-agent",
    version: "0.0.1",
    description:
      "Demonstrates driving an AxFlow pipeline through createAxLLMClient.",
  },
  {
    config: configOverrides,
  }
);

const { app, addEntrypoint, config } = agentApp;

const paymentsConfig = config.payments;
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

addEntrypoint({
  key: "brainstorm",
  description:
    "Summarise a topic and suggest three follow-up ideas using AxFlow.",
  input: z.object({
    topic: z
      .string()
      .min(1, { message: "Provide a topic to analyse." })
      .describe("High level topic to explore."),
  }),
  price: "0.003",
  output: z.object({
    summary: z.string(),
    ideas: z.array(z.string()),
  }),
  async handler(ctx) {
    try {
      const topic = String(ctx.input.topic ?? "").trim();
      if (!topic) {
        throw new Error("Topic cannot be empty.");
      }

      const llm = axClient.ax;
      if (!llm) {
        const fallbackSummary = `AxFlow is not configured. Pretend summary for "${topic}".`;
        return {
          output: {
            summary: fallbackSummary,
            ideas: [
              "Set OPENAI_API_KEY to enable the Ax integration.",
              "Keep DEFAULT_PRICE small while testing.",
              "Ensure PRIVATE_KEY/PAY_TO are correct.",
            ],
          },
          model: "axllm-fallback",
        };
      }

      const result = await brainstormingFlow.forward(llm, { topic });
      const usageEntry = brainstormingFlow.getUsage().at(-1);
      brainstormingFlow.resetUsage();

      return {
        output: {
          summary: result.summary ?? "",
          ideas: Array.isArray(result.ideas) ? result.ideas : [],
        },
        model: usageEntry?.model,
      };
    } catch (error) {
      console.error("[agent] brainstorm handler failed:", error);
      throw error;
    }
  },
});

addEntrypoint(musicEntrypoint);

export { app };
