"use client";

import { type DimensionScores } from "@/data/fighter-profiles";

interface RadarChartProps {
  scores: DimensionScores;
  onDimensionClick?: (key: keyof DimensionScores) => void;
}

// Short labels that fit in the chart
const CHART_LABELS: Record<keyof DimensionScores, string> = {
  powerMechanics: "Power",
  positionalReadiness: "Position",
  rangeControl: "Range",
  defensiveIntegration: "Defense",
  ringIQ: "Ring IQ",
  outputPressure: "Pressure",
  deceptionSetup: "Deception",
  killerInstinct: "Killer Instinct",
};

const DIMENSIONS = Object.keys(CHART_LABELS) as (keyof DimensionScores)[];
const CENTER = 150;
const RADIUS = 90;
const LABEL_RADIUS = RADIUS + 28;
const RINGS = [25, 50, 75, 100];

function polarToCartesian(angle: number, value: number, maxRadius: number) {
  const r = (value / 100) * maxRadius;
  const x = CENTER + r * Math.cos(angle);
  const y = CENTER + r * Math.sin(angle);
  return { x, y };
}

export function RadarChart({ scores, onDimensionClick }: RadarChartProps) {
  const angleStep = (2 * Math.PI) / DIMENSIONS.length;
  const startAngle = -Math.PI / 2;

  const points = DIMENSIONS.map((dim, i) => {
    const angle = startAngle + i * angleStep;
    return polarToCartesian(angle, scores[dim], RADIUS);
  });

  const polygonPath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";

  return (
    <div className="w-full max-w-sm mx-auto aspect-square">
      <svg viewBox="0 0 300 300" className="w-full h-full overflow-visible">
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

        {/* Axis labels — now clickable when onDimensionClick is provided */}
        {DIMENSIONS.map((dim, i) => {
          const angle = startAngle + i * angleStep;
          const pos = polarToCartesian(angle, 100, LABEL_RADIUS);

          let anchor: "start" | "middle" | "end" = "middle";
          if (pos.x < CENTER - 10) anchor = "end";
          else if (pos.x > CENTER + 10) anchor = "start";

          let dy = "0.35em";
          if (pos.y < CENTER - 30) dy = "0em";
          if (pos.y > CENTER + 30) dy = "0.8em";

          const labelEl = (
            <text
              x={pos.x}
              y={pos.y}
              textAnchor={anchor}
              dy={dy}
              fill="currentColor"
              className={onDimensionClick ? "text-foreground cursor-pointer underline-offset-2 hover:underline" : "text-foreground"}
              fontSize={10}
              fontWeight={500}
            >
              {CHART_LABELS[dim]}
            </text>
          );

          if (!onDimensionClick) {
            return <g key={dim}>{labelEl}</g>;
          }

          return (
            <g
              key={dim}
              role="button"
              tabIndex={0}
              onClick={() => onDimensionClick(dim)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onDimensionClick(dim);
                }
              }}
              style={{ cursor: "pointer" }}
            >
              {labelEl}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
