"use client";

import { DIMENSION_LABELS, type DimensionScores } from "@/data/fighter-profiles";

interface RadarChartProps {
  scores: DimensionScores;
}

const DIMENSIONS = Object.keys(DIMENSION_LABELS) as (keyof DimensionScores)[];
const CENTER = 200;
const RADIUS = 110;
const LABEL_RADIUS = RADIUS + 30;
const RINGS = [25, 50, 75, 100];

function polarToCartesian(angle: number, value: number, maxRadius: number) {
  const r = (value / 100) * maxRadius;
  const x = CENTER + r * Math.cos(angle);
  const y = CENTER + r * Math.sin(angle);
  return { x, y };
}

export function RadarChart({ scores }: RadarChartProps) {
  const angleStep = (2 * Math.PI) / DIMENSIONS.length;
  // Start from top (-90 degrees)
  const startAngle = -Math.PI / 2;

  const points = DIMENSIONS.map((dim, i) => {
    const angle = startAngle + i * angleStep;
    return polarToCartesian(angle, scores[dim], RADIUS);
  });

  const polygonPath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";

  return (
    <div className="w-full max-w-md mx-auto aspect-square">
      <svg viewBox="0 0 400 400" className="w-full h-full">
        {/* Concentric rings */}
        {RINGS.map((ring) => {
          const r = (ring / 100) * RADIUS;
          return (
            <circle
              key={ring}
              cx={CENTER}
              cy={CENTER}
              r={r}
              fill="none"
              stroke="currentColor"
              className="text-border"
              strokeWidth={0.5}
            />
          );
        })}

        {/* Axes */}
        {DIMENSIONS.map((_, i) => {
          const angle = startAngle + i * angleStep;
          const end = polarToCartesian(angle, 100, RADIUS);
          return (
            <line
              key={i}
              x1={CENTER}
              y1={CENTER}
              x2={end.x}
              y2={end.y}
              stroke="currentColor"
              className="text-border"
              strokeWidth={0.5}
            />
          );
        })}

        {/* Score polygon */}
        <path d={polygonPath} fill="#3b82f6" fillOpacity={0.15} stroke="#3b82f6" strokeWidth={2} />

        {/* Score dots */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} fill="#3b82f6" />
        ))}

        {/* Axis labels */}
        {DIMENSIONS.map((dim, i) => {
          const angle = startAngle + i * angleStep;
          const pos = polarToCartesian(angle, 100, LABEL_RADIUS);

          // Determine text-anchor based on horizontal position
          let anchor: "start" | "middle" | "end" = "middle";
          if (pos.x < CENTER - 10) anchor = "end";
          else if (pos.x > CENTER + 10) anchor = "start";

          // Nudge vertical alignment
          let dy = "0.35em";
          if (pos.y < CENTER - 40) dy = "0.8em";
          if (pos.y > CENTER + 40) dy = "-0.2em";

          return (
            <text
              key={dim}
              x={pos.x}
              y={pos.y}
              textAnchor={anchor}
              dy={dy}
              fill="currentColor"
              className="text-muted"
              fontSize={9}
              fontWeight={500}
            >
              {DIMENSION_LABELS[dim]}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
