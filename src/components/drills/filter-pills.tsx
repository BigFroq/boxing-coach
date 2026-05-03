"use client";

import {
  INTENSITY_VALUES,
  CONTEXT_VALUES,
  TIME_MIN_VALUES,
  type Intensity,
  type Context,
  type TimeMin,
} from "@/lib/drill-program-types";

type Props = {
  intensity: Intensity;
  context: Context;
  timeMin: TimeMin;
  onChange: (next: { intensity: Intensity; context: Context; timeMin: TimeMin }) => void;
};

const pillBase =
  "rounded-full border px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap";
const pillActive = "border-accent text-accent bg-accent/10";
const pillInactive = "border-border text-muted hover:text-foreground";

export function FilterPills({ intensity, context, timeMin, onChange }: Props) {
  return (
    <div className="space-y-2">
      {/* Intensity */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <span className="text-xs text-muted shrink-0 w-14">Intensity</span>
        <div className="flex gap-1.5">
          {INTENSITY_VALUES.map((v) => (
            <button
              key={v}
              onClick={() => onChange({ intensity: v, context, timeMin })}
              aria-pressed={v === intensity}
              className={`${pillBase} ${intensity === v ? pillActive : pillInactive} capitalize`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Context */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <span className="text-xs text-muted shrink-0 w-14">Context</span>
        <div className="flex gap-1.5">
          {CONTEXT_VALUES.map((v) => (
            <button
              key={v}
              onClick={() => onChange({ intensity, context: v, timeMin })}
              aria-pressed={v === context}
              className={`${pillBase} ${context === v ? pillActive : pillInactive} capitalize`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Time */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <span className="text-xs text-muted shrink-0 w-14">Time</span>
        <div className="flex gap-1.5">
          {TIME_MIN_VALUES.map((v) => (
            <button
              key={v}
              onClick={() => onChange({ intensity, context, timeMin: v })}
              aria-pressed={v === timeMin}
              className={`${pillBase} ${timeMin === v ? pillActive : pillInactive}`}
            >
              {v}m
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
