import { and, desc, inArray } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LookupForm } from "@/features/ai/lookup-form";
import { LoadingRows, PageFrame } from "@/features/shell/page-frame";
import { loadSpaceView } from "@/features/spaces/space-view";
import { isAiConfigured } from "@/server/ai/config";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { PageHeader, Section } from "@/ui/layout";

export const metadata: Metadata = { title: "Discover" };
export const maxDuration = 300;

/** The prototype's Discover tab, the room decoder (L897–926). */
export default function DiscoverPage() {
  return (
    <PageFrame>
      <PageHeader
        stamp="Room decoder"
        title="Know the room before you walk in"
        subtitle="Search a person, place or event. You get the key people, your warm paths in, and what's in it for your goals."
      />
      <Suspense fallback={<LoadingRows rows={4} />}>
        <Discover />
      </Suspense>
    </PageFrame>
  );
}

async function Discover() {
  const user = await requireUser();
  const { view, recent } = await db.withUser(user.id, async (tx) => {
    const view = await loadSpaceView(tx);
    const recent = await tx
      .select({ id: t.searches.id, query: t.searches.query, type: t.searches.type, createdAt: t.searches.createdAt })
      .from(t.searches)
      .where(and(inArray(t.searches.type, ["person", "company", "place", "event"])))
      .orderBy(desc(t.searches.createdAt))
      .limit(12);
    return { view, recent };
  });
  const spaces = view.spaces.map((s) => ({ id: s.id, name: s.name }));
  return (
    <>
      <div className="card p-4">
        <LookupForm spaces={spaces} defaultSpaceId={view.selected?.id ?? spaces[0]?.id ?? ""} aiEnabled={isAiConfigured()} />
      </div>
      {recent.length ? (
        <Section title="Recent rooms">
          <ul className="card divide-y divide-line overflow-hidden">
            {recent.map((r) => (
              <li key={r.id}>
                <Link href={`/discover/${r.id}`} className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-sunk">
                  <span className="min-w-0 flex-1 truncate font-semibold">{r.query}</span>
                  <span className="font-mono text-[11px] tracking-[0.06em] text-faint uppercase">{r.type}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </>
  );
}
