import { flow } from "@ax-llm/ax";
import { getAxClient } from "./client";
import { env } from "../config/env";
import { isOpenRouterEnabled, refineWithOpenRouter } from "./openrouter";

const USE_REAL_LLM = env.USE_REAL_LLM === "true";
const INSTRUMENTAL_ONLY = env.ELEVENLABS_INSTRUMENTAL_ONLY === "true";

type RefineInput = {
  prompt: string;
  seconds: number;
  instrumental: boolean;
};

const refineFlow = flow<RefineInput>()
  .node(
    "refiner",
    'prompt:string, seconds:number, instrumental:boolean -> refined:string "Rewrite the prompt into a concise music description tailored to the requested duration. If instrumental is true, explicitly require an instrumental track with no vocals or lyrics."'
  )
  .execute("refiner", (state) => ({
    prompt: state.prompt,
    seconds: state.seconds,
    instrumental: state.instrumental,
  }))
  .returns((state) => ({
    refined: String(state.refinerResult.refined ?? ""),
  }));

function ensureInstrumentalLine(text: string) {
  if (!INSTRUMENTAL_ONLY) return text.trim();

  const normalized = text.toLowerCase();
  if (
    normalized.includes("instrumental") ||
    normalized.includes("no vocals") ||
    normalized.includes("no lyrics")
  ) {
    return text.trim();
  }

  return `${text.trim()} Instrumental only; no vocals or lyrics.`;
}

function fallbackRefine(prompt: string, seconds: number, instrumental: boolean) {
  const trimmed = prompt.trim();
  const safePrompt = trimmed.length > 0 ? trimmed : "original idea";
  const segments = [
    safePrompt,
    `Run time should land around ${seconds} seconds with a clear intro, build, peak, and resolved ending.`,
    "Keep the arrangement cohesive so the full duration feels intentional.",
  ];

  if (instrumental) {
    segments.push("Instrumental only; no vocals or lyrics.");
  }

  segments.push("Add subtle transitions so the energy evolves without feeling repetitive.");

  return segments.join(" ");
}

export async function refinePrompt(prompt: string, seconds: number) {
  const trimmed = prompt.trim();
  if (!trimmed) throw new Error("Prompt cannot be empty.");

  const axClient = getAxClient();
  const llm = axClient.ax;

  if (!USE_REAL_LLM || !llm) {
    return {
      refinedPrompt: ensureInstrumentalLine(
        fallbackRefine(trimmed, seconds, INSTRUMENTAL_ONLY)
      ),
      model: "axllm-fallback",
    };
  }

  try {
    const result = await refineFlow.forward(llm, {
      prompt: trimmed,
      seconds,
      instrumental: INSTRUMENTAL_ONLY,
    });
    const usage = refineFlow.getUsage().at(-1);
    refineFlow.resetUsage();

    let refined = result.refined?.trim();
    if (!refined) {
      throw new Error("LLM returned empty refinement.");
    }

    refined = ensureInstrumentalLine(refined);

    console.info("[ai] refined prompt", {
      seconds,
      original: trimmed,
      refined,
      model: usage?.model ?? "unknown",
    });

    return {
      refinedPrompt: refined,
      model: usage?.model,
    };
  } catch (error) {
    console.warn("[ai] refinePrompt Ax error", {
      seconds,
      promptPreview: trimmed.slice(0, 80),
      message: error instanceof Error ? error.message : String(error),
    });
    if (isOpenRouterEnabled()) {
      try {
        const { refinedPrompt, model } = await refineWithOpenRouter({
          prompt: trimmed,
          seconds,
          instrumental: INSTRUMENTAL_ONLY,
        });
        return {
          refinedPrompt: ensureInstrumentalLine(refinedPrompt),
          model,
        };
      } catch (openRouterError) {
        console.warn("[ai] OpenRouter refine failed, using static fallback", {
          seconds,
          promptPreview: trimmed.slice(0, 80),
          message:
            openRouterError instanceof Error
              ? openRouterError.message
              : String(openRouterError),
        });
      }
    }

    return {
      refinedPrompt: ensureInstrumentalLine(
        fallbackRefine(trimmed, seconds, INSTRUMENTAL_ONLY)
      ),
      model: "axllm-fallback",
    };
  }
}
