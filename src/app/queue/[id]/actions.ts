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
    .select("id, vendor, date, amount, amount_usd, currency, raw_extraction, description, vessel_id, bank_account_id, budget_category_key")
    .eq("id", submissionId)
    .single();
  if (error || !submission) {
    throw new Error(`Couldn't load submission ${submissionId}: ${error?.message ?? "not found"}`);
  }
  if (submission.currency && submission.currency !== "USD" && !(Number(submission.amount_usd) > 0)) {
    throw new Error(`This receipt is in ${submission.currency} — send it back and enter the USD amount before approving.`);
  }
  const description = submission.description ?? (submission.raw_extraction as { description?: string } | null)?.description ?? null;

  // The confirmed lines (crew_expense_lines) are the source of truth. Older
  // rows confirmed before that table existed fall back to the legacy fields.
  const { data: confirmedLines } = await supabase
    .from("crew_expense_lines")
    .select("amount, description, budget_category_key")
    .eq("submission_id", submissionId)
    .order("line_no");

  let lines: { amount: number; description: string | null; budget_category_key: string | null }[];
  if (confirmedLines && confirmedLines.length > 0) {
    const linesTotal = confirmedLines.reduce((sum, l) => sum + Number(l.amount), 0);
    if (Math.round(linesTotal * 100) !== Math.round(Number(submission.amount) * 100)) {
      throw new Error(
        `Line items total ${linesTotal.toFixed(2)} but the receipt total is ${Number(submission.amount).toFixed(2)} — send it back and fix the lines before approving.`
      );
    }
    lines = confirmedLines.map((l) => ({
      amount: Number(l.amount),
      description: l.description,
      budget_category_key: l.budget_category_key,
    }));
  } else {
    const { data: splitLines } = await supabase
      .from("crew_expense_split_lines")
      .select("amount, budget_category_key")
      .eq("submission_id", submissionId);
    lines =
      splitLines && splitLines.length > 0
        ? splitLines.map((l) => ({ amount: Number(l.amount), description: null, budget_category_key: l.budget_category_key }))
        : [{ amount: Number(submission.amount), description: null, budget_category_key: submission.budget_category_key }];
  }

  const resolvedLines: { amount: number; description: string | null; payment_account: string | null; expense_account: string | null }[] = [];
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
      description: line.description,
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
    lines: resolvedLines.map((l) => ({ amount: l.amount, description: l.description, expense_account: l.expense_account })),
  };

  // Log-only for this first pass — see comment above.
  console.log(`[QBO preview — NOT posted] submission ${submissionId}:`, JSON.stringify(qboPreview, null, 2));

  const { error: updateError } = await supabase
    .from("crew_expense_submissions")
    .update({ status: "approved", reviewed_by: userId, reviewed_at: new Date().toISOString() })
    .eq("id", submissionId);
  if (updateError) {
    throw new Error(`Approve failed: ${updateError.message}`);
  }

  redirect("/approved");
}

/** Sends the submission back to the Inbox (see below) — not a dead-end status. */
export async function reject(submissionId: number, formData: FormData) {
  const { supabase, userId, fullName } = await requireStaff();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) redirect(`/queue/${submissionId}`); // a reason is required

  const { error } = await supabase
    .from("crew_expense_submissions")
    // Reject = send back to the Inbox for another pass. Everything the reviewer
    // entered (header, description, crew_expense_lines) stays exactly as it was,
    // so the Inbox edit screen reopens with the same data. confirmed_at is
    // cleared until it is confirmed again; reviewed_by/at record who sent it back.
    .update({
      status: "extracted",
      confirmed_at: null,
      sent_back_at: new Date().toISOString(),
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", submissionId);
  if (error) {
    throw new Error(`Reject failed: ${error.message}`);
  }

  // The reason goes into the transaction's commentary (its history).
  const { error: commentError } = await supabase.from("crew_expense_comments").insert({
    submission_id: submissionId,
    kind: "reject",
    body: reason,
    author_id: userId,
    author_name: fullName,
  });
  if (commentError) {
    throw new Error(`Rejected, but saving the reason failed: ${commentError.message}`);
  }

  redirect("/queue");
}
