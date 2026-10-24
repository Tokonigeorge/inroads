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
