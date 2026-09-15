"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type DropdownOption = { value: string; label: string };

/**
 * Custom rounded dropdown, used everywhere a plain <select> would otherwise
 * be — a native <select>'s popup list is rendered by the OS/browser and
 * can't be styled (no border-radius, no hover tint, no design-system
 * match), which is exactly what this replaces. Fully controlled: parent
 * owns `value`/`onChange`, same shape as a native select. Includes a
 * search box so the long category list (~100 entries) is filterable
 * instead of a giant scroll.
 *
 * Not a native form control, so a field that submits via FormData (the
 * overall Category/Charter selects) needs its own
 * `<input type="hidden" name="..." value={value} />` alongside this —
 * see EditForm.tsx. Line-item usages don't need that since those values
 * already travel via the line_items_json hidden input.
 */
export function Dropdown({
  value,
  onChange,
  options,
  placeholder = "Select…",
  className = "",
  invalid = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  placeholder?: string;
  className?: string;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open]);

  function pick(v: string) {
    onChange(v);
    setOpen(false);
  }

  return (
    <div className={`dd ${className}`} ref={rootRef}>
      <button
        type="button"
        className={`dd-trigger ${invalid ? "required-empty" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selected ? "dd-value" : "dd-placeholder"}>{selected ? selected.label : placeholder}</span>
        <span className="dd-chevron" aria-hidden="true" />
      </button>
      {open && (
        <div className="dd-panel" role="listbox">
          <input
            ref={searchRef}
            className="dd-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
          />
          <div className="dd-options">
            {filtered.length === 0 && <div className="dd-empty">No matches</div>}
            {filtered.map((o) => (
              <div
                key={o.value || "__blank__"}
                role="option"
                aria-selected={o.value === value}
                className={`dd-option ${o.value === value ? "on" : ""}`}
                onClick={() => pick(o.value)}
              >
                {o.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
