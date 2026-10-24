import { describe, expect, it } from "vitest";
import { parseIcs, parseIcsDate } from "./ics";

const google = `BEGIN:VCALENDAR
PRODID:-//Google Inc//Google Calendar 70.9054//EN
X-WR-CALNAME:ada@example.com
X-WR-TIMEZONE:Africa/Lagos
BEGIN:VTIMEZONE
TZID:Africa/Lagos
BEGIN:STANDARD
TZOFFSETFROM:+0100
DTSTART:19700101T000000
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
DTSTART;TZID=Africa/Lagos:20261015T093000
DTEND;TZID=Africa/Lagos:20261015T103000
RRULE:FREQ=WEEKLY;BYDAY=TH
UID:abc123@google.com
ORGANIZER;CN=Ada Okafor:mailto:ada@example.com
ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN=Tunde
  Bakare:mailto:Tunde@Meridian.example
ATTENDEE;CUTYPE=RESOURCE;CN=Board room:mailto:c_123@resource.calendar.google.com
ATTENDEE;PARTSTAT=DECLINED;CN=ada@example.com:mailto:ada@example.com
SUMMARY:Weekly sync\\, product
DESCRIPTION:Agenda:\\nRoadmap-::~:~::~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~::-
LOCATION:Meridian HQ\\, Victoria Island
STATUS:CONFIRMED
BEGIN:VALARM
ACTION:DISPLAY
DESCRIPTION:This is an alarm
END:VALARM
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20261101
DTEND;VALUE=DATE:20261102
UID:allday@google.com
SUMMARY:Lagos Startup Week
END:VEVENT
BEGIN:VEVENT
DTSTART:20261020T190000Z
UID:abc123@google.com
RECURRENCE-ID;TZID=Africa/Lagos:20261022T093000
SUMMARY:Moved sync
END:VEVENT
BEGIN:VEVENT
DTSTART;TZID=W. Central Africa Standard Time:20261025T180000
UID:outlook-1
STATUS:CANCELLED
SUMMARY:Cancelled dinner
END:VEVENT
END:VCALENDAR`;

describe("ics", () => {
  const cal = parseIcs(google);

  it("reads the calendar name and zone", () => {
    expect(cal.name).toBe("ada@example.com");
    expect(cal.tz).toBe("Africa/Lagos");
    expect(cal.events).toHaveLength(4);
  });

  it("keeps wall-clock times in the event's own zone", () => {
    const e = cal.events[0];
    expect(e.start).toEqual({ date: "2026-10-15", time: "09:30", tz: "Africa/Lagos" });
    expect(e.end).toEqual({ date: "2026-10-15", time: "10:30" });
    expect(e.rrule).toBe("FREQ=WEEKLY;BYDAY=TH");
    expect(cal.events[2].start).toEqual({ date: "2026-10-20", time: "19:00", tz: "UTC" });
  });

  it("unescapes and unfolds text, and skips alarms", () => {
    const e = cal.events[0];
    expect(e.summary).toBe("Weekly sync, product");
    expect(e.location).toBe("Meridian HQ, Victoria Island");
    expect(e.description).toBe("Agenda: Roadmap");
  });

  it("reads attendees, organisers and meeting rooms", () => {
    expect(cal.events[0].attendees).toEqual([
      { name: "Ada Okafor", email: "ada@example.com", role: "ORGANIZER", status: "", resource: false },
      { name: "Tunde Bakare", email: "tunde@meridian.example", role: "ATTENDEE", status: "ACCEPTED", resource: false },
      { name: "Board room", email: "c_123@resource.calendar.google.com", role: "ATTENDEE", status: "", resource: true },
      { name: "", email: "ada@example.com", role: "ATTENDEE", status: "DECLINED", resource: false },
    ]);
  });

  it("marks all-day events, exceptions and cancellations, and maps Windows zones", () => {
    expect(cal.events[1]).toMatchObject({ allDay: true, start: { date: "2026-11-01", time: null } });
    expect(cal.events[2].isException).toBe(true);
    expect(cal.events[3]).toMatchObject({ status: "CANCELLED", start: { tz: "Africa/Lagos" } });
  });

  it("falls back to UTC for unknown zones", () => {
    expect(parseIcsDate("20261024T100000", "Mars/Base", null)).toEqual({ date: "2026-10-24", time: "10:00", tz: "UTC" });
    expect(parseIcsDate("garbage", undefined, null)).toBeNull();
  });
});
