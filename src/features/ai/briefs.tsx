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
    .select({ spaceId: t.briefs.spaceId, kind: t.briefs.kind, markdown: t.briefs.markdown, periodKey: t.briefs.periodKey, createdAt: t.briefs.createdAt })
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

const ago = (d: Date, now: number) => {
  const s = (now - d.getTime()) / 1000;
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
};

/**
 * The prototype's brief block (L791–800), under Today's rooms (daily) or the week grid (weekly):
 * the brief as a card with "Written 2 h ago · Rewrite", or "Write today's brief". One per Space.
 */
export function BriefBlock({ kind, spaces, briefs, now }: { kind: "daily" | "weekly"; spaces: BriefSpace[]; briefs: Awaited<ReturnType<typeof loadBriefs>>; now: number }) {
  const aiEnabled = isAiConfigured();
  if (!spaces.length) return null;
  const write = kind === "daily" ? "Write today's brief" : "Write this week's brief";
  return (
    <div className="grid justify-items-start gap-2.5 pt-1.5">
      {spaces.map((s) => {
        const b = briefs.find((x) => x.spaceId === s.id && x.kind === kind);
        const label = spaces.length > 1 ? `${write} for ${s.name}` : write;
        return b ? (
          <div key={s.id} className="grid w-full gap-2.5">
            <div className="card grid w-full max-w-[70ch] gap-2 px-[18px] py-4">
              {spaces.length > 1 ? <p className="stamp">{s.name}</p> : null}
              <Markdown text={b.markdown} />
            </div>
            <div className="flex items-center gap-3.5">
              <span className="text-[13.5px] text-muted">Written {ago(b.createdAt, now)}</span>
              <AiJobButton aiEnabled={aiEnabled} variant="link" size="sm" job={{ kind: "brief", spaceId: s.id, briefKind: kind }} label={spaces.length > 1 ? `Rewrite ${s.name}` : "Rewrite"} />
            </div>
          </div>
        ) : (
          <AiJobButton key={s.id} aiEnabled={aiEnabled} variant="primary" job={{ kind: "brief", spaceId: s.id, briefKind: kind }} label={label} />
        );
      })}
    </div>
  );
}
