import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { addDays, formatLongDate } from "@/domain/dates";
import { formatTime } from "@/domain/zoned";
import { LoadingRows, PageFrame } from "@/features/shell/page-frame";
import { loadSpaceView } from "@/features/spaces/space-view";
import { Briefs, loadBriefs } from "@/features/ai/briefs";
import { AiJobButton } from "@/features/ai/ai-job-button";
import type { RoomIdea } from "@/features/ai/room-ideas";
import { ForYourGoals, type GoalRooms } from "@/features/today/for-your-goals";
import { NudgeFeed } from "@/features/today/nudge-feed";
import { ThisWeek, type WeekRoom } from "@/features/today/this-week";
import { requireUser } from "@/server/auth";
import { isAiConfigured } from "@/server/ai/config";
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import type { Tx } from "@/server/db/with-user";
import { prepJobKind } from "@/server/jobs/ai-jobs";
import { dueGoalSteps } from "@/server/repos/goal-steps";
import { getAccountOverview } from "@/server/repos/account";
import { listUpcoming } from "@/server/repos/rooms";
import { listNudges, personSpacesFor, todayAgenda, type AgendaEntry } from "@/server/repos/nudges";
import { userContext } from "@/server/user-context";
import { Button } from "@/ui/button";
import { EmptyState, PageHeader, Section } from "@/ui/layout";
import { Avatar } from "@/ui/list-row";

export const metadata: Metadata = { title: "Today" };
// AI jobs started here may run right after the response (without Inngest).
export const maxDuration = 300;

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
  const [{ profile, counts }, data] = await Promise.all([
    getAccountOverview(user.id),
    db.withUser(user.id, async (tx) => {
      const [view, ctx] = await Promise.all([loadSpaceView(tx), userContext(tx)]);
      const c = { spaceId: view.selected?.id ?? null, today: ctx.today, tz: ctx.timezone };
      const [agenda, nudges] = await Promise.all([todayAgenda(tx, c), listNudges(tx, c)]);
      const spaces = await personSpacesFor(
        tx,
        nudges.flatMap((n) => (n.person ? [n.person.id] : [])),
      );
      // Briefs: the selected Space, or each Space with people in it.
      const briefSpaces = (view.selected ? [view.selected] : view.spaces.filter((s) => s.people > 0)).map((s) => ({ id: s.id, name: s.name }));
      const briefs = await loadBriefs(tx, briefSpaces, ctx.today);
      const steps = await dueGoalSteps(tx, addDays(ctx.today, 2), c.spaceId);
      // Rooms on today's agenda that already have a plan (the rest get a Prepare link).
      const agendaIds = [...new Set(agenda.map((a) => a.eventId))];
      const planned = agendaIds.length
        ? new Set((await tx.selectDistinct({ id: t.searches.eventId }).from(t.searches).where(inArray(t.searches.eventId, agendaIds))).map((r) => r.id!))
        : new Set<string>();
      const goalRooms = await loadGoalRooms(tx, view, ctx.today);
      const week = await loadWeek(tx, c);
      const [anyGoal] = await tx.select({ id: t.goals.id }).from(t.goals).where(and(isNull(t.goals.archivedAt), eq(t.goals.example, false))).limit(1);
      return { hasGoals: Boolean(anyGoal), agenda, planned, nudges, spaces, briefSpaces, briefs, steps, goalRooms, week, today: ctx.today, spaceName: view.selected?.name ?? null };
    }),
  ]);
  const firstName = profile.name.split(/\s+/)[0];
  const setUp = !(profile.onboardingState as { completedAt?: string } | null)?.completedAt;
  const greeting = firstName ? `Welcome back, ${firstName}.` : "Welcome to Inroads.";
  return (
    <>
      <PageHeader title={formatLongDate(data.today)} subtitle={data.spaceName ? `${greeting} Showing ${data.spaceName}.` : greeting} />
      {setUp ? (
        <section className="mb-8 grid gap-3 rounded-md border border-border bg-surface p-4">
          <h2 className="font-semibold">Finish setting up</h2>
          <p className="text-muted">Set your time zone and connect Google, Outlook or a calendar link so Inroads knows who you meet.</p>
          <div>
            <Button asChild variant="primary" size="sm">
              <Link href="/onboarding">Set up Inroads</Link>
            </Button>
          </div>
        </section>
      ) : null}
      {!setUp && !data.hasGoals ? (
        <section aria-label="Set your goals" className="mb-8 grid gap-3 rounded-md border border-border bg-surface p-4">
          <h2 className="font-semibold">Tell Inroads what you&apos;re working towards</h2>
          <p className="text-muted">Raising, winning clients, hiring: goals decide who Inroads suggests you meet, which rooms it finds for you and what your briefs focus on.</p>
          <div>
            <Button asChild variant="primary" size="sm">
              <Link href="/onboarding?step=goals">Set your goals</Link>
            </Button>
          </div>
        </section>
      ) : null}
      {counts.people > 0 ? <Briefs spaces={data.briefSpaces} briefs={data.briefs} /> : null}
      <div className="grid gap-8 md:grid-cols-[3fr_2fr]">
        <div className="grid content-start gap-8">
        <Section title="Today's rooms">
          {data.agenda.length ? (
            <Agenda items={data.agenda} today={data.today} planned={data.planned} aiEnabled={isAiConfigured()} />
          ) : (
            <EmptyState
              action={
                <Button asChild size="sm">
                  <Link href="/rooms/new">Add a room</Link>
                </Button>
              }
            >
              {data.week.length
                ? "Nothing on today. Your next rooms are below, with where each plan stands."
                : "Nothing on today. Rooms you add or sync from your calendar show here with notes on who you'll see."}
            </EmptyState>
          )}
        </Section>
        {data.week.length ? (
          <Section title="Coming up this week">
            <ThisWeek rooms={data.week} today={data.today} />
          </Section>
        ) : null}
        </div>
        <Section title={data.nudges.length ? `Follow up · ${data.nudges.length}` : "Follow up"}>
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
            <NudgeFeed nudges={data.nudges} spaces={data.spaces} aiEnabled={isAiConfigured()} />
          )}
        </Section>
      </div>
      <ForYourGoals
        steps={data.steps}
        rooms={data.goalRooms.rooms}
        today={data.today}
        canSearch={data.goalRooms.rooms || !data.goalRooms.spaceId ? null : { spaceId: data.goalRooms.spaceId, aiEnabled: isAiConfigured() }}
      />
    </>
  );
}

