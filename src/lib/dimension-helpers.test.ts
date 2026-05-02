import { describe, it, expect } from "vitest";
import { getTopDimensions, getBottomDimensions } from "./dimension-helpers";
import { DIMENSION_LABELS } from "@/data/fighter-profiles";
import type { DimensionScores } from "@/data/fighter-profiles";

// Mike Tyson scores from 004_style_finder.sql
const tyson: DimensionScores = {
  powerMechanics: 92,
  positionalReadiness: 88,
  rangeControl: 82,
  defensiveIntegration: 85,
  ringIQ: 80,
  outputPressure: 85,
  deceptionSetup: 75,
  killerInstinct: 90,
};

describe("getTopDimensions", () => {
  it("returns the highest dimension for n=1", () => {
    const result = getTopDimensions(tyson, 1);
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe("powerMechanics");
    expect(result[0].score).toBe(92);
    expect(result[0].label).toBe(DIMENSION_LABELS["powerMechanics"]);
  });

  it("returns top 3 in descending score order", () => {
    const result = getTopDimensions(tyson, 3);
    expect(result).toHaveLength(3);
    expect(result[0].score).toBeGreaterThanOrEqual(result[1].score);
    expect(result[1].score).toBeGreaterThanOrEqual(result[2].score);
    // Top two are unambiguous
    expect(result[0].key).toBe("powerMechanics"); // 92
    expect(result[1].key).toBe("killerInstinct");  // 90
    // Third slot is one of the three tied at 88/88/85 — just check score
    expect(result[2].score).toBe(88);
  });

  it("returns all 8 dimensions for n=8, still descending", () => {
    const result = getTopDimensions(tyson, 8);
    expect(result).toHaveLength(8);
    for (let i = 0; i < result.length - 1; i++) {
      expect(result[i].score).toBeGreaterThanOrEqual(result[i + 1].score);
    }
  });

  it("maps keys to human labels via DIMENSION_LABELS", () => {
    const result = getTopDimensions(tyson, 8);
    for (const item of result) {
      expect(item.label).toBe(DIMENSION_LABELS[item.key]);
    }
  });
});

describe("getBottomDimensions", () => {
  it("returns the lowest dimension for n=1", () => {
    const result = getBottomDimensions(tyson, 1);
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe("deceptionSetup");
    expect(result[0].score).toBe(75);
    expect(result[0].label).toBe(DIMENSION_LABELS["deceptionSetup"]);
  });

  it("returns bottom 3 in ascending score order", () => {
    const result = getBottomDimensions(tyson, 3);
    expect(result).toHaveLength(3);
    expect(result[0].score).toBeLessThanOrEqual(result[1].score);
    expect(result[1].score).toBeLessThanOrEqual(result[2].score);
    // Bottom two are unambiguous
    expect(result[0].key).toBe("deceptionSetup"); // 75
    expect(result[1].key).toBe("ringIQ");         // 80
    // Third slot is one of the tied 82/85/85/85 group — check score
    expect(result[2].score).toBe(82);
  });

  it("returns all 8 dimensions for n=8, still ascending", () => {
    const result = getBottomDimensions(tyson, 8);
    expect(result).toHaveLength(8);
    for (let i = 0; i < result.length - 1; i++) {
      expect(result[i].score).toBeLessThanOrEqual(result[i + 1].score);
    }
  });

  it("maps keys to human labels via DIMENSION_LABELS", () => {
    const result = getBottomDimensions(tyson, 8);
    for (const item of result) {
      expect(item.label).toBe(DIMENSION_LABELS[item.key]);
    }
  });
});
