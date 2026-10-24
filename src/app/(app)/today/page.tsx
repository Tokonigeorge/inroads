import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { formatLongDate } from "@/domain/dates";
import { formatTime } from "@/domain/zoned";
import { LoadingRows, PageFrame } from "@/features/shell/page-frame";
import { loadSpaceView } from "@/features/spaces/space-view";
import { NudgeFeed } from "@/features/today/nudge-feed";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import { getAccountOverview } from "@/server/repos/account";
import { listNudges, personSpacesFor, todayAgenda, type AgendaEntry } from "@/server/repos/nudges";
import { userContext } from "@/server/user-context";
import { Button } from "@/ui/button";
import { EmptyState, PageHeader, Section } from "@/ui/layout";
import { Avatar } from "@/ui/list-row";

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
      return { agenda, nudges, spaces, today: ctx.today, spaceName: view.selected?.name ?? null };
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
      <div className="grid gap-8 md:grid-cols-[3fr_2fr]">
        <Section title="Today's rooms">
          {data.agenda.length ? (
            <Agenda items={data.agenda} today={data.today} />
          ) : (
            <EmptyState
              action={
                <Button asChild size="sm">
                  <Link href="/rooms/new">Add a room</Link>
                </Button>
              }
            >
              Nothing on today. Rooms you add or sync from your calendar show here with notes on who you&apos;ll see.
            </EmptyState>
          )}
        </Section>
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
            <NudgeFeed nudges={data.nudges} spaces={data.spaces} />
          )}
        </Section>
      </div>
    </>
  );
}

function Agenda({ items, today }: { items: AgendaEntry[]; today: string }) {
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
