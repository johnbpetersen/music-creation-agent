import { flow } from "@ax-llm/ax";
import { getAxClient } from "./client";
import { env } from "../config/env";

const USE_REAL_LLM = env.USE_REAL_LLM === "true";

type RefineInput = {
  prompt: string;
  seconds: number;
};

const refineFlow = flow<RefineInput>()
  .node(
    "refiner",
    'prompt:string, seconds:number -> refined:string "Rewrite the prompt into a concise music description tailored to the requested duration."'
  )
  .execute("refiner", (state) => ({
    prompt: state.prompt,
    seconds: state.seconds,
  }))
  .returns((state) => ({
    refined: String(state.refinerResult.refined ?? ""),
  }));

function fallbackRefine(prompt: string, seconds: number) {
  const trimmed = prompt.trim();
  return `${trimmed} | duration:${seconds}s | upbeat`;
}

export async function refinePrompt(prompt: string, seconds: number) {
  const trimmed = prompt.trim();
  if (!trimmed) throw new Error("Prompt cannot be empty.");

  const axClient = getAxClient();
  const llm = axClient.ax;

  if (!USE_REAL_LLM || !llm) {
    return {
      refinedPrompt: fallbackRefine(trimmed, seconds),
      model: "axllm-fallback",
    };
  }

  try {
    const result = await refineFlow.forward(llm, { prompt: trimmed, seconds });
    const usage = refineFlow.getUsage().at(-1);
    refineFlow.resetUsage();

    const refined = result.refined?.trim();
    if (!refined) {
      throw new Error("LLM returned empty refinement.");
    }

    return {
      refinedPrompt: refined,
      model: usage?.model,
    };
  } catch (error) {
    console.warn("[ai] refinePrompt falling back after error:", error);
    return {
      refinedPrompt: fallbackRefine(trimmed, seconds),
      model: "axllm-fallback",
    };
  }
}
