import { ArrowLeft, Mail, MessageCircle, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { socialKeys, socialLabels, touchTypeLabels, type TouchType } from "@/contracts/people";
import { cadenceLabel } from "@/contracts/spaces";
import { formatLongDate } from "@/domain/dates";
import { formatPhone, whatsappDigits } from "@/domain/normalise";
import { dueOn, dueState, effectiveCadence, personCadence, warmth } from "@/domain/relationship";
import { PersonGoals, type GoalOption } from "@/features/goals/person-goals";
import { DeleteButton, PersonActions, PromiseCheck, RemoveFromSpaceButton } from "@/features/people/person-actions";
import { LoadingRows } from "@/features/shell/page-frame";
import { readSelectedSpaceId } from "@/server/space-selection";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import { getPerson, type PersonDetail } from "@/server/repos/people";
import { goalOptionsForPerson, stagesOf } from "@/server/repos/goals";
import { roomsForPerson } from "@/server/repos/rooms";
import { roomRoleLabels } from "@/contracts/rooms";
import { userContext } from "@/server/user-context";
import { EmptyState } from "@/ui/layout";
import { Avatar } from "@/ui/list-row";
import { WarmthDot } from "@/ui/warmth";

export const metadata: Metadata = { title: "Person" };

export default function PersonPage({ params }: PageProps<"/people/[id]">) {
  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-6 md:px-8 md:py-10">
      <Link href="/people" className="mb-4 inline-flex items-center gap-1 text-small text-muted hover:text-text md:hidden">
        <ArrowLeft size={14} aria-hidden /> People
      </Link>
      <Suspense fallback={<LoadingRows rows={6} />}>
        <Person params={params} />
      </Suspense>
    </div>
  );
}

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

function goalStages(d: PersonDetail, g: PersonDetail["goals"][number]) {
  return stagesOf(g.goalStages, d.memberships.find((m) => m.space.id === g.goalSpaceId)?.spaceDefaults.stages ?? []).stages;
}

