import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { describeSuggestion } from "@/features/ai/suggestion-view";
import { SuggestionList } from "@/features/ai/suggestion-list";
import { LoadingRows, PageFrame } from "@/features/shell/page-frame";
import { loadSpaceView } from "@/features/spaces/space-view";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import { listPendingAiSuggestions } from "@/server/repos/suggestions";
import { PageHeader } from "@/ui/layout";

export const metadata: Metadata = { title: "Suggestions" };

export default function SuggestionsPage() {
  return (
    <PageFrame>
      <PageHeader stamp="People" title="Suggestions" subtitle="What research, scoring and chat imports found. Nothing changes until you accept it." />
      <div className="max-w-[640px]">
        <Suspense fallback={<LoadingRows rows={4} />}>
          <Suggestions />
        </Suspense>
      </div>
    </PageFrame>
  );
}

async function Suggestions() {
  const user = await requireUser();
  const rows = await db.withUser(user.id, async (tx) => listPendingAiSuggestions(tx, (await loadSpaceView(tx)).selected?.id ?? null));
  if (!rows.length) return <p>Nothing to review.</p>;
  const byPerson = new Map<string, typeof rows>();
  for (const r of rows) byPerson.set(r.personId, [...(byPerson.get(r.personId) ?? []), r]);
  return (
    <div className="grid gap-6">
      {[...byPerson.values()].map((list) => (
        <section key={list[0].personId} className="grid gap-2">
          <h2 className="font-semibold">
            <Link href={`/people/${list[0].personId}`} className="hover:underline">
              {list[0].name}
            </Link>
          </h2>
          <SuggestionList items={list.map(describeSuggestion)} />
        </section>
      ))}
    </div>
  );
}
