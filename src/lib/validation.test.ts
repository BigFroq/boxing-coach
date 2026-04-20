import { describe, it, expect } from "vitest";
import {
  styleProfileSchema,
  chatRequestSchema,
  clipReviewRequestSchema,
} from "./validation";

describe("styleProfileSchema", () => {
  it("accepts a well-formed profile", () => {
    const res = styleProfileSchema.safeParse({
      style_name: "Swarmer",
      description: "aggressive inside fighter",
    });
    expect(res.success).toBe(true);
  });

  it("rejects description over 500 chars", () => {
    const res = styleProfileSchema.safeParse({
      style_name: "X",
      description: "a".repeat(501),
    });
    expect(res.success).toBe(false);
  });

  it("rejects style_name over 100 chars", () => {
    const res = styleProfileSchema.safeParse({ style_name: "a".repeat(101) });
    expect(res.success).toBe(false);
  });

  it("rejects growth_areas advice over 500 chars", () => {
    const res = styleProfileSchema.safeParse({
      growth_areas: [{ dimension: "footwork", advice: "a".repeat(501) }],
    });
    expect(res.success).toBe(false);
  });

  it("allows unknown fields (passthrough)", () => {
    const res = styleProfileSchema.safeParse({
      style_name: "X",
      future_field: "some value",
    });
    expect(res.success).toBe(true);
  });
});

describe("chatRequestSchema", () => {
  it("accepts minimum valid payload", () => {
    const res = chatRequestSchema.safeParse({
      messages: [{ role: "user", content: "hi" }],
    });
    expect(res.success).toBe(true);
  });

  it("rejects empty messages array", () => {
    const res = chatRequestSchema.safeParse({ messages: [] });
    expect(res.success).toBe(false);
  });

  it("rejects invalid role", () => {
    const res = chatRequestSchema.safeParse({
      messages: [{ role: "system", content: "hi" }],
    });
    expect(res.success).toBe(false);
  });
});

describe("clipReviewRequestSchema", () => {
  it("rejects more than 60 frames", () => {
    const res = clipReviewRequestSchema.safeParse({
      frames: Array(61).fill("AAAA"),
      filename: "clip.mp4",
    });
    expect(res.success).toBe(false);
  });

  it("rejects frame over 200_000 chars", () => {
    const res = clipReviewRequestSchema.safeParse({
      frames: ["A".repeat(200_001)],
      filename: "clip.mp4",
    });
    expect(res.success).toBe(false);
  });

  it("accepts a single small frame", () => {
    const res = clipReviewRequestSchema.safeParse({
      frames: ["AAAA"],
      filename: "clip.mp4",
    });
    expect(res.success).toBe(true);
  });
});
