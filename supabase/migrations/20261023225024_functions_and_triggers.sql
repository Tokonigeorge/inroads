-- Hand-written: triggers, integrity checks, new-user bootstrap and grants.
-- See docs/TECH_PLAN.md §2.2–2.3. Every check function runs as the caller (SECURITY INVOKER),
-- so under RLS a row that belongs to someone else is simply invisible and the check fails.

-- 1. updated_at ------------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
--> statement-breakpoint
do $$
declare t text;
begin
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'updated_at' and tb.table_type = 'BASE TABLE'
  loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated_at', t);
  end loop;
end $$;
--> statement-breakpoint

-- 2. References must point at the same user's rows -------------------------------------------
-- Usage: enforce_owned_refs('col', 'table', 'col2', 'table2', ...)
create or replace function public.enforce_owned_refs() returns trigger
language plpgsql as $$
declare
  i int := 0;
  col text;
  tbl text;
  ref uuid;
  ref_owner uuid;
begin
  while i < tg_nargs loop
    col := tg_argv[i];
    tbl := tg_argv[i + 1];
    i := i + 2;
    ref := (to_jsonb(new) ->> col)::uuid;
    continue when ref is null;
    execute format('select user_id from public.%I where id = $1', tbl) into ref_owner using ref;
    if ref_owner is distinct from new.user_id then
      raise exception 'inroads: % does not belong to this account', tbl using errcode = '42501';
    end if;
  end loop;
  return new;
end $$;
--> statement-breakpoint

-- 3. Spaces stay sealed: a person can only be linked to things in a Space they belong to ------
create or replace function public.assert_person_in_space(p_person uuid, p_space uuid) returns void
language plpgsql as $$
begin
  if p_person is null or p_space is null then
    return;
  end if;
  if not exists (
    select 1 from public.person_spaces ps where ps.person_id = p_person and ps.space_id = p_space
  ) then
    raise exception 'inroads: person is not in this Space' using errcode = '23514';
  end if;
end $$;
--> statement-breakpoint
create or replace function public.space_of(p_table text, p_id uuid) returns uuid
language plpgsql stable as $$
declare s uuid;
begin
  if p_id is null then
    return null;
  end if;
  execute format('select space_id from public.%I where id = $1', p_table) into s using p_id;
  return s;
end $$;
--> statement-breakpoint
create or replace function public.check_space_membership() returns trigger
language plpgsql as $$
begin
  case tg_table_name
    when 'interactions' then
      perform public.assert_person_in_space(new.person_id, new.space_id);
      if new.event_id is not null and public.space_of('events', new.event_id) is distinct from new.space_id then
        raise exception 'inroads: event is in a different Space' using errcode = '23514';
      end if;
    when 'commitments', 'dossiers' then
      perform public.assert_person_in_space(new.person_id, new.space_id);
    when 'event_people' then
      perform public.assert_person_in_space(new.person_id, public.space_of('events', new.event_id));
    when 'goal_links' then
      perform public.assert_person_in_space(new.person_id, public.space_of('goals', new.goal_id));
    when 'scores' then
      perform public.assert_person_in_space(new.person_id, public.space_of('goals', new.goal_id));
    when 'person_links' then
      perform public.assert_person_in_space(new.from_person_id, new.space_id);
      perform public.assert_person_in_space(new.to_person_id, new.space_id);
    when 'person_spaces' then
      if new.circle_id is not null and public.space_of('circles', new.circle_id) is distinct from new.space_id then
        raise exception 'inroads: circle is in a different Space' using errcode = '23514';
      end if;
    when 'events' then
      if new.goal_id is not null and public.space_of('goals', new.goal_id) is distinct from new.space_id then
        raise exception 'inroads: goal is in a different Space' using errcode = '23514';
      end if;
    else
      null;
  end case;
  return new;
end $$;
--> statement-breakpoint

create trigger person_spaces_refs before insert or update on public.person_spaces
  for each row execute function public.enforce_owned_refs('person_id', 'people', 'space_id', 'spaces', 'circle_id', 'circles');
--> statement-breakpoint
create trigger person_spaces_space before insert or update on public.person_spaces
  for each row execute function public.check_space_membership();
--> statement-breakpoint
create trigger person_links_refs before insert or update on public.person_links
  for each row execute function public.enforce_owned_refs('from_person_id', 'people', 'to_person_id', 'people', 'space_id', 'spaces');
--> statement-breakpoint
create trigger person_links_space before insert or update on public.person_links
  for each row execute function public.check_space_membership();
--> statement-breakpoint
create trigger people_refs before insert or update on public.people
  for each row execute function public.enforce_owned_refs('merged_into_id', 'people');
--> statement-breakpoint
create trigger circles_refs before insert or update on public.circles
  for each row execute function public.enforce_owned_refs('space_id', 'spaces');
