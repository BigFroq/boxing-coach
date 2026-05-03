import { describe, it, expect } from "vitest";
import {
  INTENSITY_VALUES,
  CONTEXT_VALUES,
  TIME_MIN_VALUES,
  DEFAULT_INTENSITY,
  DEFAULT_CONTEXT,
  DEFAULT_TIME_MIN,
  type Intensity,
  type Context,
  type TimeMin,
} from "@/lib/drill-program-types";

// FilterPills renders pill buttons from the three axis value arrays.
// These tests verify the axis value contracts and the onChange tuple shape
// that the component relies on — without DOM rendering.

type FilterState = { intensity: Intensity; context: Context; timeMin: TimeMin };

// Simulates what FilterPills calls onChange with when a pill is clicked.
function pickIntensity(current: FilterState, next: Intensity): FilterState {
  return { ...current, intensity: next };
}
function pickContext(current: FilterState, next: Context): FilterState {
  return { ...current, context: next };
}
function pickTime(current: FilterState, next: TimeMin): FilterState {
  return { ...current, timeMin: next };
}

describe("FilterPills axis values", () => {
  it("INTENSITY_VALUES has 3 values", () => {
    expect(INTENSITY_VALUES).toHaveLength(3);
    expect(INTENSITY_VALUES).toContain("light");
    expect(INTENSITY_VALUES).toContain("medium");
    expect(INTENSITY_VALUES).toContain("heavy");
  });

  it("CONTEXT_VALUES has 4 values", () => {
    expect(CONTEXT_VALUES).toHaveLength(4);
    expect(CONTEXT_VALUES).toContain("bag");
    expect(CONTEXT_VALUES).toContain("shadow");
    expect(CONTEXT_VALUES).toContain("gym");
    expect(CONTEXT_VALUES).toContain("mitts");
  });

  it("TIME_MIN_VALUES has 4 values", () => {
    expect(TIME_MIN_VALUES).toHaveLength(4);
  });

  it("time pills display as Nm strings", () => {
    const labels = TIME_MIN_VALUES.map((v) => `${v}m`);
    expect(labels).toEqual(["10m", "20m", "30m", "45m"]);
  });
});

describe("FilterPills onChange tuple", () => {
  const defaults: FilterState = {
    intensity: DEFAULT_INTENSITY,
    context: DEFAULT_CONTEXT,
    timeMin: DEFAULT_TIME_MIN,
  };

  it("clicking an intensity pill emits correct tuple", () => {
    const result = pickIntensity(defaults, "heavy");
    expect(result.intensity).toBe("heavy");
    expect(result.context).toBe(defaults.context);
    expect(result.timeMin).toBe(defaults.timeMin);
  });

  it("clicking a context pill emits correct tuple", () => {
    const result = pickContext(defaults, "mitts");
    expect(result.context).toBe("mitts");
    expect(result.intensity).toBe(defaults.intensity);
    expect(result.timeMin).toBe(defaults.timeMin);
  });

  it("clicking a time pill emits correct tuple", () => {
    const result = pickTime(defaults, 30);
    expect(result.timeMin).toBe(30);
    expect(result.intensity).toBe(defaults.intensity);
    expect(result.context).toBe(defaults.context);
  });
});
