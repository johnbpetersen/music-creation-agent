import { env } from "../config/env";

type GenerateInput = {
  prompt: string;
  seconds: number;
};

const ELEVENLABS_API_URL =
  env.ELEVENLABS_API_URL ?? "https://api.elevenlabs.io/v1/music";

const ELEVENLABS_PLACEHOLDER_URL =
  env.ELEVENLABS_PLACEHOLDER_URL ??
  "https://example.com/placeholder-track.mp3";

const WANTS_REAL_ELEVENLABS = env.USE_REAL_ELEVENLABS === "true";
const IS_TEST_ENV =
  env.NODE_ENV === "test" || process.env.NODE_ENV === "test";
const USE_REAL_ELEVENLABS = WANTS_REAL_ELEVENLABS && !IS_TEST_ENV;
const MAX_ELEVENLABS_SECONDS = env.ELEVENLABS_MAX_SECONDS;
const INSTRUMENTAL_ONLY = env.ELEVENLABS_INSTRUMENTAL_ONLY === "true";

function getApiKey() {
  return env.ELEVENLABS_API_KEY?.trim();
}

export function getElevenLabsStatus() {
  const apiKey = getApiKey();
  const mode = USE_REAL_ELEVENLABS ? "live" : "placeholder";
  const ready = !USE_REAL_ELEVENLABS || !!apiKey;
  let message: string | undefined;

  if (WANTS_REAL_ELEVENLABS && IS_TEST_ENV) {
    message = "Live ElevenLabs calls are disabled while NODE_ENV=test.";
  } else if (USE_REAL_ELEVENLABS && !apiKey) {
    message =
      "ELEVENLABS_API_KEY missing while USE_REAL_ELEVENLABS=true";
  }

  return {
    mode,
    ready,
    requiresApiKey: WANTS_REAL_ELEVENLABS,
    maxSeconds: MAX_ELEVENLABS_SECONDS,
    message,
  };
}

export function isElevenLabsLive() {
  return USE_REAL_ELEVENLABS && !!getApiKey();
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

  try {
    const response = await fetch(ELEVENLABS_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        prompt: enforcedPrompt,
        music_length_ms: Math.max(1000, seconds * 1000),
        instrumental: INSTRUMENTAL_ONLY,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(
        `ElevenLabs request failed: ${response.status} ${response.statusText} ${errorBody}`
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64Audio = Buffer.from(arrayBuffer).toString("base64");
    const dataUrl = `data:audio/mpeg;base64,${base64Audio}`;

    console.info("[music] elevenlabs success", {
      seconds,
      instrumental: INSTRUMENTAL_ONLY,
      urlPreview: `${dataUrl.slice(0, 40)}...`,
    });

    return {
      trackUrl: dataUrl,
      provider: "elevenlabs",
    };
  } catch (error) {
    console.error("[music] ElevenLabs request failed:", error);
    return {
      trackUrl: ELEVENLABS_PLACEHOLDER_URL,
      provider: "elevenlabs-placeholder",
    };
  }
}
