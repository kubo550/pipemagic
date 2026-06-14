import { getCurrentUserId } from "@/lib/auth/session";
import { AppShell } from "@/components/app-shell";
import { ConnectCard } from "@/components/connect-card";
import { PostMeetingPanel } from "@/components/post-meeting-panel";

export const runtime = "nodejs";

export default async function PostMeetingPage() {
  const userId = await getCurrentUserId();
  if (!userId) return <ConnectCard />;

  return (
    <AppShell>
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Post-meeting</h2>
        <p className="max-w-2xl text-sm text-zinc-500">
          Paste a transcript and get a ready follow-up email, a recap, and next
          steps — tailored to your context. Review before you send.
        </p>
      </div>
      <PostMeetingPanel />
    </AppShell>
  );
}
