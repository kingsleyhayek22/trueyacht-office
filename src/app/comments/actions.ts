"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/data";

/** Add a free-text comment to a transaction's commentary. */
export async function addComment(submissionId: number, path: string, formData: FormData) {
  const { supabase, userId, fullName } = await requireStaff();
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;

  const { error } = await supabase.from("crew_expense_comments").insert({
    submission_id: submissionId,
    kind: "comment",
    body,
    author_id: userId,
    author_name: fullName,
  });
  if (error) throw new Error(`Saving comment failed: ${error.message}`);

  revalidatePath(path);
}
