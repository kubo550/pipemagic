import { NextRequest } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import { runWorkflow, type WorkflowSink } from "@/lib/workflows/run";
import { log } from "@/lib/observability/logger";

// Streaming chat endpoint (PRD §5.3/§5.4): in-process engine, Node runtime,
// short-lived streaming request. Emits newline-delimited JSON events so the
// client can render progress while the agent loop runs.
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  let message: string;
  try {
    const body = (await req.json()) as { message?: unknown };
    if (typeof body.message !== "string" || !body.message.trim()) {
      return new Response("Bad request", { status: 400 });
    }
    message = body.message;
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));

      const sink: WorkflowSink = {
        status: (m) => send({ type: "status", message: m }),
        final: (t) => send({ type: "final", text: t }),
        error: (m) => send({ type: "error", message: m }),
      };

      try {
        await runWorkflow(userId, message, { sink });
      } catch (err) {
        log.error("chat workflow failed", { err: String(err) });
        send({ type: "error", message: "Something went wrong on this run." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
