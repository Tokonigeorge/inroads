import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { addDays, addMonths, type IsoDate } from "@/domain/dates";
import * as t from "@/server/db/schema";
import type { Tx } from "@/server/db/with-user";

/**
 * The prototype's Lagos example network (6 people, 4 rooms), placed in the Work Space with
 * dates relative to today. Every row is flagged `example` (or hangs off one that is), so
 * removeExampleData() takes it all back out. Offered only in onboarding and Settings → Data.
 */
export async function loadExampleData(tx: Tx, userId: string, today: IsoDate): Promise<boolean> {
  const [existing] = await tx.select({ n: sql<number>`count(*)::int` }).from(t.people).where(eq(t.people.example, true));
  if (existing.n > 0) return false;

  const [work] = await tx.select().from(t.spaces).where(and(eq(t.spaces.kind, "work"), eq(t.spaces.name, "Work")));
  if (!work) throw new Error("Work Space missing");
  const d = (n: number) => addDays(today, n);
  const [profile] = await tx.select({ tz: t.profiles.timezone }).from(t.profiles);
  const tz = profile?.tz ?? "Africa/Lagos";

  let [investors] = await tx.select().from(t.circles).where(and(eq(t.circles.spaceId, work.id), eq(t.circles.name, "Investors")));
  if (!investors) {
    [investors] = await tx.insert(t.circles).values({ userId, spaceId: work.id, name: "Investors", defaultCadenceDays: 30 }).returning();
  }

  const [raise, clients] = await tx
    .insert(t.goals)
    .values([
      { userId, spaceId: work.id, text: "Raise a $500k pre-seed round", type: "capital", priority: 1, weeklyTarget: 3, example: true },
      { userId, spaceId: work.id, text: "Win two enterprise clients this quarter", type: "clients", priority: 2, weeklyTarget: 2, example: true },
    ])
    .returning();

  type P = {
    name: string;
    emails?: string[];
    company?: string;
    position?: string;
    birthday?: string;
    socials?: Record<string, string>;
    whereMet?: string;
    metOn?: IsoDate;
    interests?: string[];
    notes?: string;
    opportunities?: string;
    tags?: string[];
    starred?: boolean;
    circle?: boolean;
  };
  const defs: Record<string, P> = {
    adaeze: {
      name: "Adaeze Okafor", emails: ["adaeze@kestrel.example"], company: "Kestrel Ventures", position: "Partner",
      whereMet: "Founders Breakfast, Ikoyi", metOn: d(-140), interests: ["Climate tech", "Distance running"],
      notes: "Leads seed rounds in B2B software. Wants short monthly updates before any term-sheet conversation.",
      opportunities: "Could lead or anchor a seed round; knows two co-investors.", starred: true, tags: ["investor"], circle: true,
    },
    tunde: {
      name: "Tunde Bakare", emails: ["tunde.b@meridiantel.example"], company: "Meridian Telecoms", position: "Head of Procurement",
      whereMet: "Client dinner, Victoria Island", metOn: d(-60), interests: ["Arsenal", "Jazz"],
      notes: "Runs vendor selection for enterprise software. Budget cycle closes in December.",
      opportunities: "Enterprise contract for the analytics product.", tags: ["client"],
    },
    zainab: {
      name: "Zainab Bello", emails: ["zainab@hey.example"], company: "Independent", position: "Senior Backend Engineer",
      whereMet: "GitHub meetup, Yaba", metOn: d(-20), interests: ["Rust", "Chess"],
      notes: "Open to a lead role if the problem is hard enough.", tags: ["talent"], socials: { github: "zainab-codes" },
    },
    kwame: {
      name: "Kwame Mensah", emails: ["kwame@harmattan.example"], company: "Harmattan Capital", position: "Director, Partnerships",
      whereMet: "Founders Breakfast, Ikoyi", metOn: d(-200), interests: ["Pan-African trade", "Photography"],
      notes: "Based in Accra. Good bridge into Ghana.", opportunities: "Intros for a Ghana expansion.", tags: ["investor"], circle: true,
    },
    ifeoma: {
      name: "Ifeoma Nwosu", emails: ["ifeoma@lumenhealth.example"], company: "Lumen Health", position: "Founder & CEO",
      whereMet: "Fintech Roundtable", metOn: d(-80), interests: ["Health access", "Afrobeats"], birthday: d(3).slice(5),
      notes: "Peer founder. Generous with intros to angels.", tags: ["founder"],
    },
    david: {
      name: "David Adeyemi", emails: ["david@ledgerline.example"], company: "Ledgerline", position: "Product Lead",
      notes: "Met briefly, exchanged numbers.",
    },
  };

  const ids: Record<string, string> = {};
  for (const [key, p] of Object.entries(defs)) {
    const [person] = await tx
      .insert(t.people)
      .values({
        userId, name: p.name, emails: p.emails ?? [], company: p.company, position: p.position, birthday: p.birthday,
        socials: p.socials ?? {}, source: "example", example: true,
      })
      .returning({ id: t.people.id });
    ids[key] = person.id;
    await tx.insert(t.personSpaces).values({
      userId, personId: person.id, spaceId: work.id, whereMet: p.whereMet, metOn: p.metOn, interests: p.interests ?? [],
      notes: p.notes, opportunities: p.opportunities, tags: p.tags ?? [], starred: p.starred ?? false,
      circleId: p.circle ? investors.id : null, cadenceAnchorOn: p.metOn ?? today,
    });
  }

  await tx.insert(t.personLinks).values({ userId, fromPersonId: ids.kwame, toPersonId: ids.adaeze, kind: "knows", spaceId: work.id, note: "Both at the Founders Breakfast" });

  // Rooms
  const breakfastStart = d(-140);
  const [meridian, breakfast, roundtable] = await tx
    .insert(t.events)
    .values([
      { userId, spaceId: work.id, title: "Pricing review with Meridian", kind: "meeting", startsOn: today, startTime: "17:30", tz, location: "Meridian HQ, Victoria Island", goalId: clients.id, example: true },
      { userId, spaceId: work.id, title: "Founders Breakfast", kind: "meetup", startsOn: breakfastStart, startTime: "08:00", tz, location: "Ikoyi", rrule: "FREQ=MONTHLY", goalId: raise.id, example: true },
      { userId, spaceId: work.id, title: "Fintech Roundtable", kind: "dinner", startsOn: d(-80), startTime: "18:00", tz, location: "Lekki", rrule: "FREQ=MONTHLY;INTERVAL=3", example: true },
      { userId, spaceId: work.id, title: "West Africa Tech Summit", kind: "conference", startsOn: d(9), startTime: "09:00", tz, location: "Eko Convention Centre", example: true },
    ])
    .returning();
  await tx.insert(t.eventPeople).values([
    { userId, eventId: meridian.id, personId: ids.tunde },
    { userId, eventId: breakfast.id, personId: ids.adaeze },
    { userId, eventId: breakfast.id, personId: ids.kwame },
    { userId, eventId: roundtable.id, personId: ids.ifeoma },
  ]);
  // Went to two out of every three breakfasts so far.
  const sessions: IsoDate[] = [];
  for (let k = 0; addMonths(breakfastStart, k) < today; k++) sessions.push(addMonths(breakfastStart, k));
  if (sessions.length) {
    await tx.insert(t.eventAttendance).values(sessions.map((date, i) => ({ userId, eventId: breakfast.id, occurrenceOn: date, attended: i % 3 !== 2 })));
  }

  // Touches and promises
  const touch = (who: string, n: number, type: (typeof t.touchType.enumValues)[number], summary: string, eventId?: string) => ({
    userId, personId: ids[who], spaceId: work.id, occurredOn: d(n), type, summary, eventId,
  });
  await tx.insert(t.interactions).values([
    touch("adaeze", -52, "coffee", "Coffee in Ikoyi: asked for monthly metrics updates"),
    touch("tunde", -9, "call", "Walked through pricing tiers; he wants a volume discount"),
    touch("tunde", -30, "meeting", "Discovery session with his team"),
    touch("zainab", -20, "event", "Talked distributed systems after her talk"),
    touch("kwame", -110, "message", "Shared his deck on cross-border payments"),
    touch("ifeoma", -25, "coffee", "Swapped notes on hiring engineers"),
  ]);
  await tx.insert(t.commitments).values([
    { userId, personId: ids.tunde, spaceId: work.id, text: "Send the revised pricing deck", owner: "me", dueOn: d(1) },
    { userId, personId: ids.ifeoma, spaceId: work.id, text: "Intro to two angels in health", owner: "them" },
  ]);

  // Pipeline
  await tx.insert(t.goalLinks).values([
    { userId, goalId: raise.id, personId: ids.adaeze, stage: "in_conversation" },
    { userId, goalId: raise.id, personId: ids.kwame, stage: "warm_path" },
    { userId, goalId: clients.id, personId: ids.tunde, stage: "in_conversation" },
  ]);
  await tx.insert(t.scores).values({ userId, personId: ids.adaeze, goalId: raise.id, value: 86, why: "Invests at your stage and already knows your story.", model: "example" });

  await tx.insert(t.dossiers).values({
    userId, personId: ids.adaeze, spaceId: work.id, version: 1, mode: "example", model: "example", promptVersion: "example", confidence: "example",
    payload: {
      summary: "Early-stage investor focused on B2B software and climate in West Africa. Prefers founders who share short, regular updates.",
      career: ["Partner, Kestrel Ventures", "Previously corporate development at a pan-African bank"],
      company: "Kestrel Ventures writes first cheques in B2B software across Nigeria and Ghana.",
      sharedInterests: ["Running"],
      talkingPoints: [
        "Lead with one line of this month's numbers before any ask",
        "Ask which climate-fintech models she thinks are underpriced",
        "Compare notes on the Lagos half marathon",
      ],
      opportunities: ["Lead or anchor the seed round", "Intro to two co-investors she trusts"],
    },
  });
  return true;
}

/** Removes everything loadExampleData() created. Cascades take touches, promises and links with them. */
export async function removeExampleData(tx: Tx) {
  await tx.delete(t.events).where(eq(t.events.example, true));
  await tx.delete(t.people).where(eq(t.people.example, true));
  await tx.delete(t.goals).where(eq(t.goals.example, true));
}
