import { google } from "googleapis";
import type { calendar_v3 } from "googleapis";
import { env } from "@/lib/env";
import { log } from "@/lib/observability/logger";
import {
  getDecryptedGoogleTokens,
  updateGoogleAccessToken,
  type GoogleTokenInput,
} from "@/lib/auth/tokens";

/**
 * Google OAuth (own code flow) + Calendar read. The engine stays host-agnostic:
 * route handlers call into here, never the other way round.
 */

// Minimal scopes for Phase 1 (PRD §8). Gmail / sensitive scopes wait until we
// go through Google OAuth verification.
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.readonly",
];

function oauthClient() {
  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI,
  );
}

/** Build the consent URL. offline + consent guarantees a refresh token. */
export function getAuthUrl(state: string): string {
  return oauthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_SCOPES,
    state,
    include_granted_scopes: true,
  });
}

export interface GoogleIdentity {
  googleSub: string;
  email: string;
  name: string | null;
}

export interface ExchangeResult {
  identity: GoogleIdentity;
  tokens: GoogleTokenInput;
}

/** Exchange an authorization code for tokens + verified identity. */
export async function exchangeCode(code: string): Promise<ExchangeResult> {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);

  if (!tokens.access_token || !tokens.refresh_token) {
    // Missing refresh_token usually means a prior grant without prompt=consent.
    throw new Error("Google did not return a complete token set.");
  }

  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token ?? "",
    audience: env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) {
    throw new Error("Google id_token missing required claims.");
  }

  return {
    identity: {
      googleSub: payload.sub,
      email: payload.email,
      name: payload.name ?? null,
    },
    tokens: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(tokens.expiry_date ?? Date.now() + 3600_000),
      scope: tokens.scope ?? GOOGLE_SCOPES.join(" "),
    },
  };
}

/**
 * Build an authed Calendar client for a user. Sets stored credentials and
 * attaches a listener so any silently-refreshed access token is re-encrypted
 * and persisted (auto-refresh in the middle, PRD §5.1).
 */
async function getAuthedCalendar(
  userId: string,
): Promise<calendar_v3.Calendar | null> {
  const stored = await getDecryptedGoogleTokens(userId);
  if (!stored) return null;

  const client = oauthClient();
  client.setCredentials({
    access_token: stored.accessToken,
    refresh_token: stored.refreshToken,
    expiry_date: stored.expiresAt.getTime(),
    scope: stored.scope,
  });

  client.on("tokens", (fresh) => {
    if (fresh.access_token) {
      const expiresAt = new Date(fresh.expiry_date ?? Date.now() + 3600_000);
      updateGoogleAccessToken(userId, fresh.access_token, expiresAt).catch(
        (err) => log.error("failed to persist refreshed token", { err: String(err) }),
      );
      log.info("google access token refreshed", { userId });
    }
  });

  return google.calendar({ version: "v3", auth: client });
}

export interface UpcomingEvent {
  id: string;
  summary: string;
  start: string | null;
  end: string | null;
  attendeeCount: number;
  organizerDomain: string | null;
}

/**
 * List upcoming events from the primary calendar. Returns a slim shape — raw
 * Google payloads never leave this function, and nothing here is logged.
 */
export async function listUpcomingEvents(
  userId: string,
  { maxResults = 10 }: { maxResults?: number } = {},
): Promise<UpcomingEvent[]> {
  const calendar = await getAuthedCalendar(userId);
  if (!calendar) return [];

  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin: new Date().toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults,
  });

  return (res.data.items ?? []).map((e) => {
    const organizerEmail = e.organizer?.email ?? null;
    return {
      id: e.id ?? "",
      summary: e.summary ?? "(no title)",
      start: e.start?.dateTime ?? e.start?.date ?? null,
      end: e.end?.dateTime ?? e.end?.date ?? null,
      attendeeCount: e.attendees?.length ?? 0,
      organizerDomain: organizerEmail?.includes("@")
        ? organizerEmail.split("@")[1]
        : null,
    };
  });
}

export interface EventDetails extends UpcomingEvent {
  location: string | null;
  description: string | null;
  attendeeDomains: string[];
}

/** Fetch one event by id from the primary calendar. Slim, never logged. */
export async function getEventDetails(
  userId: string,
  eventId: string,
): Promise<EventDetails | null> {
  const calendar = await getAuthedCalendar(userId);
  if (!calendar) return null;

  const res = await calendar.events.get({ calendarId: "primary", eventId });
  const e = res.data;
  const organizerEmail = e.organizer?.email ?? null;
  const domains = new Set<string>();
  for (const a of e.attendees ?? []) {
    const at = a.email?.split("@")[1];
    if (at) domains.add(at);
  }

  return {
    id: e.id ?? eventId,
    summary: e.summary ?? "(no title)",
    start: e.start?.dateTime ?? e.start?.date ?? null,
    end: e.end?.dateTime ?? e.end?.date ?? null,
    attendeeCount: e.attendees?.length ?? 0,
    organizerDomain: organizerEmail?.includes("@")
      ? organizerEmail.split("@")[1]
      : null,
    location: e.location ?? null,
    description: e.description ?? null,
    attendeeDomains: [...domains],
  };
}
