import { z } from "zod";
import { refinePrompt } from "../ai/refine";
import { generateMusicTrack } from "../ai/elevenlabs";

const musicInputSchema = z.object({
  prompt: z
    .string()
    .min(1, { message: "Prompt cannot be empty." })
    .describe("Creative guidance for the track."),
  seconds: z
    .number()
    .int()
    .min(5, { message: "seconds must be at least 5." })
    .max(120, { message: "seconds must be at most 120." }),
});

const musicOutputSchema = z.object({
  trackUrl: z.string().min(1),
});

type MusicDependencies = {
  refine: typeof refinePrompt;
  generate: typeof generateMusicTrack;
};

type HandlerCtx = {
  input: unknown;
  key: string;
  signal: AbortSignal;
  headers: Headers;
  runId: string;
};

export function createMusicEntrypoint(
  deps: Partial<MusicDependencies> = {}
) {
  const refine = deps.refine ?? refinePrompt;
  const generate = deps.generate ?? generateMusicTrack;

  return {
    key: "music",
    description:
      "Refine a music prompt with Ax LLM and render a track via ElevenLabs.",
    input: musicInputSchema,
    output: musicOutputSchema,
    async handler(ctx: HandlerCtx) {
      const parseResult = musicInputSchema.safeParse(ctx.input);
      if (!parseResult.success) {
        const issue = parseResult.error.issues[0];
        throw new Error(issue?.message ?? "Invalid music request.");
      }

      const prompt = parseResult.data.prompt.trim();
      const seconds = parseResult.data.seconds;

      if (!prompt) {
        throw new Error("Prompt cannot be empty.");
      }

      const { refinedPrompt, model } = await refine(prompt, seconds);
      const { trackUrl, provider } = await generate({
        prompt: refinedPrompt,
        seconds,
      });

      return {
        output: {
          trackUrl,
        },
        model: model ?? provider,
      };
    },
  };
}

export const musicEntrypoint = createMusicEntrypoint();

export { musicInputSchema, musicOutputSchema };
