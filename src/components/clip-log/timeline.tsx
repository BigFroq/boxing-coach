"use client";

import { useState } from "react";
import type { ClipLog } from "@/lib/clip-log-types";
import { punchLabel } from "@/lib/punch-types";

interface TimelineProps {
  clips: ClipLog[];
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays === 0) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function scoreColor(score: number | null): string {
  if (score == null) return "bg-surface-hover text-muted";
  if (score <= 3) return "bg-red-500/10 text-red-400";
  if (score <= 6) return "bg-yellow-500/10 text-yellow-400";
  if (score <= 8) return "bg-green-500/10 text-green-400";
  return "bg-amber-500/15 text-wip";
}

function ScoreChip({ label, score }: { label: string; score: number | null }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs ${scoreColor(score)}`}
      title={`${label}: ${score ?? "—"}`}
    >
      {label} {score ?? "—"}
    </span>
  );
}

export function Timeline({ clips }: TimelineProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (clips.length === 0) {
    return (
      <div className="rounded-xl bg-surface-hover p-5 text-center text-sm text-muted">
        Log your first clip above to start your record.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold mb-2">Your clip log</h3>
      {clips.map((c) => {
        const expanded = expandedId === c.id;
        const summaryFirstLine = c.analysis.summary.split(". ")[0] + ".";
        return (
          <div
            key={c.id}
            role="button"
            tabIndex={0}
            aria-expanded={expanded}
            className="rounded-xl bg-surface-hover p-3 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            onClick={() => setExpandedId(expanded ? null : c.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setExpandedId(expanded ? null : c.id);
              }
            }}
          >
            <div className="flex items-start gap-3">
              {c.thumbnailB64 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`data:image/jpeg;base64,${c.thumbnailB64}`}
                  alt=""
                  className="w-20 h-15 rounded object-cover flex-shrink-0"
                  width={80}
                  height={60}
                />
              ) : (
                <div className="w-20 h-15 rounded bg-surface flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs text-muted">
                  <span>{shortDate(c.createdAt)}</span>
                  {punchLabel(c.punchType) && (
                    <span className="rounded-full bg-accent/10 px-2 py-0.5 text-accent">
                      {punchLabel(c.punchType)}
                    </span>
                  )}
                </div>
                <div className="text-sm mt-0.5 line-clamp-2">{summaryFirstLine}</div>
                <div className="flex flex-wrap gap-1 mt-2">
                  <ScoreChip label="Load" score={c.scores.loading} />
                  <ScoreChip label="Hip" score={c.scores.hipExplosion} />
                  <ScoreChip label="Transfer" score={c.scores.energyTransfer} />
                  <ScoreChip label="Follow" score={c.scores.followThrough} />
                </div>
              </div>
            </div>
            {expanded && (
              <div className="mt-3 pt-3 border-t border-border space-y-2 text-sm">
                <p className="text-muted leading-relaxed">{c.analysis.summary}</p>
                {c.analysis.strengths.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold mb-1">Strengths</div>
                    {c.analysis.strengths.map((s, i) => (
                      <div key={i} className="flex gap-2 text-muted">
                        <span className="text-green-400">+</span>
                        <span>{s}</span>
                      </div>
                    ))}
                  </div>
                )}
                {c.analysis.improvements.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold mb-1">Improvements</div>
                    {c.analysis.improvements.map((s, i) => (
                      <div key={i} className="flex gap-2 text-muted">
                        <span className="text-yellow-400">!</span>
                        <span>{s}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
