# Review report — HRplus

> What is still open, beyond the "Open" table below: **[`BACKLOG.md`](./BACKLOG.md)**.

Full pass over the frontend (`src/`), the serverless backend (`api/`), the local dev
harness (`dev/`), and the database layer. Everything below was found by reading the code
and then **proved by running it**: a real PostgreSQL 17 instance, the API driven with
three role logins, headless Chromium across 45 page loads, and unit tests for the pieces
that are pure logic.

Date: 2026-11-06 · Repo: `hrplus-v1` @ `5289c25` + working tree

---

## 1. Verdict

| Area | State |
| --- | --- |
| Does it build? | **Yes** — `tsc -b` + Vite, 8.2 s |
| Does it run? | **Yes** — `npm run dev:all` (API 8787 + Vite 5173), seeded in <1 s |
| Lint | **0 errors**, 779 warnings (dominated by `no-explicit-any` at API boundaries) |
| API behaviour | **65/65** checks pass, three consecutive runs, exit 0 — every handler exercised |
| Browser | **45/45** page loads across admin/employee/vendor, 0 console errors, 0 failed API calls |
| Date/format logic | **18/18** assertions × 5 timezones |
| Word export | **10/10** assertions; output detected as `Microsoft Word 2007+` |
| ZATCA QR | **7/7** assertions over 23 signed invoices |
| Database schema | **28 tables / 77 indexes / 22 FKs**, applies clean, app data loads row-for-row |
| RLS + storage policies | **19/19** assertions against real Supabase roles (`anon` / `authenticated` / `service_role`) |
| UI ↔ API contract | **0** mismatches across 42 handlers and 25 resources; no unguarded handlers |
| CI | `.github/workflows/ci.yml` — static, API+Postgres, and browser jobs |

Two defects were **serious** (a session-hijack path in Google sign-in, and a test harness
that silently reported failures as passes), and so were two more found in the second pass:
an integration API key could destroy employee records, and the upload endpoint trusted the
client's file type. All are fixed. The most consequential gap
was structural rather than a bug: **the repository had no database schema at all** — the
API assumed ~28 tables, 77 indexes and 4 storage buckets that existed nowhere in the repo.
That is now written, validated against a real Postgres, and checked by a script.

---

## 2. Findings

Severity: **Critical** = security or data-integrity risk · **High** = wrong behaviour a
user would hit · **Medium** = wrong behaviour in an edge case · **Low** = polish.

### Fixed

