"use client";

import { DIMENSION_LABELS, type DimensionScores } from "@/data/fighter-profiles";

interface DimensionBarsProps {
  scores: DimensionScores;
}

const DIMENSIONS = Object.keys(DIMENSION_LABELS) as (keyof DimensionScores)[];

function getBarColor(score: number): string {
  if (score >= 70) return "bg-blue-500";
  if (score >= 50) return "bg-amber-500";
  return "bg-red-500";
}

function getTextColor(score: number): string {
  if (score >= 70) return "text-blue-400";
  if (score >= 50) return "text-amber-400";
  return "text-red-400";
}

export function DimensionBars({ scores }: DimensionBarsProps) {
  const sorted = [...DIMENSIONS].sort((a, b) => scores[b] - scores[a]);

  return (
    <div className="space-y-3">
      {sorted.map((dim) => {
        const score = scores[dim];
        return (
          <div key={dim}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-foreground">{DIMENSION_LABELS[dim]}</span>
              <span className={`text-sm font-semibold tabular-nums ${getTextColor(score)}`}>
                {score}
              </span>
            </div>
            <div className="h-2 rounded-full bg-surface-hover overflow-hidden">
              <div
                className={`h-full rounded-full ${getBarColor(score)} transition-all duration-700 ease-out`}
                style={{ width: `${score}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
