# TrueYacht Office — Project Context for Claude

> Read this in full before doing anything else in this repo. The living
> plan/decision log is `Office - Plan & Scope.md` in the Obsidian vault
> (`...\Software\In-house\Crew\Office - Plan & Scope.md`) — read that too,
> it's the source of truth for scope and open decisions. This file is the
> terse technical reference.

## What this is

Staff-only review queue for crew expense submissions coming out of the
TrueYacht Crew app (see the separate `TrueYacht Crew` repo). A staff member
(Samuel, Angie, ...) reviews a submitted receipt, then Approves or Rejects
it. This is deliberately a **separate app and repo** from TrueYacht
Dashboard (owner-facing financial reporting) — Dashboard's
`user_vessel_access` table includes both owners and staff with no
distinction, so building this as new Dashboard pages would have given
owners visibility Samuel explicitly did not want them to have. See
Office - Plan & Scope.md → "Why this is a separate app" for the full
reasoning.

## Architecture (locked for v1)

- **Stack:** Next.js 15 App Router, TypeScript strict — matches
  Dashboard/Internal/Crew conventions, minus Tailwind (kept deliberately
  minimal/unstyled for v1 per Samuel's "real repo, minimal pages" call).
- **Supabase:** same project as Dashboard/Crew, `hcgnwhhfpcqiqnjxhlip` — do
  not stand up a second project. Anon key only (`NEXT_PUBLIC_SUPABASE_URL` /
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`) — **no service_role key anywhere in this
  app**, same rule Dashboard follows. Access control is entirely RLS via
  `is_trueyacht_staff()`.
- **Auth:** same `auth.users` as Dashboard/Crew — no separate signup. A
  session alone isn't enough; `src/lib/data.ts#requireStaff()` also checks
  `is_trueyacht_staff()` (a `staff_users` row) and is called at the top of
  every page. `middleware.ts` only checks "is there a session" (cheap,
  every request); the staff check is per-page (needs a DB round trip).
- **QBO:** log-only for this first pass (Samuel's 2026-09-12 decision — QBO
  is live/production with no sandbox, and there was no existing
  create-Expense code anywhere to build on). `src/app/queue/[id]/actions.ts`
  → `approve()` resolves account names via the `staff_get_qbo_account_mapping`
  RPC and `console.log`s the payload it would POST. **Do not wire an actual
  QBO API call without confirming with Samuel first** — check
  Office - Plan & Scope.md for the current decision before changing this.
- **`staff_get_qbo_account_mapping(p_vessel_id, p_bank_account_id, p_category_key)`**
  is a narrow SECURITY DEFINER RPC (staff-gated internally) added specifically
  so Office can resolve QBO account names without needing broad SELECT on
  `bank_accounts`/`account_config` — those are gated on `user_vessel_ids()`
  (owner-inclusive) and carry balance data Office has no business reading.
  If a future feature needs more from those tables, extend this RPC's
  return columns rather than granting the tables directly.
- **Storage:** `crew-receipts` bucket is private. A `"staff read crew-receipts"`
  RLS policy on `storage.objects` (additive, alongside the existing
  crew/owner policy) lets any `is_trueyacht_staff()` user read any receipt
  image. Detail page calls `createSignedUrl()` per view rather than storing
  a permanent URL.

## Conventions

- snake_case in Postgres, camelCase in TypeScript.
- Server Components + Server Actions only — no client-side Supabase client
  exists in this app yet (login form posts to a Server Action). Add
  `src/lib/supabase/client.ts` only if a page genuinely needs client-side
  interactivity.

## What's built (v1 slice, 2026-09-12)

- Login (email/password, Supabase Auth, staff-gated).
- `/queue` — list of `crew_expense_submissions` where `status='awaiting_review'`.
- `/queue/[id]` — detail: receipt image, extracted fields, split lines (if
  any), Approve (logs QBO preview, sets `status='approved'`) / Reject
  (`status='rejected'`).

## Not yet built

Everything else in Office - Plan & Scope.md's roadmap: Send Back UI (that's
the Crew app's job, not this one), per-submission audit trail, crew usage
analytics, staff notes (crew-facing + internal), staff feedback box, cash
submissions, linked-transaction display, live QBO posting.

## When in doubt

Smaller slice over bigger. Ask Samuel before any real QBO write, any RLS
change on tables outside this app's own scope, or anything not already in
Office - Plan & Scope.md's v1 list.
