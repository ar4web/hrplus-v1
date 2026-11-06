-- =============================================================================
-- HRplus — initial schema
-- Derived from every table/column the API in /api actually reads or writes.
-- Apply with:  psql "$DATABASE_URL" -f supabase/migrations/0001_init.sql
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- company (single row, id = 1)
-- ---------------------------------------------------------------------------
create table if not exists company (
  id                integer primary key default 1 check (id = 1),
  legal_name_en     text not null,
  legal_name_ar     text,
  trade_name_en     text,
  trade_name_ar     text,
  vat_number        text check (vat_number is null or vat_number ~ '^3[0-9]{13}3$'),
  cr_number         text,
  street            text,
  building_no       text,
  district          text,
  city              text default 'Riyadh',
  postal_code       text,
  country           text default 'SA',
  phone             text,
  email             text,
  website           text,
  logo_url          text,
  primary_color     text,
  secondary_color   text,
  branch_name       text,
  geofence_lat      double precision,
  geofence_lng      double precision,
  geofence_radius   integer default 200,
  working_hours     jsonb default '{"start":"08:00","end":"17:00","days":[0,1,2,3,4]}'::jsonb,
  settings          jsonb default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
drop trigger if exists company_updated_at on company;
create trigger company_updated_at before update on company for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- vendors (clients + suppliers)
-- ---------------------------------------------------------------------------
create table if not exists vendors (
  id             serial primary key,
  name           text not null,
  name_ar        text,
  type           text not null default 'client' check (type in ('client', 'supplier')),
  email          text,
  phone          text,
  vat_number     text,
  cr_number      text,
  address        text,
  city           text,
  country        text default 'SA',
  billable_rate  numeric(12,2) default 0,
  payment_terms  integer default 30,
  status         text default 'active',
  created_at     timestamptz not null default now()
);
create index if not exists vendors_type_idx on vendors (type);
create unique index if not exists vendors_name_uniq on vendors (lower(name));

-- ---------------------------------------------------------------------------
-- employees
-- ---------------------------------------------------------------------------
create table if not exists employees (
  id                    text primary key,
  full_name             text not null,
  full_name_ar          text,
  email                 text,
  phone                 text,
  gender                text,
  age                   integer,
  department            text,
  job_title             text,
  location              text,
  hire_date             date not null,
  employment_type       text,
  status                text default 'Active' check (status in ('Active', 'On Leave', 'Terminated', 'Suspended')),
  nationality           text,
  is_saudi              boolean default false,
  iqama_number          text,
  iqama_expiry          date,
  iqama_renewal_status  text,
  annual_salary         numeric(12,2),
  bonus                 numeric(12,2) default 0,
  basic_salary          numeric(12,2),
  housing_allowance     numeric(12,2),
  transport_allowance   numeric(12,2),
  other_allowance       numeric(12,2),
  primary_client        text,
  bank_code             text,
  iban                  text,
  created_at            timestamptz not null default now()
);
create unique index if not exists employees_email_uniq on employees (lower(email)) where email is not null;
create index if not exists employees_department_idx on employees (department);
create index if not exists employees_status_idx on employees (status);

-- ---------------------------------------------------------------------------
-- profiles (auth mapping: one row per Supabase user, or pre-created to claim)
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id            serial primary key,
  user_id       uuid unique,                          -- Supabase auth uid; must be uuid for auth.uid() policies to match
  email         text not null,
  role          text not null default 'employee' check (role in ('admin', 'employee', 'vendor')),
  employee_id   text references employees (id) on delete set null,
  vendor_id     integer references vendors (id) on delete set null,
  display_name  text,
  phone         text,
  status        text not null default 'active' check (status in ('active', 'pending', 'disabled')),
  prefs         jsonb default '{}'::jsonb,
  mfa_enabled   boolean default false,
  session_id    text,
  last_seen     timestamptz,
  created_at    timestamptz not null default now()
);
create unique index if not exists profiles_email_uniq on profiles (lower(email));
create unique index if not exists profiles_phone_uniq on profiles (phone) where phone is not null;
create index if not exists profiles_role_idx on profiles (role);