--> statement-breakpoint
create trigger goals_refs before insert or update on public.goals
  for each row execute function public.enforce_owned_refs('space_id', 'spaces');
--> statement-breakpoint
create trigger events_refs before insert or update on public.events
  for each row execute function public.enforce_owned_refs('space_id', 'spaces', 'goal_id', 'goals', 'connection_id', 'connections');
--> statement-breakpoint
create trigger events_space before insert or update on public.events
  for each row execute function public.check_space_membership();
--> statement-breakpoint
create trigger event_people_refs before insert or update on public.event_people
  for each row execute function public.enforce_owned_refs('event_id', 'events', 'person_id', 'people');
--> statement-breakpoint
create trigger event_people_space before insert or update on public.event_people
  for each row execute function public.check_space_membership();
--> statement-breakpoint
create trigger event_attendance_refs before insert or update on public.event_attendance
  for each row execute function public.enforce_owned_refs('event_id', 'events');
--> statement-breakpoint
create trigger interactions_refs before insert or update on public.interactions
  for each row execute function public.enforce_owned_refs('person_id', 'people', 'space_id', 'spaces', 'event_id', 'events');
--> statement-breakpoint
create trigger interactions_space before insert or update on public.interactions
  for each row execute function public.check_space_membership();
--> statement-breakpoint
create trigger commitments_refs before insert or update on public.commitments
  for each row execute function public.enforce_owned_refs('person_id', 'people', 'space_id', 'spaces', 'interaction_id', 'interactions');
--> statement-breakpoint
create trigger commitments_space before insert or update on public.commitments
  for each row execute function public.check_space_membership();
--> statement-breakpoint
create trigger goal_links_refs before insert or update on public.goal_links
  for each row execute function public.enforce_owned_refs('goal_id', 'goals', 'person_id', 'people');
--> statement-breakpoint
create trigger goal_links_space before insert or update on public.goal_links
  for each row execute function public.check_space_membership();
--> statement-breakpoint
create trigger goal_link_history_refs before insert or update on public.goal_link_history
  for each row execute function public.enforce_owned_refs('goal_link_id', 'goal_links');
--> statement-breakpoint
create trigger dossiers_refs before insert or update on public.dossiers
  for each row execute function public.enforce_owned_refs('person_id', 'people', 'space_id', 'spaces');
--> statement-breakpoint
create trigger dossiers_space before insert or update on public.dossiers
  for each row execute function public.check_space_membership();
--> statement-breakpoint
create trigger scores_refs before insert or update on public.scores
  for each row execute function public.enforce_owned_refs('person_id', 'people', 'goal_id', 'goals');
--> statement-breakpoint
create trigger scores_space before insert or update on public.scores
  for each row execute function public.check_space_membership();
--> statement-breakpoint
create trigger searches_refs before insert or update on public.searches
  for each row execute function public.enforce_owned_refs('space_id', 'spaces');
--> statement-breakpoint
create trigger briefs_refs before insert or update on public.briefs
  for each row execute function public.enforce_owned_refs('space_id', 'spaces');
--> statement-breakpoint
create trigger suggestions_refs before insert or update on public.suggestions
  for each row execute function public.enforce_owned_refs('space_id', 'spaces');
--> statement-breakpoint
create trigger imports_refs before insert or update on public.imports
  for each row execute function public.enforce_owned_refs('space_id', 'spaces');
--> statement-breakpoint
create trigger import_items_refs before insert or update on public.import_items
  for each row execute function public.enforce_owned_refs('import_id', 'imports', 'match_person_id', 'people');
--> statement-breakpoint

-- 4. Denormalised last touch -----------------------------------------------------------------
create or replace function public.refresh_last_touched(p_person uuid, p_space uuid) returns void
language sql as $$
  update public.people p
     set last_touched_on = (select max(i.occurred_on) from public.interactions i where i.person_id = p_person)
   where p.id = p_person;
  update public.person_spaces ps
     set last_touched_on = (
       select max(i.occurred_on) from public.interactions i where i.person_id = p_person and i.space_id = p_space
     )
   where ps.person_id = p_person and ps.space_id = p_space;
