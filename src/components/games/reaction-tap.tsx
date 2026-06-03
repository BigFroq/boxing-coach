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
  | { kind: "result"; attemptIdx: number; reactionMs: number; isLastAttempt: boolean }
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
      const isLastAttempt = nextIdx >= TOTAL_ATTEMPTS;
      setState({
        kind: "result",
        attemptIdx: state.attemptIdx,
        reactionMs,
        isLastAttempt,
      });
      // After showing result for 1.5s, either start next attempt or finish round.
      timerRef.current = setTimeout(() => {
        if (isLastAttempt) {
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
          startAttempt(nextIdx);
        }
      }, 1500);
    }
  }

  if (state.kind === "idle") {
    return (
      <div className="px-4 py-6 space-y-4 max-w-md mx-auto">
        <button onClick={onBack} className="text-xs text-muted">← Back to games</button>
        <h2 className="text-lg font-semibold">Reaction Tap</h2>
        <p className="text-sm text-muted">
          Wait for the screen to turn green, then tap as fast as you can.
          5 attempts, average reported. Tap before green and the round restarts.
        </p>
        <div className="rounded-xl bg-surface-hover/50 border border-accent/10 p-4 space-y-1.5">
          <div className="text-[10px] uppercase tracking-wide text-accent font-semibold">
            Why this matters in boxing
          </div>
          <p className="text-xs text-muted leading-relaxed">
            In the ring, the fighter who reads a punch first gets the first slip, the first counter, the first hit.
            Reaction time is one of the most measurable aspects of fight readiness — this is just a quick check on where your reflexes are today.
          </p>
        </div>
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
      <div className="px-4 py-6 space-y-4 max-w-md mx-auto">
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

  if (state.kind === "result") {
    return (
      <div className="min-h-[60vh] bg-blue-500/15 flex flex-col items-center justify-center p-6">
        <div className="text-xs uppercase tracking-wide text-blue-300 mb-2">
          Attempt {state.attemptIdx + 1} / {TOTAL_ATTEMPTS}
        </div>
        <div className="text-5xl font-bold text-foreground">{Math.round(state.reactionMs)} ms</div>
        <div className="text-xs text-muted mt-3">
          {state.isLastAttempt ? "Last one — finishing up…" : "Next attempt in a moment…"}
        </div>
      </div>
    );
  }

  // waiting or ready — full-bleed colored area
  const isReady = state.kind === "ready";
  const bg = isReady ? "bg-green-500" : "bg-red-500";
  const label = isReady ? "TAP NOW" : "WAIT";
  return (
    <button
      type="button"
      aria-label={isReady ? "Tap now" : "Wait for green, then tap"}
      className={`min-h-[60vh] w-full ${bg} flex items-center justify-center cursor-pointer text-white text-3xl font-bold`}
      onClick={handleTap}
    >
      {label}
    </button>
  );
}
