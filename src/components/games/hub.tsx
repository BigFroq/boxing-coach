"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
    <div className="relative z-10 px-4 py-4 sm:px-8 sm:py-5">
      {(!userId || userId === "anon") && (
        <div className="mb-5 border-l-2 border-accent bg-accent/8 px-4 py-3 font-mono text-[11px] uppercase tracking-wide text-muted">
          Take the <Link href="/?tab=style" className="text-ember underline underline-offset-4">style quiz</Link> to put your scores on the board.
        </div>
      )}
      <div className="grid overflow-hidden border-l border-t border-ink/10 md:grid-cols-3">
        {GAMES.map((g, index) => {
          const Icon = g.icon;
          const best = bests[g.type];
          const isWorkInProgress = g.type === "punch_prediction";
          const isComingSoon = isWorkInProgress && punchClipsAvailable === false;
          const blurb = isComingSoon
            ? "Read the setup and call the shot. Real fight footage enters the arena when the catalog is ready."
            : g.blurb;
          return (
            <button
              key={g.type}
              onClick={() => setView({ kind: g.type })}
              className="group relative min-h-60 overflow-hidden border-b border-r border-ink/10 bg-surface/80 p-5 text-left transition-colors hover:bg-surface-hover sm:p-6"
            >
              <span className="absolute -right-3 -top-6 text-[8rem] font-black leading-none tracking-[-0.1em] text-ink/[.025]">0{index + 1}</span>
              <div className="relative flex h-full flex-col">
                <div className="flex items-center justify-between">
                  <span className="grid h-11 w-11 place-items-center border border-accent/45 bg-accent/10 text-ember"><Icon size={19} /></span>
                  {isWorkInProgress ? (
                    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-wip">WIP / Arena 0{index + 1}</span>
                  ) : (
                    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink/35">Arena 0{index + 1}</span>
                  )}
                </div>
                <h3 className="mt-7 text-2xl font-semibold tracking-[-0.04em]">{g.name}</h3>
                <p className="mt-3 max-w-xs text-sm leading-relaxed text-ink/50">{blurb}</p>
                <div className="mt-auto flex items-end justify-between pt-8">
                  {isComingSoon ? (
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-wip">In development</span>
                  ) : (
                    <span><span className="block font-mono text-[9px] uppercase tracking-[0.16em] text-ink/30">Personal best</span><span className="mt-1 block text-sm font-medium text-ink/75">{best != null ? formatScore(best, g.unit) : "No score yet"}</span></span>
                  )}
                  <span className="font-mono text-xs text-ember transition-transform group-hover:translate-x-1">ENTER →</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
