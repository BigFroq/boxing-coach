import { describe, it, expect } from "vitest";
import { matchReportedDrill, normalizeDrillName } from "./drill-matching";

type Prescription = { id: string; drill_name: string };

const pending: Prescription[] = [
  { id: "p1", drill_name: "Hip rotation drill" },
  { id: "p2", drill_name: "Barbell punch" },
  { id: "p3", drill_name: "Lateral foot push drill" },
];

describe("normalizeDrillName", () => {
  it("lowercases, strips punctuation, collapses whitespace", () => {
    expect(normalizeDrillName("  Hip-Rotation Drill!  ")).toBe("hip rotation drill");
  });

  it("strips filler words (drill, exercise)", () => {
    expect(normalizeDrillName("Hip rotation drill")).toBe("hip rotation drill");
    expect(normalizeDrillName("Hip rotation")).toBe("hip rotation");
  });
});

describe("matchReportedDrill", () => {
  it("exact match", () => {
    const m = matchReportedDrill("Hip rotation drill", pending);
    expect(m?.id).toBe("p1");
  });

  it("case-insensitive", () => {
    const m = matchReportedDrill("HIP ROTATION DRILL", pending);
    expect(m?.id).toBe("p1");
  });

  it("matches when 'drill' suffix is omitted", () => {
    const m = matchReportedDrill("hip rotation", pending);
    expect(m?.id).toBe("p1");
  });

  it("matches partial phrases (reported name is substring of prescription name)", () => {
    const m = matchReportedDrill("barbell", pending);
    expect(m?.id).toBe("p2");
  });

  it("matches when prescription name is substring of reported name", () => {
    const m = matchReportedDrill("the lateral foot push drill i was shown", pending);
    expect(m?.id).toBe("p3");
  });

  it("returns null when nothing matches", () => {
    expect(matchReportedDrill("shadowboxing", pending)).toBeNull();
  });

  it("returns null for empty input or empty prescription list", () => {
    expect(matchReportedDrill("", pending)).toBeNull();
    expect(matchReportedDrill("hip rotation", [])).toBeNull();
  });

  it("prefers exact match over substring when both available", () => {
    const p: Prescription[] = [
      { id: "a", drill_name: "Barbell punch" },
      { id: "b", drill_name: "Barbell punch drill variation" },
    ];
    expect(matchReportedDrill("Barbell punch", p)?.id).toBe("a");
  });
});
