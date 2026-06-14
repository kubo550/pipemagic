import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { getAuthUrl } from "@/lib/integrations/google";
import { env } from "@/lib/env";

export const runtime = "nodejs";

// Begin the Google OAuth code flow: mint a CSRF `state`, stash it in a
// short-lived httpOnly cookie, and redirect to Google's consent screen.
export async function GET() {
  const state = randomBytes(16).toString("hex");

  const store = await cookies();
  store.set("pm_oauth_state", state, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes
  });

  return NextResponse.redirect(getAuthUrl(state));
}
