import Link from "next/link";
import type { ReactNode } from "react";
import type { InboxTreeYacht } from "@/lib/data";

type NavKey = "inbox" | "queue" | "approved";

export function Shell({
  active,
  userName,
  counts,
  activeVessel,
  activeMethod,
  children,
}: {
  active: NavKey;
  userName: string;
  counts: { inbox: number; queue: number; tree?: InboxTreeYacht[] };
  activeVessel?: number;
  activeMethod?: string;
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
            <Link href="/inbox" className={active === "inbox" && !activeVessel ? "on" : ""}>
              <span>Inbox</span>
              <span className="n">{counts.inbox}</span>
            </Link>
            {(counts.tree ?? []).map((y) => {
              const open = active === "inbox" && activeVessel === y.vesselId;
              return (
                <div key={y.vesselId} className="nav-group">
                  <Link href={`/inbox?vessel=${y.vesselId}`} className={`sub ${open && !activeMethod ? "on" : ""}`}>
                    <span>{y.name}</span>
                    <span className="n">{y.total}</span>
                  </Link>
                  {open &&
                    y.methods.map((m) => (
                      <Link
                        key={m.key}
                        href={`/inbox?vessel=${y.vesselId}&method=${m.key}`}
                        className={`sub2 ${activeMethod === m.key ? "on" : ""}`}
                      >
                        <span>{m.label}</span>
                        <span className="n">{m.count}</span>
                      </Link>
                    ))}
                </div>
              );
            })}
          </div>

          <div className="nav-label" style={{ marginTop: "0.9rem" }}>
            Review
          </div>
          <div className="nav">
            <Link href="/queue" className={active === "queue" ? "on" : ""}>
              <span>Queue</span>
              <span className="n">{counts.queue}</span>
            </Link>
            <Link href="/approved" className={active === "approved" ? "on" : ""}>
              <span>Approved</span>
            </Link>
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
