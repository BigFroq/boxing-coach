import { describe, it, expect } from "vitest";
import { DIMENSION_KEYS } from "@/lib/dimensions";
import { DIMENSION_EXPLAINERS } from "./dimension-explainers";

describe("DIMENSION_EXPLAINERS", () => {
  it("has an entry for every DimensionKey", () => {
    for (const key of DIMENSION_KEYS) {
      expect(DIMENSION_EXPLAINERS[key], `missing entry for ${key}`).toBeDefined();
    }
  });

  it("each entry has definition, bands, and drills", () => {
    for (const key of DIMENSION_KEYS) {
      const e = DIMENSION_EXPLAINERS[key];
      expect(e.definition.length, `${key} definition empty`).toBeGreaterThan(0);
      expect(Object.keys(e.bands).sort(), `${key} bands incomplete`).toEqual(
        ["below_avg", "average", "strong", "elite", "peak"].sort()
      );
      expect(e.drills.length, `${key} has no drills`).toBeGreaterThan(0);
    }
  });
});
