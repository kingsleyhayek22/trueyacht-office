import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server-side Supabase client for Server Components / Server Actions.
 * Anon key + the signed-in staff member's session cookie — RLS
 * (is_trueyacht_staff()) does the access control, not this client.
 * Never use the service_role key here (see Office - Plan & Scope.md).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component with a read-only cookie store —
            // fine, middleware.ts is also refreshing the session.
          }
        },
      },
    }
  );
}
