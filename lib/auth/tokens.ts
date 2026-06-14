import { prisma } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/auth/crypto";

const PROVIDER = "google";

export interface GoogleTokenInput {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string;
}

export interface DecryptedTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string;
}

/**
 * Persist Google OAuth tokens for a user. Plaintext is encrypted here and never
 * crosses the DB boundary. Upsert keyed by (userId, provider) so a re-consent
 * replaces the existing row.
 */
export async function saveGoogleTokens(
  userId: string,
  input: GoogleTokenInput,
): Promise<void> {
  const data = {
    accessTokenEnc: encrypt(input.accessToken),
    refreshTokenEnc: encrypt(input.refreshToken),
    expiresAt: input.expiresAt,
    scope: input.scope,
  };
  await prisma.oAuthToken.upsert({
    where: { userId_provider: { userId, provider: PROVIDER } },
    create: { userId, provider: PROVIDER, ...data },
    update: data,
  });
}

/**
 * Update only the access token + expiry after a silent refresh, preserving the
 * existing refresh token (Google does not always return a new one).
 */
export async function updateGoogleAccessToken(
  userId: string,
  accessToken: string,
  expiresAt: Date,
): Promise<void> {
  await prisma.oAuthToken.update({
    where: { userId_provider: { userId, provider: PROVIDER } },
    data: { accessTokenEnc: encrypt(accessToken), expiresAt },
  });
}

/** Load + decrypt a user's Google tokens, or null if they haven't connected. */
export async function getDecryptedGoogleTokens(
  userId: string,
): Promise<DecryptedTokens | null> {
  const row = await prisma.oAuthToken.findUnique({
    where: { userId_provider: { userId, provider: PROVIDER } },
  });
  if (!row) return null;
  return {
    accessToken: decrypt(row.accessTokenEnc),
    refreshToken: decrypt(row.refreshTokenEnc),
    expiresAt: row.expiresAt,
    scope: row.scope,
  };
}
