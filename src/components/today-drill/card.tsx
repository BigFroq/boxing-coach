"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Target, CheckCircle2, X } from "lucide-react";
import type { DailyDrillPick, TodayDrillResponse } from "@/lib/today-drill-types";

interface TodayDrillCardProps {
  userId: string;
}

type ViewState =
  | { kind: "loading" }
  | { kind: "no-program" }
  | { kind: "pre-completion"; pick: DailyDrillPick }
  | { kind: "completed"; pick: DailyDrillPick }
  | { kind: "skipped"; pick: DailyDrillPick }
  | { kind: "error" };

function deriveState(pick: DailyDrillPick): ViewState {
  if (pick.completedAt) return { kind: "completed", pick };
  if (pick.skippedAt) return { kind: "skipped", pick };
  return { kind: "pre-completion", pick };
}

export function TodayDrillCard({ userId }: TodayDrillCardProps) {
  const [state, setState] = useState<ViewState>(() =>
    !userId || userId === "anon" ? { kind: "error" } : { kind: "loading" }
  );

  useEffect(() => {
    if (!userId || userId === "anon") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/coach/today-drill?userId=${encodeURIComponent(userId)}`);
        if (!res.ok) {
          if (!cancelled) setState({ kind: "error" });
          return;
        }
        const data = (await res.json()) as TodayDrillResponse;
        if (cancelled) return;
        if (data.status === "no-program") {
          setState({ kind: "no-program" });
        } else if (data.status === "ok") {
          setState(deriveState(data.pick));
        } else {
          setState({ kind: "error" });
        }
      } catch (err) {
        console.error("[today-drill-card] fetch failed:", err);
        if (!cancelled) setState({ kind: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function patchDrill(action: "complete" | "skip") {
    if (state.kind !== "pre-completion") return;
    const prev = state;
    // Optimistic update
    if (action === "complete") {
      setState({
        kind: "completed",
        pick: { ...state.pick, completedAt: new Date().toISOString() },
      });
    } else {
      setState({
        kind: "skipped",
        pick: { ...state.pick, skippedAt: new Date().toISOString() },
      });
    }
    try {
      const res = await fetch(
        `/api/coach/today-drill?userId=${encodeURIComponent(userId)}&today=${encodeURIComponent(state.pick.drillDate)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        }
      );
      if (!res.ok) {
        // Revert on failure
        setState(prev);
      }
    } catch (err) {
      console.error("[today-drill-card] patch failed:", err);
      setState(prev);
    }
  }

  if (state.kind === "loading" || state.kind === "error") return null;

  if (state.kind === "no-program") {
    return (
      <div className="rounded-xl bg-surface-hover p-5 text-center text-sm">
        <p className="text-muted mb-2">Take the style quiz first to get your drill program.</p>
        <Link
          href="/?tab=style"
          className="inline-block rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90"
        >
          Find your style
        </Link>
      </div>
    );
  }

  if (state.kind === "completed") {
    return (
      <div className="rounded-xl bg-green-500/10 p-4 flex items-center gap-3">
        <CheckCircle2 size={18} className="text-green-400 flex-shrink-0" />
        <div className="text-sm">
          <div className="font-medium">Drill done — see you tomorrow</div>
          <div className="text-xs text-muted mt-0.5">{state.pick.drillSnapshot.name}</div>
        </div>
      </div>
    );
  }

  if (state.kind === "skipped") {
    return (
      <div className="rounded-full inline-flex items-center gap-2 bg-surface-hover px-3 py-1 text-xs text-muted">
        <X size={12} />
        <span>Skipped today</span>
      </div>
    );
  }

  // pre-completion
  const drill = state.pick.drillSnapshot;
  return (
    <div className="rounded-xl bg-surface-hover p-5">
      <div className="flex items-center gap-2 text-xs font-semibold text-accent mb-2">
        <Target size={14} />
        TODAY&apos;S DRILL
      </div>
      <h3 className="text-base font-semibold mb-1">{drill.name}</h3>
      <p className="text-sm text-muted leading-relaxed mb-3">{state.pick.diagnosis}</p>
      <div className="text-xs text-muted mb-3">
        ⏱ {drill.duration_min} min · 🥊 {drill.context.join("/")} · {drill.intensity.join("/")}
      </div>
      {drill.cues.length > 0 && (
        <div className="mb-3">
          <div className="text-xs font-semibold mb-1">Cues</div>
          <ul className="text-sm text-muted space-y-0.5">
            {drill.cues.map((c, i) => (
              <li key={i}>• {c}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="text-xs text-muted mb-4">
        <span className="font-semibold">Dose:</span> {drill.rounds_or_dose}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => patchDrill("complete")}
          className="flex-1 rounded-lg bg-accent py-2 text-sm font-medium text-white hover:bg-accent/90"
        >
          Mark done
        </button>
        <button
          onClick={() => patchDrill("skip")}
          className="rounded-lg bg-surface px-4 py-2 text-sm text-muted hover:text-foreground"
        >
          Skip today
        </button>
      </div>
    </div>
  );
}
