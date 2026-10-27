import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache, type ReactNode } from "react";
import { socialKeys, socialLabels, touchTypeLabels, type TouchType } from "@/contracts/people";
import { roomRoleLabels } from "@/contracts/rooms";
import { cadenceLabel } from "@/contracts/spaces";
import { addDays, formatLongDate } from "@/domain/dates";
import { formatPhone } from "@/domain/normalise";
import { dueOn, dueState, effectiveCadence, personCadence, STRENGTH_WINDOW_DAYS, strength, warmth } from "@/domain/relationship";
import { ChatImportButton } from "@/features/ai/chat-import";
import { DraftButton } from "@/features/ai/draft-sheet";
import { PersonAi } from "@/features/ai/person-ai";
import { PersonGoals, type GoalOption } from "@/features/goals/person-goals";
import { IntroAsk, type IntroSpace } from "@/features/people/intro-ask";
import { DeleteButton, LogTouchButton, PersonActions, PromiseCheck, RemoveFromSpaceButton } from "@/features/people/person-actions";
import { isAiConfigured } from "@/server/ai/config";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { goalOptionsForPerson, stagesOf } from "@/server/repos/goals";
import { introsAbout, warmPaths } from "@/server/repos/intros";
import { getPerson, type PersonDetail } from "@/server/repos/people";
import { roomsForPerson } from "@/server/repos/rooms";
import { readSelectedSpaceId } from "@/server/space-selection";
import { userContext } from "@/server/user-context";
import { Avatar } from "@/ui/list-row";
import { WarmthTag } from "@/ui/warmth";
import { CopyButton, StarToggle, WhatsAppLink } from "./record-controls";

const first = (n: string) => n.trim().split(/\s+/)[0] ?? n;