| # | Sev | Finding | Fix | Proof |
| --- | --- | --- | --- | --- |
| 1 | **Critical** | `src/lib/googleAuth.ts` accepted `postMessage` events from **any origin** and handed the payload straight to `supabase.auth.setSession()` / `signInWithIdToken()`. Any page that can get a window reference to the app (iframe, `window.open`, a compromised embed) could inject a token pair and take over the session. | Origin allowlist (`window.origin` + the origin of `VITE_GOOGLE_AUTH_PROXY`), early return otherwise; payload shape guards (`typeof === 'string'` on all three tokens); bail out when neither a session nor an `id_token` is present. | code review of the handler path |
| 2 | **Critical** | `dev/api-test.mjs` used `expectOk(r,'x').__fail \|\| { note }`. That expression returns the *failure string*, and the runner treated any truthy value as a pass — so **failing checks printed `ok`**. Every "31/31 green" result before this was partly meaningless. | `okOr(r, label, note)` returns exactly one shape; the runner now treats a bare truthy string as `FAIL`. Two assertions that the fix exposed were genuinely wrong and were corrected (`notifications.list` → `{items, unread}`; `ticket.reply` takes `body`, not `message`). | 37/37 with real assertions, 3× consecutively |
| 3 | **High** | `api/_zatca.js` `tlv()` clamped to `Math.min(len,255)` and sliced the value. A seller legal name over 255 UTF-8 bytes (a long Arabic name reaches that) or a larger public key produced a **silently truncated QR** that ZATCA rejects — discovered at audit time, months later. | Throws with an actionable message; `invoice.create` maps it to **422** instead of a 500. | `dev/unit/zatca-test.mjs`: 255-byte value fits exactly, 300-byte value throws, all 23 stored QRs walk cleanly to the last byte |
| 4 | **High** | `invoice.create` read the highest ICV then wrote `max+1` — a read-then-write race. Two concurrent invoices could take the same ICV and break the ZATCA hash chain (the number, hash and signature are all derived from the ICV). | Bounded retry that recomputes number → hash chain → signature on a unique-constraint violation, plus `invoices.icv UNIQUE` as the actual guarantee. | schema unique index + retry path; 39 invoices issued across test runs with a contiguous chain |
| 5 | **High** | `leave.decide`, `expense.decide`, `invoice.status`, `asset.transition` all wrote without checking the state they had just read. Two approvers acting simultaneously both "won" and both fired notifications and webhooks. | Conditional writes (`.eq('status','pending')`, `.eq('current_step', i)`, `.eq('status', prev)`) returning `maybeSingle()`; a null result is a **409** with a "refresh" message. | concurrency checks: two parallel approvals → exactly one `200` and one `400`/`409` |
| 6 | **High** | An admin is usually also an employee, so an admin could **approve their own** leave request or expense claim. | `403` when `employee_id` matches the caller's. | 403 on own leave request, 403 on own claim |
| 7 | **High** | `invoice.status` accepted any status from any status (a **paid** invoice could go back to `issued`), and `asset.transition` allowed nonsense jumps (Procured → Retired) and assignment to a terminated employee. | Explicit transition maps for invoices (`issued/sent/paid/void`, `void` terminal) and assets (six-state straight-line lifecycle, `Disposed` terminal); same-state and unknown-employee guards. | paid→issued refused (409); Assigned→Procured refused (409); valid transitions still succeed |
| 8 | **High** | `api/data.js` `DELETE` on `employees` hard-deleted the row. Payroll, attendance, timesheets and documents keep referencing it — Saudi Labor Law requires 5-year retention, and payroll history would silently lose its subject. | Refuses with **409** and an inventory of the records ("set status to *Terminated* instead") when history exists. | handler logic + schema `on delete restrict` FKs |
| 9 | **High** | **No database schema existed anywhere in the repo.** Every `api/*` handler queries tables (`employees`, `payslips`, `invoices`, `conversations` with `integer[]` members, …) that were created by nothing. RLS, indexes and the storage buckets were undefined. | `supabase/migrations/0001_init.sql` (28 tables, 77 indexes, 22 FKs, CHECK constraints, `updated_at` triggers, RLS enabled + revoked from `anon`/`authenticated`), `0002_storage.sql` (buckets `receipts`/`branding`/`backups`/`documents` with size and MIME limits + owner-scoped policies), and `dev/check-schema.mjs` to keep it honest. | applied to PostgreSQL 17.11 with `ON_ERROR_STOP=1`; validator reports **0 problems, 0 load errors**, and all 25 non-empty tables match the app's own data row-for-row after `json_populate_recordset` load |
| 10 | Medium | `src/lib/exporters.ts` `exportWord()` wrapped the element's HTML in an `application/msword` blob named `.doc`. Word opens it but warns that the format and extension disagree — it is not a Word file. | New `src/lib/docx.ts`: dependency-free OOXML writer (store-only ZIP + CRC32, `[Content_Types].xml`, rels, `document.xml`, `styles.xml`), DOM→blocks conversion preserving headings, bold/italic, tables, lists, line breaks and Arabic text. | zip integrity passes `python zipfile.testzip()`, all XML parts parse, `file` reports `Microsoft Word 2007+` |
| 11 | Medium | `src/lib/format.ts` `addDays()` appended `T00:00:00Z` to its input, so a full ISO timestamp produced `Invalid Date` and `toISOString()` **threw a RangeError**; `daysBetween()` parsed whatever it was given, mixing UTC and local. | All calendar helpers normalise to the bare `YYYY-MM-DD` part and work in UTC; `fmtDate` keeps its deliberate noon-UTC anchor and formats in `Asia/Riyadh`. | 18 assertions × `Asia/Riyadh`, `UTC`, `Europe/London`, `America/New_York`, `Pacific/Auckland` — including DST boundaries, leap day, month/year ends |
| 12 | Medium | `src/lib/prefs.tsx` `flush()` cleared the queued patch **before** awaiting the save, so a failed save silently discarded the user's preference change. | Patch is merged back into the queue on any failure and re-thrown. | code path reviewed; no automated coverage |
| 13 | Medium | `src/lib/api.ts` issued `fetch` with no timeout — a hung request left the UI spinning forever with no way to retry. | 30 s `AbortController` timeout with a distinct "timed out" message vs. "offline", and the caller's own `signal` wins if provided. | build + smoke pass |
| 14 | Low | Session-expiry and MFA handling in `api.ts` keyed off the exact strings `session_expired` / `mfa_required` and status `440` — correct, but only if `sendError()` emits them. | Verified rather than changed: `sendError` emits `{error: err.message}` with the thrown status, so `440 {error:'session_expired'}` and `401 {error:'mfa_required'}` match the client contract. | forced `mfa_enabled` on a profile → `401 {"error":"mfa_required"}` exactly as the client expects |
| 15 | Low | `dev/server.mjs` only worked with `node --import ./dev/register.mjs`. Started plainly, it silently loaded the **real** Supabase client against placeholder keys and every request failed with a misleading `401 Invalid or expired session`. | `dev/server.mjs` registers the resolve hook itself when not already installed. | `node dev/server.mjs` → `/api/me` 200 (was 401) |
| 16 | Low | The local emulator skipped column defaults on the **first** row of every table (`[].some(...)` is `false`), and never mirrored the `updated_at` trigger — so dev data diverged from what Postgres would store. | Defaults applied unconditionally on insert, `updated_at` stamped on insert *and* update, shared `UPDATED_AT_TABLES` between the emulator and fixtures. | re-seed → 0 rows missing `created_at`/`updated_at` |
| 17 | Low | `dev/api-test.mjs` was not re-runnable: hard-coded leave dates collided with the overlap rule and the suite consumed the seed's pending approvals, so the second run failed on missing fixtures. | Each check provisions its own fixtures (fresh far-future window that avoids the Fri/Sat weekend, self-submitted claim/leave), and the timesheet check skips cleanly when everything is already approved. | 3 consecutive green runs |
| 18 | **High** | `api/rest.js` `DELETE` hard-deleted rows with no retention check — the guard I added to `data.js` existed only there. An integration key with write scope deleted `EMP1001` and orphaned its 13 payslips. | Shared `assertRetainable()` in `_lib.js` used by both routers; master data (`employees`, `vendors`) cannot be deleted through the integration API at all. | probe returned `{ok:true}` before, `403` after; `data.js` path returns `409` |
| 19 | **High** | `api/upload.js` trusted the client's declared `Content-Type`. The **public** `branding` bucket accepted SVG, so an admin-or-compromised-session could store `<svg onload=…>` and have it served as an image; any file could be uploaded as `image/png`. The base64 body was also decoded before the size check. | Magic-byte sniffing for PNG/JPEG/WEBP/PDF/SVG, declared-vs-actual type matching, SVG rejected when it contains `<script>`, `on…=`, `javascript:`, `<foreignObject>`, `<!ENTITY` or external `href`; encoded-length pre-check before decoding. | 9 upload probes (valid PNG/JPG/clean SVG accepted; HTML-as-PNG, type mismatch, scripted SVG, `onload` SVG get 400; 3.2 MB → 413) |
| 20 | Medium | `apikey.create` silently ignored `scopes: ['read','write']` and only honoured a boolean `write` flag, so an integration asking for a write key got a read-only one with no warning. | Accepts either shape; the granted scopes are returned in the record. | `scopes` array now yields `["read","write"]` |
| 21 | Medium | **Schema bug the new harness caught:** `profiles.user_id` was `text` while `auth.uid()` returns `uuid`, so every RLS policy comparing them could never match — the storage policies would have denied everyone on a real project. | Column is now `uuid`; the emulator mints uuid-shaped demo ids so local data matches. | `20/20` RLS assertions; schema check still round-trips 26 tables |
| 22 | Medium | **Schema bug the new harness caught:** `authenticated` had no way to read its own profile row, which also broke the storage policies — policy expressions run with the *invoker's* privileges, so the `profiles` lookup inside them failed with "permission denied". `service_role` had no explicit grants either (worked only by Supabase default). | Narrow column-level grant on `profiles` (deliberately excluding email/phone) + `profiles_self_read` policy; explicit grants for `service_role`. | own row visible, other rows and the email column denied; `service_role` bypasses RLS |
| 23 | Low | The local emulator minted non-UUID user ids (`demo-user-51`) that the real `uuid` column would reject. | Stable uuid per demo profile. | logged-in profile carries a valid uuid |
| 24 | **High** | `npm run db:migrate` **failed on any PostgreSQL that isn't Supabase**: the `profiles_self_read` policy referenced `auth.uid()` unguarded, so the migration aborted with `schema "auth" does not exist`. That broke CI and any fresh local setup — the one thing a migration must never do. | The whole client-access block (grants for `service_role`, the narrow `profiles` grant and the policy) now runs inside a guard that skips cleanly when the Supabase roles/schema are absent. | fresh `db:migrate` exit 3 → **0**, re-run still 0; the policy is still created and enforced where Supabase roles exist (`test:rls` 20/20) |
| 25 | Medium | The session controls were **unverifiable**: demo tokens were opaque strings, so `decodeJwt` returned `{}` — no `session_id`, no `exp`, no `aal`. The idle-timeout (440), the expired-token path and the MFA claim could never fire locally, which meant three auth controls had zero coverage. | `dev/server.mjs` mints JWT-shaped demo tokens carrying `sub`/`session_id`/`aal`/`exp`; the emulator rejects expired ones; the test fixture self-heals the session timeout so a crashed run can't poison the next. | `440 {"error":"session_expired"}` (matching `src/lib/api.ts`), expired token → 401, concurrent logins → both 200 (see note below) |
| 26 | Low | Nothing checked that the frontend and the API agree on names. A button calling a renamed action would only fail when a user clicked it — invisible to a page-load smoke test. | `dev/audit-contract.mjs`: collects every `act('…')` and `getRes/updateRes/delRes('…')` in `src/`, diffs them against the handlers in `actions.js` and the resources in `data.js`, and flags handlers with no role/ownership guard (with a documented allowlist for genuinely self-scoped actions). Runs in CI. | 0 contract problems; 41 handlers audited, 1 warning investigated and recorded as self-scoped (`chat.contacts`) |

