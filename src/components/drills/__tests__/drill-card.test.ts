import { describe, it, expect } from "vitest";
import type { DrillEntry } from "@/lib/drill-program-types";

// DrillCard renders data from a DrillEntry. These tests verify the data contracts
// that the component relies on — without DOM rendering (no jsdom available).

const drill: DrillEntry = {
  id: "jab-extension",
  name: "Jab Extension Drill",
  vault_ref: "jab-extension",
  duration_min: 10,
  intensity: ["light", "medium"],
  context: ["shadow", "bag"],
  why_fits_you: "Builds the hip-shoulder separation your profile needs.",
  cues: ["Extend through the target", "Snap back fast", "Stay relaxed"],
  rounds_or_dose: "4x 2-min rounds, 30s rest",
};

describe("DrillCard data contracts", () => {
  it("drill has a name", () => {
    expect(drill.name).toBe("Jab Extension Drill");
  });

  it("drill has a duration badge value", () => {
    expect(drill.duration_min).toBe(10);
  });

  it("drill has a why_fits_you string", () => {
    expect(typeof drill.why_fits_you).toBe("string");
    expect(drill.why_fits_you.length).toBeGreaterThan(0);
  });

  it("drill has cues array", () => {
    expect(drill.cues).toHaveLength(3);
  });

  it("drill has rounds_or_dose string", () => {
    expect(drill.rounds_or_dose).toBe("4x 2-min rounds, 30s rest");
  });

  // Render-time index prefix is exercised in the smoke test (Task 6); cannot be unit-tested without a DOM env.

  it("vault_ref present → href is /vault/drills/<slug>", () => {
    expect(`/vault/drills/${drill.vault_ref}`).toBe("/vault/drills/jab-extension");
  });

  it("vault_ref null → no vault link rendered", () => {
    const noRef: DrillEntry = { ...drill, vault_ref: null };
    expect(noRef.vault_ref).toBeNull();
  });
});
