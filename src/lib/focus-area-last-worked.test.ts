import { describe, it, expect } from "vitest";
import { computeLastWorkedMap } from "./focus-area-last-worked";

describe("computeLastWorkedMap", () => {
  it("returns an empty map when no focus areas", () => {
    expect(computeLastWorkedMap([], [])).toEqual({});
  });

  it("returns null for a focus area that was never worked", () => {
    const focusAreas = [
      { id: "fa1", dimension: "powerMechanics", knowledge_node_slug: "hip-rotation" },
    ];
    const sessions = [
      { created_at: "2026-04-20T12:00:00Z", summary: { focus_areas_worked_keys: ["ringIQ::"] } },
    ];
    expect(computeLastWorkedMap(focusAreas, sessions)).toEqual({ fa1: null });
  });

  it("returns the session timestamp when the focus area was worked once", () => {
    const focusAreas = [
      { id: "fa1", dimension: "powerMechanics", knowledge_node_slug: "hip-rotation" },
    ];
    const sessions = [
      { created_at: "2026-04-20T12:00:00Z", summary: { focus_areas_worked_keys: ["powerMechanics::hip-rotation"] } },
    ];
    expect(computeLastWorkedMap(focusAreas, sessions)).toEqual({ fa1: "2026-04-20T12:00:00Z" });
  });

  it("picks the most recent session when the area was worked multiple times", () => {
    const focusAreas = [
      { id: "fa1", dimension: "powerMechanics", knowledge_node_slug: "hip-rotation" },
    ];
    const sessions = [
      { created_at: "2026-04-20T12:00:00Z", summary: { focus_areas_worked_keys: ["powerMechanics::hip-rotation"] } },
      { created_at: "2026-04-18T12:00:00Z", summary: { focus_areas_worked_keys: ["powerMechanics::hip-rotation"] } },
      { created_at: "2026-04-15T12:00:00Z", summary: { focus_areas_worked_keys: ["powerMechanics::hip-rotation"] } },
    ];
    expect(computeLastWorkedMap(focusAreas, sessions)).toEqual({ fa1: "2026-04-20T12:00:00Z" });
  });

  it("skips legacy sessions that have no focus_areas_worked_keys", () => {
    const focusAreas = [
      { id: "fa1", dimension: "powerMechanics", knowledge_node_slug: "hip-rotation" },
    ];
    const sessions = [
      { created_at: "2026-04-20T12:00:00Z", summary: { breakthroughs: ["yo"] } },
      { created_at: "2026-04-15T12:00:00Z", summary: null },
      { created_at: "2026-04-10T12:00:00Z", summary: { focus_areas_worked_keys: ["powerMechanics::hip-rotation"] } },
    ];
    expect(computeLastWorkedMap(focusAreas, sessions)).toEqual({ fa1: "2026-04-10T12:00:00Z" });
  });

  it("returns null for legacy focus areas where dimension is null", () => {
    const focusAreas = [
      { id: "fa1", dimension: null, knowledge_node_slug: null },
    ];
    const sessions = [
      { created_at: "2026-04-20T12:00:00Z", summary: { focus_areas_worked_keys: ["::"] } },
    ];
    expect(computeLastWorkedMap(focusAreas, sessions)).toEqual({ fa1: null });
  });

  it("handles multiple focus areas and mixes them correctly", () => {
    const focusAreas = [
      { id: "fa1", dimension: "powerMechanics", knowledge_node_slug: "hip-rotation" },
      { id: "fa2", dimension: "defensiveIntegration", knowledge_node_slug: null },
      { id: "fa3", dimension: "ringIQ", knowledge_node_slug: "frame" },
    ];
    const sessions = [
      { created_at: "2026-04-20T12:00:00Z", summary: { focus_areas_worked_keys: ["powerMechanics::hip-rotation"] } },
      { created_at: "2026-04-15T12:00:00Z", summary: { focus_areas_worked_keys: ["defensiveIntegration::"] } },
    ];
    expect(computeLastWorkedMap(focusAreas, sessions)).toEqual({
      fa1: "2026-04-20T12:00:00Z",
      fa2: "2026-04-15T12:00:00Z",
      fa3: null,
    });
  });
});
