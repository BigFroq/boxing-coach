import { describe, it, expect } from "vitest";
import { mergeAnswersForRefinement } from "./style-profile-storage";

describe("mergeAnswersForRefinement", () => {
  it("merges new answers on top of existing ones", () => {
    const result = mergeAnswersForRefinement(
      { stance: "orthodox", height: "tall" },
      { build: "lean", reach: "long" }
    );
    expect(result).toEqual({
      stance: "orthodox",
      height: "tall",
      build: "lean",
      reach: "long",
    });
  });

  it("new answers overwrite existing ones for same key", () => {
    const result = mergeAnswersForRefinement(
      { stance: "orthodox" },
      { stance: "southpaw" }
    );
    expect(result).toEqual({ stance: "southpaw" });
  });

  it("does not mutate the inputs", () => {
    const prev = { stance: "orthodox" };
    const newOnes = { build: "lean" };
    mergeAnswersForRefinement(prev, newOnes);
    expect(prev).toEqual({ stance: "orthodox" });
    expect(newOnes).toEqual({ build: "lean" });
  });
});
