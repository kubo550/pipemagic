/**
 * Populate process.env with valid-but-fake values before any module that imports
 * `@/lib/env` is loaded. This lets tests import modules that transitively reach
 * env.ts (e.g. the provider factory) without the fail-fast validator throwing.
 * No real credentials and no network — adapters in tests use injected clients.
 */
const FAKE_ENV: Record<string, string> = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/test",
  DIRECT_URL: "postgresql://user:pass@localhost:5432/test",
  GOOGLE_CLIENT_ID: "test-client-id",
  GOOGLE_CLIENT_SECRET: "test-client-secret",
  GOOGLE_REDIRECT_URI: "http://localhost:3000/api/auth/google/callback",
  TOKEN_ENC_KEY: Buffer.alloc(32, 1).toString("base64"),
  SESSION_SECRET: "test-session-secret",
  APP_URL: "http://localhost:3000",
  LLM_PROVIDER: "anthropic",
  ANTHROPIC_API_KEY: "test-anthropic-key",
  OPENAI_API_KEY: "test-openai-key",
  NODE_ENV: "test",
};

for (const [k, v] of Object.entries(FAKE_ENV)) {
  if (process.env[k] === undefined) process.env[k] = v;
}
