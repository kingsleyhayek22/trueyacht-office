# TrueYacht Office

Staff-only review queue for crew expense submissions. Separate app/repo from
TrueYacht Dashboard (owner-facing) on purpose — see
`Office - Plan & Scope.md` in the Obsidian vault for the full reasoning and
roadmap.

## v1 scope

Card-transaction submissions only. Review queue → Approve/Reject. Approve
**logs** the QuickBooks payload it would create — it does not post to QBO
yet (that's next, once this pass is verified end-to-end).

## Setup

```
npm install
```

Copy `env.local.filled.txt` to `.env.local` (it already has the real
Supabase URL + anon key filled in — same project as Dashboard/Crew), then
delete `env.local.filled.txt`.

```
npm run dev
```

Runs on http://localhost:8021. Sign in with a Supabase Auth account that
also has a `staff_users` row — right now that's just Samuel's account.
Anyone without one gets bounced back to the login page.

## What "Approve" actually does right now

1. Looks up the payment account (from `bank_accounts`) and expense account
   (from `account_config`) for the submission's vessel/card/category via the
   `staff_get_qbo_account_mapping` RPC.
2. Prints the resulting "would-create" QBO Purchase payload to the server
   console (wherever `npm run dev`/`npm start` is running).
3. Sets the submission's status to `posted` and records who reviewed it.

No QuickBooks credentials are used or needed for this.
