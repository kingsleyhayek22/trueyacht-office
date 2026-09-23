"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/data";
import type { PostState } from "@/components/PostToQboButton";

/** Post an approved receipt to QBO via the qbo-post-expense Edge Function. */
export async function postToQbo(submissionId: number, _prev: PostState): Promise<PostState> {
  const { supabase } = await requireStaff();
  const { data, error } = await supabase.functions.invoke("qbo-post-expense", {
    body: { submission_id: submissionId },
  });
  revalidatePath(`/approved/${submissionId}`);
  revalidatePath("/approved");
  if (error) return { error: `Post failed: ${error.message}` };
  if (!data?.ok) return { error: data?.error ?? "Post failed." };
  return { error: null, notice: data.note ?? `Posted to QBO (Purchase ${data.purchase_id}).` };
}

/** Tick / untick "Matched in QBO" (bookkeeper has matched it to the bank feed). */
export async function setMatched(submissionId: number, checked: boolean): Promise<{ error: string | null }> {
  const { supabase, userId } = await requireStaff();
  const { error } = await supabase
    .from("crew_expense_submissions")
    .update({
      qbo_matched_at: checked ? new Date().toISOString() : null,
      qbo_matched_by: checked ? userId : null,
    })
    .eq("id", submissionId);
  if (error) return { error: error.message };
  revalidatePath("/approved");
  return { error: null };
}
