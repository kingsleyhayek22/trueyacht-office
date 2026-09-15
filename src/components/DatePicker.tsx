"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function parseISO(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) };
}

function toISO(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function formatDisplay(y: number, m: number, d: number): string {
  return `${d} ${MONTHS[m].slice(0, 3)} ${y}`;
}

/**
 * Custom rounded calendar, same idea as Dropdown.tsx — a native
 * <input type="date">'s calendar popup is drawn by the OS/browser and
 * can't be styled, so this replaces it with one we draw ourselves.
 * Fully controlled, value/onChange as a "YYYY-MM-DD" string (same shape
 * a native date input submits), so callers and the Server Action that
 * reads it don't need to change. Not a native form control — needs its
 * own hidden input to actually submit, same as the overall Category/
 * Charter dropdowns.
 */
export function DatePicker({
  value,
  onChange,
  placeholder = "Select date",
  invalid = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const parsed = parseISO(value);
  const today = new Date();

  const [viewY, setViewY] = useState(parsed?.y ?? today.getFullYear());
  const [viewM, setViewM] = useState(parsed?.m ?? today.getMonth());

  useEffect(() => {
    if (!open) return;
    const p = parseISO(value);
    setViewY(p?.y ?? today.getFullYear());
    setViewM(p?.m ?? today.getMonth());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
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

  const cells = useMemo(() => {
    const firstDay = new Date(viewY, viewM, 1).getDay();
    const daysInMonth = new Date(viewY, viewM + 1, 0).getDate();
    const arr: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(d);
    return arr;
  }, [viewY, viewM]);

  function prevMonth() {
    if (viewM === 0) {
      setViewM(11);
      setViewY(viewY - 1);
    } else {
      setViewM(viewM - 1);
    }
  }
  function nextMonth() {
    if (viewM === 11) {
      setViewM(0);
      setViewY(viewY + 1);
    } else {
      setViewM(viewM + 1);
    }
  }
  function pick(d: number) {
    onChange(toISO(viewY, viewM, d));
    setOpen(false);
  }

  const isSelected = (d: number) => !!parsed && parsed.y === viewY && parsed.m === viewM && parsed.d === d;
  const isToday = (d: number) => today.getFullYear() === viewY && today.getMonth() === viewM && today.getDate() === d;

  return (
    <div className="dd dp" ref={rootRef}>
      <button
        type="button"
        className={`dd-trigger ${invalid ? "required-empty" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={parsed ? "dd-value" : "dd-placeholder"}>
          {parsed ? formatDisplay(parsed.y, parsed.m, parsed.d) : placeholder}
        </span>
        <span className="dp-icon" aria-hidden="true" />
      </button>
      {open && (
        <div className="dd-panel dp-panel">
          <div className="dp-head">
            <button type="button" className="dp-nav" onClick={prevMonth} aria-label="Previous month">
              ‹
            </button>
            <span className="dp-month">
              {MONTHS[viewM]} {viewY}
            </span>
            <button type="button" className="dp-nav" onClick={nextMonth} aria-label="Next month">
              ›
            </button>
          </div>
          <div className="dp-weekdays">
            {WEEKDAYS.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
          <div className="dp-grid">
            {cells.map((d, i) =>
              d === null ? (
                <span key={i} className="dp-cell empty" />
              ) : (
                <button
                  type="button"
                  key={i}
                  className={`dp-cell ${isSelected(d) ? "on" : ""} ${isToday(d) ? "today" : ""}`}
                  onClick={() => pick(d)}
                >
                  {d}
                </button>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
