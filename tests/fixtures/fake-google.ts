/**
 * A stand-in for the Google endpoints Inroads uses (OAuth, userinfo, People, Calendar).
 * Used by database tests (as a fetch function) and by the e2e fake-services server (over HTTP).
 * The data is a small Lagos network, dated relative to `today`.
 */
export const FAKE_GOOGLE_EMAIL = "ada.google@example.test";

const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

export function fakeGoogleData(today: string) {
  const start = addDays(today, -21);
  return {
    groups: [
      { resourceName: "contactGroups/starred", groupType: "SYSTEM_CONTACT_GROUP", name: "starred" },
      { resourceName: "contactGroups/inv1", groupType: "USER_CONTACT_GROUP", name: "Investors" },
    ],
    connections: [
      {
        resourceName: "people/c1",
        names: [{ displayName: "Tunde Bakare" }],
        phoneNumbers: [{ value: "0803 123 4567" }],
        emailAddresses: [{ value: "tunde@meridian.example" }],
        organizations: [{ name: "Meridian Telecoms", title: "Head of Procurement" }],
      },
      {
        resourceName: "people/c2",
        names: [{ displayName: "Kemi Adebayo" }],
        emailAddresses: [{ value: "Kemi@Paystack.example" }],
        memberships: [{ contactGroupMembership: { contactGroupResourceName: "contactGroups/starred" } }, { contactGroupMembership: { contactGroupResourceName: "contactGroups/inv1" } }],
        birthdays: [{ date: { month: 3, day: 14 } }],
        urls: [{ value: "https://www.linkedin.com/in/kemi" }],
      },
      { resourceName: "people/c3", phoneNumbers: [{ value: "0812 345 6789" }] },
      { resourceName: "people/c4", names: [{ displayName: "Gone Person" }], metadata: { deleted: true } },
    ],
    calendars: [{ id: "primary", primary: true, accessRole: "owner", timeZone: "Africa/Lagos", summary: FAKE_GOOGLE_EMAIL }],
    events: [
      {
        id: "ev1",
        iCalUID: "pricing-sync@google.com",
        status: "confirmed",
        summary: "Pricing sync",
        start: { dateTime: `${start}T09:00:00+01:00`, timeZone: "Africa/Lagos" },
        end: { dateTime: `${start}T10:00:00+01:00`, timeZone: "Africa/Lagos" },
        recurrence: ["RRULE:FREQ=WEEKLY"],
        attendees: [
          { email: FAKE_GOOGLE_EMAIL, self: true, responseStatus: "accepted" },
          { email: "tunde@meridian.example", displayName: "Tunde Bakare", responseStatus: "accepted" },
          { email: "ifeoma@lumen.example", displayName: "Ifeoma Nwosu", responseStatus: "accepted" },
        ],
        organizer: { email: FAKE_GOOGLE_EMAIL, self: true },
      },
      {
        id: "ev2",
        iCalUID: "rehearsal@google.com",
        status: "confirmed",
        summary: "Pitch rehearsal",
        start: { dateTime: `${addDays(today, 3)}T15:00:00+01:00`, timeZone: "Africa/Lagos" },
        attendees: [
          { email: FAKE_GOOGLE_EMAIL, self: true, responseStatus: "accepted" },
          { email: "kemi@paystack.example", displayName: "Kemi Adebayo", responseStatus: "needsAction" },
        ],
      },
      { id: "ev3", status: "cancelled", summary: "Cancelled lunch", start: { dateTime: `${addDays(today, -5)}T13:00:00+01:00`, timeZone: "Africa/Lagos" } },
    ],
  };
}

type Reply = { status: number; json?: unknown; redirect?: string };

/**
 * Routes a request the way Google would. `path` is everything after the host, e.g.
 * "/v1/people/me/connections?...". `host` tells the services apart.
 */
export function handleFakeGoogle(method: string, host: string, path: string, body: URLSearchParams, today: string): Reply {
  const u = new URL(`https://${host}${path}`);
  const data = fakeGoogleData(today);
  if (host === "accounts.google.com" && u.pathname === "/o/oauth2/v2/auth") {
    const redirect = new URL(u.searchParams.get("redirect_uri")!);
    redirect.searchParams.set("code", "fake-code");
    redirect.searchParams.set("state", u.searchParams.get("state") ?? "");
    return { status: 302, redirect: redirect.toString() };
  }
  if (host === "oauth2.googleapis.com" && u.pathname === "/token") {
    if (body.get("grant_type") === "refresh_token" && body.get("refresh_token") === "revoked") return { status: 400, json: { error: "invalid_grant" } };
    return { status: 200, json: { access_token: "fake-access", refresh_token: "fake-refresh", expires_in: 3600, scope: "contacts.readonly calendar.events.readonly" } };
  }
  if (host === "oauth2.googleapis.com" && u.pathname === "/revoke") return { status: 200, json: {} };
  if (host === "openidconnect.googleapis.com") return { status: 200, json: { email: FAKE_GOOGLE_EMAIL } };
  if (host === "people.googleapis.com" && u.pathname === "/v1/contactGroups") return { status: 200, json: { contactGroups: data.groups } };
  if (host === "people.googleapis.com" && u.pathname === "/v1/people/me/connections") {
    if (u.searchParams.get("syncToken") === "expired") return { status: 410, json: {} };
    // A second sync with a token returns no changes.
    const items = u.searchParams.get("syncToken") ? [] : data.connections;
    return { status: 200, json: { connections: items, nextSyncToken: "people-sync-1" } };
  }
  if (host === "www.googleapis.com" && u.pathname === "/calendar/v3/users/me/calendarList") return { status: 200, json: { items: data.calendars } };
  if (host === "www.googleapis.com" && u.pathname.startsWith("/calendar/v3/calendars/")) {
    const items = u.searchParams.get("syncToken") ? [] : data.events;
    return { status: 200, json: { items, nextSyncToken: "cal-sync-1" } };
  }
  return { status: 404, json: { error: "not_found", host, path } };
}

/** The same thing as a fetch function, for tests that call integrations directly. */
export function fakeGoogleFetch(today: string) {
  return async (input: string, init?: RequestInit): Promise<Response> => {
    const u = new URL(input);
    const body = new URLSearchParams(typeof init?.body === "string" ? init.body : "");
    const r = handleFakeGoogle(init?.method ?? "GET", u.host, u.pathname + u.search, body, today);
    if (r.redirect) return new Response(null, { status: r.status, headers: { location: r.redirect } });
    return new Response(JSON.stringify(r.json ?? {}), { status: r.status, headers: { "content-type": "application/json" } });
  };
}