-- ---------------------------------------------------------------------------
-- reference / policy tables
-- ---------------------------------------------------------------------------
create table if not exists leave_types (
  id                serial primary key,
  code              text not null unique,
  name_en           text not null,
  name_ar           text not null,
  color             text default '#0fa89a',
  paid              boolean default true,
  annual_days       numeric(5,1) default 0,
  days_after_5y     numeric(5,1),
  calendar_days     boolean default false,
  notice_days       integer default 0,
  max_consecutive   integer,
  requires_document boolean default false,
  gender            text,
  active            boolean default true,
  created_at        timestamptz not null default now()
);

create table if not exists holidays (
  id         serial primary key,
  date       date not null unique,
  name_en    text not null,
  name_ar    text,
  created_at timestamptz not null default now()
);

create table if not exists expense_categories (
  id              serial primary key,
  code            text not null unique,
  name_en         text not null,
  name_ar         text not null,
  color           text default '#d9467b',
  cap_per_claim   numeric(12,2),
  monthly_budget  numeric(12,2),
  active          boolean default true,
  created_at      timestamptz not null default now()
);

create table if not exists rules (
  id           serial primary key,
  version      integer not null default 1,
  category     text default 'General',
  title_en     text not null,
  title_ar     text not null,
  body_en      text not null,
  body_ar      text not null,
  active       boolean default true,
  published_at timestamptz,
  history      jsonb default '[]'::jsonb,
  created_at   timestamptz not null default now()
);

create table if not exists faqs (
  id          serial primary key,
  question_en text not null,
  question_ar text not null,
  answer_en   text not null,
  answer_ar   text not null,
  category    text default 'General',
  context     text,
  active      boolean default true,
  created_at  timestamptz not null default now()
);

