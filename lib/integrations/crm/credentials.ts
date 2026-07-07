import { prisma } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/auth/crypto";

/**
 * Per-user CRM API-token storage. The user pastes their own token (decision:
 * §8 of the CRM-pipeline PRD); we keep it encrypted at rest in the existing
 * `OAuthToken` table, reusing the AES-256-GCM helpers — no new migration.
 *
 * An API token has no refresh/expiry, so we store a placeholder encrypted
 * refresh token and a far-future expiry, and mark `scope = "api_token"`. The
 * plaintext token never crosses the DB boundary and is never logged.
 */

const API_TOKEN_SCOPE = "api_token";
// API tokens don't expire; use a sentinel so the (non-null) column is satisfied.
const NO_EXPIRY = new Date("2999-01-01T00:00:00.000Z");

/** Persist (or replace) a user's API token for a CRM provider. */
export async function saveCrmApiToken(
  userId: string,
  provider: string,
  apiToken: string,
): Promise<void> {
  const data = {
    accessTokenEnc: encrypt(apiToken),
    refreshTokenEnc: encrypt(""),
    expiresAt: NO_EXPIRY,
    scope: API_TOKEN_SCOPE,
  };
  await prisma.oAuthToken.upsert({
    where: { userId_provider: { userId, provider } },
    create: { userId, provider, ...data },
    update: data,
  });
}

/** Load + decrypt a user's CRM API token, or null if they haven't connected. */
export async function getCrmApiToken(
  userId: string,
  provider: string,
): Promise<string | null> {
  const row = await prisma.oAuthToken.findUnique({
    where: { userId_provider: { userId, provider } },
  });
  if (!row) return null;
  return decrypt(row.accessTokenEnc);
}

/** Whether a user has a stored token for a CRM provider (no decrypt needed). */
export async function hasCrmConnection(
  userId: string,
  provider: string,
): Promise<boolean> {
  const row = await prisma.oAuthToken.findUnique({
    where: { userId_provider: { userId, provider } },
    select: { id: true },
  });
  return row !== null;
}

/** Remove a user's stored token for a CRM provider. */
export async function deleteCrmApiToken(
  userId: string,
  provider: string,
): Promise<void> {
  await prisma.oAuthToken.deleteMany({ where: { userId, provider } });
}
