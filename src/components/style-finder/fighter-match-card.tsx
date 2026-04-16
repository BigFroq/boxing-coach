"use client";

import { DIMENSION_LABELS, type DimensionScores } from "@/data/fighter-profiles";

interface FighterMatchCardProps {
  rank: number;
  fighter: { name: string; slug: string };
  explanation: string;
  overlappingDimensions: string[];
}

export function FighterMatchCard({ rank, fighter, explanation, overlappingDimensions }: FighterMatchCardProps) {
  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <div className="flex items-start gap-4">
        {/* Rank badge */}
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-sm font-bold">
          {rank}
        </div>

        <div className="flex-1 min-w-0">
          {/* Fighter name */}
          <h3 className="text-base font-bold text-foreground">{fighter.name}</h3>

          {/* AI explanation */}
          <p className="mt-1 text-sm text-muted leading-relaxed">{explanation}</p>

          {/* Matching dimension tags */}
          {overlappingDimensions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {overlappingDimensions.map((dim) => {
                const label =
                  DIMENSION_LABELS[dim as keyof DimensionScores] ?? dim;
                return (
                  <span
                    key={dim}
                    className="inline-block rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-400"
                  >
                    {label}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
