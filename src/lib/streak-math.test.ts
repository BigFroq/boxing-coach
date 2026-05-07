import { describe, it, expect } from "vitest";
import { computeStreakUpdate } from "./streak-math";

describe("computeStreakUpdate", () => {
  const today = new Date("2026-05-07T10:00:00Z");

  it("first visit ever — streak starts at 1, should update", () => {
    const r = computeStreakUpdate({
      prevStreak: 0,
      lastSessionDate: null,
      today,
    });
    expect(r).toEqual({ newStreak: 1, isNewDay: true });
  });

  it("same UTC day — no update, streak unchanged", () => {
    const r = computeStreakUpdate({
      prevStreak: 7,
      lastSessionDate: new Date("2026-05-07T01:00:00Z"),
      today,
    });
    expect(r).toEqual({ newStreak: 7, isNewDay: false });
  });

  it("returned next day — streak increments by 1", () => {
    const r = computeStreakUpdate({
      prevStreak: 3,
      lastSessionDate: new Date("2026-05-06T20:00:00Z"),
      today,
    });
    expect(r).toEqual({ newStreak: 4, isNewDay: true });
  });

  it("two-day gap — streak resets to 1", () => {
    const r = computeStreakUpdate({
      prevStreak: 12,
      lastSessionDate: new Date("2026-05-05T10:00:00Z"),
      today,
    });
    expect(r).toEqual({ newStreak: 1, isNewDay: true });
  });

  it("month-long gap — streak resets to 1", () => {
    const r = computeStreakUpdate({
      prevStreak: 30,
      lastSessionDate: new Date("2026-04-01T10:00:00Z"),
      today,
    });
    expect(r).toEqual({ newStreak: 1, isNewDay: true });
  });

  it("treats UTC date boundaries — 23:59 vs 00:01 next day is a new day", () => {
    const lateLast = new Date("2026-05-06T23:59:00Z");
    const earlyToday = new Date("2026-05-07T00:01:00Z");
    const r = computeStreakUpdate({
      prevStreak: 1,
      lastSessionDate: lateLast,
      today: earlyToday,
    });
    expect(r).toEqual({ newStreak: 2, isNewDay: true });
  });
});
