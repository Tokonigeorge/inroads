import Link from "next/link";
import { Suspense } from "react";
import { weekOf } from "@/domain/goal-progress";
import { hourIn } from "@/domain/greeting";
import { formatTime } from "@/domain/zoned";
import { briefMessage } from "@/features/v2/brief-message";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { listConnections } from "@/server/repos/connections";
import { listNudges, todayAgenda } from "@/server/repos/nudges";
import { weekStats } from "@/server/repos/week-stats";
import { userContext } from "@/server/user-context";

export const metadata = { title: "Brief" };

const dateLine = (tz: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: tz }).format(new Date());

/** The Brief: what Inroads thinks matters today, today's meetings and promises, and how the week is going. */
export default function BriefPage() {
  return (
    <Suspense fallback={<BriefLoading />}>
      <Brief />
    </Suspense>
  );
}

function Top() {
  return (
    <div className="v2-top">
      <span className="v2-brand"><span className="ir-mark" style={{ ["--size" as string]: "22px" }} />Inroads 2</span>
      <Link href="/today">Back to the current app</Link>
    </div>
  );
}

/** While the brief loads: the painted header and soft skeletons in the shape of what's coming. */
function BriefLoading() {
  return (
    <main className="v2-page" aria-busy="true">
      <header className="v2-head">
        <div className="ir-wash ir-wash--fade" />
        <Top />
        <span className="ir-skel" style={{ display: "block", height: 12, width: 140, marginBottom: 10 }} />
        <span className="ir-skel" style={{ display: "block", height: 72, width: 220 }} />
      </header>
      <span className="ir-skel" style={{ display: "block", height: 88 }} />
      <span className="ir-skel" style={{ display: "block", height: 96, borderRadius: 24 }} />
    </main>
  );
}

