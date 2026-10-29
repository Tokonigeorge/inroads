import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { goalPriorityLabels, goalTypeLabels } from "@/contracts/goals";
import { formatLongDate } from "@/domain/dates";
import { progressMeter, progressSummary, weekOf } from "@/domain/goal-progress";
import { instantInZone } from "@/domain/zoned";
import { AiJobButton } from "@/features/ai/ai-job-button";
import { GoalActions } from "@/features/goals/goal-actions";
import { WeekCelebration } from "@/features/goals/week-celebration";
import { GoalSteps, type StepResearch } from "@/features/goals/goal-steps";
import { Pipeline } from "@/features/goals/pipeline";
import { LoadingRows } from "@/features/shell/page-frame";
import { isAiConfigured } from "@/server/ai/config";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import { isResearchStep, listGoalSteps, type GoalStep } from "@/server/repos/goal-steps";
import { loadPlan } from "@/server/repos/prep";
import { findJobKind } from "@/server/jobs/ai-jobs";
import * as t from "@/server/db/schema";
import { and, inArray, sql } from "drizzle-orm";
import { getGoal, goalHistory, type GoalDetail } from "@/server/repos/goals";
import { userContext } from "@/server/user-context";
import { Button } from "@/ui/button";
import { PageHeader, Section } from "@/ui/layout";
import { Meter, TargetHit } from "@/ui/meter";
import { WeekTrend } from "@/ui/week-trend";

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
    const goal = await getGoal(tx, id, ctx.today, ctx.timezone);
    if (!goal) return { goal, ctx, steps: [], history: [], research: {} };
    const [steps, history] = await Promise.all([listGoalSteps(tx, goal.id), goalHistory(tx, { id: goal.id, spaceId: goal.space.id }, ctx.today)]);
    // Research steps: what each found (with who's already added), or the search still running.
    const research: Record<string, StepResearch> = {};
    const open = steps.filter((s) => !s.doneAt && (s.researchId || isResearchStep(s.text)));
    const running = open.length
      ? await tx
          .select({ id: t.jobs.id, kind: t.jobs.kind })
          .from(t.jobs)
          .where(and(inArray(t.jobs.kind, open.map((s) => findJobKind(s.id))), inArray(t.jobs.status, ["queued", "running"]), sql`${t.jobs.createdAt} > now() - interval '15 minutes'`))
      : [];
    for (const s of open) {
      const plan = s.researchId ? await loadPlan(tx, s.researchId) : null;
      research[s.id] = {
        jobId: running.find((j) => j.kind === findJobKind(s.id))?.id ?? null,
        searchId: plan?.id ?? null,
        people: plan ? plan.result.stakeholders.map((x, i) => ({ index: i, name: x.name.trim(), role: x.role, why: x.why, url: x.url })) : [],
        kept: plan?.keptPeople ?? {},
      };
    }
    return { goal, ctx, steps, history, research };
  });
  if (!data.goal) notFound();
  return <GoalView g={data.goal} today={data.ctx.today} tz={data.ctx.timezone} steps={data.steps} history={data.history} research={data.research} />;
}

/** A new goal has nothing in it yet: three ways to get it moving (people, fit, rooms). */
function StartHere({ g }: { g: GoalDetail }) {
  const step = "grid gap-1.5 rounded-md border border-border bg-surface p-4";
  return (
    <section aria-labelledby="start" className="mb-8 grid gap-3">
      <div>
        <h2 id="start" className="font-semibold">
          Start here
        </h2>
        <p className="text-small text-muted">Your goal is saved. Get it moving with any of these.</p>
      </div>
      <ol className="grid gap-3 md:grid-cols-3">
        <li className={step}>
          <span className="font-[550]">1. Add people who can help</span>
          <span className="text-small text-muted">Pick people you already know. They go into the pipeline below.</span>
          <div className="pt-1">
            <Button asChild size="sm" variant="primary">
              <Link href={`/goals/${g.id}?add=1`} replace scroll={false}>
                Add people
              </Link>
            </Button>
          </div>
        </li>
        <li className={step}>
          <span className="font-[550]">2. Find who fits</span>
          <span className="text-small text-muted">Scores people in {g.space.name} against your goals and suggests the strongest fits.</span>
          <div className="pt-1">
            <AiJobButton aiEnabled={isAiConfigured()} job={{ kind: "score", spaceId: g.space.id }} label="Find who fits" />
          </div>
        </li>
        <li className={step}>
          <span className="font-[550]">3. Find rooms to be in</span>
          <span className="text-small text-muted">Events in the next three weeks, matched to this goal and where your network gathers.</span>
          <div className="pt-1">
            <Button asChild size="sm">
              <Link href="/rooms#radar">Open Radar</Link>
            </Button>
          </div>
        </li>
      </ol>
    </section>
  );
}

function GoalView({
  g,
  today,
  tz,
  steps,
  history,
  research,
}: {
  g: GoalDetail;
  today: string;
  tz: string;
  steps: GoalStep[];
  history: { start: string; done: number }[];
  research: Record<string, StepResearch>;
}) {
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
      {g.active && !g.archived ? <WeekCelebration goals={[{ id: g.id, text: g.text, done: m.done, target: m.target }]} week={weekOf(today).start} /> : null}
      <PageHeader
        title={g.text}
        subtitle={subtitle}
        actions={<GoalActions goalId={g.id} text={g.text} spaceId={g.space.id} spaceName={g.space.name} stages={g.stages} active={g.active} archived={g.archived} />}
      />

      {g.active && !g.archived && !g.people && !g.rooms.length && !steps.length ? <StartHere g={g} /> : null}

      {g.active && !g.archived ? (
        <section aria-labelledby="week" className="mb-8 grid max-w-[560px] gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="week" className="font-semibold">
              This week
            </h2>
            <span className="flex items-center gap-2 text-small text-muted">
              {m.done >= m.target ? <TargetHit /> : null}
              {m.done} of {m.target} · {m.label}
            </span>
          </div>
          <Meter value={m.done} max={m.target} label="This week" valueText={`${m.done} of ${m.target}`} />
          <p className="text-small text-muted">{progressSummary(g.progress)}</p>
          {history.some((w) => w.done) ? <div className="pt-3"><WeekTrend weeks={history} target={g.weeklyTarget} /></div> : null}
        </section>
      ) : null}

      {!g.archived ? (
        <Section title="Next steps" className="max-w-[720px]">
          <GoalSteps
            goalId={g.id}
            goalText={g.text}
            today={today}
            aiEnabled={isAiConfigured()}
            steps={steps.map((s) => ({ id: s.id, text: s.text, dueOn: s.dueOn, done: Boolean(s.doneAt), fromPrep: s.fromPrep, research: research[s.id] ?? null }))}
          />
        </Section>
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
