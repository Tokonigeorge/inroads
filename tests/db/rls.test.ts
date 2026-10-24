import { and, eq, sql as dsql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultSpaceDefaults, spaceDefaultsSchema, type SpaceKind } from "@/contracts/spaces";
import * as t from "@/server/db/schema";
import type { Tx } from "@/server/db/with-user";
import { connect, createUser, errorCode } from "./helpers";

const { sql, db } = connect();

type Fixture = Awaited<ReturnType<typeof seedFor>>;
let alice: { id: string };
let bob: { id: string };
let a: Fixture;

async function spacesOf(tx: Tx) {
  const rows = await tx.select().from(t.spaces);
  const by = (k: SpaceKind) => rows.find((r) => r.kind === k)!;
  return { work: by("work"), personal: by("personal"), dating: by("dating") };
}

/** One row in every user-owned table, written the way the app will: as the user, under RLS. */
async function seedFor(userId: string) {
  return db.withUser(userId, async (tx) => {
    const s = await spacesOf(tx);
    const [circle] = await tx.insert(t.circles).values({ userId, spaceId: s.work.id, name: "Investors", defaultCadenceDays: 30 }).returning();
    const [goal] = await tx.insert(t.goals).values({ userId, spaceId: s.work.id, text: "Raise a pre-seed round", type: "capital" }).returning();
    const [person] = await tx.insert(t.people).values({ userId, name: "Adaeze Okafor", emails: ["adaeze@kestrel.example"], phones: ["+2348031234567"] }).returning();
    const [other] = await tx.insert(t.people).values({ userId, name: "Kwame Mensah" }).returning();
    const [membership] = await tx
      .insert(t.personSpaces)
      .values({ userId, personId: person.id, spaceId: s.work.id, circleId: circle.id, notes: "Wants monthly updates" })
      .returning();
    await tx.insert(t.personSpaces).values({ userId, personId: other.id, spaceId: s.work.id });
    const [link] = await tx.insert(t.personLinks).values({ userId, fromPersonId: person.id, toPersonId: other.id, kind: "introduced_by", spaceId: s.work.id }).returning();
    const [event] = await tx.insert(t.events).values({ userId, spaceId: s.work.id, title: "Founders Breakfast", startsOn: "2026-10-01", tz: "Africa/Lagos", goalId: goal.id }).returning();
    await tx.insert(t.eventPeople).values({ eventId: event.id, personId: person.id, userId });
    await tx.insert(t.eventAttendance).values({ eventId: event.id, userId, occurrenceOn: "2026-10-01", attended: true });
    const [interaction] = await tx
      .insert(t.interactions)
      .values({ userId, personId: person.id, spaceId: s.work.id, occurredOn: "2026-10-10", type: "coffee", summary: "Coffee in Ikoyi", eventId: event.id })
      .returning();
    const [commitment] = await tx
      .insert(t.commitments)
      .values({ userId, personId: person.id, spaceId: s.work.id, text: "Send the deck", owner: "me", interactionId: interaction.id })
      .returning();
    const [goalLink] = await tx.insert(t.goalLinks).values({ userId, goalId: goal.id, personId: person.id, stage: "identified" }).returning();
    const [dossier] = await tx
      .insert(t.dossiers)
      .values({ userId, personId: person.id, spaceId: s.work.id, version: 1, mode: "full", payload: {}, model: "test", promptVersion: "test" })
      .returning();
    const [score] = await tx.insert(t.scores).values({ userId, personId: person.id, goalId: goal.id, value: 80 }).returning();
    const [search] = await tx.insert(t.searches).values({ userId, spaceId: s.work.id, type: "event", query: "Founders Breakfast", result: {} }).returning();
    const [suggestion] = await tx.insert(t.suggestions).values({ userId, spaceId: s.work.id, kind: "person_field", payload: {}, origin: "dossier" }).returning();
    await tx.insert(t.nudgeStates).values({ userId, key: `cold:${person.id}`, expiresAt: new Date(Date.now() + 864e5) });
    const [brief] = await tx.insert(t.briefs).values({ userId, spaceId: s.work.id, kind: "daily", periodKey: "2026-10-23", markdown: "# Brief" }).returning();
    const [imp] = await tx.insert(t.imports).values({ userId, spaceId: s.work.id, type: "vcf", status: "review" }).returning();
    const [item] = await tx.insert(t.importItems).values({ importId: imp.id, userId, kind: "person", raw: {}, normalised: {}, matchPersonId: person.id }).returning();
    return { s, circle, goal, person, other, membership, link, event, interaction, commitment, goalLink, dossier, score, search, suggestion, brief, imp, item };
  });
}