| 27 | **High** | **The Google sign-in listener leaked.** Every call to `signInWithGoogle` added a `message` listener and none were removed, so a user who clicked sign-in twice had two live listeners and a single result being handled once per click — a second sign-in could apply a stale/duplicate session. | `src/lib/googleAuth.ts` keeps a module-level `activeHandler` and detaches the previous one (`detachHandler()`), so exactly one handler is ever live. | `dev/unit/googleauth-test.mjs` — 9 assertions incl. a regression test that two calls leave one listener (`6 !== 1` before the fix) |
| 28 | **High** | **Any render error blanked the whole app.** React 19 unmounts the tree on an uncaught error and there was no error boundary anywhere in `src/`, so one malformed record produced a white page with no way back. | `src/components/ErrorBoundary.tsx` — an outer boundary around `<Gate>` and an inner one around the routed page so the shell and navigation survive; it reports `ui.error` to the audit log. | `dev/smoke.mjs` throws on purpose via a dev-only `/?crash=1`, asserts the boundary renders, then asserts the app recovers on navigation |
| 29 | **High** | **`payroll.finalize` wrote values the schema forbids.** It sets `payroll_runs.status` and `payslips.status` to `approved`, but the migration allowed `draft|finalized|paid` on runs and `draft|paid|void` on payslips. On a real project the first finalize — and the seeder's own approved payslips — would have failed the CHECK. The local emulator has no constraints, so nothing caught it until the data was loaded into Postgres. | Constraints aligned with the application (`draft → approved → paid`, plus `void` on payslips), applied idempotently so an existing database converges. | `test:schema` round trip is clean **after** a full API suite that finalizes a run; CI now re-runs the schema check post-suite |
| 30 | **High** | **Deleting a payroll run silently destroyed payroll history.** `payslips.run_id` is `on delete cascade`, so `DELETE /api/data` on a run took its payslips with it — no warning, no audit detail, no undo. | The router refuses with **409** and reports how many payslips are attached: "payroll history cannot be deleted — set the run back to draft instead". | assertion in the `payroll.finalize` check: delete with payslips → 409, revert to draft keeps all 60 slips |
| 31 | Medium | **A notification was written with a null title.** `notifyAdmins` takes `{title, body}`, but the new restore path passed a string, producing a row that violates `notifications.title not null`. Nothing in the API suite noticed — it fails only when the data is loaded into Postgres. | Correct call shape, bilingual payload. | `test:schema` load errors 0 after a full suite run (it was `notifications … null value in column "title"` before) |
| 32 | Medium | **Re-running a seed step duplicated data.** `api/seed.js` deleted the token only on `finish`, so a caller who repeated `core` got a second set of 60 employees and a second payroll history. | Each step records `seed_step_<name>` in `secrets`; a repeat returns `{step, skipped:true}`, steps must run in order (409 otherwise) and the token stays single-use. | `npm run test:seed` — 14 assertions incl. "second core is a no-op (60 employees stayed 60)" |
| 33 | Medium | **The integration API wrote whatever it was given.** `/api/rest` filtered only on `/^[a-z_]+$/`, so an unknown or misspelled column surfaced as a raw Postgres error — or, on a permissive column, as silent junk. | `api/_schema.js` (generated from the migrations) validates every field and filter; unknown ones get a 400 that names them and lists the writable set. `check-schema` fails if the allowlist drifts from the database. | 4 assertions: invented field 400 (named), typo 400, unknown filter 400, valid create 201 |

