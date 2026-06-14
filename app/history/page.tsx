import { getCurrentUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { runsRepository } from "@/lib/context/repositories/runs";
import { AppShell } from "@/components/app-shell";
import { ConnectCard } from "@/components/connect-card";

export const runtime = "nodejs";

const STATUS_STYLE: Record<string, string> = {
  completed: "text-green-600 dark:text-green-400",
  awaiting_approval: "text-amber-600 dark:text-amber-400",
  budget_exceeded: "text-red-600 dark:text-red-400",
  max_iterations: "text-red-600 dark:text-red-400",
};

function when(d: Date): string {
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function HistoryPage() {
  const userId = await getCurrentUserId();
  if (!userId) return <ConnectCard />;

  const runs = await runsRepository(prisma).listForUser(userId, 50);

  return (
    <AppShell>
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold tracking-tight">History</h2>
        <p className="text-sm text-zinc-500">
          Past assistant runs — request, outcome, and cost.
        </p>
      </div>

      {runs.length === 0 ? (
        <p className="text-sm text-zinc-500">No runs yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {runs.map((r) => (
            <li
              key={r.id}
              className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex items-start justify-between gap-4">
                <span className="text-sm font-medium">{r.request}</span>
                <span className="shrink-0 text-xs text-zinc-400">
                  {when(r.createdAt)}
                </span>
              </div>
              {r.resultText && (
                <p className="line-clamp-3 text-sm text-zinc-600 dark:text-zinc-300">
                  {r.resultText}
                </p>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
                <span className={STATUS_STYLE[r.status] ?? ""}>{r.status}</span>
                <span>
                  {r.provider} · {r.model}
                </span>
                <span>{r.iterations} steps</span>
                <span>${r.costUsd.toFixed(4)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
