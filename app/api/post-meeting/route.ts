import { NextRequest } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import { draftFollowUp } from "@/lib/workflows/post-meeting";
import { log } from "@/lib/observability/logger";

export const runtime = "nodejs";

// Post-meeting wedge: transcript in → structured follow-up out. Single JSON
// response (the draft is short and non-streaming is fine here).
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  let transcript: string;
  try {
    const body = (await req.json()) as { transcript?: unknown };
    if (typeof body.transcript !== "string" || body.transcript.trim().length < 20) {
      return new Response("Transcript too short", { status: 400 });
    }
    transcript = body.transcript.slice(0, 100_000);
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  try {
    const followUp = await draftFollowUp(userId, transcript);
    return Response.json(followUp);
  } catch (err) {
    log.error("post-meeting failed", { err: String(err) });
    return new Response("Could not generate a follow-up.", { status: 500 });
  }
}
