# HRplus — Saudi HR, payroll & invoicing platform

A full-stack HR system for Saudi SMEs: employee directory, attendance with geofencing,
leave, WPS payroll with GOSI, ZATCA Phase-2 e-invoicing, expenses, assets, documents,
policies, support and chat — bilingual (English / العربية, RTL) with a light/dark theme.

* **Frontend** — React 19 + TypeScript + Vite 7 + Tailwind 4, route-level code splitting.
* **Backend** — Vercel serverless functions in `/api` (role-scoped REST + an action router)
  on top of Supabase (Postgres, Auth, Storage).
* **Domain logic** — `api/_saudi.js` (working days, GOSI, leave maths, Hijri/Riyadh time),
  `api/_zatca.js` (UBL 2.1 XML, SHA-256 hash chain, ECDSA signature, TLV QR).

---

## Quick start (no cloud account needed)

```bash
npm install
npm run dev:all
```

Open http://localhost:5173 and sign in with any demo account (the login screen has
“Use demo … account” buttons):

| Role | Email | Phone |
| --- | --- | --- |
| Admin (HR) | `admin@hrplus.sa` | +966500000001 |
| Employee | `employee@hrplus.sa` | +966500000003 |
| Vendor (client portal) | `vendor@hrplus.sa` | +966500000005 |

Any password is accepted in demo mode (the UI's demo buttons fill `HRplus@2026`).

`dev:all` starts two processes:

1. **`dev/server.mjs`** — a local API server on port 8787 that serves the *real* handlers
   from `/api` unchanged.
2. **Vite** on port 5173, proxying `/api/*` to the local server.

On first boot the local server seeds a complete dataset by running the project's own
seeder (`api/seed.js`): 60 employees, 10 weeks of attendance, 12 months of payroll
(720 payslips), 23 signed tax invoices, expenses, assets, policies, chat and audit logs.
The database is a JSON file at `.data/db.json` (git-ignored).

### How the local backend works

`dev/` contains a small emulator of the Supabase surface the API uses — a chainable
query builder (`select/insert/update/delete`, `eq/neq/in/is/gt/gte/lt/lte/ilike/not/or/
contains`, `order/limit/range`, `single/maybeSingle`, `count`/`head`, embedded relations
such as `*, employees(full_name)`), storage objects (uploads become data URLs) and
GoTrue session lookups. A module resolve hook (`dev/hooks.mjs`) swaps
`@supabase/supabase-js` for it, so **no handler in `/api` is modified** and business
logic cannot drift between demo and production.

Reference rows that live in the upstream project's SQL migrations (company profile,
clients, leave types, holidays, expense categories, policy rules, FAQs) are created by
`dev/base-seed.mjs` before the app seeder runs.

### Scripts

| Script | What it does |
| --- | --- |
| `npm run dev:all` | Local API + Vite together (recommended) |
| `npm run dev` | Vite only (expects an API on `VITE_DEMO_API_URL`, or real Supabase) |
| `npm run dev:api` | Local API server only |
| `npm run build` | `tsc -b` type-check + production build |
| `npm run preview` | Serve the production build |
| `npm run lint` | ESLint (0 errors; `any` at API boundaries is a warning) |
| `npm run test:api` | 65 end-to-end API checks covering every handler: RBAC, leave, expenses, geofence, payroll (incl. the delete guard), ZATCA, backup **create → restore round trip**, chat, tickets, user provisioning, approval races, self-approval, state machines |
| `npm run test:seed` | Replays every seed step in a throwaway store and asserts nothing is duplicated |
| `npm run test:unit` | Fast unit checks: date helpers (5 timezones), `.docx` package integrity, ZATCA QR TLV |
| `node dev/audit-contract.mjs` | Fails if the UI calls an action/resource the API doesn't implement; warns about handlers with no authorisation guard; reports which handlers the API suite actually exercises |
| `npm run test:rls` | Applies the migrations to a throwaway database with real Supabase roles and asserts what `anon` / `authenticated` / `service_role` can actually see and write |
| `npm run test:schema` | Applies the migrations to `$DATABASE_URL`, then diffs the schema against every table/column the app uses and round-trips the seed data |
| `npm run test:e2e` | Playwright: signs in as all 3 roles and walks all 15 routes, failing on console errors or 4xx/5xx API calls |
| `npm run db:reset` | Delete `.data/db.json` (re-seeds on next boot) |
| `npm run db:seed` | Seed without starting the server |
| `npm run db:migrate` | Apply `supabase/migrations/*.sql` to `$DATABASE_URL` |

