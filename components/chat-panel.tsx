"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  isError?: boolean;
}

interface ConversationRef {
  id: string;
  title: string;
}

interface SelectedEvent {
  id: string;
  title: string;
}

const MD_CLASS =
  "space-y-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:underline [&_strong]:font-semibold [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_code]:rounded [&_code]:bg-zinc-200/60 [&_code]:px-1 dark:[&_code]:bg-zinc-700/60";

export function ChatPanel({
  selectedEvent,
  onClearEvent,
}: {
  selectedEvent?: SelectedEvent | null;
  onClearEvent?: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationRef[]>([]);
  const [approval, setApproval] = useState<{
    tool: string;
    input: unknown;
    messages: unknown;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load recent chats on mount and restore the most recent so a reload doesn't
  // lose the conversation.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/conversations");
        if (!res.ok) return;
        const { conversations: list } = (await res.json()) as {
          conversations: ConversationRef[];
        };
        if (cancelled || !list?.length) return;
        setConversations(list);
        await loadConversation(list[0].id);
      } catch {
        /* offline / not signed in — start fresh */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadConversation(id: string) {
    if (busy) return;
    try {
      const res = await fetch(`/api/conversations?id=${encodeURIComponent(id)}`);
      if (!res.ok) return;
      const convo = (await res.json()) as {
        id: string;
        messages: { role: "user" | "assistant"; text: string }[];
      };
      setMessages(convo.messages.map((m) => ({ role: m.role, text: m.text })));
      setConversationId(convo.id);
      setSuggestions([]);
      scrollToEnd();
    } catch {
      /* ignore */
    }
  }

  function newChat() {
    if (busy) return;
    setMessages([]);
    setConversationId(null);
    setSuggestions([]);
    setInput("");
  }

  const suggestion = selectedEvent
    ? `Prepare me for "${selectedEvent.title}"`
    : "Prepare me for my next meeting.";

  function scrollToEnd() {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    });
  }

  // Read the NDJSON event stream and drive UI state. Shared by a fresh turn and
  // a resume-after-approval.
  async function consume(res: Response) {
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line) as {
          type: string;
          message?: string;
          text?: string;
          items?: string[];
          id?: string;
          title?: string;
          tool?: string;
          input?: unknown;
          preamble?: string;
          messages?: unknown;
        };
        if (event.type === "status") {
          setStatus(event.message ?? null);
        } else if (event.type === "conversation") {
          if (event.id) {
            setConversationId(event.id);
            const id = event.id;
            const title = event.title ?? "New chat";
            setConversations((cur) =>
              cur.some((c) => c.id === id) ? cur : [{ id, title }, ...cur],
            );
          }
        } else if (event.type === "final") {
          setMessages((m) => [...m, { role: "assistant", text: event.text ?? "" }]);
          setStatus(null);
        } else if (event.type === "suggestions") {
          setSuggestions(event.items ?? []);
        } else if (event.type === "approval") {
          if (event.preamble?.trim()) {
            const preamble = event.preamble;
            setMessages((m) => [...m, { role: "assistant", text: preamble }]);
          }
          setApproval({
            tool: event.tool ?? "",
            input: event.input,
            messages: event.messages,
          });
          setStatus(null);
        } else if (event.type === "error") {
          setMessages((m) => [
            ...m,
            { role: "assistant", text: event.message ?? "Error.", isError: true },
          ]);
          setStatus(null);
        }
        scrollToEnd();
      }
    }
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    const priorHistory = messages
      .filter((m) => !m.isError)
      .slice(-8)
      .map((m) => ({ role: m.role, text: m.text }));

    setMessages((m) => [...m, { role: "user", text: trimmed }]);
    setInput("");
    setBusy(true);
    setStatus("Thinking…");
    setSuggestions([]);
    setApproval(null);
    scrollToEnd();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          history: priorHistory,
          eventId: selectedEvent?.id,
          conversationId,
        }),
      });
      await consume(res);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: "The request failed. Try again.", isError: true },
      ]);
    } finally {
      setBusy(false);
      setStatus(null);
      scrollToEnd();
    }
  }

  // Resume a run paused for approval with the user's decision.
  async function decideApproval(approved: boolean) {
    if (!approval || busy) return;
    const resume = { messages: approval.messages, approved };
    setApproval(null);
    setBusy(true);
    setStatus(approved ? "Working…" : "Cancelling…");
    setSuggestions([]);
    scrollToEnd();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume, conversationId }),
      });
      await consume(res);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: "The request failed. Try again.", isError: true },
      ]);
    } finally {
      setBusy(false);
      setStatus(null);
      scrollToEnd();
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium">Ask PipeMagic</h2>
          {selectedEvent && (
            <span className="flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              📅 {selectedEvent.title}
              <button
                onClick={onClearEvent}
                className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                aria-label="Clear selected event"
              >
                ✕
              </button>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {conversations.length > 0 && (
            <select
              value={conversationId ?? ""}
              onChange={(e) => e.target.value && loadConversation(e.target.value)}
              disabled={busy}
              aria-label="Recent chats"
              className="max-w-[10rem] rounded-md border border-zinc-200 bg-transparent px-2 py-1 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
            >
              {!conversationId && <option value="">Recent chats…</option>}
              {conversations.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={newChat}
            disabled={busy}
            className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            New chat
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-start gap-3 text-sm text-zinc-500">
            <p>
              {selectedEvent
                ? "This meeting is in context. Try:"
                : "Ask about your meetings, e.g.:"}
            </p>
            <button
              onClick={() => send(suggestion)}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-left text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {suggestion}
            </button>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
          >
            <div
              className={
                m.role === "user"
                  ? "max-w-[85%] rounded-2xl rounded-br-sm bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-white dark:text-zinc-900"
                  : `max-w-[90%] rounded-2xl rounded-bl-sm px-4 py-2 text-sm ${
                      m.isError
                        ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                        : "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
                    }`
              }
            >
              {m.role === "assistant" && !m.isError ? (
                <div className={MD_CLASS}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
                </div>
              ) : (
                m.text
              )}
            </div>
          </div>
        ))}

        {approval && !busy && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/30">
            <p className="mb-2 text-sm font-medium text-amber-800 dark:text-amber-300">
              Approve action: <code>{approval.tool}</code>
            </p>
            <pre className="mb-3 max-h-40 overflow-auto rounded bg-white/70 p-2 text-xs text-zinc-700 dark:bg-black/30 dark:text-zinc-300">
              {JSON.stringify(approval.input, null, 2)}
            </pre>
            <div className="flex gap-2">
              <Button onClick={() => decideApproval(true)}>Approve</Button>
              <button
                onClick={() => decideApproval(false)}
                className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Decline
              </button>
            </div>
          </div>
        )}

        {!busy && suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => send(s)}
                className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {status && (
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-400" />
            {status}
          </div>
        )}
      </div>

      <form
        className="flex items-end gap-2 border-t border-zinc-100 p-3 dark:border-zinc-800"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="Ask about a meeting…"
          rows={1}
          className="max-h-32 min-h-10 resize-none"
          disabled={busy}
        />
        <Button type="submit" disabled={busy || !input.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}
