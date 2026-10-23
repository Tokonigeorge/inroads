import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { formatLongDate, todayIn } from "@/domain/dates";
import { LoadingRows, PageFrame } from "@/features/shell/page-frame";
import { requireUser } from "@/server/auth";
import { getAccountOverview } from "@/server/repos/account";
import { Button } from "@/ui/button";
import { EmptyState, PageHeader, Section } from "@/ui/layout";

export const metadata: Metadata = { title: "Today" };

export default function TodayPage() {
  return (
    <PageFrame wide>
      <Suspense fallback={<LoadingRows />}>
        <Today />
      </Suspense>
    </PageFrame>
  );
}

async function Today() {
  const user = await requireUser();
  const { profile, counts } = await getAccountOverview(user.id);
  const today = todayIn(profile.timezone);
  const firstName = profile.name.split(/\s+/)[0];
  return (
    <>
      <PageHeader
        title={formatLongDate(today)}
        subtitle={firstName ? `Welcome back, ${firstName}.` : "Welcome to Inroads."}
      />
      <div className="grid gap-8 md:grid-cols-[3fr_2fr]">
        <Section title="Today's rooms">
          <EmptyState>Your agenda for today appears here once you add rooms or connect a calendar.</EmptyState>
        </Section>
        <Section title="Follow up">
          {counts.people === 0 ? (
            <EmptyState
              action={
                <Button asChild variant="primary">
                  <Link href="/settings#data">Load example data</Link>
                </Button>
              }
            >
              Add the people you know and Inroads will tell you who to get back to.
            </EmptyState>
          ) : (
            <EmptyState>Reminders about promises, birthdays and people going quiet will show here.</EmptyState>
          )}
        </Section>
      </div>
    </>
  );
}
