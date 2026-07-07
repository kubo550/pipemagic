"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ConversationRef {
  id: string;
  title: string;
  updatedAt: string;
}

interface Msg {
  role: "user" | "assistant";
  text: string;
}

const MD_CLASS =
  "space-y-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:underline [&_strong]:font-semibold [&_code]:rounded [&_code]:bg-zinc-200/60 [&_code]:px-1 dark:[&_code]:bg-zinc-700/60";

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ConversationHistory({
  conversations,
}: {
  conversations: ConversationRef[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);

  async function open(id: string) {
    setSelectedId(id);
    setLoading(true);
    try {
      const res = await fetch(`/api/conversations?id=${encodeURIComponent(id)}`);
      if (!res.ok) return;
      const convo = (await res.json()) as { messages: Msg[] };
      setMessages(convo.messages);
    } finally {
      setLoading(false);
    }
  }

  if (conversations.length === 0) {
    return <p className="text-sm text-zinc-500">No chats yet.</p>;
  }

  return (
    <div className="grid min-h-0 gap-6 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
      <ul className="flex flex-col gap-2">
        {conversations.map((c) => (
          <li key={c.id}>
            <button
              onClick={() => open(c.id)}
              className={`flex w-full flex-col gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors ${
                selectedId === c.id
                  ? "border-zinc-300 bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800"
                  : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
              }`}
            >
              <span className="truncate text-sm font-medium">{c.title}</span>
              <span className="text-xs text-zinc-400">{when(c.updatedAt)}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="min-w-0">
        {!selectedId ? (
          <p className="text-sm text-zinc-500">Pick a chat to see the transcript.</p>
        ) : loading ? (
          <p className="text-sm text-zinc-400">Loading…</p>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
              >
                <div
                  className={
                    m.role === "user"
                      ? "max-w-[85%] rounded-2xl rounded-br-sm bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-white dark:text-zinc-900"
                      : "max-w-[90%] rounded-2xl rounded-bl-sm bg-zinc-100 px-4 py-2 text-sm text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
                  }
                >
                  {m.role === "assistant" ? (
                    <div className={MD_CLASS}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
                    </div>
                  ) : (
                    m.text
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
