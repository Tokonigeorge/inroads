import "server-only";
import type { IncomingContact } from "@/domain/dedupe";
import { normaliseEmail, normalisePhone } from "@/domain/normalise";
import { instantInZone, isValidTimeZone } from "@/domain/zoned";
import type { IcsAttendee, IcsEvent } from "@/importers/ics";
import { getJson, postForm, ProviderError, providerUrl, ReauthRequired, SyncTokenExpired, type Fetch } from "./http";

/**
 * Google Contacts (People API) and Calendar, read-only. Sign-in with Google only asks for
 * identity; these scopes are a separate, incremental consent (TECH_PLAN §6.1).
 */
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/contacts.readonly",
  "https://www.googleapis.com/auth/calendar.events.readonly",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
];

/**
 * What the person actually shared. Google's consent screen has a checkbox per scope, and people
 * often leave Contacts or Calendar unticked; reading what wasn't granted fails with a 403.
 */
export function googleGrants(scopes: string | string[]) {
  const s = new Set(Array.isArray(scopes) ? scopes : scopes.split(/\s+/).filter(Boolean));
  const calendarAll = s.has("https://www.googleapis.com/auth/calendar.readonly") || s.has("https://www.googleapis.com/auth/calendar");
  return {
    contacts: s.has("https://www.googleapis.com/auth/contacts.readonly") || s.has("https://www.googleapis.com/auth/contacts"),
    calendar: calendarAll || (s.has("https://www.googleapis.com/auth/calendar.events.readonly") && s.has("https://www.googleapis.com/auth/calendar.calendarlist.readonly")),
  };
}

const url = {
  auth: () => providerUrl("google", "https://accounts.google.com/o/oauth2/v2/auth"),
  token: () => providerUrl("google", "https://oauth2.googleapis.com/token"),
  revoke: () => providerUrl("google", "https://oauth2.googleapis.com/revoke"),
  userinfo: () => providerUrl("google", "https://openidconnect.googleapis.com/v1/userinfo"),
  people: (path: string) => providerUrl("google", `https://people.googleapis.com/v1/${path}`),
  calendar: (path: string) => providerUrl("google", `https://www.googleapis.com/calendar/v3/${path}`),
};

export type GoogleTokens = { access_token: string; refresh_token?: string; expires_at: number; scope: string };

export function googleAuthUrl(opts: { clientId: string; redirectUri: string; state: string; loginHint?: string }) {
  const q = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: opts.state,
    ...(opts.loginHint ? { login_hint: opts.loginHint } : {}),
  });
  return `${url.auth()}?${q}`;
}

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string };

export async function exchangeGoogleCode(f: Fetch, opts: { clientId: string; clientSecret: string; code: string; redirectUri: string }): Promise<GoogleTokens> {
  const { status, body } = await postForm<TokenResponse>(f, url.token(), {
    code: opts.code,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    redirect_uri: opts.redirectUri,
    grant_type: "authorization_code",
  });
  if (status !== 200 || !body.access_token) throw new Error(`Google sign-in failed (${body.error ?? status}).`);
  return { access_token: body.access_token, refresh_token: body.refresh_token, expires_at: Date.now() + (body.expires_in ?? 3600) * 1000, scope: body.scope ?? "" };
}

/**
 * A usable access token, refreshing if it's about to expire. Throws ReauthRequired only when Google
 * says the grant is gone; an outage or rate limit is a ProviderError, so the next scheduled sync retries.
 */
export async function googleAccessToken(f: Fetch, tokens: GoogleTokens, opts: { clientId: string; clientSecret: string }): Promise<{ tokens: GoogleTokens; refreshed: boolean }> {
  if (tokens.expires_at > Date.now() + 60_000) return { tokens, refreshed: false };
  if (!tokens.refresh_token) throw new ReauthRequired("Google");
  const { status, body } = await postForm<TokenResponse>(f, url.token(), {
    grant_type: "refresh_token",
    refresh_token: tokens.refresh_token,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
  });
  if (status === 401 || (status === 400 && body.error === "invalid_grant")) throw new ReauthRequired("Google");
  if (status !== 200 || !body.access_token) throw new ProviderError(`Token refresh failed (${body.error ?? status})`, status);
  return { tokens: { ...tokens, access_token: body.access_token, expires_at: Date.now() + (body.expires_in ?? 3600) * 1000 }, refreshed: true };
}

export async function googleAccountEmail(f: Fetch, accessToken: string) {
  const info = await getJson<{ email?: string }>(f, url.userinfo(), accessToken);
  return normaliseEmail(info.email) ?? "";
}

