import "server-only";
import type { IncomingContact } from "@/domain/dedupe";
import { normaliseEmail, normalisePhone } from "@/domain/normalise";
import { isValidTimeZone } from "@/domain/zoned";
import type { IcsAttendee, IcsEvent } from "@/importers/ics";
import { urlsToSocials } from "./google";
import { getJson, postForm, providerUrl, ReauthRequired, type Fetch } from "./http";

/** Outlook / Microsoft 365, read-only, via Microsoft Graph. */
export const MICROSOFT_SCOPES = ["openid", "email", "offline_access", "User.Read", "Contacts.Read", "Calendars.Read"];

const tenant = () => process.env.MICROSOFT_TENANT || "common";
const url = {
  auth: () => providerUrl("microsoft", `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/authorize`),
  token: () => providerUrl("microsoft", `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/token`),
  graph: (path: string) => providerUrl("microsoft", `https://graph.microsoft.com/v1.0/${path}`),
};

export type MicrosoftTokens = { access_token: string; refresh_token?: string; expires_at: number; scope: string };
type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string };

export function microsoftAuthUrl(opts: { clientId: string; redirectUri: string; state: string }) {
  const q = new URLSearchParams({
    client_id: opts.clientId,
    response_type: "code",
    redirect_uri: opts.redirectUri,
    response_mode: "query",
    scope: MICROSOFT_SCOPES.join(" "),
    state: opts.state,
    prompt: "select_account",
  });
  return `${url.auth()}?${q}`;
}

export async function exchangeMicrosoftCode(f: Fetch, opts: { clientId: string; clientSecret: string; code: string; redirectUri: string }): Promise<MicrosoftTokens> {
  const { status, body } = await postForm<TokenResponse>(f, url.token(), {
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    code: opts.code,
    redirect_uri: opts.redirectUri,
    grant_type: "authorization_code",
    scope: MICROSOFT_SCOPES.join(" "),
  });
  if (status !== 200 || !body.access_token) throw new Error(`Microsoft sign-in failed (${body.error ?? status}).`);
  return { access_token: body.access_token, refresh_token: body.refresh_token, expires_at: Date.now() + (body.expires_in ?? 3600) * 1000, scope: body.scope ?? "" };
}

/** Microsoft rotates refresh tokens: the new one must be saved. */
export async function microsoftAccessToken(f: Fetch, tokens: MicrosoftTokens, opts: { clientId: string; clientSecret: string }) {
  if (tokens.expires_at > Date.now() + 60_000) return { tokens, refreshed: false };
  if (!tokens.refresh_token) throw new ReauthRequired("Microsoft");
  const { status, body } = await postForm<TokenResponse>(f, url.token(), {
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    grant_type: "refresh_token",
    refresh_token: tokens.refresh_token,
    scope: MICROSOFT_SCOPES.join(" "),
  });
  if (status !== 200 || !body.access_token) throw new ReauthRequired("Microsoft");
  return {
    tokens: { access_token: body.access_token, refresh_token: body.refresh_token ?? tokens.refresh_token, expires_at: Date.now() + (body.expires_in ?? 3600) * 1000, scope: body.scope ?? tokens.scope },
    refreshed: true,
  };
}

export async function microsoftAccountEmail(f: Fetch, accessToken: string) {
  const me = await getJson<{ mail?: string; userPrincipalName?: string }>(f, url.graph("me?$select=mail,userPrincipalName"), accessToken);
  return normaliseEmail(me.mail ?? me.userPrincipalName) ?? "";
}

/* ---------------- contacts ---------------- */

type MsContact = {
  id: string;
  "@removed"?: unknown;
  displayName?: string;
  emailAddresses?: { address?: string }[];
  mobilePhone?: string;
  businessPhones?: string[];
  homePhones?: string[];
  companyName?: string;
  jobTitle?: string;
  businessAddress?: { city?: string };
  homeAddress?: { city?: string };
  birthday?: string;
  businessHomePage?: string;
  categories?: string[];
};