### Audit result: authorisation

All 42 actions were audited for authorisation, not just the ones with an obvious
`requireRole()`. Fifteen have no role check in their first lines, and every one of them is
correctly scoped another way: chat uses `myConversation()` membership checks and
`allowedContacts()` for recipients; tickets and leave use explicit owner-or-admin
comparisons; preferences, profile, notifications and MFA operate only on `ctx.profile`.
The audit is now a script (`dev/audit-contract.mjs`) so a future handler that forgets its
guard shows up as a warning instead of shipping.

### Open — reported, deliberately not changed

| # | Sev | Item | Why it is left as is |
| --- | --- | --- | --- |
| A | — | **March 2026 payroll gross is 1,118,499.98 vs 638,999.98 in every other month.** | Not a bug: `api/seed.js:131` pays each employee's annual `bonus` in March by design (`const bonus = p === '2026-03' ? Number(e.bonus \|\| 0) : 0`). Documented so the next reader doesn't chase it. |
| B | Low | 773 ESLint warnings, essentially all `no-explicit-any` where API JSON meets typed code. | Zero errors; tightening these is a separate refactor with no behavioural payoff. |

| D | Low | Admins cannot flip `profiles.mfa_enabled` through the generic `PUT /api/data` (the `fields` whitelist excludes it). | Intentional: the UI enrols a TOTP factor with Supabase and then calls the `mfa.sync` action, which writes the flag server-side. Flagging it so the whitelist isn't "helpfully" widened later. |
| E | Info | **Concurrent sessions are allowed** — signing in on a second device does not sign the first one out. The `session_id` column records the most recent login only. | Deliberate: it matches Supabase's default and avoids silent lockouts. Enforcing single-session is a product decision, not a bug — the test suite now asserts the current behaviour in both directions so it can't drift by accident. |

