"use client";

import { DIMENSION_LABELS, type DimensionScores } from "@/data/fighter-profiles";

interface RetakeComparisonProps {
  current: DimensionScores;
  previous: DimensionScores;
}

const DIMENSIONS = Object.keys(DIMENSION_LABELS) as (keyof DimensionScores)[];

export function RetakeComparison({ current, previous }: RetakeComparisonProps) {
  const deltas = DIMENSIONS.map((dim) => ({
    dim,
    delta: current[dim] - previous[dim],
  }));

  // Only render if there are actual differences
  const hasChanges = deltas.some((d) => d.delta !== 0);
  if (!hasChanges) return null;

  // Sort by largest positive delta first, then by absolute value
  const sorted = [...deltas].sort((a, b) => b.delta - a.delta);

  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <h3 className="text-sm font-semibold text-accent mb-4">Changes since last profile</h3>

      <div className="space-y-2.5">
        {sorted.map(({ dim, delta }) => {
          let deltaText: string;
          let colorClass: string;

          if (delta > 0) {
            deltaText = `+${delta}`;
            colorClass = "text-green-400";
          } else if (delta < 0) {
            deltaText = `${delta}`;
            colorClass = "text-red-400";
          } else {
            deltaText = "0";
            colorClass = "text-muted";
          }

          return (
            <div key={dim} className="flex items-center justify-between">
              <span className="text-sm text-foreground">{DIMENSION_LABELS[dim]}</span>
              <span className={`text-sm font-semibold tabular-nums ${colorClass}`}>
                {deltaText}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
