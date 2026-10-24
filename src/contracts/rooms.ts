import { z } from "zod";
import { isIsoDate } from "@/domain/dates";
import { recurFreqs } from "@/domain/recurrence";
import { isValidTimeZone } from "@/domain/zoned";

export const roomKinds = ["meeting", "conference", "mixer", "dinner", "meetup", "community", "other"] as const;
export type RoomKind = (typeof roomKinds)[number];
export const roomKindLabels: Record<RoomKind, string> = {
  meeting: "Meeting",
  conference: "Conference",
  mixer: "Mixer",
  dinner: "Dinner",
  meetup: "Meetup",
  community: "Community",
  other: "Other",
};

export const roomRoles = ["attendee", "met_there", "speaker", "organiser"] as const;
export type RoomRole = (typeof roomRoles)[number];
export const roomRoleLabels: Record<RoomRole, string> = {
  attendee: "Going",
  met_there: "Met there",
  speaker: "Speaking",
  organiser: "Organising",
};

const time = z
  .union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 18:30."), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep it under ${max} characters.`)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const roomSchema = z
  .object({
    spaceId: z.string().uuid("Choose a Space."),
    title: z.string().trim().min(1, "Give the room a name.").max(200, "Keep the name under 200 characters."),
    kind: z.enum(roomKinds).default("meetup"),
    startsOn: z.string().refine(isIsoDate, "Pick a date."),
    startTime: time,
    endTime: time,
    allDay: z.boolean().default(false),
    tz: z.string().refine(isValidTimeZone, "Choose a time zone."),
    location: optionalText(300),
    url: z
      .union([z.string().trim().url("Use a full link starting with https://"), z.literal(""), z.null()])
      .optional()
      .transform((v) => (v ? v : null)),
    notes: optionalText(5000),
    freq: z.enum(recurFreqs).default("none"),
    byDays: z.array(z.number().int().min(0).max(6)).max(7).optional().nullable(),
    nth: z.object({ n: z.number().int().min(-2).max(5).refine((n) => n !== 0), dow: z.number().int().min(0).max(6) }).nullable().optional(),
    untilOn: z
      .union([z.string().refine(isIsoDate, "Pick an end date."), z.literal(""), z.null()])
      .optional()
      .transform((v) => (v ? v : null)),
    goalId: z
      .union([z.string().uuid(), z.literal(""), z.null()])
      .optional()
      .transform((v) => (v ? v : null)),
  })
  .superRefine((r, ctx) => {
    if (r.untilOn && r.untilOn < r.startsOn) ctx.addIssue({ code: "custom", path: ["untilOn"], message: "The end date is before the first date." });
  });
export type RoomInput = z.input<typeof roomSchema>;
export type Room = z.output<typeof roomSchema>;

/* ---------- after the room ---------- */

const note = z
  .string()
  .trim()
  .max(500, "Keep each note under 500 characters.")
  .optional()
  .transform((v) => v || null);

/** "Who did you meet at X?": people you met at one session, and when to follow up. */
export const roomDebriefSchema = z.object({
  eventId: z.string().uuid(),
  occurrenceOn: z.string().refine(isIsoDate, "Use a real date."),
  met: z
    .array(
      z.union([
        z.object({ personId: z.string().uuid(), note }),
        z.object({
          /** Client-generated, so saving twice never adds them twice. */
          id: z.string().uuid(),
          name: z.string().trim().min(1, "Add their name.").max(120),
          company: z
            .string()
            .trim()
            .max(120)
            .optional()
            .transform((v) => v || null),
          note,
        }),
      ]),
    )
    .max(50, "That's a lot of people. Save the first 50, then add the rest."),
  followUpInDays: z.union([z.literal(0), z.literal(1), z.literal(2)]),
});
export type RoomDebriefInput = z.input<typeof roomDebriefSchema>;
