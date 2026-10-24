import { getCountries } from "libphonenumber-js/max";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AboutYouForm } from "@/features/connections/about-you-form";
import { ConnectionsSection } from "@/features/connections/connections-section";
import { FinishOnboarding } from "@/features/connections/finish-onboarding";
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

const countryNames = new Intl.DisplayNames(["en-GB"], { type: "region" });
const countries = getCountries()
  .map((code) => ({ code, name: countryNames.of(code) ?? code }))
  .sort((a, b) => a.name.localeCompare(b.name, "en-GB"));
const timezones = Intl.supportedValuesOf("timeZone");

async function Onboarding({ searchParams }: { searchParams: PageProps<"/onboarding">["searchParams"] }) {
  const [q, user] = await Promise.all([searchParams, requireUser()]);
  const step = q.step === "connect" ? "connect" : "about";

  if (step === "about") {
    const { profile } = await getAccountOverview(user.id);
    return (
      <>
        <PageHeader title="About you" subtitle="Step 1 of 2. So reminders arrive on your day and phone numbers are read correctly." />
        <AboutYouForm
          name={profile.name}
          timezone={profile.timezone}
          region={profile.defaultRegion}
          timezones={timezones.includes(profile.timezone) ? timezones : [profile.timezone, ...timezones]}
          countries={countries}
        />
      </>
    );
  }

  const toSort = await db.withUser(user.id, (tx) => pendingTriageCount(tx, null));
  return (
    <>
      <PageHeader
        title="Bring in your people"
        subtitle="Step 2 of 2. Connect what you already use. New people wait for you to sort them; nothing is added to reminders without you."
      />
      <ConnectionsSection searchParams={searchParams} returnTo="/onboarding?step=connect" />
      <Section title="Next" className="pt-8">
        <FinishOnboarding toSort={toSort} />
      </Section>
    </>
  );
}
