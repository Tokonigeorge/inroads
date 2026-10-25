import Link from "next/link";
import type { ReactNode } from "react";
import { matchGoal, type Plan } from "@/server/repos/prep";
import { KeepPerson, KeepStep } from "./plan-actions";

function Part({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="grid gap-2 pb-6">
      <h3 className="font-semibold">{title}</h3>
      {hint ? <p className="text-small text-muted">{hint}</p> : null}
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
  return (
    <div>
      {people.length ? (
        <Part title="Who to meet" hint={plan.goals.length ? undefined : "Add a goal and Inroads can put these people straight onto it."}>
          <ul className="grid gap-3">
            {people.map(({ s, i }) => (
              <li key={i} className="grid gap-1">
                <p>
                  <span className="font-[550]">
                    {s.url && s.name ? (
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                        {s.name}
                      </a>
                    ) : (
                      s.name || s.role
                    )}
                  </span>
                  {s.name && s.role ? <span className="text-muted"> · {s.role}</span> : null}
                </p>
                {s.why ? <p className="text-small">{s.why}</p> : null}
                <KeepPerson searchId={plan.id} index={i} name={s.name.trim()} goals={plan.goals} keptId={plan.keptPeople[i] ?? null} />
              </li>
            ))}
          </ul>
        </Part>
      ) : null}
      {r.warmPaths.length ? (
        <Part title="Who can introduce you">
          <ul className="grid gap-2">
            {r.warmPaths.slice(0, compact ? 3 : 10).map((w) => (
              <li key={w.contactId}>
                <Link href={`/people/${w.contactId}`} className="font-[550] hover:underline">
                  {w.name}
                </Link>{" "}
                <span className="text-muted">· {w.how}</span>
                {w.angle ? <p className="text-small">Ask: {w.angle}</p> : null}
              </li>
            ))}
          </ul>
        </Part>
      ) : null}
      {openings.length ? (
        <Part title="Openings for your goals">
          <ul className="grid gap-3">
            {openings.map(({ o, i }) => (
              <li key={i} className="grid gap-1">
                <p>{o.idea}</p>
                {o.firstMove ? <p className="text-small text-muted">First move: {o.firstMove}</p> : null}
                <KeepStep searchId={plan.id} index={i} goals={plan.goals} suggestedGoalId={matchGoal(plan.goals, o.goal)?.id ?? null} kept={plan.keptSteps.includes(i)} />
              </li>
            ))}
          </ul>
        </Part>
      ) : null}
      {tips.length ? (
        <Part title="Tips for the room">
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
