"use client";

import { useEffect, useState } from "react";
import { Zap, Grid3x3, Crosshair } from "lucide-react";
import { fetchUserBest, fetchPunchClips } from "@/lib/games-storage";
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
  const [punchClipsAvailable, setPunchClipsAvailable] = useState<boolean | null>(null);

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await fetchPunchClips(1, []);
      if (cancelled) return;
      setPunchClipsAvailable(r.status === "ok" && r.clips.length > 0);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
          const isComingSoon = g.type === "punch_prediction" && punchClipsAvailable === false;
          const blurb = isComingSoon
            ? "Watch a fighter set up, predict the punch. Boxing-specific cognition built on real fight footage. Launching once the catalog is labeled."
            : g.blurb;
          return (
            <button
              key={g.type}
              onClick={() => setView({ kind: g.type })}
              className="w-full text-left rounded-xl bg-surface-hover hover:bg-surface p-4 flex items-center gap-3"
            >
              <Icon
                size={20}
                className={`flex-shrink-0 ${isComingSoon ? "text-muted" : "text-accent"}`}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-semibold">{g.name}</span>
                  {isComingSoon && (
                    <span className="text-[10px] uppercase tracking-wide text-yellow-400 bg-yellow-500/10 px-1.5 py-0.5 rounded">
                      Coming soon
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted">{blurb}</div>
              </div>
              {!isComingSoon && (
                <div className="text-xs text-muted text-right flex-shrink-0">
                  {best != null ? `Best ${formatScore(best, g.unit)}` : "—"}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
