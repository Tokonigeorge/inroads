import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { CalendarPlus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PlanView } from "@/features/ai/plan";
import { LoadingRows, PageFrame } from "@/features/shell/page-frame";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { loadPlan } from "@/server/repos/prep";
import { Button } from "@/ui/button";
import { Section } from "@/ui/layout";

export const metadata: Metadata = { title: "Discover" };

export default function LookupResultPage({ params }: PageProps<"/discover/[id]">) {
  return (
    <PageFrame>
      <Link href="/discover" className="inline-block pt-3 text-small font-semibold text-accent hover:underline">
        ← Discover
      </Link>
      <Suspense fallback={<LoadingRows rows={6} />}>
        <Result params={params} />
      </Suspense>
    </PageFrame>
  );
}

async function Result({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user] = await Promise.all([params, requireUser()]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [row, plan] = await db.withUser(user.id, async (tx) => [(await tx.select().from(t.searches).where(eq(t.searches.id, id)))[0], await loadPlan(tx, id)] as const);
  if (!row || row.type === "radar" || !plan) notFound();
  const r = plan.result;
  const sources = row.sources as { title: string; url: string }[];
  return (
    <article>
      <h1 className="pt-3">{r.title || row.query}</h1>
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
      {row.type === "event" && !plan.eventId ? (
        <section aria-label="Going?" className="mb-6 flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface p-4">
          <p className="min-w-0 flex-1">
            <span className="font-semibold">Going?</span> <span className="text-muted">Add it as a room. The date, venue and this plan come with it, and Today reminds you before it starts.</span>
          </p>
          <Button asChild variant="primary" size="sm">
            <Link href={`/rooms/new?prep=${plan.id}`}>
              <CalendarPlus size={14} aria-hidden /> Add as a room
            </Link>
          </Button>
        </section>
      ) : null}
      <PlanView plan={plan} />
      {r.facts.length ? (
        <Section title="Facts">
          <ul className="grid list-disc gap-1 pl-5">
            {r.facts.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </Section>
      ) : null}
      {plan.eventId ? (
        <p className="pb-6 text-small">
          <Link href={`/rooms/${plan.eventId}`} className="font-[550] text-accent hover:underline">
            Back to the room
          </Link>
        </p>
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
