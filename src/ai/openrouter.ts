import { env } from "../config/env";

type OpenRouterConfig = {
  apiKey: string;
  model: string;
  chatUrl: string;
};

function getConfig(): OpenRouterConfig | null {
  const apiKey = env.OPENROUTER_API_KEY?.trim();
  const model = env.OPENROUTER_MODEL?.trim();
  if (!apiKey || !model) return null;

  const base =
    env.OPENROUTER_BASE_URL?.trim().replace(/\/+$/, "") ??
    "https://openrouter.ai/api/v1";

  return {
    apiKey,
    model,
    chatUrl: `${base}/chat/completions`,
  };
}

export function isOpenRouterEnabled() {
  return getConfig() !== null;
}

type RefineArgs = {
  prompt: string;
  seconds: number;
  instrumental: boolean;
};

export async function refineWithOpenRouter({
  prompt,
  seconds,
  instrumental,
}: RefineArgs) {
  const config = getConfig();
  if (!config) {
    throw new Error("OpenRouter not configured");
  }
  const { apiKey, model, chatUrl } = config;

  const systemPrompt = [
    "You are a music prompt refinement assistant.",
    "Rewrite the provided user prompt into a concise, vivid description for a music generation model.",
    `The target duration is approximately ${seconds} seconds.`,
    instrumental
      ? "Ensure the result explicitly requires an instrumental track with no vocals."
      : "Vocals are allowed unless the user prohibits them.",
    "Focus on mood, instrumentation, energy, and structure. Return only the refined prompt.",
  ].join(" ");

  const body = {
    model,
    temperature: 0,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Original prompt: ${prompt.trim()}`,
      },
    ],
  };

  const response = await fetch(chatUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      "x-title": "Music Creation Agent",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(
      `OpenRouter request failed: ${response.status} ${response.statusText} ${errorBody}`
    );
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { model?: string };
  };

  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("OpenRouter returned empty content");
  }

  console.info(
    "[ai] openrouter refined prompt",
    {
      model,
      seconds,
      preview: content.slice(0, 120),
    }
  );

  return {
    refinedPrompt: content,
    model,
  };
}
