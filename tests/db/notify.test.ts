import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Tx } from "@/server/db/with-user";
import { createRoom } from "@/server/repos/rooms";
import { listSpaces } from "@/server/repos/spaces";
import { sendDueNotifications, type Sender } from "@/server/system/notify";
import { connect, createUser } from "./helpers";

const { sql, db } = connect();
const sys = db.unsafeSystem;
let user: { id: string };
let roomId: string;
afterAll(() => sql.end());
const as = <T,>(fn: (tx: Tx) => Promise<T>) => db.withUser(user.id, fn);

/** A fake push service: records what would have been sent, and can say a device is gone. */
function fakeSender(gone = new Set<string>()) {
  const sent: { endpoint: string; payload: { title: string; body: string; url: string } }[] = [];
  const send: Sender = async (sub, payload) => {
    if (gone.has(sub.endpoint)) throw Object.assign(new Error("Gone"), { statusCode: 410 });
    sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
  };
  return { sent, send };
}

beforeAll(async () => {
  user = await createUser(sql, "Push Person");
  await sql`update profiles set timezone = 'Africa/Lagos', wrap_up_time = '18:00', wrap_up_every_days = 1 where user_id = ${user.id}`;
  const work = (await as((tx) => listSpaces(tx))).find((s) => s.kind === "work")!.id;
  const r = await as((tx) => createRoom(tx, user.id, { title: "Pitch with Kemi", spaceId: work, kind: "meeting", startsOn: "2026-11-02", startTime: "15:00", endTime: "17:00", tz: "Africa/Lagos", freq: "none" }));
  if (!r.ok) throw new Error(r.message);
  roomId = r.data.id;
  await sql`insert into push_subscriptions (user_id, endpoint, p256dh, auth) values (${user.id}, 'https://push.example/phone', 'k', 'a'), (${user.id}, 'https://push.example/old', 'k', 'a')`;
});

describe("notifications", () => {
  it("asks how a meeting went right after it ends, once, and forgets devices that are gone", async () => {
    const f = fakeSender(new Set(["https://push.example/old"]));
    // 17:05 in Lagos is 16:05 UTC: the 15:00–17:00 meeting just ended.
    await sendDueNotifications(new Date("2026-11-02T16:05:00Z"), { sys, db, send: f.send });
    const mine = f.sent.filter((s) => s.payload.title === "How did Pitch with Kemi go?");
    expect(mine).toHaveLength(1);
    expect(mine[0].payload.url).toBe(`/rooms/${roomId}/after?on=2026-11-02`);
    expect((await sql`select endpoint from push_subscriptions where user_id = ${user.id}`).map((r) => r.endpoint)).toEqual(["https://push.example/phone"]);

    const again = fakeSender();
    await sendDueNotifications(new Date("2026-11-02T16:15:00Z"), { sys, db, send: again.send });
    expect(again.sent.filter((s) => s.payload.title.startsWith("How did Pitch"))).toHaveLength(0);
  });

  it("doesn't ask when you turned it off", async () => {
    await sql`update profiles set notify_after_meetings = false where user_id = ${user.id}`;
    await sql`delete from notification_log where user_id = ${user.id}`;
    const f = fakeSender();
    await sendDueNotifications(new Date("2026-11-02T16:05:00Z"), { sys, db, send: f.send });
    expect(f.sent.filter((s) => s.endpoint === "https://push.example/phone" && s.payload.title.startsWith("How did"))).toHaveLength(0);
    await sql`update profiles set notify_after_meetings = true where user_id = ${user.id}`;
  });

  it("sends the wrap-up at your time, with what's on, once a day", async () => {
    const f = fakeSender();
    // 18:10 in Lagos.
    await sendDueNotifications(new Date("2026-11-02T17:10:00Z"), { sys, db, send: f.send });
    const wrap = f.sent.filter((s) => s.endpoint === "https://push.example/phone" && s.payload.title === "Wrap up your day");
    expect(wrap).toHaveLength(1);
    expect(wrap[0].payload.body).toMatch(/^1 meeting today.*Anything worth noting\?/);
    expect(wrap[0].payload.url).toBe("/today?capture=1");

    const again = fakeSender();
    await sendDueNotifications(new Date("2026-11-02T17:20:00Z"), { sys, db, send: again.send });
    expect(again.sent.filter((s) => s.endpoint === "https://push.example/phone" && s.payload.title === "Wrap up your day")).toHaveLength(0);
  });
});
