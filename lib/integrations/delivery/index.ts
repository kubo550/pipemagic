import { getSlackWebhook, postToSlack } from "@/lib/integrations/delivery/slack";

/**
 * Outbound delivery for scheduled runs (PRD §5). Picks whichever channel the
 * user has configured and sends the result there. Slack (incoming webhook) is
 * the first channel; email slots in here later behind the same function.
 */

export interface DeliveryResult {
  delivered: boolean;
  channel?: "slack";
}

export async function deliverToUser(
  userId: string,
  message: { subject?: string; text: string },
): Promise<DeliveryResult> {
  if (!message.text.trim()) return { delivered: false };

  const webhook = await getSlackWebhook(userId);
  if (webhook) {
    const body = message.subject
      ? `*${message.subject}*\n${message.text}`
      : message.text;
    await postToSlack(webhook, body);
    return { delivered: true, channel: "slack" };
  }

  return { delivered: false };
}
