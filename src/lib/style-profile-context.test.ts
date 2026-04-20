import { describe, it, expect } from "vitest";
import { formatStyleProfileBlock } from "./style-profile-context";

describe("formatStyleProfileBlock", () => {
  it("returns empty string when profile is null", () => {
    expect(formatStyleProfileBlock(null)).toBe("");
  });

  it("returns empty string when profile has no dimension_scores", () => {
    expect(formatStyleProfileBlock({ style_name: "Puncher" })).toBe("");
  });

  it("formats all 8 dimensions with human labels and scores", () => {
    const block = formatStyleProfileBlock({
      style_name: "Counter-Puncher",
      dimension_scores: {
        powerMechanics: 72,
        positionalReadiness: 85,
        rangeControl: 80,
        defensiveIntegration: 90,
        ringIQ: 88,
        outputPressure: 55,
        deceptionSetup: 78,
        killerInstinct: 60,
      },
      matched_fighters: [
        { name: "Floyd Mayweather Jr.", overlappingDimensions: ["positionalReadiness", "defensiveIntegration"] },
      ],
    });

    expect(block).toContain("## Style Profile");
    expect(block).toContain("Style: Counter-Puncher");
    expect(block).toContain("Power Mechanics: 72");
    expect(block).toContain("Positional Readiness: 85");
    expect(block).toContain("Range Control: 80");
    expect(block).toContain("Defensive Integration: 90");
    expect(block).toContain("Ring IQ: 88");
    expect(block).toContain("Output / Pressure: 55");
    expect(block).toContain("Deception / Setup: 78");
    expect(block).toContain("Killer Instinct: 60");
    expect(block).toContain("Top matched fighter: Floyd Mayweather Jr.");
    expect(block).toContain("positionalReadiness, defensiveIntegration");
  });

  it("omits the matched-fighter line when matched_fighters is empty", () => {
    const block = formatStyleProfileBlock({
      dimension_scores: {
        powerMechanics: 50, positionalReadiness: 50, rangeControl: 50, defensiveIntegration: 50,
        ringIQ: 50, outputPressure: 50, deceptionSetup: 50, killerInstinct: 50,
      },
      matched_fighters: [],
    });
    expect(block).not.toContain("Top matched fighter");
  });

  it("omits the style name line when style_name missing", () => {
    const block = formatStyleProfileBlock({
      dimension_scores: {
        powerMechanics: 50, positionalReadiness: 50, rangeControl: 50, defensiveIntegration: 50,
        ringIQ: 50, outputPressure: 50, deceptionSetup: 50, killerInstinct: 50,
      },
    });
    expect(block).not.toContain("Style:");
    expect(block).toContain("## Style Profile");
  });

  it("handles missing overlappingDimensions gracefully", () => {
    const block = formatStyleProfileBlock({
      dimension_scores: {
        powerMechanics: 50, positionalReadiness: 50, rangeControl: 50, defensiveIntegration: 50,
        ringIQ: 50, outputPressure: 50, deceptionSetup: 50, killerInstinct: 50,
      },
      matched_fighters: [{ name: "Mike Tyson" }],
    });
    expect(block).toContain("Top matched fighter: Mike Tyson");
    expect(block).not.toContain("overlapping dimensions:");
  });

  it("uses 0 when a dimension score is missing", () => {
    const block = formatStyleProfileBlock({
      dimension_scores: {
        powerMechanics: 72,
        // others missing
      },
    });
    expect(block).toContain("Power Mechanics: 72");
    expect(block).toContain("Positional Readiness: 0");
  });
});
