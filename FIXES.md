# What was broken, and what I changed

State on arrival: the repository did not build, could not run without a cloud Supabase
project, and had no way to verify any of it. Everything below was found by reading the
code, then confirmed by running the app in a real browser and driving the API.

> **See also [`REVIEW.md`](./REVIEW.md)** — the follow-up review passes: a full audit of
> the frontend, the API and the database layer, with the **33 defects** found and fixed
> (nine of them serious), evidence for each, and the handful of items left open on
> purpose — item by item in [`BACKLOG.md`](./BACKLOG.md).

Verification at the end of the work:

| Check | Result |
| --- | --- |
| `npm run build` (`tsc -b` + Vite) | passes, 8.1 s; react/router/motion/icons split into cacheable chunks |
| `npm run lint` | **0 errors** (779 warnings, dominated by `no-explicit-any` at API boundaries) |
| `npm run test:api` | **65/65** checks pass, exit 0, re-runnable; **42/42** handlers exercised |
| `npm run test:e2e` | **45/45** page loads clean, 0 console errors, 0 failed API calls, error boundary proven |
| `npm run test:unit` | date helpers 18/18 × 5 timezones · `.docx` 10/10 · ZATCA QR 7/7 · Google sign-in 9/9 |
| `npm run test:seed` | **14/14** seed idempotency/ordering assertions |
| `npm run test:schema` | **0** schema problems, **0** load errors, 27 tables round-trip row-for-row |
| `npm run test:rls` | **19/19** RLS and storage-policy assertions as `anon` / `authenticated` / `service_role` |
| `node dev/audit-contract.mjs` | **0** UI↔API contract mismatches across 42 handlers |
| CI (`.github/workflows/ci.yml`) | build · lint · unit · seed · contract · API(+post-suite schema) · schema · RLS · browser |

---

## 1. Blockers

**The build was broken.** `vite.config.ts` failed type-checking (`TS2769`): the plugin
array was inferred as a nested array. Fixed by typing it as `PluginOption[]`, replacing
`@ts-ignore` with `@ts-expect-error` on the optional local plugin import, and typing
`allowedHosts` as a literal (`true as const` — a plain `boolean` does not satisfy Vite's
`true | string[]`, which is the subtle reason adding the option reintroduced the error).

**The app could not start.** `createClient()` was called with undefined credentials, so
the bundle threw at import time and rendered a blank page. `src/lib/supabase.ts` now
resolves config explicitly: demo mode, real mode, or a stub that reports a clear,
actionable error on the login screen instead of a white screen.

