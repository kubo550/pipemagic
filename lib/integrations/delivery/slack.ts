import { prisma } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/auth/crypto";

/**
 * Slack delivery via an incoming webhook (PRD §5 delivery). Keyless from the
 * user's side: they paste a webhook URL (Slack → Apps → Incoming Webhooks),
 * we store it encrypted and POST `{ text }` to it. No OAuth app needed.
 *
 * Reuses the encrypted `OAuthToken` table (provider "slack_webhook") the same
 * way the CRM token does — no new migration.
 */

export const PROVIDER = "slack_webhook";
const NO_EXPIRY = new Date("2999-01-01T00:00:00.000Z");
const TIMEOUT_MS = 10_000;

// Slack incoming webhooks always live here — a cheap guard against pasting a
// random URL (and a soft SSRF guard, since the host is fixed).
function isSlackWebhookUrl(raw: string): boolean {
  try {
    return new URL(raw).host === "hooks.slack.com";
  } catch {
    return false;
  }
}

export async function saveSlackWebhook(userId: string, url: string): Promise<void> {
  const data = {
    accessTokenEnc: encrypt(url),
    refreshTokenEnc: encrypt(""),
    expiresAt: NO_EXPIRY,
    scope: "webhook",
  };
  await prisma.oAuthToken.upsert({
    where: { userId_provider: { userId, provider: PROVIDER } },
    create: { userId, provider: PROVIDER, ...data },
    update: data,
  });
}

export async function getSlackWebhook(userId: string): Promise<string | null> {
  const row = await prisma.oAuthToken.findUnique({
    where: { userId_provider: { userId, provider: PROVIDER } },
  });
  return row ? decrypt(row.accessTokenEnc) : null;
}

export async function hasSlackWebhook(userId: string): Promise<boolean> {
  const row = await prisma.oAuthToken.findUnique({
    where: { userId_provider: { userId, provider: PROVIDER } },
    select: { id: true },
  });
  return row !== null;
}

export async function deleteSlackWebhook(userId: string): Promise<void> {
  await prisma.oAuthToken.deleteMany({ where: { userId, provider: PROVIDER } });
}

/** POST a message to a Slack incoming webhook. Throws on a non-2xx response. */
export async function postToSlack(url: string, text: string): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(`Slack webhook failed: HTTP ${res.status}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Validate a webhook URL before storing it: check the host, then send a small
 * confirmation message (which also doubles as a "you're connected" ping).
 */
export async function verifySlackWebhook(url: string): Promise<boolean> {
  if (!isSlackWebhookUrl(url)) return false;
  try {
    await postToSlack(url, "✅ PipeMagic connected — scheduled briefs will arrive here.");
    return true;
  } catch {
    return false;
  }
}
