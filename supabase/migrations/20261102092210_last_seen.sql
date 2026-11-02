ALTER TABLE "profiles" ADD COLUMN "last_seen_on" date;--> statement-breakpoint
CREATE INDEX "events_import_idx" ON "events" USING btree ("import_id") WHERE "events"."import_id" is not null;