import "server-only";
import { sql } from "drizzle-orm";
import { addDays } from "@/domain/dates";
import type { IncomingContact } from "@/domain/dedupe";
import { parseIcs, type IcsEvent } from "@/importers/ics";
import { getSystemDb, db as appDb } from "@/server/db/client";
import * as t from "@/server/db/schema";
import type { Database } from "@/server/db/with-user";
import { applyCalendar, type CalendarSummary } from "@/server/import/calendar";
import { applyContacts, type ContactsSummary } from "@/server/import/contacts";
import { finishImport, startImport } from "@/server/import/imports";
import { computeTriageSuggestions } from "@/server/import/triage";
import { fetchGoogleContacts, fetchGoogleEvents, googleAccessToken, googleGrants } from "@/server/integrations/google";
import { ProviderError, ReauthRequired, SyncTokenExpired, type Fetch } from "@/server/integrations/http";
import { fetchIcsUrl, IcsUrlError } from "@/server/integrations/ics-url";
import { fetchMicrosoftContacts, fetchMicrosoftEvents, microsoftAccessToken } from "@/server/integrations/microsoft";
import { connectionsStore, type SyncState } from "@/server/system/connections";
import { jobsStore } from "@/server/system/jobs";
import { prepareSyncedRooms } from "@/server/ai/auto-research";
import { userContext } from "@/server/user-context";

export type SyncDeps = {
  fetch?: Fetch;
  db?: Pick<typeof appDb, "withUser">;
  sys?: Database;
  /** Resolver for ICS hosts (tests). */
  resolve?: (host: string) => Promise<string[]>;
  env?: Record<string, string | undefined>;
  /** Don't start plans for event rooms after the sync (tests). */
  skipPrep?: boolean;
};

/** Neither contacts nor calendar was shared on the provider's consent screen. */
class MissingAccess extends Error {
  constructor(name: string) {
    super(`${name} didn't share contacts or calendar.`);
  }
}

/** A short reason for the logs ("provider 403", "db 42703"), so a failed sync can be traced. Never data. */
function failureCode(e: unknown) {
  if (e instanceof ProviderError) return `provider ${e.status}`;
  const pg = (e as { code?: unknown; cause?: { code?: unknown } })?.code ?? (e as { cause?: { code?: unknown } })?.cause?.code;
  if (typeof pg === "string" && /^[0-9A-Z]{5}$/.test(pg)) return `db ${pg}`;
  return e instanceof Error ? e.name : "unknown";
}

export type SyncSummary = { contacts: ContactsSummary | null; calendar: CalendarSummary | null; importId: string };

const providerName = { google: "Google", microsoft: "Outlook", apple_ics: "your calendar" } as const;
const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;

/**
 * One sync of one connected account: read contacts and calendar, apply them through the import
 * pipeline (dedupe, triage, rooms), and record progress on the job so the UI can show it live.
 * Safe to re-run: every write is keyed so nothing doubles.
 */
