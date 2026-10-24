import { sql as dsql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import * as t from "@/server/db/schema";
import { loadExampleData, removeExampleData } from "@/server/seed/example";
import { connect, createUser } from "./helpers";


const { sql, db } = connect();
afterAll(() => sql.end());

const count = (tx: Parameters<Parameters<typeof db.withUser>[1]>[0], table: typeof t.people | typeof t.events | typeof t.interactions | typeof t.goals) =>
  tx.select({ n: dsql<number>`count(*)::int` }).from(table).then((r) => r[0].n);

describe("example data", () => {
  it("loads the Lagos example network once, under RLS, and removes it cleanly", async () => {
    const u = await createUser(sql, "Example Owner");
    await db.withUser(u.id, async (tx) => {
      expect(await loadExampleData(tx, u.id, "2026-10-23")).toBe(true);
      expect(await loadExampleData(tx, u.id, "2026-10-23")).toBe(false);
      expect(await count(tx, t.people)).toBe(6);
      expect(await count(tx, t.events)).toBe(4);
      expect(await count(tx, t.interactions)).toBe(6);
      const [adaeze] = await tx.select().from(t.people).where(dsql`name = 'Adaeze Okafor'`);
      expect(adaeze.lastTouchedOn).toBe("2026-09-01"); // 52 days before 23 Oct, kept by the trigger
      const attendance = await tx.select().from(t.eventAttendance);
      expect(attendance.length).toBeGreaterThanOrEqual(4);

      await removeExampleData(tx);
      expect(await count(tx, t.people)).toBe(0);
      expect(await count(tx, t.events)).toBe(0);
      expect(await count(tx, t.interactions)).toBe(0);
      expect(await count(tx, t.goals)).toBe(0);
    });
  });
});
