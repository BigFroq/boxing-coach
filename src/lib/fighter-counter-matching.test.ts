import { describe, it, expect } from "vitest";
import { matchCounters, ATTACK_VECTORS } from "./fighter-counter-matching";
import type { DimensionScores } from "@/data/fighter-profiles";

// Helper: build a DimensionScores with defaults of 50 unless overridden.
function scores(overrides: Partial<DimensionScores> = {}): DimensionScores {
  return {
    powerMechanics: 50,
    positionalReadiness: 50,
    rangeControl: 50,
    defensiveIntegration: 50,
    ringIQ: 50,
    outputPressure: 50,
    deceptionSetup: 50,
    killerInstinct: 50,
    ...overrides,
  };
}

describe("ATTACK_VECTORS", () => {
  it("defines exactly four attack vectors", () => {
    expect(ATTACK_VECTORS.length).toBe(4);
  });

  it("each vector has attacker_dims and defender_dims non-empty", () => {
    for (const v of ATTACK_VECTORS) {
      expect(v.attackerDims.length).toBeGreaterThan(0);
      expect(v.defenderDims.length).toBeGreaterThan(0);
    }
  });
});

describe("matchCounters", () => {
  it("returns empty array for a balanced user (all 60) — gate fails", () => {
    const result = matchCounters(scores({
      powerMechanics: 60, positionalReadiness: 60, rangeControl: 60, defensiveIntegration: 60,
      ringIQ: 60, outputPressure: 60, deceptionSetup: 60, killerInstinct: 60,
    }));
    expect(result).toEqual([]);
  });

  it("returns power punchers in top counters for a low-defence user", () => {
    // Defence severely weak → high-power fighters should counter
    const result = matchCounters(scores({
      powerMechanics: 40,
      defensiveIntegration: 25,
      positionalReadiness: 35,
    }));
    const slugs = result.map((c) => c.fighter.slug);
    // Alex Pereira (95 power, 88 killer) and Mike Tyson (92 power, 90 killer) are the canonical power punchers
    expect(slugs).toContain("alex-pereira");
  });

  it("respects excludeSlugs — listed fighters never appear", () => {
    const userScores = scores({ defensiveIntegration: 25, positionalReadiness: 35, powerMechanics: 30 });
    const result = matchCounters(userScores, ["alex-pereira", "mike-tyson"]);
    const slugs = result.map((c) => c.fighter.slug);
    expect(slugs).not.toContain("alex-pereira");
    expect(slugs).not.toContain("mike-tyson");
  });

  it("returns at most `count` results (default 3)", () => {
    const userScores = scores({ defensiveIntegration: 25, positionalReadiness: 30 });
    const result = matchCounters(userScores);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it("honours count parameter", () => {
    const userScores = scores({ defensiveIntegration: 25, positionalReadiness: 30 });
    const result = matchCounters(userScores, [], 5);
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it("sorts by threatScore descending", () => {
    const userScores = scores({ defensiveIntegration: 25, positionalReadiness: 30 });
    const result = matchCounters(userScores);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].threatScore).toBeGreaterThanOrEqual(result[i].threatScore);
    }
  });

  it("flags one-shot dominance when fighter dim >= 85 and user dim <= 40", () => {
    // Wilder (88 power, 80 killer) vs low-power user
    const userScores = scores({ powerMechanics: 35, defensiveIntegration: 30 });
    const result = matchCounters(userScores);
    const wilder = result.find((c) => c.fighter.slug === "deontay-wilder");
    if (wilder) {
      expect(wilder.oneShotDominance).toContain("powerMechanics");
    }
  });

  it("does not flag one-shot for users with mid scores", () => {
    const userScores = scores({ powerMechanics: 60, defensiveIntegration: 50 });
    const result = matchCounters(userScores);
    for (const c of result) {
      expect(c.oneShotDominance.length).toBe(0);
    }
  });

  it("each result's exploitedDimensions has at most 3 entries sorted by gap desc", () => {
    const userScores = scores({ defensiveIntegration: 25, positionalReadiness: 30, powerMechanics: 35 });
    const result = matchCounters(userScores);
    for (const c of result) {
      expect(c.exploitedDimensions.length).toBeLessThanOrEqual(3);
      for (let i = 1; i < c.exploitedDimensions.length; i++) {
        expect(c.exploitedDimensions[i - 1].gap).toBeGreaterThanOrEqual(c.exploitedDimensions[i].gap);
      }
    }
  });

  it("primaryAttackVector is one of the four canonical ids", () => {
    const userScores = scores({ defensiveIntegration: 25, positionalReadiness: 30 });
    const result = matchCounters(userScores);
    const valid = ["power", "pressure", "technical", "defensive-sniper"];
    for (const c of result) {
      expect(valid).toContain(c.primaryAttackVector);
    }
  });

  it("is deterministic — same inputs produce same outputs", () => {
    const userScores = scores({ defensiveIntegration: 25, positionalReadiness: 30, powerMechanics: 35 });
    const a = matchCounters(userScores);
    const b = matchCounters(userScores);
    expect(a).toEqual(b);
  });
});
