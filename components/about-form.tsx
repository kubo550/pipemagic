"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { saveAboutMeAction } from "@/app/about/actions";

const PLACEHOLDER = `Tell PipeMagic who you are and what you're trying to do.

Examples:
• I'm an AE at Acme selling DevOps tooling to mid-market eng teams. I run discovery → demo → proposal.
• I'm a software engineer prepping for job interviews; help me anticipate questions and frame my experience.
• I'm a founder doing investor meetings; help me sharpen the narrative and spot likely pushback.`;

export function AboutForm({ initialAboutMe }: { initialAboutMe: string }) {
  const [state, formAction, pending] = useActionState(saveAboutMeAction, null);

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-4">
      <Textarea
        name="aboutMe"
        defaultValue={initialAboutMe}
        placeholder={PLACEHOLDER}
        rows={12}
        className="resize-y leading-relaxed"
      />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {state?.ok && (
          <span className="text-sm text-green-600 dark:text-green-400">Saved.</span>
        )}
        {state && !state.ok && (
          <span className="text-sm text-red-600 dark:text-red-400">
            Could not save.
          </span>
        )}
      </div>
    </form>
  );
}
