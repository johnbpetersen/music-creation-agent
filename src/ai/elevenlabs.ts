import { env } from "../config/env";

type GenerateInput = {
  prompt: string;
  seconds: number;
};

const ELEVENLABS_API_URL =
  env.ELEVENLABS_API_URL ??
  "https://api.elevenlabs.io/v1/music/generate";

const ELEVENLABS_PLACEHOLDER_URL =
  env.ELEVENLABS_PLACEHOLDER_URL ??
  "https://example.com/placeholder-track.mp3";

const USE_REAL_ELEVENLABS = env.USE_REAL_ELEVENLABS === "true";

function getApiKey() {
  return env.ELEVENLABS_API_KEY?.trim();
}

export async function generateMusicTrack({
  prompt,
  seconds,
}: GenerateInput): Promise<{ trackUrl: string; provider: string }> {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) {
    throw new Error("Refined prompt cannot be empty.");
  }

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

  try {
    const response = await fetch(ELEVENLABS_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        prompt: trimmedPrompt,
        duration_seconds: seconds,
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

    return {
      trackUrl,
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
