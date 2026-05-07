"use client";

import { useEffect, useState } from "react";
import { fetchLeaderboard, type LeaderboardRow } from "@/lib/games-storage";
import type { GameType, ScoreUnit } from "@/lib/games-types";

interface LeaderboardProps {
  gameType: GameType;
  scoreUnit: ScoreUnit;
  title?: string;
}

function formatScore(value: number, unit: ScoreUnit): string {
  if (unit === "ms") return `${Math.round(value)} ms`;
  if (unit === "seconds") return `${value.toFixed(1)} s`;
  return `${Math.round(value)}%`;
}

export function Leaderboard({ gameType, scoreUnit, title = "Leaderboard" }: LeaderboardProps) {
  const [entries, setEntries] = useState<LeaderboardRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await fetchLeaderboard(gameType);
      if (cancelled) return;
      if (r.status === "ok") setEntries(r.entries);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [gameType]);

  if (!loaded) return null;

  if (entries.length === 0) {
    return (
      <div className="rounded-xl bg-surface-hover p-4 text-center text-sm text-muted">
        No scores yet — be the first.
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-surface-hover p-4">
      <div className="text-sm font-semibold mb-3">{title}</div>
      <ol className="space-y-1 text-sm">
        {entries.map((e) => (
          <li key={e.rank} className="flex justify-between">
            <span className="text-muted">
              #{e.rank} {e.playerToken}
            </span>
            <span className="font-medium">{formatScore(e.scoreValue, scoreUnit)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
