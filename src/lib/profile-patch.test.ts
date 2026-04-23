import { describe, it, expect } from "vitest";
import { normalizeProfilePatch } from "./profile-patch";

describe("normalizeProfilePatch", () => {
  it("requires userId", () => {
    const res = normalizeProfilePatch({});
    expect(res.ok).toBe(false);
  });

  it("accepts a minimal patch with userId only", () => {
    const res = normalizeProfilePatch({ userId: "u1" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.patch).toEqual({});
    }
  });

  it("trims and collapses empty strings to null for text fields", () => {
    const res = normalizeProfilePatch({
      userId: "u1",
      display_name: "  Alex  ",
      gym: "",
      trainer: "   ",
      notes: "",
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.patch.display_name).toBe("Alex");
      expect(res.patch.gym).toBeNull();
      expect(res.patch.trainer).toBeNull();
      expect(res.patch.notes).toBeNull();
    }
  });

  it("validates email shape (must contain @)", () => {
    const bad = normalizeProfilePatch({ userId: "u1", email: "not-an-email" });
    expect(bad.ok).toBe(false);

    const good = normalizeProfilePatch({ userId: "u1", email: "  alex@example.com  " });
    expect(good.ok).toBe(true);
    if (good.ok) expect(good.patch.email).toBe("alex@example.com");
  });

  it("allows explicit null for email (clearing)", () => {
    const res = normalizeProfilePatch({ userId: "u1", email: null });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.patch.email).toBeNull();
  });

  it("coerces YYYY-MM to YYYY-MM-01 for started_boxing_at", () => {
    const res = normalizeProfilePatch({ userId: "u1", started_boxing_at: "2023-06" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.patch.started_boxing_at).toBe("2023-06-01");
  });

  it("accepts YYYY-MM-DD for started_boxing_at as-is", () => {
    const res = normalizeProfilePatch({ userId: "u1", started_boxing_at: "2023-06-15" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.patch.started_boxing_at).toBe("2023-06-15");
  });

  it("rejects malformed dates", () => {
    expect(normalizeProfilePatch({ userId: "u1", started_boxing_at: "June 2023" }).ok).toBe(false);
    expect(normalizeProfilePatch({ userId: "u1", started_boxing_at: "2023-13-01" }).ok).toBe(false);
  });

  it("rejects rollover dates (Feb 31, Apr 31, etc.)", () => {
    expect(normalizeProfilePatch({ userId: "u1", started_boxing_at: "2023-02-31" }).ok).toBe(false);
    expect(normalizeProfilePatch({ userId: "u1", started_boxing_at: "2023-04-31" }).ok).toBe(false);
    expect(normalizeProfilePatch({ userId: "u1", started_boxing_at: "2023-06-31" }).ok).toBe(false);
  });

  it("enforces max length on display_name (80), gym/trainer (80), goals (500), notes (4000)", () => {
    expect(normalizeProfilePatch({ userId: "u1", display_name: "x".repeat(81) }).ok).toBe(false);
    expect(normalizeProfilePatch({ userId: "u1", gym: "x".repeat(81) }).ok).toBe(false);
    expect(normalizeProfilePatch({ userId: "u1", trainer: "x".repeat(81) }).ok).toBe(false);
    expect(normalizeProfilePatch({ userId: "u1", goals: "x".repeat(501) }).ok).toBe(false);
    expect(normalizeProfilePatch({ userId: "u1", notes: "x".repeat(4001) }).ok).toBe(false);

    expect(normalizeProfilePatch({ userId: "u1", notes: "x".repeat(4000) }).ok).toBe(true);
  });

  it("does not clobber fields that were not sent in the patch", () => {
    const res = normalizeProfilePatch({ userId: "u1", display_name: "Alex" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.patch).not.toHaveProperty("email");
      expect(res.patch).not.toHaveProperty("notes");
      expect(res.patch).not.toHaveProperty("gym");
    }
  });
});
