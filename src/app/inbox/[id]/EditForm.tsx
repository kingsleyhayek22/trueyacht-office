"use client";

import { useActionState, useState } from "react";
import type { ConfirmState } from "./actions";
import { Dropdown } from "@/components/Dropdown";
import { DatePicker } from "@/components/DatePicker";

// extractedNo: 0-based index of the AI's original line; null = added by the reviewer.
type LineItem = { description: string; amount: number; categoryKey: string; charterId: string; extractedNo: number | null };
type Category = { key: string; label: string };
type BankAccount = { id: number; name: string; account_type: string | null; last4: string | null };
type Charter = { id: number; charter_name: string; start_date: string; end_date: string };

export function EditForm({
  action,
  draftAction,
  splitAction,
  initial,
  categories,
  charters,
  currency,
  bankAccounts,
  initialBankAccountId,
  initialAmountUsd,
}: {
  action: (state: ConfirmState, formData: FormData) => Promise<ConfirmState>;
  draftAction: (state: ConfirmState, formData: FormData) => Promise<ConfirmState>;
  splitAction: (state: ConfirmState, formData: FormData) => Promise<ConfirmState>;
  initial: {
    vendor: string;
    date: string;
    amount: number;
    description: string;
    lineItems: LineItem[];
  };
  categories: Category[];
  charters: Charter[];
  currency: string;
  bankAccounts: BankAccount[];
  initialBankAccountId: string;
  initialAmountUsd: string;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  const [draftState, draftFormAction, draftPending] = useActionState(draftAction, { error: null, notice: null });

  const [splitState, splitFormAction, splitPending] = useActionState(splitAction, { error: null });
  const [splitting, setSplitting] = useState(false);
  const [picked, setPicked] = useState<number[]>([]);

  const [vendor, setVendor] = useState(initial.vendor);
  const [date, setDate] = useState(initial.date);
  const [amount, setAmount] = useState(initial.amount ? String(initial.amount) : "");
  const [description, setDescription] = useState(initial.description);
  const [lineItems, setLineItems] = useState<LineItem[]>(initial.lineItems);
  const [bankAccountId, setBankAccountId] = useState(initialBankAccountId);
  const [amountUsd, setAmountUsd] = useState(initialAmountUsd);
  const isForeign = !!currency && currency !== "USD";

  const amountNum = Number(amount) || 0;
  const linesTotal = lineItems.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const gap = Number((amountNum - linesTotal).toFixed(2));
  const linesOk = lineItems.length === 0 || Math.abs(gap) < 0.01;

  // Every receipt is a list of lines, and every line needs its own category.
  const allLinesCategorized = lineItems.length > 0 && lineItems.every((l) => l.categoryKey);
  const distinctLineCategories = new Set(lineItems.map((l) => l.categoryKey).filter(Boolean));
  const isSplit = allLinesCategorized && distinctLineCategories.size > 1;
  const missingRequired = !vendor.trim() || !date || !amount || !allLinesCategorized || !bankAccountId || (isForeign && !(Number(amountUsd) > 0));

  function updateLine(i: number, patch: Partial<LineItem>) {
    // A single-line receipt: the line IS the total, so editing either keeps both in step.
    if (lineItems.length === 1 && patch.amount !== undefined) setAmount(patch.amount ? String(patch.amount) : "");
    setLineItems((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function removeLine(i: number) {
    setLineItems((prev) => prev.filter((_, idx) => idx !== i));
  }
  function addLine() {
    setLineItems((prev) => [...prev, { description: "", amount: 0, categoryKey: "", charterId: "", extractedNo: null }]);
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="line_items_json" value={JSON.stringify(lineItems)} />
      <input type="hidden" name="split_indexes" value={JSON.stringify(picked)} />

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
          <input type="number" step="0.01" name="amount" value={amount} onChange={(e) => {
              setAmount(e.target.value);
              // A single-line receipt: the line IS the total, keep them in step.
              if (lineItems.length === 1) updateLine(0, { amount: Number(e.target.value) || 0 });
            }}
          />
        </div>
        <div className="edit-field">
          <label>Currency</label>
          <input value={currency} disabled />
        </div>
      </div>

      {isForeign && (
        <div className="edit-field">
          <label>Amount in USD (what QBO gets)</label>
          <input
            type="number"
            step="0.01"
            name="amount_usd"
            value={amountUsd}
            onChange={(e) => setAmountUsd(e.target.value)}
            className={!(Number(amountUsd) > 0) ? "required-empty" : ""}
            placeholder={`USD amount charged for ${currency} ${amountNum ? amountNum.toFixed(2) : ""}`}
          />
          {!(Number(amountUsd) > 0) ? (
            <span className="required-note">Required — QBO is posted in USD only. Use the charge shown on the bank/card feed.</span>
          ) : amountNum > 0 ? (
            <span className="action-hint">Implied rate: 1 {currency} = {(Number(amountUsd) / amountNum).toFixed(4)} USD</span>
          ) : null}
        </div>
      )}

      <div className="edit-field">
        <label>Paid from</label>
        <input type="hidden" name="bank_account_id" value={bankAccountId} />
        <Dropdown
          value={bankAccountId}
          onChange={setBankAccountId}
          placeholder="Select account…"
          options={[
            { value: "", label: "Select account…" },
            ...bankAccounts.map((b) => ({
              value: String(b.id),
              label: `${b.name}${b.last4 ? ` ••${b.last4}` : ""}`,
            })),
          ]}
        />
        {!bankAccountId && <span className="required-note">Required to confirm</span>}
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
            This invoice spans {distinctLineCategories.size} categories — each line has its own below.
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
        {!isSplit && lineItems.length > 1 && (
          <div className={`li-total-row ${linesOk ? "ok" : "gap"}`}>
            <span>Lines total</span>
            <span className="status">
              {currency} {linesTotal.toFixed(2)}
              {linesOk ? " — matches ✓" : ` — off by ${currency} ${Math.abs(gap).toFixed(2)}`}
            </span>
          </div>
        )}
      </div>

      {lineItems.length > 1 && !splitting && (
        <button type="button" className="li-add" onClick={() => setSplitting(true)}>
          Split into separate payments…
        </button>
      )}
      {splitting && (
        <div className="li-view" style={{ marginTop: "0.75rem" }}>
          <div className="li-edit-head">
            <span className="t">Split off into a new expense</span>
          </div>
          <p className="action-hint">
            Tick the lines that were paid as a separate charge. They move to a new Inbox item with the same receipt;
            each side&apos;s total becomes its own lines.
          </p>
          {lineItems.map((l, i) => (
            <label key={i} className="li-view-row" style={{ cursor: "pointer" }}>
              <span className="desc">
                <input
                  type="checkbox"
                  checked={picked.includes(i)}
                  onChange={(e) =>
                    setPicked((prev) => (e.target.checked ? [...prev, i] : prev.filter((x) => x !== i)))
                  }
                />{" "}
                {l.description || "—"}
              </span>
              <span className="amt">{Number(l.amount).toFixed(2)}</span>
            </label>
          ))}
          <div className="li-total-row ok">
            <span>
              Split off {picked.length} · {currency}{" "}
              {lineItems.filter((_, i) => picked.includes(i)).reduce((s, l) => s + (Number(l.amount) || 0), 0).toFixed(2)}
            </span>
            <span className="status">
              Stays · {currency}{" "}
              {lineItems.filter((_, i) => !picked.includes(i)).reduce((s, l) => s + (Number(l.amount) || 0), 0).toFixed(2)}
            </span>
          </div>
          <div className="action-bar">
            <button
              type="submit"
              formAction={splitFormAction}
              className="btn primary"
              disabled={splitPending || picked.length === 0 || picked.length === lineItems.length}
            >
              {splitPending ? "Splitting…" : "Split off"}
            </button>
            <button type="button" className="btn ghost" onClick={() => { setSplitting(false); setPicked([]); }}>
              Cancel
            </button>
          </div>
          {splitState.error && <p className="confirm-error">{splitState.error}</p>}
        </div>
      )}

      {state.error && <p className="confirm-error">{state.error}</p>}
      {draftState.error && <p className="confirm-error">{draftState.error}</p>}
      {draftState.notice && !draftState.error && <p className="action-hint">{draftState.notice}</p>}

      <div className="action-bar">
        <button type="submit" className="btn primary" disabled={pending || missingRequired}>
          {pending ? "Confirming…" : "Confirm › Queue"}
        </button>
        <button type="submit" formAction={draftFormAction} className="btn ghost" disabled={pending || draftPending}>
          {draftPending ? "Saving…" : "Save draft"}
        </button>
      </div>
      <p className="action-hint">Confirming moves this into the Queue for Approve/Reject.</p>
    </form>
  );
}
