import "server-only";
import { and, eq, isNotNull, isNull, like, desc, sql } from "drizzle-orm";
import webpush from "web-push";
import { meetingsEndedBetween, wrapUpDue, type TimedRoom } from "@/domain/notify";
import { db as appDb, getSystemDb } from "@/server/db/client";
import * as t from "@/server/db/schema";
import type { Database } from "@/server/db/with-user";
import { listNudges, todayAgenda } from "@/server/repos/nudges";
import { timingOf } from "@/server/repos/rooms";

export type PushPayload = { title: string; body: string; url: string; tag?: string };
export type Sender = (sub: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string) => Promise<unknown>;
type Deps = { sys?: Database; db?: Pick<typeof appDb, "withUser">; send?: Sender; env?: Record<string, string | undefined> };

/** Web Push needs a key pair (VAPID). Without it, notifications are simply off. */
export function pushConfigured(env: Record<string, string | undefined> = process.env) {
  return Boolean(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
}

function defaultSender(env: Record<string, string | undefined>): Sender {
  webpush.setVapidDetails(env.VAPID_SUBJECT || "mailto:hello@inroads.app", env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
  return (sub, payload) => webpush.sendNotification(sub, payload, { TTL: 60 * 60 });
}

/** Sends to every device the user turned notifications on for; forgets devices that are gone. */
export async function pushToUser(userId: string, payload: PushPayload, deps: Deps = {}) {
  const sys = deps.sys ?? getSystemDb();
  const env = deps.env ?? process.env;
  const send = deps.send ?? (pushConfigured(env) ? defaultSender(env) : null);
  if (!send) return 0;
  const subs = await sys.select().from(t.pushSubscriptions).where(eq(t.pushSubscriptions.userId, userId));
  let sent = 0;
  for (const s of subs) {
    try {
      await send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload));
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      // 404/410: the browser dropped this subscription (uninstalled, permission revoked).
      if (status === 404 || status === 410) await sys.delete(t.pushSubscriptions).where(eq(t.pushSubscriptions.id, s.id));
      else console.error(`push failed (${status ?? "network"})`);
    }
  }
  return sent;
}

/** True the first time a key is claimed for a user, so a nudge never goes out twice. */
async function claim(sys: Database, userId: string, key: string) {
  const rows = await sys.insert(t.notificationLog).values({ userId, key }).onConflictDoNothing().returning({ id: t.notificationLog.id });
  return rows.length > 0;
}

/**
 * Runs every 15 minutes. For everyone with notifications on: "How did it go?" right after a
 * meeting ends (it opens "Who did you meet?" for that session), and the wrap-up at the time
 * and frequency they chose.
 */
export async function sendDueNotifications(now: Date = new Date(), deps: Deps = {}) {
  const sys = deps.sys ?? getSystemDb();
  const data = deps.db ?? appDb;
  const users = await sys
    .selectDistinct({ userId: t.profiles.userId, tz: t.profiles.timezone, afterMeetings: t.profiles.notifyAfterMeetings, every: t.profiles.wrapUpEveryDays, time: t.profiles.wrapUpTime })
    .from(t.profiles)
    .innerJoin(t.pushSubscriptions, eq(t.pushSubscriptions.userId, t.profiles.userId));
  let sent = 0;
  const recent = new Date(now.getTime() - 2 * 86_400_000).toISOString().slice(0, 10);
  for (const u of users) {
    if (u.afterMeetings) {
      const rows = await sys
        .select({ e: t.events })
        .from(t.events)
        .innerJoin(t.spaces, eq(t.spaces.id, t.events.spaceId))
        .where(
          and(
            eq(t.events.userId, u.userId),
            isNull(t.events.deletedAt),
            isNull(t.events.archivedAt),
            isNull(t.spaces.archivedAt),
            isNotNull(t.events.startTime),
            eq(t.events.going, true),
            // Only rooms that can have a session around now: a running series, or a one-off from the last couple of days.
            sql`((${t.events.rrule} is not null and (${t.events.untilOn} is null or ${t.events.untilOn} >= ${recent}::date)) or ${t.events.startsOn} >= ${recent}::date)`,
          ),
        );
      const rooms: TimedRoom[] = rows.map(({ e }) => ({ ...timingOf(e), title: e.title, endTime: e.endTime }));
      // A 20-minute look-back with a 15-minute schedule: a late run still catches it, the log stops repeats.
      for (const m of meetingsEndedBetween(rooms, new Date(now.getTime() - 20 * 60_000), now)) {
        if (!(await claim(sys, u.userId, `meeting:${m.eventId}:${m.occurrenceOn}`))) continue;
        sent += await pushToUser(
          u.userId,
          { title: `How did ${m.title} go?`, body: "Tap to note who you met and anything promised, while it's fresh.", url: `/rooms/${m.eventId}/after?on=${m.occurrenceOn}`, tag: `meeting-${m.eventId}` },
          deps,
        );
      }
    }
    const [last] = await sys
      .select({ key: t.notificationLog.key })
      .from(t.notificationLog)
      .where(and(eq(t.notificationLog.userId, u.userId), like(t.notificationLog.key, "wrapup:%")))
      .orderBy(desc(t.notificationLog.createdAt))
      .limit(1);
    const day = wrapUpDue({ now, tz: u.tz, time: u.time, everyDays: u.every, lastSentOn: last ? last.key.slice("wrapup:".length) : null });
    if (day && (await claim(sys, u.userId, `wrapup:${day}`))) {
      const body = await data.withUser(u.userId, async (tx) => {
        const c = { spaceId: null, today: day, tz: u.tz };
        const [agenda, nudges] = await Promise.all([todayAgenda(tx, c), listNudges(tx, c)]);
        const due = nudges.filter((n) => n.kind === "due").length;
        const promises = nudges.filter((n) => n.kind === "promise").length;
        const bits = [
          agenda.length ? `${agenda.length} ${agenda.length === 1 ? "meeting" : "meetings"} today` : "",
          due ? `${due} ${due === 1 ? "person" : "people"} to catch up with` : "",
          promises ? `${promises} ${promises === 1 ? "promise" : "promises"} open` : "",
        ].filter(Boolean);
        return `${bits.length ? `${bits.join(", ")}. ` : ""}Anything worth noting? Say it in a few words.`;
      });
      sent += await pushToUser(u.userId, { title: "Wrap up your day", body, url: "/today?capture=1", tag: "wrapup" }, deps);
    }
  }
  return { users: users.length, sent };
}

/** Rows are only the user's; listed for the Settings page. */
export async function countDevices(userId: string, sys: Database = getSystemDb()) {
  const [r] = await sys.select({ n: sql<number>`count(*)::int` }).from(t.pushSubscriptions).where(eq(t.pushSubscriptions.userId, userId));
  return r?.n ?? 0;
}
