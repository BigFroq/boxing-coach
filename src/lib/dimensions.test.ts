import { describe, it, expect } from "vitest";
import {
  DIMENSION_KEYS,
  DIMENSION_LABEL_TO_KEY,
  VAULT_SLUGS,
  dimensionLabelToKey,
  isDimensionKey,
} from "./dimensions";

describe("dimension taxonomy", () => {
  it("has exactly 8 canonical dimension keys", () => {
    expect(DIMENSION_KEYS).toHaveLength(8);
    expect(new Set(DIMENSION_KEYS).size).toBe(8);
  });

  it("DIMENSION_LABEL_TO_KEY covers every key", () => {
    const keysFromMap = new Set(Object.values(DIMENSION_LABEL_TO_KEY));
    for (const key of DIMENSION_KEYS) {
      expect(keysFromMap.has(key)).toBe(true);
    }
  });

  it("dimensionLabelToKey handles canonical labels", () => {
    expect(dimensionLabelToKey("Power Mechanics")).toBe("powerMechanics");
    expect(dimensionLabelToKey("Ring IQ & Adaptation")).toBe("ringIQ");
    expect(dimensionLabelToKey("Defensive Integration")).toBe("defensiveIntegration");
  });

  it("dimensionLabelToKey is case-insensitive and trims whitespace", () => {
    expect(dimensionLabelToKey("  power mechanics  ")).toBe("powerMechanics");
    expect(dimensionLabelToKey("RING IQ & ADAPTATION")).toBe("ringIQ");
  });

  it("dimensionLabelToKey accepts snake/camel aliases", () => {
    expect(dimensionLabelToKey("power_mechanics")).toBe("powerMechanics");
    expect(dimensionLabelToKey("powerMechanics")).toBe("powerMechanics");
    expect(dimensionLabelToKey("ring_iq")).toBe("ringIQ");
  });

  it("dimensionLabelToKey returns null for unknown labels", () => {
    expect(dimensionLabelToKey("foot speed")).toBeNull();
    expect(dimensionLabelToKey("")).toBeNull();
  });

  it("isDimensionKey narrows strings correctly", () => {
    expect(isDimensionKey("powerMechanics")).toBe(true);
    expect(isDimensionKey("nonsense")).toBe(false);
  });

  it("VAULT_SLUGS includes known concept/technique/drill slugs", () => {
    expect(VAULT_SLUGS).toContain("kinetic-chains");
    expect(VAULT_SLUGS).toContain("jab-mechanics");
    expect(VAULT_SLUGS).toContain("barbell-punch");
    expect(VAULT_SLUGS.length).toBeGreaterThan(40);
  });

  it("VAULT_SLUGS has no duplicates", () => {
    expect(new Set(VAULT_SLUGS).size).toBe(VAULT_SLUGS.length);
  });
});
