import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultSpaceDefaults } from "@/contracts/spaces";
import { loadNetworkDigest, loadPersonContext, loadSpaceContext } from "@/server/ai/context/space-context";
import * as t from "@/server/db/schema";
import type { Tx } from "@/server/db/with-user";
import { createSpace, deleteSpace, getSpace, listSpaces, setSpaceArchived, updateSpace } from "@/server/repos/spaces";
import { connect, createUser, errorCode } from "./helpers";

const { sql, db } = connect();
let user: { id: string };
afterAll(() => sql.end());
beforeAll(async () => {
  user = await createUser(sql, "Spaces Owner");
});

const as = <T,>(fn: (tx: Tx) => Promise<T>) => db.withUser(user.id, fn);
const byKind = async (tx: Tx, kind: string) => (await listSpaces(tx)).find((s) => s.kind === kind)!;
const workEdit = (stages = defaultSpaceDefaults.work.stages) => ({
  name: "Work",
  cadenceDays: 30,
  researchMode: "full" as const,
  stages: stages.map((s) => ({ ...s, closed: s.closed ?? false })),
});

describe("Spaces", () => {
  it("creates a Space from its type's template and refuses duplicate names", async () => {
    await as(async (tx) => {
      const r = await createSpace(tx, user.id, { name: "Alumni", kind: "custom" });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.defaults).toEqual(defaultSpaceDefaults.custom);
      expect(r.data.position).toBe(3);
      const dup = await createSpace(tx, user.id, { name: "alumni", kind: "work" });
      expect(dup).toMatchObject({ ok: false, field: "name" });
    });
  });

  it("allows a second Work-type Space with full research", async () => {
    await as(async (tx) => {
      const r = await createSpace(tx, user.id, { name: "Agency clients", kind: "work" });
      expect(r.ok && r.data.defaults.researchMode).toBe("full");
    });
  });

  it("never allows full research outside Work Spaces, in the app or the database", async () => {
    await as(async (tx) => {
      const other = (await listSpaces(tx)).find((s) => s.name === "Alumni")!;
      const r = await updateSpace(tx, other.id, { ...workEdit(), name: "Alumni" });
      expect(r).toMatchObject({ ok: false, field: "researchMode" });
    });
    const custom = await as((tx) => listSpaces(tx)).then((s) => s.find((x) => x.name === "Alumni")!);
    const code = await errorCode(
      as((tx) => tx.update(t.spaces).set({ defaults: { ...defaultSpaceDefaults.custom, researchMode: "full" } }).where(eq(t.spaces.id, custom.id))),
    );
    expect(code).toBe("23514");
  });

  it("doesn't let a Space change type", async () => {
    const custom = await as((tx) => listSpaces(tx)).then((s) => s.find((x) => x.name === "Alumni")!);
    const code = await errorCode(as((tx) => tx.update(t.spaces).set({ kind: "work" }).where(eq(t.spaces.id, custom.id))));
    expect(code).toBe("23514");
  });

  it("renames stages without breaking pipeline links, but won't strand people in a removed stage", async () => {
    await as(async (tx) => {
      const work = await byKind(tx, "work");
      const [person] = await tx.insert(t.people).values({ userId: user.id, name: "Tola" }).returning();
      await tx.insert(t.personSpaces).values({ userId: user.id, personId: person.id, spaceId: work.id });
      const [goal] = await tx.insert(t.goals).values({ userId: user.id, spaceId: work.id, text: "Win clients" }).returning();
      await tx.insert(t.goalLinks).values({ userId: user.id, goalId: goal.id, personId: person.id, stage: "met" });

      const renamed = workEdit(defaultSpaceDefaults.work.stages.map((s) => (s.key === "met" ? { ...s, label: "Met in person" } : s)));
      const ok = await updateSpace(tx, work.id, renamed);
      expect(ok.ok).toBe(true);
      expect((await getSpace(tx, work.id))!.defaults.stages.find((s) => s.key === "met")!.label).toBe("Met in person");

      const removed = workEdit(defaultSpaceDefaults.work.stages.filter((s) => s.key !== "met"));
      const blocked = await updateSpace(tx, work.id, removed);
      expect(blocked).toMatchObject({ ok: false, field: "stages" });
      expect(blocked.ok || blocked.message).toContain('1 person is at "Met in person"');
    });
  });

  it("archives instead of deleting Spaces that have things in them, and keeps one active", async () => {
    await as(async (tx) => {
      const work = await byKind(tx, "work");
      expect((await deleteSpace(tx, work.id)).ok).toBe(false);
      const alumni = (await listSpaces(tx)).find((s) => s.name === "Alumni")!;
      expect((await deleteSpace(tx, alumni.id)).ok).toBe(true);

      const dating = await byKind(tx, "dating");
      expect((await setSpaceArchived(tx, dating.id, true)).ok).toBe(true);
      expect((await listSpaces(tx)).map((s) => s.name)).not.toContain("Dating");
      expect((await listSpaces(tx, { includeArchived: true })).map((s) => s.name)).toContain("Dating");
      expect((await setSpaceArchived(tx, dating.id, false)).ok).toBe(true);

      for (const s of await listSpaces(tx)) if (s.kind !== "work" || s.name !== "Work") await setSpaceArchived(tx, s.id, true);
      expect(await setSpaceArchived(tx, work.id, true)).toMatchObject({ ok: false });
      for (const s of await listSpaces(tx, { includeArchived: true })) await setSpaceArchived(tx, s.id, false);
    });
  });
});

