import { getCurrentUserId } from "@/lib/auth/session";
import { getAboutMe } from "@/lib/context/repositories/profile";
import { AppShell } from "@/components/app-shell";
import { ConnectCard } from "@/components/connect-card";
import { AboutForm } from "@/components/about-form";

export const runtime = "nodejs";

export default async function AboutPage() {
  const userId = await getCurrentUserId();
  if (!userId) return <ConnectCard />;

  const aboutMe = await getAboutMe(userId);

  return (
    <AppShell>
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold tracking-tight">About me</h2>
        <p className="max-w-2xl text-sm text-zinc-500">
          Context about you and your goals. PipeMagic folds this into every
          run so its briefs and answers are tailored to your situation —
          whatever your role.
        </p>
      </div>
      <AboutForm initialAboutMe={aboutMe} />
    </AppShell>
  );
}
