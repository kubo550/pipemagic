"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/auth/session";
import {
  saveCrmApiToken,
  deleteCrmApiToken,
} from "@/lib/integrations/crm/credentials";
import { verifyPipedriveToken, PROVIDER } from "@/lib/integrations/crm/pipedrive";
import {
  saveSlackWebhook,
  deleteSlackWebhook,
  verifySlackWebhook,
} from "@/lib/integrations/delivery/slack";

/**
 * Server actions for the Connections screen. Auth is re-checked here — never
 * trust the client for the userId. The Pipedrive API token is verified against
 * the API before it's stored, so a bad paste fails fast instead of surfacing
 * later as "no deals found".
 */

export type ConnectState = { ok: boolean; message?: string };

export async function savePipedriveTokenAction(
  _prev: ConnectState | null,
  formData: FormData,
): Promise<ConnectState> {
  const userId = await getCurrentUserId();
  if (!userId) return { ok: false, message: "Not signed in." };

  const token = String(formData.get("apiToken") ?? "").trim();
  if (!token) return { ok: false, message: "Paste your Pipedrive API token." };

  const valid = await verifyPipedriveToken(token);
  if (!valid) {
    return { ok: false, message: "That token didn't work — check it and try again." };
  }

  await saveCrmApiToken(userId, PROVIDER, token);
  revalidatePath("/connections");
  return { ok: true, message: "Pipedrive connected." };
}

export async function disconnectPipedriveAction(): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) return;
  await deleteCrmApiToken(userId, PROVIDER);
  revalidatePath("/connections");
}

export async function saveSlackWebhookAction(
  _prev: ConnectState | null,
  formData: FormData,
): Promise<ConnectState> {
  const userId = await getCurrentUserId();
  if (!userId) return { ok: false, message: "Not signed in." };

  const url = String(formData.get("webhookUrl") ?? "").trim();
  if (!url) return { ok: false, message: "Paste your Slack incoming webhook URL." };

  const valid = await verifySlackWebhook(url);
  if (!valid) {
    return {
      ok: false,
      message: "That webhook didn't work — it must be a hooks.slack.com URL that accepts a test message.",
    };
  }

  await saveSlackWebhook(userId, url);
  revalidatePath("/connections");
  return { ok: true, message: "Slack connected — sent a test message." };
}

export async function disconnectSlackAction(): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) return;
  await deleteSlackWebhook(userId);
  revalidatePath("/connections");
}
