import { env } from "../config/env";

type GenerateInput = {
  prompt: string;
  seconds: number;
};

const ELEVENLABS_API_URL =
  env.ELEVENLABS_API_URL ??
  "https://api.elevenlabs.io/v1/music/generate";

const ELEVENLABS_API_ROOT = (() => {
  try {
    const url = new URL(ELEVENLABS_API_URL);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "https://api.elevenlabs.io";
  }
})();

const ELEVENLABS_PLACEHOLDER_URL =
  env.ELEVENLABS_PLACEHOLDER_URL ??
  "https://example.com/placeholder-track.mp3";

const USE_REAL_ELEVENLABS = env.USE_REAL_ELEVENLABS === "true";
const ELEVENLABS_MODEL_ID = env.ELEVENLABS_MODEL_ID ?? "eleven_music_v1";
const MAX_ELEVENLABS_SECONDS = env.ELEVENLABS_MAX_SECONDS;
const INSTRUMENTAL_ONLY = env.ELEVENLABS_INSTRUMENTAL_ONLY === "true";

const FALLBACK_MODEL_CANDIDATES = [
  env.ELEVENLABS_MODEL_ID?.trim(),
  "eleven_multiverse_v2",
  "eleven_multiverse_v1",
  "eleven_multiverse",
  "eleven_music_v1",
].filter(
  (value): value is string =>
    typeof value === "string" && value.length > 0
);

function getApiKey() {
  return env.ELEVENLABS_API_KEY?.trim();
}

export function getElevenLabsStatus() {
  const wantsLive = USE_REAL_ELEVENLABS;
  const apiKey = getApiKey();

  return {
    mode: wantsLive ? "live" : "placeholder",
    ready: !wantsLive || !!apiKey,
    requiresApiKey: wantsLive,
    maxSeconds: MAX_ELEVENLABS_SECONDS,
    modelId: ELEVENLABS_MODEL_ID,
    message:
      wantsLive && !apiKey
        ? "ELEVENLABS_API_KEY missing while USE_REAL_ELEVENLABS=true"
        : undefined,
  };
}

export function isElevenLabsLive() {
  return USE_REAL_ELEVENLABS && !!getApiKey();
}

let cachedModelId: string | null =
  env.ELEVENLABS_MODEL_ID?.trim() ?? null;
let modelLookupPromise: Promise<string | null> | null = null;

async function discoverMusicModelId(apiKey: string): Promise<string | null> {
  const modelsUrl = `${ELEVENLABS_API_ROOT}/v1/models`;
  try {
    const response = await fetch(modelsUrl, {
      method: "GET",
      headers: {
        accept: "application/json",
        "xi-api-key": apiKey,
      },
    });

    if (!response.ok) {
      console.warn("[music] failed to fetch ElevenLabs models", {
        status: response.status,
        statusText: response.statusText,
      });
      return null;
    }

    const body = (await response.json()) as any;
    const models: any[] = Array.isArray(body)
      ? body
      : Array.isArray(body?.models)
        ? body.models
        : [];

    const normalize = (value: unknown) =>
      typeof value === "string"
        ? value.toLowerCase()
        : Array.isArray(value)
          ? value.map(normalize).join(" ")
          : "";

    const musicModel = models.find((entry) => {
      const type = normalize(entry?.type ?? entry?.category);
      const tags = normalize(entry?.tags ?? entry?.capabilities);
      return type.includes("music") || tags.includes("music");
    });

    if (musicModel) {
      const id =
        musicModel?.model_id ??
        musicModel?.id ??
        musicModel?.name ??
        null;
      if (typeof id === "string" && id.trim().length > 0) {
        console.info("[music] discovered ElevenLabs music model", {
          modelId: id,
        });
        return id;
      }
    }

    const fallbackModel = models.find((entry) => {
      const name = normalize(entry?.name);
      return name.includes("music") || name.includes("multiverse");
    });

    const fallbackId =
      typeof fallbackModel?.model_id === "string"
        ? fallbackModel.model_id
        : typeof fallbackModel?.id === "string"
          ? fallbackModel.id
          : typeof fallbackModel?.name === "string"
            ? fallbackModel.name
            : null;

    if (fallbackId) {
      console.info("[music] using fallback model from discovery", {
        modelId: fallbackId,
      });
      return fallbackId;
    }
  } catch (error) {
    console.warn("[music] model discovery failed", error);
  }

  return null;
}

