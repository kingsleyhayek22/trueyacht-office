import Link from "next/link";
import { requireStaff, getNavCounts } from "@/lib/data";
import { Shell } from "@/components/Shell";
import { RowLink } from "@/components/RowLink";
import { MatchedCheckbox } from "@/components/MatchedCheckbox";
import { setMatched } from "./actions";

export default async function ApprovedPage() {
  const { supabase, fullName } = await requireStaff();

  const [{ data, error }, counts] = await Promise.all([
    supabase
      .from("crew_expense_submissions")
      .select("id, vendor, date, amount, amount_usd, currency, reviewed_at, status, qbo_error, qbo_matched_at, vessels(name)")
      .in("status", ["approved", "posted"])
      .order("reviewed_at", { ascending: false }),
    getNavCounts(supabase),
  ]);

  const rows = data ?? [];

  return (
    <Shell active="approved" userName={fullName} counts={counts}>
      <div className="main-top">
        <div>
          <h1>Approved</h1>
          <div className="sub">
            Receipts you&apos;ve approved — {rows.length} {rows.length === 1 ? "item" : "items"}.
          </div>
        </div>
      </div>

      {error ? (
        <p className="error-note">Couldn&apos;t load approved receipts: {error.message}</p>
      ) : rows.length === 0 ? (
        <p className="empty-note">Nothing approved yet.</p>
      ) : (
        <table className="q">
          <thead>
            <tr>
              <th>Date</th>
              <th>Vessel</th>
              <th>Vendor</th>
              <th>Amount</th>
              <th>Approved</th>
              <th>QBO</th>
              <th>Matched in QBO</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <RowLink key={r.id} href={`/approved/${r.id}`}>
                <td className="mono">{r.date}</td>
                <td className="vessel-tag">
                  {(r.vessels as unknown as { name: string } | null)?.name ?? "—"}
                </td>
                <td className="vendor">{r.vendor}</td>
                <td className="amt">
                  {r.currency} {Number(r.amount).toFixed(2)}{r.currency && r.currency !== "USD" && r.amount_usd ? ` (USD ${Number(r.amount_usd).toFixed(2)})` : ""}
                </td>
                <td className="mono">{r.reviewed_at ? r.reviewed_at.slice(0, 10) : "—"}</td>
                <td>
                  {r.status === "posted" ? (
                    <span className="status-chip posted">Posted</span>
                  ) : r.qbo_error ? (
                    <span className="flag-icon">⚑ Error</span>
                  ) : (
                    <span className="flag-icon none">Not posted</span>
                  )}
                </td>
                <td>
                  <MatchedCheckbox initial={!!r.qbo_matched_at} action={setMatched.bind(null, r.id)} />
                </td>
                <td className="row-arrow">
                  <Link href={`/approved/${r.id}`}>›</Link>
                </td>
              </RowLink>
            ))}
          </tbody>
        </table>
      )}
    </Shell>
  );
}
