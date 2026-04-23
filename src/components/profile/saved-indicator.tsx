"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";

/**
 * Tiny "Saved" ping next to a field. Pass `trigger` — bump it (e.g. incrementing
 * a number or setting to Date.now()) to show the indicator for 1.5s.
 */
export function SavedIndicator({ trigger }: { trigger: number | null }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (trigger === null) return;
    setVisible(true);
    const id = setTimeout(() => setVisible(false), 1500);
    return () => clearTimeout(id);
  }, [trigger]);

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs text-muted transition-opacity ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      aria-live="polite"
    >
      <Check size={12} />
      Saved
    </span>
  );
}
