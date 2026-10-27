import Link from "next/link";
import type { ReactNode } from "react";
import { matchGoal, type Plan } from "@/server/repos/prep";
import { Avatar } from "@/ui/list-row";
import { PlanPeople, KeepStep } from "./plan-actions";

function Part({ id, title, hint, children }: { id?: string; title: string; hint?: string; children: ReactNode }) {
  return (
    <section id={id} aria-label={title} className="sec scroll-mt-20">
      <h3>{title}</h3>
      {hint ? <p className="hint">{hint}</p> : null}
      {children}
    </section>
  );
}

/**
 * What a look-up found, as things to act on: people to meet (one tap onto a goal), who can
 * introduce you, and first moves (one tap into a goal's steps). `compact` shows the top few.
 */
export function PlanView({ plan, compact = false }: { plan: Plan; compact?: boolean }) {
  const r = plan.result;
  const people = r.stakeholders.map((s, i) => ({ s, i })).slice(0, compact ? 4 : 8);
  const openings = r.opportunities.map((o, i) => ({ o, i })).slice(0, compact ? 3 : 5);
  const tips = compact ? r.playbook.slice(0, 3) : r.playbook;
  const named = r.stakeholders.map((s, i) => ({ s, i })).filter(({ s }) => s.name.trim());
  const keptPeople = named.filter(({ i }) => plan.keptPeople[i]).length;
  const keptSteps = plan.keptSteps.length;
  return (
    <div className="grid gap-4">
      {compact ? null : (
        <NextSteps
          steps={[
            named.length ? { href: "#plan-people", text: "Add the people worth meeting. Each is saved, put on your goal and researched.", done: keptPeople, of: named.length } : null,
            r.warmPaths.length ? { href: "#plan-intros", text: "Ask someone you know for an intro before the day.", done: 0, of: 0 } : null,
            r.opportunities.length ? { href: "#plan-openings", text: "Turn openings into steps on your goal, so they show on Today when due.", done: keptSteps, of: r.opportunities.length } : null,
            { href: tips.length ? "#plan-tips" : undefined, text: "On the day, Today shows who you'll see and what to talk about. Afterwards it asks who you met.", done: 0, of: 0 },
          ]}
        />
      )}
      {people.length ? (
        <Part id="plan-people" title="Key people" hint={plan.goals.length ? undefined : "Add a goal and Inroads can put these people straight onto it."}>
          <PlanPeople
            searchId={plan.id}
            people={people.map(({ s, i }) => ({ index: i, name: s.name.trim(), role: s.role, why: s.why, url: s.url }))}
            goals={plan.goals}
            kept={plan.keptPeople}
          />
        </Part>
      ) : null}
      {r.warmPaths.length ? (
        <Part id="plan-intros" title="Your warm paths in">
          <ul className="list">
            {r.warmPaths.slice(0, compact ? 3 : 10).map((w) => (
              <li key={w.contactId}>
                <Link href={`/people/${w.contactId}`} className="row">
                  <Avatar name={w.name} size={42} />
                  <span className="grid min-w-0 gap-px">
                    <span className="row-name">{w.name}</span>
                    <span className="row-sub">{w.how}</span>
                    {w.angle ? <span className="row-sub">Ask: {w.angle}</span> : null}
                  </span>
                  <span />
                </Link>
              </li>
            ))}
          </ul>
        </Part>
      ) : null}
      {openings.length ? (
        <Part id="plan-openings" title="Openings for your goals">
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,260px),1fr))] gap-2.5">
            {openings.map(({ o, i }) => (
              <li key={i} className="mini">
                {o.goal ? (
                  <span className="tags">
                    <span className="tag goal">{o.goal}</span>
                  </span>
                ) : null}
                <p className="text-[14px]">{o.idea}</p>
                {o.firstMove ? <p className="text-[14px] text-muted">First move: {o.firstMove}</p> : null}
                <KeepStep searchId={plan.id} index={i} goals={plan.goals} suggestedGoalId={matchGoal(plan.goals, o.goal)?.id ?? null} kept={plan.keptSteps.includes(i)} />
              </li>
            ))}
          </ul>
        </Part>
      ) : null}
      {tips.length ? (
        <Part id="plan-tips" title="How to work the room">
          <ul className="grid list-disc gap-1 pl-5">
            {tips.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </Part>
      ) : null}
    </div>
  );
}

type Step = { href?: string; text: string; done: number; of: number };

/** The plan as numbered things to do, with what's done so far: so it's clear where to start. */
function NextSteps({ steps }: { steps: (Step | null)[] }) {
  const list = steps.filter((x): x is Step => Boolean(x));
  return (
    <section aria-label="What to do next" className="rounded-md border border-accent/40 bg-accent-soft/40 p-4">
      <h3 className="pb-2 font-semibold">What to do next</h3>
      <ol className="grid gap-2">
        {list.map((st, n) => {
          const complete = st.of > 0 && st.done >= st.of;
          const body = (
            <>
              <span
                aria-hidden
                className={`flex size-6 shrink-0 items-center justify-center rounded-full text-small font-semibold ${complete ? "bg-accent text-on-accent" : "border border-accent text-accent"}`}
              >
                {complete ? "✓" : n + 1}
              </span>
              <span className={complete ? "text-muted line-through" : undefined}>
                {st.text}
                {st.of > 0 && !complete ? <span className="text-muted"> ({st.done} of {st.of})</span> : null}
              </span>
            </>
          );
          return (
            <li key={n}>
              {st.href ? (
                <a href={st.href} className="flex items-start gap-3 rounded-md p-1 transition-colors hover:bg-accent-soft">
                  {body}
                </a>
              ) : (
                <span className="flex items-start gap-3 p-1">{body}</span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
