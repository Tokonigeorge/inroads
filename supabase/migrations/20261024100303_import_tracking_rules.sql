-- New references must also point at the same account's rows.
create trigger people_import_ref before insert or update of import_id on public.people
  for each row execute function public.enforce_owned_refs('import_id', 'imports');
--> statement-breakpoint
create trigger interactions_import_ref before insert or update of import_id on public.interactions
  for each row execute function public.enforce_owned_refs('import_id', 'imports');
--> statement-breakpoint
create trigger events_import_ref before insert or update of import_id on public.events
  for each row execute function public.enforce_owned_refs('import_id', 'imports');
--> statement-breakpoint
create trigger imports_connection_ref before insert or update of connection_id on public.imports
  for each row execute function public.enforce_owned_refs('connection_id', 'connections');
--> statement-breakpoint
create index if not exists people_import_idx on public.people (import_id) where import_id is not null;
--> statement-breakpoint
create index if not exists interactions_import_idx on public.interactions (import_id) where import_id is not null;
--> statement-breakpoint
create index if not exists people_external_refs_idx on public.people using gin (external_refs jsonb_path_ops);
