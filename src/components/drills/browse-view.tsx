"use client";

import type { DrillProgram, Intensity, Context, TimeMin } from "@/lib/drill-program-types";
import { DrillCard } from "./drill-card";

type Props = {
  program: DrillProgram;
  intensity: Intensity;
  context: Context;
  timeMin: TimeMin;
};

export function BrowseView({ program, intensity, context, timeMin }: Props) {
  const drills = program.drills
    .filter(
      (d) =>
        d.intensity.includes(intensity) &&
        d.context.includes(context) &&
        d.duration_min <= timeMin + 5
    )
    .sort((a, b) => a.duration_min - b.duration_min);

  if (drills.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
        <p className="text-sm text-muted">No drills match this combo. Try widening the filters.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {drills.map((drill) => (
        <DrillCard key={drill.id} drill={drill} />
      ))}
    </div>
  );
}
