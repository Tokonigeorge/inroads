import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { and, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { addDays, type IsoDate } from "@/domain/dates";
import { progressMeter, weekOf } from "@/domain/goal-progress";
import { hourIn, nowMs } from "@/domain/greeting";
import { formatTime } from "@/domain/zoned";
import { LoadingRows, PageFrame } from "@/features/shell/page-frame";
import { loadSpaceView } from "@/features/spaces/space-view";
import { BriefBlock, loadBriefs } from "@/features/ai/briefs";
import { AiJobButton } from "@/features/ai/ai-job-button";
import type { RoomIdea } from "@/features/ai/room-ideas";
import { ForYourGoals, type GoalRooms } from "@/features/today/for-your-goals";
import { NudgeFeed } from "@/features/today/nudge-feed";
import { requireUser } from "@/server/auth";
import { isAiConfigured } from "@/server/ai/config";
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import type { Tx } from "@/server/db/with-user";
import { dueGoalSteps } from "@/server/repos/goal-steps";
import { listGoals } from "@/server/repos/goals";
import { getAccountOverview } from "@/server/repos/account";
import { listConnections } from "@/server/repos/connections";
import { listUpcoming } from "@/server/repos/rooms";
import { listNudges, personSpacesFor, todayAgenda, type AgendaEntry } from "@/server/repos/nudges";
import { userContext } from "@/server/user-context";
import { Button } from "@/ui/button";
import { PageHeader, Section } from "@/ui/layout";
import { Avatar } from "@/ui/list-row";
import { Meter } from "@/ui/meter";

export const metadata: Metadata = { title: "Today" };
// AI jobs started here may run right after the response (without Inngest).
export const maxDuration = 300;

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayOf = (iso: IsoDate) => new Date(`${iso}T00:00:00Z`);
/** "Mon 26 Oct 2026" (prototype fmtDate with dow and year). */
const stampDate = (iso: IsoDate) => {
  const d = dayOf(iso);
  return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
const shortDate = (iso: IsoDate) => `${dayOf(iso).getUTCDate()} ${MONTHS[dayOf(iso).getUTCMonth()]}`;

export default function TodayPage({ searchParams }: PageProps<"/today">) {
  return (
    <PageFrame>
      <Suspense fallback={<LoadingRows />}>
        <Today searchParams={searchParams} />
      </Suspense>
    </PageFrame>
  );
}

/**
 * Today, as the prototype has it (L750–764): a hero with the greeting, a one-line summary and a
 * Today / This week toggle; the start card or the goals card when they apply; today's rooms with
 * prep under each person and the daily brief (or the week at a glance and the weekly brief);
 * then every nudge as a card.
 */
async function Today({ searchParams }: { searchParams: PageProps<"/today">["searchParams"] }) {
  const weekly = (await searchParams).view === "week";
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
      const reconnect = (await listConnections(tx)).filter((a) => a.status === "error" && a.lastError === "reconnect").map((a) => a.accountEmail ?? a.provider);
      const [anyGoal] = await tx.select({ id: t.goals.id }).from(t.goals).where(and(isNull(t.goals.archivedAt), eq(t.goals.example, false), eq(t.goals.active, true))).limit(1);
      const week = weekly ? await loadWeek(tx, view, c) : null;
      return {
        hasGoals: Boolean(anyGoal),
        agenda,
        nudges,
        spaces,
        briefSpaces,
        briefs,
        reconnect,
        week,
        hour: hourIn(ctx.timezone),
        now: nowMs(),
        today: ctx.today,
        spaceName: view.selected?.name ?? null,
      };
    }),
  ]);
  const first = profile.name.split(/\s+/)[0];
  const greet = data.hour < 12 ? "Good morning" : data.hour < 17 ? "Good afternoon" : "Good evening";
  const cooling = data.nudges.filter((n) => n.kind === "due").length;
  const promises = data.nudges.filter((n) => n.kind === "promise").length;
  const summary = [
    `${data.agenda.length} ${data.agenda.length === 1 ? "room" : "rooms"} today`,
    cooling ? `${cooling} cooling` : "",
    promises ? `${promises} ${promises === 1 ? "promise" : "promises"} open` : "",
    data.spaceName ? `Showing ${data.spaceName}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const ai = isAiConfigured();

  return (
    <>
      <PageHeader
        stamp={`${stampDate(data.today)} · ${weekly ? "Weekly" : "Daily"} brief`}
        title={`${greet}${first ? `, ${first}` : ""}`}
        subtitle={summary}
        actions={
          <nav aria-label="Brief" className="inline-flex max-w-full gap-0.5 rounded-full border border-line bg-sunk p-[3px]">
            {[
              { href: "/today", label: "Today", on: !weekly },
              { href: "/today?view=week", label: "This week", on: weekly },
            ].map((x) => (
              <Link
                key={x.href}
                href={x.href}
                aria-current={x.on ? "page" : undefined}
                className={`rounded-full px-3.5 py-[7px] text-[13.5px] font-semibold whitespace-nowrap ${x.on ? "bg-surface text-ink shadow-[0_1px_2px_rgb(0_0_0/0.1)]" : "text-muted hover:text-ink"}`}
              >
                {x.label}
              </Link>
            ))}
          </nav>
        }
      />
      {data.reconnect.length ? (
        <section aria-label="Reconnect" role="alert" className="card mb-2 flex flex-wrap items-center gap-3 border border-bad/50 p-4">
          <p className="min-w-0 flex-1">
            <span className="font-semibold">Your calendar has stopped syncing.</span>{" "}
            <span className="text-muted">Google needs you to sign in again ({data.reconnect.join(", ")}). New meetings won&apos;t show up until you do.</span>
          </p>
          <Button asChild variant="primary" size="sm">
            <Link href="/settings/connections">Reconnect Google</Link>
          </Button>
        </section>
      ) : null}
      {counts.people === 0 && counts.events === 0 ? (
        <StartCard />
      ) : !data.hasGoals ? (
        <section aria-label="Set your goals" className="card mt-1.5 grid gap-3 p-3.5" style={{ ["--nk" as string]: "var(--hot)" }}>
          <p className="inline-flex items-center gap-[7px] font-mono text-[11px] leading-none tracking-[0.08em] text-muted uppercase">
            <i aria-hidden className="size-2 rounded-[2px] bg-[var(--nk)]" />
            Set up
          </p>
          <div>
            <h3>Tell Inroads what you&apos;re working toward</h3>
            <p className="mt-[3px] text-[14px] text-muted">Goals drive the fit scores, research angles and your briefs. Raising capital, landing clients, hiring: add one or two.</p>
          </div>
          <div>
            <Button asChild variant="primary" size="sm">
              <Link href="/onboarding?step=goals">Set your goals</Link>
            </Button>
          </div>
        </section>
      ) : null}

      {weekly && data.week ? (
        <Section title={`Week of ${shortDate(data.week.start)} – ${shortDate(data.week.end)}`}>
          <WeekGrid week={data.week} aiEnabled={ai} />
          {counts.people > 0 ? <BriefBlock kind="weekly" spaces={data.briefSpaces} briefs={data.briefs} now={data.now} /> : null}
          <ForYourGoals
            steps={data.week.steps}
            rooms={data.week.goalRooms.rooms}
            today={data.today}
            canSearch={data.week.goalRooms.rooms || !data.week.goalRooms.spaceId ? null : { spaceId: data.week.goalRooms.spaceId, aiEnabled: ai }}
          />
        </Section>
      ) : (
        <Section
          title="Today's rooms"
          action={
            <Button asChild size="sm">
              <Link href={`/rooms/new?date=${data.today}`}>+ Event</Link>
            </Button>
          }
        >
          {data.agenda.length ? (
            <Agenda items={data.agenda} aiEnabled={ai} />
          ) : (
            <p className="rounded-md border border-dashed border-line bg-sunk p-3.5 text-[14.5px] text-muted">
              Nothing on the calendar today.{" "}
              <Link href="/settings/connections" className="font-semibold text-accent hover:underline">
                Import your calendar
              </Link>{" "}
              or add an event.
            </p>
          )}
          {counts.people > 0 ? <BriefBlock kind="daily" spaces={data.briefSpaces} briefs={data.briefs} now={data.now} /> : null}
        </Section>
      )}

      <Section title="Nudges" count={data.nudges.length}>
        <NudgeFeed nudges={data.nudges} spaces={data.spaces} aiEnabled={ai} />
      </Section>
    </>
  );
}

/** First run (prototype L767–771): bring people in, set goals, or load the examples. */
function StartCard() {
  return (
    <section aria-label="Get started" className="card mt-1.5 grid gap-3 p-[18px]">
      <h2>Start with the people you already know</h2>
      <p className="text-[13.5px] text-muted">
        Bring in your phone contacts or LinkedIn connections, then add context to the ones that matter. Or load a small example network to see every feature working.
      </p>
      <ol className="grid list-decimal gap-1 pl-5 text-[14.5px] text-muted">
        <li>Set your goals so Inroads knows what matters</li>
        <li>Add or import people, with where you met</li>
        <li>Research before meetings and let the briefs do the rest</li>
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="primary">
          <Link href="/settings/connections">Import from Google</Link>
        </Button>
        <Button asChild>
          <Link href="/settings/connections#files">Other contacts file</Link>
        </Button>
        <Button asChild>
          <Link href="/people/new">+ Add person</Link>
        </Button>
        <Button asChild>
          <Link href="/onboarding?step=goals">Set goals</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/settings#data">Load examples</Link>
        </Button>
      </div>
    </section>
  );
}

type Week = Awaited<ReturnType<typeof loadWeek>>;

/** The week at a glance (prototype L801–815): rooms to be in, who's going cold, new openings, goal progress. */
async function loadWeek(tx: Tx, view: Awaited<ReturnType<typeof loadSpaceView>>, c: { spaceId: string | null; today: IsoDate; tz: string }) {
  const { start, end } = weekOf(c.today);
  const since = new Date(`${addDays(c.today, -7)}T00:00:00Z`);
  const [rooms, goals, people, searches, steps, goalRooms, cold] = await Promise.all([
    listUpcoming(tx, c.spaceId, c.today, c.tz, Math.max(0, (Date.parse(end) - Date.parse(c.today)) / 86_400_000)),
    listGoals(tx, { spaceId: c.spaceId, today: c.today, tz: c.tz }),
    tx
      .selectDistinctOn([t.dossiers.personId], { id: t.people.id, name: t.people.name, payload: t.dossiers.payload })
      .from(t.dossiers)
      .innerJoin(t.people, eq(t.people.id, t.dossiers.personId))
      .where(and(gt(t.dossiers.createdAt, since), isNull(t.people.deletedAt), c.spaceId ? eq(t.dossiers.spaceId, c.spaceId) : undefined))
      .orderBy(t.dossiers.personId, desc(t.dossiers.createdAt))
      .limit(20),
    tx
      .select({ id: t.searches.id, query: t.searches.query, result: t.searches.result })
      .from(t.searches)
      .where(and(gt(t.searches.createdAt, since), ne(t.searches.type, "radar"), c.spaceId ? eq(t.searches.spaceId, c.spaceId) : undefined))
      .orderBy(desc(t.searches.createdAt))
      .limit(3),
    dueGoalSteps(tx, addDays(c.today, 2), c.spaceId),
    loadGoalRooms(tx, view, c.today),
    listNudges(tx, c),
  ]);
  const openings = [
    ...people.flatMap((p) => {
      const o = (p.payload as { opportunities?: unknown[] }).opportunities?.[0];
      const text = typeof o === "string" ? o : o && typeof o === "object" ? String((o as { idea?: unknown; text?: unknown }).idea ?? (o as { text?: unknown }).text ?? "") : "";
      return text ? [{ kind: "Person" as const, href: `/people/${p.id}`, name: p.name, text }] : [];
    }),
    ...searches.map((s) => {
      const r = s.result as { title?: string; opportunities?: { idea?: string }[] };
      return { kind: "Room" as const, href: `/discover/${s.id}`, name: r.title || s.query, text: r.opportunities?.[0]?.idea ?? "" };
    }),
  ].slice(0, 6);
  return {
    start,
    end,
    rooms: rooms.slice(0, 7),
    cold: cold.filter((n) => n.kind === "due").slice(0, 5),
    openings,
    goals: goals.filter((g) => g.active && !g.archived),
    steps,
    goalRooms,
  };
}

function WeekGrid({ week, aiEnabled }: { week: Week; aiEnabled: boolean }) {
  const box = "grid min-w-0 content-start gap-2.5 rounded-lg border border-line bg-surface p-3.5";
  const row = "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 text-[14px]";
  const dt = "w-[52px] font-mono text-[12px] leading-none font-semibold text-muted";
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-3">
      <section aria-label="Rooms to be in" className={box}>
        <h3>Rooms to be in</h3>
        {week.rooms.length ? (
          <ul className="grid gap-2">
            {week.rooms.map((r) => (
              <li key={`${r.eventId}:${r.occurrenceOn}`} className={row}>
                <span className={dt}>{`${DOW[dayOf(r.date).getUTCDay()]} ${dayOf(r.date).getUTCDate()}`}</span>
                <Link href={`/rooms/${r.eventId}`} className="truncate font-semibold hover:underline">
                  {r.title}
                </Link>
                <span />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13.5px] text-muted">No events this week. Check the radar on the Events tab.</p>
        )}
      </section>
      <section aria-label="Going cold" className={box}>
        <h3>Going cold</h3>
        {week.cold.length ? (
          <ul className="grid gap-2">
            {week.cold.map((n) => (
              <li key={n.key} className={row}>
                <span className={dt}>{/^(\d+) days/.exec(n.title)?.[1] ? `${/^(\d+) days/.exec(n.title)![1]}d` : "new"}</span>
                <Link href={`/people/${n.person!.id}`} className="truncate font-semibold hover:underline">
                  {n.person!.name}
                </Link>
                {aiEnabled ? (
                  <Link href={`/people/${n.person!.id}?draft=checkin`} className="text-[14px] font-semibold text-accent hover:underline">
                    Draft
                  </Link>
                ) : (
                  <span />
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13.5px] text-muted">No priority relationships are overdue.</p>
        )}
      </section>
      <section aria-label="New openings" className={box}>
        <h3>New openings</h3>
        {week.openings.length ? (
          <ul className="grid gap-2">
            {week.openings.map((o, i) => (
              <li key={i} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2.5 text-[14px]">
                <span className={dt}>{o.kind}</span>
                <span className="truncate">
                  <Link href={o.href} className="font-semibold hover:underline">
                    {o.name}
                  </Link>
                  {o.text ? `: ${o.text}` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13.5px] text-muted">Research someone or decode a room and new openings collect here.</p>
        )}
      </section>
      <section aria-label="Goal progress" className={`${box} col-span-full`}>
        <h3>Goal progress</h3>
        {week.goals.length ? (
          week.goals.map((g) => {
            const m = progressMeter(g.progress);
            return (
              <div key={g.id} className="grid gap-1.5">
                <div className="flex justify-between gap-2.5 text-[14px]">
                  <Link href={`/goals/${g.id}`} className="hover:underline">
                    {g.text}
                  </Link>
                  <span className="font-mono text-[13px]">
                    {m.done}/{m.target} touches · {g.people} {g.people === 1 ? "person" : "people"}
                  </span>
                </div>
                <Meter value={m.done} max={m.target} label={`${g.text}: this week`} valueText={`${m.done} of ${m.target}`} />
              </div>
            );
          })
        ) : (
          <p className="text-[13.5px] text-muted">
            No goals yet.{" "}
            <Link href="/onboarding?step=goals" className="font-semibold text-accent hover:underline">
              Add your goals
            </Link>{" "}
            to track weekly progress.
          </p>
        )}
      </section>
    </div>
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

/** Today's rooms (prototype .agenda, L776–790): time on the left, then each person you'll see with prep. */
function Agenda({ items, aiEnabled }: { items: AgendaEntry[]; aiEnabled: boolean }) {
  return (
    <ol aria-label="Today's rooms">
      {items.map((a, i) => (
        <li key={`${a.eventId}:${a.occurrenceOn}`} className={`grid grid-cols-[70px_minmax(0,1fr)] gap-3 py-3.5 ${i ? "border-t border-dashed border-line" : "pt-1"}`}>
          <div className="pt-0.5 font-mono text-[13px] leading-[1.4] font-semibold text-accent">
            {a.time ? formatTime(a.time) : "All day"}
            {a.localTimeLabel ? <span className="block text-muted">{a.localTimeLabel}</span> : null}
          </div>
          <div className="grid min-w-0 justify-items-start gap-2">
            <Link href={`/rooms/${a.eventId}`} className="font-display text-[17px] leading-[1.3] font-[650] hover:underline">
              {a.title}
            </Link>
            {a.location ? <p className="text-[13.5px] text-muted">{a.location}</p> : null}
            {a.attendees.length ? (
              <ul className="grid w-full gap-2" aria-label={`Who you'll see at ${a.title}`}>
                {a.attendees.map((p) => (
                  <li key={p.id} className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2.5 rounded-md border border-line bg-surface px-3 py-2.5">
                    <Avatar name={p.name} size={32} />
                    <div className="grid min-w-0 gap-[3px]">
                      <p>
                        <Link href={`/people/${p.id}`} className="font-[650] hover:underline">
                          {p.name}
                        </Link>
                        {p.detail ? <span className="text-[13.5px] text-muted"> · {p.detail}</span> : null}
                      </p>
                      {p.lastTouch ? (
                        <p className="text-[13.5px] text-muted">
                          Last: {shortDate(p.lastTouch.on)}
                          {p.lastTouch.summary ? ` · ${p.lastTouch.summary}` : ""}
                        </p>
                      ) : null}
                      {p.talkingPoints.length ? (
                        <ul className="mt-0.5 grid list-disc gap-0.5 pl-[18px] text-[14px]" aria-label={`Talk to ${p.name.split(/\s+/)[0]} about`}>
                          {p.talkingPoints.map((x) => (
                            <li key={x}>{x}</li>
                          ))}
                        </ul>
                      ) : !p.researched && aiEnabled ? (
                        <div>
                          <AiJobButton aiEnabled variant="link" job={{ kind: "research", personId: p.id, spaceId: p.spaceId, mode: "research" }} label={`Research ${p.name.split(/\s+/)[0]} before you go`} />
                        </div>
                      ) : null}
                      {p.promise ? <p className="text-[13px] font-semibold text-warn">You owe: {p.promise}</p> : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : a.kind !== "meeting" ? (
              <Button asChild size="sm">
                <Link href={`/rooms/${a.eventId}`}>Decode this room</Link>
              </Button>
            ) : (
              <p className="text-[13.5px] text-muted">No one linked yet. Add who&apos;s going from the room.</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