create table if not exists app_links (
  id         serial primary key,
  title_en   text not null,
  title_ar   text,
  url        text not null check (url ~* '^https?://'),
  category   text default 'General',
  active     boolean default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- time & leave
-- ---------------------------------------------------------------------------
create table if not exists timesheets (
  id              text primary key,
  date            date not null,
  employee_id     text not null references employees (id) on delete restrict,
  vendor_id       integer references vendors (id) on delete set null,
  project         text,
  regular_hours   numeric(6,2) not null default 0 check (regular_hours >= 0),
  overtime_hours  numeric(6,2) not null default 0 check (overtime_hours >= 0),
  bill_rate       numeric(12,2) not null default 0 check (bill_rate >= 0),
  status          text not null default 'Submitted' check (status in ('Submitted', 'Pending Review', 'Approved', 'Rejected')),
  decided_at      timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists timesheets_employee_idx on timesheets (employee_id, date);
create index if not exists timesheets_vendor_idx on timesheets (vendor_id, status);
create index if not exists timesheets_status_idx on timesheets (status);

create table if not exists attendance (
  id          serial primary key,
  employee_id text not null references employees (id) on delete restrict,
  date        date not null,
  check_in    timestamptz,
  check_out   timestamptz,
  status      text not null default 'present' check (status in ('present', 'late', 'absent', 'leave', 'holiday')),
  lat         double precision,
  lng         double precision,
  distance_m  integer,
  remote      boolean default false,
  source      text default 'online' check (source in ('online', 'offline', 'system')),
  created_at  timestamptz not null default now(),
  unique (employee_id, date)
);
create index if not exists attendance_date_idx on attendance (date);
create index if not exists attendance_employee_idx on attendance (employee_id, date);

create table if not exists leave_requests (
  id            serial primary key,
  employee_id   text not null references employees (id) on delete restrict,
  type_id       integer not null references leave_types (id) on delete restrict,
  start_date    date not null,
  end_date      date not null,
  days          numeric(6,1) not null check (days >= 0),
  reason        text,
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by    text,
  decision_note text,
  decided_at    timestamptz,
  created_at    timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists leave_requests_employee_idx on leave_requests (employee_id, status);
create index if not exists leave_requests_dates_idx on leave_requests (start_date, end_date);
create index if not exists leave_requests_status_idx on leave_requests (status);

-- ---------------------------------------------------------------------------
-- payroll
-- ---------------------------------------------------------------------------
create table if not exists payroll_runs (
  id           serial primary key,
  period       text not null unique check (period ~ '^[0-9]{4}-[0-9]{2}$'),
  status       text not null default 'draft' check (status in ('draft', 'approved', 'paid')),
  totals       jsonb default '{}'::jsonb,
  finalized_at timestamptz,
  created_at   timestamptz not null default now()
);

create table if not exists payslips (
  id               serial primary key,
  run_id           integer not null references payroll_runs (id) on delete cascade,
  employee_id      text not null references employees (id) on delete restrict,
  period           text not null,
  basic            numeric(12,2) not null default 0,
  housing          numeric(12,2) not null default 0,
  transport        numeric(12,2) not null default 0,
  other_allowance  numeric(12,2) not null default 0,
  overtime         numeric(12,2) not null default 0,
  bonus            numeric(12,2) not null default 0,
  gross            numeric(12,2) not null default 0,
  gosi_base        numeric(12,2) not null default 0,
  gosi_employee    numeric(12,2) not null default 0,
  gosi_employer    numeric(12,2) not null default 0,
  deductions       numeric(12,2) not null default 0,
  net              numeric(12,2) not null default 0,
  payment_method   text default 'WPS Bank Transfer',
  status           text not null default 'draft' check (status in ('draft', 'approved', 'paid', 'void')),
  created_at       timestamptz not null default now(),
  unique (employee_id, period)
);
create index if not exists payslips_period_idx on payslips (period);
create index if not exists payslips_employee_idx on payslips (employee_id, period);

-- ---------------------------------------------------------------------------
-- invoicing (ZATCA Phase 2)
-- ---------------------------------------------------------------------------
create table if not exists invoices (
  id          serial primary key,
  number      text not null unique,
  uuid        uuid not null unique,
  icv         integer not null unique,                 -- monotonic counter; the unique index is what keeps it honest
  prev_hash   text not null,                           -- previous-invoice hash (PIH) chain
  issue_date  date not null,
  issue_time  text not null,
  type        text not null default 'B2B' check (type in ('B2B', 'B2C')),
  buyer       jsonb not null default '{}'::jsonb,
  lines       jsonb not null default '[]'::jsonb,
  subtotal    numeric(14,2) not null default 0,
  vat         numeric(14,2) not null default 0,
  total       numeric(14,2) not null default 0,
  vendor_id   integer references vendors (id) on delete set null,
  due_date    date,
  design      text default 'classic',
  status      text not null default 'issued' check (status in ('issued', 'sent', 'paid', 'void')),
  notes       text,
  sent_via    jsonb default '[]'::jsonb,
  hash        text,
  signature   text,
  qr          text,
  xml         text,
  created_at  timestamptz not null default now()
);
create index if not exists invoices_vendor_idx on invoices (vendor_id, issue_date);
create index if not exists invoices_status_idx on invoices (status);
create index if not exists invoices_issue_date_idx on invoices (issue_date);

-- ---------------------------------------------------------------------------
-- expenses & assets
-- ---------------------------------------------------------------------------
create table if not exists expenses (
  id              serial primary key,
  employee_id     text not null references employees (id) on delete restrict,
  category_id     integer not null references expense_categories (id) on delete restrict,
  amount          numeric(12,2) not null check (amount > 0),
  vat_amount      numeric(12,2) not null default 0,
  expense_date    date not null,
  description     text not null,
  receipt_path    text,
  status          text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'paid')),
  approval_chain  jsonb not null default '[]'::jsonb,
  current_step    integer not null default 0,
  over_cap        boolean default false,
  created_at      timestamptz not null default now()
);
create index if not exists expenses_employee_idx on expenses (employee_id, status);
create index if not exists expenses_status_idx on expenses (status);

create table if not exists assets (
  id                serial primary key,
  tag               text not null unique,
  name              text not null,
  category          text,
  serial_no         text,
  assigned_to       text references employees (id) on delete set null,
  purchase_date     date,
  cost              numeric(14,2) default 0,
  salvage_value     numeric(14,2) default 0,
  useful_life_years integer,
  dep_method        text default 'straight_line',
  status            text not null default 'In Stock' check (status in ('Procured', 'In Stock', 'Assigned', 'In Repair', 'Retired', 'Disposed')),
  warranty_expiry   date,
  supplier          text,
  location          text,
  history           jsonb default '[]'::jsonb,
  created_at        timestamptz not null default now()
);
create index if not exists assets_assigned_idx on assets (assigned_to);

-- ---------------------------------------------------------------------------
-- documents, policies acknowledgement
-- ---------------------------------------------------------------------------
create table if not exists documents (
  id           serial primary key,
  template_key text not null,
  employee_id  text references employees (id) on delete cascade,
  title        text,
  lang         text default 'both' check (lang in ('en', 'ar', 'both')),
  fields       jsonb default '{}'::jsonb,
  format       text default 'print',
  created_by   text,
  created_at   timestamptz not null default now()
);
create index if not exists documents_employee_idx on documents (employee_id, created_at desc);

create table if not exists rule_acks (
  id          serial primary key,
  rule_id     integer not null references rules (id) on delete cascade,
  employee_id text not null references employees (id) on delete cascade,
  version     integer not null,
  acked_at    timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  unique (rule_id, employee_id, version)
);
create index if not exists rule_acks_employee_idx on rule_acks (employee_id);

-- ---------------------------------------------------------------------------
-- support & chat
-- ---------------------------------------------------------------------------
create table if not exists tickets (
  id         serial primary key,
  profile_id integer not null references profiles (id) on delete cascade,
  requester  text,
  subject    text not null,
  category   text default 'General',
  priority   text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status     text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  context    text,
  messages   jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists tickets_profile_idx on tickets (profile_id, updated_at desc);
create index if not exists tickets_status_idx on tickets (status);
drop trigger if exists tickets_updated_at on tickets;
create trigger tickets_updated_at before update on tickets for each row execute function set_updated_at();

create table if not exists conversations (
  id            serial primary key,
  name          text,
  is_group      boolean not null default false,
  members       integer[] not null default '{}',      -- profile ids; queried with the `cs` (contains) operator
  created_by    integer references profiles (id) on delete set null,
  reads         jsonb not null default '{}'::jsonb,
  last_message  text,
  last_sender_id integer,
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create index if not exists conversations_members_idx on conversations using gin (members);
create index if not exists conversations_updated_idx on conversations (updated_at desc);

create table if not exists messages (
  id              serial primary key,
  conversation_id integer not null references conversations (id) on delete cascade,
  sender_id       integer references profiles (id) on delete set null,
  sender_name     text,
  body            text not null check (char_length(body) between 1 and 4000),
  created_at      timestamptz not null default now()
);
create index if not exists messages_conversation_idx on messages (conversation_id, created_at desc);

-- ---------------------------------------------------------------------------
-- notifications, audit, integrations
-- ---------------------------------------------------------------------------
create table if not exists notifications (
  id         serial primary key,
  profile_id integer not null references profiles (id) on delete cascade,
  title      text not null,
  title_ar   text,
  body       text,
  body_ar    text,
  link       text,
  level      text not null default 'info' check (level in ('info', 'success', 'warning', 'action', 'error')),
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_profile_idx on notifications (profile_id, read, created_at desc);

create table if not exists audit_logs (
  id               bigserial primary key,
  actor_profile_id integer references profiles (id) on delete set null,
  actor_email      text,
  actor_role       text,
  action           text not null,
  resource         text,
  record_id        text,
  details          jsonb default '{}'::jsonb,
  ip               text,
  created_at       timestamptz not null default now()
);
create index if not exists audit_logs_created_idx on audit_logs (created_at desc);
create index if not exists audit_logs_actor_idx on audit_logs (actor_profile_id);
create index if not exists audit_logs_action_idx on audit_logs (action);

create table if not exists webhooks (
  id            serial primary key,
  url           text not null check (url ~* '^https://'),
  events        text[] not null default '{}',
  secret        text,
  active        boolean not null default true,
  last_status   text,
  last_fired_at timestamptz,
  created_at    timestamptz not null default now()
);

create table if not exists api_keys (
  id           serial primary key,
  name         text not null,
  prefix       text not null,
  key_hash     text not null unique,                   -- sha256 of the raw key; the raw key is never stored
  scopes       text[] not null default '{read}',
  revoked      boolean not null default false,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

create table if not exists secrets (
  id         serial primary key,
  key        text not null unique,
  value      text not null,
  created_at timestamptz not null default now()
);

-- The app's payroll vocabulary is draft -> approved -> paid (see payroll.finalize
-- and the Payroll page). An earlier copy of this migration allowed 'finalized' on
-- runs and no 'approved' on payslips, which the handlers and the seeder write.
-- Re-apply the constraints so an existing database converges instead of failing
-- on the first finalize.
do $$
begin
  alter table payroll_runs drop constraint if exists payroll_runs_status_check;
  alter table payroll_runs add constraint payroll_runs_status_check check (status in ('draft', 'approved', 'paid'));
  alter table payslips drop constraint if exists payslips_status_check;
  alter table payslips add constraint payslips_status_check check (status in ('draft', 'approved', 'paid', 'void'));
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- The API only ever uses the service-role key (which bypasses RLS), so RLS is
-- enabled with no anon/authenticated policies: direct browser access to the
-- database is denied by default. Add narrow policies if you ever query
-- Supabase directly from the client.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'company','vendors','employees','profiles','leave_types','holidays','expense_categories',
    'rules','faqs','app_links','timesheets','attendance','leave_requests','payroll_runs','payslips',
    'invoices','expenses','assets','documents','rule_acks','tickets','conversations','messages',
    'notifications','audit_logs','webhooks','api_keys','secrets'
  ] loop
    execute format('alter table %I enable row level security', t);
    -- the anon/authenticated roles only exist on Supabase; skip them on plain Postgres
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on %I from anon', t);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on %I from authenticated', t);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Client-side access, narrowly scoped
-- The API uses the service-role key (which bypasses RLS), so the browser never
-- queries these tables directly. Two things still need to work for a signed-in
-- user, though: reading their own profile row, and the receipt/branding storage
-- policies in 0002_storage.sql, whose expressions look up profiles.user_id. RLS
-- policy expressions run with the *invoking* role's privileges, so without the
-- grant below those storage policies would always fail with "permission denied".
-- ---------------------------------------------------------------------------
-- The API's own role must keep full access (Supabase grants this by default;
-- stating it explicitly means the schema does not depend on that default).
-- Everything in this block needs roles that only Supabase provides, so it is
-- skipped on a plain PostgreSQL (CI, local schema checks) instead of failing.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant usage on schema public to service_role';
    execute 'grant all on all tables in schema public to service_role';
    execute 'grant usage, select on all sequences in schema public to service_role';
  end if;

  if not exists (select 1 from pg_roles where rolname = 'authenticated')
     or to_regprocedure('auth.uid()') is null then
    raise notice 'Supabase auth schema/roles not found — skipping client-side access setup';
    return;
  end if;

  -- Deliberately excludes email/phone: a signed-in user may see their own row, but
  -- the profile data they need is served by /api/me, not by direct table access.
  execute $q$grant select (id, user_id, role, employee_id, vendor_id, display_name, status, mfa_enabled)
             on profiles to authenticated$q$;
  execute 'drop policy if exists profiles_self_read on profiles';
  execute 'create policy profiles_self_read on profiles for select to authenticated using (user_id = auth.uid())';
end;
$$;

-- ---------------------------------------------------------------------------
-- bootstrap rows the app assumes exist
-- ---------------------------------------------------------------------------
insert into company (id, legal_name_en) values (1, 'Your Company Name')
  on conflict (id) do nothing;
