import { type DimensionScores, DIMENSION_LABELS } from "@/data/fighter-profiles";

export function getTopDimensions(scores: DimensionScores, n: number): { key: keyof DimensionScores; label: string; score: number }[] {
  return (Object.entries(scores) as [keyof DimensionScores, number][])
    .sort(([, a], [, b]) => b - a)
    .slice(0, n)
    .map(([key, score]) => ({ key, label: DIMENSION_LABELS[key], score }));
}

export function getBottomDimensions(scores: DimensionScores, n: number): { key: keyof DimensionScores; label: string; score: number }[] {
  return (Object.entries(scores) as [keyof DimensionScores, number][])
    .sort(([, a], [, b]) => a - b)
    .slice(0, n)
    .map(([key, score]) => ({ key, label: DIMENSION_LABELS[key], score }));
}
