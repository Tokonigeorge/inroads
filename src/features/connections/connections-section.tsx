import "server-only";
import { providerLabels } from "@/contracts/connections";
import { addDays, formatLongDate, todayIn } from "@/domain/dates";
import { formatTime, instantInZone } from "@/domain/zoned";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import { isProviderConfigured } from "@/server/integrations/oauth";
import { listConnections, recentImports } from "@/server/repos/connections";
import { listSpaces } from "@/server/repos/spaces";
import { userContext } from "@/server/user-context";
import { ConnectionsPanel, type ConnectionRow, type ImportRow } from "./connections-panel";
import { errorNotice } from "./notices";

const importNames: Record<string, string> = {
  google: "Google",
  microsoft: "Outlook",
  apple_ics: "Calendar link",
  contact_picker: "Phone contacts",
};

/** "today 3:05pm", "yesterday 9am" or "Thursday 23 October", in the user's time zone. */
function when(instant: Date, tz: string) {
  const { date, time } = instantInZone(instant, tz);
  const today = todayIn(tz);
  if (date === today) return `today ${formatTime(time)}`;
  if (date === addDays(today, -1)) return `yesterday ${formatTime(time)}`;
  return formatLongDate(date, today);
}

function importDetail(counts: Record<string, unknown>) {
  const c = counts.contacts as { added?: number; updated?: number } | null | undefined;
  const cal = counts.calendar as { rooms?: number; logged?: number } | null | undefined;
  const parts: string[] = [];
  if (c) parts.push(`${c.added ?? 0} added, ${c.updated ?? 0} updated`);
  if (cal) parts.push(`${cal.rooms ?? 0} rooms, ${cal.logged ?? 0} meetings`);
  return parts.join(" · ") || "Nothing new";
}

type Query = Record<string, string | string[] | undefined>;

/** Connected accounts, live sync progress and recent imports. Used by Settings and onboarding. */
export async function ConnectionsSection({ searchParams, returnTo }: { searchParams: Promise<Query>; returnTo: string }) {
  const [q, user] = await Promise.all([searchParams, requireUser()]);
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const { connections, spaces, imports, tz } = await db.withUser(user.id, async (tx) => {
    const [connections, spaces, imports, ctx] = await Promise.all([listConnections(tx), listSpaces(tx), recentImports(tx), userContext(tx)]);
    return { connections, spaces, imports, tz: ctx.timezone };
  });
  const spaceName = new Map(spaces.map((s) => [s.id, s.name]));
  const rows: ConnectionRow[] = connections.map((c) => ({
    id: c.id,
    provider: c.provider,
    label: c.provider === "apple_ics" ? `Calendar on ${(c.accountEmail ?? "").split("#")[0]}` : (c.accountEmail ?? providerLabels[c.provider].name),
    status: c.status,
    lastError: c.lastError,
    lastSynced: c.lastSyncedAt ? when(c.lastSyncedAt, tz) : null,
    spaceName: c.spaceId ? (spaceName.get(c.spaceId) ?? null) : null,
  }));
  const importRows: ImportRow[] = imports.map((i) => ({
    id: i.id,
    what: importNames[i.type] ?? i.type,
    when: when(i.createdAt, tz),
    spaceName: i.spaceName,
    detail: importDetail(i.counts),
    status: i.status,
  }));
  const job = one(q.job);
  return (
    <ConnectionsPanel
      connections={rows}
      spaces={spaces.map((s) => ({ id: s.id, name: s.name }))}
      imports={importRows}
      configured={{ google: isProviderConfigured("google"), microsoft: isProviderConfigured("microsoft") }}
      initialJobId={job && /^[0-9a-f-]{36}$/i.test(job) ? job : null}
      notice={errorNotice(one(q.error), one(q.provider))}
      returnTo={returnTo}
    />
  );
}
