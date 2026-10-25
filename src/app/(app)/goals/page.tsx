import { Target } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { goalTypeLabels } from "@/contracts/goals";
import { progressMeter, progressSummary } from "@/domain/goal-progress";
import { AiJobButton } from "@/features/ai/ai-job-button";
import { LoadingRows, PageFrame } from "@/features/shell/page-frame";
import { isAiConfigured } from "@/server/ai/config";
import { loadSpaceView } from "@/features/spaces/space-view";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import { listGoals, type GoalSummary } from "@/server/repos/goals";
import { userContext } from "@/server/user-context";
import { Button } from "@/ui/button";
import { EmptyState, PageHeader, Section } from "@/ui/layout";
import { Meter, TargetHit } from "@/ui/meter";

export const metadata: Metadata = { title: "Goals" };
export const maxDuration = 300;

export default function GoalsPage({ searchParams }: PageProps<"/goals">) {
  return (
    <PageFrame>
      <PageHeader
        title="Goals"
        subtitle="What you're working towards, and who can help. Progress counts touches with people on each goal, rooms you went to, and moves in the pipeline."
        actions={
          <Button asChild variant="primary">
            <Link href="/goals/new">Add a goal</Link>
          </Button>
        }
      />
      <Suspense fallback={<LoadingRows />}>
        <Goals searchParams={searchParams} />
      </Suspense>
    </PageFrame>
  );
}

async function Goals({
  searchParams,
}: {
  searchParams: PageProps<"/goals">["searchParams"];
}) {
  const [q, user] = await Promise.all([searchParams, requireUser()]);
  const archived = q.archived === "1";
  const { goals, archivedCount, showSpaces } = await db.withUser(
    user.id,
    async (tx) => {
      const [view, ctx] = await Promise.all([
        loadSpaceView(tx),
        userContext(tx),
      ]);
      const opts = {
        spaceId: view.selected?.id ?? null,
        today: ctx.today,
        tz: ctx.timezone,
      };
      const [goals, archivedGoals] = await Promise.all([
        listGoals(tx, { ...opts, archived }),
        archived
          ? Promise.resolve([])
          : listGoals(tx, { ...opts, archived: true }),
      ]);
      return {
        goals,
        archivedCount: archivedGoals.length,
        showSpaces: !view.selected && view.spaces.length > 1,
      };
    },
  );

  if (archived) {
    return (
      <>
        <Link href="/goals" className="text-small text-muted hover:text-text">
          Back to goals
        </Link>
        <Section title="Archived goals" className="pt-4">
          {goals.length ? (
            <GoalList goals={goals} />
          ) : (
            <EmptyState>Nothing archived.</EmptyState>
          )}
        </Section>
      </>
    );
  }

  const archivedLink = archivedCount ? (
    <Link
      href="/goals?archived=1"
      className="text-small text-muted hover:text-text"
    >
      Archived goals ({archivedCount})
    </Link>
  ) : null;

  if (!goals.length) {
    return (
      <>
        {/* The header already has "Add a goal"; a second button here would just repeat it. */}
        <EmptyState icon={<Target size={18} />}>
          Set a goal, like &quot;Raise a pre-seed round&quot; or &quot;Win three
          clients in Accra&quot;, then add the people who can help.
        </EmptyState>
        {archivedLink}
      </>
    );
  }

  const groups = showSpaces
    ? [...new Map(goals.map((g) => [g.space.id, g.space.name])).entries()]
    : [[null, null] as const];
  return (
    <>
      {groups.map(([spaceId, name]) => {
        const list = spaceId
          ? goals.filter((g) => g.space.id === spaceId)
          : goals;
        return name ? (
          <Section key={spaceId} title={name}>
            <GoalList goals={list} />
          </Section>
        ) : (
          <GoalList key="all" goals={list} />
        );
      })}
      <Section title="Who could help" className="pt-4">
        <p className="pb-3 text-small text-muted">Scores up to 60 people in a Space against its goals. Strong fits come back as suggestions to add to a goal; nothing is added on its own.</p>
        <div className="flex flex-wrap gap-3">
          {[...new Map(goals.filter((g) => g.active).map((g) => [g.space.id, g.space.name])).entries()].map(([spaceId, name]) => (
            <AiJobButton key={spaceId} aiEnabled={isAiConfigured()} job={{ kind: "score", spaceId }} label={`Find who fits in ${name}`} />
          ))}
        </div>
      </Section>
      {archivedLink}
    </>
  );
}

function GoalList({ goals }: { goals: GoalSummary[] }) {
  return (
    <ul className="grid gap-3 pb-6">
      {goals.map((g, i) => {
        const m = progressMeter(g.progress);
        return (
          <li key={g.id} className="rise" style={{ ["--i" as string]: i }}>
            <Link
              href={`/goals/${g.id}`}
              className="lift grid gap-2 rounded-md border border-border bg-surface p-4 hover:border-accent/60"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="flex items-center gap-2 font-semibold">
                  {g.text}
                  {g.active && !g.archived && m.done >= m.target ? <TargetHit /> : null}
                </span>
                <span className="text-small text-muted">
                  {g.archived
                    ? "Archived"
                    : g.active
                      ? `${m.done} of ${m.target} this week · ${m.label}`
                      : "Paused"}
                </span>
              </div>
              {g.active && !g.archived ? (
                <Meter
                  value={m.done}
                  max={m.target}
                  label={`${g.text}: this week`}
                  valueText={`${m.done} of ${m.target}`}
                />
              ) : null}
              <p className="text-small text-muted">
                {goalTypeLabels[g.type]} ·{" "}
                {g.people === 1 ? "1 person" : `${g.people} people`}
                {g.active && !g.archived
                  ? ` · ${progressSummary(g.progress)}`
                  : ""}
              </p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
