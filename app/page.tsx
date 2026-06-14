import Link from "next/link";
import { getCurrentUserId } from "@/lib/auth/session";
import { listUpcomingEvents, type UpcomingEvent } from "@/lib/integrations/google";
import { getAboutMe } from "@/lib/context/repositories/profile";
import { ChatPanel } from "@/components/chat-panel";
import { AppShell } from "@/components/app-shell";
import { ConnectCard } from "@/components/connect-card";

export const runtime = "nodejs";

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

  if (!userId) return <ConnectCard error={error} />;

  const aboutMe = await getAboutMe(userId);

  return (
    <AppShell>
      {!aboutMe.trim() && (
        <Link
          href="/about"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200"
        >
          👋 Tell PipeMagic about yourself on the <strong>About me</strong> page
          — it tailors every brief and follow-up to your goals.
        </Link>
      )}
      <ConnectedView userId={userId} />
    </AppShell>
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
    <div className="grid h-[80vh] min-h-0 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* Left: upcoming meetings */}
      <div className="flex min-h-0 flex-col gap-3">
        <h2 className="text-sm font-medium text-zinc-500">Upcoming meetings</h2>
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
          <ul className="flex min-h-0 flex-col divide-y divide-zinc-100 overflow-y-auto rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
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

      {/* Right: chat */}
      <div className="min-h-0">
        <ChatPanel />
      </div>
    </div>
  );
}