beforeAll(async () => {
  alice = await createUser(sql, "Alice");
  bob = await createUser(sql, "Bob");
  a = await seedFor(alice.id);
  // System-written tables (service role / table owner bypasses RLS).
  await sql`insert into jobs (user_id, kind) values (${alice.id}, 'research')`;
  await sql`insert into ai_usage (user_id, feature, model) values (${alice.id}, 'draft', 'test')`;
  await sql`insert into exports (user_id, filename, size_bytes, data, expires_at) values (${alice.id}, 'x.zip', 1, '\\x00', now() + interval '1 day')`;
  await sql`insert into connections (user_id, provider, account_email, tokens_enc) values (${alice.id}, 'google', 'alice@example.test', '\\x00')`;
});

afterAll(async () => {
  await sql.end();
});

describe("catalog", () => {
  it("enables RLS with at least one policy on every public table", async () => {
    const rows = await sql<{ table: string; rls: boolean; policies: number }[]>`
      select c.relname as table, c.relrowsecurity as rls,
             (select count(*)::int from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'`;
    expect(rows.length).toBeGreaterThanOrEqual(25);
    for (const r of rows) {
      expect({ table: r.table, rls: r.rls }).toEqual({ table: r.table, rls: true });
      expect(r.policies, r.table).toBeGreaterThan(0);
    }
  });
});

describe("new account bootstrap", () => {
  it("creates a profile and the three built-in Spaces with valid defaults", async () => {
    await db.withUser(alice.id, async (tx) => {
      const [profile] = await tx.select().from(t.profiles);
      expect(profile.name).toBe("Alice");
      expect(profile.timezone).toBe("Africa/Lagos");
      const spaces = await tx.select().from(t.spaces);
      expect(spaces.map((s) => s.name).sort()).toEqual(["Dating", "Personal", "Work"]);
      for (const s of spaces) {
        const parsed = spaceDefaultsSchema.parse(s.defaults);
        expect(parsed).toEqual(defaultSpaceDefaults[s.kind as SpaceKind]);
      }
    });
  });

  it("keeps the SQL defaults for custom Spaces in sync with TypeScript", async () => {
    const [row] = await sql<{ d: unknown }[]>`select public.default_space_defaults('custom') as d`;
    expect(row.d).toEqual(defaultSpaceDefaults.custom);
  });
});

