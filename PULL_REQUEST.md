# Verification pass: everything found by running it, fixed and pinned

**Branch:** `review/verification` → `main` · **Base:** `5289c25` · **6 commits**

The app was audited by running it — frontend in a real browser, API through its real
handlers, schema against a real PostgreSQL 17 — rather than by reading code. Every change
below is attached to a check that fails if it regresses. Full detail in `REVIEW.md`
(33 findings), `FIXES.md` (what changed) and `BACKLOG.md` (what is still open, and why).

Nothing in this PR is speculative: where a fix could not be proven locally, it is left
open and written down instead.

---

## What this fixes

**Blockers.** The build did not type-check; the app could not start without a cloud
Supabase project (blank page on import); and the API suite's failure mode was "pass" — it
returned the failure *string*, which a truthy check counted as success, so every earlier
green run was untrustworthy.

**Bugs a user would hit:**

| Where | Bug |
| --- | --- |
| Payroll | Finalizing a run wrote `approved` to `payroll_runs.status` / `payslips.status`, which the schema's CHECK constraints reject — it would have failed on first use against a real project. Constraints now match the app (`draft → approved → paid`), applied idempotently. |
| Payroll | Deleting a run cascaded its payslips away (`ON DELETE CASCADE`) with no warning. Now 409 with a count: payroll history is not deletable. |
| Sign-in | Every sign-in attempt added a `message` listener and never removed it — two clicks meant two live handlers and one result processed per click. |
| Any page | No error boundary: one malformed record unmounted the tree into a white page with no way back. |
| Settings → Audit | A notification was written with a null `title`, violating `not null`. |
| Backups | `backup.restore` did not exist — a backup you cannot restore from is half a feature. |
| Integration API | `/api/rest` accepted any column an integration sent; unknown fields surfaced as raw Postgres errors. |
| Seed | Re-running a step duplicated 60 employees and the payroll history. |
| DB | `npm run db:migrate` aborted on any PostgreSQL that isn't Supabase (`auth.uid()` unguarded). |
| Schema | `profiles.user_id` was `text` while `auth.uid()` returns `uuid`, so every RLS and storage policy comparing them could never match. |

**Infrastructure added:** a local Supabase emulator (`dev/`) that drives the real handlers
with no cloud account, six test suites, a contract/authorisation audit, and CI
(build · lint · unit · seed · contract · API · schema · RLS · browser).

---

## How it was verified

All numbers below are from a fresh database, on the committed tree.

| Check | Result |
| --- | --- |
| `npm run db:migrate` (fresh / re-run) | exit 0 / exit 0 |
| `npm run build` | passes, 8.8 s |
| `npm run lint` | **0 errors**, 779 warnings (dominated by `no-explicit-any`) |
| `npm run test:api` | **65/65**, 42/42 handlers exercised |
| `npm run test:e2e` | 45 page loads × 3 roles, 0 console errors, 0 failed API calls, error boundary proven |
| `npm run test:unit` | dates 18/18 · `.docx` 10/10 · ZATCA 7/7 · Google sign-in 9/9 |
| `npm run test:seed` | 14/14 |
| `npm run test:schema` | 0 problems, 0 load errors, 27 tables round-trip — clean **before and after** the API suite |
| `npm run test:rls` | 19/19 as `anon` / `authenticated` / `service_role` |
| `node dev/audit-contract.mjs` | 0 contract problems |

The post-suite schema check is deliberate: it is what caught the payroll vocabulary
mismatch and the null notification title, neither of which the API suite could see.

---

## How to review

Commits are ordered so each one stands alone and can be read in sequence:

1. `fix(api:)` — server-side defects and `backup.restore`. Highest risk, review first.
2. `fix(web:)` — error boundary, sign-in listener, restore UI, React Compiler findings.
3. `chore(deps:)` — lockfile only: react-router-dom 7.18.5, vite 7.3.7. `npm audit
   --omit=dev` clean. Ranges in `package.json` were already sufficient.
4. `test:` — emulator, suites, CI. No handler in `api/` was modified to make this work; it
   is loaded through a module resolve hook.
5. `docs:` — the three reports and the README.
6. `build:` — chunk splitting. Measured: first load unchanged (156 kB gzip), deploy cost
   26 kB gzip instead of 155 kB. A catch-all `vendor` chunk was tried and rejected after
   it pushed the entry bundle to 913 kB.

## Risk and rollback

- **Schema:** the only migration changes are the two status CHECK constraints, applied with
  idempotent `alter table … drop constraint if exists / add constraint`, plus the removal
  of the unused `documents` bucket. Existing databases converge; no data is rewritten.
- **New surface:** `backup.restore` is admin-only, dry-run first, and requires the file
  name as confirmation for destructive replaces. It never trusts a path.
- **Behaviour changes worth a second look:** deleting a payroll run is now refused (409),
  and `/api/rest` rejects unknown fields (400) — both are intended to break callers that
  were doing something unsafe, and both are covered by tests.
- Rollback is a revert of this branch; nothing has been deployed.

## Deliberately not in scope

`BACKLOG.md` → P3: the 737 `any` warnings (needs a typed client, not a bulk edit), i18n
coverage, an accessibility audit, and visual regression. P4 genuinely needs a real
Supabase project (GoTrue MFA enrolment, signed-URL behaviour, RLS under real JWTs) and
says so rather than claiming coverage it does not have.

## Checklist

- [x] Builds and type-checks
- [x] Lint: 0 errors
- [x] Every suite green on a fresh database, re-runnable
- [x] Both migrations apply cleanly to an empty PostgreSQL, twice
- [x] No secrets, `.env.local`, `.data/` or build output committed
- [ ] Reviewed by a human (this is what the PR is for)

---

### Pushing it

```bash
git remote add origin git@github.com:<you>/<repo>.git
git push -u origin review/verification
```

Then open the PR against `main` and paste the text above as the description.
