"use client";

import { useActionState, useState } from "react";
import type { ConfirmState } from "./actions";
import { Dropdown } from "@/components/Dropdown";
import { DatePicker } from "@/components/DatePicker";

type LineItem = { description: string; amount: number; categoryKey: string; charterId: string };
type Category = { key: string; label: string };
type Charter = { id: number; charter_name: string; start_date: string; end_date: string };

export function EditForm({
  action,
  initial,
  categories,
  charters,
  currency,
  suggestedCategory,
  customerGuess,
}: {
  action: (state: ConfirmState, formData: FormData) => Promise<ConfirmState>;
  initial: {
    vendor: string;
    date: string;
    amount: number;
    description: string;
    categoryKey: string;
    charterId: string;
    lineItems: LineItem[];
  };
  categories: Category[];
  charters: Charter[];
  currency: string;
  suggestedCategory?: string;
  customerGuess?: string;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });

  const [vendor, setVendor] = useState(initial.vendor);
  const [date, setDate] = useState(initial.date);
  const [amount, setAmount] = useState(initial.amount ? String(initial.amount) : "");
  const [description, setDescription] = useState(initial.description);
  const [categoryKey, setCategoryKey] = useState(initial.categoryKey);
  const [charterId, setCharterId] = useState(initial.charterId);
  const [lineItems, setLineItems] = useState<LineItem[]>(initial.lineItems);

  const amountNum = Number(amount) || 0;
  const linesTotal = lineItems.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const gap = Number((amountNum - linesTotal).toFixed(2));
  const linesOk = lineItems.length === 0 || Math.abs(gap) < 0.01;

  // A submission is either one overall category, or a genuine per-line
  // split (every line item has its own category and they're not all the
  // same one) — either satisfies the "needs a category" requirement.
  const allLinesCategorized = lineItems.length > 0 && lineItems.every((l) => l.categoryKey);
  const distinctLineCategories = new Set(lineItems.map((l) => l.categoryKey).filter(Boolean));
  const isSplit = allLinesCategorized && distinctLineCategories.size > 1;
  const missingRequired = !vendor.trim() || !date || !amount || (!categoryKey && !allLinesCategorized);

  function updateLine(i: number, patch: Partial<LineItem>) {
    setLineItems((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function removeLine(i: number) {
    setLineItems((prev) => prev.filter((_, idx) => idx !== i));
  }
  function addLine() {
    setLineItems((prev) => [...prev, { description: "", amount: 0, categoryKey: "", charterId: "" }]);
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="line_items_json" value={JSON.stringify(lineItems)} />

      <div className="field-grid">
        <div className="edit-field">
          <label>Vendor</label>
          <input
            name="vendor"
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            className={!vendor.trim() ? "required-empty" : ""}
            placeholder="Enter vendor"
          />
          {!vendor.trim() && <span className="required-note">Required</span>}
        </div>
        <div className="edit-field">
          <label>Date</label>
          <input type="hidden" name="date" value={date} />
          <DatePicker value={date} onChange={setDate} invalid={!date} />
          {!date && <span className="required-note">Required</span>}
        </div>
        <div className="edit-field">
          <label>Amount</label>
          <input type="number" step="0.01" name="amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="edit-field">
          <label>Currency</label>
          <input value={currency} disabled />
        </div>
      </div>

      <div className="edit-field">
        <label>Description</label>
        <textarea name="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </div>

      <div className="li-edit">
        <div className="li-edit-head">
          <span className="t">Line items</span>
          <span className="c">
            {lineItems.length} {lineItems.length === 1 ? "line" : "lines"}
          </span>
        </div>
        {distinctLineCategories.size > 1 && (
          <div className="flag-banner" style={{ marginBottom: "0.5rem" }}>
            This invoice spans {distinctLineCategories.size} categories — assign one per line below instead of a
            single overall category.
          </div>
        )}
        {lineItems.map((l, i) => (
          <div className="li-edit-row" key={i}>
            <input
              className="desc"
              value={l.description}
              onChange={(e) => updateLine(i, { description: e.target.value })}
              placeholder="Description"
            />
            <input
              className="amt"
              type="number"
              step="0.01"
              value={l.amount}
              onChange={(e) => updateLine(i, { amount: Number(e.target.value) })}
            />
            <Dropdown
              className="cat"
              value={l.categoryKey}
              onChange={(v) => updateLine(i, { categoryKey: v })}
              placeholder="Category…"
              options={[
                { value: "", label: "Category…" },
                ...categories.map((c) => ({ value: c.key, label: c.label })),
              ]}
            />
            <Dropdown
              className="chr"
              value={l.charterId}
              onChange={(v) => updateLine(i, { charterId: v })}
              placeholder="No charter"
              options={[
                { value: "", label: "No charter" },
                ...charters.map((c) => ({ value: String(c.id), label: c.charter_name })),
              ]}
            />
            <button type="button" className="rm" onClick={() => removeLine(i)} aria-label="Remove line">
              ×
            </button>
          </div>
        ))}
        <button type="button" className="li-add" onClick={addLine}>
          + Add line
        </button>
        {!isSplit && (
          <div className={`li-total-row ${linesOk ? "ok" : "gap"}`}>
            <span>Lines total</span>
            <span className="status">
              {currency} {linesTotal.toFixed(2)}
              {linesOk ? " — matches ✓" : ` — off by ${currency} ${Math.abs(gap).toFixed(2)}`}
            </span>
          </div>
        )}
      </div>

      {!isSplit && (
        <div className="field-grid">
          <div className="edit-field">
            <label>Category</label>
            <input type="hidden" name="budget_category_key" value={categoryKey} />
            <Dropdown
              value={categoryKey}
              onChange={setCategoryKey}
              invalid={!categoryKey && !allLinesCategorized}
              placeholder={allLinesCategorized ? "No overall category — using line items" : "Select a category…"}
              options={[
                {
                  value: "",
                  label: allLinesCategorized ? "No overall category — using line items" : "Select a category…",
                },
                ...categories.map((c) => ({ value: c.key, label: c.label })),
              ]}
            />
            {!categoryKey && !allLinesCategorized && <span className="required-note">Required</span>}
            {suggestedCategory && !initial.categoryKey && (
              <span className="action-hint">AI suggested: {suggestedCategory}</span>
            )}
          </div>
          <div className="edit-field">
            <label>Charter</label>
            <input type="hidden" name="charter_id" value={charterId} />
            <Dropdown
              value={charterId}
              onChange={setCharterId}
              placeholder="No charter"
              options={[
                { value: "", label: "No charter" },
                ...charters.map((c) => ({ value: String(c.id), label: `${c.charter_name} (${c.start_date} – ${c.end_date})` })),
              ]}
            />
            {customerGuess && !initial.charterId && <span className="action-hint">AI guess: {customerGuess}</span>}
          </div>
        </div>
      )}

      {state.error && <p className="confirm-error">{state.error}</p>}

      <div className="action-bar">
        <button type="submit" className="btn primary" disabled={pending || missingRequired}>
          {pending ? "Confirming…" : "Confirm › Queue"}
        </button>
      </div>
      <p className="action-hint">Confirming moves this into the Queue for Approve/Reject.</p>
    </form>
  );
}
