import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { and, eq, isNull, sql } from "drizzle-orm";
import { goalTypeLabels } from "@/contracts/goals";
import { formatLongDate } from "@/domain/dates";
import { progressMeter, progressSummary } from "@/domain/goal-progress";
import { AiJobButton } from "@/features/ai/ai-job-button";
import { Backup } from "@/features/settings/backup";
import { ExampleDataForm } from "@/features/settings/example-data-form";
import { ProfileGoalsButton, type ProfileGoalsValues } from "@/features/settings/profile-goals-sheet";
import { SourceTiles } from "@/features/settings/source-tiles";
import { LoadingRows, PageFrame } from "@/features/shell/page-frame";
import { isAiConfigured } from "@/server/ai/config";
import { loadSpaceView } from "@/features/spaces/space-view";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { getAccountOverview } from "@/server/repos/account";
import { listConnections } from "@/server/repos/connections";
import { listGoals, type GoalSummary } from "@/server/repos/goals";
import { introOutcomes } from "@/server/repos/intros";
import { userContext } from "@/server/user-context";
import { Button } from "@/ui/button";
import { EmptyState, PageHeader, Section } from "@/ui/layout";
import { TargetHit } from "@/ui/meter";

export const metadata: Metadata = { title: "Goals" };
export const maxDuration = 300;

export default function GoalsPage({ searchParams }: PageProps<"/goals">) {
  return (
    <PageFrame>
      <Suspense fallback={<LoadingRows />}>
        <Goals searchParams={searchParams} />
      </Suspense>
    </PageFrame>
  );
}

const providerName: Record<string, string> = { google: "Google", microsoft: "Outlook", apple_ics: "Calendar link" };
const priorityBadge: Record<number, { label: string; className: string }> = {
  1: { label: "High", className: "bg-[color-mix(in_srgb,var(--hot)_14%,transparent)] text-hot" },
  2: { label: "Med", className: "bg-sunk text-muted" },
  3: { label: "Low", className: "bg-sunk text-faint" },
};

/**
 * The Goals tab is the prototype's "Profile & goals" (L967–995), which is also where its settings
 * live: who you are, your goals, goal-fit scores, ways to bring people in, backup, the example
 * network and connections. Time zone, Spaces, AI usage and the account sit on Account.
 */
