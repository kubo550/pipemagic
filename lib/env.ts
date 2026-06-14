import { z } from "zod";

/**
 * Validated, server-only environment access. Fails fast at boot if a required
 * variable is missing or malformed, so we never discover a misconfiguration
 * deep inside the OAuth flow. Import `env` anywhere on the server.
 */
const schema = z.object({
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url(),

  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string().url(),

  // base64-encoded 32 raw bytes → AES-256 key.
  TOKEN_ENC_KEY: z.string().min(1),
  // base64-encoded secret for signing session JWTs.
  SESSION_SECRET: z.string().min(1),

  APP_URL: z.string().url().default("http://localhost:3000"),

  // --- LLM ---
  // Provider is selected here, not via scattered if-checks. Model IDs live in
  // env (not hardcoded) so they can be bumped without code changes (PRD §6).
  LLM_PROVIDER: z.enum(["anthropic", "openai"]).default("anthropic"),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-6"),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),

  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

function load() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // Surface which keys are wrong without printing their (potentially secret) values.
    const issues = parsed.error.issues
      .map((i) => i.path.join("."))
      .join(", ");
    throw new Error(`Invalid or missing environment variables: ${issues}`);
  }
  return parsed.data;
}

export const env = load();
