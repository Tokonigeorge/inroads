import { desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LookupForm } from "@/features/ai/lookup-form";
import { PlanView } from "@/features/ai/plan";
import { loadSpaceView } from "@/features/spaces/space-view";
import { isAiConfigured } from "@/server/ai/config";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { loadPlan, type Plan } from "@/server/repos/prep";
import { Button } from "@/ui/button";
import { PageHeader, Section } from "@/ui/layout";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Search links (prototype lookupLinks, L1272): Google, LinkedIn, X, News. */
export function LookItUpYourself({ q }: { q: string }) {
  const e = encodeURIComponent(q);
  const links = [
    ["Google", `https://www.google.com/search?q=${e}`],
    ["LinkedIn", `https://www.linkedin.com/search/results/all/?keywords=${e}`],
    ["X", `https://x.com/search?q=${e}`],
    ["News", `https://news.google.com/search?q=${e}`],
  ];
  return (
    <div className="socials">
      {links.map(([label, href]) => (
        <a key={label} href={href} target="_blank" rel="noopener noreferrer">
          {label} ↗
        </a>
      ))}
    </div>
  );
}

/**
 * The prototype's Discover tab (L897–926): the room decoder, the result under it once the
 * search is done, and recent rooms. `resultId` is a finished look-up (/discover/[id]).
 */
export async function DiscoverView({ resultId, q, type }: { resultId?: string; q?: string; type?: string }) {
  const user = await requireUser();
  if (resultId && !/^[0-9a-f-]{36}$/i.test(resultId)) notFound();
  const { view, recent, plan, sources } = await db.withUser(user.id, async (tx) => {
    const view = await loadSpaceView(tx);
    const recent = await tx
      .select({ id: t.searches.id, query: t.searches.query, type: t.searches.type, result: t.searches.result, createdAt: t.searches.createdAt })
      .from(t.searches)
      .where(inArray(t.searches.type, ["person", "company", "place", "event"]))
      .orderBy(desc(t.searches.createdAt))
      .limit(12);
    const plan = resultId ? await loadPlan(tx, resultId) : null;
    const [row] = resultId ? await tx.select({ sources: t.searches.sources }).from(t.searches).where(eq(t.searches.id, resultId)) : [];
    return { view, recent, plan, sources: (row?.sources as { title: string; url: string }[] | undefined) ?? [] };
  });
  if (resultId && !plan) notFound();
  const spaces = view.spaces.map((s) => ({ id: s.id, name: s.name }));
  return (
    <>
      <PageHeader
        stamp="Room decoder"
        title={plan ? <span className="sr-only">Know the room before you walk in</span> : "Know the room before you walk in"}
        subtitle={plan ? undefined : "Search a person, place or event. You get the key people, your warm paths in, and what's in it for your goals."}
      />
      <div className="card p-4">
        <LookupForm key={resultId ?? "new"} spaces={spaces} defaultSpaceId={view.selected?.id ?? spaces[0]?.id ?? ""} aiEnabled={isAiConfigured()} initialQ={q} initialType={type} />
      </div>
      {plan ? <DecodeResult plan={plan} sources={sources} /> : null}
      {recent.filter((r) => r.id !== resultId).length ? (
        <Section title="Recent rooms">
          <ul className="list">
            {recent
              .filter((r) => r.id !== resultId)
              .map((r) => {
                const res = r.result as { title?: string; overview?: string } | null;
                return (
                  <li key={r.id}>
                    <Link href={`/discover/${r.id}`} className="row">
                      <span className="date-tile" aria-hidden>
                        <b>{r.createdAt.getUTCDate()}</b>
                        <i>{MONTHS[r.createdAt.getUTCMonth()]}</i>
                      </span>
                      <span className="grid min-w-0 gap-px">
                        <span className="row-name">{res?.title || r.query}</span>
                        {res?.overview ? <span className="row-sub">{res.overview.slice(0, 110)}</span> : null}
                      </span>
                      <span className="font-mono text-[11px] tracking-[0.06em] text-faint uppercase">{r.type === "company" ? "place" : r.type}</span>
                    </Link>
                  </li>
                );
              })}
          </ul>
        </Section>
      ) : null}
    </>
  );
}

/** A decoded room, in the prototype's order (L910–926). */
function DecodeResult({ plan, sources }: { plan: Plan; sources: { title: string; url: string }[] }) {
  const r = plan.result;
  const isEvent = (r.kind || "").toLowerCase() === "event" || Boolean(r.when?.startsOn);
  return (
    <article aria-label={r.title} className="grid gap-4 pt-[22px]">
      <header className="grid gap-2">
        <p className="stamp">
          {r.kind || "Result"} · confidence {r.confidence || "unknown"}
        </p>
        <h1 className="text-[26px] leading-[1.15] font-[720] tracking-[-0.02em]">{r.title}</h1>
        {sources.length ? (
          <div className="tags">
            <span className="tag">Live web · {sources.length === 1 ? "1 source" : `${sources.length} sources`}</span>
          </div>
        ) : null}
        {r.overview ? <p className="lede">{r.overview}</p> : null}
      </header>
      {r.facts.length || r.website ? (
        <section className="sec" aria-label="Key facts">
          <h3>Key facts</h3>
          {r.facts.length ? (
            <ul className="grid list-disc gap-1 pl-5 text-[14.5px]">
              {r.facts.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          ) : null}
          {r.website ? (
            <div className="socials">
              <a href={r.website} target="_blank" rel="noopener noreferrer">
                Official site ↗
              </a>
            </div>
          ) : null}
        </section>
      ) : null}
      <PlanView plan={plan} />
      {sources.length ? (
        <section className="sec" aria-label="Sources">
          <h3>Sources</h3>
          <ul className="grid gap-1 text-[13.5px]">
            {sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="sec" aria-label="Look it up yourself">
        <h3>Look it up yourself</h3>
        <LookItUpYourself q={r.title} />
      </section>
      {r.verify ? <p className="hint">Verify before relying on it: {r.verify}</p> : null}
      <div className="flex flex-wrap gap-2">
        {plan.eventId ? (
          <Button asChild variant="primary">
            <Link href={`/rooms/${plan.eventId}`}>Open the event</Link>
          </Button>
        ) : isEvent ? (
          <Button asChild variant="primary">
            <Link href={`/rooms/new?prep=${plan.id}`}>+ Add to my events</Link>
          </Button>
        ) : null}
        <Button asChild variant="ghost">
          <Link href="/discover">Clear result</Link>
        </Button>
      </div>
    </article>
  );
}
