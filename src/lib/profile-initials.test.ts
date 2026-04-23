import { describe, it, expect } from "vitest";
import { initialsFrom } from "./profile-initials";

describe("initialsFrom", () => {
  it("returns empty string for null/undefined/empty", () => {
    expect(initialsFrom(null)).toBe("");
    expect(initialsFrom(undefined)).toBe("");
    expect(initialsFrom("")).toBe("");
    expect(initialsFrom("   ")).toBe("");
  });

  it("returns first letter uppercase for single-word names", () => {
    expect(initialsFrom("alex")).toBe("A");
    expect(initialsFrom("Bob")).toBe("B");
  });

  it("returns first + last initials for multi-word names", () => {
    expect(initialsFrom("Alex Rivera")).toBe("AR");
    expect(initialsFrom("Mary Jane Watson")).toBe("MW");
  });

  it("handles extra whitespace", () => {
    expect(initialsFrom("  Alex   Rivera  ")).toBe("AR");
  });
});