/**
 * Rooms for your goals this week: the newest weekly search (from the last 10 days) for the
 * Space you're looking at, or your first Space with goals. Dated ones this week first.
 */
async function loadGoalRooms(tx: Tx, view: Awaited<ReturnType<typeof loadSpaceView>>, today: string): Promise<{ spaceId: string | null; rooms: GoalRooms }> {
  const candidates = view.selected ? [view.selected] : view.spaces;
  const withGoals = await tx
    .selectDistinct({ spaceId: t.goals.spaceId })
    .from(t.goals)
    .where(and(eq(t.goals.active, true), isNull(t.goals.archivedAt), eq(t.goals.example, false)));
  const space = candidates.find((sp) => withGoals.some((g) => g.spaceId === sp.id));
  if (!space) return { spaceId: null, rooms: null };
  const [latest] = await tx
    .select({ id: t.searches.id, result: t.searches.result })
    .from(t.searches)
    .where(and(eq(t.searches.type, "radar"), eq(t.searches.spaceId, space.id), sql`${t.searches.createdAt} > now() - interval '10 days'`))
    .orderBy(desc(t.searches.createdAt))
    .limit(1);
  if (!latest) return { spaceId: space.id, rooms: null };
  const week = addDays(today, 7);
  const items = ((latest.result as { items?: RoomIdea[] }).items ?? [])
    .filter((i) => (i.date ? i.date >= today && i.date <= week : i.confidence !== "idea"))
    .slice(0, 3);
  return { spaceId: space.id, rooms: { searchId: latest.id, spaceId: space.id, items } };
}

/**
 * Rooms (not 1:1 meetings) in the next seven days, after today, with where each plan stands:
 * ready (and what it found), being prepared, or not started.
 */
