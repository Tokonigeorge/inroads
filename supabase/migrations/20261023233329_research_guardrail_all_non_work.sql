-- Full research is a Work-only feature: Personal, Dating and Other ("custom") Spaces can use
-- "Get to know" or nothing. Replaces the rule from functions_and_triggers.
create or replace function public.enforce_space_research_mode() returns trigger
language plpgsql as $$
begin
  if new.kind <> 'work' and new.defaults ->> 'researchMode' = 'full' then
    raise exception 'inroads: full research is only available in Work Spaces' using errcode = '23514';
  end if;
  return new;
end $$;
--> statement-breakpoint
-- A Space's type decides its guardrails, so it can't change after creation.
create or replace function public.prevent_space_kind_change() returns trigger
language plpgsql as $$
begin
  if new.kind is distinct from old.kind then
    raise exception 'inroads: a Space''s type can''t be changed' using errcode = '23514';
  end if;
  return new;
end $$;
--> statement-breakpoint
create trigger spaces_kind_fixed before update of kind on public.spaces
  for each row execute function public.prevent_space_kind_change();