describe("isolation between accounts", () => {
  const ownedTables = [
    t.profiles, t.spaces, t.circles, t.goals, t.people, t.personSpaces, t.personLinks, t.events, t.eventPeople,
    t.eventAttendance, t.interactions, t.commitments, t.goalLinks, t.goalLinkHistory, t.dossiers, t.scores, t.searches,
    t.suggestions, t.nudgeStates, t.briefs, t.imports, t.importItems, t.jobs, t.aiUsage, t.dataExports,
  ];

  it("Alice sees her rows", async () => {
    await db.withUser(alice.id, async (tx) => {
      for (const table of ownedTables) {
        const [{ n }] = await tx.select({ n: dsql<number>`count(*)::int` }).from(table);
        expect(n).toBeGreaterThan(0);
      }
    });
  });

  it("Bob sees none of Alice's rows", async () => {
    await db.withUser(bob.id, async (tx) => {
      for (const table of ownedTables) {
        const rows = await tx.select({ userId: table.userId }).from(table);
        expect(rows.every((r) => r.userId === bob.id)).toBe(true);
      }
    });
  });

  it("Bob can't update or delete Alice's rows", async () => {
    await db.withUser(bob.id, async (tx) => {
      const updated = await tx.update(t.people).set({ name: "Hacked" }).where(eq(t.people.id, a.person.id)).returning();
      expect(updated).toHaveLength(0);
      const deleted = await tx.delete(t.interactions).where(eq(t.interactions.id, a.interaction.id)).returning();
      expect(deleted).toHaveLength(0);
    });
    const [p] = await sql`select name from people where id = ${a.person.id}`;
    expect(p.name).toBe("Adaeze Okafor");
  });

  it("Bob can't write rows that claim to be Alice's", async () => {
    const code = await errorCode(db.withUser(bob.id, (tx) => tx.insert(t.people).values({ userId: alice.id, name: "Fake" })));
    expect(code).toBe("42501");
  });

  it("Bob can't point his rows at Alice's people, events or goals", async () => {
    const bobSpaces = await db.withUser(bob.id, spacesOf);
    const attempts = [
      (tx: Tx) => tx.insert(t.interactions).values({ userId: bob.id, personId: a.person.id, spaceId: bobSpaces.work.id, occurredOn: "2026-10-10", type: "call" }),
      (tx: Tx) => tx.insert(t.personSpaces).values({ userId: bob.id, personId: a.person.id, spaceId: bobSpaces.work.id }),
      (tx: Tx) => tx.insert(t.events).values({ userId: bob.id, spaceId: a.s.work.id, title: "x", startsOn: "2026-10-01", tz: "UTC" }),
      (tx: Tx) => tx.insert(t.goals).values({ userId: bob.id, spaceId: a.s.work.id, text: "x" }),
    ];
    for (const attempt of attempts) {
      expect(await errorCode(db.withUser(bob.id, attempt))).toBe("42501");
    }
  });

  it("the anon role can't read anything", async () => {
    const code = await errorCode(
      sql.begin(async (tx) => {
        await tx`set local role anon`;
        await tx`select * from people`;
      }),
    );
    expect(code).toBe("42501");
  });
});

describe("connections secrets", () => {
  it("owners can see connection status but never the encrypted tokens", async () => {
    await db.withUser(alice.id, async (tx) => {
      const rows = await tx.select({ id: t.connections.id, status: t.connections.status }).from(t.connections);
      expect(rows).toHaveLength(1);
    });
    const code = await errorCode(db.withUser(alice.id, (tx) => tx.select({ tok: t.connections.tokensEnc }).from(t.connections)));
    expect(code).toBe("42501");
  });

  it("owners can't write connections directly", async () => {
    const code = await errorCode(
      db.withUser(alice.id, (tx) => tx.insert(t.connections).values({ userId: alice.id, provider: "google" })),
    );
    expect(code).toBe("42501");
  });
});

