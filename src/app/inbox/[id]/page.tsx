import { notFound } from "next/navigation";
import { requireStaff, getNavCounts } from "@/lib/data";
import { Shell } from "@/components/Shell";
import { confirmSubmission, saveDraft, archiveSubmission, splitOff } from "./actions";
import { ArchiveButton } from "@/components/ArchiveButton";
import { EditForm } from "./EditForm";
import { CommentsPanel } from "@/components/CommentsPanel";

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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ split?: string }>;
}) {
  const { id } = await params;
  const { split: splitNew } = await searchParams;
  const { supabase, fullName } = await requireStaff();

  const { data: submission, error } = await supabase
    .from("crew_expense_submissions")
    .select(
      "id, vendor, date, amount, currency, raw_extraction, is_handwritten, line_items_reconciled, budget_category_key, charter_id, receipt_image_url, status, vessel_id, submission_source, source_sender_name, source_sender_email, source_subject, description, sent_back_at, created_at, possible_duplicate_of, split_from_id, unaccounted_items_note, bank_account_id, amount_usd, vessels(name)"
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
    suggested_category_key?: string | null;
    // `category` is the AI's label guess on a fresh extraction; `categoryKey`
    // is what confirmSubmission writes back once staff has assigned one —
    // present on any submission that's been through Confirm before.
    line_items?: { description: string; amount: number; category?: string; categoryKey?: string; charterId?: string }[];
  } | null;

  const [{ data: categories }, { data: charters }, { data: bankAccounts }, counts, { data: confirmedLines }, { data: comments }] = await Promise.all([
    supabase.from("expense_categories").select("key, label").order("label"),
    supabase
      .from("charter_schedule")
      .select("id, charter_name, start_date, end_date")
      .eq("vessel_id", submission.vessel_id)
      .order("start_date", { ascending: false }),
    supabase
      .from("bank_accounts")
      .select("id, name, account_type, last4")
      .eq("vessel_id", submission.vessel_id)
      .eq("is_active", true)
      .order("name"),
    getNavCounts(supabase),
    supabase
      .from("crew_expense_lines")
      .select("description, amount, budget_category_key, charter_id, extracted_line_no")
      .eq("submission_id", submission.id)
      .order("line_no"),
    supabase
      .from("crew_expense_comments")
      .select("id, kind, body, author_name, created_at")
      .eq("submission_id", submission.id)
      .order("created_at"),
  ]);
  const lastRejection = [...(comments ?? [])].reverse().find((c) => c.kind === "reject");

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

  // Same label -> key matching as the overall category above, applied per
  // line item — a fresh extraction only has the AI's label guess
  // (`category`); once staff has confirmed once, `categoryKey` is already
  // there directly and takes precedence.
  function keyForCategoryLabel(label: string | undefined): string {
    if (!label) return "";
    const hit = categories?.find((c) => c.label.trim().toLowerCase() === label.trim().toLowerCase());
    return hit?.key ?? "";
  }

  // Every receipt is a list of lines. Older extractions may have none —
  // synthesize one line from the description + total so there is always at
  // least one line to categorise. A lone line with no category of its own
  // falls back to the submission's saved / suggested category.
  const fallbackKey =
    submission.budget_category_key ??
    extraction?.suggested_category_key ??
    keyForCategoryLabel(extraction?.suggested_category);
  // If staff has confirmed before, show THEIR lines (with the link back to the
  // AI's original line); otherwise the AI's own lines. Either way a receipt
  // always has at least one line.
  const aiLines =
    (extraction?.line_items ?? []).length > 0
      ? extraction!.line_items!
      : [{ description: extraction?.description ?? submission.vendor ?? "", amount: Number(submission.amount) || 0 }];
  type Start = { description: string; amount: number; categoryKey: string; charterId: string; extractedNo: number | null };
  const startingLines: Start[] =
    confirmedLines && confirmedLines.length > 0
      ? confirmedLines.map((l) => ({
          description: l.description,
          amount: Number(l.amount),
          categoryKey: l.budget_category_key ?? "",
          charterId: l.charter_id ? String(l.charter_id) : "",
          extractedNo: l.extracted_line_no,
        }))
      : aiLines.map((li: { description: string; amount: number; category?: string; categoryKey?: string }, i: number) => ({
          description: li.description,
          amount: li.amount,
          categoryKey:
            li.categoryKey || keyForCategoryLabel(li.category) || (aiLines.length === 1 ? (fallbackKey ?? "") : ""),
          charterId: submission.charter_id ? String(submission.charter_id) : "",
          // A synthesized line (no AI lines existed) has no original to link to.
          extractedNo: (extraction?.line_items ?? []).length > 0 ? i : null,
        }));

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
      {submission.possible_duplicate_of && (
        <div className="panel" style={{ borderColor: "var(--amber, #d9a400)", marginBottom: "1rem" }}>
          <strong>Possible duplicate.</strong> Same vessel and amount as{" "}
          <a href={`/inbox/${submission.possible_duplicate_of}`}>submission #{submission.possible_duplicate_of}</a>{" "}
          (within 60 days) — check this isn&apos;t the same expense submitted twice, or a proof of payment for it.
        </div>
      )}

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
          {submission.sent_back_at && (
            <div className="flag-banner">
              Sent back from the Queue on {new Date(submission.sent_back_at).toLocaleString()} — the data below is
              what was last reviewed. Edit and confirm again.
              {lastRejection && (
                <>
                  <br />
                  <strong>Reason:</strong> {lastRejection.body}
                </>
              )}
            </div>
          )}
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

          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.5rem" }}>
            <ArchiveButton
              action={archiveSubmission.bind(null, submission.id)}
              defaultReason={submission.possible_duplicate_of ? `Duplicate of #${submission.possible_duplicate_of}` : ""}
            />
          </div>
          {splitNew && (
            <div className="flag-banner">
              Split done — the selected lines are now in <a href={`/inbox/${splitNew}`}>#{splitNew}</a>. This receipt keeps the rest.
            </div>
          )}
          {submission.split_from_id && (
            <div className="flag-banner">
              Part of a split receipt — shares its file with <a href={`/inbox/${submission.split_from_id}`}>#{submission.split_from_id}</a>.
            </div>
          )}
          <EditForm
            key={`${submission.id}-${submission.amount}-${startingLines.length}`}
            action={confirmSubmission.bind(null, submission.id)}
            draftAction={saveDraft.bind(null, submission.id)}
            splitAction={splitOff.bind(null, submission.id)}
            currency={submission.currency ?? "USD"}
            categories={categories ?? []}
            charters={charters ?? []}
            bankAccounts={bankAccounts ?? []}
            initialAmountUsd={submission.amount_usd ? String(submission.amount_usd) : ""}
            initialBankAccountId={submission.bank_account_id ? String(submission.bank_account_id) : ""}
            initial={{
              vendor: submission.vendor ?? "",
              date: submission.date ?? "",
              amount: submission.amount ? Number(submission.amount) : 0,
              description: submission.description ?? extraction?.description ?? "",
              lineItems: startingLines,
            }}
          />
        </div>

        <CommentsPanel submissionId={submission.id} path={`/inbox/${submission.id}`} comments={comments ?? []} />
      </div>
    </Shell>
  );
}
