import type { Metadata } from "next";
import { Suspense } from "react";
import { AboutYouForm } from "@/features/connections/about-you-form";
import { ConnectionsSection } from "@/features/connections/connections-section";
import { FinishOnboarding } from "@/features/connections/finish-onboarding";
import { GoalsStep } from "@/features/goals/goals-step";
import { countries, timezonesWith } from "@/features/settings/locale-options";
import { LoadingRows, PageFrame } from "@/features/shell/page-frame";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import { getAccountOverview } from "@/server/repos/account";
import { pendingTriageCount } from "@/server/repos/connections";
import { PageHeader, Section } from "@/ui/layout";

export const metadata: Metadata = { title: "Set up Inroads" };

export default function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  return (
    <PageFrame>
      <Suspense fallback={<LoadingRows rows={5} />}>
        <Onboarding searchParams={searchParams} />
      </Suspense>
    </PageFrame>
  );
}

async function Onboarding({ searchParams }: { searchParams: PageProps<"/onboarding">["searchParams"] }) {
  const [q, user] = await Promise.all([searchParams, requireUser()]);
  const step = q.step === "connect" ? "connect" : q.step === "goals" ? "goals" : "about";

  if (step === "about") {
    const { profile } = await getAccountOverview(user.id);
    return (
      <>
        <PageHeader title="About you" subtitle="Step 1 of 3. So reminders arrive on your day and phone numbers are read correctly." />
        <AboutYouForm
          name={profile.name}
          timezone={profile.timezone}
          region={profile.defaultRegion}
          timezones={timezonesWith(profile.timezone)}
          countries={countries}
        />
      </>
    );
  }

  if (step === "goals") {
    // From Today's "Set your goals" after set-up, come back to Goals rather than the next set-up step.
    const { profile } = await getAccountOverview(user.id);
    const done = Boolean((profile.onboardingState as { completedAt?: string } | null)?.completedAt);
    return (
      <>
        <PageHeader
          title="What are you working towards?"
          subtitle={`${done ? "" : "Step 2 of 3. "}Inroads uses your goals to suggest who to meet, which rooms to go to and what to say. You can change them any time.`}
        />
        <GoalsStep next={done ? "/goals" : "/onboarding?step=connect"} />
      </>
    );
  }

  const toSort = await db.withUser(user.id, (tx) => pendingTriageCount(tx, null));
  return (
    <>
      <PageHeader
        title="Bring in your people"
        subtitle="Step 3 of 3. Connect what you already use. New people wait for you to sort them; nothing is added to reminders without you."
      />
      <ConnectionsSection searchParams={searchParams} returnTo="/onboarding?step=connect" />
      <Section title="Next" className="pt-8">
        <FinishOnboarding toSort={toSort} />
      </Section>
    </>
  );
}