function socialHref(key: string, v: string) {
  if (/^https?:\/\//i.test(v)) return v;
  const h = v.replace(/^@/, "");
  const map: Record<string, string> = {
    linkedin: `https://www.linkedin.com/in/${h}`,
    x: `https://x.com/${h}`,
    instagram: `https://instagram.com/${h}`,
    tiktok: `https://www.tiktok.com/@${h}`,
    github: `https://github.com/${h}`,
    substack: `https://${h}.substack.com`,
    website: `https://${h.replace(/^\/+/, "")}`,
  };
  return map[key] ?? null;
}

/** A section of the record (prototype .sec, L246): a mono uppercase h3, then its content. */
function Sec({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="sec" aria-label={title}>
      <header className="flex items-center justify-between gap-3">
        <h3>{title}</h3>
        {action}
      </header>
      {children}
    </section>
  );
}

/** Everything the record needs, loaded once per request (the sheet's title and body share it). */
export const loadPersonRecord = cache(async (id: string) => {
  const [user, selectedSpaceId] = await Promise.all([requireUser(), readSelectedSpaceId()]);
  const data = await db.withUser(user.id, async (tx) => {
    const ctx = await userContext(tx);
    const detail = await getPerson(tx, id);
    if (!detail) return null;
    // Intros are for Work, Personal and your own Spaces; never Dating.
    const introable = detail.memberships.filter((m) => !m.archivedAt && !m.space.archived && m.space.kind !== "dating").map((m) => m.space);
    const [rooms, goalOptions, intros, goals, [score], [me], ...paths] = await Promise.all([
      roomsForPerson(tx, id, ctx.today),
      goalOptionsForPerson(tx, id),
      introsAbout(tx, id),
      introable.length
        ? tx
            .select({ id: t.goals.id, text: t.goals.text, spaceId: t.goals.spaceId })
            .from(t.goals)
            .where(and(inArray(t.goals.spaceId, introable.map((s) => s.id)), eq(t.goals.active, true), isNull(t.goals.archivedAt)))
        : Promise.resolve([]),
      tx.select({ value: t.scores.value, why: t.scores.why }).from(t.scores).where(eq(t.scores.personId, id)).orderBy(desc(t.scores.createdAt)).limit(1),
      tx.select({ name: t.profiles.name }).from(t.profiles),
      ...introable.map((s) => warmPaths(tx, id, s.id, ctx.today)),
    ]);
    const introSpaces: IntroSpace[] = introable.map((s, i) => ({ id: s.id, name: s.name, goals: goals.filter((g) => g.spaceId === s.id), paths: paths[i] }));
    return { detail, today: ctx.today, rooms, goalOptions, introSpaces, intros, score: score ?? null, myName: me?.name ?? "" };
  });
  if (!data) notFound();
  return { ...data, userId: user.id, selectedSpaceId };
});

/** The sheet's title once the record has loaded. */
export async function PersonTitle({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (await loadPersonRecord(id)).detail.person.name;
}

export async function LoadedPersonRecord({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PersonRecord data={await loadPersonRecord(id)} />;
}

type RecordData = Awaited<ReturnType<typeof loadPersonRecord>>;

function goalStages(d: PersonDetail, g: PersonDetail["goals"][number]) {
  return stagesOf(g.goalStages, d.memberships.find((m) => m.space.id === g.goalSpaceId)?.spaceDefaults.stages ?? []).stages;
}

/**
 * A person, in the prototype's contact sheet order (L1026–1077): who they are, why they fit,
 * one row of actions, Context, Dossier, Promises, Timeline. Introductions, events and goal
 * stages follow as the app's extras. The same view renders as a sheet and as a full page.
 */
export function PersonRecord({ data }: { data: RecordData }) {
  const { detail: d, today, rooms, goalOptions, introSpaces, intros, score, selectedSpaceId, userId, myName } = data;
  const p = d.person;
  const active = d.memberships.filter((m) => !m.archivedAt && !m.space.archived);
  const archived = d.memberships.length > 0 && d.memberships.every((m) => m.archivedAt);
  const cadence = personCadence(active.map((m) => effectiveCadence(m.cadenceDays, m.circle?.defaultCadenceDays, m.spaceDefaults.cadenceDays)));
  const anchor = active.map((m) => m.cadenceAnchorOn).filter(Boolean).sort().at(-1) ?? null;
  const due = dueState(dueOn({ lastTouchedOn: p.lastTouchedOn, anchorOn: anchor, createdOn: p.createdAt.toISOString().slice(0, 10), cadenceDays: cadence }), today);
  const w = warmth(p.lastTouchedOn, today);
  const since = addDays(today, -STRENGTH_WINDOW_DAYS);
  const st = strength({ lastTouchedOn: p.lastTouchedOn, touches: d.touches.filter((x) => x.occurredOn >= since).length, today });
  const spaces = active.map((m) => ({ id: m.space.id, name: m.space.name }));
  const picked = { id: p.id, name: p.name, spaces };
  const multi = d.memberships.length > 1;
  const starred = active.some((m) => m.starred);
  const tags = [...new Set(active.flatMap((m) => m.tags))];
  const open = d.promises.filter((x) => !x.doneAt);
  const done = d.promises.filter((x) => x.doneAt);
  const aiEnabled = isAiConfigured();
  const socials = socialKeys.flatMap((k) => {
    const v = (p.socials as Record<string, string>)[k];
    const href = v ? socialHref(k, v) : null;
    return v && href ? [{ key: k, label: socialLabels[k], href }] : [];
  });
  const needsContext = active.length > 0 && active.every((m) => !m.whereMet && m.interests.length === 0);

  return (
    <article aria-label={p.name} className="grid gap-[18px]">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3.5">
        <Avatar name={p.name} size={64} warmth={w.key} />
        <div className="grid min-w-0 gap-1.5">
          <h1 className="text-[26px] leading-[1.15] font-[720] tracking-[-0.02em]">{p.name}</h1>
          <p className="text-[14.5px] text-muted">
            {[p.position, p.company].filter(Boolean).join(" at ") || "No role added yet"}
            {p.city ? ` · ${p.city}` : ""}
          </p>
          <div className="tags">
            {p.source === "example" ? <span className="tag ex">Example</span> : null}
            <WarmthTag warmth={w} />
            {score ? <span className="tag">Fit {score.value}/100</span> : null}
            {d.goals.map((g) => (
              <span key={g.id} className="tag goal">
                {g.goalText}
              </span>
            ))}
            {tags.map((tag) => (
              <span key={tag} className="tag">
                #{tag}
              </span>
            ))}
            {archived ? <span className="tag">Archived</span> : null}
          </div>
        </div>
        <StarToggle personId={p.id} starred={starred} />
      </div>
      {score?.why ? <p className="max-w-[62ch] text-[14px] text-muted">{score.why}</p> : null}
      <p className="-mt-2 text-[13.5px] text-muted">
        {w.key === "none" ? "No touches yet" : `Last spoke ${w.label.toLowerCase()}`}
        {st ? (
          <>
            {" · "}
            <span title={st.why}>
              {st.label} relationship ({st.value}/100)
            </span>
          </>
        ) : null}
        {" · "}
        {due ? (due.due ? <strong className="font-[550] text-accent">{due.label}</strong> : `${cadenceLabel(cadence)} · ${due.label.toLowerCase()}`) : "No reminder"}
      </p>

      <PersonActions
        person={picked}
        archived={archived}
        defaultSpaceId={selectedSpaceId ?? undefined}
        draft={<DraftButton personId={p.id} name={p.name} spaces={spaces} aiEnabled={aiEnabled} />}
        decodeHref={`/discover?${new URLSearchParams({ q: p.name, type: "person" })}`}
      />

      <Sec title="Context">
        {active.map((m) => (
          <div key={m.id} className="grid gap-2">
            {multi ? (
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-[13px] font-semibold">{m.space.name}</h4>
                <Link href={`/people/${p.id}/spaces/${m.space.id}`} className="text-[13px] font-semibold text-accent hover:underline">
                  Edit
                </Link>
              </div>
            ) : null}
            <dl className="kv">
              {!multi && p.city ? (
                <>
                  <dt>Based in</dt>
                  <dd>{p.city}</dd>
                </>
              ) : null}
              <dt>Where you met</dt>
              <dd>{m.whereMet ? [m.whereMet, m.metOn ? formatLongDate(m.metOn, today) : ""].filter(Boolean).join(" · ") : <span className="text-muted">Not added</span>}</dd>
              {m.interests.length ? (
                <>
                  <dt>Interests</dt>
                  <dd>{m.interests.join(", ")}</dd>
                </>
              ) : null}
              {m.opportunities ? (
                <>
                  <dt>Opportunities</dt>
                  <dd>{m.opportunities}</dd>
                </>
              ) : null}
              {m.notes ? (
                <>
                  <dt>Notes</dt>
                  <dd>{m.notes}</dd>
                </>
              ) : null}
              <dt>Reminder</dt>
              <dd>
                {m.cadenceDays === 0
                  ? "Never"
                  : m.cadenceDays
                    ? cadenceLabel(m.cadenceDays)
                    : `${cadenceLabel(effectiveCadence(null, m.circle?.defaultCadenceDays, m.spaceDefaults.cadenceDays))} (${m.circle ? `${m.circle.name} circle` : `${m.space.name} default`})`}
              </dd>
              {m.circle ? (
                <>
                  <dt>Circle</dt>
                  <dd>{m.circle.name}</dd>
                </>
              ) : null}
            </dl>
            {multi ? <RemoveFromSpaceButton personId={p.id} spaceId={m.space.id} spaceName={m.space.name} personName={first(p.name)} /> : null}
          </div>
        ))}
        <dl className="kv">
          {multi && p.city ? (
            <>
              <dt>Based in</dt>
              <dd>{p.city}</dd>
            </>
          ) : null}
          {p.birthday ? (
            <>
              <dt>Birthday</dt>
              <dd>{formatLongDate(`2000-${p.birthday}`).replace(/^\w+ /, "")}</dd>
            </>
          ) : null}
          {p.emails.map((e, i) => (
            <div key={e} className="contents">
              <dt>{i ? "Email" : "Email"}</dt>
              <dd>
                <a href={`mailto:${e}`} className="hover:underline">
                  {e}
                </a>
                <CopyButton text={e} label={e} />
              </dd>
            </div>
          ))}
          {p.phones.map((ph) => (
            <div key={ph} className="contents">
              <dt>Phone</dt>
              <dd>
                <a href={`tel:${ph}`} className="hover:underline">
                  {formatPhone(ph)}
                </a>
                <CopyButton text={formatPhone(ph)} label={formatPhone(ph)} />
                <WhatsAppLink phone={ph} personId={p.id} spaceId={(spaces.find((s) => s.id === selectedSpaceId) ?? spaces[0])?.id ?? null} name={p.name} />
              </dd>
            </div>
          ))}
        </dl>
        {socials.length ? (
          <div className="socials">
            {socials.map((s) => (
              <a key={s.key} href={s.href} target="_blank" rel="noopener noreferrer">
                {s.label} ↗
              </a>
            ))}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {needsContext ? (
            <Link href={!multi && active[0] ? `/people/${p.id}/spaces/${active[0].space.id}` : `/people/${p.id}/edit`} className="text-[13.5px] font-semibold text-accent hover:underline">
              Add where you met or their interests
            </Link>
          ) : !multi && active[0] ? (
            <Link href={`/people/${p.id}/spaces/${active[0].space.id}`} className="text-[13.5px] font-semibold text-accent hover:underline">
              Edit context
            </Link>
          ) : null}
        </div>
        <p className="hint">Research and Decode use everything saved here, including birthday, handles and profile links, to find the right person.</p>
      </Sec>

      <PersonAi userId={userId} personId={p.id} name={p.name} spaces={active.map((m) => ({ id: m.space.id, name: m.space.name, kind: m.space.kind, researchMode: m.spaceDefaults.researchMode }))} />

      <Sec title="Promises">
        {open.length ? (
          <ul className="grid gap-2">
            {open.map((x) => (
              <li key={x.id} className="flex items-start gap-2.5 text-[14.5px]">
                <PromiseCheck id={x.id} done={false} label={x.text} />
                <span className="min-w-0 flex-1">
                  <b>{x.owner === "them" ? `${first(p.name)} owes you:` : "You owe:"}</b> {x.text}
                  <span className="text-[13px] text-muted">
                    {" · "}
                    {x.dueOn ? (x.dueOn < today ? <strong className="font-[550] text-danger">Overdue · {formatLongDate(x.dueOn, today)}</strong> : `Due ${formatLongDate(x.dueOn, today)}`) : "No due date"}
                    {multi ? ` · ${x.spaceName}` : ""}
                  </span>
                </span>
                <DeleteButton kind="promise" id={x.id} label={x.text} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[14px] text-muted">No promises logged. Add one when you log a touch, or import a chat.</p>
        )}
        {done.length ? (
          <details>
            <summary className="cursor-pointer text-[13.5px] text-muted">{done.length === 1 ? "1 done" : `${done.length} done`}</summary>
            <ul className="mt-2 grid gap-2">
              {done.map((x) => (
                <li key={x.id} className="flex items-start gap-2.5 text-[14.5px] text-muted">
                  <PromiseCheck id={x.id} done label={x.text} />
                  <span className="line-through">{x.text}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </Sec>

      <Sec title="Timeline">
        {d.touches.length ? (
          <ol className="timeline">
            {d.touches.slice(0, 30).map((x) => (
              <li key={x.id}>
                <span className="d">
                  {new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${x.occurredOn}T00:00:00Z`))}
                  <br />
                  {x.occurredOn.slice(0, 4)}
                </span>
                <span className="min-w-0">
                  <span className="whitespace-pre-line">{x.summary || touchTypeLabels[x.type as TouchType]}</span>
                  <span className="ty">
                    {touchTypeLabels[x.type as TouchType]}
                    {x.source !== "manual" ? ` · ${x.source}` : ""}
                    {multi ? ` · ${x.spaceName}` : ""}
                  </span>
                </span>
                <DeleteButton kind="touch" id={x.id} label={`${touchTypeLabels[x.type as TouchType]} on ${x.occurredOn}`} />
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-[14px] text-muted">No interactions yet. Log the last time you spoke, even roughly, so reminders start from the right place.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <LogTouchButton person={picked} defaultSpaceId={selectedSpaceId ?? undefined} label="+ Log a touch" />
          <ChatImportButton personId={p.id} name={p.name} spaces={spaces} aiEnabled={aiEnabled} myName={myName} label="Import chat history" />
        </div>
      </Sec>

      {introSpaces.length ? (
        <Sec title="Introductions" action={<IntroAsk target={{ id: p.id, name: p.name }} targetDetail={[p.position, p.company].filter(Boolean).join(" at ")} spaces={introSpaces} />}>
          {intros.length ? (
            <ul className="grid gap-2 text-[14.5px]">
              {intros.map((i) => (
                <li key={i.id}>
                  <Link href={`/people/${i.connectorId}`} className="font-[550] hover:underline">
                    {i.connector}
                  </Link>{" "}
                  <span className="text-muted">
                    {i.doneAt
                      ? "introduced you"
                      : `said they'd introduce you${i.dueOn ? (i.dueOn < today ? ` · overdue since ${formatLongDate(i.dueOn, today)}` : ` · by ${formatLongDate(i.dueOn, today)}`) : ""}`}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-muted">
              Want to meet {first(p.name)}? Ask someone you both know. Inroads tracks it as a promise they owe you and moves {first(p.name)} along your goal.
            </p>
          )}
        </Sec>
      ) : null}

      {rooms.length ? (
        <Sec title="Events">
          <ul className="grid gap-2 text-[14.5px]">
            {rooms.map((r) => (
              <li key={`${r.id}:${r.role}`} className="flex justify-between gap-3">
                <Link href={`/rooms/${r.id}`} className="hover:underline">
                  {r.title}
                </Link>
                <span className="text-[13px] text-muted">
                  {roomRoleLabels[r.role]}
                  {r.next ? ` · ${formatLongDate(r.next, today)}` : r.repeats ? "" : ` · ${formatLongDate(r.first, today)}`}
                </span>
              </li>
            ))}
          </ul>
        </Sec>
      ) : null}

      {d.goals.length || goalOptions.length ? (
        <Sec title="Goals">
          <PersonGoals
            personId={p.id}
            personName={p.name}
            showSpaces={multi}
            options={goalOptions as GoalOption[]}
            links={d.goals.map((g) => ({ linkId: g.id, goalId: g.goalId, goalText: g.goalText, stage: g.stage, stages: goalStages(d, g) }))}
          />
        </Sec>
      ) : null}
    </article>
  );
}
