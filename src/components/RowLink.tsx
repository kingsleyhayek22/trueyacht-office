"use client";

import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";

/**
 * Makes an entire table row clickable to open its detail page, not just the
 * trailing arrow cell. A click that lands on a real <a>/<button> inside the
 * row (e.g. the row-arrow link itself) is left to navigate normally instead
 * of being double-handled here.
 */
export function RowLink({ href, children }: { href: string; children: ReactNode }) {
  const router = useRouter();

  function handleClick(e: MouseEvent<HTMLTableRowElement>) {
    if ((e.target as HTMLElement).closest("a, button, input, label")) return;
    router.push(href);
  }

  return (
    <tr className="row-clickable" onClick={handleClick}>
      {children}
    </tr>
  );
}
