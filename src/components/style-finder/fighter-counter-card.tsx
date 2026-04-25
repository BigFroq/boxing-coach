"use client";

import { AlertTriangle, Zap, Target } from "lucide-react";
import type { CounterExplanation } from "./dashboard-view";
import { DIMENSION_LABELS, type DimensionScores } from "@/data/fighter-profiles";

interface FighterCounterCardProps {
  rank: number;
  counter: CounterExplanation;
  onAskMatchup?: (query: string) => void;
}

export function FighterCounterCard({ rank, counter, onAskMatchup }: FighterCounterCardProps) {
  const threatLabel = rank === 1 ? "High Threat" : "Moderate Threat";
  const threatTone = rank === 1 ? "bg-red-500/20 text-red-300" : "bg-amber-500/20 text-amber-300";

  const handleAsk = () => {
    if (onAskMatchup) {
      onAskMatchup(
        `How do I train to survive a matchup against a ${counter.attack_vector.toLowerCase()} like ${counter.name} given my profile?`
      );
    }
  };

  return (
    <div className="bg-surface border border-red-500/30 rounded-xl p-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center">
          <AlertTriangle className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-foreground">{counter.name}</h3>
            <span className="inline-block rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-medium text-red-400">
              {counter.attack_vector}
            </span>
            <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${threatTone}`}>
              {threatLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Exploited-dimensions mini chart */}
      {counter.exploited_dimensions.length > 0 && (
        <div className="mt-4 space-y-2">
          {counter.exploited_dimensions.map((d) => {
            const label = DIMENSION_LABELS[d.dimension as keyof DimensionScores] ?? d.dimension;
            return (
              <div key={d.dimension}>
                <div className="flex justify-between text-xs text-muted mb-1">
                  <span>{label}</span>
                  <span>
                    You {d.user_score} · {counter.name.split(" ")[0]} {d.fighter_score} (+{d.gap})
                  </span>
                </div>
                <div className="relative h-2 bg-surface-hover rounded-full overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 bg-blue-400/60"
                    style={{ width: `${d.user_score}%` }}
                  />
                  <div
                    className="absolute inset-y-0 left-0 bg-red-400/60"
                    style={{ width: `${d.fighter_score}%`, mixBlendMode: "screen" }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* One-shot callout */}
      {counter.one_shot_notes && (
        <div className="mt-4 flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
          <Zap className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-200">{counter.one_shot_notes}</p>
        </div>
      )}

      {/* Paragraph body */}
      <p className="mt-4 text-sm text-muted leading-relaxed">{counter.paragraph}</p>

      {/* Recommended drills */}
      {counter.recommended_drills.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Target className="w-3.5 h-3.5 text-accent" />
            <span className="text-xs font-semibold text-accent">Train to close the gap</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {counter.recommended_drills.map((drill) => (
              <span
                key={drill.slug}
                title={drill.why}
                className="inline-block rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent"
              >
                {drill.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Citations */}
      {counter.citations.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-xs text-muted mb-1">Sources:</p>
          <ul className="space-y-0.5">
            {counter.citations.map((c, i) => (
              <li key={i} className="text-xs text-muted">
                · {c.title}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* CTA */}
      {onAskMatchup && (
        <button
          onClick={handleAsk}
          className="mt-4 w-full rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-hover transition-colors"
        >
          Ask about this matchup
        </button>
      )}
    </div>
  );
}
