"use client";

import { useActionState } from "react";

export type PostState = { error: string | null; notice?: string | null };

export function PostToQboButton({ action }: { action: (s: PostState) => Promise<PostState> }) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  return (
    <form action={formAction}>
      <button type="submit" className="btn primary" disabled={pending}>
        {pending ? "Posting…" : "Post to QBO"}
      </button>
      {state.error && <p className="error-note" style={{ marginTop: "0.5rem" }}>{state.error}</p>}
      {state.notice && <p className="action-hint">{state.notice}</p>}
    </form>
  );
}
