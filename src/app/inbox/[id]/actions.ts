"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/data";

type LineItem = { description: string; amount: number; categoryKey: string; charterId: string; extractedNo: number | null };

export type ConfirmState = { error: string | null; notice?: string | null };

/**
 * Confirm & Continue → Queue (Wireframe 05). Saves every edited field —
 * vendor/date/amount/description/category/charter/line items — then moves
 * the submission from captured/extracted into awaiting_review so it shows
 * up in the Queue for Approve/Reject. This is the one action for both
 * states (A: extracted, B: captured needing manual entry) — see the
 * wireframe's "one screen, two entry states" note. Bound to (submissionId)
 * and used with useActionState, so it returns { error } instead of
 * throwing for validation failures.
 */
export async function confirmSubmission(
  submissionId: number,
  _prevState: ConfirmState,
  formData: FormData
): Promise<ConfirmState> {
  const { supabase } = await requireStaff();

  const vendor = String(formData.get("vendor") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const bankAccountId = Number(formData.get("bank_account_id")) || null;
  const amountUsdRaw = Number(formData.get("amount_usd"));
  const lineItemsRaw = String(formData.get("line_items_json") ?? "[]");

  let lineItems: LineItem[] = [];
  try {
    const parsed = JSON.parse(lineItemsRaw);
    if (Array.isArray(parsed)) {
      lineItems = parsed
        .map((l) => ({
          description: String(l.description ?? "").trim(),
          amount: Number(l.amount) || 0,
          categoryKey: String(l.categoryKey ?? "").trim(),
          charterId: String(l.charterId ?? "").trim(),
          extractedNo: Number.isInteger(l.extractedNo) ? Number(l.extractedNo) : null,
        }))
        .filter((l) => l.description || l.amount);
    }
  } catch {
    return { error: "Couldn't read line items — try again." };
  }

  // A submission is valid with EITHER one overall category, OR every line
  // item carrying its own (a genuine per-line split — e.g. one invoice
  // mixing parts, labor, travel, and registration fees, which can't
  // honestly be forced into a single category).
  const allLinesCategorized = lineItems.length > 0 && lineItems.every((l) => l.categoryKey);
  const distinctLineCategories = new Set(lineItems.map((l) => l.categoryKey).filter(Boolean));
  const isSplit = allLinesCategorized && distinctLineCategories.size > 1;

  if (!vendor || !date || !amountRaw || !allLinesCategorized || !bankAccountId) {
    return { error: "Vendor, date, amount, Paid from, and a category on every line item are required before confirming." };
  }

  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Amount must be a valid positive number." };
  }

  // Non-USD receipts keep their printed amount/currency, but QBO is posted in USD —
  // so the USD amount actually charged is required before confirming.
  const { data: curRow } = await supabase.from("crew_expense_submissions").select("currency").eq("id", submissionId).single();
  const isForeign = !!curRow?.currency && curRow.currency !== "USD";
  if (isForeign && !(amountUsdRaw > 0)) {
    return { error: `This receipt is in ${curRow!.currency} — enter the USD amount charged before confirming.` };
  }
  const amountUsd = isForeign ? Number(amountUsdRaw.toFixed(2)) : null;

  const lineItemsTotal = lineItems.reduce((sum, l) => sum + l.amount, 0);
  const reconciled = lineItems.length === 0 ? null : Math.abs(lineItemsTotal - amount) < 0.01;

  // Submission-level category/charter are DERIVED from the lines (Queue's
  // Approve still reads them): one shared value -> that value; lines that
  // disagree -> null, and Approve uses crew_expense_split_lines instead.
  const effectiveCategoryKey = isSplit ? null : [...distinctLineCategories][0] ?? null;
  const distinctLineCharters = new Set(lineItems.map((l) => l.charterId).filter(Boolean));
  const charterId = distinctLineCharters.size === 1 && lineItems.every((l) => l.charterId)
    ? Number([...distinctLineCharters][0])
    : null;
  // Split rows are needed whenever lines differ on category OR charter.
  const needsSplitRows = isSplit || distinctLineCharters.size > 1 || (distinctLineCharters.size === 1 && charterId === null);

  const { error } = await supabase
    .from("crew_expense_submissions")
    .update({
      vendor,
      date,
      amount,
      // A genuine split has no single overall category — leave it null so
      // Approve's QBO-mapping (queue/[id]/actions.ts) falls back to the
      // crew_expense_split_lines rows below instead of one wrong category.
      budget_category_key: effectiveCategoryKey,
      charter_id: charterId,
      // raw_extraction (the AI's output) is deliberately NOT touched: it is the
      // "what was extracted" record the review diff compares against.
      description,
      bank_account_id: bankAccountId,
      amount_usd: amountUsd,
      line_items_reconciled: reconciled,
      line_items_gap_amount: lineItems.length === 0 ? null : Number((amount - lineItemsTotal).toFixed(2)),
      status: "awaiting_review",
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", submissionId);

  if (error) {
    return { error: `Confirm failed: ${error.message}` };
  }

  // Keep crew_expense_split_lines in sync with what was just confirmed.
  // Always clear old rows first — a submission that was once split and is
  // now consolidated back to one category shouldn't leave stale split rows
  // behind for Approve to pick up ahead of the real budget_category_key.
  const { error: clearError } = await supabase.from("crew_expense_split_lines").delete().eq("submission_id", submissionId);
  if (clearError) {
    return { error: `Confirm saved, but clearing old split lines failed: ${clearError.message}` };
  }

  // Confirmed line items — the reviewer's final version, one row per line.
  // extracted_line_no links each back to the AI's original line (null = added).
  const { error: clearLinesError } = await supabase.from("crew_expense_lines").delete().eq("submission_id", submissionId);
  if (clearLinesError) {
    return { error: `Confirm saved, but clearing old lines failed: ${clearLinesError.message}` };
  }
  const { error: linesError } = await supabase.from("crew_expense_lines").insert(
    lineItems.map((l, i) => ({
      submission_id: submissionId,
      line_no: i,
      description: l.description,
      amount: l.amount,
      budget_category_key: l.categoryKey,
      charter_id: l.charterId ? Number(l.charterId) : null,
      extracted_line_no: l.extractedNo,
    }))
  );
  if (linesError) {
    return { error: `Confirm saved, but writing lines failed: ${linesError.message}` };
  }

  if (needsSplitRows) {
    const splitRows = lineItems
      .filter((l) => l.categoryKey && l.amount)
      .map((l) => ({
        submission_id: submissionId,
        amount: l.amount,
        budget_category_key: l.categoryKey,
        charter_id: l.charterId ? Number(l.charterId) : null,
      }));
    const { error: splitError } = await supabase.from("crew_expense_split_lines").insert(splitRows);
    if (splitError) {
      return { error: `Confirm saved, but writing split lines failed: ${splitError.message}` };
    }
  }

  redirect("/inbox");
}

/**
 * Save draft — keeps the edits without confirming. Writes the header fields,
 * description and every line to the same places Confirm does, but leaves
 * status ('extracted'/'captured') and confirmed_at alone, so the receipt stays
 * in the Inbox and the review diffs ignore it until it is actually confirmed.
 * Nothing is required: a half-finished line (no category yet) is fine here.
 * raw_extraction (the AI's output) is never touched.
 */
export async function saveDraft(
  submissionId: number,
  _prevState: ConfirmState,
  formData: FormData
): Promise<ConfirmState> {
  const { supabase } = await requireStaff();

  const vendor = String(formData.get("vendor") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const bankAccountId = Number(formData.get("bank_account_id")) || null;
  const draftUsd = Number(formData.get("amount_usd"));

  let lineItems: LineItem[] = [];
  try {
    const parsed = JSON.parse(String(formData.get("line_items_json") ?? "[]"));
    if (Array.isArray(parsed)) {
      lineItems = parsed
        .map((l) => ({
          description: String(l.description ?? "").trim(),
          amount: Number(l.amount) || 0,
          categoryKey: String(l.categoryKey ?? "").trim(),
          charterId: String(l.charterId ?? "").trim(),
          extractedNo: Number.isInteger(l.extractedNo) ? Number(l.extractedNo) : null,
        }))
        .filter((l) => l.description || l.amount || l.categoryKey);
    }
  } catch {
    return { error: "Couldn't read line items — try again." };
  }

  const amount = amountRaw === "" ? null : Number(amountRaw);
  if (amount !== null && !Number.isFinite(amount)) {
    return { error: "Amount must be a number." };
  }

  const { error } = await supabase
    .from("crew_expense_submissions")
    .update({ vendor: vendor || null, date: date || null, amount, description: description || null, bank_account_id: bankAccountId, amount_usd: draftUsd > 0 ? Number(draftUsd.toFixed(2)) : null })
    .eq("id", submissionId);
  if (error) return { error: `Saving draft failed: ${error.message}` };

  const { error: clearError } = await supabase.from("crew_expense_lines").delete().eq("submission_id", submissionId);
  if (clearError) return { error: `Saving draft failed: ${clearError.message}` };

  if (lineItems.length > 0) {
    const { error: linesError } = await supabase.from("crew_expense_lines").insert(
      lineItems.map((l, i) => ({
        submission_id: submissionId,
        line_no: i,
        description: l.description,
        amount: l.amount,
        budget_category_key: l.categoryKey || null,
        charter_id: l.charterId ? Number(l.charterId) : null,
        extracted_line_no: l.extractedNo,
      }))
    );
    if (linesError) return { error: `Saving draft failed: ${linesError.message}` };
  }

  revalidatePath(`/inbox/${submissionId}`);
  return { error: null, notice: `Draft saved at ${new Date().toLocaleTimeString()}.` };
}

/**
 * Archive — takes a receipt out of the Inbox for good (e.g. a duplicate) with a
 * required reason saved to its commentary. The row is kept with status 'voided',
 * which is what stops process-email-receipts from importing the same email again
 * (it skips any email whose source_message_id already has a row).
 */
export async function archiveSubmission(submissionId: number, formData: FormData) {
  const { supabase, userId, fullName } = await requireStaff();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) redirect(`/inbox/${submissionId}`);

  const { error } = await supabase
    .from("crew_expense_submissions")
    .update({ status: "voided", reviewed_by: userId, reviewed_at: new Date().toISOString() })
    .eq("id", submissionId)
    .in("status", ["captured", "extracted"]);
  if (error) throw new Error(`Archive failed: ${error.message}`);

  const { error: commentError } = await supabase.from("crew_expense_comments").insert({
    submission_id: submissionId,
    kind: "archive",
    body: reason,
    author_id: userId,
    author_name: fullName,
  });
  if (commentError) throw new Error(`Archived, but saving the reason failed: ${commentError.message}`);

  redirect("/inbox");
}

/**
 * Split off — one receipt paid as several separate charges (e.g. two passengers'
 * tickets on one invoice, charged as two card transactions). The selected lines
 * move into a NEW Inbox item that shares the same receipt file; each side's
 * header amount becomes the total of its own lines, so each can be reviewed,
 * approved and posted as its own QBO expense. The other fields are saved as they
 * are in the form. raw_extraction (the AI snapshot) is copied unchanged.
 */
export async function splitOff(
  submissionId: number,
  _prevState: ConfirmState,
  formData: FormData
): Promise<ConfirmState> {
  const { supabase, userId, fullName } = await requireStaff();

  let lineItems: LineItem[] = [];
  let picked: number[] = [];
  try {
    const parsed = JSON.parse(String(formData.get("line_items_json") ?? "[]"));
    lineItems = (Array.isArray(parsed) ? parsed : []).map((l) => ({
      description: String(l.description ?? "").trim(),
      amount: Number(l.amount) || 0,
      categoryKey: String(l.categoryKey ?? "").trim(),
      charterId: String(l.charterId ?? "").trim(),
      extractedNo: Number.isInteger(l.extractedNo) ? Number(l.extractedNo) : null,
    }));
    const p = JSON.parse(String(formData.get("split_indexes") ?? "[]"));
    picked = (Array.isArray(p) ? p : []).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < lineItems.length);
  } catch {
    return { error: "Couldn't read the lines — try again." };
  }
  const pickedSet = new Set(picked);
  const moved = lineItems.filter((_, i) => pickedSet.has(i));
  const kept = lineItems.filter((_, i) => !pickedSet.has(i));
  if (moved.length === 0 || kept.length === 0) {
    return { error: "Select at least one line to split off, and leave at least one line behind." };
  }
  const total = (ls: LineItem[]) => Number(ls.reduce((s, l) => s + l.amount, 0).toFixed(2));
  if (total(moved) <= 0 || total(kept) <= 0) return { error: "Each side needs a total above zero." };

  const vendor = String(formData.get("vendor") ?? "").trim() || null;
  const date = String(formData.get("date") ?? "").trim() || null;
  const description = String(formData.get("description") ?? "").trim() || null;
  const bankAccountId = Number(formData.get("bank_account_id")) || null;

  const { data: orig, error: origErr } = await supabase
    .from("crew_expense_submissions")
    .select("*")
    .eq("id", submissionId)
    .single();
  if (origErr || !orig) return { error: "Couldn't load the receipt." };
  if (!["captured", "extracted"].includes(orig.status)) return { error: "Only Inbox items can be split." };

  // 1. New submission for the moved lines (same receipt file + AI snapshot).
  const { data: created, error: insErr } = await supabase
    .from("crew_expense_submissions")
    .insert({
      vessel_id: orig.vessel_id,
      crew_profile_id: orig.crew_profile_id,
      status: orig.status,
      receipt_image_url: orig.receipt_image_url,
      raw_extraction: orig.raw_extraction,
      vendor,
      date,
      amount: total(moved),
      currency: orig.currency,
      payment_method: orig.payment_method,
      is_handwritten: orig.is_handwritten,
      line_items_reconciled: true,
      line_items_gap_amount: 0,
      line_items_gap_ratio: 0,
      unaccounted_items_note: orig.unaccounted_items_note,
      bank_account_id: bankAccountId,
      submission_source: orig.submission_source,
      source_sender_name: orig.source_sender_name,
      source_sender_email: orig.source_sender_email,
      source_subject: orig.source_subject,
      source_message_id: orig.source_message_id,
      source_attachment_name: orig.source_attachment_name,
      extraction_input_tokens: orig.extraction_input_tokens,
      extraction_output_tokens: orig.extraction_output_tokens,
      description,
      amount_usd: null, // a foreign-currency split needs its own USD amount entered
      prompt_version: orig.prompt_version,
      extraction_model: orig.extraction_model,
      split_from_id: orig.split_from_id ?? orig.id,
    })
    .select("id")
    .single();
  if (insErr || !created) return { error: `Split failed: ${insErr?.message ?? "no row returned"}` };
  const newId = created.id as number;

  const lineRows = (ls: LineItem[], sid: number) =>
    ls.map((l, i) => ({
      submission_id: sid,
      line_no: i,
      description: l.description,
      amount: l.amount,
      budget_category_key: l.categoryKey || null,
      charter_id: l.charterId ? Number(l.charterId) : null,
      extracted_line_no: l.extractedNo,
    }));

  const { error: newLinesErr } = await supabase.from("crew_expense_lines").insert(lineRows(moved, newId));
  if (newLinesErr) return { error: `Split created #${newId} but writing its lines failed: ${newLinesErr.message}` };

  // 2. Original keeps the remaining lines; header amount follows its lines.
  const { error: upErr } = await supabase
    .from("crew_expense_submissions")
    .update({
      vendor, date, description, bank_account_id: bankAccountId, amount_usd: null,
      amount: total(kept), line_items_reconciled: true, line_items_gap_amount: 0, line_items_gap_ratio: 0,
      budget_category_key: null, charter_id: null,
    })
    .eq("id", submissionId);
  if (upErr) return { error: `Split created #${newId} but updating this receipt failed: ${upErr.message}` };

  await supabase.from("crew_expense_split_lines").delete().eq("submission_id", submissionId);
  const { error: clearErr } = await supabase.from("crew_expense_lines").delete().eq("submission_id", submissionId);
  if (clearErr) return { error: `Split created #${newId} but rewriting this receipt's lines failed: ${clearErr.message}` };
  const { error: keptErr } = await supabase.from("crew_expense_lines").insert(lineRows(kept, submissionId));
  if (keptErr) return { error: `Split created #${newId} but rewriting this receipt's lines failed: ${keptErr.message}` };

  // 3. History on both sides.
  await supabase.from("crew_expense_comments").insert([
    { submission_id: submissionId, kind: "split", author_id: userId, author_name: fullName,
      body: `Split off ${moved.length} line(s) (${orig.currency ?? ""} ${total(moved).toFixed(2)}) into #${newId}. This receipt is now ${total(kept).toFixed(2)}.` },
    { submission_id: newId, kind: "split", author_id: userId, author_name: fullName,
      body: `Split off from #${submissionId} — same receipt, ${moved.length} line(s), ${total(moved).toFixed(2)}.` },
  ]);

  redirect(`/inbox/${submissionId}?split=${newId}`);
}
