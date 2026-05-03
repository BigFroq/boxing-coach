"use client";

import { useState } from "react";
import type { DrillEntry } from "@/lib/drill-program-types";

type Props = { drill: DrillEntry; index?: number };

export function DrillCard({ drill, index }: Props) {
  const [cuesOpen, setCuesOpen] = useState(false);

  return (
    <div className="rounded-xl bg-surface-hover p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {index !== undefined && (
            <span className="text-sm font-bold text-muted shrink-0">{index + 1}.</span>
          )}
          <span className="text-sm font-semibold leading-snug">{drill.name}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
          {drill.intensity.map((i) => (
            <span key={i} className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-muted capitalize">
              {i}
            </span>
          ))}
          {drill.context.map((c) => (
            <span key={c} className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-muted capitalize">
              {c}
            </span>
          ))}
          {drill.vault_ref && (
            <a
              href={`/vault/drills/${drill.vault_ref}`}
              className="rounded-full bg-accent/20 px-2 py-0.5 text-xs font-medium text-accent hover:bg-accent/30 transition-colors"
            >
              Vault
            </a>
          )}
        </div>
      </div>

      {/* Why this fits you */}
      <p className="text-xs text-muted italic leading-relaxed border-l-2 border-accent/30 pl-3">
        {drill.why_fits_you}
      </p>

      {/* Dose */}
      <p className="text-xs font-medium">{drill.rounds_or_dose}</p>

      {/* Cues collapsible */}
      {drill.cues.length > 0 && (
        <div>
          <button
            onClick={() => setCuesOpen((o) => !o)}
            className="text-xs text-muted hover:text-foreground transition-colors"
          >
            {cuesOpen ? "Hide cues" : `Show cues (${drill.cues.length})`}
          </button>
          {cuesOpen && (
            <ul className="mt-2 space-y-1 pl-3">
              {drill.cues.map((cue, i) => (
                <li key={i} className="text-xs text-muted list-disc list-inside">
                  {cue}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