async function resolveModelId(
  apiKey: string,
  forceRefresh = false
): Promise<string> {
  if (!forceRefresh && cachedModelId) {
    return cachedModelId;
  }

  if (!forceRefresh && modelLookupPromise) {
    const result = await modelLookupPromise;
    if (result) {
      cachedModelId = result;
      return result;
    }
  }

  const lookup = (async () => {
    const discovered = await discoverMusicModelId(apiKey);
    if (discovered) {
      cachedModelId = discovered;
      return discovered;
    }

    const fallback = FALLBACK_MODEL_CANDIDATES.find((candidate) => candidate);
    if (fallback) {
      cachedModelId = fallback;
      console.info("[music] using fallback ElevenLabs model", {
        modelId: fallback,
      });
      return fallback;
    }

    cachedModelId = "eleven_multiverse_v1";
    return cachedModelId;
  })();

  if (!forceRefresh) {
    modelLookupPromise = lookup
      .catch(() => null)
      .finally(() => {
        modelLookupPromise = null;
      });
    const result = await modelLookupPromise;
    return result ?? "eleven_multiverse_v1";
  }

  const result = await lookup;
  cachedModelId = result;
  return result;
}

function isInvalidModelError(error: unknown) {
  const message =
    error instanceof Error ? error.message : String(error);
  return message.includes("Invalid model id");
}

export async function generateMusicTrack({
  prompt,
  seconds,
}: GenerateInput): Promise<{ trackUrl: string; provider: string }> {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) {
    throw new Error("Refined prompt cannot be empty.");
  }

  const enforcedPrompt =
    INSTRUMENTAL_ONLY && !/instrumental|no vocals|no lyrics/i.test(trimmedPrompt)
      ? `${trimmedPrompt} Instrumental only; no vocals or lyrics.`
      : trimmedPrompt;

  if (!USE_REAL_ELEVENLABS) {
    return {
      trackUrl: ELEVENLABS_PLACEHOLDER_URL,
      provider: "elevenlabs-placeholder",
    };
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn(
      "[music] ELEVENLABS_API_KEY missing — using placeholder track URL."
    );
    return {
      trackUrl: ELEVENLABS_PLACEHOLDER_URL,
      provider: "elevenlabs-placeholder",
    };
  }

  if (seconds > MAX_ELEVENLABS_SECONDS) {
    throw new Error(
      `Requested duration ${seconds}s exceeds ElevenLabs limit of ${MAX_ELEVENLABS_SECONDS}s.`
    );
  }

  async function performRequest(modelId: string) {
    const response = await fetch(ELEVENLABS_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        prompt: enforcedPrompt,
        duration_seconds: seconds,
        model_id: modelId,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(
        `ElevenLabs request failed: ${response.status} ${response.statusText} ${errorBody}`
      );
    }

    const data = (await response.json()) as Record<string, any>;
    const trackUrl =
      data?.track?.url ??
      data?.track_url ??
      data?.audio_url ??
      data?.url ??
      (Array.isArray(data?.tracks) ? data.tracks[0]?.url : undefined);

    if (!trackUrl || typeof trackUrl !== "string") {
      throw new Error("Unable to locate track URL in ElevenLabs response.");
    }

    console.info("[music] elevenlabs success", {
      seconds,
      model: modelId,
      urlPreview: trackUrl.slice(0, 60),
    });

    cachedModelId = modelId;

    return {
      trackUrl,
      provider: "elevenlabs",
    };
  }

  try {
    let modelId = await resolveModelId(apiKey);
    try {
      return await performRequest(modelId);
    } catch (error) {
      if (isInvalidModelError(error)) {
        console.warn(
          "[music] ElevenLabs model invalid, attempting rediscovery",
          { modelId, error: error instanceof Error ? error.message : error }
        );
        cachedModelId = null;
        modelId = await resolveModelId(apiKey, true);
        return await performRequest(modelId);
      }
      throw error;
    }
  } catch (error) {
    console.error("[music] ElevenLabs request failed:", error);
    return {
      trackUrl: ELEVENLABS_PLACEHOLDER_URL,
      provider: "elevenlabs-placeholder",
    };
  }
}
