import { describe, it, expect } from "vitest";
import { computeDimensionScores, THEORETICAL_MAXIMA } from "./dimension-scoring";

function baselineAnswers() {
  return {
    height: "average",
    build: "average",
    reach: "average",
    stance: "orthodox",
    experience: "intermediate",
    goal: "compete",
    power_feel: "drive",
    power_speed: 50,
    default_state: "moving",
    initiative: "adaptive",
    preferred_punches: ["jab", "straight"],
    preferred_range: "mid",
    closing_distance: "time",
    footwork: "angles",
    punch_output: "moderate",
    jab_role: "setup",
    ring_position: "center",
    defensive_instinct: "parry",
    clinch: "weapon",
    defensive_system: "mixed",
    read_opponent: "patient",
    losing_rounds: "adjust",
    setup_method: "combos",
    rhythm: "broken",
    opponent_hurt: "surgical",
    you_hurt: "clinch",
    championship_rounds: "smart",
    combo_style: "medium",
    body_targeting: "levels",
    pacing: "consistent",
  };
}

describe("THEORETICAL_MAXIMA", () => {
  it("snapshot of computed per-dimension ceilings (drift guard)", () => {
    // If scoring-map.ts changes, these numbers SHOULD change. Update
    // deliberately — do not rubber-stamp. The reference fighter profiles
    // assume the overall scale these maxima produce.
    expect(THEORETICAL_MAXIMA).toMatchInlineSnapshot(`
      {
        "deceptionSetup": 118,
        "defensiveIntegration": 128,
        "killerInstinct": 140,
        "outputPressure": 220,
        "positionalReadiness": 88,
        "powerMechanics": 124,
        "rangeControl": 128,
        "ringIQ": 180,
      }
    `);
  });
});

describe("computeDimensionScores — ringIQ regression (bug: was capping at 100)", () => {
  it("a ring-IQ-optimizing profile scores high but not 100", () => {
    const answers = {
      ...baselineAnswers(),
      initiative: "adaptive",
      preferred_punches: ["body_shots", "jab"],
      preferred_range: "anywhere",
      closing_distance: "time",
      footwork: "angles",
      punch_output: "moderate",
      ring_position: "center",
      defensive_instinct: "parry",
      clinch: "weapon",
      defensive_system: "mixed",
      read_opponent: "immediate",
      losing_rounds: "adjust",
      setup_method: "timing",
      rhythm: "mirror",
      opponent_hurt: "test",
      you_hurt: "clinch",
      championship_rounds: "smart",
      combo_style: "single",
      body_targeting: "body_first",
      pacing: "build",
      weakness: "power",
    };
    const out = computeDimensionScores(answers);
    expect(out.ringIQ).toBeGreaterThanOrEqual(60);
    expect(out.ringIQ).toBeLessThanOrEqual(90);
    expect(out.ringIQ).toBeLessThan(100);
  });
});

describe("computeDimensionScores — archetype differentiation", () => {
  it("pressure fighter: outputPressure dominates, ringIQ clearly lower", () => {
    const answers = {
      ...baselineAnswers(),
      power_feel: "drive",
      power_speed: 100,
      default_state: "loaded",
      initiative: "lead",
      preferred_punches: ["body_shots", "lead_hook"],
      preferred_range: "inside",
      closing_distance: "embrace",
      footwork: "planted",
      punch_output: "high",
      jab_role: "rarely",
      ring_position: "cutting",
      defensive_instinct: "block",
      clinch: "weapon",
      defensive_system: "high_guard",
      read_opponent: "focused_internal",
      losing_rounds: "commit",
      setup_method: "pressure",
      rhythm: "steady",
      opponent_hurt: "swarm",
      you_hurt: "fire_back",
      championship_rounds: "pace",
      combo_style: "long",
      body_targeting: "body_first",
      pacing: "fast_start",
      weakness: "ring_iq",
    };
    const out = computeDimensionScores(answers);
    expect(out.outputPressure).toBeGreaterThanOrEqual(60);
    expect(out.outputPressure).toBeLessThanOrEqual(100);
    expect(out.outputPressure).toBeGreaterThan(out.ringIQ);
    expect(out.outputPressure).toBeGreaterThan(out.rangeControl);
  });

  it("counter-puncher: range + defense dominate pressure + killer instinct", () => {
    const answers = {
      ...baselineAnswers(),
      power_feel: "timing",
      power_speed: 70,
      default_state: "moving",
      initiative: "counter",
      preferred_punches: ["jab", "straight"],
      preferred_range: "long",
      closing_distance: "time",
      footwork: "angles",
      punch_output: "selective",
      jab_role: "weapon",
      ring_position: "circling",
      defensive_instinct: "pull",
      clinch: "avoid",
      defensive_system: "shoulder_roll",
      read_opponent: "patient",
      losing_rounds: "adjust",
      setup_method: "timing",
      rhythm: "broken",
      opponent_hurt: "surgical",
      you_hurt: "shell",
      championship_rounds: "smart",
      combo_style: "single",
      body_targeting: "levels",
      pacing: "build",
      weakness: "power",
    };
    const out = computeDimensionScores(answers);
    expect(out.rangeControl).toBeGreaterThan(out.outputPressure);
    expect(out.defensiveIntegration).toBeGreaterThan(out.killerInstinct);
    for (const v of Object.values(out)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});

describe("computeDimensionScores — bounds and edges", () => {
  it("empty answers → all zeros", () => {
    const out = computeDimensionScores({});
    for (const v of Object.values(out)) expect(v).toBe(0);
  });

  it("returns all 8 canonical dimensions", () => {
    const out = computeDimensionScores({});
    expect(Object.keys(out).sort()).toEqual([
      "deceptionSetup",
      "defensiveIntegration",
      "killerInstinct",
      "outputPressure",
      "positionalReadiness",
      "powerMechanics",
      "rangeControl",
      "ringIQ",
    ]);
  });

  it("weakness answers reduce the targeted dimension below a no-weakness baseline", () => {
    const withPowerWeakness = computeDimensionScores({
      ...baselineAnswers(),
      weakness: "power",
    });
    const withFinishingWeakness = computeDimensionScores({
      ...baselineAnswers(),
      weakness: "finishing",
    });
    expect(withPowerWeakness.powerMechanics).toBeLessThan(
      withFinishingWeakness.powerMechanics
    );
    expect(withFinishingWeakness.killerInstinct).toBeLessThan(
      withPowerWeakness.killerInstinct
    );
  });
});
