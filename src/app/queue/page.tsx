import Link from "next/link";
import { requireStaff, getNavCounts } from "@/lib/data";
import { Shell } from "@/components/Shell";
import { RowLink } from "@/components/RowLink";

export default async function QueuePage() {
  const { supabase, fullName } = await requireStaff();

  const [{ data, error }, counts] = await Promise.all([
    supabase
      .from("crew_expense_submissions")
      .select("id, vendor, date, amount, currency, is_handwritten, line_items_reconciled, vessels(name)")
      .eq("status", "awaiting_review")
      .order("date", { ascending: true }),
    getNavCounts(supabase),
  ]);

  const rows = data ?? [];

  return (
    <Shell active="queue" userName={fullName} counts={counts}>
      <div className="main-top">
        <div>
          <h1>Review queue</h1>
          <div className="sub">
            Card submissions awaiting review — {rows.length} {rows.length === 1 ? "item" : "items"}.
          </div>
        </div>
      </div>

      {error ? (
        <p className="error-note">Couldn&apos;t load the queue: {error.message}</p>
      ) : rows.length === 0 ? (
        <p className="empty-note">Nothing waiting on you right now.</p>
      ) : (
        <table className="q">
          <thead>
            <tr>
              <th>Date</th>
              <th>Vessel</th>
              <th>Vendor</th>
              <th>Amount</th>
              <th>Flags</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const flags: string[] = [];
              if (r.is_handwritten) flags.push("Handwritten");
              if (r.line_items_reconciled === false) flags.push("Gap");

              return (
                <RowLink key={r.id} href={`/queue/${r.id}`}>
                  <td className="mono">{r.date}</td>
                  <td className="vessel-tag">
                    {(r.vessels as unknown as { name: string } | null)?.name ?? "—"}
                  </td>
                  <td className="vendor">{r.vendor}</td>
                  <td className="amt">
                    {r.currency} {Number(r.amount).toFixed(2)}
                  </td>
                  <td>
                    {flags.length > 0 ? (
                      <span className="flag-icon">⚑ {flags.join(", ")}</span>
                    ) : (
                      <span className="flag-icon none">—</span>
                    )}
                  </td>
                  <td className="row-arrow">
                    <Link href={`/queue/${r.id}`}>›</Link>
                  </td>
                </RowLink>
              );
            })}
          </tbody>
        </table>
      )}
    </Shell>
  );
}
