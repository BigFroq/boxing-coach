import { describe, it, expect } from "vitest";
import { formatRelativeTime } from "./relative-time";

const NOW = new Date("2026-04-21T12:00:00Z");

describe("formatRelativeTime", () => {
  it("returns 'Never' for null", () => {
    expect(formatRelativeTime(null, NOW)).toBe("Never");
  });

  it("returns 'Never' for undefined", () => {
    expect(formatRelativeTime(undefined, NOW)).toBe("Never");
  });

  it("returns 'Today' for same-day timestamps", () => {
    expect(formatRelativeTime("2026-04-21T03:00:00Z", NOW)).toBe("Today");
  });

  it("returns 'Yesterday' for 1 day ago", () => {
    expect(formatRelativeTime("2026-04-20T12:00:00Z", NOW)).toBe("Yesterday");
  });

  it("returns 'N days ago' for 2-6 days", () => {
    expect(formatRelativeTime("2026-04-19T12:00:00Z", NOW)).toBe("2 days ago");
    expect(formatRelativeTime("2026-04-15T12:00:00Z", NOW)).toBe("6 days ago");
  });

  it("returns '1 week ago' for 7 days", () => {
    expect(formatRelativeTime("2026-04-14T12:00:00Z", NOW)).toBe("1 week ago");
  });

  it("returns 'N weeks ago' for 2-4 weeks", () => {
    expect(formatRelativeTime("2026-04-07T12:00:00Z", NOW)).toBe("2 weeks ago");
    expect(formatRelativeTime("2026-03-24T12:00:00Z", NOW)).toBe("4 weeks ago");
  });

  it("returns '1 month ago' for ~30 days", () => {
    expect(formatRelativeTime("2026-03-22T12:00:00Z", NOW)).toBe("1 month ago");
  });

  it("returns 'N months ago' for 2-11 months", () => {
    expect(formatRelativeTime("2026-02-21T12:00:00Z", NOW)).toBe("2 months ago");
    expect(formatRelativeTime("2025-05-21T12:00:00Z", NOW)).toBe("11 months ago");
  });

  it("returns 'Over a year ago' for 12+ months", () => {
    expect(formatRelativeTime("2025-04-20T12:00:00Z", NOW)).toBe("Over a year ago");
    expect(formatRelativeTime("2020-01-01T12:00:00Z", NOW)).toBe("Over a year ago");
  });

  it("returns 'Never' for an invalid date string", () => {
    expect(formatRelativeTime("not-a-date", NOW)).toBe("Never");
  });
});
