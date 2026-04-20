import { describe, it, expect } from "vitest";
import { focusAreaKey, computeNeglected } from "./neglected-focus-areas";

describe("focusAreaKey", () => {
  it("returns null when dimension is null", () => {
    expect(focusAreaKey(null, "hip-rotation")).toBeNull();
  });

  it("uses empty-string slug when slug is null", () => {
    expect(focusAreaKey("powerMechanics", null)).toBe("powerMechanics::");
  });

  it("joins dimension and slug with '::'", () => {
    expect(focusAreaKey("powerMechanics", "hip-rotation")).toBe("powerMechanics::hip-rotation");
  });
});

describe("computeNeglected", () => {
  it("returns empty list when no focus areas", () => {
    expect(computeNeglected([], [])).toEqual([]);
  });

  it("excludes focus areas worked in recent sessions (by canonical key)", () => {
    const focusAreas = [
      { name: "Hip Rotation", dimension: "powerMechanics", knowledge_node_slug: "hip-rotation", status: "active" },
    ];
    const recentSessions = [
      { summary: { focus_areas_worked_keys: ["powerMechanics::hip-rotation"] } },
    ];
    expect(computeNeglected(focusAreas, recentSessions)).toEqual([]);
  });

  it("excludes focus areas with status='improving'", () => {
    const focusAreas = [
      { name: "Foo", dimension: "ringIQ", knowledge_node_slug: null, status: "improving" },
    ];
    expect(computeNeglected(focusAreas, [])).toEqual([]);
  });

  it("excludes focus areas with status='resolved'", () => {
    const focusAreas = [
      { name: "Foo", dimension: "ringIQ", knowledge_node_slug: null, status: "resolved" },
    ];
    expect(computeNeglected(focusAreas, [])).toEqual([]);
  });

  it("includes an 'active' focus area with no matching key in recent sessions", () => {
    const focusAreas = [
      { name: "Head Movement", dimension: "defensiveIntegration", knowledge_node_slug: null, status: "active" },
    ];
    const recentSessions = [
      { summary: { focus_areas_worked_keys: ["powerMechanics::hip-rotation"] } },
    ];
    expect(computeNeglected(focusAreas, recentSessions)).toEqual(["Head Movement"]);
  });

  it("includes a 'new' focus area that hasn't been touched", () => {
    const focusAreas = [
      { name: "Killer Instinct", dimension: "killerInstinct", knowledge_node_slug: null, status: "new" },
    ];
    expect(computeNeglected(focusAreas, [])).toEqual(["Killer Instinct"]);
  });

  it("skips legacy focus areas (dimension=null) — they can't be keyed", () => {
    const focusAreas = [
      { name: "Legacy Thing", dimension: null, knowledge_node_slug: null, status: "active" },
    ];
    expect(computeNeglected(focusAreas, [])).toEqual([]);
  });

  it("treats a session missing focus_areas_worked_keys as contributing nothing", () => {
    const focusAreas = [
      { name: "Power", dimension: "powerMechanics", knowledge_node_slug: null, status: "active" },
    ];
    const recentSessions = [
      { summary: { breakthroughs: ["something"] } }, // no focus_areas_worked_keys
      { summary: undefined },
      {},
    ];
    expect(computeNeglected(focusAreas, recentSessions)).toEqual(["Power"]);
  });

  it("dedups across multiple matching sessions (same key seen twice)", () => {
    const focusAreas = [
      { name: "Power", dimension: "powerMechanics", knowledge_node_slug: null, status: "active" },
    ];
    const recentSessions = [
      { summary: { focus_areas_worked_keys: ["powerMechanics::"] } },
      { summary: { focus_areas_worked_keys: ["powerMechanics::"] } },
    ];
    expect(computeNeglected(focusAreas, recentSessions)).toEqual([]);
  });
});
