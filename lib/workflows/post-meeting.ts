import { z } from "zod";
import { getProvider } from "@/lib/llm";
import { getAboutMe } from "@/lib/context/repositories/profile";
import { log } from "@/lib/observability/logger";

/**
 * Post-meeting pipeline (PRD §3 wedge): a transcript in → a ready follow-up
 * draft out. UI-independent, like runWorkflow. This is the account-free core;
 * fact-extraction-to-store and the live HubSpot write layer on later.
 *
 * Single structured LLM call (no tools): we ask for JSON and validate it, so
 * the route gets typed data to render. Tailored by the user's about-me.
 */

export const followUpSchema = z.object({
  summary: z.string(),
  followUpEmail: z.string(),
  nextSteps: z.array(z.string()),
});
export type FollowUp = z.infer<typeof followUpSchema>;

function stripFences(text: string): string {
  // Models sometimes wrap JSON in ```json … ``` — strip it before parsing.
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function buildSystem(aboutMe: string): string {
  const lines = [
    "You are PipeMagic, an assistant that turns a meeting transcript into a",
    "ready-to-send follow-up. Work only from the transcript — do not invent",
    "commitments, names, or numbers that aren't in it.",
    "",
    "Return ONLY a JSON object, no prose, with exactly these keys:",
    '- "summary": 2–4 sentence recap of what happened.',
    '- "followUpEmail": a complete, ready-to-send follow-up email (plain text,',
    "  with greeting and sign-off) referencing concrete points from the call.",
    '- "nextSteps": an array of short, concrete action items (strings).',
  ];
  if (aboutMe.trim()) {
    lines.push(
      "",
      "About the user (tailor tone and framing to this):",
      aboutMe.trim(),
    );
  }
  return lines.join("\n");
}

export async function draftFollowUp(
  userId: string,
  transcript: string,
): Promise<FollowUp> {
  const provider = getProvider();
  const aboutMe = await getAboutMe(userId);

  const request = {
    system: buildSystem(aboutMe),
    messages: [
      {
        role: "user" as const,
        content: [
          {
            type: "text" as const,
            text: `Here is the meeting transcript:\n\n${transcript}`,
          },
        ],
      },
    ],
    tools: [],
    maxTokens: 1200,
  };

  // One parse attempt; on malformed JSON, ask once more with a stricter nudge.
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await provider.complete(
      attempt === 0
        ? request
        : {
            ...request,
            system: request.system + "\n\nReturn valid JSON only. No markdown.",
          },
    );
    try {
      const parsed = followUpSchema.parse(JSON.parse(stripFences(res.text)));
      log.info("follow-up drafted", { userId, provider: provider.name });
      return parsed;
    } catch {
      if (attempt === 1) {
        log.warn("follow-up draft parse failed", { userId });
        throw new Error("Could not produce a structured follow-up.");
      }
    }
  }
  // Unreachable, but satisfies the type checker.
  throw new Error("Could not produce a structured follow-up.");
}
