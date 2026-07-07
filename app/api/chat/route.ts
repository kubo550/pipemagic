import { NextRequest } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import {
  runWorkflow,
  resumeWorkflow,
  type WorkflowSink,
  type WorkflowOutcome,
} from "@/lib/workflows/run";
import { suggestReplies } from "@/lib/workflows/suggest-replies";
import { conversationsRepository } from "@/lib/context/repositories/conversations";
import type { AgentMessage } from "@/lib/llm/types";
import { log } from "@/lib/observability/logger";

// Streaming chat endpoint (PRD §5.3/§5.4): in-process engine, Node runtime,
// short-lived streaming request. Emits newline-delimited JSON events so the
// client can render progress while the agent loop runs. Handles both a fresh
// turn and a resume-after-approval (body.resume).
export const runtime = "nodejs";

interface ResumeInput {
  messages: AgentMessage[];
  approved: boolean;
}

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  let message = "";
  let history: { role: "user" | "assistant"; text: string }[] = [];
  let eventId: string | undefined;
  let conversationId: string | undefined;
  let resume: ResumeInput | undefined;
  try {
    const body = (await req.json()) as {
      message?: unknown;
      history?: unknown;
      eventId?: unknown;
      conversationId?: unknown;
      resume?: unknown;
    };

    if (typeof body.conversationId === "string" && body.conversationId) {
      conversationId = body.conversationId;
    }

    // Resume path: the client sends back the paused messages + a decision.
    if (
      body.resume &&
      typeof body.resume === "object" &&
      Array.isArray((body.resume as { messages?: unknown }).messages) &&
      typeof (body.resume as { approved?: unknown }).approved === "boolean"
    ) {
      const r = body.resume as { messages: AgentMessage[]; approved: boolean };
      resume = { messages: r.messages, approved: r.approved };
    } else {
      // Fresh turn: a message is required.
      if (typeof body.message !== "string" || !body.message.trim()) {
        return new Response("Bad request", { status: 400 });
      }
      message = body.message;
      if (Array.isArray(body.history)) {
        history = body.history
          .filter(
            (t): t is { role: "user" | "assistant"; text: string } =>
              !!t &&
              typeof t === "object" &&
              ((t as { role: unknown }).role === "user" ||
                (t as { role: unknown }).role === "assistant") &&
              typeof (t as { text?: unknown }).text === "string",
          )
          .slice(-8);
      }
      if (typeof body.eventId === "string" && body.eventId) eventId = body.eventId;
    }
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));

      const convos = conversationsRepository(prisma);
      let convoId: string | null = conversationId ?? null;

      // Fresh turn: persist the user message up front and create the thread if
      // needed. Resume carries no new user message.
      if (!resume) {
        try {
          const ensured = await convos.ensure(userId, convoId, message);
          convoId = ensured.id;
          send({ type: "conversation", id: ensured.id, title: ensured.title });
          await convos.appendMessage(convoId, "user", message);
        } catch (err) {
          log.warn("persist user message failed", { err: String(err) });
        }
      }

      let finalText = "";
      const sink: WorkflowSink = {
        status: (m) => send({ type: "status", message: m }),
        final: (t) => {
          finalText = t;
          send({ type: "final", text: t });
        },
        error: (m) => send({ type: "error", message: m }),
      };

      try {
        const outcome: WorkflowOutcome = resume
          ? await resumeWorkflow(userId, resume, { sink })
          : await runWorkflow(userId, message, {
              sink,
              history,
              context: eventId ? { eventId } : undefined,
            });

        // Paused for approval: hand the pending call + the state back to the
        // client so it can confirm and resume.
        if (
          outcome.status === "awaiting_approval" &&
          outcome.pendingApproval &&
          outcome.messages
        ) {
          send({
            type: "approval",
            tool: outcome.pendingApproval.toolName,
            input: outcome.pendingApproval.input,
            preamble: outcome.text,
            messages: outcome.messages,
          });
        }

        // Persist the assistant turn on a real answer (best-effort).
        if (convoId && finalText.trim()) {
          try {
            await convos.appendMessage(convoId, "assistant", finalText);
          } catch (err) {
            log.warn("persist assistant message failed", { err: String(err) });
          }
        }

        // Quick-reply chips after a real answer. Best-effort.
        if (finalText.trim()) {
          try {
            const items = await suggestReplies({
              question: message || "(continued)",
              answer: finalText,
            });
            if (items.length) send({ type: "suggestions", items });
          } catch (err) {
            log.warn("suggest replies failed", { err: String(err) });
          }
        }
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