export function mapMicrosoftContact(c: MsContact, region: string): IncomingContact | null {
  const emails = [...new Set((c.emailAddresses ?? []).map((e) => normaliseEmail(e.address)).filter((x): x is string => Boolean(x)))];
  const phones = [...new Set([c.mobilePhone, ...(c.businessPhones ?? []), ...(c.homePhones ?? [])].map((p) => normalisePhone(p, region)).filter((x): x is string => Boolean(x)))];
  const display = c.displayName?.trim() ?? "";
  const name = display || c.companyName || emails[0] || phones[0] || "";
  if (!name) return null;
  const b = c.birthday ? /^\d{4}-(\d{2})-(\d{2})/.exec(c.birthday) : null;
  return {
    externalId: `microsoft:${c.id}`,
    name,
    hasName: Boolean(display || c.companyName),
    emails,
    phones,
    company: c.companyName?.trim() || null,
    position: c.jobTitle?.trim() || null,
    city: (c.businessAddress?.city || c.homeAddress?.city)?.trim() || null,
    birthday: b ? `${b[1]}-${b[2]}` : null,
    socials: urlsToSocials(c.businessHomePage ? [c.businessHomePage] : []),
    labels: c.categories ?? [],
    starred: false,
  };
}

/** Contacts via delta: the first call returns everything, later calls only changes. */
export async function fetchMicrosoftContacts(f: Fetch, accessToken: string, opts: { deltaLink?: string | null; region: string }) {
  let next: string | undefined = opts.deltaLink || url.graph("me/contacts/delta?$select=displayName,emailAddresses,mobilePhone,businessPhones,homePhones,companyName,jobTitle,businessAddress,homeAddress,birthday,businessHomePage,categories");
  const contacts: IncomingContact[] = [];
  let deltaLink: string | null = null;
  while (next) {
    const page: { value?: MsContact[]; "@odata.nextLink"?: string; "@odata.deltaLink"?: string } = await getJson(f, next, accessToken, { Prefer: "odata.maxpagesize=500" });
    for (const c of page.value ?? []) {
      if (c["@removed"]) continue;
      const m = mapMicrosoftContact(c, opts.region);
      if (m) contacts.push(m);
    }
    next = page["@odata.nextLink"];
    deltaLink = page["@odata.deltaLink"] ?? deltaLink;
  }
  return { contacts, deltaLink };
}

/* ---------------- calendar ---------------- */

type MsTime = { dateTime: string; timeZone: string };
type MsEvent = {
  id: string;
  iCalUId?: string;
  subject?: string;
  isCancelled?: boolean;
  isAllDay?: boolean;
  type?: string; // singleInstance | seriesMaster | occurrence | exception
  start?: MsTime;
  end?: MsTime;
  location?: { displayName?: string };
  bodyPreview?: string;
  recurrence?: {
    pattern?: { type?: string; interval?: number; daysOfWeek?: string[]; dayOfMonth?: number; index?: string; month?: number };
    range?: { type?: string; endDate?: string; numberOfOccurrences?: number };
  };
  attendees?: { emailAddress?: { address?: string; name?: string }; status?: { response?: string }; type?: string }[];
  organizer?: { emailAddress?: { address?: string; name?: string } };
  responseStatus?: { response?: string };
};

const DAY: Record<string, string> = { sunday: "SU", monday: "MO", tuesday: "TU", wednesday: "WE", thursday: "TH", friday: "FR", saturday: "SA" };
const INDEX: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, last: -1 };