export async function runConnectionSync(connectionId: string, jobId: string, deps: SyncDeps = {}): Promise<SyncSummary> {
  const f = deps.fetch ?? fetch;
  const env = deps.env ?? process.env;
  const sys = deps.sys ?? getSystemDb();
  const data = deps.db ?? appDb;
  const store = connectionsStore(sys);
  const jobs = jobsStore(sys);

  const conn = await store.get(connectionId);
  if (!conn || conn.status === "revoked") throw new Error("This account isn't connected any more.");
  const userId = conn.userId;
  const name = providerName[conn.provider];
  const state = conn.syncState;

  try {
    await jobs.progress(jobId, { step: `Connecting to ${name}` });
    const ctx = await data.withUser(userId, userContext);
    const spaceId = state.spaceId ?? (await data.withUser(userId, async (tx) => (await tx.select({ id: t.spaces.id }).from(t.spaces).orderBy(t.spaces.position).limit(1))[0]?.id));
    if (!spaceId) throw new Error("No Space to import into.");

    let contacts: IncomingContact[] = [];
    let events: IcsEvent[] = [];
    const next: SyncState = {};
    let meEmails = [conn.accountEmail ?? ""].filter(Boolean);

    if (conn.provider === "google" || conn.provider === "microsoft") {
      if (!conn.tokens) throw new ReauthRequired(name);
      const creds =
        conn.provider === "google"
          ? { clientId: env.GOOGLE_CLIENT_ID ?? "", clientSecret: env.GOOGLE_CLIENT_SECRET ?? "" }
          : { clientId: env.MICROSOFT_CLIENT_ID ?? "", clientSecret: env.MICROSOFT_CLIENT_SECRET ?? "" };
      const access = conn.provider === "google" ? await googleAccessToken(f, conn.tokens, creds) : await microsoftAccessToken(f, conn.tokens, creds);
      if (access.refreshed) await store.saveTokens(connectionId, access.tokens);
      const token = access.tokens.access_token;

      if (conn.provider === "google") {
        const grants = googleGrants(conn.scopes ?? []);
        if (!grants.contacts && !grants.calendar) throw new MissingAccess(name);
        const firstRun = !state.contacts?.syncToken;
        if (grants.contacts) await jobs.progress(jobId, { step: `Reading your ${name} contacts` });
        const r = !grants.contacts ? { contacts: [], nextSyncToken: null } : await fetchGoogleContacts(f, token, {
          syncToken: state.contacts?.syncToken,
          region: ctx.region,
          onPage: (n) => void jobs.progress(jobId, { step: `Reading your ${name} contacts`, done: n }),
        }).catch(async (e) => {
          // An expired sync token means "read everything again".
          if (!firstRun && e instanceof SyncTokenExpired) return fetchGoogleContacts(f, token, { region: ctx.region });
          throw e;
        });
        contacts = r.contacts;
        next.contacts = { syncToken: r.nextSyncToken };
        if (grants.calendar) {
          await jobs.progress(jobId, { step: `Reading your ${name} calendar`, summary: { contactsFound: contacts.length } });
          const ev = await fetchGoogleEvents(f, token, {
            timeMin: `${addDays(ctx.today, -183)}T00:00:00Z`,
            timeMax: `${addDays(ctx.today, 92)}T00:00:00Z`,
            syncTokens: state.calendars ?? {},
            defaultTz: ctx.timezone,
          });
          events = ev.events;
          next.calendars = ev.nextTokens;
        }
      } else {
        await jobs.progress(jobId, { step: `Reading your ${name} contacts` });
        const r = await fetchMicrosoftContacts(f, token, { deltaLink: state.contacts?.deltaLink, region: ctx.region });
        contacts = r.contacts;
        next.contacts = { deltaLink: r.deltaLink };
        await jobs.progress(jobId, { step: `Reading your ${name} calendar`, summary: { contactsFound: contacts.length } });
        events = (await fetchMicrosoftEvents(f, token, { since: addDays(ctx.today, -270), defaultTz: ctx.timezone })).events;
      }
    } else {
      await jobs.progress(jobId, { step: "Reading your calendar" });
      if (!conn.icsUrl) throw new IcsUrlError("The calendar link is missing. Add it again.");
      const cal = parseIcs(await fetchIcsUrl(conn.icsUrl, { fetch: f, resolve: deps.resolve }));
      events = cal.events;
      meEmails = [];
    }

    await jobs.progress(jobId, {
      step: `Found ${plural(contacts.length, "contact", "contacts")} and ${plural(events.length, "calendar event", "calendar events")}. Matching them with your people`,
      summary: { contactsFound: contacts.length, eventsFound: events.length },
    });

    const result = await data.withUser(userId, async (tx) => {
      const profileEmails = (await tx.select({ emails: t.profiles.emails }).from(t.profiles))[0]?.emails ?? [];
      const imp = await startImport(tx, { userId, spaceId, type: conn.provider, connectionId, jobId });
      const ictx = { userId, importId: imp.id, spaceId, today: ctx.today, source: conn.provider === "apple_ics" ? "calendar" : conn.provider };
      const c = contacts.length ? await applyContacts(tx, ictx, contacts) : null;
      const applied = events.length ? await applyCalendar(tx, { ...ictx, meEmails: [...meEmails, ...profileEmails], connectionId }, events) : null;
      const { eventRooms = [], ...cal } = applied ?? {};
      const calendar = applied ? (cal as CalendarSummary) : null;
      await computeTriageSuggestions(tx, { today: ctx.today, importId: imp.id });
      await finishImport(tx, imp.id, { contacts: c, calendar });
      return { contacts: c, calendar, importId: imp.id, eventRooms };
    });

    // Fresh planner statistics after bulk writes keep the people list fast (DECISIONS #35).
    if ((result.contacts?.added ?? 0) + (result.calendar?.newPeople ?? 0) > 200) {
      await sys.execute(sql`analyze people`);
      await sys.execute(sql`analyze person_spaces`);
    }

    await store.saveSync(connectionId, { ...next, lastImportId: result.importId, lastJobId: jobId, lastSummary: { contacts: result.contacts, calendar: result.calendar } });
    await jobs.done(jobId, { step: "Done", summary: { contacts: result.contacts, calendar: result.calendar } }, { importId: result.importId, connectionId });
    // Conferences and mixers from the calendar get a plan, like rooms you add by hand (P3).
    if (!deps.skipPrep) await prepareSyncedRooms(userId, spaceId, result.eventRooms, ctx.today).catch((e) => console.error("room prep after sync failed", e));
    return { contacts: result.contacts, calendar: result.calendar, importId: result.importId };
  } catch (e) {
    // A 403 from Google means the person didn't tick Contacts or Calendar on its consent screen.
    const noAccess = e instanceof MissingAccess || (e instanceof ProviderError && e.status === 403);
    if (!(e instanceof ReauthRequired) && !(e instanceof IcsUrlError)) console.error(`sync ${conn.provider} failed (${failureCode(e)})`, e);
    const message =
      e instanceof ReauthRequired
        ? `${name} needs you to reconnect. Google asks for this every 7 days while the app is in testing.`
        : noAccess
          ? `${name} didn't share your contacts or calendar with Inroads. Reconnect and tick both boxes on ${name}'s screen.`
          : e instanceof IcsUrlError
            ? e.message
            : `Syncing ${name} didn't finish. It will try again shortly.`;
    if (e instanceof ReauthRequired || noAccess) await store.setStatus(connectionId, "error", "reconnect");
    else if (e instanceof IcsUrlError) await store.setStatus(connectionId, "error", e.message);
    await jobs.fail(jobId, message);
    if (!(e instanceof ReauthRequired) && !(e instanceof IcsUrlError) && !noAccess) throw e;
    return { contacts: null, calendar: null, importId: "" };
  }
}
