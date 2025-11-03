import { z } from "zod";

const addressRegex = /^0x[a-fA-F0-9]{40}$/;
const privateKeyRegex = /^0x[a-fA-F0-9]{64}$/;

export const EnvSchema = z.object({
  NODE_ENV: z.string().optional(),
  PORT: z.coerce.number().int().positive().default(8787),
  API_BASE_URL: z
    .string()
    .trim()
    .url()
    .optional(),
  FACILITATOR_URL: z
    .string()
    .trim()
    .url()
    .default("https://facilitator.daydreams.systems"),
  PAY_TO: z
    .string()
    .trim()
    .regex(addressRegex, "PAY_TO must be a 0x-prefixed address")
    .optional(),
  PRIVATE_KEY: z
    .string()
    .trim()
    .regex(privateKeyRegex, "PRIVATE_KEY must be a 64-byte hex string")
    .optional(),
  NETWORK: z.enum(["base", "base-sepolia"]).default("base-sepolia"),
  DEFAULT_PRICE: z
    .string()
    .trim()
    .optional(),
  USE_REAL_LLM: z.enum(["true", "false"]).optional(),
  USE_REAL_ELEVENLABS: z.enum(["true", "false"]).optional(),
  ELEVENLABS_API_URL: z.string().trim().optional(),
  ELEVENLABS_PLACEHOLDER_URL: z.string().trim().optional(),
  ELEVENLABS_API_KEY: z.string().trim().optional(),
  ELEVENLABS_MODEL_ID: z.string().trim().optional(),
  ELEVENLABS_MAX_SECONDS: z
    .coerce.number()
    .int()
    .positive()
    .optional(),

  // x402-specific configuration
  X402_CHAIN: z.enum(["base", "base-sepolia"]).default("base-sepolia"),
  X402_CHAIN_ID: z.coerce.number().int().optional(),
  X402_TOKEN_ADDRESS: z
    .string()
    .trim()
    .regex(addressRegex, "X402_TOKEN_ADDRESS must be a 0x-prefixed address")
    .optional(),
  BASE_MAINNET_RPC_URL: z
    .string()
    .trim()
    .url()
    .optional()
    .default("https://mainnet.base.org"),
  BASE_SEPOLIA_RPC_URL: z
    .string()
    .trim()
    .url()
    .optional()
    .default("https://sepolia.base.org"),
});

const chainDefaults = {
  base: {
    chainId: 8453,
    tokenAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    rpcUrl: "https://mainnet.base.org",
  },
  "base-sepolia": {
    chainId: 84532,
    tokenAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    rpcUrl: "https://sepolia.base.org",
  },
} as const;

export function parseEnv(input: NodeJS.ProcessEnv) {
  const parsed = EnvSchema.parse(input);
  const selectedChain = chainDefaults[parsed.X402_CHAIN];

  return {
    ...parsed,
    X402_CHAIN_ID: parsed.X402_CHAIN_ID ?? selectedChain.chainId,
    X402_TOKEN_ADDRESS: parsed.X402_TOKEN_ADDRESS ?? selectedChain.tokenAddress,
    X402_RPC_URL:
      parsed.X402_CHAIN === "base"
        ? parsed.BASE_MAINNET_RPC_URL ?? selectedChain.rpcUrl
        : parsed.BASE_SEPOLIA_RPC_URL ?? selectedChain.rpcUrl,
    ELEVENLABS_MAX_SECONDS: parsed.ELEVENLABS_MAX_SECONDS ?? 90,
  };
}

export const env = parseEnv(process.env);

export type AppEnv = ReturnType<typeof parseEnv>;
