import { describe, it, expect } from "vitest";
import { matchFighters } from "./fighter-matching";
import type { DimensionScores } from "@/data/fighter-profiles";

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

describe("matchFighters — archetype routing across the expanded roster", () => {
  it("pure pressure-power profile routes to pressure fighters, not slick boxers", () => {
    const user = scores({
      powerMechanics: 90,
      outputPressure: 88,
      killerInstinct: 88,
      defensiveIntegration: 40,
      ringIQ: 50,
      deceptionSetup: 40,
    });
    const top = matchFighters(user, 3).map((m) => m.fighter.slug);
    const pressureCandidates = [
      "artur-beterbiev",
      "gennady-golovkin",
      "buakaw-banchamek",
      "earnie-shavers",
      "mike-tyson",
      "alex-pereira",
      "george-foreman",
      "deontay-wilder",
    ];
    expect(top.some((slug) => pressureCandidates.includes(slug))).toBe(true);

    const slickCandidates = ["pernell-whitaker", "giorgio-petrosyan", "floyd-mayweather-jr"];
    expect(top.some((slug) => slickCandidates.includes(slug))).toBe(false);
  });

  it("slick defensive profile routes to defensive wizards, not power punchers", () => {
    const user = scores({
      defensiveIntegration: 90,
      positionalReadiness: 88,
      ringIQ: 88,
      deceptionSetup: 80,
      powerMechanics: 35,
      killerInstinct: 35,
      outputPressure: 40,
    });
    const top = matchFighters(user, 3).map((m) => m.fighter.slug);
    const slickCandidates = [
      "pernell-whitaker",
      "giorgio-petrosyan",
      "floyd-mayweather-jr",
      "bernard-hopkins",
      "vasiliy-lomachenko",
      "dmitry-bivol",
    ];
    expect(top.some((slug) => slickCandidates.includes(slug))).toBe(true);

    const powerCandidates = ["earnie-shavers", "deontay-wilder", "george-foreman"];
    expect(top.some((slug) => powerCandidates.includes(slug))).toBe(false);
  });

  it("high-deception trickster profile reaches the new deception archetypes", () => {
    const user = scores({
      deceptionSetup: 92,
      positionalReadiness: 85,
      ringIQ: 85,
      rangeControl: 70,
      powerMechanics: 45,
      killerInstinct: 45,
    });
    const top = matchFighters(user, 3).map((m) => m.fighter.slug);
    const trickstersAndCreatives = [
      "saenchai",
      "vasiliy-lomachenko",
      "prince-naseem-hamed",
      "bernard-hopkins",
      "pernell-whitaker",
    ];
    expect(top.some((slug) => trickstersAndCreatives.includes(slug))).toBe(true);
  });

  it("kickboxing-range heavyweight profile can reach Rico Verhoeven", () => {
    const user = scores({
      rangeControl: 88,
      positionalReadiness: 82,
      ringIQ: 80,
      outputPressure: 70,
      powerMechanics: 70,
      defensiveIntegration: 75,
      killerInstinct: 62,
      deceptionSetup: 60,
    });
    const top = matchFighters(user, 5).map((m) => m.fighter.slug);
    expect(top).toContain("rico-verhoeven");
  });
});

describe("matchFighters — always returns N results with 8 overlapping-dimensions vectors", () => {
  it("returns exactly 3 by default", () => {
    const top = matchFighters(scores({ powerMechanics: 80 }));
    expect(top).toHaveLength(3);
  });

  it("respects requested count", () => {
    const top = matchFighters(scores({ powerMechanics: 80 }), 5);
    expect(top).toHaveLength(5);
  });

  it("overlapping dimensions only contain dims where both sides are >= 70", () => {
    const user = scores({ powerMechanics: 95, killerInstinct: 90 });
    const [top] = matchFighters(user, 1);
    for (const dim of top.overlappingDimensions) {
      expect(user[dim]).toBeGreaterThanOrEqual(70);
      expect(top.fighter.scores[dim]).toBeGreaterThanOrEqual(70);
    }
  });
});
