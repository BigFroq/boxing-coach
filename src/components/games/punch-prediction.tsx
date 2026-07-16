"use client";

import { useEffect, useRef, useState } from "react";
import { saveScore, fetchPunchClips } from "@/lib/games-storage";
import { Leaderboard } from "./leaderboard";
import type { PunchClip, PunchLabel } from "@/lib/games-types";

interface PunchPredictionProps {
  userId: string;
  onBack: () => void;
}

const PROMPTS_PER_ROUND = 10;
const SHOW_MS = 1500;
const ANSWER_TIMEOUT_MS = 3000;

const PUNCHES: PunchLabel[] = ["jab", "cross", "hook", "uppercut"];

interface Answer {
  clipId: string;
  correctLabel: PunchLabel;
  guess: PunchLabel | null;
  responseMs: number;
  points: number;
}

function pointsFor(correct: boolean, responseMs: number): number {
  if (!correct) return 0;
  if (responseMs <= 1000) return 100;
  if (responseMs <= 3000) return 70;
  return 30;
}

type State =
  | { kind: "loading" }
  | { kind: "no-content" }
  | { kind: "idle"; clips: PunchClip[] }
  | { kind: "showing"; clips: PunchClip[]; idx: number; startedAt: number; answers: Answer[] }
  | { kind: "answering"; clips: PunchClip[]; idx: number; hiddenAt: number; answers: Answer[] }
  | { kind: "round-done"; answers: Answer[] };

