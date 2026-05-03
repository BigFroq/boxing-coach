"use client";

import { X } from "lucide-react";
import type { DimensionKey } from "@/lib/dimensions";
import { DIMENSION_LABELS } from "@/data/fighter-profiles";
import {
  DIMENSION_EXPLAINERS,
  BAND_LABELS,
  bandFor,
} from "@/data/dimension-explainers";

interface DimensionDrawerProps {
  dimensionKey: DimensionKey | null; // null = closed
  score: number;
  onClose: () => void;
  onAskCoach?: (query: string) => void;
}

export function DimensionDrawer({
  dimensionKey,
  score,
  onClose,
  onAskCoach,
}: DimensionDrawerProps) {
  if (!dimensionKey) return null;

  const explainer = DIMENSION_EXPLAINERS[dimensionKey];
  const band = bandFor(score);
  const label = DIMENSION_LABELS[dimensionKey];

  return (
    <div
      className="fixed inset-0 z-40 flex items-stretch justify-end bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label={`${label} details`}
      onClick={onClose}
    >
      <aside
        className="w-full max-w-md h-full overflow-y-auto bg-surface border-l border-border p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">{label}</h2>
            <p className="text-sm text-muted mt-1">
              Your score: <span className="text-foreground font-medium">{score}</span>{" "}
              <span className="text-muted">— {BAND_LABELS[band]}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md border border-border p-1 hover:bg-background"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <section className="mb-5">
          <h3 className="text-xs uppercase text-muted mb-1">What this is</h3>
          <p className="text-sm leading-relaxed">{explainer.definition}</p>
        </section>

        <section className="mb-5">
          <h3 className="text-xs uppercase text-muted mb-1">What your score means</h3>
          <p className="text-sm leading-relaxed">{explainer.bands[band]}</p>
        </section>

        <section className="mb-5">
          <h3 className="text-xs uppercase text-muted mb-2">Drills to develop this</h3>
          <ul className="space-y-2">
            {explainer.drills.map((drill, i) => (
              <li key={i} className="text-sm leading-snug pl-3 border-l border-border">
                {drill}
              </li>
            ))}
          </ul>
        </section>

        {onAskCoach && (
          <button
            type="button"
            onClick={() =>
              onAskCoach(`Help me develop my ${label}. My score is ${score}.`)
            }
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-surface"
          >
            Ask the coach about your {label} →
          </button>
        )}
      </aside>
    </div>
  );
}
