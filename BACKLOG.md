# Backlog

Everything here was found by running the app and the API against a real database, not by
reading code. The companion documents are [`REVIEW.md`](./REVIEW.md) (findings and
evidence) and [`FIXES.md`](./FIXES.md) (what was fixed).

State: **P1 and P2 are closed** — each item below carries the check that now fails if it
regresses. P3 and P4 are open, with the reason each was left alone.

Verification after the last change:

```
npm run build          → passes (8.1 s), react/motion/icons in their own chunks
npm run lint           → 0 errors, 779 warnings
npm run test:unit      → 18/18 dates · 10/10 docx · 7/7 ZATCA · 9/9 google-auth
npm run test:seed      → 14/14
node dev/audit-contract.mjs → 0 problems, 42/42 handlers exercised by the API suite
npm run test:api       → 65/65
npm run test:e2e       → 45 page loads, 0 console errors, 0 failed API calls
npm run test:schema    → 0 problems, 0 load errors, 27 tables round-trip
npm run test:rls       → 19/19
```

---

## Closed in this pass

### 1. Three high-severity dependency advisories — **fixed**
`npm audit fix` moved `react-router-dom` to 7.18.5 and `vite` to 7.3.7 with no
`package.json` change (the ranges already allowed it). `npm audit --omit=dev` is now
**0 vulnerabilities**. Seven *dev-only* `minimatch` advisories remain inside
`typescript-eslint`; clearing them needs a breaking major bump of the lint stack, which is
not worth a lint-only win — recorded in P3 below. Verified by `api-test` 65/65 and the
browser suite after the upgrade.

### 2. Google sign-in origin check had no test — **fixed**
`dev/unit/googleauth-test.mjs`, 9 assertions against the real `signInWithGoogle` handler
(hostile origin ignored, own/proxy origin accepted, one result handled per message). The
test found a real defect: the listener was added per call and never removed, so a second
click stacked listeners. `src/lib/googleAuth.ts` now keeps a single `activeHandler` and a
regression assertion covers it.

### 3. No React error boundary — **fixed**
`src/components/ErrorBoundary.tsx`, mounted twice (around `<Gate>` and around the routed
page so the shell survives). It logs `ui.error` to the audit log. Proven end to end: a
dev-only `/?crash=1` switch throws in `Gate`, and `dev/smoke.mjs` asserts the boundary
renders and the app recovers on navigation.

### 4. `backup.restore` did not exist — **fixed**
Implemented with file validation, a **dry run** (per-table new/update/removed counts), a
name-as-confirmation requirement for the destructive `replace` mode, and an audit entry.
Surfaced in Settings → Backup with the plan shown before the merge button. Covered by
three `api-test` checks including a real revert of a mutated row.

### 5. `/api/rest` writes had no field-level validation — **fixed**
`api/_schema.js` is generated from the migrations (15 tables, 206 columns);
`dev/check-schema.mjs` fails if it drifts. Unknown fields or filters return a 400 that
names the offending field and lists what is writable.

### 6. The `documents` storage bucket was unused — **fixed by removal**
No writer, no policy, no reader: dead infrastructure. Removed from
`0002_storage.sql` (with a notice for deployments that still have it) and the RLS harness
now asserts exactly the buckets the code uses.

### 7. 14 of 41 actions were untested — **fixed**
`dev/api-test.mjs` grew from 47 to **65 checks**; every handler is now exercised
(`dev/audit-contract.mjs` prints `42/42` and would drop if one stopped being called).
The new checks found three real problems: `profiles` notifications written with a null
title, a payroll vocabulary mismatch between the handlers and the CHECK constraints, and
the orphaned-payslip consequence of deleting a payroll run.

### 8. Seed steps were re-runnable — **fixed**
Each step records `seed_step_<name>`; repeats return `{skipped:true}`, out-of-order steps
return 409, the token stays single-use. `npm run test:seed` (14 assertions) runs against a
throwaway store so it can reset tables freely.

---

## Open

### 9. Concurrent sessions are allowed — **decision, no code change**
Signing in on a second device does not sign the first out; `profiles.session_id` records
the most recent login only. This matches Supabase's default and the API suite pins the
behaviour in both directions. Making it single-session is a product decision that needs a
user-facing message ("you were signed out elsewhere"), not a silent change.

### 10. 779 lint warnings — **open, 3 of 4 groups deliberate**
737 `no-explicit-any` (API payloads are dynamically shaped; a typed client is the real
fix, not a bulk edit), 18 `react-hooks/set-state-in-effect` (intentional data-loading
effects), 15 `react-refresh/only-export-components` (helpers exported beside components).
The 9 `react-hooks/exhaustive-deps` warnings were reviewed individually: one was a real
bug (`Settings.tsx`, fixed), seven are mount-once effects whose dependency is stable by
construction, and the last (`prefs.tsx`) re-running would fight the persisted value.

### 11. Route-level code splitting — **partly done**
Pages were already `lazy()`. `vite.config.ts` now splits react/router, framer-motion and
lucide into their own chunks: first load is unchanged (156 kB gzip vs 155 kB) but a deploy
re-downloads 26 kB gzip of app code instead of 155 kB. The remaining win is inside pages
(Policies is 23 kB of rules UI); no defect attached.

### 12. i18n gaps — **open**
Most strings go through `L(en, ar)`, but some page-level copy (column headers built inline,
a few toasts) is English-only, and number/date formatting is not unified per locale. Needs
a dictionary pass and a decision on `Intl` defaults, not a patch.

### 13. No accessibility audit — **open**
Labels are mostly present and the shell has a skip link, but there has been no automated
axe pass, no keyboard-only walkthrough of the invoice/leave modals, and no check of
contrast in the dark and high-contrast themes. This deserves its own pass with a real
assistive-technology review, not a checkbox.

### 14. No visual regression — **open**
`.data/shots/` holds screenshots from every smoke run but nothing compares them.
Playwright's `toHaveScreenshot` with a baseline per role/route would catch layout
breakage; that is a CI storage decision (baselines grow quickly) as much as a test.

### 15. Storage service and GoTrue behaviour — **needs a real Supabase project**
The emulator reproduces the query builder, storage objects and JWT handling faithfully
enough to drive every handler, but three things can only be verified against Supabase
itself: signed-URL expiry and download disposition, real MFA factor enrolment
(`mfa.sync` calls `auth.admin.mfa.listFactors`), and RLS under real `auth.uid()` JWTs.
`test:rls` simulates the roles in Postgres, so the policies are exercised, but not the
GoTrue side.

---

## Explicitly not on this list

* **The March-2026 payroll spike** (479,500 total / 58 payslips) is the seeded annual
  bonus, not a rounding bug.
* **`profiles.mfa_enabled` is not writable through `PUT /api/data`** — it is derived from
  the auth service by `mfa.sync`; letting a client set it would let a user claim 2FA they
  do not have.
* **Concurrent sessions** (see #9) — intended behaviour, not a defect.
* **The demo login endpoints** accept any password on purpose: this is a demo build with
  seeded accounts, and the endpoint is only mounted by `dev/server.mjs`.
