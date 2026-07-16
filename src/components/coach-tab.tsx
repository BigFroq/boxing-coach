"use client";

import { useState } from "react";
import { CoachSession } from "./coach-session";
import { CoachProgress } from "./coach-progress";
import { CoachClipReview } from "./coach-clip-review";

interface CoachTabProps {
  userId: string;
}

export function CoachTab({ userId }: CoachTabProps) {
  const [view, setView] = useState<"session" | "clip" | "progress">("session");

  return (
    <div className="flex h-full flex-col">
      <div className="relative z-10 grid grid-cols-3 border-b border-ink/10 bg-black/20 px-3 py-3 sm:flex sm:px-8">
        {([
          ["session", "01", "Log Session"],
          ["clip", "02", "Review Clip"],
          ["progress", "03", "Progress"],
        ] as const).map(([id, index, label]) => {
          const active = view === id;
          return (
            <button
              key={id}
              onClick={() => setView(id)}
              aria-pressed={active}
              className={`relative min-h-[48px] border px-3 py-2 text-left transition-colors sm:min-w-40 ${active ? "border-accent/55 bg-accent-surface/55 text-white" : "border-transparent text-muted hover:bg-ink/[.035] hover:text-foreground"}`}
            >
              <span className={`block font-mono text-[9px] tracking-[0.14em] ${active ? "text-ember" : "text-ink/25"}`}>{index} / CORNER</span>
              <span className="mt-1 block text-xs font-medium sm:text-sm">{label}</span>
              {active && <span className="absolute inset-x-3 bottom-0 h-px bg-ember" />}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-hidden">
        {view === "session" && <CoachSession userId={userId} />}
        {view === "clip" && <CoachClipReview userId={userId} />}
        {view === "progress" && <CoachProgress userId={userId} />}
      </div>
    </div>
  );
}
