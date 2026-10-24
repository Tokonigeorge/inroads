import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { formatLongDate } from "@/domain/dates";
import { instantInZone } from "@/domain/zoned";
import { DuplicatePair, UndoMergeButton } from "@/features/people/duplicate-pair";
import { LoadingRows } from "@/features/shell/page-frame";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import { listDuplicates, recentMerges } from "@/server/repos/merge";
import { userContext } from "@/server/user-context";
import { Pane, Section } from "@/ui/layout";

export const metadata: Metadata = { title: "Possible duplicates" };

export default function DuplicatesPage() {
  return (
    <Pane
      header={
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-title font-semibold">Possible duplicates</h1>
          <Link href="/people" className="text-small text-muted hover:text-text md:hidden">
            People
          </Link>
        </div>
      }
    >
      <div className="max-w-[720px]">
        <Suspense fallback={<LoadingRows rows={4} />}>
          <Duplicates />
        </Suspense>
      </div>
    </Pane>
  );
}

async function Duplicates() {
  const user = await requireUser();
  const { pairs, merges, ctx } = await db.withUser(user.id, async (tx) => ({ pairs: await listDuplicates(tx), merges: await recentMerges(tx), ctx: await userContext(tx) }));
  const added = (d: Date) => formatLongDate(instantInZone(d, ctx.timezone).date, ctx.today);
  return (
    <>
      <p className="pb-6 text-muted">
        These share a name but no email or phone, so Inroads didn&apos;t merge them. Merge the ones that are the same person; keep both if they aren&apos;t.
      </p>
      {pairs.length ? (
        <ul className="grid gap-4 pb-8">
          {pairs.map((p) => (
            <li key={p.suggestionId}>
              <DuplicatePair suggestionId={p.suggestionId} why={p.why} a={{ ...p.a, added: added(p.a.createdAt) }} b={{ ...p.b, added: added(p.b.createdAt) }} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="pb-8">Nothing to review.</p>
      )}
      {merges.length ? (
        <Section title="Recent merges">
          <ul className="grid">
            {merges.map((m) => (
              <li key={m.suggestionId} className="flex items-center justify-between gap-3 border-b border-border py-2 text-small">
                <span>
                  <Link href={`/people/${m.keepId}`} className="font-[550] hover:underline">
                    {m.keptName}
                  </Link>{" "}
                  <span className="text-muted">absorbed {m.otherName} · {added(m.at)}</span>
                </span>
                <UndoMergeButton suggestionId={m.suggestionId} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </>
  );
}
