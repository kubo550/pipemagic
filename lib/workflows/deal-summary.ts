import { getProvider } from "@/lib/llm";
import type { LlmUsage } from "@/lib/llm/types";
import type {
  CrmActivity,
  CrmEmailMessage,
  CrmNote,
} from "@/lib/integrations/crm/types";

/**
 * Deal-context summarizer (Daisy "extract info from a deal" automation). The raw
 * email history + notes + activities are noisy — we do NOT hand them to the
 * writer AI directly. Instead a dedicated, single LLM call distills them into
 * one concise note that the post-meeting writer consumes. Returns usage so the
 * caller can charge it to the run's budget.
 */

export interface DealRawContext {
  emails: CrmEmailMessage[];
  notes: CrmNote[];
  activities: CrmActivity[];
}

export interface DealSummary {
  note: string;
  usage: LlmUsage;
}

// Keep the prompt bounded regardless of how much history a deal carries.
const MAX_EMAILS = 30;
const MAX_BODY_CHARS = 1500;
const MAX_NOTES = 20;
const MAX_ACTIVITIES = 30;
const MAX_NOTE_CHARS = 1000;

function formatEmails(emails: CrmEmailMessage[]): string {
  if (!emails.length) return "";
  const lines = ["## Email history (oldest → newest)"];
  for (const m of emails.slice(-MAX_EMAILS)) {
    const when = m.sentAt ?? "?";
    const to = m.to.join(", ");
    const body = m.body.replace(/\s+\n/g, "\n").trim().slice(0, MAX_BODY_CHARS);
    lines.push(
      `\n[${when}] From: ${m.from} → ${to}` +
        (m.subject ? `\nSubject: ${m.subject}` : "") +
        `\n${body}`,
    );
  }
  return lines.join("\n");
}

function formatNotes(notes: CrmNote[]): string {
  if (!notes.length) return "";
  const lines = ["## Notes"];
  for (const n of notes.slice(0, MAX_NOTES)) {
    const when = n.addedAt ?? "?";
    lines.push(`- [${when}] ${n.content.slice(0, MAX_NOTE_CHARS)}`);
  }
  return lines.join("\n");
}

function formatActivities(activities: CrmActivity[]): string {
  if (!activities.length) return "";
  const lines = ["## Activities"];
  for (const a of activities.slice(0, MAX_ACTIVITIES)) {
    const mark = a.done ? "✓ done" : "○ open";
    const due = a.dueAt ? ` (due ${a.dueAt})` : "";
    const type = a.type ? ` [${a.type}]` : "";
    lines.push(`- ${mark}${type} ${a.subject}${due}`);
  }
  return lines.join("\n");
}

const SYSTEM = [
  "You distill a CRM deal's raw history into a short briefing note for a",
  "colleague who is about to follow up after a meeting. Work ONLY from the",
  "material given — do not invent names, numbers, or commitments.",
  "",
  "Strip the noise: signatures, pleasantries, quoted reply chains, automated",
  "footers. Produce tight bullet points covering, where present:",
  "- where the relationship/deal stands now and its stage",
  "- who the key people are and their roles",
  "- concrete commitments, agreed next steps, and deadlines",
  "- open questions or unresolved threads worth raising in the follow-up",
  "",
  "Keep it under ~200 words. If the material is thin, say what little is known",
  "plainly rather than padding.",
].join("\n");

export async function summarizeDealContext(
  raw: DealRawContext,
): Promise<DealSummary> {
  const provider = getProvider();

  const sections = [
    formatEmails(raw.emails),
    formatNotes(raw.notes),
    formatActivities(raw.activities),
  ].filter(Boolean);

  const res = await provider.complete({
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Here is the deal's CRM history:\n\n${sections.join("\n\n")}`,
          },
        ],
      },
    ],
    tools: [],
    maxTokens: 600,
  });

  return { note: res.text.trim(), usage: res.usage };
}
