import { describe, it, expect } from "vitest";
import { anonTokenForUserId } from "./games-leaderboard-anon";

describe("anonTokenForUserId", () => {
  it("produces the player_<4hex> shape", () => {
    const token = anonTokenForUserId("any-user-id");
    expect(token).toMatch(/^player_[a-f0-9]{4}$/);
  });

  it("is deterministic for the same userId", () => {
    const a = anonTokenForUserId("abc-123");
    const b = anonTokenForUserId("abc-123");
    expect(a).toBe(b);
  });

  it("differs across different userIds", () => {
    const a = anonTokenForUserId("user-a");
    const b = anonTokenForUserId("user-b");
    expect(a).not.toBe(b);
  });

  it("returns a constant fallback for empty/anon userId", () => {
    expect(anonTokenForUserId("")).toBe("player_anon");
    expect(anonTokenForUserId("anon")).toBe("player_anon");
  });
});
