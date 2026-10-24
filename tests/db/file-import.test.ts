import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { todayIn } from "@/domain/dates";
import { readImportFiles } from "@/importers/files";
import type { Tx } from "@/server/db/with-user";
import { cancelFileImport, commitFileImport, getStagedImport, stageFileImport } from "@/server/import/files";
import { createPerson } from "@/server/repos/people";
import { listSpaces } from "@/server/repos/spaces";
import { connect, createUser } from "./helpers";

const { sql, db } = connect();
const TODAY = todayIn("Africa/Lagos");
let user: { id: string };
let work: string;
afterAll(() => sql.end());
const as = <T,>(fn: (tx: Tx) => Promise<T>) => db.withUser(user.id, fn);
const file = (name: string) => ({ name, bytes: new Uint8Array(readFileSync(new URL(`../fixtures/files/${name}`, import.meta.url))) });

beforeAll(async () => {
  user = await createUser(sql, "File Importer");
  work = (await as((tx) => listSpaces(tx))).find((s) => s.kind === "work")!.id;
  // Already known: Kemi by email (gains details), and a different "Ifeoma Nwosú" with no shared contact (name-only).
  await as((tx) => createPerson(tx, user.id, { id: randomUUID(), identity: { name: "Kemi A.", emails: ["kemi@paystack.example"] }, membership: { spaceId: work } }, TODAY));
  await as((tx) => createPerson(tx, user.id, { id: randomUUID(), identity: { name: "Ifeoma Nwosú", phones: ["+2348000000001"] }, membership: { spaceId: work } }, TODAY));
});

describe("file imports", () => {
  let importId: string;

  it("stages parsed files for review without touching people", async () => {
    const parsed = readImportFiles([file("iphone.vcf"), file("Connections.csv")], "NG");
    const before = await sql`select count(*)::int as n from people where user_id = ${user.id}`;
    const r = await as((tx) => stageFileImport(tx, { userId: user.id, spaceId: work, parsed }));
    importId = r.importId;
    expect(r.planned).toEqual({ found: 6, add: 5, fill: 1, unchanged: 0, possibleDuplicates: 1, events: 0 });
    const after = await sql`select count(*)::int as n from people where user_id = ${user.id}`;
    expect(after[0].n).toBe(before[0].n);

    const staged = (await as((tx) => getStagedImport(tx, importId, { page: 0 })))!;
    expect(staged.import.status).toBe("review");
    expect(staged.adds.map((a) => a.name)).toEqual(["+2348098765432", "Adaeze Okafor", "Folded Name", "Ifeoma Nwosú", "Kwame Mensah"]);
    expect(staged.fills).toEqual([{ personId: expect.any(String), name: "Kemi A.", fields: expect.arrayContaining(["company", "phones", "birthday"]) }]);
  });

  it("commits through the import pipeline, then deletes the staged rows", async () => {
    const r = await as((tx) => commitFileImport(tx, { userId: user.id, importId, spaceId: work, today: TODAY, meEmails: [] }));
    expect(r?.contacts).toMatchObject({ added: 5, updated: 1, possibleDuplicates: 1 });
    const [{ n }] = await sql`select count(*)::int as n from import_items where import_id = ${importId}`;
    expect(n).toBe(0);
    const [kemi] = await sql`select company, phones, birthday from people where user_id = ${user.id} and name = 'Kemi A.'`;
    expect(kemi).toMatchObject({ company: "Paystack", phones: ["+2348031234567"], birthday: "03-14" });
    const [adaeze] = await sql`select ps.where_met, ps.met_on::text, ps.triage_state from people p join person_spaces ps on ps.person_id = p.id where p.user_id = ${user.id} and p.name = 'Adaeze Okafor'`;
    expect(adaeze).toEqual({ where_met: "LinkedIn", met_on: "2024-03-14", triage_state: "pending" });
    const [dup] = await sql`select why from suggestions where user_id = ${user.id} and kind = 'merge'`;
    expect(dup.why).toMatch(/Ifeoma/);
    // Committing twice does nothing.
    expect(await as((tx) => commitFileImport(tx, { userId: user.id, importId, spaceId: work, today: TODAY, meEmails: [] }))).toBeNull();
  });

  it("importing the same file again adds no one", async () => {
    const parsed = readImportFiles([file("iphone.vcf")], "NG");
    const r = await as((tx) => stageFileImport(tx, { userId: user.id, spaceId: work, parsed }));
    expect(r.planned).toMatchObject({ add: 0, fill: 0 });
    await as((tx) => cancelFileImport(tx, r.importId));
    const [imp] = await sql`select status from imports where id = ${r.importId}`;
    expect(imp.status).toBe("cancelled");
  });

  it("5,000 contacts from a vCard import in well under a minute", async () => {
    const big = await createUser(sql, "Big Importer");
    const bigWork = (await db.withUser(big.id, (tx) => listSpaces(tx))).find((s) => s.kind === "work")!.id;
    const cards = Array.from(
      { length: 5000 },
      (_, i) => `BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Person ${i}\r\nEMAIL:person${i}@example.com\r\nTEL:+234 803 ${String(1000000 + i).slice(-7)}\r\nORG:Company ${i % 50}\r\nEND:VCARD\r\n`,
    ).join("");
    const started = Date.now();
    const parsed = readImportFiles([{ name: "big.vcf", bytes: new TextEncoder().encode(cards) }], "NG");
    expect(parsed.contacts).toHaveLength(5000);
    const staged = await db.withUser(big.id, (tx) => stageFileImport(tx, { userId: big.id, spaceId: bigWork, parsed }));
    const r = await db.withUser(big.id, (tx) => commitFileImport(tx, { userId: big.id, importId: staged.importId, spaceId: bigWork, today: TODAY, meEmails: [] }));
    const seconds = (Date.now() - started) / 1000;
    expect(r?.contacts?.added).toBe(5000);
    expect(seconds).toBeLessThan(30);
  }, 60_000);
});
