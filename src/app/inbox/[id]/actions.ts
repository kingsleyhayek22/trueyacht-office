"use server";

import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/data";

type LineItem = { description: string; amount: number; categoryKey: string; charterId: string };

export type ConfirmState = { error: string | null };

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
  const categoryKey = String(formData.get("budget_category_key") ?? "").trim();
  const charterIdRaw = String(formData.get("charter_id") ?? "").trim();
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

  if (!vendor || !date || !amountRaw || (!categoryKey && !allLinesCategorized)) {
    return { error: "Vendor, date, amount, and a category (overall, or one per line item) are required before confirming." };
  }

  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Amount must be a valid positive number." };
  }

  const lineItemsTotal = lineItems.reduce((sum, l) => sum + l.amount, 0);
  const reconciled = lineItems.length === 0 ? null : Math.abs(lineItemsTotal - amount) < 0.01;

  // Preserve any other keys already on raw_extraction (e.g. customer_guess,
  // suggested_category) — we're only overwriting description + line_items.
  const { data: existing } = await supabase
    .from("crew_expense_submissions")
    .select("raw_extraction")
    .eq("id", submissionId)
    .single();

  const rawExtraction = {
    ...((existing?.raw_extraction as Record<string, unknown> | null) ?? {}),
    description,
    line_items: lineItems,
  };

  // If every line item happens to share the same category (allLinesCategorized
  // but not isSplit) and staff never touched the overall dropdown, fall back
  // to that shared line category rather than leaving budget_category_key
  // null — that's not a real split, just the overall category derived a
  // different way.
  const effectiveCategoryKey =
    categoryKey || (allLinesCategorized && !isSplit ? [...distinctLineCategories][0] ?? null : null);

  // Charter, same idea as category: on a genuine split the overall Charter
  // field isn't shown (charter is picked per line instead), so derive the
  // submission-level charter_id from the lines — only if they all agree on
  // one, otherwise leave it null (a real per-line charter split, same as
  // category). On a non-split submission the overall dropdown is still the
  // source of truth.
  const distinctLineCharters = new Set(lineItems.map((l) => l.charterId).filter(Boolean));
  const charterId = isSplit
    ? distinctLineCharters.size === 1
      ? Number([...distinctLineCharters][0])
      : null
    : charterIdRaw
      ? Number(charterIdRaw)
      : null;

  const { error } = await supabase
    .from("crew_expense_submissions")
    .update({
      vendor,
      date,
      amount,
      // A genuine split has no single overall category — leave it null so
      // Approve's QBO-mapping (queue/[id]/actions.ts) falls back to the
      // crew_expense_split_lines rows below instead of one wrong category.
      budget_category_key: isSplit ? null : effectiveCategoryKey,
      charter_id: charterId,
      raw_extraction: rawExtraction,
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

  if (isSplit) {
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
