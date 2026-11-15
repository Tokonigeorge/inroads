import Link from "next/link";
import { Suspense } from "react";
import { hourIn } from "@/domain/greeting";
import { Sun } from "lucide-react";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { listNudges } from "@/server/repos/nudges";
import { userContext } from "@/server/user-context";

export const metadata = { title: "Brief" };

const dateLine = (tz: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: tz }).format(new Date());

/** The Brief (step 1 of Inroads 2): greeting and the count of what needs you. Step 2 brings the full brief here. */
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
    const [p] = await tx.select({ name: t.profiles.name }).from(t.profiles);
    const nudges = await listNudges(tx, { spaceId: null, today: ctx.today, tz: ctx.timezone });
    return { first: (p?.name ?? "").trim().split(/\s+/)[0] ?? "", hour: hourIn(ctx.timezone), tz: ctx.timezone, count: nudges.length };
  });
  const hello = data.hour < 12 ? "Morning" : data.hour < 17 ? "Afternoon" : "Evening";

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
            This is the new Inroads. I&apos;m moving in piece by piece: <b>your full brief comes here next</b>, then the Inbox. Everything still works in the current app meanwhile.
          </p>
        </div>
      </div>

      {data.count ? (
        <Link href="/today" className="ir-ready">
          <span className="ir-ready__n">{data.count}</span>
          <span className="ir-ready__t">{data.count === 1 ? "thing needs you today" : "things need you today"}</span>
          <span className="ir-ready__go" aria-hidden>→</span>
          <span className="ir-ready__s">Open them in the current app for now.</span>
        </Link>
      ) : (
        <div className="v2-soon">
          <span className="v2-soon__icon"><Sun aria-hidden strokeWidth={1.75} /></span>
          <h2>All clear.</h2>
          <p>Nothing needs you today. I&apos;ll keep an eye out.</p>
        </div>
      )}
    </main>
  );
}