async function loadWeek(tx: Tx, c: { spaceId: string | null; today: string; tz: string }): Promise<WeekRoom[]> {
  const sessions = (await listUpcoming(tx, c.spaceId, c.today, c.tz, 7)).filter((s) => s.date > c.today && s.kind !== "meeting").slice(0, 6);
  const ids = [...new Set(sessions.map((s) => s.eventId))];
  if (!ids.length) return [];
  const [plans, running] = await Promise.all([
    tx
      .selectDistinctOn([t.searches.eventId], { eventId: t.searches.eventId, result: t.searches.result })
      .from(t.searches)
      .where(inArray(t.searches.eventId, ids))
      .orderBy(t.searches.eventId, desc(t.searches.createdAt)),
    tx
      .select({ kind: t.jobs.kind })
      .from(t.jobs)
      .where(and(inArray(t.jobs.kind, ids.map(prepJobKind)), inArray(t.jobs.status, ["queued", "running"]), sql`${t.jobs.createdAt} > now() - interval '15 minutes'`)),
  ]);
  const busy = new Set(running.map((r) => r.kind));
  return sessions.map((s) => {
    const p = plans.find((x) => x.eventId === s.eventId)?.result as { stakeholders?: unknown[]; opportunities?: unknown[] } | undefined;
    const plan: WeekRoom["plan"] = p
      ? { state: "ready", toMeet: p.stakeholders?.length ?? 0, openings: p.opportunities?.length ?? 0 }
      : busy.has(prepJobKind(s.eventId))
        ? { state: "preparing" }
        : { state: "none" };
    return { eventId: s.eventId, title: s.title, date: s.date, time: s.time, location: s.location, plan };
  });
}

function Agenda({ items, today, planned, aiEnabled }: { items: AgendaEntry[]; today: string; planned: Set<string>; aiEnabled: boolean }) {
  return (
    <ol className="grid gap-4">
      {items.map((a) => (
        <li key={`${a.eventId}:${a.occurrenceOn}`} className="grid grid-cols-[4.5rem_1fr] gap-3 border-b border-border pb-4 last:border-b-0">
          <div className="text-small text-muted tabular">
            {a.time ? formatTime(a.time) : "All day"}
            {a.localTimeLabel ? <span className="block">{a.localTimeLabel}</span> : null}
          </div>
          <div className="grid min-w-0 gap-2">
            <div>
              <Link href={`/rooms/${a.eventId}`} className="font-semibold hover:underline">
                {a.title}
              </Link>
              {a.location ? <p className="text-small text-muted">{a.location}</p> : null}
              {a.kind !== "meeting" ? (
                <Link href={`/rooms/${a.eventId}`} className="text-small font-[550] text-accent hover:underline">
                  {planned.has(a.eventId) ? "Your plan for this room" : "Prepare for this room"}
                </Link>
              ) : null}
            </div>
            {a.attendees.length ? (
              <ul className="grid gap-3" aria-label={`Who you'll see at ${a.title}`}>
                {a.attendees.map((p) => (
                  <li key={p.id} className="flex gap-3">
                    <Avatar name={p.name} size={24} />
                    <div className="grid min-w-0 gap-0.5 text-small">
                      <p>
                        <Link href={`/people/${p.id}`} className="font-[550] hover:underline">
                          {p.name}
                        </Link>
                        {p.detail ? <span className="text-muted"> · {p.detail}</span> : null}
                      </p>
                      <p className="text-muted">
                        {p.lastTouch ? `Last: ${formatLongDate(p.lastTouch.on, today)}${p.lastTouch.summary ? ` · ${p.lastTouch.summary}` : ""}` : "No touches logged yet"}
                      </p>
                      {p.promise ? <p>You owe: {p.promise}</p> : null}
                      {p.talkingPoints.length ? (
                        <ul className="grid list-disc gap-0.5 pl-4" aria-label={`Talk to ${p.name.split(/\s+/)[0]} about`}>
                          {p.talkingPoints.map((x) => (
                            <li key={x}>{x}</li>
                          ))}
                        </ul>
                      ) : !p.researched && aiEnabled ? (
                        <div>
                          <AiJobButton aiEnabled variant="ghost" job={{ kind: "research", personId: p.id, spaceId: p.spaceId, mode: "research" }} label={`Research ${p.name.split(/\s+/)[0]} before you go`} />
                        </div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-small text-muted">No one linked yet. Add who&apos;s going from the room.</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