async function Brief() {
  const user = await requireUser();
  const data = await db.withUser(user.id, async (tx) => {
    const ctx = await userContext(tx);
    const c = { spaceId: null, today: ctx.today, tz: ctx.timezone };
    const [[p], nudges, agenda, week, reconnect] = await Promise.all([
      tx.select({ name: t.profiles.name }).from(t.profiles),
      listNudges(tx, c),
      todayAgenda(tx, c),
      weekStats(tx, { start: weekOf(ctx.today).start, today: ctx.today, tz: ctx.timezone }),
      listConnections(tx).then((all) => all.filter((a) => a.status === "error" && a.lastError === "reconnect").map((a) => a.accountEmail ?? a.provider)),
    ]);
    return { first: (p?.name ?? "").trim().split(/\s+/)[0] ?? "", hour: hourIn(ctx.timezone), tz: ctx.timezone, nudges, agenda, week, reconnect };
  });
  const hello = data.hour < 12 ? "Morning" : data.hour < 17 ? "Afternoon" : "Evening";
  const promises = data.nudges.filter((n) => n.kind === "promise" && n.person);
  // Prep cards are about today's meetings, which already have their own rows.
  const others = data.nudges.filter((n) => n.kind !== "promise" && n.kind !== "prep").length;
  const message = briefMessage(
    {
      meetings: data.agenda.map((a) => ({ title: a.title, time: a.time, person: a.attendees[0]?.name ?? null })),
      promises: promises.map((n) => ({ person: n.person!.name, overdue: n.priority === 0 })),
      others,
    },
    formatTime,
  );

  return (
    <main className="v2-page">
      <header className="v2-head">
        <div className="ir-wash ir-wash--fade" />
        <Top />
        <p className="v2-date">{dateLine(data.tz)} · Daily brief</p>
        <h1 className="v2-hello">
          {hello},
          {data.first ? (
            <>
              <br />
              <span>{data.first}.</span>
            </>
          ) : null}
        </h1>
      </header>

      <div className="ir-thread">
        <div className="ir-msg">
          <span className="ir-mark" />
          <p className="ir-bubble">
            {message.map((m, i) => (m.bold ? <b key={i}>{m.text}</b> : <span key={i}>{m.text}</span>))}
          </p>
        </div>
        {data.reconnect.length ? (
          <div className="ir-msg" role="alert">
            <span className="ir-mark" />
            <p className="ir-bubble">
              <b>Your calendar has stopped syncing.</b> Google needs you to sign in again ({data.reconnect.join(", ")}).{" "}
              <Link href="/settings/connections">Reconnect</Link>
            </p>
          </div>
        ) : null}
      </div>

      {data.nudges.length ? (
        <Link href="/today" className="ir-ready">
          <span className="ir-ready__n">{data.nudges.length}</span>
          <span className="ir-ready__t">{data.nudges.length === 1 ? "thing needs you today" : "things need you today"}</span>
          <span className="ir-ready__go" aria-hidden>→</span>
          <span className="ir-ready__s">Open them in the current app until the Inbox moves here.</span>
        </Link>
      ) : null}

      {data.agenda.length || promises.length ? (
        <section className="v2-sec" aria-labelledby="v2-today">
          <h2 className="ir-label" id="v2-today">
            <span>Today</span>
            <Link href="/rooms">Calendar</Link>
          </h2>
          <ul className="ir-rows">
            {data.agenda.map((a) => {
              const who = a.attendees[0];
              const meta = [
                a.attendees.length > 1 ? `${a.attendees.length} people` : who ? (who.detail || who.name) : a.location,
                who?.talkingPoints[0] ? `ask about ${lowerFirst(who.talkingPoints[0])}` : who?.promise ? `you owe: ${lowerFirst(who.promise)}` : a.localTimeLabel,
              ].filter(Boolean);
              return (
                <li key={`${a.eventId}:${a.occurrenceOn}`}>
                  <Link href={`/rooms/${a.eventId}`} className="ir-row">
                    <Initials name={who?.name ?? a.title} tone={who ? undefined : "blue"} />
                    <span className="v2-row-text">
                      <span className="ir-row__name">{who && a.attendees.length === 1 ? `${a.title} · ${first(who.name)}` : a.title}</span>
                      {meta.length ? <span className="ir-row__meta">{meta.join(" · ")}</span> : null}
                    </span>
                    <span className="ir-row__end">{a.time ? formatTime(a.time) : "All day"}</span>
                  </Link>
                </li>
              );
            })}
            {promises.map((n) => (
              <li key={n.key}>
                <Link href={`/people/${n.person!.id}`} className="ir-row">
                  <Initials name={n.person!.name} tone="sun" />
                  <span className="v2-row-text">
                    <span className="ir-row__name">{n.title}</span>
                    <span className="ir-row__meta">{n.progress ?? n.body}</span>
                  </span>
                  {n.priority === 0 ? <span className="ir-row__due">Overdue</span> : <span className="ir-row__end">Promise</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="v2-sec" aria-labelledby="v2-week">
        <h2 className="ir-label" id="v2-week">
          <span>This week</span>
          <Link href="/today?view=week">Weekly brief</Link>
        </h2>
        <dl className="v2-stats">
          <div className="v2-stat v2-stat--sky">
            <dt>people you were in touch with</dt>
            <dd>{data.week.talkedTo}</dd>
          </div>
          <div className="v2-stat v2-stat--sage">
            <dt>{data.week.promisesKept === 1 ? "promise kept" : "promises kept"}</dt>
            <dd>{data.week.promisesKept}</dd>
          </div>
          <div className="v2-stat v2-stat--peach">
            <dt>{data.week.promisesOpen === 1 ? "promise still open" : "promises still open"}</dt>
            <dd>{data.week.promisesOpen}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}

const first = (name: string) => name.trim().split(/\s+/)[0] || name;
const lowerFirst = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);

function Initials({ name, tone }: { name: string; tone?: "blue" | "sun" | "leaf" | "tomato" }) {
  const letters = name
    .split(/\s+/)
    .filter((w) => /^[\p{L}\p{N}]/u.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span className={`ir-av${tone ? ` ir-av--${tone}` : ""}`} style={{ ["--size" as string]: "34px" }} aria-hidden>
      {letters || "•"}
    </span>
  );
}
