"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import type { DrillProgram, Intensity, Context, TimeMin } from "@/lib/drill-program-types";
import { DEFAULT_INTENSITY, DEFAULT_CONTEXT, DEFAULT_TIME_MIN } from "@/lib/drill-program-types";
import { FilterPills } from "./filter-pills";
import { SessionView } from "./session-view";
import { BrowseView } from "./browse-view";
import { RegenerateButton } from "./regenerate-button";
import { ProgramEmptyState } from "./program-empty-state";

type Mode = "session" | "browse";
type Props = { userId: string };

export function DrillProgramView({ userId }: Props) {
  const [program, setProgram] = useState<DrillProgram | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEmpty, setIsEmpty] = useState(false);

  const [intensity, setIntensity] = useState<Intensity>(DEFAULT_INTENSITY);
  const [context, setContext] = useState<Context>(DEFAULT_CONTEXT);
  const [timeMin, setTimeMin] = useState<TimeMin>(DEFAULT_TIME_MIN);
  const [mode, setMode] = useState<Mode>("session");

  async function fetchProgram(force = false) {
    setLoading(true);
    setError(null);
    setIsEmpty(false);
    try {
      const res = await fetch("/api/drill-program", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, ...(force ? { force: true } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 404 && typeof (data as { error?: string }).error === "string" &&
          (data as { error: string }).error.includes("No current style profile")) {
        setIsEmpty(true);
        return;
      }
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? "Failed to load drill program");
      }
      setProgram((data as { drill_program: DrillProgram }).drill_program);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load drill program");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchProgram(); }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted" />
      </div>
    );
  }

  if (isEmpty) return <ProgramEmptyState />;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 py-12 text-center gap-4">
        <p className="text-sm text-muted">{error}</p>
        <button
          onClick={() => fetchProgram()}
          className="rounded-lg border border-border px-4 py-2 text-xs text-muted hover:text-foreground transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!program) return <ProgramEmptyState />;

  function handleFilterChange(next: { intensity: Intensity; context: Context; timeMin: TimeMin }) {
    setIntensity(next.intensity);
    setContext(next.context);
    setTimeMin(next.timeMin);
  }

  const modeBase = "px-4 py-1.5 text-xs font-medium rounded-full transition-colors";
  const modeActive = "bg-accent/10 text-accent";
  const modeInactive = "text-muted hover:text-foreground";

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Your drill program</h2>
        <RegenerateButton userId={userId} onRegenerated={setProgram} />
      </div>

      {/* Filters */}
      <FilterPills
        intensity={intensity}
        context={context}
        timeMin={timeMin}
        onChange={handleFilterChange}
      />

      {/* Mode toggle */}
      <div className="flex items-center gap-1 rounded-full border border-border p-0.5 w-fit">
        <button
          onClick={() => setMode("session")}
          className={`${modeBase} ${mode === "session" ? modeActive : modeInactive}`}
        >
          Session
        </button>
        <button
          onClick={() => setMode("browse")}
          className={`${modeBase} ${mode === "browse" ? modeActive : modeInactive}`}
        >
          Browse
        </button>
      </div>

      {/* Body */}
      {mode === "session" ? (
        <SessionView program={program} intensity={intensity} context={context} timeMin={timeMin} />
      ) : (
        <BrowseView program={program} intensity={intensity} context={context} timeMin={timeMin} />
      )}
    </div>
  );
}
