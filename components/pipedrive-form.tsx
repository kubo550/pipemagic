"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  savePipedriveTokenAction,
  disconnectPipedriveAction,
} from "@/app/connections/actions";

/**
 * Connect Pipedrive by pasting a personal API token (Settings → Personal
 * preferences → API in Pipedrive). The token is verified server-side before
 * it's stored encrypted; we never render it back.
 */
export function PipedriveForm({ connected }: { connected: boolean }) {
  const [state, formAction, pending] = useActionState(
    savePipedriveTokenAction,
    null,
  );

  return (
    <div className="flex max-w-2xl flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="font-medium">Pipedrive</h3>
          <p className="text-sm text-zinc-500">
            Lets PipeMagic find the right deal from a meeting&apos;s attendees.
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
          name="apiToken"
          autoComplete="off"
          placeholder={connected ? "Paste a new token to replace it" : "Pipedrive API token"}
        />
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Verifying…" : connected ? "Replace token" : "Connect"}
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
        <form action={disconnectPipedriveAction}>
          <button
            type="submit"
            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            Disconnect Pipedrive
          </button>
        </form>
      )}
    </div>
  );
}
