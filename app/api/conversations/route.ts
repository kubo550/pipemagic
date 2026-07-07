import { NextRequest } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { conversationsRepository } from "@/lib/context/repositories/conversations";

// Read side of saved chats. `GET /api/conversations` lists recent threads;
// `GET /api/conversations?id=<id>` returns one thread's messages. Both are
// scoped to the current user.
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const convos = conversationsRepository(prisma);
  const id = req.nextUrl.searchParams.get("id");

  if (id) {
    const convo = await convos.getWithMessages(userId, id);
    if (!convo) return new Response("Not found", { status: 404 });
    return Response.json(convo);
  }

  const conversations = await convos.listRecent(userId);
  return Response.json({ conversations });
}
