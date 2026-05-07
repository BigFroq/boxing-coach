import { describe, it, expect } from "vitest";
import { rowToScore, rowToClip } from "./games-storage";

describe("rowToScore", () => {
  it("maps a DB row to a GameScore", () => {
    const row = {
      id: "s1",
      user_id: "u1",
      game_type: "reaction_tap",
      score_value: 245,
      score_unit: "ms",
      played_at: "2026-05-07T10:00:00Z",
    };
    expect(rowToScore(row)).toEqual({
      id: "s1",
      userId: "u1",
      gameType: "reaction_tap",
      scoreValue: 245,
      scoreUnit: "ms",
      playedAt: "2026-05-07T10:00:00Z",
    });
  });
});

describe("rowToClip", () => {
  it("maps a DB row to a PunchClip", () => {
    const row = {
      id: "c1",
      source_filename: "fight-1.jpg",
      image_b64: "abc==",
      punch_label: "jab",
      difficulty: "medium",
      llm_confidence: 0.92,
      llm_notes: "clear front-foot loading",
    };
    expect(rowToClip(row)).toEqual({
      id: "c1",
      sourceFilename: "fight-1.jpg",
      imageB64: "abc==",
      punchLabel: "jab",
      difficulty: "medium",
      llmConfidence: 0.92,
      llmNotes: "clear front-foot loading",
    });
  });

  it("handles null optional columns", () => {
    const row = {
      id: "c2",
      source_filename: "f2.jpg",
      image_b64: "x",
      punch_label: "hook",
      difficulty: "hard",
      llm_confidence: null,
      llm_notes: null,
    };
    const c = rowToClip(row);
    expect(c.llmConfidence).toBeNull();
    expect(c.llmNotes).toBeNull();
  });
});
