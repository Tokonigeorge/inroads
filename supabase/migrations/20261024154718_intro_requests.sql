ALTER TABLE "commitments" ADD COLUMN "kind" text;--> statement-breakpoint
ALTER TABLE "commitments" ADD COLUMN "about_person_id" uuid;--> statement-breakpoint
ALTER TABLE "commitments" ADD COLUMN "goal_id" uuid;--> statement-breakpoint
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_about_person_id_people_id_fk" FOREIGN KEY ("about_person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "commitments_about_idx" ON "commitments" USING btree ("about_person_id") WHERE "commitments"."about_person_id" is not null;--> statement-breakpoint
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_kind_check" CHECK ("commitments"."kind" is null or ("commitments"."kind" = 'intro' and "commitments"."about_person_id" is not null));--> statement-breakpoint
-- Intro requests: the person you want to meet and the goal must be yours and in the same Space.
drop trigger if exists commitments_refs on public.commitments;
--> statement-breakpoint
create trigger commitments_refs before insert or update on public.commitments
  for each row execute function public.enforce_owned_refs('person_id', 'people', 'space_id', 'spaces', 'interaction_id', 'interactions', 'about_person_id', 'people', 'goal_id', 'goals');
--> statement-breakpoint
create or replace function public.check_intro_request() returns trigger
language plpgsql as $$
begin
  if new.about_person_id is not null then
    if new.about_person_id = new.person_id then
      raise exception 'inroads: someone can''t introduce you to themselves' using errcode = '23514';
    end if;
    perform public.assert_person_in_space(new.about_person_id, new.space_id);
  end if;
  if new.goal_id is not null and public.space_of('goals', new.goal_id) is distinct from new.space_id then
    raise exception 'inroads: goal is in a different Space' using errcode = '23514';
  end if;
  return new;
end $$;
--> statement-breakpoint
create trigger commitments_intro before insert or update of about_person_id, goal_id, space_id on public.commitments
  for each row execute function public.check_intro_request();