---

## Running against a real Supabase project

1. Create the schema — the migrations are in this repo and are the single source of truth
   for every table, index, foreign key, RLS policy and storage bucket the API uses:

```bash
export DATABASE_URL="postgres://postgres:<password>@db.<project>.supabase.co:5432/postgres"
npm run db:migrate          # supabase/migrations/0001_init.sql + 0002_storage.sql
npm run test:schema         # proves the schema matches the code and loads the seed data
```

`0001_init.sql` creates 28 tables (77 indexes, 22 foreign keys), enables RLS on all of
them and revokes `anon`/`authenticated` — the API only uses the service-role key, so the
browser cannot reach the database directly. `0002_storage.sql` creates the `receipts`,
`branding`, `backups` and `documents` buckets with size/MIME limits and owner-scoped
policies.

2. Copy `.env.example` → `.env.local` and set:

```bash
VITE_DEMO_MODE=0
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

3. Server-side variables (Vercel project settings — never in the frontend):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co   # SUPABASE_URL / VITE_SUPABASE_URL also accepted
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
```

4. Seed the project once: insert `secrets.seed_token`, then `POST /api/seed` with
   `{ "token": "…", "step": "core" | "history" | "finance" | "social" | "finish" }`
   in that order (`finish` deletes the token).

Optional integrations: `VITE_GOOGLE_CLIENT_ID` + `VITE_GOOGLE_AUTH_PROXY` for Google
sign-in, and per-company webhooks configured in Company Setup.

---

## API surface

| Endpoint | Purpose |
| --- | --- |
| `GET /api/me` | Session, profile, linked employee/vendor, branding. `?public=1` for the login screen |
| `GET/POST/PUT/DELETE /api/data?resource=…` | Generic resource router; every read is role-scoped server-side (admin = all, employee = own records, vendor = own invoices/timesheets) |
| `POST /api/actions` | 40 business actions (attendance punch, leave request/decide, expense chain, payroll run/finalize, invoice create/send, backups, chat, tickets, MFA sync, API keys …) |
| `POST /api/upload` | Receipts (admin/employee, 3 MB, png/jpeg/webp/pdf) and branding (admin, 2 MB, + svg). Content is sniffed from the bytes, not trusted from the `Content-Type` header, and SVGs with scripts or external references are refused |
| `GET/POST/PUT/DELETE /api/rest` | Integration API authenticated by `X-API-Key: hrp_…` with `read`/`write` scopes. Master data (`employees`, `vendors`) cannot be deleted through it, and records with payroll/attendance history are protected from deletion everywhere |
| `POST /api/upload` | Base64 upload to `receipts` (3 MB, private) or `branding` (2 MB, public) with MIME allow-lists |
| `POST /api/auth-phone` | Phone + password sign-in (rate-limited, 10 attempts / 10 min / IP) |
| `GET/POST /api/rest` | API-key authenticated REST for integrations (`hrp_…` keys, read/write scopes) |
| `POST /api/seed` | One-time, token-guarded bootstrap seeder |

Security measures already in place: JWT validation on every call, session idle timeout
(default 30 min, company-configurable), AAL2 check when MFA is enrolled, audit log on
every mutation, server-side role scoping, and parameter allow-lists on writes.

---

## Project layout

```
api/                 Vercel serverless functions
  _lib.js            auth, audit, notifications, webhooks, CORS, errors
  _saudi.js          GOSI, working days, leave/period maths (Riyadh tz)
  _zatca.js          ZATCA Phase-2 signing (UBL 2.1, hash chain, QR)
  data.js            role-scoped resource router
  actions.js         business action router
  seed.js            bootstrap seeder
dev/                 local backend emulator + tests (dev only, never deployed)
src/
  lib/               api client, auth, prefs (i18n/theme), format, exporters, templates
  components/        shell/nav, UI kit, charts, print/document renderer
  pages/             15 screens (dashboard, attendance, leave, directory, payroll, …)
```

## Notes

* Currency is SAR with Hijri dates alongside Gregorian; workdays default to Sun–Thu.
* GOSI base is basic + housing, floored at SAR 1,500 and capped at SAR 45,000;
  Saudis 9.75% employee / 11.75% employer, expats 2% employer only (configurable).
* Payroll locks a period once finalized; re-running a locked period returns 409.
* Invoices are ZATCA Phase-2 compliant: monotonically increasing ICV, previous-invoice
  hash chain, ECDSA signature and TLV base64 QR code.
