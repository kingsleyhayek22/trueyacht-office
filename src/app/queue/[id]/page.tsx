import { notFound } from "next/navigation";
import { requireStaff, getNavCounts } from "@/lib/data";
import { Shell } from "@/components/Shell";
import { approve, reject } from "./actions";

export default async function SubmissionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, fullName } = await requireStaff();

  const { data: submission, error } = await supabase
    .from("crew_expense_submissions")
    .select(
      "id, vendor, date, amount, currency, raw_extraction, is_handwritten, line_items_reconciled, payment_method, receipt_image_url, status, vessels(name), charter_schedule(charter_name), expense_categories(label)"
    )
    .eq("id", id)
    .single();

  if (error || !submission) {
    console.error(`submission detail query failed for id=${id}:`, error ?? "no row returned");
    notFound();
  }

  // description lives inside the extraction blob, not as its own column
  const description = (submission.raw_extraction as { description?: string } | null)?.description ?? "";

  const { data: splitLines } = await supabase
    .from("crew_expense_split_lines")
    .select("amount, expense_categories(label), charter_schedule(charter_name)")
    .eq("submission_id", id);

  let imageUrl: string | null = null;
  if (submission.receipt_image_url) {
    const { data: signed } = await supabase.storage
      .from("crew-receipts")
      .createSignedUrl(submission.receipt_image_url, 3600);
    imageUrl = signed?.signedUrl ?? null;
  }

  const counts = await getNavCounts(supabase);

  const vesselName = (submission.vessels as unknown as { name: string } | null)?.name ?? "—";
  const charterName = (submission.charter_schedule as unknown as { charter_name: string } | null)?.charter_name;
  const categoryLabel = (submission.expense_categories as unknown as { label: string } | null)?.label;

  return (
    <Shell active="queue" userName={fullName} counts={counts}>
      <div className="detail-top">
        <a href="/queue">‹ Back to queue</a>
      </div>
      <div className="main-top">
        <h1>
          {submission.vendor} — {submission.currency} {Number(submission.amount).toFixed(2)}
        </h1>
      </div>

      <div className="detail-grid">
        <div className="panel">
          <div className="panel-title">Receipt</div>
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="Receipt" className="receipt-img" />
          ) : (
            <div className="no-image">No receipt image on file.</div>
          )}
        </div>

        <div className="panel">
          {submission.is_handwritten && (
            <div className="flag-banner">Handwritten — flagged, no printed source to cross-check.</div>
          )}
          {submission.line_items_reconciled === false && (
            <div className="flag-banner">Line items don&apos;t add up to the receipt total.</div>
          )}

          <dl className="field-row">
            <dt>Vessel</dt>
            <dd>{vesselName}</dd>
            <dt>Date</dt>
            <dd>{submission.date}</dd>
            <dt>Description</dt>
            <dd>{description || "—"}</dd>
            <dt>Payment method</dt>
            <dd>{submission.payment_method}</dd>
            {splitLines && splitLines.length > 0 ? (
              <>
                <dt>Split</dt>
                <dd>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {splitLines.map((l, i) => (
                      <li key={i}>
                        {submission.currency} {Number(l.amount).toFixed(2)} —{" "}
                        {(l.expense_categories as unknown as { label: string } | null)?.label ?? "—"} —{" "}
                        {(l.charter_schedule as unknown as { charter_name: string } | null)?.charter_name ??
                          "No charter"}
                      </li>
                    ))}
                  </ul>
                </dd>
              </>
            ) : (
              <>
                <dt>Category</dt>
                <dd>{categoryLabel ?? "—"}</dd>
                <dt>Charter</dt>
                <dd>{charterName ?? "No charter"}</dd>
              </>
            )}
          </dl>

          <div className="action-bar">
            <form action={approve.bind(null, submission.id)}>
              <button type="submit" className="btn primary">
                Approve
              </button>
            </form>
            <form action={reject.bind(null, submission.id)}>
              <button type="submit" className="btn ghost">
                Reject
              </button>
            </form>
          </div>
          <p className="action-hint">
            Approve logs the QBO payload this would create — it does not post to QBO yet.
          </p>
        </div>
      </div>
    </Shell>
  );
}