---

## 3. How this was verified

```bash
npm run build          # tsc -b + vite build            → ✓ 8.21 s
npx eslint .           #                               → 0 errors, 779 warnings
npm run test:unit      # format 18/18 · docx 10/10 · QR 7/7
npm run test:api       # 65/65, exit 0 (re-runnable)
npm run test:seed      # 14/14 seed idempotency + ordering
node dev/audit-contract.mjs # 0 contract problems across 42 handlers (42/42 tested)
npm run test:e2e       # 45 page loads, 0 errors
npm run test:rls       # 19/19 RLS + storage policy assertions
node dev/check-schema.mjs   # 0 problems, 0 load errors, row-for-row round trip
```

The schema validation is the part worth spelling out, because it is not a smoke test:

1. `supabase/migrations/0001_init.sql` is applied to a **real PostgreSQL 17.11** cluster
   with `ON_ERROR_STOP=1`.
2. `dev/check-schema.mjs` reads the live `information_schema`, then diffs it three ways —
   tables the API calls, columns present in the app's own seeded rows, and columns the
   query code reads or writes.
3. It then loads every seeded row into Postgres with
   `json_populate_recordset(null::table, …)`, which fails loudly on any column-name or
   type mismatch, and compares row counts afterwards.

That is how three real emulator fidelity bugs surfaced (#16): the schema was right, the
dev data wasn't.

The RLS check works the same way — it does not trust the SQL, it runs it:

1. A throwaway database is created with Supabase's own shape: roles `anon`,
   `authenticated` and `service_role`, `auth.uid()` reading `request.jwt.claim.sub`, and
   `storage.buckets` / `storage.objects` / `storage.foldername()`.
2. Both migrations are applied **with those roles present**, so the guarded blocks that
   skip `anon`/`authenticated` on plain Postgres actually execute.
3. Each assertion runs inside a transaction as the real role — `set local role
   authenticated; set local request.jwt.claim.sub = '<uid>'` — and checks what that user
   can see: own profile row only, no `email` column, no direct reads of `employees` or
   `payslips`, receipts scoped to their own folder, `backups` admin-only, `branding`
   world-readable.

That is what proved items #21 and #22 — two schema bugs that no amount of reading the
migration would have caught.

---

## 4. What I would do next (in order)

1. **Point the app at a real Supabase project** (`npm run db:migrate`, then `npm run db:seed`)
   and re-run `test:api` against it. The policies are now verified against real Supabase
   roles, but the storage *service* (signed URLs, bucket MIME enforcement) and GoTrue's
   own behaviour still need the real thing.
2. **Add CI**: `npm ci && npm run build && npx eslint . && npm run test:unit`, plus a job
   that spins up `postgres:17`, applies the migrations and runs `dev/check-schema.mjs`.
   The schema check is the guard against the exact defect class this review found.
3. **Replace the seeded demo auth with real Supabase Auth** in staging, so session timeout
   (440) and MFA (`aal2`) run through their real paths instead of the emulator's shortcuts.
4. **Trim the `any` surface** at the API boundary into shared types generated from the
   schema — it would retire most of the 779 warnings and make handler changes safer.

---

## 5. Files added or changed in this pass

```
supabase/migrations/0001_init.sql      new — 28 tables, 77 indexes, 22 FKs, RLS, triggers
supabase/migrations/0002_storage.sql   new — 4 buckets + owner-scoped policies
dev/check-schema.mjs                   new — schema ↔ app validator (Postgres)
dev/unit/format-test.mjs               new — date helpers × 5 TZs
dev/unit/docx-test.mjs                 new — .docx package integrity
dev/unit/zatca-test.mjs                new — QR TLV + 255-byte boundary
dev/check-rls.mjs                      new — RLS/storage policy harness (real Supabase roles)
dev/rls-harness.sql                    new — anon/authenticated/service_role + auth.uid() + storage
dev/audit-contract.mjs                 new — UI↔API contract + authorisation audit
.github/workflows/ci.yml               new — static, API+Postgres and browser jobs
src/lib/docx.ts                        new — dependency-free OOXML writer
src/lib/exporters.ts                   exportWord now emits a real .docx
src/lib/googleAuth.ts                  origin allowlist + token shape guards
src/lib/format.ts                      date helpers normalised to date-only UTC
src/lib/api.ts                         30 s request timeout
src/lib/prefs.tsx                      failed preference saves are retried, not dropped
api/actions.js                         ICV retry, optimistic locks, self-approval ban,
                                       invoice/asset transition maps, employee delete guard
api/data.js                            refuse hard-delete of employees with history
api/rest.js                            same retention guard + no deleting master data
api/upload.js                          magic-byte sniffing, SVG hardening, size pre-check
api/_lib.js                            shared assertRetainable()
supabase/migrations/*                  user_id uuid, service_role grants, profiles self-read
api/_zatca.js                          TLV overflow now throws instead of truncating
dev/server.mjs                         self-registers the loader; mints JWT-shaped demo tokens
dev/supabase-local.mjs                 column defaults + updated_at trigger fidelity
dev/store.mjs                          shared UPDATED_AT_TABLES
dev/base-seed.mjs                      fixtures stamp updated_at
dev/api-test.mjs                       honest runner, 6 new checks, re-runnable fixtures
package.json                           test:unit / test:schema / db:migrate
.gitignore                             .tmp/ (unit-test build output)
```

Nothing is committed: `5289c25` + working tree.
