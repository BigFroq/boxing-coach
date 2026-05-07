import { describe, it, expect } from "vitest";
import {
  aggregateClipHistory,
  computeRollingAvgTrend,
} from "./clip-log-aggregation";
import type { ClipLog, ClipScores } from "./clip-log-types";

const today = new Date("2026-05-07T10:00:00Z");

function makeClip(daysAgo: number, scores: Partial<ClipScores>, summary = "test"): ClipLog {
  const created = new Date(today);
  created.setUTCDate(created.getUTCDate() - daysAgo);
  return {
    id: `clip-${daysAgo}`,
    userId: "u1",
    createdAt: created.toISOString(),
    filename: null,
    durationSeconds: null,
    analysis: { summary, phases: [], strengths: [], improvements: [] },
    scores: {
      loading: scores.loading ?? null,
      hipExplosion: scores.hipExplosion ?? null,
      energyTransfer: scores.energyTransfer ?? null,
      followThrough: scores.followThrough ?? null,
      overall: scores.overall ?? null,
    },
    thumbnailB64: null,
    modelVersion: "sonnet-4-6",
    promptVersion: "v1",
  };
}

describe("aggregateClipHistory", () => {
  it("returns empty context when no clips", () => {
    const ctx = aggregateClipHistory([], today);
    expect(ctx).toEqual({ windowDays: 14, totalClips: 0 });
  });

  it("includes mostRecent when there is at least one clip", () => {
    const clips = [makeClip(2, { overall: 7 }, "good jab")];
    const ctx = aggregateClipHistory(clips, today);
    expect(ctx.totalClips).toBe(1);
    expect(ctx.mostRecent).toEqual({ daysAgo: 2, summary: "good jab" });
    expect(ctx.trend).toBeUndefined();
  });

  it("omits trend until there are at least 10 clips (need 5+5 split)", () => {
    const clips = Array.from({ length: 5 }, (_, i) => makeClip(i, { overall: 5 + i }));
    const ctx = aggregateClipHistory(clips, today);
    expect(ctx.totalClips).toBe(5);
    expect(ctx.trend).toBeUndefined();
  });

  it("computes trend from last 5 vs prior 5 when 10+ clips exist", () => {
    const clips: ClipLog[] = [];
    for (let i = 0; i < 5; i++) {
      clips.push(makeClip(i, { loading: 8, hipExplosion: 8, energyTransfer: 8, followThrough: 8, overall: 8 }));
    }
    for (let i = 5; i < 10; i++) {
      clips.push(makeClip(i, { loading: 6, hipExplosion: 6, energyTransfer: 6, followThrough: 6, overall: 6 }));
    }
    const ctx = aggregateClipHistory(clips, today);
    expect(ctx.totalClips).toBe(10);
    expect(ctx.trend?.last5Avg.loading).toBe(8);
    expect(ctx.trend?.prior5Avg.loading).toBe(6);
    expect(ctx.trend?.last5Avg.overall).toBe(8);
    expect(ctx.trend?.prior5Avg.overall).toBe(6);
  });

  it("filters to last 14 days for the window", () => {
    const clips = [
      makeClip(2, { overall: 8 }),
      makeClip(20, { overall: 5 }),
    ];
    const ctx = aggregateClipHistory(clips, today);
    expect(ctx.totalClips).toBe(1);
  });

  it("handles missing scores gracefully (null in averages)", () => {
    const clips: ClipLog[] = [];
    for (let i = 0; i < 10; i++) {
      const overall = i % 2 === 0 ? 7 : null;
      clips.push(makeClip(i, { loading: 5, overall: overall ?? undefined }));
    }
    const ctx = aggregateClipHistory(clips, today);
    expect(ctx.totalClips).toBe(10);
    expect(ctx.trend?.last5Avg.overall).toBe(7);
  });
});

describe("computeRollingAvgTrend", () => {
  it("returns empty array when fewer than 3 clips", () => {
    const clips = [
      makeClip(0, { overall: 7 }),
      makeClip(1, { overall: 8 }),
    ];
    const points = computeRollingAvgTrend(clips, 3);
    expect(points).toEqual([]);
  });

  it("returns one point per 3-clip window with averaged scores", () => {
    const clips = [
      makeClip(0, { loading: 9, overall: 9 }),
      makeClip(1, { loading: 8, overall: 8 }),
      makeClip(2, { loading: 7, overall: 7 }),
      makeClip(3, { loading: 6, overall: 6 }),
    ];
    const points = computeRollingAvgTrend(clips, 3);
    expect(points).toHaveLength(2);
    expect(points[0].loading).toBeCloseTo(8);
    expect(points[1].loading).toBeCloseTo(7);
  });

  it("uses the latest createdAt of the window as the point date", () => {
    const c0 = makeClip(2, { overall: 7 });
    const c1 = makeClip(1, { overall: 7 });
    const c2 = makeClip(0, { overall: 7 });
    const points = computeRollingAvgTrend([c0, c1, c2], 3);
    expect(points[0].createdAt).toBe(c2.createdAt);
  });
});
