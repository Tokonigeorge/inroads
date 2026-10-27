import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { describeSuggestion } from "@/features/ai/person-ai";
import { SuggestionList } from "@/features/ai/suggestion-list";
import { LoadingRows } from "@/features/shell/page-frame";
import { loadSpaceView } from "@/features/spaces/space-view";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import { listPendingAiSuggestions } from "@/server/repos/suggestions";
import { Pane } from "@/ui/layout";

export const metadata: Metadata = { title: "Suggestions" };

export default function SuggestionsPage() {
  return (
    <Pane header={<h1 className="text-title font-semibold">Suggestions</h1>}>
      <div className="max-w-[640px]">
        <p className="pb-6 text-muted">What research, scoring and chat imports found. Nothing changes until you accept it.</p>
        <Suspense fallback={<LoadingRows rows={4} />}>
          <Suggestions />
        </Suspense>
      </div>
    </Pane>
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
