import { getCurrentUserId } from "@/lib/auth/session";
import { listUpcomingEvents, type UpcomingEvent } from "@/lib/integrations/google";

export const runtime = "nodejs";

const ERROR_MESSAGES: Record<string, string> = {
  denied: "Google access was denied. Try connecting again.",
  state: "Login session expired. Please try again.",
  oauth: "Something went wrong connecting to Google. Please try again.",
};

function formatStart(start: string | null): string {
  if (!start) return "—";
  const d = new Date(start);
  return Number.isNaN(d.getTime())
    ? start
    : d.toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const userId = await getCurrentUserId();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">PipeMagic</h1>
        <p className="text-sm text-zinc-500">
          Phase 1 — Google Calendar connection
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          {ERROR_MESSAGES[error] ?? "An error occurred."}
        </div>
      )}

      {userId ? <ConnectedView userId={userId} /> : <ConnectCard />}
    </main>
  );
}

function ConnectCard() {
  return (
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
  );
}

async function ConnectedView({ userId }: { userId: string }) {
  let events: UpcomingEvent[] = [];
  let failed = false;
  try {
    events = await listUpcomingEvents(userId, { maxResults: 10 });
  } catch {
    failed = true;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-500">Upcoming events</h2>
        <a
          href="/api/auth/logout"
          className="text-sm text-zinc-400 underline-offset-4 hover:text-zinc-600 hover:underline dark:hover:text-zinc-300"
        >
          Disconnect
        </a>
      </div>

      {failed ? (
        <p className="text-sm text-zinc-500">
          Could not load events. Your access may have been revoked —{" "}
          <a href="/api/auth/google/start" className="underline">
            reconnect
          </a>
          .
        </p>
      ) : events.length === 0 ? (
        <p className="text-sm text-zinc-500">No upcoming events.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {events.map((e) => (
            <li
              key={e.id}
              className="flex flex-col gap-1 bg-white px-4 py-3 dark:bg-zinc-900"
            >
              <span className="font-medium">{e.summary}</span>
              <span className="text-xs text-zinc-500">
                {formatStart(e.start)}
                {e.attendeeCount > 0 && ` · ${e.attendeeCount} attendees`}
                {e.organizerDomain && ` · ${e.organizerDomain}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
