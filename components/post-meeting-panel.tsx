"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface FollowUp {
  summary: string;
  followUpEmail: string;
  nextSteps: string[];
}

export function PostMeetingPanel() {
  const [transcript, setTranscript] = useState("");
  const [result, setResult] = useState<FollowUp | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
    if (transcript.trim().length < 20 || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/post-meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });
      if (!res.ok) throw new Error(await res.text());
      setResult((await res.json()) as FollowUp);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  async function copyEmail() {
    if (!result) return;
    await navigator.clipboard.writeText(result.followUpEmail);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-3">
        <label className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
          Paste the meeting transcript
        </label>
        <Textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Paste the transcript here (from Tactiq, Fireflies, Otter, Zoom…)."
          rows={16}
          className="resize-y leading-relaxed"
          disabled={busy}
        />
        <div>
          <Button onClick={generate} disabled={busy || transcript.trim().length < 20}>
            {busy ? "Drafting…" : "Generate follow-up"}
          </Button>
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>

      <div className="flex flex-col gap-5">
        {!result && !busy && (
          <p className="text-sm text-zinc-500">
            The draft is yours to review before anything is sent — nothing leaves
            this screen automatically.
          </p>
        )}

        {result && (
          <>
            <section className="flex flex-col gap-1.5">
              <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                Summary
              </h3>
              <p className="text-sm text-zinc-700 dark:text-zinc-200">
                {result.summary}
              </p>
            </section>

            <section className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                  Follow-up email (draft)
                </h3>
                <button
                  onClick={copyEmail}
                  className="text-xs text-zinc-500 underline-offset-4 hover:underline"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <pre className="whitespace-pre-wrap rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
                {result.followUpEmail}
              </pre>
            </section>

            {result.nextSteps.length > 0 && (
              <section className="flex flex-col gap-1.5">
                <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                  Next steps
                </h3>
                <ul className="list-inside list-disc text-sm text-zinc-700 dark:text-zinc-200">
                  {result.nextSteps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
