import { describe, it, expect } from "vitest";
import { ProgramEmptyState } from "../program-empty-state";

// Render-time output is exercised in the smoke test (Task 6); cannot be unit-tested without a DOM env.

describe("ProgramEmptyState", () => {
  it("is a function (component export exists)", () => {
    expect(typeof ProgramEmptyState).toBe("function");
  });
});
