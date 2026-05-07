"use client";

import type { ClipLog, ClipScores } from "@/lib/clip-log-types";

interface DiffCardProps {
  current: ClipScores;
  previous: ClipLog | null;
}

interface PhaseRow {
  label: string;
  current: number | null;
  previous: number | null;
}

function relativeTime(iso: string, now: Date = new Date()): string {
  const ms = now.getTime() - new Date(iso).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "1 week ago";
  return `${Math.floor(days / 7)} weeks ago`;
}

export function DiffCard({ current, previous }: DiffCardProps) {
  if (!previous) return null;

  const rows: PhaseRow[] = [
    { label: "Loading", current: current.loading, previous: previous.scores.loading },
    { label: "Hip", current: current.hipExplosion, previous: previous.scores.hipExplosion },
    { label: "Transfer", current: current.energyTransfer, previous: previous.scores.energyTransfer },
    { label: "Follow", current: current.followThrough, previous: previous.scores.followThrough },
  ];

  return (
    <div className="rounded-xl bg-surface-hover p-4 text-sm">
      <div className="text-xs text-muted mb-2">
        vs your last clip · {relativeTime(previous.createdAt)}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {rows.map((r) => {
          if (r.current == null || r.previous == null) {
            return (
              <span key={r.label} className="text-muted">
                {r.label} —
              </span>
            );
          }
          const delta = r.current - r.previous;
          const arrow = delta >= 1 ? "↑" : delta <= -1 ? "↓" : "–";
          const color =
            delta >= 1
              ? "text-green-400"
              : delta <= -1
              ? "text-yellow-400"
              : "text-muted";
          return (
            <span key={r.label} className={color}>
              {r.label} {r.previous} → {r.current} {arrow}
            </span>
          );
        })}
      </div>
    </div>
  );
}
