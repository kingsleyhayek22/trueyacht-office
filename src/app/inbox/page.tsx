import Link from "next/link";
import { requireStaff, getNavCounts, INBOX_METHODS } from "@/lib/data";
import { Shell } from "@/components/Shell";
import { RowLink } from "@/components/RowLink";

/**
 * List of receipts that exist (captured, or extracted by the
 * receipts@trueyacht.com script) but haven't reached awaiting_review yet.
 * Click a row to open /inbox/[id] and run Confirm/Category/Charter.
 */
export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ vessel?: string; method?: string }>;
}) {
  const { vessel, method } = await searchParams;
  const { supabase, fullName } = await requireStaff();

  const vesselId = Number(vessel) || undefined;
  const methodKey = INBOX_METHODS.find((m) => m.key === method)?.key;

  let q = supabase
    .from("crew_expense_submissions")
    .select(
      "id, vendor, amount, currency, status, submission_source, source_sender_name, source_sender_email, created_at, vessels(name)"
    )
    .in("status", ["captured", "extracted"])
    .order("created_at", { ascending: false });
  if (vesselId) q = q.eq("vessel_id", vesselId);
  if (methodKey) q = q.eq("submission_source", methodKey);

  const [{ data, error }, counts] = await Promise.all([q, getNavCounts(supabase)]);

  const rows = data ?? [];
  const yacht = counts.tree.find((y) => y.vesselId === vesselId);
  const crumbs = ["Inbox", yacht?.name, INBOX_METHODS.find((m) => m.key === methodKey)?.label].filter(Boolean).join(" › ");

  return (
    <Shell active="inbox" userName={fullName} counts={counts} activeVessel={vesselId} activeMethod={methodKey}>
      <div className="main-top">
        <div>
          <h1>{crumbs}</h1>
          <div className="sub">
            Receipts captured but not yet ready for review — {rows.length} {rows.length === 1 ? "item" : "items"}.
          </div>
        </div>
      </div>

      {error ? (
        <p className="error-note">Couldn&apos;t load the inbox: {error.message}</p>
      ) : rows.length === 0 ? (
        <p className="empty-note">Nothing waiting here.</p>
      ) : (
        <table className="q">
          <thead>
            <tr>
              <th>Received</th>
              <th>Source</th>
              <th>Vessel</th>
              <th>Vendor</th>
              <th>Amount</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <RowLink key={r.id} href={`/inbox/${r.id}`}>
                <td className="mono">{new Date(r.created_at).toLocaleDateString()}</td>
                <td className="vessel-tag">
                  {r.submission_source === "email"
                    ? r.source_sender_name || r.source_sender_email || "Email"
                    : r.submission_source === "whatsapp"
                      ? "WhatsApp"
                      : "Crew app"}
                </td>
                <td className="vessel-tag">{(r.vessels as unknown as { name: string } | null)?.name ?? "—"}</td>
                <td className={r.vendor ? "vendor" : "vendor faint"}>{r.vendor ?? "Not extracted yet"}</td>
                <td className="amt">{r.vendor ? `${r.currency} ${Number(r.amount).toFixed(2)}` : "—"}</td>
                <td>
                  <span className={`status-chip ${r.status}`}>{r.status}</span>
                </td>
                <td className="row-arrow">
                  <Link href={`/inbox/${r.id}`}>›</Link>
                </td>
              </RowLink>
            ))}
          </tbody>
        </table>
      )}
    </Shell>
  );
}
