/**
 * iCalendar (.ics) parser for Google, Outlook and Apple exports and subscription feeds.
 * Ported from the prototype's parseICSFile()/icsDate(). Unlike the prototype it doesn't
 * convert times to the viewer's zone: each event keeps its wall-clock time and its own zone,
 * which is how rooms are stored.
 */
import { isValidTimeZone } from "@/domain/zoned";

export type IcsAttendee = { name: string; email: string; role: "ATTENDEE" | "ORGANIZER"; status: string; resource: boolean };
export type IcsEvent = {
  uid: string;
  summary: string;
  location: string;
  description: string;
  start: { date: string; time: string | null; tz: string };
  end: { date: string; time: string | null } | null;
  allDay: boolean;
  rrule: string | null;
  status: string;
  isException: boolean;
  attendees: IcsAttendee[];
  /** Which calendar (file) it came from, when read from uploaded files. */
  calendar?: string;
};
export type IcsCalendar = { name: string; tz: string | null; events: IcsEvent[] };

const unescapeText = (v: string) =>
  v
    .replace(/\\n/gi, "\n")
    .replace(/\\([,;\\])/g, "$1")
    .trim();

/** Outlook writes Windows zone names; map the common ones to IANA. */
const WINDOWS_ZONES: Record<string, string> = {
  "W. Central Africa Standard Time": "Africa/Lagos",
  "GMT Standard Time": "Europe/London",
  "Greenwich Standard Time": "Africa/Abidjan",
  "South Africa Standard Time": "Africa/Johannesburg",
  "E. Africa Standard Time": "Africa/Nairobi",
  "Eastern Standard Time": "America/New_York",
  "Pacific Standard Time": "America/Los_Angeles",
  "Central Europe Standard Time": "Europe/Budapest",
  "W. Europe Standard Time": "Europe/Berlin",
  "Romance Standard Time": "Europe/Paris",
  "Arabian Standard Time": "Asia/Dubai",
  UTC: "UTC",
};

function zone(tzid: string | undefined, fallback: string | null): string {
  const t = (tzid ?? "").replace(/^"|"$/g, "").trim();
  if (t && isValidTimeZone(t)) return t;
  if (t && WINDOWS_ZONES[t]) return WINDOWS_ZONES[t];
  return fallback && isValidTimeZone(fallback) ? fallback : "UTC";
}

/** 20261024 / 20261024T183000 / 20261024T173000Z → local date, time and zone. */
export function parseIcsDate(value: string, tzid: string | undefined, calTz: string | null): { date: string; time: string | null; tz: string } | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/.exec(value.trim());
  if (!m) return null;
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  if (!m[4]) return { date, time: null, tz: zone(undefined, calTz) };
  return { date, time: `${m[4]}:${m[5]}`, tz: m[7] ? "UTC" : zone(tzid, calTz) };
}

export function parseIcs(text: string): IcsCalendar {
  const lines = String(text)
    .replace(/\r\n?/g, "\n")
    .replace(/\n[ \t]/g, "") // unfold
    .split("\n")
    .map((l) => l.trim());
  const events: IcsEvent[] = [];
  let name = "";
  let calTz: string | null = null;
  let cur: (Partial<IcsEvent> & { attendees: IcsAttendee[]; rawStart?: [string, string | undefined]; rawEnd?: [string, string | undefined] }) | null = null;
  let nested = 0; // VALARM, VTIMEZONE etc. inside or outside events

  for (const l of lines) {
    if (l === "BEGIN:VEVENT") {
      cur = { attendees: [] };
      continue;
    }
    if (l === "END:VEVENT") {
      if (cur?.rawStart) {
        const start = parseIcsDate(cur.rawStart[0], cur.rawStart[1], calTz);
        if (start) {
          const end = cur.rawEnd ? parseIcsDate(cur.rawEnd[0], cur.rawEnd[1], calTz) : null;
          events.push({
            uid: cur.uid ?? "",
            summary: cur.summary ?? "",
            location: cur.location ?? "",
            description: cur.description ?? "",
            start,
            end: end ? { date: end.date, time: end.time } : null,
            allDay: start.time === null,
            rrule: cur.rrule ?? null,
            status: cur.status ?? "",
            isException: cur.isException ?? false,
            attendees: cur.attendees,
          });
        }
      }
      cur = null;
      continue;
    }
    if (/^BEGIN:(VALARM|VTIMEZONE|STANDARD|DAYLIGHT)$/.test(l)) {
      nested++;
      continue;
    }
    if (/^END:(VALARM|VTIMEZONE|STANDARD|DAYLIGHT)$/.test(l)) {
      nested = Math.max(0, nested - 1);
      continue;
    }
    if (nested) continue;
    const i = l.indexOf(":");
    if (i < 0) continue;
    const head = l.slice(0, i);
    const val = l.slice(i + 1);
    const [rawName, ...params] = head.split(";");
    const N = rawName.toUpperCase();
    if (!cur) {
      if (N === "X-WR-CALNAME") name = unescapeText(val);
      else if (N === "X-WR-TIMEZONE") calTz = val.trim();
      continue;
    }
    const P = Object.fromEntries(
      params.map((p) => {
        const j = p.indexOf("=");
        return j < 0 ? [p.toUpperCase(), ""] : [p.slice(0, j).toUpperCase(), p.slice(j + 1).replace(/^"|"$/g, "")];
      }),
    );
    switch (N) {
      case "SUMMARY":
        cur.summary = unescapeText(val);
        break;
      case "DTSTART":
        cur.rawStart = [val, P.TZID];
        break;
      case "DTEND":
        cur.rawEnd = [val, P.TZID];
        break;
      case "LOCATION":
        cur.location = unescapeText(val);
        break;
      case "DESCRIPTION":
        cur.description = unescapeText(val)
          .replace(/-::~[\s\S]*?::-/g, "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 400);
        break;
      case "UID":
        cur.uid = val.trim();
        break;
      case "RRULE":
        cur.rrule = val.trim();
        break;
      case "STATUS":
        cur.status = val.trim().toUpperCase();
        break;
      case "RECURRENCE-ID":
        cur.isException = true;
        break;
      case "ATTENDEE":
      case "ORGANIZER": {
        const email = ((/mailto:(.+)/i.exec(val) ?? [])[1] ?? "").trim().toLowerCase();
        const cn = String(P.CN ?? "").trim();
        if (email || cn) {
          cur.attendees.push({
            name: cn.includes("@") ? "" : cn,
            email,
            role: N,
            status: String(P.PARTSTAT ?? "").toUpperCase(),
            resource: /RESOURCE|ROOM/i.test(P.CUTYPE ?? "") || /resource\.calendar\.google\.com$/.test(email),
          });
        }
        break;
      }
    }
  }
  return { name, tz: calTz, events };
}
