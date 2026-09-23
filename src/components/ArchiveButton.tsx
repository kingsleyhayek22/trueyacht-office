"use client";

import { useState } from "react";

/** Archive needs a written reason — it is saved to the transaction's commentary. */
export function ArchiveButton({ action, defaultReason = "" }: { action: (formData: FormData) => Promise<void>; defaultReason?: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(defaultReason);

  if (!open) {
    return (
      <button type="button" className="btn ghost" onClick={() => setOpen(true)}>
        Archive
      </button>
    );
  }

  return (
    <form action={action} className="reject-box">
      <label>Why is this being archived? (required)</label>
      <textarea
        name="reason"
        rows={3}
        autoFocus
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="e.g. Duplicate of #12"
      />
      <p className="action-hint">
        Archived receipts leave the Inbox and are not re-imported when the extraction runs again.
      </p>
      <div className="action-bar">
        <button type="submit" className="btn primary" disabled={!reason.trim()}>
          Confirm archive
        </button>
        <button type="button" className="btn ghost" onClick={() => { setOpen(false); setReason(defaultReason); }}>
          Cancel
        </button>
      </div>
    </form>
  );
}
