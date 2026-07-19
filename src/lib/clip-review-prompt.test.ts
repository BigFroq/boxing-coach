import { describe, it, expect } from "vitest";
import {
  buildAnalysisPrompt,
  truncateInstructions,
  MAX_INSTRUCTION_CHARS,
} from "./clip-review-prompt";

const INSTRUCTIONS = "## Assess in this order\n1. Did the rear hip flick back before the arm moved?";

describe("buildAnalysisPrompt", () => {
  it("includes the coach instruction set for a known punch", () => {
    const prompt = buildAnalysisPrompt({ punchType: "jab", instructions: INSTRUCTIONS });
    expect(prompt).toContain("The punch under review: Jab");
    expect(prompt).toContain('<coach_instructions punch="jab">');
    expect(prompt).toContain("Did the rear hip flick back before the arm moved?");
  });

  it("falls back to the generic prompt when the punch has no instruction file", () => {
    const prompt = buildAnalysisPrompt({ punchType: "rear-hook", instructions: null });
    expect(prompt).not.toContain("coach_instructions");
    expect(prompt).toContain("### Phase 1: Loading");
  });

  it("treats 'general' as an explicit opt-out even if instructions are passed", () => {
    const prompt = buildAnalysisPrompt({ punchType: "general", instructions: INSTRUCTIONS });
    expect(prompt).not.toContain("coach_instructions");
  });

  it("falls back when no punch is declared at all", () => {
    expect(buildAnalysisPrompt()).not.toContain("coach_instructions");
  });

  // The four phase names are load-bearing: clip_logs stores one score column
  // per phase, so a punch-specific prompt must never rename them.
  it("keeps the four-phase JSON contract for every punch", () => {
    for (const punchType of ["jab", "lead-hook", "general", null]) {
      const prompt = buildAnalysisPrompt({ punchType, instructions: INSTRUCTIONS });
      for (const phase of ["Loading", "Hip Explosion", "Energy Transfer", "Follow Through"]) {
        expect(prompt).toContain(`"phase": "${phase}"`);
      }
    }
  });

  it("appends the calibration block last", () => {
    const prompt = buildAnalysisPrompt({
      punchType: "jab",
      instructions: INSTRUCTIONS,
      calibration: "\n\n## Coach calibration\nscored 4/10",
    });
    expect(prompt.endsWith("scored 4/10")).toBe(true);
  });
});

describe("truncateInstructions", () => {
  it("leaves short instruction sets untouched", () => {
    expect(truncateInstructions(INSTRUCTIONS)).toBe(INSTRUCTIONS);
  });

  it("truncates long sets on a line boundary and says so", () => {
    const long = Array.from({ length: 500 }, (_, i) => `line ${i} of the instruction set`).join("\n");
    const result = truncateInstructions(long);
    expect(result.length).toBeLessThan(long.length);
    expect(result).toContain("[Instruction set truncated");
    // cut on a newline, not mid-word
    expect(result.split("\n\n[Instruction set truncated")[0]).toMatch(/instruction set$/);
  });

  it("keeps the truncated body under the cap", () => {
    const long = "x".repeat(MAX_INSTRUCTION_CHARS * 2);
    const body = truncateInstructions(long).split("\n\n[Instruction set truncated")[0];
    expect(body.length).toBeLessThanOrEqual(MAX_INSTRUCTION_CHARS);
  });
});
