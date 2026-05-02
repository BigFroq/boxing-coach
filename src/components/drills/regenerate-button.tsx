"use client";

import { useState } from "react";
import { RefreshCw, Loader2 } from "lucide-react";
import type { DrillProgram } from "@/lib/drill-program-types";

type Props = {
  userId: string;
  onRegenerated: (newProgram: DrillProgram) => void;
};

export function RegenerateButton({ userId, onRegenerated }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (!confirm("Replace your current drill program?")) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/drill-program", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, force: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Failed to regenerate");
      }
      const data = await res.json();
      onRegenerated(data.drill_program);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to regenerate";
      setError(msg);
      alert(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleClick}
        disabled={loading}
        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-50"
      >
        {loading ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          <RefreshCw size={13} />
        )}
        Regenerate
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
