import { getCurrentUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { conversationsRepository } from "@/lib/context/repositories/conversations";
import { AppShell } from "@/components/app-shell";
import { ConnectCard } from "@/components/connect-card";
import { ConversationHistory } from "@/components/conversation-history";

export const runtime = "nodejs";

export default async function HistoryPage() {
  const userId = await getCurrentUserId();
  if (!userId) return <ConnectCard />;

  const recent = await conversationsRepository(prisma).listRecent(userId, 50);
  const conversations = recent.map((c) => ({
    id: c.id,
    title: c.title,
    updatedAt: c.updatedAt.toISOString(),
  }));

  return (
    <AppShell>
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold tracking-tight">History</h2>
        <p className="text-sm text-zinc-500">Your past chats with PipeMagic.</p>
      </div>
      <ConversationHistory conversations={conversations} />
    </AppShell>
  );
}
