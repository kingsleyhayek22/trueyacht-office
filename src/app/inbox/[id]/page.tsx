import { notFound } from "next/navigation";
import { requireStaff, getNavCounts } from "@/lib/data";
import { Shell } from "@/components/Shell";
import { confirmSubmission } from "./actions";
import { EditForm } from "./EditForm";

/**
 * Editable Inbox detail page (Wireframe 05 — "Edit & Confirm"). Same
 * receipt-viewer layout as Queue's detail page, but every extracted data
 * point and every receipt line item is editable. Covers both states:
 *   A. status="extracted" — fields already filled in, staff just correct
 *      anything wrong.
 *   B. status="captured" — extraction couldn't find a required field
 *      (vendor/date); those start empty and block Confirm until filled.
 * Confirm saves everything and moves the row into Queue (awaiting_review).
 */
export default async function InboxDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, fullName } = await requireStaff();

  const { data: submission, error } = await supabase
    .from("crew_expense_submissions")
    .select(
      "id, vendor, date, amount, currency, raw_extraction, is_handwritten, line_items_reconciled, budget_category_key, charter_id, receipt_image_url, status, vessel_id, submission_source, source_sender_name, source_sender_email, source_subject, created_at, vessels(name)"
    )
    .eq("id", id)
    .single();

  if (error || !submission) {
    console.error(`inbox detail query failed for id=${id}:`, error ?? "no row returned");
    notFound();
  }

  const extraction = submission.raw_extraction as {
    description?: string;
    customer_guess?: string;
    suggested_category?: string;
    // `category` is the AI's label guess on a fresh extraction; `categoryKey`
    // is what confirmSubmission writes back once staff has assigned one —
    // present on any submission that's been through Confirm before.
    line_items?: { description: string; amount: number; category?: string; categoryKey?: string; charterId?: string }[];
  } | null;

  const [{ data: categories }, { data: charters }, counts] = await Promise.all([
    supabase.from("expense_categories").select("key, label").order("label"),
    supabase
      .from("charter_schedule")
      .select("id, charter_name, start_date, end_date")
      .eq("vessel_id", submission.vessel_id)
      .order("start_date", { ascending: false }),
    getNavCounts(supabase),
  ]);

  let imageUrl: string | null = null;
  let isPdf = false;
  if (submission.receipt_image_url) {
    isPdf = submission.receipt_image_url.toLowerCase().endsWith(".pdf");
    const { data: signed } = await supabase.storage
      .from("crew-receipts")
      .createSignedUrl(submission.receipt_image_url, 3600);
    imageUrl = signed?.signedUrl ?? null;
  }

  const vesselName = (submission.vessels as unknown as { name: string } | null)?.name ?? "—";

  // Pre-select category: use the saved key if there is one, otherwise try
  // to match the AI's suggested_category label so staff aren't starting
  // from a blank dropdown on a fresh extraction.
  const suggested = extraction?.suggested_category?.trim().toLowerCase();
  const matchedCategoryKey =
    submission.budget_category_key ??
    (suggested ? categories?.find((c) => c.label.trim().toLowerCase() === suggested)?.key : undefined) ??
    "";

  // Same label -> key matching as the overall category above, applied per
  // line item — a fresh extraction only has the AI's label guess
  // (`category`); once staff has confirmed once, `categoryKey` is already
  // there directly and takes precedence.
  function keyForCategoryLabel(label: string | undefined): string {
    if (!label) return "";
    const hit = categories?.find((c) => c.label.trim().toLowerCase() === label.trim().toLowerCase());
    return hit?.key ?? "";
  }

  const title = submission.vendor
    ? `${submission.vendor}${submission.amount ? ` — ${submission.currency} ${Number(submission.amount).toFixed(2)}` : ""}`
    : submission.source_subject || "Needs manual entry";

  return (
    <Shell active="inbox" userName={fullName} counts={counts}>
      <div className="detail-top">
        <a href="/inbox">‹ Back to inbox</a>
      </div>
      <div className="main-top">
        <h1>{title}</h1>
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
            <div className="no-image">No file on record.</div>
          )}
          <dl className="field-row" style={{ marginTop: "0.4rem" }}>
            <dt>Vessel</dt>
            <dd>{vesselName}</dd>
            <dt>Received</dt>
            <dd>{new Date(submission.created_at).toLocaleString()}</dd>
            {submission.submission_source === "email" && (
              <>
                <dt>From</dt>
                <dd>
                  {submission.source_sender_name} &lt;{submission.source_sender_email}&gt;
                </dd>
                <dt>Subject</dt>
                <dd>{submission.source_subject}</dd>
              </>
            )}
          </dl>
        </div>

        <div className="panel">
          {submission.status === "captured" && (
            <div className="flag-banner">
              Couldn&apos;t auto-extract every field on this one — fill in what&apos;s missing below.
            </div>
          )}
          {submission.is_handwritten && (
            <div className="flag-banner">Handwritten — flagged, no printed source to cross-check.</div>
          )}
          {submission.line_items_reconciled === false && (
            <div className="flag-banner">Line items don&apos;t add up to the receipt total — check below.</div>
          )}

          <EditForm
            action={confirmSubmission.bind(null, submission.id)}
            currency={submission.currency ?? "USD"}
            categories={categories ?? []}
            charters={charters ?? []}
            suggestedCategory={extraction?.suggested_category}
            customerGuess={extraction?.customer_guess}
            initial={{
              vendor: submission.vendor ?? "",
              date: submission.date ?? "",
              amount: submission.amount ? Number(submission.amount) : 0,
              description: extraction?.description ?? "",
              categoryKey: matchedCategoryKey,
              charterId: submission.charter_id ? String(submission.charter_id) : "",
              lineItems: (extraction?.line_items ?? []).map((li) => ({
                description: li.description,
                amount: li.amount,
                categoryKey: li.categoryKey ?? keyForCategoryLabel(li.category),
                // A fresh extraction has no per-line charter guess (nothing
                // infers it from the receipt) — start each line from the
                // submission's own overall charter, if one's already set,
                // rather than blank; `charterId` on the line takes over once
                // staff has confirmed once and it round-trips.
                charterId: li.charterId ?? (submission.charter_id ? String(submission.charter_id) : ""),
              })),
            }}
          />
        </div>
      </div>
    </Shell>
  );
}
