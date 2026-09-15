"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();

  const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
  if (authError) {
    redirect("/login?error=invalid_credentials");
  }

  const { data: isStaff } = await supabase.rpc("is_trueyacht_staff");
  if (!isStaff) {
    await supabase.auth.signOut();
    redirect("/login?error=not_staff");
  }

  redirect("/home");
}
