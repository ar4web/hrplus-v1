-- Minimal Supabase-like scaffolding so the RLS policies and storage policies in
-- supabase/migrations can be exercised on a plain PostgreSQL instance.
-- Applied *before* the migrations by dev/check-rls.mjs (throwaway database).

-- roles are cluster-wide, so re-running against an existing cluster is fine
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end;
$$;

-- auth.uid() reads the JWT subject the way Supabase's own helper does
create schema if not exists auth;
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;

-- storage.objects / storage.buckets as the storage extension defines them
create schema if not exists storage;
create table storage.buckets (
  id text primary key,
  name text not null,
  owner uuid,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  metadata jsonb,
  created_at timestamptz default now()
);
alter table storage.objects enable row level security;

-- storage.foldername('a/b/c.txt') -> {a,b}
create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;

grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.buckets to service_role;
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.objects to anon;
