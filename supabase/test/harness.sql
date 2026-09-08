-- Just enough Supabase to run schema.sql on a plain Postgres.
--
-- schema.sql leans on two things Supabase provides: the auth.users table that
-- owner references, and auth.uid() for the row-level policies. Both are stubbed
-- here so the real schema -- not a copy of it, the file that is deployed -- can
-- be loaded into a throwaway database and have its rules tested.

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid()
);

-- Whoever the test says is signed in.
create or replace function auth.uid() returns uuid
language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;

create or replace function auth.set_uid(u uuid) returns void
language sql as $$ select set_config('test.uid', coalesce(u::text, ''), false); select null::void $$;

-- The roles schema.sql grants to.
do $$ begin create role anon;          exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role;  exception when duplicate_object then null; end $$;
