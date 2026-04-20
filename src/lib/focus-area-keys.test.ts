import { describe, it, expect } from "vitest";
import { deriveFocusAreaKeys } from "./focus-area-keys";

describe("deriveFocusAreaKeys", () => {
  it("returns empty array for empty input", () => {
    expect(deriveFocusAreaKeys([])).toEqual([]);
  });

  it("returns empty array when input is undefined", () => {
    expect(deriveFocusAreaKeys(undefined)).toEqual([]);
  });

  it("maps a valid dimension + slug into a canonical key", () => {
    const keys = deriveFocusAreaKeys([
      { dimension: "powerMechanics", knowledge_node_slug: "hip-rotation" },
    ]);
    expect(keys).toEqual(["powerMechanics::hip-rotation"]);
  });

  it("uses empty-string slug when knowledge_node_slug is null", () => {
    const keys = deriveFocusAreaKeys([
      { dimension: "defensiveIntegration", knowledge_node_slug: null },
    ]);
    expect(keys).toEqual(["defensiveIntegration::"]);
  });

  it("uses empty-string slug when knowledge_node_slug is missing", () => {
    const keys = deriveFocusAreaKeys([
      { dimension: "ringIQ" },
    ]);
    expect(keys).toEqual(["ringIQ::"]);
  });

  it("coerces an unknown slug to empty string so it matches the (dim, null) bucket", () => {
    const keys = deriveFocusAreaKeys([
      { dimension: "outputPressure", knowledge_node_slug: "not-a-real-slug" },
    ]);
    expect(keys).toEqual(["outputPressure::"]);
  });

  it("accepts a human label and maps it to the canonical dimension key", () => {
    // DIMENSION_LABELS maps 'Power Mechanics' → 'powerMechanics' etc.
    const keys = deriveFocusAreaKeys([
      { dimension: "Power Mechanics", knowledge_node_slug: "jab" },
    ]);
    expect(keys).toEqual(["powerMechanics::jab"]);
  });

  it("drops updates with unrecognised dimensions", () => {
    const keys = deriveFocusAreaKeys([
      { dimension: "nonsense", knowledge_node_slug: "jab" },
      { dimension: "powerMechanics", knowledge_node_slug: "jab" },
    ]);
    expect(keys).toEqual(["powerMechanics::jab"]);
  });

  it("deduplicates identical keys", () => {
    const keys = deriveFocusAreaKeys([
      { dimension: "powerMechanics", knowledge_node_slug: "jab" },
      { dimension: "powerMechanics", knowledge_node_slug: "jab" },
    ]);
    expect(keys).toEqual(["powerMechanics::jab"]);
  });
});
