import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { ReactNode } from "react";
import type { SpaceKind } from "@/contracts/spaces";
import { formatLongDate } from "@/domain/dates";
import { instantInZone } from "@/domain/zoned";
import { isAiConfigured } from "@/server/ai/config";
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { pendingForPerson } from "@/server/repos/suggestions";
import { researchJobKind } from "@/server/jobs/ai-jobs";
import { userContext } from "@/server/user-context";
import { AiJobButton } from "./ai-job-button";
import { ChatImportButton } from "./chat-import";
import { DeleteResearchButton } from "./delete-research";
import { DraftButton } from "./draft-sheet";
import { JobStatus } from "./job-status";
import { SuggestionList, type SuggestionView } from "./suggestion-list";

type Space = { id: string; name: string; kind: SpaceKind; researchMode: "full" | "get_to_know" | "off" };
type Src = { title: string; url: string };

const fieldLabel: Record<string, string> = { position: "Role", company: "Company", city: "City", birthday: "Birthday" };

export function describeSuggestion(s: Awaited<ReturnType<typeof pendingForPerson>>[number]): SuggestionView {
  const p = s.payload as Record<string, unknown>;
  const base = { id: s.id, kind: s.kind, why: s.why ?? "", sources: (s.sources as Src[]) ?? [] };
  switch (s.kind) {
    case "person_field":
      return { ...base, title: `${fieldLabel[String(p.field)] ?? "Detail"}`, value: String(p.value), editable: true };
    case "social":
      return { ...base, title: `Profile: ${String(p.key)}`, value: String(p.value), editable: true };
    case "goal_link":
      return { ...base, title: "Add to a goal", value: String(p.goalText), editable: false };
    case "interaction":
      return { ...base, title: `Touch on ${String(p.occurredOn)}`, value: String(p.summary), editable: true };
    case "commitment":
      return { ...base, title: p.owner === "me" ? "A promise you made" : "A promise they made", value: `${String(p.text)}${p.dueOn ? ` (by ${String(p.dueOn)})` : ""}`, editable: true };
    case "interests":
      return { ...base, title: "Interests", value: (p.values as string[]).join(", "), editable: false };
    default:
      return { ...base, title: "Add to notes", value: String(p.text), editable: true };
  }
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-border py-6">
      <h2 className="pb-3 text-title font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Sources({ list }: { list: Src[] }) {
  if (!list.length) return null;
  return (
    <details className="text-small text-muted">
      <summary className="cursor-pointer">Sources ({list.length})</summary>
      <ul className="grid gap-1 pt-2">
        {list.map((s) => (
          <li key={s.url}>
            <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              {s.title}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}

const List = ({ title, items }: { title: string; items: (string | { text: string; url: string })[] }) =>
  items.length ? (
    <div className="grid gap-1">
      <h3 className="text-small font-[550]">{title}</h3>
      <ul className="grid list-disc gap-1 pl-5">
        {items.map((x, i) => (
          <li key={i}>
            {typeof x === "string" ? x : x.url ? (
              <a href={x.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                {x.text}
              </a>
            ) : (
              x.text
            )}
          </li>
        ))}
      </ul>
    </div>
  ) : null;

/** Research, suggestions, drafts and chat import on a person's page, per Space. */
export async function PersonAi({ userId, personId, name, spaces }: { userId: string; personId: string; name: string; spaces: Space[] }) {
  const aiEnabled = isAiConfigured();
  const { dossiers, suggestions, ctx, me, running } = await db.withUser(userId, async (tx) => {
    const [dossiers, suggestions, ctx, [me], [running]] = await Promise.all([
      spaces.length
        ? tx.select().from(t.dossiers).where(and(eq(t.dossiers.personId, personId), inArray(t.dossiers.spaceId, spaces.map((s) => s.id)))).orderBy(desc(t.dossiers.version))
        : Promise.resolve([]),
      pendingForPerson(tx, personId),
      userContext(tx),
      tx.select({ name: t.profiles.name }).from(t.profiles),
      // Research started for them (by hand or automatically when they were added) and still going.
      tx
        .select({ id: t.jobs.id })
        .from(t.jobs)
        .where(and(eq(t.jobs.kind, researchJobKind(personId)), inArray(t.jobs.status, ["queued", "running"]), sql`${t.jobs.createdAt} > now() - interval '15 minutes'`))
        .orderBy(desc(t.jobs.createdAt))
        .limit(1),
    ]);
    return { dossiers, suggestions, ctx, me, running };
  });
  const when = (d: Date) => formatLongDate(instantInZone(d, ctx.timezone).date, ctx.today);
  const researchable = spaces.filter((s) => s.researchMode !== "off");
  const spaceChoices = spaces.map((s) => ({ id: s.id, name: s.name }));
  const first = name.split(/\s+/)[0];

  return (
    <>
      <div className="flex flex-wrap gap-2 pb-2">
        <DraftButton personId={personId} name={name} spaces={spaceChoices} aiEnabled={aiEnabled} />
        <ChatImportButton personId={personId} name={name} spaces={spaceChoices} aiEnabled={aiEnabled} myName={me?.name ?? ""} />
      </div>

      {suggestions.length ? (
        <Block title={`Suggestions · ${suggestions.length}`}>
          <p className="pb-3 text-small text-muted">Found by research or a chat import. Nothing is changed until you accept.</p>
          <SuggestionList items={suggestions.map(describeSuggestion)} />
        </Block>
      ) : null}

      {researchable.map((s, i) => {
        const live = i === 0 ? running : undefined;
        const mine = dossiers.filter((d) => d.spaceId === s.id);
        const latest = mine.find((d) => d.mode !== "verify");
        const verify = mine.find((d) => d.mode === "verify");
        const p = (latest?.payload ?? {}) as Record<string, unknown>;
        const v = (verify?.payload ?? {}) as { answer?: string; summary?: string; redFlags?: string[] };
        return (
          <Block key={s.id} title={researchable.length > 1 ? `${s.researchMode === "full" ? "Research" : "Get to know"} · ${s.name}` : s.researchMode === "full" ? "Research" : "Get to know"}>
            <div className="grid gap-4">
              {live ? <JobStatus jobId={live.id} /> : null}
              {latest ? (
                <div className="grid gap-3">
                  <p className="text-small text-muted">
                    {latest.mode === "example" ? "Example research" : `Updated ${when(latest.createdAt)}`} · {latest.confidence ?? "medium"} confidence
                  </p>
                  {latest.mode === "full" || latest.mode === "example" || latest.mode === "knowledge" ? (
                    <>
                      {p.summary ? <p>{String(p.summary)}</p> : null}
                      {p.identity ? <p className="text-small text-muted">{String(p.identity)}</p> : null}
                      <List title="Talking points" items={(p.talkingPoints as string[]) ?? []} />
                      <List title="Opportunities" items={(p.opportunities as string[]) ?? []} />
                      <List title="Recent signals" items={(p.signals as string[]) ?? []} />
                      <List title="Doesn't match what you saved" items={(p.conflicts as string[]) ?? []} />
                    </>
                  ) : (
                    <>
                      {p.identity ? <p className="text-small text-muted">{String(p.identity)}</p> : null}
                      <List title="Things to ask" items={(p.thingsToAsk as { text: string; url: string }[]) ?? []} />
                      <List title="Shared interests" items={(p.sharedInterests as { text: string; url: string }[]) ?? []} />
                      <List title="Fun facts" items={(p.funFacts as { text: string; url: string }[]) ?? []} />
                    </>
                  )}
                  {p.caveats ? <p className="text-small text-muted">Check: {String(p.caveats)}</p> : null}
                  <Sources list={(latest.sources as Src[]) ?? []} />
                  {latest.mode !== "example" ? <DeleteResearchButton dossierId={latest.id} /> : null}
                </div>
              ) : live ? null : (
                <p className="text-small text-muted">
                  {s.researchMode === "full"
                    ? `A short profile of ${first}'s public professional life, with sources, talking points and how they fit your goals.`
                    : `Conversation starters from what ${first} has shared about themselves. Never family, address, past relationships or money.`}
                </p>
              )}
              {verify ? (
                <div className="grid gap-1 rounded-md bg-sunken p-3 text-small">
                  <p className="font-[550]">Checked {when(verify.createdAt)}: {v.answer === "yes" ? "they check out" : v.answer === "no" ? "something doesn't add up" : "couldn't tell"}</p>
                  {v.summary ? <p>{v.summary}</p> : null}
                  {v.redFlags?.length ? <List title="Red flags" items={v.redFlags} /> : null}
                  <Sources list={(verify.sources as Src[]) ?? []} />
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <AiJobButton
                  aiEnabled={aiEnabled}
                  job={{ kind: "research", personId, spaceId: s.id, mode: "research" }}
                  label={s.researchMode === "full" ? (latest ? "Research again" : `Research ${first}`) : latest ? "Look again" : "Get to know"}
                />
                {s.kind !== "work" ? <AiJobButton aiEnabled={aiEnabled} variant="ghost" job={{ kind: "research", personId, spaceId: s.id, mode: "verify" }} label="Check they're real" /> : null}
              </div>
            </div>
          </Block>
        );
      })}
    </>
  );
}