export async function revokeGoogle(f: Fetch, token: string) {
  await f(`${url.revoke()}?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => null);
}

/* ---------------- contacts ---------------- */

type GPerson = {
  resourceName: string;
  metadata?: { deleted?: boolean };
  names?: { displayName?: string }[];
  emailAddresses?: { value?: string }[];
  phoneNumbers?: { value?: string; canonicalForm?: string }[];
  organizations?: { name?: string; title?: string }[];
  addresses?: { city?: string }[];
  birthdays?: { date?: { month?: number; day?: number } }[];
  urls?: { value?: string }[];
  memberships?: { contactGroupMembership?: { contactGroupResourceName?: string } }[];
};

export { urlsToSocials } from "@/importers/common";
import { urlsToSocials } from "@/importers/common";

export function mapGooglePerson(p: GPerson, region: string, groupNames: Map<string, string>): IncomingContact | null {
  const emails = [...new Set((p.emailAddresses ?? []).map((e) => normaliseEmail(e.value)).filter((x): x is string => Boolean(x)))];
  const phones = [...new Set((p.phoneNumbers ?? []).map((ph) => normalisePhone(ph.canonicalForm ?? ph.value, region)).filter((x): x is string => Boolean(x)))];
  const display = p.names?.[0]?.displayName?.trim() ?? "";
  const org = p.organizations?.[0];
  const name = display || org?.name || emails[0] || phones[0] || "";
  if (!name) return null;
  const b = p.birthdays?.find((x) => x.date?.month && x.date?.day)?.date;
  const groups = (p.memberships ?? []).map((m) => m.contactGroupMembership?.contactGroupResourceName).filter((x): x is string => Boolean(x));
  return {
    externalId: `google:${p.resourceName}`,
    name,
    hasName: Boolean(display || org?.name),
    emails,
    phones,
    company: org?.name?.trim() || null,
    position: org?.title?.trim() || null,
    city: p.addresses?.find((a) => a.city)?.city?.trim() || null,
    birthday: b ? `${String(b.month).padStart(2, "0")}-${String(b.day).padStart(2, "0")}` : null,
    socials: urlsToSocials((p.urls ?? []).map((u) => u.value ?? "")),
    labels: groups.map((g) => groupNames.get(g)).filter((x): x is string => Boolean(x)),
    starred: groups.includes("contactGroups/starred"),
  };
}

/** All contacts (or only changes since `syncToken`). Throws SyncTokenExpired if Google wants a full resync. */
export async function fetchGoogleContacts(f: Fetch, accessToken: string, opts: { syncToken?: string | null; region: string; onPage?: (n: number) => void }) {
  const groups = await getJson<{ contactGroups?: { resourceName: string; name?: string; groupType?: string }[] }>(f, url.people("contactGroups?pageSize=200"), accessToken);
  const groupNames = new Map((groups.contactGroups ?? []).filter((g) => g.groupType === "USER_CONTACT_GROUP" && g.name).map((g) => [g.resourceName, g.name!]));
  const contacts: IncomingContact[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | null = null;
  do {
    const q = new URLSearchParams({
      personFields: "names,emailAddresses,phoneNumbers,organizations,addresses,birthdays,urls,memberships,metadata",
      pageSize: "1000",
      requestSyncToken: "true",
      ...(pageToken ? { pageToken } : {}),
      ...(opts.syncToken ? { syncToken: opts.syncToken } : {}),
    });
    const page = await getJson<{ connections?: GPerson[]; nextPageToken?: string; nextSyncToken?: string }>(f, url.people(`people/me/connections?${q}`), accessToken);
    for (const p of page.connections ?? []) {
      if (p.metadata?.deleted) continue; // We never delete people because Google did.
      const c = mapGooglePerson(p, opts.region, groupNames);
      if (c) contacts.push(c);
    }
    opts.onPage?.(contacts.length);
    pageToken = page.nextPageToken;
    nextSyncToken = page.nextSyncToken ?? nextSyncToken;
  } while (pageToken);
  return { contacts, nextSyncToken };
}

/* ---------------- calendar ---------------- */

type GTime = { date?: string; dateTime?: string; timeZone?: string };
type GEvent = {
  id: string;
  iCalUID?: string;
  status?: string;
  summary?: string;
  location?: string;
  description?: string;
  start?: GTime;
  end?: GTime;
  recurrence?: string[];
  recurringEventId?: string;
  attendees?: { email?: string; displayName?: string; responseStatus?: string; resource?: boolean; organizer?: boolean; self?: boolean }[];
  organizer?: { email?: string; displayName?: string; self?: boolean };
};

function wallClock(t: GTime | undefined, fallbackTz: string): { date: string; time: string | null; tz: string } | null {
  if (!t) return null;
  if (t.date) return { date: t.date, time: null, tz: fallbackTz };
  if (!t.dateTime) return null;
  const tz = t.timeZone && isValidTimeZone(t.timeZone) ? t.timeZone : fallbackTz;
  const local = instantInZone(new Date(t.dateTime), tz);
  return { date: local.date, time: local.time, tz };
}

const STATUS: Record<string, string> = { accepted: "ACCEPTED", declined: "DECLINED", tentative: "TENTATIVE", needsAction: "NEEDS-ACTION" };

export function mapGoogleEvent(e: GEvent, calendarTz: string): IcsEvent | null {
  const start = wallClock(e.start, calendarTz);
  if (!start) return null;
  const end = wallClock(e.end, start.tz);
  const attendees: IcsAttendee[] = (e.attendees ?? []).map((a) => ({
    name: a.displayName ?? "",
    email: normaliseEmail(a.email) ?? "",
    role: a.organizer ? "ORGANIZER" : "ATTENDEE",
    status: STATUS[a.responseStatus ?? ""] ?? "",
    resource: Boolean(a.resource),
  }));
  if (e.organizer?.email && !attendees.some((a) => a.email === normaliseEmail(e.organizer?.email))) {
    attendees.push({ name: e.organizer.displayName ?? "", email: normaliseEmail(e.organizer.email) ?? "", role: "ORGANIZER", status: "", resource: false });
  }
  return {
    uid: e.iCalUID ?? e.id,
    summary: e.summary ?? "",
    location: e.location ?? "",
    description: (e.description ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400),
    start,
    end: end ? { date: end.date, time: end.time } : null,
    allDay: start.time === null,
    rrule: e.recurrence?.find((r) => r.startsWith("RRULE:"))?.slice(6) ?? null,
    status: (e.status ?? "").toUpperCase(),
    isException: Boolean(e.recurringEventId),
    attendees,
  };
}

/**
 * Events from the primary calendar and any other calendars the user shows in Google Calendar.
 * First sync reads 6 months back and 3 months ahead; later syncs use per-calendar sync tokens.
 */
export async function fetchGoogleEvents(
  f: Fetch,
  accessToken: string,
  opts: { timeMin: string; timeMax: string; syncTokens: Record<string, string>; defaultTz: string },
) {
  const list = await getJson<{ items?: { id: string; primary?: boolean; selected?: boolean; accessRole?: string; timeZone?: string; summary?: string }[] }>(
    f,
    url.calendar("users/me/calendarList?minAccessRole=reader"),
    accessToken,
  );
  const calendars = (list.items ?? []).filter((c) => c.primary || (c.selected && (c.accessRole === "owner" || c.accessRole === "writer")) && !/#holiday@|#contacts@|#weeknum@/.test(c.id));
  const events: IcsEvent[] = [];
  const nextTokens: Record<string, string> = {};
  for (const cal of calendars) {
    let pageToken: string | undefined;
    let token: string | undefined = opts.syncTokens[cal.id];
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        do {
          const q = new URLSearchParams({
            maxResults: "2500",
            singleEvents: "false",
            // With a sync token Google always includes deletions and rejects showDeleted=false (400).
            ...(token ? { syncToken: token } : { timeMin: opts.timeMin, timeMax: opts.timeMax, showDeleted: "false" }),
            ...(pageToken ? { pageToken } : {}),
          });
          const page = await getJson<{ items?: GEvent[]; nextPageToken?: string; nextSyncToken?: string }>(f, url.calendar(`calendars/${encodeURIComponent(cal.id)}/events?${q}`), accessToken);
          for (const e of page.items ?? []) {
            const m = mapGoogleEvent(e, cal.timeZone ?? opts.defaultTz);
            if (m) events.push(m);
          }
          pageToken = page.nextPageToken;
          if (page.nextSyncToken) nextTokens[cal.id] = page.nextSyncToken;
        } while (pageToken);
        break;
      } catch (e) {
        if (e instanceof SyncTokenExpired && token) {
          token = undefined; // Google wants a full read for this calendar.
          pageToken = undefined;
          continue;
        }
        // One calendar we can't read (shared as free/busy only, or removed) shouldn't stop the rest.
        if (e instanceof ProviderError && (e.status === 403 || e.status === 404) && !cal.primary) {
          console.warn(`google sync: skipped calendar (${e.status})`);
          break;
        }
        throw e;
      }
    }
  }
  return { events, nextTokens, calendars: calendars.map((c) => c.summary ?? c.id) };
}
