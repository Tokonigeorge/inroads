import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { goalPriorityLabels, goalTypeLabels } from "@/contracts/goals";
import { formatLongDate } from "@/domain/dates";
import { progressMeter, progressSummary } from "@/domain/goal-progress";
import { instantInZone } from "@/domain/zoned";
import { GoalActions } from "@/features/goals/goal-actions";
import { Pipeline } from "@/features/goals/pipeline";
import { LoadingRows } from "@/features/shell/page-frame";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import { getGoal, type GoalDetail } from "@/server/repos/goals";
import { userContext } from "@/server/user-context";
import { PageHeader, Section } from "@/ui/layout";
import { Meter } from "@/ui/meter";

export const metadata: Metadata = { title: "Goal" };

export default function GoalPage({ params }: PageProps<"/goals/[id]">) {
  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-8 md:py-10">
      <Link href="/goals" className="mb-4 inline-flex items-center gap-1 text-small text-muted hover:text-text">
        <ArrowLeft size={14} aria-hidden /> Goals
      </Link>
      <Suspense fallback={<LoadingRows rows={6} />}>
        <Goal params={params} />
      </Suspense>
    </div>
  );
}

async function Goal({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user] = await Promise.all([params, requireUser()]);
  const data = await db.withUser(user.id, async (tx) => {
    const ctx = await userContext(tx);
    return { goal: await getGoal(tx, id, ctx.today, ctx.timezone), ctx };
  });
  if (!data.goal) notFound();
  return <GoalView g={data.goal} today={data.ctx.today} tz={data.ctx.timezone} />;
}

function GoalView({ g, today, tz }: { g: GoalDetail; today: string; tz: string }) {
  const m = progressMeter(g.progress);
  const label = (key: string | null) => (key ? (g.stages.find((s) => s.key === key)?.label ?? "a removed stage") : "");
  const subtitle = [
    g.space.name,
    goalTypeLabels[g.type],
    `${goalPriorityLabels[g.priority as 1 | 2 | 3]} priority`,
    g.dueOn ? `finish by ${formatLongDate(g.dueOn, today)}` : null,
    g.archived ? "Archived" : !g.active ? "Paused" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <>
      <PageHeader
        title={g.text}
        subtitle={subtitle}
        actions={<GoalActions goalId={g.id} text={g.text} spaceId={g.space.id} spaceName={g.space.name} stages={g.stages} active={g.active} archived={g.archived} />}
      />

      {g.active && !g.archived ? (
        <section aria-labelledby="week" className="mb-8 grid max-w-[560px] gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="week" className="font-semibold">
              This week
            </h2>
            <span className="text-small text-muted">
              {m.done} of {m.target} · {m.label}
            </span>
          </div>
          <Meter value={m.done} max={m.target} label="This week" valueText={`${m.done} of ${m.target}`} />
          <p className="text-small text-muted">{progressSummary(g.progress)}</p>
        </section>
      ) : null}

      <Section title={`Pipeline · ${g.people === 1 ? "1 person" : `${g.people} people`}`}>
        <Pipeline
          stages={g.stages}
          today={today}
          cards={g.pipeline.map((p) => ({ linkId: p.linkId, personId: p.personId, name: p.name, detail: p.detail, stage: p.stage, note: p.note, lastTouchedOn: p.lastTouchedOn, fit: p.fit, movedAt: p.movedAt.toISOString() }))}
        />
        <p className="hidden pt-3 text-small text-muted md:block">Tip: focus a person and press [ or ] to move them a stage. Press a to add people.</p>
      </Section>

      <div className="grid gap-8 md:grid-cols-2">
        <Section title="Rooms for this goal">
          {g.rooms.length ? (
            <ul className="grid gap-1">
              {g.rooms.map((r) => (
                <li key={r.id}>
                  <Link href={`/rooms/${r.id}`} className="hover:underline">
                    {r.title}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-small text-muted">Tie a room to this goal from the room&apos;s form, and sessions you go to count towards your week.</p>
          )}
        </Section>
        <Section title="Recent moves">
          {g.recent.length ? (
            <ul className="grid gap-1.5 text-small">
              {g.recent.map((r, i) => {
                const d = instantInZone(r.at, tz).date;
                return (
                  <li key={i}>
                    <span className="font-[550]">{r.name}</span> {r.from ? `moved from ${label(r.from)} to ${label(r.to)}` : `added at ${label(r.to)}`}
                    <span className="text-muted"> · {formatLongDate(d, today)}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-small text-muted">Moves show here as people progress.</p>
          )}
        </Section>
      </div>
    </>
  );
}
