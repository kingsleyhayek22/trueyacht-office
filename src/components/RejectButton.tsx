"use client";

import { useState } from "react";

/** Reject needs a written reason — it is saved to the transaction's commentary. */
export function RejectButton({ action }: { action: (formData: FormData) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  if (!open) {
    return (
      <button type="button" className="btn ghost" onClick={() => setOpen(true)}>
        Reject
      </button>
    );
  }

  return (
    <form action={action} className="reject-box">
      <label>Reason for sending this back (required)</label>
      <textarea
        name="reason"
        rows={3}
        autoFocus
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="e.g. Wrong category on line 2 — this is a labour charge, not parts"
      />
      <div className="action-bar">
        <button type="submit" className="btn primary" disabled={!reason.trim()}>
          Confirm reject
        </button>
        <button type="button" className="btn ghost" onClick={() => { setOpen(false); setReason(""); }}>
          Cancel
        </button>
      </div>
    </form>
  );
}