describe("Spaces stay sealed", () => {
  it("rejects touches, promises, goal links and room links in a Space the person isn't in", async () => {
    const goalInDating = await db.withUser(alice.id, async (tx) => {
      const [g] = await tx.insert(t.goals).values({ userId: alice.id, spaceId: a.s.dating.id, text: "Meet someone kind", type: "dating" }).returning();
      return g;
    });
    const eventInDating = await db.withUser(alice.id, async (tx) => {
      const [e] = await tx.insert(t.events).values({ userId: alice.id, spaceId: a.s.dating.id, title: "Dinner", startsOn: "2026-11-01", tz: "Africa/Lagos" }).returning();
      return e;
    });
    const attempts = [
      (tx: Tx) => tx.insert(t.interactions).values({ userId: alice.id, personId: a.person.id, spaceId: a.s.dating.id, occurredOn: "2026-10-10", type: "call" }),
      (tx: Tx) => tx.insert(t.commitments).values({ userId: alice.id, personId: a.person.id, spaceId: a.s.dating.id, text: "x", owner: "me" }),
      (tx: Tx) => tx.insert(t.goalLinks).values({ userId: alice.id, goalId: goalInDating.id, personId: a.person.id, stage: "matched" }),
      (tx: Tx) => tx.insert(t.eventPeople).values({ userId: alice.id, eventId: eventInDating.id, personId: a.person.id }),
      (tx: Tx) => tx.insert(t.events).values({ userId: alice.id, spaceId: a.s.dating.id, title: "x", startsOn: "2026-11-01", tz: "UTC", goalId: a.goal.id }),
      (tx: Tx) => tx.insert(t.interactions).values({ userId: alice.id, personId: a.person.id, spaceId: a.s.work.id, occurredOn: "2026-10-10", type: "call", eventId: eventInDating.id }),
      (tx: Tx) => tx.update(t.personSpaces).set({ circleId: a.circle.id }).where(and(eq(t.personSpaces.personId, a.person.id), eq(t.personSpaces.spaceId, a.s.dating.id))),
    ];
    for (const attempt of attempts.slice(0, 6)) {
      expect(await errorCode(db.withUser(alice.id, attempt))).toBe("23514");
    }

    // Once the person is also in Dating, the same link is allowed: one node, two Spaces.
    await db.withUser(alice.id, async (tx) => {
      await tx.insert(t.personSpaces).values({ userId: alice.id, personId: a.person.id, spaceId: a.s.dating.id });
      await tx.insert(t.goalLinks).values({ userId: alice.id, goalId: goalInDating.id, personId: a.person.id, stage: "matched" });
    });
    // A Work circle still can't be attached to the Dating membership.
    expect(await errorCode(db.withUser(alice.id, attempts[6]))).toBe("23514");
  });

  it("refuses full research in Personal and Dating Spaces", async () => {
    const code = await errorCode(
      db.withUser(alice.id, (tx) =>
        tx.update(t.spaces).set({ defaults: { ...defaultSpaceDefaults.dating, researchMode: "full" } }).where(eq(t.spaces.id, a.s.dating.id)),
      ),
    );
    expect(code).toBe("23514");
  });
});

describe("triggers", () => {
  it("keeps last-touched dates per person and per Space", async () => {
    await db.withUser(alice.id, async (tx) => {
      await tx.insert(t.interactions).values({ userId: alice.id, personId: a.person.id, spaceId: a.s.work.id, occurredOn: "2026-10-20", type: "call" });
      const [p] = await tx.select().from(t.people).where(eq(t.people.id, a.person.id));
      expect(p.lastTouchedOn).toBe("2026-10-20");
      const [m] = await tx.select().from(t.personSpaces).where(eq(t.personSpaces.id, a.membership.id));
      expect(m.lastTouchedOn).toBe("2026-10-20");
      await tx.delete(t.interactions).where(and(eq(t.interactions.personId, a.person.id), eq(t.interactions.occurredOn, "2026-10-20")));
      const [p2] = await tx.select().from(t.people).where(eq(t.people.id, a.person.id));
      expect(p2.lastTouchedOn).toBe("2026-10-10");
    });
  });

  it("records pipeline stage moves, which the owner can read but not forge", async () => {
    await db.withUser(alice.id, async (tx) => {
      await tx.update(t.goalLinks).set({ stage: "introduced" }).where(eq(t.goalLinks.id, a.goalLink.id));
      const history = await tx.select().from(t.goalLinkHistory).where(eq(t.goalLinkHistory.goalLinkId, a.goalLink.id));
      expect(history.map((h) => [h.fromStage, h.toStage])).toEqual([
        [null, "identified"],
        ["identified", "introduced"],
      ]);
    });
    const code = await errorCode(
      db.withUser(alice.id, (tx) => tx.insert(t.goalLinkHistory).values({ userId: alice.id, goalLinkId: a.goalLink.id, toStage: "won" })),
    );
    expect(code).toBe("42501");
  });

  it("bumps updated_at on change", async () => {
    await sql`update people set updated_at = '2000-01-01' where id = ${a.other.id}`;
    await db.withUser(alice.id, (tx) => tx.update(t.people).set({ company: "Harmattan Capital" }).where(eq(t.people.id, a.other.id)));
    const [row] = await sql`select updated_at from people where id = ${a.other.id}`;
    expect(new Date(row.updated_at).getFullYear()).toBeGreaterThan(2000);
  });
});
