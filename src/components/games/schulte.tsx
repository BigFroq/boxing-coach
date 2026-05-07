"use client";

import { useState } from "react";
import { saveScore } from "@/lib/games-storage";
import { Leaderboard } from "./leaderboard";

interface SchulteProps {
  userId: string;
  onBack: () => void;
}

const GRID_SIZE = 5;
const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;

function shuffledCells(): number[] {
  const arr = Array.from({ length: TOTAL_CELLS }, (_, i) => i + 1);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

type State =
  | { kind: "idle" }
  | { kind: "playing"; cells: number[]; nextNumber: number; startedAt: number }
  | { kind: "done"; elapsedSec: number };

export function Schulte({ userId, onBack }: SchulteProps) {
  const [state, setState] = useState<State>({ kind: "idle" });

  function startRound() {
    setState({
      kind: "playing",
      cells: shuffledCells(),
      nextNumber: 1,
      startedAt: Date.now(),
    });
  }

  function handleTap(n: number) {
    if (state.kind !== "playing") return;
    if (n !== state.nextNumber) return;
    const next = state.nextNumber + 1;
    if (next > TOTAL_CELLS) {
      const elapsedSec = (Date.now() - state.startedAt) / 1000;
      setState({ kind: "done", elapsedSec });
      if (userId && userId !== "anon") {
        void saveScore({
          userId,
          gameType: "schulte",
          scoreValue: Math.round(elapsedSec * 10) / 10,
          scoreUnit: "seconds",
        });
      }
    } else {
      setState({ ...state, nextNumber: next });
    }
  }

  if (state.kind === "idle") {
    return (
      <div className="px-4 py-6 space-y-4">
        <button onClick={onBack} className="text-xs text-muted">← Back to games</button>
        <h2 className="text-lg font-semibold">Schulte Table</h2>
        <p className="text-sm text-muted">
          Tap the numbers 1 through 25 in order, as fast as possible. Wrong taps are ignored.
        </p>
        <button
          onClick={startRound}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
        >
          Start round
        </button>
        <Leaderboard gameType="schulte" scoreUnit="seconds" title="Top 20" />
      </div>
    );
  }

  if (state.kind === "done") {
    return (
      <div className="px-4 py-6 space-y-4">
        <h2 className="text-lg font-semibold">Round complete</h2>
        <div className="rounded-xl bg-surface-hover p-5">
          <div className="text-3xl font-bold">{state.elapsedSec.toFixed(1)} s</div>
        </div>
        <div className="flex gap-2">
          <button onClick={startRound} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
            Play again
          </button>
          <button onClick={onBack} className="rounded-lg bg-surface px-4 py-2 text-sm text-muted">
            Back
          </button>
        </div>
        <Leaderboard gameType="schulte" scoreUnit="seconds" title="Top 20" />
      </div>
    );
  }

  return (
    <div className="px-4 py-6">
      <div className="mb-4 text-sm text-muted">
        Find: <span className="text-foreground font-bold">{state.nextNumber}</span>
      </div>
      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))` }}
      >
        {state.cells.map((n) => (
          <button
            key={n}
            onClick={() => handleTap(n)}
            className="aspect-square rounded-md bg-surface-hover hover:bg-surface text-base font-medium"
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
