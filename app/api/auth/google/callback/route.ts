import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCode } from "@/lib/integrations/google";
import { prisma } from "@/lib/db";
import { saveGoogleTokens } from "@/lib/auth/tokens";
import { createSession } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { log } from "@/lib/observability/logger";

export const runtime = "nodejs";

function redirectHome(error?: string) {
  const url = new URL("/", env.APP_URL);
  if (error) url.searchParams.set("error", error);
  return NextResponse.redirect(url);
}

// OAuth redirect target: validate CSRF state, exchange the code, upsert the
// user, persist encrypted tokens, and open a session. No code/token/PII is
// ever logged or placed in a redirect URL.
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  const store = await cookies();
  const expectedState = store.get("pm_oauth_state")?.value;
  store.delete("pm_oauth_state");

  if (searchParams.get("error")) {
    return redirectHome("denied");
  }

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  if (!code || !state || !expectedState || state !== expectedState) {
    log.warn("oauth callback rejected: missing code or state mismatch");
    return redirectHome("state");
  }

  try {
    const { identity, tokens } = await exchangeCode(code);

    const user = await prisma.user.upsert({
      where: { googleSub: identity.googleSub },
      create: {
        googleSub: identity.googleSub,
        email: identity.email,
        name: identity.name,
      },
      update: { email: identity.email, name: identity.name },
    });

    await saveGoogleTokens(user.id, tokens);
    await createSession(user.id);

    log.info("user connected google", { userId: user.id });
    return redirectHome();
  } catch (err) {
    log.error("oauth callback failed", { err: String(err) });
    return redirectHome("oauth");
  }
}
