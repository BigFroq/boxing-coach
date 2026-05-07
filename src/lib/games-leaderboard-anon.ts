// Derives a stable anonymous display token from a userId. Used by the
// leaderboard so users have an identity (consistent across reloads) without
// exposing the raw userId. Pure function — deterministic, no I/O.

import { createHash } from "crypto";

export function anonTokenForUserId(userId: string): string {
  if (!userId || userId === "anon") return "player_anon";
  const hash = createHash("sha256").update(userId).digest("hex");
  return `player_${hash.slice(0, 4)}`;
}
