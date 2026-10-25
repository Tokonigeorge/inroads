CREATE TABLE "goal_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"text" text NOT NULL,
	"due_on" date,
	"done_at" timestamp with time zone,
	"search_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goal_steps_text_check" CHECK (char_length("goal_steps"."text") between 1 and 300)
);
--> statement-breakpoint
ALTER TABLE "goal_steps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "searches" ADD COLUMN "event_id" uuid;--> statement-breakpoint
ALTER TABLE "goal_steps" ADD CONSTRAINT "goal_steps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_steps" ADD CONSTRAINT "goal_steps_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_steps" ADD CONSTRAINT "goal_steps_search_id_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."searches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goal_steps_goal_idx" ON "goal_steps" USING btree ("goal_id","done_at");--> statement-breakpoint
CREATE INDEX "goal_steps_due_idx" ON "goal_steps" USING btree ("user_id","due_on") WHERE "goal_steps"."done_at" is null;--> statement-breakpoint
ALTER TABLE "searches" ADD CONSTRAINT "searches_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "searches_event_idx" ON "searches" USING btree ("event_id") WHERE "searches"."event_id" is not null;--> statement-breakpoint
CREATE POLICY "goal_steps_owner_select" ON "goal_steps" AS PERMISSIVE FOR SELECT TO "authenticated" USING (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "goal_steps_owner_insert" ON "goal_steps" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "goal_steps_owner_update" ON "goal_steps" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "goal_steps_owner_delete" ON "goal_steps" AS PERMISSIVE FOR DELETE TO "authenticated" USING (user_id = (select auth.uid()));--> statement-breakpoint
-- Hand-written: goal steps and room preps stay inside the account and the Space.
create trigger goal_steps_updated_at before update on public.goal_steps
  for each row execute function public.set_updated_at();
--> statement-breakpoint
create trigger goal_steps_refs before insert or update on public.goal_steps
  for each row execute function public.enforce_owned_refs('goal_id', 'goals', 'search_id', 'searches');
--> statement-breakpoint
drop trigger if exists searches_refs on public.searches;
--> statement-breakpoint
create trigger searches_refs before insert or update on public.searches
  for each row execute function public.enforce_owned_refs('space_id', 'spaces', 'event_id', 'events');
--> statement-breakpoint
create or replace function public.check_search_event() returns trigger
language plpgsql as $$
begin
  if new.event_id is not null and public.space_of('events', new.event_id) is distinct from new.space_id then
    raise exception 'inroads: room is in a different Space' using errcode = '23514';
  end if;
  return new;
end $$;
--> statement-breakpoint
create trigger searches_event before insert or update of event_id, space_id on public.searches
  for each row execute function public.check_search_event();
--> statement-breakpoint
revoke all on public.goal_steps from anon;