function Block({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="border-t border-border py-6">
      <div className="flex items-center justify-between gap-3 pb-3">
        <h2 className="text-title font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

async function Person({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user, selectedSpaceId] = await Promise.all([params, requireUser(), readSelectedSpaceId()]);
  const data = await db.withUser(user.id, async (tx) => {
    const ctx = await userContext(tx);
    const detail = await getPerson(tx, id);
    if (!detail) return { detail, ctx, rooms: [], goalOptions: [] };
    const [rooms, goalOptions] = await Promise.all([roomsForPerson(tx, id, ctx.today), goalOptionsForPerson(tx, id)]);
    return { detail, ctx, rooms, goalOptions };
  });
  if (!data.detail) notFound();
  const { detail: d, ctx, rooms, goalOptions } = data;
  return <PersonView d={d} today={ctx.today} selectedSpaceId={selectedSpaceId} rooms={rooms} goalOptions={goalOptions} />;
}

type PersonRooms = Awaited<ReturnType<typeof roomsForPerson>>;

function PersonView({ d, today, selectedSpaceId, rooms, goalOptions }: { d: PersonDetail; today: string; selectedSpaceId: string | null; rooms: PersonRooms; goalOptions: GoalOption[] }) {
  const p = d.person;
  const active = d.memberships.filter((m) => !m.archivedAt && !m.space.archived);
  const archived = d.memberships.length > 0 && d.memberships.every((m) => m.archivedAt);
  const cadences = active.map((m) => effectiveCadence(m.cadenceDays, m.circle?.defaultCadenceDays, m.spaceDefaults.cadenceDays));
  const cadence = personCadence(cadences);
  const anchor = active.map((m) => m.cadenceAnchorOn).filter(Boolean).sort().at(-1) ?? null;
  const due = dueState(dueOn({ lastTouchedOn: p.lastTouchedOn, anchorOn: anchor, createdOn: p.createdAt.toISOString().slice(0, 10), cadenceDays: cadence }), today);
  const w = warmth(p.lastTouchedOn, today);
  const picked = { id: p.id, name: p.name, spaces: active.map((m) => ({ id: m.space.id, name: m.space.name })) };
  const multi = d.memberships.length > 1;
  const owe = d.promises.filter((x) => !x.doneAt && x.owner === "me");
  const theyOwe = d.promises.filter((x) => !x.doneAt && x.owner === "them");
  const done = d.promises.filter((x) => x.doneAt);
  const socials = socialKeys.flatMap((k) => {
    const v = (p.socials as Record<string, string>)[k];
    const href = v ? socialHref(k, v) : null;
    return v && href ? [{ key: k, label: socialLabels[k], href }] : [];
  });

  return (
    <article>
      <header className="grid gap-4 pb-6">
        <div className="flex items-start gap-4">
          <Avatar name={p.name} size={40} />
          <div className="min-w-0">
            <h1 className="font-display text-[1.5rem] leading-[1.875rem] font-medium md:text-display">{p.name}</h1>
            <p className="text-muted">{[p.position, p.company].filter(Boolean).join(" at ") || "No role added yet"}{p.city ? ` · ${p.city}` : ""}</p>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-muted">
              <span className="flex items-center gap-1.5">
                <WarmthDot warmth={w} />
                {w.key === "none" ? "No touches yet" : `Last spoke ${w.label.toLowerCase()}`}
              </span>
              <span>{due ? (due.due ? <strong className="font-[550] text-accent">{due.label}</strong> : `${cadenceLabel(cadence)} · ${due.label.toLowerCase()}`) : "No reminder"}</span>
              {archived ? <span>Archived</span> : null}
            </p>
          </div>
        </div>
        <PersonActions person={picked} archived={archived} defaultSpaceId={selectedSpaceId ?? undefined} />
        {p.phones.length || p.emails.length || socials.length ? (
          <ul className="flex flex-wrap gap-x-4 gap-y-2 text-small">
            {p.phones.map((ph) => (
              <li key={ph} className="flex items-center gap-3">
                <a href={`tel:${ph}`} className="flex items-center gap-1.5 hover:underline">
                  <Phone size={14} aria-hidden /> {formatPhone(ph)}
                </a>
                <a href={`https://wa.me/${whatsappDigits(ph)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-accent hover:underline">
                  <MessageCircle size={14} aria-hidden /> WhatsApp
                </a>
              </li>
            ))}
            {p.emails.map((e) => (
              <li key={e}>
                <a href={`mailto:${e}`} className="flex items-center gap-1.5 hover:underline">
                  <Mail size={14} aria-hidden /> {e}
                </a>
              </li>
            ))}
            {socials.map((s) => (
              <li key={s.key}>
                <a href={s.href} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </header>

      <Block title="Promises">
        {owe.length + theyOwe.length === 0 ? (
          <EmptyState>Nothing open. When someone says &ldquo;I&rsquo;ll send it over&rdquo;, add it here so neither of you forgets.</EmptyState>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {[
              { title: "You owe", list: owe },
              { title: `${first(p.name)} owes`, list: theyOwe },
            ].map((col) => (
              <div key={col.title}>
                <h3 className="pb-2 text-small font-[550] text-muted">{col.title}</h3>
                {col.list.length ? (
                  <ul className="grid gap-2">
                    {col.list.map((x) => (
                      <li key={x.id} className="flex items-start gap-2.5">
                        <PromiseCheck id={x.id} done={false} label={x.text} />
                        <span className="grid min-w-0 flex-1">
                          <span>{x.text}</span>
                          <span className="text-small text-muted">
                            {x.dueOn ? (x.dueOn < today ? <strong className="font-[550] text-danger">Overdue · {formatLongDate(x.dueOn, today)}</strong> : `Due ${formatLongDate(x.dueOn, today)}`) : "No due date"}
                            {multi ? ` · ${x.spaceName}` : ""}
                          </span>
                        </span>
                        <DeleteButton kind="promise" id={x.id} label={x.text} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-small text-muted">Nothing.</p>
                )}
              </div>
            ))}
          </div>
        )}
        {done.length ? (
          <details className="mt-4">
            <summary className="cursor-pointer text-small text-muted">{done.length === 1 ? "1 done" : `${done.length} done`}</summary>
            <ul className="mt-2 grid gap-2">
              {done.map((x) => (
                <li key={x.id} className="flex items-start gap-2.5 text-muted">
                  <PromiseCheck id={x.id} done label={x.text} />
                  <span className="line-through">{x.text}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </Block>

      <Block title="Timeline">
        {d.touches.length ? (
          <ol className="grid gap-4">
            {d.touches.map((x) => (
              <li key={x.id} className="flex gap-3">
                <span className="w-24 shrink-0 text-small text-muted tabular">{formatLongDate(x.occurredOn, today).replace(/^\w+ /, "")}</span>
                <span className="grid min-w-0 flex-1">
                  <span className="font-[550]">
                    {touchTypeLabels[x.type as TouchType]}
                    {multi ? <span className="font-normal text-muted"> · {x.spaceName}</span> : null}
                    {x.source !== "manual" ? <span className="font-normal text-muted"> · from {x.source}</span> : null}
                  </span>
                  {x.summary ? <span className="whitespace-pre-line text-muted">{x.summary}</span> : null}
                </span>
                <DeleteButton kind="touch" id={x.id} label={`${touchTypeLabels[x.type as TouchType]} on ${x.occurredOn}`} />
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState>No touches yet. Log the last time you spoke, even roughly, so reminders start from the right place.</EmptyState>
        )}
      </Block>

      {d.memberships.map((m) => (
        <Block
          key={m.id}
          title={multi ? m.space.name : "Context"}
          action={
            <Link href={`/people/${p.id}/spaces/${m.space.id}`} className="text-small font-[550] text-accent hover:underline">
              Edit
            </Link>
          }
        >
          <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2">
            <dt className="text-muted">Where you met</dt>
            <dd>{m.whereMet ? `${m.whereMet}${m.metOn ? `, ${formatLongDate(m.metOn, today)}` : ""}` : <span className="text-muted">Not added</span>}</dd>
            <dt className="text-muted">Reminder</dt>
            <dd>
              {m.cadenceDays === 0
                ? "Never"
                : m.cadenceDays
                  ? cadenceLabel(m.cadenceDays)
                  : `${cadenceLabel(effectiveCadence(null, m.circle?.defaultCadenceDays, m.spaceDefaults.cadenceDays))} (${m.circle ? `${m.circle.name} circle` : `${m.space.name} default`})`}
            </dd>
            {m.circle ? (
              <>
                <dt className="text-muted">Circle</dt>
                <dd>{m.circle.name}</dd>
              </>
            ) : null}
            {m.starred ? (
              <>
                <dt className="text-muted">Priority</dt>
                <dd>Yes</dd>
              </>
            ) : null}
            {m.interests.length ? (
              <>
                <dt className="text-muted">Interests</dt>
                <dd>{m.interests.join(", ")}</dd>
              </>
            ) : null}
            {m.tags.length ? (
              <>
                <dt className="text-muted">Tags</dt>
                <dd>{m.tags.map((t) => `#${t}`).join(" ")}</dd>
              </>
            ) : null}
            {m.opportunities ? (
              <>
                <dt className="text-muted">Opportunities</dt>
                <dd className="whitespace-pre-line">{m.opportunities}</dd>
              </>
            ) : null}
          </dl>
          {m.notes ? <p className="mt-4 whitespace-pre-line">{m.notes}</p> : null}
          {multi ? (
            <div className="mt-4">
              <RemoveFromSpaceButton personId={p.id} spaceId={m.space.id} spaceName={m.space.name} personName={first(p.name)} />
            </div>
          ) : null}
        </Block>
      ))}

      {rooms.length ? (
        <Block title="Rooms">
          <ul className="grid gap-2">
            {rooms.map((r) => (
              <li key={`${r.id}:${r.role}`} className="flex justify-between gap-3">
                <Link href={`/rooms/${r.id}`} className="hover:underline">
                  {r.title}
                </Link>
                <span className="text-small text-muted">
                  {roomRoleLabels[r.role]}
                  {r.next ? ` · ${formatLongDate(r.next, today)}` : r.repeats ? "" : ` · ${formatLongDate(r.first, today)}`}
                </span>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {d.goals.length || goalOptions.length ? (
        <Block title="Goals">
          <PersonGoals
            personId={p.id}
            personName={p.name}
            showSpaces={multi}
            options={goalOptions}
            links={d.goals.map((g) => ({ linkId: g.id, goalId: g.goalId, goalText: g.goalText, stage: g.stage, stages: goalStages(d, g) }))}
          />
        </Block>
      ) : null}

      {p.birthday ? (
        <Block title="Details">
          <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2">
            <dt className="text-muted">Birthday</dt>
            <dd>{formatLongDate(`2000-${p.birthday}`).replace(/^\w+ /, "")}</dd>
          </dl>
        </Block>
      ) : null}
    </article>
  );
}
