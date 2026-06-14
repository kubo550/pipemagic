import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth/session";
import { env } from "@/lib/env";

export const runtime = "nodejs";

export async function GET() {
  await destroySession();
  return NextResponse.redirect(new URL("/", env.APP_URL));
}
