// Pure aggregation for the compounding clip log. No DB, no Date.now, no
// globals. Two consumers:
//   1) aggregateClipHistory — produces a ClipHistoryContext for the coach
//      chat (system-prompt fragment).
//   2) computeRollingAvgTrend — produces 3-clip rolling-average points for
//      the trend chart, smoothing model-variance noise.

import type { ClipLog, ClipScores, ClipHistoryContext } from "./clip-log-types";

const WINDOW_DAYS = 14;
const TREND_HALF = 5;
const MIN_FOR_TREND = TREND_HALF * 2;

function utcDayIndex(d: Date): number {
  const ms = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.floor(ms / 86_400_000);
}

function avg(values: Array<number | null>): number | null {
  const nums = values.filter((v): v is number => typeof v === "number");
  if (nums.length === 0) return null;
  const sum = nums.reduce((a, b) => a + b, 0);
  return Math.round((sum / nums.length) * 10) / 10;
}

function avgScores(clips: ClipLog[]): ClipScores {
  return {
    loading: avg(clips.map((c) => c.scores.loading)),
    hipExplosion: avg(clips.map((c) => c.scores.hipExplosion)),
    energyTransfer: avg(clips.map((c) => c.scores.energyTransfer)),
    followThrough: avg(clips.map((c) => c.scores.followThrough)),
    overall: avg(clips.map((c) => c.scores.overall)),
  };
}

export function aggregateClipHistory(
  allClips: ClipLog[],
  today: Date
): ClipHistoryContext {
  const todayIdx = utcDayIndex(today);
  const inWindow = allClips
    .filter((c) => todayIdx - utcDayIndex(new Date(c.createdAt)) <= WINDOW_DAYS)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const ctx: ClipHistoryContext = {
    windowDays: WINDOW_DAYS,
    totalClips: inWindow.length,
  };

  if (inWindow.length > 0) {
    const first = inWindow[0];
    const daysAgo = todayIdx - utcDayIndex(new Date(first.createdAt));
    ctx.mostRecent = { daysAgo, summary: first.analysis.summary };
  }

  if (inWindow.length >= MIN_FOR_TREND) {
    ctx.trend = {
      last5Avg: avgScores(inWindow.slice(0, TREND_HALF)),
      prior5Avg: avgScores(inWindow.slice(TREND_HALF, TREND_HALF * 2)),
    };
  }

  return ctx;
}

export interface TrendPoint {
  createdAt: string;
  loading: number | null;
  hipExplosion: number | null;
  energyTransfer: number | null;
  followThrough: number | null;
  overall: number | null;
}

export function computeRollingAvgTrend(
  allClips: ClipLog[],
  windowSize: number
): TrendPoint[] {
  if (allClips.length < windowSize) return [];

  const out: TrendPoint[] = [];
  for (let i = windowSize - 1; i < allClips.length; i++) {
    const window = allClips.slice(i - windowSize + 1, i + 1);
    const a = avgScores(window);
    out.push({
      createdAt: window[window.length - 1].createdAt,
      loading: a.loading,
      hipExplosion: a.hipExplosion,
      energyTransfer: a.energyTransfer,
      followThrough: a.followThrough,
      overall: a.overall,
    });
  }
  return out;
}
