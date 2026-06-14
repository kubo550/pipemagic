import { afterEach, expect, it, vi } from "vitest";

// getProvider() resolves the provider from env. resetModules forces env.ts to
// re-read process.env on each dynamic import. No network — only constructs the
// SDK client with a fake key from the test setup.
afterEach(() => {
  process.env.LLM_PROVIDER = "anthropic";
  vi.resetModules();
});

it("selects the Anthropic provider when LLM_PROVIDER=anthropic", async () => {
  process.env.LLM_PROVIDER = "anthropic";
  vi.resetModules();
  const { getProvider } = await import("@/lib/llm");
  expect(getProvider().name).toBe("anthropic");
});

it("selects the OpenAI provider when LLM_PROVIDER=openai", async () => {
  process.env.LLM_PROVIDER = "openai";
  vi.resetModules();
  const { getProvider } = await import("@/lib/llm");
  expect(getProvider().name).toBe("openai");
});
