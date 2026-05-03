"use client";

import type { DrillProgram, Intensity, Context, TimeMin, DrillEntry } from "@/lib/drill-program-types";
import { DrillCard } from "./drill-card";

type Props = {
  program: DrillProgram;
  intensity: Intensity;
  context: Context;
  timeMin: TimeMin;
};

export function SessionView({ program, intensity, context, timeMin }: Props) {
  const session = program.sessions.find(
    (s) => s.intensity === intensity && s.context === context && s.time_min === timeMin
  );

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
        <p className="text-sm text-muted">No session for this combo yet — try Browse mode.</p>
      </div>
    );
  }

  const drillMap = new Map<string, DrillEntry>(program.drills.map((d) => [d.id, d]));
  const drills = session.drill_ids.map((id) => drillMap.get(id)).filter((d): d is DrillEntry => !!d);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted italic">{session.intro}</p>
      <div className="space-y-3">
        {drills.map((drill, i) => (
          <DrillCard key={drill.id} drill={drill} index={i} />
        ))}
      </div>
    </div>
  );
}
