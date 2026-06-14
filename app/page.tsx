import Link from "next/link";
import { getCurrentUserId } from "@/lib/auth/session";
import { listCalendarWeek, type UpcomingEvent } from "@/lib/integrations/google";
import { getAboutMe } from "@/lib/context/repositories/profile";
import { Workspace } from "@/components/workspace";
import { AppShell } from "@/components/app-shell";
import { ConnectCard } from "@/components/connect-card";

export const runtime = "nodejs";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const userId = await getCurrentUserId();

  if (!userId) return <ConnectCard error={error} />;

  const aboutMe = await getAboutMe(userId);

  let events: UpcomingEvent[] = [];
  let failed = false;
  try {
    events = await listCalendarWeek(userId);
  } catch {
    failed = true;
  }

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

      {failed ? (
        <p className="text-sm text-zinc-500">
          Could not load events. Your access may have been revoked —{" "}
          <a href="/api/auth/google/start" className="underline">
            reconnect
          </a>
          .
        </p>
      ) : (
        <Workspace events={events} />
      )}
    </AppShell>
  );
}
