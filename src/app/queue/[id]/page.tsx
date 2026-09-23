import { notFound } from "next/navigation";
import { requireStaff, getNavCounts } from "@/lib/data";
import { Shell } from "@/components/Shell";
import { approve, reject } from "./actions";
import { CommentsPanel } from "@/components/CommentsPanel";
import { RejectButton } from "@/components/RejectButton";
import { PostToQboButton } from "@/components/PostToQboButton";
import { postToQbo } from "@/app/approved/actions";

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
      "id, vendor, date, amount, amount_usd, currency, raw_extraction, description, is_handwritten, line_items_reconciled, payment_method, receipt_image_url, status, qbo_purchase_id, qbo_posted_at, qbo_error, vessels(name), charter_schedule(charter_name), expense_categories(label)"
    )
    .eq("id", id)
    .single();

  if (error || !submission) {
    console.error(`submission detail query failed for id=${id}:`, error ?? "no row returned");
    notFound();
  }

  // confirmed description (column) first, AI's original (blob) as fallback
  const description = submission.description ?? (submission.raw_extraction as { description?: string } | null)?.description ?? "";

  // Confirmed line items — what the reviewer signed off on, one row per line.
  const { data: lines } = await supabase
    .from("crew_expense_lines")
    .select("description, amount, expense_categories(label), charter_schedule(charter_name)")
    .eq("submission_id", id)
    .order("line_no");

  const { data: comments } = await supabase
    .from("crew_expense_comments")
    .select("id, kind, body, author_name, created_at")
    .eq("submission_id", id)
    .order("created_at");

  let imageUrl: string | null = null;
  const isPdf = !!submission.receipt_image_url?.toLowerCase().endsWith(".pdf");
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

  const isApproved = submission.status === "approved" || submission.status === "posted";
  const isPosted = submission.status === "posted";
  const base = isApproved ? "/approved" : "/queue";

  return (
    <Shell active={isApproved ? "approved" : "queue"} userName={fullName} counts={counts}>
      <div className="detail-top">
        <a href={base}>{isApproved ? "‹ Back to approved" : "‹ Back to queue"}</a>
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
            isPdf ? (
              <iframe
                src={imageUrl}
                title="Receipt PDF"
                style={{ width: "100%", height: 600, border: "1px solid var(--line)", borderRadius: 10 }}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="Receipt" className="receipt-img" />
            )
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
            {submission.currency && submission.currency !== "USD" && (
              <>
                <dt>Amount in USD</dt>
                <dd>{submission.amount_usd ? `USD ${Number(submission.amount_usd).toFixed(2)} (posted to QBO)` : "— not entered"}</dd>
              </>
            )}
            <dt>Description</dt>
            <dd>{description || "—"}</dd>
            <dt>Payment method</dt>
            <dd>{submission.payment_method}</dd>
          </dl>

          {lines && lines.length > 0 ? (
            <div className="li-view">
              <div className="li-edit-head">
                <span className="t">Line items</span>
                <span className="c">
                  {lines.length} {lines.length === 1 ? "line" : "lines"}
                </span>
              </div>
              <div className="li-view-row li-view-labels">
                <span className="desc">Description</span>
                <span className="amt">Amount</span>
                <span className="cat">Category</span>
                <span className="chr">Charter</span>
              </div>
              {lines.map((l, i) => (
                <div className="li-view-row" key={i}>
                  <span className="desc">{l.description || "—"}</span>
                  <span className="amt">{Number(l.amount).toFixed(2)}</span>
                  <span className="cat">
                    {(l.expense_categories as unknown as { label: string } | null)?.label ?? "—"}
                  </span>
                  <span className="chr">
                    {(l.charter_schedule as unknown as { charter_name: string } | null)?.charter_name ?? "No charter"}
                  </span>
                </div>
              ))}
              <div className="li-total-row ok">
                <span>Total</span>
                <span className="status">
                  {submission.currency} {lines.reduce((sum, l) => sum + Number(l.amount), 0).toFixed(2)}
                </span>
              </div>
            </div>
          ) : (
            <dl className="field-row">
              <dt>Category</dt>
              <dd>{categoryLabel ?? "—"}</dd>
              <dt>Charter</dt>
              <dd>{charterName ?? "No charter"}</dd>
            </dl>
          )}

          {isApproved ? (
            <>
            {isPosted ? (
              <div className="flag-banner">
                Posted to QBO{submission.qbo_posted_at ? ` on ${new Date(submission.qbo_posted_at).toLocaleString()}` : ""} — Purchase {submission.qbo_purchase_id}.
                {submission.qbo_error && <><br />{submission.qbo_error}</>}
              </div>
            ) : (
              <>
                {submission.qbo_error && <div className="flag-banner">Last post attempt failed: {submission.qbo_error}</div>}
                <div className="action-bar">
                  <PostToQboButton action={postToQbo.bind(null, submission.id)} />
                </div>
              </>
            )}
            </>
          ) : (
          <>
          <div className="action-bar">
            <form action={approve.bind(null, submission.id)}>
              <button type="submit" className="btn primary">
                Approve
              </button>
            </form>
            <RejectButton action={reject.bind(null, submission.id)} />
          </div>
          <p className="action-hint">
            Approve logs the QBO payload this would create — it does not post to QBO yet.
          </p>
          </>
          )}
        </div>

        <CommentsPanel submissionId={submission.id} path={`${base}/${submission.id}`} comments={comments ?? []} />
      </div>
    </Shell>
  );
}
