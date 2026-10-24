import { and, inArray } from "drizzle-orm";
import { weekOf } from "@/domain/goal-progress";
import { isAiConfigured } from "@/server/ai/config";
import * as t from "@/server/db/schema";
import type { Tx } from "@/server/db/with-user";
import { Markdown } from "@/ui/markdown";
import { AiJobButton } from "./ai-job-button";

export type BriefSpace = { id: string; name: string };

export async function loadBriefs(tx: Tx, spaces: BriefSpace[], today: string) {
  if (!spaces.length) return [];
  const keys = [today, `week-of-${weekOf(today).start}`];
  return tx
    .select({ spaceId: t.briefs.spaceId, kind: t.briefs.kind, markdown: t.briefs.markdown, periodKey: t.briefs.periodKey })
    .from(t.briefs)
    .where(and(inArray(t.briefs.spaceId, spaces.map((s) => s.id)), inArray(t.briefs.periodKey, keys)));
}

/** Today's and this week's brief, one per Space; never merged across Spaces (TECH_PLAN §4.7). */
export function Briefs({ spaces, briefs }: { spaces: BriefSpace[]; briefs: Awaited<ReturnType<typeof loadBriefs>> }) {
  const aiEnabled = isAiConfigured();
  if (!spaces.length) return null;
  return (
    <section aria-labelledby="briefs" className="grid gap-4 pb-8">
      <h2 id="briefs" className="text-title font-semibold">
        Brief
      </h2>
      {spaces.map((s) => {
        const daily = briefs.find((b) => b.spaceId === s.id && b.kind === "daily");
        const weekly = briefs.find((b) => b.spaceId === s.id && b.kind === "weekly");
        return (
          <div key={s.id} className="grid gap-3 rounded-md border border-border bg-surface p-4">
            {spaces.length > 1 ? <h3 className="text-small font-[550] text-muted">{s.name}</h3> : null}
            {daily ? <Markdown text={daily.markdown} /> : <p className="text-small text-muted">A short morning brief: who you&apos;ll see, what to remember, and one move for your goals.</p>}
            {weekly ? (
              <details>
                <summary className="cursor-pointer text-small font-[550]">This week</summary>
                <div className="pt-2">
                  <Markdown text={weekly.markdown} />
                </div>
              </details>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <AiJobButton aiEnabled={aiEnabled} job={{ kind: "brief", spaceId: s.id, briefKind: "daily" }} label={daily ? "Rewrite today's brief" : "Write today's brief"} />
              <AiJobButton aiEnabled={aiEnabled} variant="ghost" job={{ kind: "brief", spaceId: s.id, briefKind: "weekly" }} label={weekly ? "Rewrite this week's" : "Write this week's"} />
            </div>
          </div>
        );
      })}
    </section>
  );
}
