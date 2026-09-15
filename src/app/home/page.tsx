import Link from "next/link";
import { requireStaff, getNavCounts } from "@/lib/data";
import { initials } from "@/components/Shell";

/**
 * Module picker — the landing screen after login. Office is more than one
 * module now, so this sits above any single module's own sidebar/nav
 * (Shell). Receipts (Queue + Inbox) is the only real module today; the
 * grid is built to hold more without another IA layer being added later.
 * See "TrueYacht Office Wireframes" artifact, Wireframe 00.
 */
export default async function HomePage() {
  const { supabase, fullName } = await requireStaff();
  const counts = await getNavCounts(supabase);

  return (
    <div className="home">
      <header className="home-top">
        <div className="word">
          TrueYacht
          <b>Office</b>
        </div>
        <div className="who">
          <div className="av">{initials(fullName)}</div>
          <div>
            <div className="t">{fullName}</div>
            <div className="s">All vessels</div>
          </div>
        </div>
      </header>

      <div className="home-body">
        <div className="home-label">Modules</div>
        <div className="module-grid">
          <Link href="/queue" className="module-card">
            <span className="module-icon">🧾</span>
            <div className="module-name">Receipts</div>
            <div className="module-desc">
              Review crew &amp; email-submitted receipts, confirm category/charter, approve to QBO.
            </div>
            <div className="module-stats">
              <span className="module-stat">
                <b>{counts.queue}</b> in queue
              </span>
              <span className="module-stat">
                <b>{counts.inbox}</b> in inbox
              </span>
            </div>
            <div className="module-enter">Open ›</div>
          </Link>
        </div>
      </div>
    </div>
  );
}
