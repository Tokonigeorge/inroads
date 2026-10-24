import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { Lookup } from "@/server/ai/prompts/lookup";
import { LoadingRows } from "@/features/shell/page-frame";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { Pane, Section } from "@/ui/layout";

export const metadata: Metadata = { title: "Look up" };

export default function LookupResultPage({ params }: PageProps<"/rooms/lookup/[id]">) {
  return (
    <Pane
      header={
        <Link href="/rooms/lookup" className="text-small text-muted hover:text-text">
          Look up
        </Link>
      }
    >
      <div className="max-w-[720px]">
        <Suspense fallback={<LoadingRows rows={6} />}>
          <Result params={params} />
        </Suspense>
      </div>
    </Pane>
  );
}

type Saved = Omit<Lookup, "warmPaths"> & { warmPaths: (Lookup["warmPaths"][number] & { name: string })[] };

async function Result({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user] = await Promise.all([params, requireUser()]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [row] = await db.withUser(user.id, (tx) => tx.select().from(t.searches).where(eq(t.searches.id, id)));
  if (!row || row.type === "radar") notFound();
  const r = row.result as Saved;
  const sources = row.sources as { title: string; url: string }[];
  return (
    <article>
      <h1 className="font-display text-[1.5rem] leading-[1.875rem] font-medium md:text-display">{r.title || row.query}</h1>
      <p className="pb-6 text-small text-muted">
        {r.kind || row.type} · {r.confidence} confidence
        {r.website ? (
          <>
            {" · "}
            <a href={r.website} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              Website
            </a>
          </>
        ) : null}
      </p>
      {r.overview ? <p className="pb-6">{r.overview}</p> : null}
      {r.warmPaths.length ? (
        <Section title="Who can introduce you">
          <ul className="grid gap-2">
            {r.warmPaths.map((w) => (
              <li key={w.contactId}>
                <Link href={`/people/${w.contactId}`} className="font-[550] hover:underline">
                  {w.name}
                </Link>{" "}
                <span className="text-muted">· {w.how}</span>
                {w.angle ? <p className="text-small">Ask: {w.angle}</p> : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {r.stakeholders.length ? (
        <Section title="People who matter">
          <ul className="grid gap-2">
            {r.stakeholders.map((s, i) => (
              <li key={i}>
                <span className="font-[550]">{s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{s.name || s.role}</a> : s.name || s.role}</span>
                {s.name && s.role ? <span className="text-muted"> · {s.role}</span> : null}
                {s.why ? <p className="text-small">{s.why}</p> : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {r.opportunities.length ? (
        <Section title="Openings">
          <ul className="grid gap-2">
            {r.opportunities.map((o, i) => (
              <li key={i}>
                {o.idea}
                {o.firstMove ? <p className="text-small text-muted">First move: {o.firstMove}</p> : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {r.playbook.length || r.facts.length ? (
        <Section title="Tips and facts">
          <ul className="grid list-disc gap-1 pl-5">
            {[...r.playbook, ...r.facts].map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </Section>
      ) : null}
      {r.verify ? <p className="pb-6 text-small text-muted">Double-check: {r.verify}</p> : null}
      {sources.length ? (
        <Section title="Sources">
          <ul className="grid gap-1 text-small">
            {sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </article>
  );
}
