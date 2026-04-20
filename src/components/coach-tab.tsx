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
      <div className="flex gap-2 px-4 sm:px-6 pt-4">
        <button
          onClick={() => setView("session")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            view === "session"
              ? "bg-accent text-white"
              : "bg-surface-hover text-muted hover:text-foreground"
          }`}
        >
          Log Session
        </button>
        <button
          onClick={() => setView("clip")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            view === "clip"
              ? "bg-accent text-white"
              : "bg-surface-hover text-muted hover:text-foreground"
          }`}
        >
          Review Clip
        </button>
        <button
          onClick={() => setView("progress")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            view === "progress"
              ? "bg-accent text-white"
              : "bg-surface-hover text-muted hover:text-foreground"
          }`}
        >
          My Progress
        </button>
      </div>

      <div className="flex-1 overflow-hidden">
        {view === "session" && <CoachSession userId={userId} />}
        {view === "clip" && <CoachClipReview userId={userId} />}
        {view === "progress" && <CoachProgress userId={userId} />}
      </div>
    </div>
  );
}
