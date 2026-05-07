"use client";

import { useEffect, useRef, useState } from "react";
import { saveScore } from "@/lib/games-storage";
import { Leaderboard } from "./leaderboard";

interface ReactionTapProps {
  userId: string;
  onBack: () => void;
}

const TOTAL_ATTEMPTS = 5;

type GameState =
  | { kind: "idle" }
  | { kind: "waiting"; attemptIdx: number; startedAt: number }
  | { kind: "ready"; attemptIdx: number; greenAt: number }
  | { kind: "false-start"; attemptIdx: number }
  | { kind: "round-done"; attempts: number[] };

export function ReactionTap({ userId, onBack }: ReactionTapProps) {
  const [state, setState] = useState<GameState>({ kind: "idle" });
  const attemptsRef = useRef<number[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function startAttempt(idx: number) {
    setState({ kind: "waiting", attemptIdx: idx, startedAt: Date.now() });
    const delayMs = 1000 + Math.random() * 4000;
    timerRef.current = setTimeout(() => {
      setState({ kind: "ready", attemptIdx: idx, greenAt: Date.now() });
    }, delayMs);
  }

  function startRound() {
    attemptsRef.current = [];
    startAttempt(0);
  }

  function handleTap() {
    if (state.kind === "waiting") {
      if (timerRef.current) clearTimeout(timerRef.current);
      setState({ kind: "false-start", attemptIdx: state.attemptIdx });
    } else if (state.kind === "ready") {
      const reactionMs = Date.now() - state.greenAt;
      attemptsRef.current = [...attemptsRef.current, reactionMs];
      const nextIdx = state.attemptIdx + 1;
      if (nextIdx >= TOTAL_ATTEMPTS) {
        const avg = attemptsRef.current.reduce((a, b) => a + b, 0) / attemptsRef.current.length;
        setState({ kind: "round-done", attempts: attemptsRef.current });
        if (userId && userId !== "anon") {
          void saveScore({
            userId,
            gameType: "reaction_tap",
            scoreValue: Math.round(avg),
            scoreUnit: "ms",
          });
        }
      } else {
        timerRef.current = setTimeout(() => startAttempt(nextIdx), 600);
      }
    }
  }

  if (state.kind === "idle") {
    return (
      <div className="px-4 py-6 space-y-4">
        <button onClick={onBack} className="text-xs text-muted">← Back to games</button>
        <h2 className="text-lg font-semibold">Reaction Tap</h2>
        <p className="text-sm text-muted">
          Wait for the screen to turn green, then tap as fast as you can.
          5 attempts, average reported. Tap before green and the round restarts.
        </p>
        <button
          onClick={startRound}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
        >
          Start round
        </button>
        <Leaderboard gameType="reaction_tap" scoreUnit="ms" title="Top 20" />
      </div>
    );
  }

  if (state.kind === "false-start") {
    return (
      <div
        className="min-h-[60vh] bg-yellow-500/20 flex flex-col items-center justify-center p-6 cursor-pointer"
        onClick={() => setState({ kind: "idle" })}
      >
        <div className="text-2xl font-semibold mb-2">False start</div>
        <div className="text-sm text-muted">Tap to restart</div>
      </div>
    );
  }

  if (state.kind === "round-done") {
    const avg = state.attempts.reduce((a, b) => a + b, 0) / state.attempts.length;
    return (
      <div className="px-4 py-6 space-y-4">
        <h2 className="text-lg font-semibold">Round complete</h2>
        <div className="rounded-xl bg-surface-hover p-5">
          <div className="text-3xl font-bold">{Math.round(avg)} ms</div>
          <div className="text-xs text-muted mt-1">
            Attempts: {state.attempts.map((a) => Math.round(a)).join(" · ")} ms
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={startRound}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
          >
            Play again
          </button>
          <button onClick={onBack} className="rounded-lg bg-surface px-4 py-2 text-sm text-muted">
            Back
          </button>
        </div>
        <Leaderboard gameType="reaction_tap" scoreUnit="ms" title="Top 20" />
      </div>
    );
  }

  // waiting or ready — full-bleed colored area
  const isReady = state.kind === "ready";
  const bg = isReady ? "bg-green-500" : "bg-red-500";
  const label = isReady ? "TAP NOW" : "WAIT";
  return (
    <div
      className={`min-h-[60vh] ${bg} flex items-center justify-center cursor-pointer text-white text-3xl font-bold`}
      onClick={handleTap}
    >
      {label}
    </div>
  );
}