export function PunchPrediction({ userId, onBack }: PunchPredictionProps) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const seenIdsRef = useRef<string[]>([]);

  useEffect(() => {
    if (state.kind !== "loading") return;
    let cancelled = false;
    (async () => {
      const r = await fetchPunchClips(PROMPTS_PER_ROUND, seenIdsRef.current);
      if (cancelled) return;
      if (r.status === "ok" && r.clips.length > 0) {
        setState({ kind: "idle", clips: r.clips });
      } else {
        setState({ kind: "no-content" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state.kind]);

  function startRound(clips: PunchClip[]) {
    setState({
      kind: "showing",
      clips,
      idx: 0,
      startedAt: Date.now(),
      answers: [],
    });
  }

  function recordAnswer(guess: PunchLabel | null) {
    setState((prev) => {
      if (prev.kind !== "answering") return prev;
      const clip = prev.clips[prev.idx];
      const responseMs = Math.min(Date.now() - prev.hiddenAt, ANSWER_TIMEOUT_MS);
      const correct = guess === clip.punchLabel;
      const answer: Answer = {
        clipId: clip.id,
        correctLabel: clip.punchLabel,
        guess,
        responseMs,
        points: pointsFor(correct, responseMs),
      };
      seenIdsRef.current.push(clip.id);
      const newAnswers = [...prev.answers, answer];
      const nextIdx = prev.idx + 1;
      if (nextIdx >= prev.clips.length) {
        const totalPoints = newAnswers.reduce((sum, a) => sum + a.points, 0);
        const accuracyPct = Math.round((totalPoints / (PROMPTS_PER_ROUND * 100)) * 100);
        if (userId && userId !== "anon") {
          void saveScore({
            userId,
            gameType: "punch_prediction",
            scoreValue: accuracyPct,
            scoreUnit: "accuracy_pct",
          });
        }
        return { kind: "round-done", answers: newAnswers };
      }
      return {
        kind: "showing",
        clips: prev.clips,
        idx: nextIdx,
        startedAt: Date.now(),
        answers: newAnswers,
      };
    });
  }

  // Manage transitions: showing -> answering after SHOW_MS, answering -> next on click or timeout
  useEffect(() => {
    if (state.kind === "showing") {
      const t = setTimeout(() => {
        setState((prev) => {
          if (prev.kind !== "showing") return prev;
          return {
            kind: "answering",
            clips: prev.clips,
            idx: prev.idx,
            hiddenAt: Date.now(),
            answers: prev.answers,
          };
        });
      }, SHOW_MS);
      return () => clearTimeout(t);
    }
    if (state.kind === "answering") {
      const remaining = ANSWER_TIMEOUT_MS - (Date.now() - state.hiddenAt);
      if (remaining <= 0) return;
      const t = setTimeout(() => recordAnswer(null), remaining);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.kind, state.kind === "answering" ? state.idx : -1, state.kind === "showing" ? state.idx : -1]);

  if (state.kind === "loading") {
    return <div className="px-4 py-6 text-sm text-muted">Loading clips…</div>;
  }

  if (state.kind === "no-content") {
    return (
      <div className="px-4 py-6 space-y-3 max-w-md mx-auto">
        <button onClick={onBack} className="text-xs text-muted">← Back to games</button>
        <h2 className="text-lg font-semibold">Punch Prediction</h2>
        <div className="rounded-xl bg-surface-hover p-5 text-center text-sm text-muted">
          Coming soon — content being labeled.
        </div>
      </div>
    );
  }

  if (state.kind === "idle") {
    return (
      <div className="px-4 py-6 space-y-4 max-w-md mx-auto">
        <button onClick={onBack} className="text-xs text-muted">← Back to games</button>
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Punch Prediction</h2>
          <span className="border border-wip/40 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-wip">WIP</span>
        </div>
        <p className="text-sm text-muted">
          Watch a fighter set up. {SHOW_MS}ms after the image hides, choose the punch you think is coming.
          Faster correct answers score more. {state.clips.length} prompts.
        </p>
        <button
          onClick={() => startRound(state.clips)}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
        >
          Start round
        </button>
        <Leaderboard gameType="punch_prediction" scoreUnit="accuracy_pct" title="Top 20" />
      </div>
    );
  }

  if (state.kind === "round-done") {
    const totalPoints = state.answers.reduce((sum, a) => sum + a.points, 0);
    const accuracyPct = Math.round((totalPoints / (PROMPTS_PER_ROUND * 100)) * 100);
    const correct = state.answers.filter((a) => a.guess === a.correctLabel).length;
    return (
      <div className="px-4 py-6 space-y-4 max-w-md mx-auto">
        <h2 className="text-lg font-semibold">Round complete</h2>
        <div className="rounded-xl bg-surface-hover p-5">
          <div className="text-3xl font-bold">{accuracyPct}%</div>
          <div className="text-xs text-muted mt-1">
            {correct}/{state.answers.length} correct
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setState({ kind: "loading" })}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
          >
            Play again
          </button>
          <button onClick={onBack} className="rounded-lg bg-surface px-4 py-2 text-sm text-muted">
            Back
          </button>
        </div>
        <Leaderboard gameType="punch_prediction" scoreUnit="accuracy_pct" title="Top 20" />
      </div>
    );
  }

  if (state.kind === "showing") {
    const clip = state.clips[state.idx];
    return (
      <div className="px-4 py-6 space-y-3 max-w-md mx-auto">
        <div className="text-xs text-muted">
          {state.idx + 1} / {state.clips.length}
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`data:image/jpeg;base64,${clip.imageB64}`}
          alt=""
          className="rounded-xl w-full max-w-md mx-auto"
        />
        <div className="text-center text-xs text-muted">Watch closely…</div>
      </div>
    );
  }

  // answering
  return (
    <div className="px-4 py-6 space-y-4 max-w-md mx-auto">
      <div className="text-xs text-muted">
        {state.idx + 1} / {state.clips.length} — what punch?
      </div>
      <div className="grid grid-cols-2 gap-2 max-w-md mx-auto">
        {PUNCHES.map((p) => (
          <button
            key={p}
            onClick={() => recordAnswer(p)}
            className="rounded-xl bg-surface-hover hover:bg-surface py-4 text-base font-medium capitalize"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
