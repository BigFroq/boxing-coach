import { describe, it, expect } from "vitest";
import { buildDrillProgramPrompt } from "./drill-program-prompt";
import type { DimensionScores } from "@/data/fighter-profiles";

// Fixed, minimal vault — no filesystem dependency for deterministic snapshots.
const FIXTURE_VAULT = [
  { slug: "barbell-punch", content: "# Barbell Punch\n\n## Summary\nShoulder stability drill ...\n" },
  { slug: "hip-rotation-drill", content: "# Hip Rotation Drill\n\n## Summary\nDevelops hip torque ...\n" },
];

describe("buildDrillProgramPrompt", () => {
  it("matches snapshot for a Pressure Puncher style", () => {
    const scores: DimensionScores = {
      powerMechanics: 92, killerInstinct: 90, outputPressure: 85,
      positionalReadiness: 88, defensiveIntegration: 85, rangeControl: 82,
      ringIQ: 80, deceptionSetup: 75,
    };
    const prompt = buildDrillProgramPrompt({
      dimensionScores: scores,
      matchedFighters: [
        { name: "Mike Tyson", slug: "mike-tyson", overlappingDimensions: ["Power Mechanics", "Killer Instinct"], source: "alex" },
        { name: "Gervonta Davis", slug: "gervonta-davis", overlappingDimensions: ["Power Mechanics", "Output Pressure"], source: "alex" },
        { name: "Alex Pereira", slug: "alex-pereira", overlappingDimensions: ["Power Mechanics"], source: "public" },
      ],
      physicalContext: { height: "5'10\"", build: "athletic", reach: "70\"", stance: "orthodox" },
      experienceLevel: "intermediate",
      vaultDrills: FIXTURE_VAULT,
    });
    expect(prompt).toMatchSnapshot();
  });

  it("matches snapshot for a Defensive Sniper style with beginner language", () => {
    const scores: DimensionScores = {
      defensiveIntegration: 88, rangeControl: 92, ringIQ: 92,
      positionalReadiness: 95, deceptionSetup: 85, powerMechanics: 78,
      outputPressure: 82, killerInstinct: 78,
    };
    const prompt = buildDrillProgramPrompt({
      dimensionScores: scores,
      matchedFighters: [
        { name: "Terence Crawford", slug: "terence-crawford", overlappingDimensions: ["Range Control", "Ring IQ"], source: "alex" },
        { name: "Floyd Mayweather Jr.", slug: "floyd-mayweather-jr", overlappingDimensions: ["Defensive Integration", "Ring IQ"], source: "alex" },
        { name: "Dmitry Bivol", slug: "dmitry-bivol", overlappingDimensions: ["Defensive Integration"], source: "alex" },
      ],
      physicalContext: { height: "5'8\"", build: "lean", reach: "68\"", stance: "orthodox" },
      experienceLevel: "beginner",
      vaultDrills: FIXTURE_VAULT,
    });
    expect(prompt).toMatchSnapshot();
  });
});
