"use client";

import { useState, useTransition } from "react";

export function MatchedCheckbox({
  initial,
  action,
}: {
  initial: boolean;
  action: (checked: boolean) => Promise<{ error: string | null }>;
}) {
  const [checked, setChecked] = useState(initial);
  const [pending, startTransition] = useTransition();

  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={pending}
      aria-label="Matched in QBO"
      onChange={(e) => {
        const next = e.target.checked;
        setChecked(next);
        startTransition(async () => {
          const res = await action(next);
          if (res.error) setChecked(!next);
        });
      }}
    />
  );
}
