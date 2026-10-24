import { and, desc, inArray } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LookupForm } from "@/features/ai/lookup-form";
import { LoadingRows } from "@/features/shell/page-frame";
import { loadSpaceView } from "@/features/spaces/space-view";
import { isAiConfigured } from "@/server/ai/config";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { Pane, Section } from "@/ui/layout";

export const metadata: Metadata = { title: "Look up" };
export const maxDuration = 300;

export default function LookupPage() {
  return (
    <Pane header={<h1 className="text-title font-semibold">Look up</h1>}>
      <div className="max-w-[640px]">
        <p className="pb-6 text-muted">Find out who matters at an event, company or place, and who in your network can introduce you.</p>
        <Suspense fallback={<LoadingRows rows={4} />}>
          <Lookup />
        </Suspense>
      </div>
    </Pane>
  );
}

async function Lookup() {
  const user = await requireUser();
  const { view, recent } = await db.withUser(user.id, async (tx) => {
    const view = await loadSpaceView(tx);
    const recent = await tx
      .select({ id: t.searches.id, query: t.searches.query, type: t.searches.type })
      .from(t.searches)
      .where(and(inArray(t.searches.type, ["person", "company", "place", "event"])))
      .orderBy(desc(t.searches.createdAt))
      .limit(12);
    return { view, recent };
  });
  const spaces = view.spaces.map((s) => ({ id: s.id, name: s.name }));
  return (
    <>
      <LookupForm spaces={spaces} defaultSpaceId={view.selected?.id ?? spaces[0]?.id ?? ""} aiEnabled={isAiConfigured()} />
      {recent.length ? (
        <Section title="Earlier" className="pt-8">
          <ul className="grid gap-1">
            {recent.map((r) => (
              <li key={r.id}>
                <Link href={`/rooms/lookup/${r.id}`} className="hover:underline">
                  {r.query}
                </Link>{" "}
                <span className="text-small text-muted">· {r.type}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </>
  );
}