$$;
--> statement-breakpoint
create or replace function public.interactions_touch() returns trigger
language plpgsql as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.refresh_last_touched(old.person_id, old.space_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.refresh_last_touched(new.person_id, new.space_id);
  end if;
  return null;
end $$;
--> statement-breakpoint
create trigger interactions_last_touched after insert or update or delete on public.interactions
  for each row execute function public.interactions_touch();
--> statement-breakpoint

-- 5. Pipeline history (owner can only read history, so this writes as the table owner) -------
create or replace function public.goal_links_history() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.stage is distinct from old.stage then
    insert into public.goal_link_history (user_id, goal_link_id, from_stage, to_stage)
    values (new.user_id, new.id, case when tg_op = 'UPDATE' then old.stage end, new.stage);
  end if;
  return null;
end $$;
--> statement-breakpoint
create trigger goal_links_history after insert or update of stage on public.goal_links
  for each row execute function public.goal_links_history();
--> statement-breakpoint

-- 6. Space defaults and the research guardrail ------------------------------------------------
-- Keep in sync with src/contracts/spaces.ts (a unit test checks they match).
create or replace function public.default_space_defaults(p_kind public.space_kind) returns jsonb
language sql immutable as $$
  select case p_kind
    when 'work' then jsonb_build_object(
      'cadenceDays', 30,
      'researchMode', 'full',
      'stages', jsonb_build_array(
        jsonb_build_object('key', 'identified', 'label', 'Identified'),
        jsonb_build_object('key', 'warm_path', 'label', 'Warm path found'),
        jsonb_build_object('key', 'introduced', 'label', 'Introduced'),
        jsonb_build_object('key', 'met', 'label', 'Met'),
        jsonb_build_object('key', 'in_conversation', 'label', 'In conversation'),
        jsonb_build_object('key', 'won', 'label', 'Won', 'closed', true),
        jsonb_build_object('key', 'closed', 'label', 'Closed', 'closed', true)))
    when 'personal' then jsonb_build_object(
      'cadenceDays', 21,
      'researchMode', 'get_to_know',
      'stages', jsonb_build_array(
        jsonb_build_object('key', 'want_to_know', 'label', 'Want to get to know'),
        jsonb_build_object('key', 'met', 'label', 'Met'),
        jsonb_build_object('key', 'spent_time', 'label', 'Spent time together'),
        jsonb_build_object('key', 'regular', 'label', 'See regularly'),
        jsonb_build_object('key', 'close', 'label', 'Close', 'closed', true)))
    when 'dating' then jsonb_build_object(
      'cadenceDays', 7,
      'researchMode', 'get_to_know',
      'stages', jsonb_build_array(
        jsonb_build_object('key', 'matched', 'label', 'Matched'),
        jsonb_build_object('key', 'talking', 'label', 'Talking'),
        jsonb_build_object('key', 'first_date', 'label', 'First date'),
        jsonb_build_object('key', 'seeing', 'label', 'Seeing each other'),
        jsonb_build_object('key', 'exclusive', 'label', 'Exclusive', 'closed', true),
        jsonb_build_object('key', 'ended', 'label', 'Ended', 'closed', true)))
    else jsonb_build_object(
      'cadenceDays', 30,
      'researchMode', 'get_to_know',
      'stages', jsonb_build_array(
        jsonb_build_object('key', 'identified', 'label', 'Identified'),
        jsonb_build_object('key', 'met', 'label', 'Met'),
        jsonb_build_object('key', 'in_touch', 'label', 'In touch'),
        jsonb_build_object('key', 'done', 'label', 'Done', 'closed', true)))
  end
$$;
--> statement-breakpoint
create or replace function public.enforce_space_research_mode() returns trigger
language plpgsql as $$
begin
  if new.kind in ('personal', 'dating') and new.defaults ->> 'researchMode' = 'full' then
    raise exception 'inroads: full research is not allowed in Personal or Dating Spaces' using errcode = '23514';
  end if;
  return new;
end $$;
--> statement-breakpoint
create trigger spaces_research_mode before insert or update on public.spaces
  for each row execute function public.enforce_space_research_mode();
--> statement-breakpoint

-- 7. New account bootstrap: profile + the three built-in Spaces --------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  insert into public.profiles (user_id, name, emails)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    case when new.email is null then '{}'::citext[] else array[lower(new.email)]::citext[] end
  )
  on conflict (user_id) do nothing;

  insert into public.spaces (user_id, name, kind, position, defaults) values
    (new.id, 'Work', 'work', 0, public.default_space_defaults('work')),
    (new.id, 'Personal', 'personal', 1, public.default_space_defaults('personal')),
    (new.id, 'Dating', 'dating', 2, public.default_space_defaults('dating'))
  on conflict (user_id, name) do nothing;
  return new;
end $$;
--> statement-breakpoint
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
--> statement-breakpoint

-- 8. Grants: the browser never reads tables directly, and nobody reads OAuth secrets ----------
revoke all on all tables in schema public from anon;
--> statement-breakpoint
revoke all on all sequences in schema public from anon;
--> statement-breakpoint
revoke select on public.connections from authenticated;
--> statement-breakpoint
grant select (id, user_id, provider, account_email, scopes, sync_state, last_synced_at, status, last_error, created_at, updated_at)
  on public.connections to authenticated;