async function Goals({ searchParams }: { searchParams: PageProps<"/goals">["searchParams"] }) {
  const [q, user] = await Promise.all([searchParams, requireUser()]);
  const archived = q.archived === "1";
  const [{ profile, counts }, data] = await Promise.all([
    getAccountOverview(user.id),
    db.withUser(user.id, async (tx) => {
      const [view, ctx] = await Promise.all([loadSpaceView(tx), userContext(tx)]);
      const opts = { spaceId: view.selected?.id ?? null, today: ctx.today, tz: ctx.timezone };
      const [goals, archivedGoals, accounts, [scored], intros] = await Promise.all([
        listGoals(tx, { ...opts, archived }),
        archived ? Promise.resolve([]) : listGoals(tx, { ...opts, archived: true }),
        listConnections(tx),
        tx.select({ n: sql<number>`count(distinct ${t.scores.personId})::int` }).from(t.scores),
        introOutcomes(tx, opts.spaceId),
      ]);
      const [mine] = await tx.select({ id: t.goals.id }).from(t.goals).where(and(isNull(t.goals.archivedAt), eq(t.goals.example, false))).limit(1);
      return { goals, archivedCount: archivedGoals.length, accounts, scored: scored?.n ?? 0, spaces: view.spaces, hasOwnGoals: Boolean(mine), intros, today: ctx.today };
    }),
  ]);

  if (archived) {
    return (
      <>
        <Link href="/goals" className="inline-block pt-3 text-small font-semibold text-accent hover:underline">
          ← Goals
        </Link>
        <Section title="Archived goals">{data.goals.length ? <GoalList goals={data.goals} /> : <EmptyState>Nothing archived.</EmptyState>}</Section>
      </>
    );
  }

  const values: ProfileGoalsValues = {
    name: profile.name ?? "",
    location: profile.location ?? "",
    headline: profile.headline ?? "",
    background: profile.background ?? "",
    offerings: profile.offerings ?? "",
    industries: (profile.industries ?? []).join(", "),
    emails: (profile.emails ?? []).join(", "),
    goals: data.goals.filter((g) => !g.archived).map((g) => ({ id: g.id, text: g.text, type: g.type, priority: g.priority, weeklyTarget: g.weeklyTarget, active: g.active })),
  };
  const active = data.goals.filter((g) => g.active && !g.archived).length;
  const kv = (k: string, v: string | null | undefined) =>
    v ? (
      <>
        <dt className="text-muted">{k}</dt>
        <dd className="min-w-0 whitespace-pre-line [overflow-wrap:anywhere]">{v}</dd>
      </>
    ) : null;
  const about = profile.location || profile.background || profile.offerings || (profile.industries ?? []).length || (profile.emails ?? []).length;
  const next = Math.min(60, counts.people);
  const ai = isAiConfigured();

  return (
    <>
      <PageHeader
        stamp="Profile & goals"
        title={profile.name || "Your profile"}
        subtitle={profile.headline || "Tell Inroads who you are and what you want from your network. Scoring, research and briefs all read from here."}
        actions={<ProfileGoalsButton values={values} label={profile.name ? "Edit profile & goals" : "Set up your profile"} />}
      />

      <Section
        title="Goals"
        count={`${active} active`}
        action={
          <Button asChild size="sm">
            <Link href="/goals/new">Add a goal</Link>
          </Button>
        }
      >
        {data.goals.length ? (
          <GoalList goals={data.goals} />
        ) : (
          <EmptyState>No goals yet. Examples: raise a pre-seed round, land three enterprise clients, hire a senior engineer, expand into Accra.</EmptyState>
        )}
        {data.archivedCount ? (
          <Link href="/goals?archived=1" className="text-small text-muted hover:text-ink">
            Archived goals ({data.archivedCount})
          </Link>
        ) : null}
      </Section>

      <Section title="Intros" count={data.intros.asked ? `${data.intros.asked} asked` : undefined}>
        {data.intros.asked ? (
          <>
            <dl className="grid grid-cols-3 gap-2 text-center">
              {(
                [
                  ["Asked", data.intros.asked, "for an introduction"],
                  ["Made", data.intros.made, "introductions done"],
                  ["Met", data.intros.met, "you've since spoken to"],
                ] as const
              ).map(([k, v, hint]) => (
                <div key={k} className="grid gap-0.5 rounded-md border border-line bg-surface px-2 py-3">
                  <dt className="text-[12px] font-semibold tracking-[0.04em] text-muted uppercase">{k}</dt>
                  <dd className="font-display text-[26px] leading-none font-[680] tabular-nums">{v}</dd>
                  <dd className="text-[12px] text-muted">{hint}</dd>
                </div>
              ))}
            </dl>
            {data.intros.waiting.length ? (
              <div className="grid gap-1.5 pt-2">
                <h3 className="text-[14px] font-semibold">Waiting on</h3>
                <ul className="grid gap-1 text-[14px]">
                  {data.intros.waiting.map((w) => (
                    <li key={w.id}>
                      <Link href={`/people/${w.connectorId}`} className="font-[550] hover:underline">
                        {w.connector}
                      </Link>{" "}
                      to introduce you to{" "}
                      <Link href={`/people/${w.targetId}`} className="hover:underline">
                        {w.target}
                      </Link>
                      {w.dueOn ? <span className={w.dueOn < data.today ? "font-[550] text-accent" : "text-muted"}> · {w.dueOn < data.today ? "overdue, follow up" : `by ${formatLongDate(w.dueOn, data.today)}`}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-[13.5px] text-muted">Ask for an introduction from someone&apos;s page (&ldquo;Who could introduce you&rdquo;). How many were made, and how many became a conversation, show here.</p>
        )}
      </Section>

      {about ? (
        <Section title="About you">
          <dl className="grid grid-cols-[minmax(110px,32%)_minmax(0,1fr)] gap-x-3.5 gap-y-2 text-[14.5px]">
            {kv("Based in", profile.location)}
            {kv("Background", profile.background)}
            {kv("What you offer", profile.offerings)}
            {kv("Target industries", (profile.industries ?? []).join(", "))}
            {kv("Your emails", (profile.emails ?? []).join(", "))}
          </dl>
        </Section>
      ) : null}

      <Section title="Goal-fit scores">
        <p className="text-[13.5px] text-muted">
          {data.scored} of {counts.people} people scored against your active goals. Each run scores the {next || 60} people with the oldest or missing scores.
        </p>
        {counts.people && active ? (
          <div className="flex flex-wrap gap-2">
            {[...new Map(data.goals.filter((g) => g.active && !g.archived).map((g) => [g.space.id, g.space.name])).entries()].map(([spaceId, name], i, all) => (
              <AiJobButton key={spaceId} aiEnabled={ai} variant="primary" size="md" job={{ kind: "score", spaceId }} label={all.length > 1 ? `Score ${next} people in ${name}` : `Score ${next} people`} />
            ))}
          </div>
        ) : null}
      </Section>

      <Section
        title="Import from Google"
        action={
          <Button asChild variant="primary">
            <Link href="/settings/connections">Connect Google</Link>
          </Button>
        }
      >
        <p className="text-[13.5px] text-muted">
          Connect once and Inroads keeps your contacts and calendar in sync. You review new people before they&apos;re sorted into your network, and syncing again only adds what&apos;s new.
        </p>
        <details className="text-[14px]">
          <summary className="font-semibold text-accent">Prefer files? Upload what Google downloads</summary>
          <ul className="grid gap-2.5 pt-3">
            {[
              ["Google Contacts", "On a computer, open Google Contacts. Tick one contact, then use Selection actions → All. Click More actions (⋮, top right) → Export, choose Google CSV, Outlook CSV or vCard, and click Export.", "https://contacts.google.com/", "Open Google Contacts ↗"],
              ["Google Calendar", "On a computer (the phone app can't export), open Google Calendar → Settings → Import & export → Export. You get a .zip with one .ics file per calendar; upload the .zip as it is.", "https://calendar.google.com/calendar/r/settings/export", "Open the export page ↗"],
              ["Both at once", "In Google Takeout, click Deselect all, tick Contacts and Calendar, then create one export and download the .zip.", "https://takeout.google.com/", "Open Google Takeout ↗"],
            ].map(([title, body, href, label]) => (
              <li key={title} className="grid gap-1 rounded-md border border-line bg-surface p-3">
                <b>{title}</b>
                <span className="text-muted">{body}</span>
                <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent hover:underline">
                  {label}
                </a>
              </li>
            ))}
          </ul>
          <Button asChild size="sm" className="mt-3">
            <Link href="/settings/connections#files">Choose Google files</Link>
          </Button>
        </details>
      </Section>

      <Section title="Other sources">
        <SourceTiles />
      </Section>

      <div id="backup" className="scroll-mt-20">
        <Section title="Backup">
          <Backup />
        </Section>
      </div>

      <div id="examples" className="scroll-mt-20">
      <Section title="Example network">
        <p className="text-[13.5px] text-muted">
          {counts.examples
            ? `${counts.examples} example records are loaded. They're marked "example" and are safe to remove.`
            : "Load six example people and four events to see every feature with data in it."}
        </p>
        <div>
          <ExampleDataForm loaded={counts.examples > 0} loadLabel="Load examples" removeLabel="Remove examples" />
        </div>
      </Section>
      </div>

      <Section
        title="Connections"
        action={
          <Button asChild size="sm">
            <Link href="/settings/connections">Manage</Link>
          </Button>
        }
      >
        <ul className="grid gap-2">
          <li className="flex items-center gap-2.5 text-[14.5px]">
            <i aria-hidden className={`size-2 rounded-full ${ai ? "bg-good" : "bg-warn"}`} />
            {ai ? "AI research and briefs are on" : "AI features aren't set up on this server"}
          </li>
          {data.accounts.length ? (
            data.accounts.map((a) => (
              <li key={a.id} className="flex items-center gap-2.5 text-[14.5px]">
                <i aria-hidden className={`size-2 rounded-full ${a.status === "active" ? "bg-good" : "bg-warn"}`} />
                {providerName[a.provider] ?? a.provider}
                {a.accountEmail ? ` · ${a.accountEmail}` : ""} · {a.status === "error" ? (a.lastError === "reconnect" ? "needs reconnecting" : "last sync failed") : a.lastSyncedAt ? "synced" : "not synced yet"}
              </li>
            ))
          ) : (
            <li className="flex items-center gap-2.5 text-[14.5px]">
              <i aria-hidden className="size-2 rounded-full bg-faint" />
              No accounts connected yet
            </li>
          )}
        </ul>
      </Section>

      <Section title="Account">
        <p className="text-[13.5px] text-muted">Time zone, phone region, brief time, Spaces, AI usage, sign out and delete your account.</p>
        <div>
          <Button asChild>
            <Link href="/settings">Account and Spaces</Link>
          </Button>
        </div>
      </Section>
    </>
  );
}

/** Goal rows (prototype .goal-item, L971): priority badge, the goal, its type and pace, how many people. Each opens its pipeline. */
function GoalList({ goals }: { goals: GoalSummary[] }) {
  return (
    <ul className="grid gap-2">
      {goals.map((g, i) => {
        const m = progressMeter(g.progress);
        const badge = priorityBadge[g.priority] ?? priorityBadge[2];
        return (
          <li key={g.id} className="rise" style={{ ["--i" as string]: i }}>
            <Link
              href={`/goals/${g.id}`}
              className={`lift grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-line bg-surface px-3.5 py-3 hover:border-accent/60 ${g.active ? "" : "opacity-60"}`}
            >
              <span className={`rounded-md px-2 py-1 font-mono text-[11px] leading-none font-semibold tracking-[0.06em] uppercase ${badge.className}`}>{badge.label}</span>
              <span className="grid min-w-0">
                <b className="flex items-center gap-2">
                  <span className="truncate">{g.text}</span>
                  {g.active && !g.archived && m.done >= m.target ? <TargetHit /> : null}
                </b>
                <span className="text-[13.5px] text-muted">
                  {goalTypeLabels[g.type]} · {g.weeklyTarget} touches a week
                  {g.archived ? " · archived" : g.active ? ` · ${progressSummary(g.progress)}` : " · paused"}
                </span>
              </span>
              <span className="font-mono text-[12px] text-faint">
                {g.people} {g.people === 1 ? "person" : "people"}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