/** Outlook's recurrence object as an RRULE, so it goes through the same engine as Google and .ics. */
export function msRecurrenceToRRule(r: MsEvent["recurrence"]): string | null {
  const p = r?.pattern;
  if (!p?.type) return null;
  const parts: string[] = [];
  const interval = p.interval && p.interval > 1 ? [`INTERVAL=${p.interval}`] : [];
  switch (p.type) {
    case "daily":
      parts.push("FREQ=DAILY", ...interval);
      break;
    case "weekly":
      parts.push("FREQ=WEEKLY", ...interval);
      if (p.daysOfWeek?.length) parts.push(`BYDAY=${p.daysOfWeek.map((d) => DAY[d.toLowerCase()]).join(",")}`);
      break;
    case "absoluteMonthly":
      parts.push("FREQ=MONTHLY", ...interval);
      break;
    case "relativeMonthly":
      parts.push("FREQ=MONTHLY", ...interval);
      if (p.daysOfWeek?.length === 1) parts.push(`BYDAY=${INDEX[p.index ?? "first"] ?? 1}${DAY[p.daysOfWeek[0].toLowerCase()]}`);
      break;
    case "absoluteYearly":
      parts.push("FREQ=YEARLY", ...interval);
      break;
    default:
      return null;
  }
  if (r?.range?.type === "endDate" && r.range.endDate) parts.push(`UNTIL=${r.range.endDate.replace(/-/g, "")}`);
  if (r?.range?.type === "numbered" && r.range.numberOfOccurrences) parts.push(`COUNT=${r.range.numberOfOccurrences}`);
  return parts.join(";");
}

const RESPONSE: Record<string, string> = { accepted: "ACCEPTED", declined: "DECLINED", tentativelyAccepted: "TENTATIVE", organizer: "ACCEPTED", none: "", notResponded: "" };

export function mapMicrosoftEvent(e: MsEvent, fallbackTz: string): IcsEvent | null {
  if (!e.start?.dateTime) return null;
  const tz = isValidTimeZone(e.start.timeZone) ? e.start.timeZone : fallbackTz;
  const [date, time] = e.start.dateTime.split("T");
  const attendees: IcsAttendee[] = (e.attendees ?? []).map((a) => ({
    name: a.emailAddress?.name ?? "",
    email: normaliseEmail(a.emailAddress?.address) ?? "",
    role: "ATTENDEE",
    status: RESPONSE[a.status?.response ?? ""] ?? "",
    resource: a.type === "resource",
  }));
  const org = normaliseEmail(e.organizer?.emailAddress?.address);
  if (org) attendees.push({ name: e.organizer?.emailAddress?.name ?? "", email: org, role: "ORGANIZER", status: "", resource: false });
  return {
    uid: e.iCalUId ?? e.id,
    summary: e.subject ?? "",
    location: e.location?.displayName ?? "",
    description: (e.bodyPreview ?? "").slice(0, 400),
    start: { date, time: e.isAllDay ? null : time.slice(0, 5), tz },
    end: e.end?.dateTime ? { date: e.end.dateTime.split("T")[0], time: e.isAllDay ? null : e.end.dateTime.split("T")[1].slice(0, 5) } : null,
    allDay: Boolean(e.isAllDay),
    rrule: e.type === "seriesMaster" ? msRecurrenceToRRule(e.recurrence) : null,
    status: e.isCancelled ? "CANCELLED" : "CONFIRMED",
    isException: e.type === "exception" || e.type === "occurrence",
    attendees,
  };
}

/** Series masters and single events changed in the last 9 months, with times in the user's zone. */
export async function fetchMicrosoftEvents(f: Fetch, accessToken: string, opts: { since: string; defaultTz: string }) {
  let next: string | undefined = url.graph(
    `me/events?$filter=lastModifiedDateTime ge ${opts.since}T00:00:00Z&$top=200&$select=id,iCalUId,subject,isCancelled,isAllDay,type,start,end,location,bodyPreview,recurrence,attendees,organizer,responseStatus`,
  );
  const events: IcsEvent[] = [];
  while (next) {
    // Times come back in the user's zone rather than UTC, so weekly series stay put across DST.
    const page: { value?: MsEvent[]; "@odata.nextLink"?: string } = await getJson(f, next, accessToken, { Prefer: `outlook.timezone="${opts.defaultTz}"` });
    for (const e of page.value ?? []) {
      const m = mapMicrosoftEvent(e, opts.defaultTz);
      if (m) events.push(m);
    }
    next = page["@odata.nextLink"];
  }
  return { events };
}