**The test harness could not fail.** `dev/api-test.mjs` used
`expectOk(r, label).__fail || { note }`, which returns the failure *string* on failure —
and the runner counted any truthy return as a pass. Every green run before this was
therefore untrustworthy. Replaced with a single-shape `okOr()` helper and a runner that
treats a bare string as `FAIL`; the fix immediately exposed two wrong assertions (see
`REVIEW.md` #2). Current result: **37/37 real checks**.

**There was no way to run it.** The backend needs Supabase (Auth, Postgres, Storage) and
the seeder assumes migration-created reference rows that are not in this repo. I added
`dev/` — a local emulator of exactly the Supabase surface `/api` uses (query builder with
filters, ordering, ranges, counts, embedded relations; storage objects; session lookups),
loaded through a module resolve hook so **no handler in `/api` was modified**. The real
business logic now runs locally: `npm run dev:all` boots a seeded system in under a
second (60 employees, 4,080 attendance rows, 12 payroll runs, 720 payslips, 23
ZATCA-signed invoices, 89 leave requests, 38 expense claims, policies, chat, audit log).

**First boot was unusably slow.** The store rewrote the whole 1.8 MB JSON file on every
insert, so seeding took ~4 minutes. Flushes are now paused during the bulk seed:
**0.19 s**.

## 2. Data defects

* **Corrupt timesheet rows.** Two rows in `api/_seeddata.js` (`TS1061`, `TS1122`) carried
  `employee_id: "Total / Average"` — spreadsheet footer rows that had leaked into the
  export. They are unattributable (no employee can see them, and they inflate vendor
  billing). Removed, and `api/seed.js` now filters rows whose `employee_id` is not a real
  employee and warns with a count, so a future export cannot reintroduce them.
* **Inconsistent env naming.** The frontend read `VITE_SUPABASE_URL` while the API read
  only `NEXT_PUBLIC_SUPABASE_URL`, and neither documented the other. `api/db-client.js`
  now resolves `NEXT_PUBLIC_*` → `SUPABASE_*` → `VITE_*` and fails fast with an actionable
  message when unconfigured; `api/auth-phone.js` uses the same resolved values instead of
  reading `process.env` directly.

## 3. React correctness (found by the React Compiler rules)

* `Shell.tsx` — `Date.now()` was called during render inside `useRef(…)`; the idle
  timer is now initialised in the effect.
* `Chat.tsx` — `activeRef.current = active` was assigned during render (stale/mismatched
  conversation reads and a ref read in the polling callback); moved into an effect.
* `charts.tsx` — the donut chart mutated a closure counter (`off += len`) inside
  `useMemo`; segments are now derived without reassignment.
* `Dashboard.tsx` — `useMemo(…, [saved.join(), keys.join()])` had unstable dependency
  expressions and never memoised anything; compute the ordering directly.
* `Documents.tsx` — a `useMemo` whose dependencies could not be preserved by the
  compiler (derived `tpl` object) was silently recomputing; the document object is now
  computed inline.
* `Invoices.tsx` — assigned to `window.location.href` (flagged as mutating a global);
  now uses `location.assign()`.
* 34 unused imports/variables removed across 12 files (unused `useMemo`, `useEffect`,
  icons, helpers, destructured `lang`/`me`/`prefs`).

## 4. Lint configuration

The template's ESLint config made `no-explicit-any` a hard error across 714 call sites
of dynamically-shaped API payloads. Rather than mass-rewriting them (high risk, zero
runtime benefit), the rule is now a **warning** with a comment explaining why, while the
rules that catch real bugs stay errors. `argsIgnorePattern`/`ignoreRestSiblings` are
enabled so intentional omit-by-destructuring (`const { id, …rest } = c`) is allowed.
`react-hooks/exhaustive-deps` and `set-state-in-effect` are warnings for the same
reason — the data-loading effects are intentional.

## 5. Tooling added

* `dev/` local Supabase emulator, base seed, bootstrap, and a launcher (`npm run dev:all`).
* `npm run test:api` — 31 checks against the real handlers: role scoping (employee sees
  only their own rows, vendor only their invoices, neither can read payroll/audit), refusal
  of privilege escalation, leave balances + overlap rejection, expense receipt threshold
  and cap rules, geofence rejection 850 km away vs. acceptance at HQ, notification
  read-through, chat send/read, ticket create/reply, ZATCA invoice creation (verifies
  number/total/ICV/hash/QR), payroll run with GOSI totals, rule versioning, backups, and
  forbidden actions for the wrong role.
* `npm run test:e2e` — Playwright walkthrough of all 15 routes × 3 roles with console
  error and HTTP failure capture (screenshots land in `.data/shots/`).
* `.env.example`, `.gitignore` entry for `.data`, and a README that documents both the
  zero-setup demo and the real Supabase deployment path.

## 6. Second pass — the backlog, cleared

`BACKLOG.md` listed 15 open items. Everything in P1 and P2 is now closed, and each fix is
pinned by a check that fails if it regresses. The bugs this pass uncovered were mostly
found *by* those checks, not by reading code:

* **Google sign-in could double-handle one message.** `src/lib/googleAuth.ts` added a
  `message` listener per call and never removed it, so clicking sign-in twice left two
  listeners and one result being processed per click. Now a module-level `activeHandler`
  with `detachHandler()`; `dev/unit/googleauth-test.mjs` (9 assertions) pins the origin
  check and the de-duplication against the real handler.
* **Any render error blanked the page.** React 19 unmounts the tree on an uncaught error
  and there was no boundary anywhere. Added `src/components/ErrorBoundary.tsx` — one
  boundary around the app, one around the routed page so the shell survives — which
  reports `ui.error` to the audit log. A dev-only `/?crash=1` switch lets the browser
  suite prove it catches and recover (the assertion is in `dev/smoke.mjs`).
* **`backup.restore` did not exist** — a backup you cannot restore from is half a
  feature. Implemented: validates the file (app tag, version, table names, row ids),
  never trusts the path, runs a **dry run** that reports per-table new/update/removed
  counts, requires the file name as confirmation before a destructive `replace`, strips
  `session_id` from restored profiles, and records the restore in the audit log. The
  Settings → Backup tab shows the dry-run plan before offering "Restore (merge)".
* **The emulator's `upsert` silently appended duplicates** (it ignored `onConflict`).
  Real PostgREST merges on the conflict key, so local behaviour diverged from production
  and the restore test duplicated whole tables. Fixed in `dev/supabase-local.mjs`.
* **The payroll vocabulary in the schema was wrong.** `payroll.finalize` writes
  `approved` to `payroll_runs.status` and `payslips.status`, but the migration only
  allowed `finalized` on runs and `draft|paid|void` on payslips — so on a real project
  the first finalize (and the seeder's own approved payslips) would have hit a CHECK
  violation. The constraints now match the app, with an idempotent `alter` so an existing
  database converges.
* **Deleting a payroll run erased its payslips.** `payslips.run_id` is
  `on delete cascade`, so deleting a run silently destroyed payroll history. The API now
  refuses with **409** and says how many payslips are attached.
* **A notification with a null title** — `notifyAdmins` was called with a string instead
  of `{title, body}`. Caught by the schema round trip (the row is `not null`), not by the
  API suite, which is exactly why the round trip runs in CI.
* **Seed steps were re-runnable but not idempotent** — repeating `core` duplicated
  employees and payroll runs. Each step now records `seed_step_<name>` in `secrets`, a
  repeated step returns `{skipped:true}`, steps must run in order (**409** otherwise), and
  the token is still single-use. `npm run test:seed` replays every step against a
  throwaway store and asserts counts do not move.
* **`/api/rest` wrote whatever the integration sent.** It now has a generated column
  allowlist (`api/_schema.js`, 15 tables / 206 columns), rejects unknown fields and
  unknown filters with a **400 that names the field**, and `check-schema` fails if the
  allowlist drifts from the real Postgres schema.
* **The `documents` storage bucket was dead infrastructure** — no writer, no policy, no
  reader. Removed from the migration (with a notice for deployments that still have it),
  and the RLS harness now asserts exactly the three buckets the code uses.
* **Smaller ones:** `proces.exit?.()` typo in `check-schema.mjs` (crashed instead of
  reporting), CI ran the schema check before seeding, CI never re-checked the schema
  *after* the API suite (that is the check that caught the payroll and notification bugs),
  and `src/pages/Settings.tsx` had an effect missing its `admin` dependency.

## 7. Not changed (deliberately)

* The `any`-heavy typing of API payloads — 737 warnings, flagged, not rewritten. A
  mechanical rewrite of that many call sites is a large diff with no runtime benefit and
  real regression risk; it belongs behind a typed client, not a bulk edit.
* `react-refresh/only-export-components` (15) — component files intentionally export
  helpers next to components.
* 7 of the 9 `react-hooks/exhaustive-deps` warnings are one-shot mount effects or
  callbacks whose dependencies are stable by construction; adding the dependency would
  re-trigger fetches. The one that was a genuine bug (`Settings.tsx`) is fixed.
* `react-hooks/set-state-in-effect` (18) — the data-loading effects set loading/error
  state inside the effect on purpose; the suggested fix is a data library, not a patch.
* Visual regression, a full accessibility audit and i18n coverage are product-quality
  work with no defect attached — still listed in `BACKLOG.md` as P3.
* Anything that needs a real Supabase project (GoTrue MFA, Storage signed-URL
  behaviour, RLS under real JWTs) is verified only against the emulator and the local
  Postgres role simulation; `BACKLOG.md` P4 says so explicitly.
* The March-2026 payroll spike in the seed (annual bonus) is intentional data, not a bug.
