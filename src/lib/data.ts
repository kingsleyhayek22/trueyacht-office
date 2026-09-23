import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";

/**
 * Gate for every page in this app. A valid Supabase session is NOT enough —
 * this app is deliberately separate from the owner-facing Dashboard so that
 * having Dashboard access doesn't imply Office access. A session must also
 * have a staff_users row, checked via the is_trueyacht_staff() RLS helper.
 * See Office - Plan & Scope.md → "Staff permission mechanism".
 */
export async function requireStaff() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: isStaff, error } = await supabase.rpc("is_trueyacht_staff");
  if (error || !isStaff) {
    redirect("/login?error=not_staff");
  }

  // Best-effort display name for the sidebar. If staff_users isn't
  // self-readable under RLS this just falls back to the email below —
  // not worth a schema/policy change for a label.
  const { data: staffRow } = await supabase
    .from("staff_users")
    .select("full_name")
    .eq("user_id", user.id)
    .single();

  return {
    supabase,
    userId: user.id,
    email: user.email ?? "",
    fullName: staffRow?.full_name || user.email || "Staff",
  };
}

export const INBOX_YACHTS = ["Escapade", "Ohana", "Encore", "Annex"] as const;
export const INBOX_METHODS = [
  { key: "email", label: "Email" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "crew_app", label: "Crew App" },
] as const;

export type InboxTreeYacht = {
  vesselId: number;
  name: string;
  total: number;
  methods: { key: string; label: string; count: number }[];
};

/**
 * Sidebar nav badge counts — Inbox (captured/extracted, not yet ready for
 * review) and Queue (awaiting_review), plus the Inbox > Yacht > Method tree
 * (counts per yacht and per intake method). Read-only, cheap queries.
 */
export async function getNavCounts(supabase: Awaited<ReturnType<typeof createClient>>) {
  const [inbox, queue, vessels] = await Promise.all([
    supabase
      .from("crew_expense_submissions")
      .select("vessel_id, submission_source")
      .in("status", ["captured", "extracted"]),
    supabase
      .from("crew_expense_submissions")
      .select("id", { count: "exact", head: true })
      .eq("status", "awaiting_review"),
    supabase.from("vessels").select("id, name"),
  ]);

  const rows = inbox.data ?? [];
  const tree: InboxTreeYacht[] = INBOX_YACHTS.flatMap((yachtName) => {
    const v = (vessels.data ?? []).find((x) => x.name.trim().toLowerCase() === yachtName.toLowerCase());
    if (!v) return [];
    const mine = rows.filter((r) => r.vessel_id === v.id);
    return [
      {
        vesselId: v.id as number,
        name: yachtName,
        total: mine.length,
        methods: INBOX_METHODS.map((m) => ({
          key: m.key,
          label: m.label,
          count: mine.filter((r) => r.submission_source === m.key).length,
        })),
      },
    ];
  });

  return { inbox: rows.length, queue: queue.count ?? 0, tree };
}
