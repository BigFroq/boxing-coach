import { describe, it, expect } from "vitest";
import { clampHistoryForAnthropic } from "./route";

type Msg = { role: "user" | "assistant"; content: string };

const makeHistory = (n: number): Msg[] =>
  Array.from({ length: n }, (_, i) => ({
    role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
    content: `m${i}`,
  }));

describe("clampHistoryForAnthropic", () => {
  it("returns input unchanged when length <= 10 and starts with user", () => {
    const h = makeHistory(7);
    expect(clampHistoryForAnthropic(h)).toEqual(h);
  });

  it("drops leading assistant when slice(-10) starts with assistant (N=11)", () => {
    const h = makeHistory(11);
    const out = clampHistoryForAnthropic(h);
    expect(out[0].role).toBe("user");
    expect(out.length).toBeLessThanOrEqual(10);
  });

  it("keeps last 10 when even length and slice starts with user (N=12)", () => {
    const h = makeHistory(12);
    const out = clampHistoryForAnthropic(h);
    expect(out.length).toBe(10);
    expect(out[0].role).toBe("user");
  });

  it("always yields user-first for N in [1..30]", () => {
    for (let n = 1; n <= 30; n++) {
      const out = clampHistoryForAnthropic(makeHistory(n));
      if (out.length > 0) expect(out[0].role).toBe("user");
    }
  });
});
