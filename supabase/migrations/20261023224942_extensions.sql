-- Extensions used by the core schema. Supabase has these available; plain Postgres needs contrib.
create extension if not exists citext;
create extension if not exists pg_trgm;
create extension if not exists pgcrypto;
