const ERROR_MESSAGES: Record<string, string> = {
  denied: "Google access was denied. Try connecting again.",
  state: "Login session expired. Please try again.",
  oauth: "Something went wrong connecting to Google. Please try again.",
};

/** Unauthenticated landing: connect Google. Shown without the app shell. */
export function ConnectCard({ error }: { error?: string }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">PipeMagic</h1>
        <p className="text-sm text-zinc-500">Your AI meeting-prep assistant</p>
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          {ERROR_MESSAGES[error] ?? "An error occurred."}
        </div>
      )}

      <div className="flex flex-col items-start gap-4 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Connect your Google Calendar to let PipeMagic read your upcoming
          meetings.
        </p>
        <a
          href="/api/auth/google/start"
          className="inline-flex h-10 items-center rounded-full bg-zinc-900 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Connect Google Calendar
        </a>
      </div>
    </main>
  );
}
