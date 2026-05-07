import { describe, it, expect } from "vitest";
import { rowToClipLog } from "./clip-log-storage";

describe("rowToClipLog", () => {
  it("maps a fully-populated DB row to a ClipLog", () => {
    const row = {
      id: "abc",
      user_id: "u1",
      created_at: "2026-05-07T10:00:00Z",
      filename: "jab.mp4",
      duration_seconds: 12.5,
      summary: "good jab",
      phases: [{ phase: "Loading", feedback: "ok", score: 7 }],
      strengths: ["s1"],
      improvements: ["i1"],
      score_loading: 7,
      score_hip_explosion: 6,
      score_energy_transfer: 8,
      score_follow_through: 5,
      score_overall: 6.5,
      thumbnail_b64: "abc==",
      model_version: "sonnet-4-6",
      prompt_version: "v1",
    };
    const c = rowToClipLog(row);
    expect(c.id).toBe("abc");
    expect(c.userId).toBe("u1");
    expect(c.createdAt).toBe("2026-05-07T10:00:00Z");
    expect(c.filename).toBe("jab.mp4");
    expect(c.durationSeconds).toBe(12.5);
    expect(c.analysis.summary).toBe("good jab");
    expect(c.analysis.phases).toEqual([{ phase: "Loading", feedback: "ok", score: 7 }]);
    expect(c.analysis.strengths).toEqual(["s1"]);
    expect(c.analysis.improvements).toEqual(["i1"]);
    expect(c.scores).toEqual({
      loading: 7,
      hipExplosion: 6,
      energyTransfer: 8,
      followThrough: 5,
      overall: 6.5,
    });
    expect(c.thumbnailB64).toBe("abc==");
    expect(c.modelVersion).toBe("sonnet-4-6");
    expect(c.promptVersion).toBe("v1");
  });

  it("handles null/missing optional columns", () => {
    const row = {
      id: "abc",
      user_id: "u1",
      created_at: "2026-05-07T10:00:00Z",
      filename: null,
      duration_seconds: null,
      summary: "x",
      phases: [],
      strengths: [],
      improvements: [],
      score_loading: null,
      score_hip_explosion: null,
      score_energy_transfer: null,
      score_follow_through: null,
      score_overall: null,
      thumbnail_b64: null,
      model_version: "sonnet-4-6",
      prompt_version: "v1",
    };
    const c = rowToClipLog(row);
    expect(c.filename).toBeNull();
    expect(c.durationSeconds).toBeNull();
    expect(c.scores.loading).toBeNull();
    expect(c.scores.overall).toBeNull();
    expect(c.thumbnailB64).toBeNull();
  });
});
