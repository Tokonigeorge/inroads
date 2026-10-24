/**
 * Inroads database schema. Source of truth for tables, indexes and RLS policies;
 * triggers and functions live in hand-written SQL migrations (supabase/migrations).
 *
 * Model: people are graph nodes. `people` holds identity (shared), `person_spaces`
 * holds your relationship with a person inside one Space (private to that Space).
 * See docs/TECH_PLAN.md §2 and §4.7.
 */
import { sql, type SQL } from "drizzle-orm";
import {
  bigserial,
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgPolicy,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { authenticatedRole, authUsers } from "drizzle-orm/supabase";

/* ---------- column helpers ---------- */

const citext = customType<{ data: string }>({ dataType: () => "citext" });
const citextArray = customType<{ data: string[] }>({ dataType: () => "citext[]" });
const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });
const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

const id = () => uuid("id").primaryKey().defaultRandom();
const userId = () =>
  uuid("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const textArray = (name: string) => text(name).array().notNull().default(sql`'{}'::text[]`);

const isOwner = sql`user_id = (select auth.uid())`;

/** Full CRUD for the row's owner. */
function ownerPolicies(table: string) {
  return [
    pgPolicy(`${table}_owner_select`, { for: "select", to: authenticatedRole, using: isOwner }),
    pgPolicy(`${table}_owner_insert`, { for: "insert", to: authenticatedRole, withCheck: isOwner }),
    pgPolicy(`${table}_owner_update`, { for: "update", to: authenticatedRole, using: isOwner, withCheck: isOwner }),
    pgPolicy(`${table}_owner_delete`, { for: "delete", to: authenticatedRole, using: isOwner }),
  ];
}

/** Owner may read; only the service role (background jobs, system crons) writes. */
function ownerReadOnly(table: string) {
  return [pgPolicy(`${table}_owner_select`, { for: "select", to: authenticatedRole, using: isOwner })];
}

/* ---------- enums ---------- */

export const spaceKind = pgEnum("space_kind", ["work", "personal", "dating", "custom"]);
export const goalType = pgEnum("goal_type", [
  "capital",
  "clients",
  "hiring",
  "market",
  "partners",
  "mentors",
  "career",
  "friends",
  "family",
  "dating",
  "other",
]);
export const touchType = pgEnum("touch_type", ["coffee", "call", "meeting", "message", "email", "event", "other"]);

/* ---------- profile, spaces, circles, goals ---------- */

export const profiles = pgTable(
  "profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    name: text("name").notNull().default(""),
    headline: text("headline"),
    location: text("location"),
    background: text("background"),
    offerings: text("offerings"),
    industries: textArray("industries"),
    emails: citextArray("emails").notNull().default(sql`'{}'::citext[]`),
    timezone: text("timezone").notNull().default("Africa/Lagos"),
    defaultRegion: text("default_region").notNull().default("NG"),
    briefTime: time("brief_time").notNull().default("07:30"),
    onboardingState: jsonb("onboarding_state").notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  () => ownerPolicies("profiles"),
);

export const spaces = pgTable(
  "spaces",
  {
    id: id(),
    userId: userId(),
    name: text("name").notNull(),
    kind: spaceKind("kind").notNull(),
    position: integer("position").notNull().default(0),
    defaults: jsonb("defaults").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("spaces_user_name_key").on(t.userId, t.name), ...ownerPolicies("spaces")],
);

export const circles = pgTable(
  "circles",
  {
    id: id(),
    userId: userId(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    defaultCadenceDays: integer("default_cadence_days"),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("circles_space_idx").on(t.userId, t.spaceId),
    check("circles_cadence_check", sql`${t.defaultCadenceDays} is null or ${t.defaultCadenceDays} >= 0`),
    ...ownerPolicies("circles"),
  ],
);

export const goals = pgTable(
  "goals",
  {
    id: id(),
    userId: userId(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    type: goalType("type").notNull().default("other"),
    priority: smallint("priority").notNull().default(2),
    weeklyTarget: integer("weekly_target").notNull().default(3),
    active: boolean("active").notNull().default(true),
    stages: jsonb("stages"),
    dueOn: date("due_on"),
    example: boolean("example").notNull().default(false),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("goals_space_idx").on(t.userId, t.spaceId),
    check("goals_priority_check", sql`${t.priority} between 1 and 3`),
    ...ownerPolicies("goals"),
  ],
);

/* ---------- people (graph) ---------- */

export const people = pgTable(
  "people",
  {
    id: id(),
    userId: userId(),
    name: text("name").notNull(),
    emails: citextArray("emails").notNull().default(sql`'{}'::citext[]`),
    phones: textArray("phones"),
    company: text("company"),
    position: text("position"),
    city: text("city"),
    birthday: text("birthday"),
    socials: jsonb("socials").notNull().default({}),
    lastTouchedOn: date("last_touched_on"),
    source: text("source").notNull().default("manual"),
    externalRefs: jsonb("external_refs").notNull().default({}),
    /** The import or sync that created this person (for undo). */
    importId: uuid("import_id").references((): AnyPgColumn => imports.id, { onDelete: "set null" }),
    example: boolean("example").notNull().default(false),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    mergedIntoId: uuid("merged_into_id").references((): AnyPgColumn => people.id),
    search: tsvector("search").generatedAlwaysAs(
      (): SQL =>
        sql`to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(company, '') || ' ' || coalesce(position, '') || ' ' || coalesce(city, ''))`,
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("people_user_idx").on(t.userId).where(sql`${t.deletedAt} is null`),
    index("people_search_idx").using("gin", t.search),
    index("people_name_trgm_idx").using("gin", sql`${t.name} gin_trgm_ops`),
    index("people_emails_idx").using("gin", t.emails),
    index("people_phones_idx").using("gin", t.phones),
    index("people_last_touched_idx").on(t.userId, t.lastTouchedOn),
    check("people_birthday_check", sql`${t.birthday} is null or ${t.birthday} ~ '^\\d{2}-\\d{2}$'`),
    ...ownerPolicies("people"),
  ],
);

export const personSpaces = pgTable(
  "person_spaces",
  {
    id: id(),
    userId: userId(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    whereMet: text("where_met"),
    metOn: date("met_on"),
    interests: textArray("interests"),
    notes: text("notes"),
    opportunities: text("opportunities"),
    tags: textArray("tags"),
    circleId: uuid("circle_id").references(() => circles.id, { onDelete: "set null" }),
    cadenceDays: integer("cadence_days"),
    starred: boolean("starred").notNull().default(false),
    triageState: text("triage_state").notNull().default("done"),
    triageSuggestion: jsonb("triage_suggestion"),
    cadenceAnchorOn: date("cadence_anchor_on"),
    lastTouchedOn: date("last_touched_on"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("person_spaces_person_space_key").on(t.personId, t.spaceId),
    index("person_spaces_space_idx").on(t.userId, t.spaceId).where(sql`${t.archivedAt} is null`),
    index("person_spaces_tags_idx").using("gin", t.tags),
    check("person_spaces_cadence_check", sql`${t.cadenceDays} is null or ${t.cadenceDays} >= 0`),
    check("person_spaces_triage_check", sql`${t.triageState} in ('pending', 'done')`),
    ...ownerPolicies("person_spaces"),
  ],
);

export const personLinks = pgTable(
  "person_links",
  {
    id: id(),
    userId: userId(),
    fromPersonId: uuid("from_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    toPersonId: uuid("to_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    note: text("note"),
    source: text("source").notNull().default("manual"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("person_links_key").on(t.fromPersonId, t.toPersonId, t.kind, t.spaceId),
    check("person_links_not_self", sql`${t.fromPersonId} <> ${t.toPersonId}`),
    check("person_links_kind_check", sql`${t.kind} in ('introduced_by', 'works_with', 'knows', 'family', 'partner')`),
    ...ownerPolicies("person_links"),
  ],
);

/* ---------- connections (declared before events/interactions that reference it) ---------- */

export const connections = pgTable(
  "connections",
  {
    id: id(),
    userId: userId(),
    provider: text("provider").notNull(),
    accountEmail: citext("account_email"),
    scopes: textArray("scopes"),
    tokensEnc: bytea("tokens_enc"),
    icsUrlEnc: bytea("ics_url_enc"),
    syncState: jsonb("sync_state").notNull().default({}),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    status: text("status").notNull().default("active"),
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("connections_account_key").on(t.userId, t.provider, t.accountEmail),
    check("connections_provider_check", sql`${t.provider} in ('google', 'microsoft', 'apple_ics')`),
    check("connections_status_check", sql`${t.status} in ('active', 'error', 'revoked', 'paused')`),
    ...ownerReadOnly("connections"),
  ],
);

/* ---------- rooms (events) ---------- */

export const events = pgTable(
  "events",
  {
    id: id(),
    userId: userId(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    kind: text("kind").notNull().default("meetup"),
    startsOn: date("starts_on").notNull(),
    startTime: time("start_time"),
    endTime: time("end_time"),
    allDay: boolean("all_day").notNull().default(false),
    tz: text("tz").notNull(),
    location: text("location"),
    url: text("url"),
    notes: text("notes"),
    rrule: text("rrule"),
    rruleSource: text("rrule_source"),
    untilOn: date("until_on"),
    goalId: uuid("goal_id").references(() => goals.id, { onDelete: "set null" }),
    source: text("source").notNull().default("manual"),
    externalId: text("external_id"),
    connectionId: uuid("connection_id").references(() => connections.id, { onDelete: "set null" }),
    importId: uuid("import_id").references((): AnyPgColumn => imports.id, { onDelete: "set null" }),
    example: boolean("example").notNull().default(false),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("events_external_key").on(t.userId, t.source, t.externalId),
    index("events_space_idx").on(t.userId, t.spaceId).where(sql`${t.deletedAt} is null`),
    ...ownerPolicies("events"),
  ],
);

export const eventPeople = pgTable(
  "event_people",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    userId: userId(),
    role: text("role").notNull().default("attendee"),
    occurrenceOn: date("occurrence_on"),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.personId, t.role] }),
    index("event_people_person_idx").on(t.personId),
    check("event_people_role_check", sql`${t.role} in ('attendee', 'met_there', 'speaker', 'organiser')`),
    ...ownerPolicies("event_people"),
  ],
);

export const eventAttendance = pgTable(
  "event_attendance",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: userId(),
    occurrenceOn: date("occurrence_on").notNull(),
    attended: boolean("attended").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.occurrenceOn] }), ...ownerPolicies("event_attendance")],
);

/* ---------- touches, promises, pipeline ---------- */

export const interactions = pgTable(
  "interactions",
  {
    id: id(),
    userId: userId(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    occurredOn: date("occurred_on").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    type: touchType("type").notNull(),
    summary: text("summary"),
    source: text("source").notNull().default("manual"),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    occurrenceOn: date("occurrence_on"),
    dedupeKey: text("dedupe_key"),
    importId: uuid("import_id").references((): AnyPgColumn => imports.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("interactions_dedupe_key").on(t.personId, t.dedupeKey),
    index("interactions_person_idx").on(t.personId, t.occurredOn),
    index("interactions_space_idx").on(t.userId, t.spaceId, t.occurredOn),
    ...ownerPolicies("interactions"),
  ],
);

export const commitments = pgTable(
  "commitments",
  {
    id: id(),
    userId: userId(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    owner: text("owner").notNull(),
    dueOn: date("due_on"),
    doneAt: timestamp("done_at", { withTimezone: true }),
    source: text("source").notNull().default("manual"),
    interactionId: uuid("interaction_id").references(() => interactions.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("commitments_open_idx").on(t.userId, t.dueOn).where(sql`${t.doneAt} is null`),
    index("commitments_person_idx").on(t.personId),
    check("commitments_owner_check", sql`${t.owner} in ('me', 'them')`),
    ...ownerPolicies("commitments"),
  ],
);

export const goalLinks = pgTable(
  "goal_links",
  {
    id: id(),
    userId: userId(),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    stage: text("stage").notNull(),
    note: text("note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("goal_links_goal_person_key").on(t.goalId, t.personId),
    index("goal_links_person_idx").on(t.personId),
    ...ownerPolicies("goal_links"),
  ],
);

export const goalLinkHistory = pgTable(
  "goal_link_history",
  {
    id: id(),
    userId: userId(),
    goalLinkId: uuid("goal_link_id")
      .notNull()
      .references(() => goalLinks.id, { onDelete: "cascade" }),
    fromStage: text("from_stage"),
    toStage: text("to_stage").notNull(),
    movedAt: timestamp("moved_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("goal_link_history_link_idx").on(t.goalLinkId, t.movedAt), ...ownerReadOnly("goal_link_history")],
);

/* ---------- AI artifacts ---------- */

export const dossiers = pgTable(
  "dossiers",
  {
    id: id(),
    userId: userId(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    mode: text("mode").notNull(),
    payload: jsonb("payload").notNull(),
    sources: jsonb("sources").notNull().default([]),
    confidence: text("confidence"),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    jobId: uuid("job_id"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("dossiers_person_space_version_key").on(t.personId, t.spaceId, t.version),
    check("dossiers_mode_check", sql`${t.mode} in ('full', 'get_to_know', 'verify', 'knowledge', 'example')`),
    ...ownerPolicies("dossiers"),
  ],
);

export const scores = pgTable(
  "scores",
  {
    id: id(),
    userId: userId(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    goalId: uuid("goal_id").references(() => goals.id, { onDelete: "cascade" }),
    value: smallint("value").notNull(),
    why: text("why"),
    model: text("model"),
    createdAt: createdAt(),
  },
  (t) => [
    index("scores_person_idx").on(t.personId, t.createdAt),
    check("scores_value_check", sql`${t.value} between 0 and 100`),
    ...ownerPolicies("scores"),
  ],
);

export const searches = pgTable(
  "searches",
  {
    id: id(),
    userId: userId(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    query: text("query").notNull(),
    result: jsonb("result").notNull(),
    sources: jsonb("sources").notNull().default([]),
    model: text("model"),
    promptVersion: text("prompt_version"),
    createdAt: createdAt(),
  },
  (t) => [
    index("searches_user_idx").on(t.userId, t.spaceId, t.createdAt),
    check("searches_type_check", sql`${t.type} in ('person', 'company', 'place', 'event', 'radar')`),
    ...ownerPolicies("searches"),
  ],
);

export const suggestions = pgTable(
  "suggestions",
  {
    id: id(),
    userId: userId(),
    spaceId: uuid("space_id").references(() => spaces.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    targetType: text("target_type"),
    targetId: uuid("target_id"),
    payload: jsonb("payload").notNull(),
    why: text("why"),
    sources: jsonb("sources").notNull().default([]),
    origin: text("origin").notNull(),
    originId: uuid("origin_id"),
    status: text("status").notNull().default("pending"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("suggestions_pending_idx").on(t.userId, t.status, t.createdAt),
    index("suggestions_target_idx").on(t.targetType, t.targetId),
    check("suggestions_status_check", sql`${t.status} in ('pending', 'accepted', 'edited', 'dismissed')`),
    ...ownerPolicies("suggestions"),
  ],
);

export const nudgeStates = pgTable(
  "nudge_states",
  {
    userId: userId(),
    key: text("key").notNull(),
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.key] }),
    index("nudge_states_expires_idx").on(t.expiresAt),
    ...ownerPolicies("nudge_states"),
  ],
);

export const briefs = pgTable(
  "briefs",
  {
    id: id(),
    userId: userId(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    periodKey: text("period_key").notNull(),
    markdown: text("markdown").notNull(),
    sources: jsonb("sources").notNull().default([]),
    inputs: jsonb("inputs"),
    model: text("model"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("briefs_period_key").on(t.userId, t.spaceId, t.kind, t.periodKey),
    check("briefs_kind_check", sql`${t.kind} in ('daily', 'weekly')`),
    ...ownerPolicies("briefs"),
  ],
);

/* ---------- imports and jobs ---------- */

export const imports = pgTable(
  "imports",
  {
    id: id(),
    userId: userId(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    status: text("status").notNull(),
    connectionId: uuid("connection_id").references(() => connections.id, { onDelete: "set null" }),
    jobId: uuid("job_id"),
    storagePath: text("storage_path"),
    counts: jsonb("counts").notNull().default({}),
    options: jsonb("options").notNull().default({}),
    error: text("error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    committedAt: timestamp("committed_at", { withTimezone: true }),
  },
  (t) => [
    index("imports_user_idx").on(t.userId, t.createdAt),
    check(
      "imports_status_check",
      sql`${t.status} in ('uploaded', 'parsing', 'review', 'committing', 'done', 'failed', 'cancelled')`,
    ),
    ...ownerPolicies("imports"),
  ],
);

export const importItems = pgTable(
  "import_items",
  {
    id: id(),
    importId: uuid("import_id")
      .notNull()
      .references(() => imports.id, { onDelete: "cascade" }),
    userId: userId(),
    kind: text("kind").notNull(),
    raw: jsonb("raw").notNull(),
    normalised: jsonb("normalised").notNull(),
    matchPersonId: uuid("match_person_id").references(() => people.id, { onDelete: "set null" }),
    matchKind: text("match_kind"),
    action: text("action").notNull().default("add"),
    triage: text("triage"),
    createdAt: createdAt(),
  },
  (t) => [
    index("import_items_import_idx").on(t.importId, t.kind),
    check("import_items_kind_check", sql`${t.kind} in ('person', 'event', 'touch')`),
    check("import_items_action_check", sql`${t.action} in ('add', 'merge', 'skip', 'suggest_merge')`),
    ...ownerPolicies("import_items"),
  ],
);

export const jobs = pgTable(
  "jobs",
  {
    id: id(),
    userId: userId(),
    kind: text("kind").notNull(),
    status: text("status").notNull().default("queued"),
    progress: jsonb("progress").notNull().default({}),
    resultRef: jsonb("result_ref"),
    error: text("error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("jobs_user_idx").on(t.userId, t.createdAt),
    check("jobs_status_check", sql`${t.status} in ('queued', 'running', 'done', 'failed', 'cancelled')`),
    ...ownerReadOnly("jobs"),
  ],
);

/** Data exports (Settings → Data): one zip per request, downloaded by its owner, deleted after 7 days. */
export const dataExports = pgTable(
  "exports",
  {
    id: id(),
    userId: userId(),
    jobId: uuid("job_id"),
    filename: text("filename").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    data: bytea("data").notNull(),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("exports_user_idx").on(t.userId, t.createdAt), ...ownerReadOnly("exports")],
);

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: userId(),
    feature: text("feature").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    webSearches: integer("web_searches").notNull().default(0),
    costMicroUsd: integer("cost_micro_usd").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("ai_usage_user_feature_idx").on(t.userId, t.feature, t.createdAt), ...ownerReadOnly("ai_usage")],
);
