"use server";

import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/data";

/**
 * Approve: resolves the QBO account mapping and LOGS the payload that would
 * be created — it does not call the QBO API. Samuel's 2026-09-12 decision
 * ("Actually, log-only for this first pass") given QB_ENVIRONMENT=production
 * has no sandbox and there's no existing create-Expense code to build on
 * yet. See Office - Plan & Scope.md before wiring a live post.
 */
export async function approve(submissionId: number) {
  const { supabase, userId } = await requireStaff();

  const { data: submission, error } = await supabase
    .from("crew_expense_submissions")
    .select("id, vendor, date, amount, currency, raw_extraction, vessel_id, bank_account_id, budget_category_key")
    .eq("id", submissionId)
    .single();
  if (error || !submission) {
    throw new Error(`Couldn't load submission ${submissionId}: ${error?.message ?? "not found"}`);
  }
  const description = (submission.raw_extraction as { description?: string } | null)?.description ?? null;

  const { data: splitLines } = await supabase
    .from("crew_expense_split_lines")
    .select("amount, budget_category_key")
    .eq("submission_id", submissionId);

  const lines =
    splitLines && splitLines.length > 0
      ? splitLines
      : [{ amount: submission.amount, budget_category_key: submission.budget_category_key }];

  const resolvedLines: { amount: number; payment_account: string | null; expense_account: string | null }[] = [];
  for (const line of lines) {
    const { data: mapping, error: mapError } = await supabase.rpc("staff_get_qbo_account_mapping", {
      p_vessel_id: submission.vessel_id,
      p_bank_account_id: submission.bank_account_id,
      p_category_key: line.budget_category_key,
    });
    if (mapError) {
      throw new Error(`Account mapping lookup failed: ${mapError.message}`);
    }
    const row = Array.isArray(mapping) ? mapping[0] : mapping;
    resolvedLines.push({
      amount: line.amount,
      payment_account: row?.payment_account ?? null,
      expense_account: row?.expense_account ?? null,
    });
  }

  const qboPreview = {
    would_create: "Purchase",
    txn_date: submission.date,
    vendor: submission.vendor,
    memo: description,
    payment_account: resolvedLines[0]?.payment_account ?? null,
    total: submission.amount,
    currency: submission.currency,
    lines: resolvedLines.map((l) => ({ amount: l.amount, expense_account: l.expense_account })),
  };

  // Log-only for this first pass — see comment above.
  console.log(`[QBO preview — NOT posted] submission ${submissionId}:`, JSON.stringify(qboPreview, null, 2));

  const { error: updateError } = await supabase
    .from("crew_expense_submissions")
    .update({ status: "posted", reviewed_by: userId, reviewed_at: new Date().toISOString() })
    .eq("id", submissionId);
  if (updateError) {
    throw new Error(`Approve failed: ${updateError.message}`);
  }

  redirect("/queue");
}

export async function reject(submissionId: number) {
  const { supabase, userId } = await requireStaff();

  const { error } = await supabase
    .from("crew_expense_submissions")
    .update({ status: "rejected", reviewed_by: userId, reviewed_at: new Date().toISOString() })
    .eq("id", submissionId);
  if (error) {
    throw new Error(`Reject failed: ${error.message}`);
  }

  redirect("/queue");
}
