import { getCurrentUserId } from "@/lib/auth/session";
import { hasCrmConnection } from "@/lib/integrations/crm/credentials";
import { PROVIDER } from "@/lib/integrations/crm/pipedrive";
import { hasSlackWebhook } from "@/lib/integrations/delivery/slack";
import { AppShell } from "@/components/app-shell";
import { ConnectCard } from "@/components/connect-card";
import { PipedriveForm } from "@/components/pipedrive-form";
import { SlackForm } from "@/components/slack-form";

export const runtime = "nodejs";

export default async function ConnectionsPage() {
  const userId = await getCurrentUserId();
  if (!userId) return <ConnectCard />;

  const [pipedriveConnected, slackConnected] = await Promise.all([
    hasCrmConnection(userId, PROVIDER),
    hasSlackWebhook(userId),
  ]);

  return (
    <AppShell>
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Connections</h2>
        <p className="max-w-2xl text-sm text-zinc-500">
          Connect your CRM so PipeMagic can pull the right deal&apos;s context,
          and a delivery channel so scheduled briefs reach you.
        </p>
      </div>
      <PipedriveForm connected={pipedriveConnected} />
      <SlackForm connected={slackConnected} />
    </AppShell>
  );
}
