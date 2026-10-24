import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Tx } from "@/server/db/with-user";
import { recentImports } from "@/server/repos/connections";
import { createPerson } from "@/server/repos/people";
import { discardShare, getShare, personWithSocial, stageShare } from "@/server/repos/share";
import { listSpaces } from "@/server/repos/spaces";
import { connect, createUser } from "./helpers";

const { sql, db } = connect();
let user: { id: string };
let other: { id: string };
let work: string;
const ada = randomUUID();
afterAll(() => sql.end());
const as = <T,>(fn: (tx: Tx) => Promise<T>) => db.withUser(user.id, fn);

beforeAll(async () => {
  user = await createUser(sql, "Sharer");
  other = await createUser(sql, "Someone Else");
  work = (await as((tx) => listSpaces(tx))).find((s) => s.kind === "work")!.id;
  await as((tx) => createPerson(tx, user.id, { id: ada, identity: { name: "Ada Obi", socials: { linkedin: "https://www.linkedin.com/in/ada-obi/" } }, membership: { spaceId: work } }, "2026-10-24"));
});

describe("shares", () => {
  it("wait as a share import only their owner can see, kept out of import history, until discarded", async () => {
    const id = await as((tx) => stageShare(tx, user.id, work, { title: "  Note ", text: "Call Bisi tomorrow", url: null }));
    expect(await as((tx) => getShare(tx, id))).toEqual({ id, spaceId: work, input: { title: "Note", text: "Call Bisi tomorrow", url: "" } });
    expect(await db.withUser(other.id, (tx) => getShare(tx, id))).toBeNull();
    expect((await as((tx) => recentImports(tx))).map((i) => i.id)).not.toContain(id);
    await as((tx) => discardShare(tx, id));
    expect(await as((tx) => getShare(tx, id))).toBeNull();
  });

  it("finds someone you already have by profile link, whatever the URL's shape", async () => {
    for (const url of ["https://linkedin.com/in/ada-obi", "https://www.linkedin.com/in/Ada-Obi/", "http://m.linkedin.com/in/ada-obi"]) {
      expect(await as((tx) => personWithSocial(tx, "linkedin", url))).toEqual({ id: ada, name: "Ada Obi" });
    }
    expect(await as((tx) => personWithSocial(tx, "linkedin", "https://linkedin.com/in/ada-obi-2"))).toBeNull();
    expect(await db.withUser(other.id, (tx) => personWithSocial(tx, "linkedin", "https://linkedin.com/in/ada-obi"))).toBeNull();
  });
});
