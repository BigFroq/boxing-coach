import { describe, it, expect } from "vitest";
import { decideEngagementUpdate } from "./user-engagement-sync";

// We don't unit-test the Supabase round-trip here — that's covered by manual
// QA + e2e if it's worth it later. We test the decision function which is
// where the logic lives.

describe("decideEngagementUpdate", () => {
  const today = new Date("2026-05-07T10:00:00Z");

  it("returns insert plan when no row exists", () => {
    const plan = decideEngagementUpdate({ existing: null, today });
    expect(plan).toEqual({
      kind: "insert",
      row: {
        last_session_date: "2026-05-07",
        current_streak_days: 1,
        longest_streak_days: 1,
        session_count: 1,
      },
    });
  });

  it("returns no-op-touch plan on same UTC day", () => {
    const plan = decideEngagementUpdate({
      existing: {
        last_session_date: "2026-05-07",
        current_streak_days: 5,
        longest_streak_days: 12,
        session_count: 30,
      },
      today,
    });
    expect(plan).toEqual({ kind: "touch" });
  });

  it("returns increment plan on next-day return", () => {
    const plan = decideEngagementUpdate({
      existing: {
        last_session_date: "2026-05-06",
        current_streak_days: 3,
        longest_streak_days: 3,
        session_count: 10,
      },
      today,
    });
    expect(plan).toEqual({
      kind: "update",
      row: {
        last_session_date: "2026-05-07",
        current_streak_days: 4,
        longest_streak_days: 4,
        session_count: 11,
      },
    });
  });

  it("preserves longest_streak when current resets after gap", () => {
    const plan = decideEngagementUpdate({
      existing: {
        last_session_date: "2026-05-04",
        current_streak_days: 2,
        longest_streak_days: 14,
        session_count: 50,
      },
      today,
    });
    expect(plan).toEqual({
      kind: "update",
      row: {
        last_session_date: "2026-05-07",
        current_streak_days: 1,
        longest_streak_days: 14,
        session_count: 51,
      },
    });
  });

  it("bumps longest_streak when current overtakes it", () => {
    const plan = decideEngagementUpdate({
      existing: {
        last_session_date: "2026-05-06",
        current_streak_days: 14,
        longest_streak_days: 14,
        session_count: 100,
      },
      today,
    });
    expect(plan).toEqual({
      kind: "update",
      row: {
        last_session_date: "2026-05-07",
        current_streak_days: 15,
        longest_streak_days: 15,
        session_count: 101,
      },
    });
  });
});
