"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  isError?: boolean;
}

const SUGGESTION = "Prepare me for my next meeting.";

export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  function scrollToEnd() {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    });
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    setMessages((m) => [...m, { role: "user", text: trimmed }]);
    setInput("");
    setBusy(true);
    setStatus("Thinking…");
    scrollToEnd();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });
      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // Read newline-delimited JSON events as they stream in.
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
          };
          if (event.type === "status") {
            setStatus(event.message ?? null);
          } else if (event.type === "final") {
            setMessages((m) => [
              ...m,
              { role: "assistant", text: event.text ?? "" },
            ]);
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
      <div className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
        <h2 className="text-sm font-medium">Ask PipeMagic</h2>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-start gap-3 text-sm text-zinc-500">
            <p>Ask about your meetings, e.g.:</p>
            <button
              onClick={() => send(SUGGESTION)}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-left text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {SUGGESTION}
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
                  : `max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-bl-sm px-4 py-2 text-sm ${
                      m.isError
                        ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                        : "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
                    }`
              }
            >
              {m.text}
            </div>
          </div>
        ))}

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
