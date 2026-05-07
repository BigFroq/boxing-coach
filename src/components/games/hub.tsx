"use client";

import { useEffect, useState } from "react";
import { Zap, Grid3x3, Crosshair } from "lucide-react";
import { fetchUserBest } from "@/lib/games-storage";
import { ReactionTap } from "./reaction-tap";
import { Schulte } from "./schulte";
import { PunchPrediction } from "./punch-prediction";
import type { GameType, ScoreUnit } from "@/lib/games-types";

interface HubProps {
  userId: string;
}

type ActiveView =
  | { kind: "hub" }
  | { kind: "reaction_tap" }
  | { kind: "schulte" }
  | { kind: "punch_prediction" };

interface GameMeta {
  type: GameType;
  name: string;
  blurb: string;
  icon: typeof Zap;
  unit: ScoreUnit;
}

const GAMES: GameMeta[] = [
  { type: "reaction_tap", name: "Reaction Tap", blurb: "Tap when the screen turns green. Fastest wins.", icon: Zap, unit: "ms" },
  { type: "schulte", name: "Schulte Table", blurb: "Find numbers 1 through 25, in order, as fast as possible.", icon: Grid3x3, unit: "seconds" },
  { type: "punch_prediction", name: "Punch Prediction", blurb: "Watch a fighter set up. Guess the punch.", icon: Crosshair, unit: "accuracy_pct" },
];

function formatScore(value: number, unit: ScoreUnit): string {
  if (unit === "ms") return `${Math.round(value)} ms`;
  if (unit === "seconds") return `${value.toFixed(1)} s`;
  return `${Math.round(value)}%`;
}

export function GamesHub({ userId }: HubProps) {
  const [view, setView] = useState<ActiveView>({ kind: "hub" });
  const [bests, setBests] = useState<Partial<Record<GameType, number | null>>>({});

  useEffect(() => {
    if (view.kind !== "hub") return;
    if (!userId || userId === "anon") return;
    let cancelled = false;
    (async () => {
      const next: Partial<Record<GameType, number | null>> = {};
      for (const g of GAMES) {
        const r = await fetchUserBest(userId, g.type);
        if (r.status === "ok") next[g.type] = r.score;
      }
      if (!cancelled) setBests(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [view.kind, userId]);

  if (view.kind === "reaction_tap") {
    return <ReactionTap userId={userId} onBack={() => setView({ kind: "hub" })} />;
  }
  if (view.kind === "schulte") {
    return <Schulte userId={userId} onBack={() => setView({ kind: "hub" })} />;
  }
  if (view.kind === "punch_prediction") {
    return <PunchPrediction userId={userId} onBack={() => setView({ kind: "hub" })} />;
  }

  return (
    <div className="px-4 sm:px-6 py-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Games</h2>
        <p className="text-sm text-muted">Quick reflex challenges and pattern-recognition fun.</p>
      </div>
      {(!userId || userId === "anon") && (
        <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/20 p-3 text-xs text-muted">
          Take the <a href="/?tab=style" className="text-accent underline">style quiz</a> first to save your scores.
        </div>
      )}
      <div className="space-y-2">
        {GAMES.map((g) => {
          const Icon = g.icon;
          const best = bests[g.type];
          return (
            <button
              key={g.type}
              onClick={() => setView({ kind: g.type })}
              className="w-full text-left rounded-xl bg-surface-hover hover:bg-surface p-4 flex items-center gap-3"
            >
              <Icon size={20} className="text-accent flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">{g.name}</div>
                <div className="text-xs text-muted">{g.blurb}</div>
              </div>
              <div className="text-xs text-muted text-right flex-shrink-0">
                {best != null ? `Best ${formatScore(best, g.unit)}` : "—"}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
