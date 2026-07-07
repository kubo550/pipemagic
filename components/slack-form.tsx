"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  saveSlackWebhookAction,
  disconnectSlackAction,
} from "@/app/connections/actions";

/**
 * Connect Slack by pasting an incoming webhook URL (Slack → Apps → Incoming
 * Webhooks → Add to a channel). On save we send a test message to verify it.
 * Scheduled briefs are then delivered to that channel.
 */
export function SlackForm({ connected }: { connected: boolean }) {
  const [state, formAction, pending] = useActionState(
    saveSlackWebhookAction,
    null,
  );

  return (
    <div className="flex max-w-2xl flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="font-medium">Slack</h3>
          <p className="text-sm text-zinc-500">
            Where PipeMagic delivers scheduled briefs and follow-ups.
          </p>
        </div>
        <span
          className={
            connected
              ? "rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950/50 dark:text-green-400"
              : "rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-800"
          }
        >
          {connected ? "Connected" : "Not connected"}
        </span>
      </div>

      <form action={formAction} className="flex flex-col gap-3">
        <Input
          type="password"
          name="webhookUrl"
          autoComplete="off"
          placeholder={connected ? "Paste a new webhook to replace it" : "https://hooks.slack.com/services/…"}
        />
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Sending test…" : connected ? "Replace webhook" : "Connect"}
          </Button>
          {state?.ok && (
            <span className="text-sm text-green-600 dark:text-green-400">
              {state.message}
            </span>
          )}
          {state && !state.ok && (
            <span className="text-sm text-red-600 dark:text-red-400">
              {state.message}
            </span>
          )}
        </div>
      </form>

      {connected && (
        <form action={disconnectSlackAction}>
          <button
            type="submit"
            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            Disconnect Slack
          </button>
        </form>
      )}
    </div>
  );
}
