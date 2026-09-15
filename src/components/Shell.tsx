import Link from "next/link";
import type { ReactNode } from "react";

type NavKey = "inbox" | "queue";

export function Shell({
  active,
  userName,
  counts,
  children,
}: {
  active: NavKey;
  userName: string;
  counts: { inbox: number; queue: number };
  children: ReactNode;
}) {
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <Link href="/home" className="word">
            TrueYacht
            <b>Office</b>
          </Link>
          <Link href="/home" className="back-home">
            ‹ Home
          </Link>
        </div>

        <nav>
          <div className="nav-label">Intake</div>
          <div className="nav">
            <Link href="/inbox" className={active === "inbox" ? "on" : ""}>
              <span>Inbox</span>
              <span className="n">{counts.inbox}</span>
            </Link>
          </div>

          <div className="nav-label" style={{ marginTop: "0.9rem" }}>
            Review
          </div>
          <div className="nav">
            <Link href="/queue" className={active === "queue" ? "on" : ""}>
              <span>Queue</span>
              <span className="n">{counts.queue}</span>
            </Link>
            <span className="disabled">Flagged</span>
            <span className="disabled">Sent back</span>
            <span className="disabled">Posted</span>
          </div>
        </nav>

        <div className="who">
          <div className="av">{initials(userName)}</div>
          <div>
            <div className="t">{userName}</div>
            <div className="s">Staff</div>
          </div>
        </div>
      </aside>

      <div className="main">{children}</div>
    </div>
  );
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