describe("AI context stays inside one Space", () => {
  it("shows a person's Work side to Work prompts and never their Dating side", async () => {
    await as(async (tx) => {
      const work = await byKind(tx, "work");
      const dating = await byKind(tx, "dating");
      const [both] = await tx.insert(t.people).values({ userId: user.id, name: "Kemi Adebayo", company: "Paystack" }).returning();
      const [datingOnly] = await tx.insert(t.people).values({ userId: user.id, name: "Seun Bello" }).returning();
      await tx.insert(t.personSpaces).values([
        { userId: user.id, personId: both.id, spaceId: work.id, notes: "Leads partnerships", tags: ["fintech"] },
        { userId: user.id, personId: both.id, spaceId: dating.id, notes: "Second date went well", tags: ["date"] },
        { userId: user.id, personId: datingOnly.id, spaceId: dating.id, notes: "Met on Hinge" },
      ]);
      await tx.insert(t.interactions).values([
        { userId: user.id, personId: both.id, spaceId: work.id, occurredOn: "2026-10-01", type: "meeting", summary: "Partnership call" },
        { userId: user.id, personId: both.id, spaceId: dating.id, occurredOn: "2026-10-20", type: "other", summary: "Dinner in Lekki" },
      ]);
      await tx.insert(t.commitments).values({ userId: user.id, personId: both.id, spaceId: dating.id, text: "Book the concert tickets", owner: "me" });
      const [datingGoal] = await tx.insert(t.goals).values({ userId: user.id, spaceId: dating.id, text: "Meet someone kind", type: "dating" }).returning();

      const workCtx = await loadPersonContext(tx, work.id, both.id);
      const text = JSON.stringify(workCtx);
      expect(workCtx?.relationship.notes).toBe("Leads partnerships");
      expect(workCtx?.touches.map((x) => x.summary)).toEqual(["Partnership call"]);
      expect(workCtx?.relationship.tags).toEqual(["fintech"]);
      for (const leak of ["Second date", "Dinner in Lekki", "concert", "Hinge", "Meet someone kind"]) {
        expect(text).not.toContain(leak);
      }
      // Shared identity is fine: the overall last-touch date, not what happened.
      expect(workCtx?.identity.lastTouchedOn).toBe("2026-10-20");
      expect(workCtx?.relationship.lastTouchedHereOn).toBe("2026-10-01");

      expect(await loadPersonContext(tx, work.id, datingOnly.id)).toBeNull();
      const digest = await loadNetworkDigest(tx, work.id);
      expect(digest.map((p) => p.name)).not.toContain("Seun Bello");
      expect(digest.find((p) => p.name === "Kemi Adebayo")?.tags).toEqual(["fintech"]);

      const spaceCtx = await loadSpaceContext(tx, work.id);
      expect(spaceCtx.goals.map((g) => g.id)).not.toContain(datingGoal.id);
      expect(spaceCtx.researchMode).toBe("full");
      expect((await loadSpaceContext(tx, dating.id)).researchMode).toBe("get_to_know");
    });
  });
});
