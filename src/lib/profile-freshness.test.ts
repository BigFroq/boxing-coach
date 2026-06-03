import { describe, it, expect } from "vitest";
import {
  getMissingQuestionIds,
  getMissingDimensions,
  compareTopFighters,
} from "./profile-freshness";
import { allQuestions, getQuestionSequence } from "@/data/questions";

describe("profile-freshness", () => {
  describe("getMissingQuestionIds", () => {
    it("returns IDs in current set but not in answers", () => {
      const result = getMissingQuestionIds(
        { stance: "orthodox", height: "tall" },
        ["stance", "height", "build", "reach"]
      );
      expect(result.sort()).toEqual(["build", "reach"]);
    });

    it("ignores stored answers for IDs no longer present", () => {
      // 'deprecated_q' was removed from the question set
      const result = getMissingQuestionIds(
        { stance: "orthodox", deprecated_q: "x" },
        ["stance", "build"]
      );
      expect(result).toEqual(["build"]);
    });

    it("returns empty when all current IDs are answered", () => {
      const result = getMissingQuestionIds(
        { a: "x", b: "y" },
        ["a", "b"]
      );
      expect(result).toEqual([]);
    });

    // Regression: the refinement CTA compared answers against ALL questions, so
    // a beginner who completed their whole (filtered) quiz still showed the
    // advancedOnly question as "missing" — a phantom "new question" prompt.
    it("a beginner who answered their whole sequence has zero missing", () => {
      const seq = getQuestionSequence("beginner");
      const answers = Object.fromEntries(seq.map((q) => [q.id, "x"]));
      expect(getMissingQuestionIds(answers, seq.map((q) => q.id))).toEqual([]);
    });

    it("comparing a beginner's answers against ALL questions surfaces exactly the advancedOnly gaps (the old bug)", () => {
      const advancedOnly = allQuestions.filter((q) => q.advancedOnly).map((q) => q.id);
      expect(advancedOnly.length).toBeGreaterThan(0);
      const answers = Object.fromEntries(
        getQuestionSequence("beginner").map((q) => [q.id, "x"])
      );
      expect(
        getMissingQuestionIds(answers, allQuestions.map((q) => q.id)).sort()
      ).toEqual(advancedOnly.sort());
    });
  });

  describe("getMissingDimensions", () => {
    it("returns dimension keys not present in scores", () => {
      const result = getMissingDimensions({
        powerMechanics: 50,
        positionalReadiness: 60,
      });
      expect(result).toContain("rangeControl");
      expect(result).not.toContain("powerMechanics");
    });

    it("returns empty when all 8 dimensions are present", () => {
      const result = getMissingDimensions({
        powerMechanics: 50,
        positionalReadiness: 60,
        rangeControl: 70,
        defensiveIntegration: 55,
        ringIQ: 65,
        outputPressure: 50,
        deceptionSetup: 60,
        killerInstinct: 70,
      });
      expect(result).toEqual([]);
    });
  });

  describe("compareTopFighters", () => {
    it("returns changed=false when slugs and order match", () => {
      const stored = [{ slug: "mike-tyson" }, { slug: "alex-pereira" }];
      const fresh = [{ slug: "mike-tyson" }, { slug: "alex-pereira" }];
      expect(compareTopFighters(stored, fresh).changed).toBe(false);
    });

    it("returns changed=true when slugs differ", () => {
      const stored = [{ slug: "mike-tyson" }, { slug: "alex-pereira" }];
      const fresh = [{ slug: "mike-tyson" }, { slug: "lomachenko" }];
      expect(compareTopFighters(stored, fresh).changed).toBe(true);
    });

    it("returns changed=true when order differs", () => {
      const stored = [{ slug: "mike-tyson" }, { slug: "alex-pereira" }];
      const fresh = [{ slug: "alex-pereira" }, { slug: "mike-tyson" }];
      expect(compareTopFighters(stored, fresh).changed).toBe(true);
    });

    it("returns changed=true when lengths differ", () => {
      const stored = [{ slug: "mike-tyson" }];
      const fresh = [{ slug: "mike-tyson" }, { slug: "alex-pereira" }];
      expect(compareTopFighters(stored, fresh).changed).toBe(true);
    });
  });
});
