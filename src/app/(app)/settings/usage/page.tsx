import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LoadingRows, PageFrame } from "@/features/shell/page-frame";
import { aiFeatureLabels, aiFeatures, isAiConfigured } from "@/server/ai/config";
import { usageSummary } from "@/server/ai/limits";
import { requireUser } from "@/server/auth";
import { PageHeader, Section } from "@/ui/layout";
import { Meter } from "@/ui/meter";

export const metadata: Metadata = { title: "AI usage" };

export default function UsagePage() {
  return (
    <PageFrame>
      <Link href="/settings" className="text-small text-muted hover:text-text">
        Settings
      </Link>
      <PageHeader title="AI usage" subtitle="Limits keep the app free to run. Daily counts reset at midnight UTC; the monthly allowance on the 1st." />
      <Suspense fallback={<LoadingRows rows={6} />}>
        <Usage />
      </Suspense>
    </PageFrame>
  );
}

async function Usage() {
  const user = await requireUser();
  if (!isAiConfigured()) return <p className="text-muted">AI features aren&apos;t set up on this server yet.</p>;
  const u = await usageSummary(user.id);
  const pct = Math.min(1, u.monthUsd / Math.max(0.01, u.monthCapUsd));
  return (
    <>
      <Section title="This month">
        <div className="grid max-w-[480px] gap-2">
          <Meter value={Math.round(pct * 100)} max={100} label="Monthly AI allowance" valueText={`${Math.round(pct * 100)}% used`} />
          <p className="text-small text-muted">{Math.round(pct * 100)}% of your monthly allowance used.</p>
        </div>
      </Section>
      <Section title="Today">
        <ul className="grid max-w-[480px] gap-3">
          {aiFeatures.map((f) => {
            const used = u.today[f] ?? 0;
            const cap = u.limits[f];
            return (
              <li key={f} className="grid gap-1">
                <div className="flex justify-between text-small">
                  <span>{aiFeatureLabels[f]}</span>
                  <span className="text-muted tabular">
                    {used} of {cap}
                  </span>
                </div>
                <Meter value={used} max={cap} label={`${aiFeatureLabels[f]} today`} valueText={`${used} of ${cap}`} />
              </li>
            );
          })}
        </ul>
      </Section>
      <Section title="What's sent to the AI">
        <ul className="grid max-w-[560px] list-disc gap-1 pl-5 text-small text-muted">
          <li>Research, drafts and look ups send what you&apos;ve saved about that person or place in that one Space, and your goals for that Space. Other Spaces are never included.</li>
          <li>Chat imports send the pasted chat once; it isn&apos;t stored. Card photos are read once and not kept.</li>
          <li>Briefs send that Space&apos;s agenda, reminders and goal progress.</li>
          <li>Your data isn&apos;t used to train models.</li>
        </ul>
      </Section>
    </>
  );
}
