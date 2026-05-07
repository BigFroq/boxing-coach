// Pure streak math. No DB, no Date.now(), no globals. All inputs explicit.
// Streak rules: same UTC day = no change; +1 UTC day = increment; gap = reset to 1.
// Using UTC sidesteps DST and timezone-travel edge cases for v1; we can revisit
// per-user-timezone later if cohort data shows it matters.

function utcDayIndex(d: Date): number {
  // Days since Unix epoch in UTC. Stable integer, easy to subtract.
  const ms = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.floor(ms / 86_400_000);
}

export interface StreakUpdateInput {
  prevStreak: number;
  lastSessionDate: Date | null;
  today: Date;
}

export interface StreakUpdateResult {
  newStreak: number;
  isNewDay: boolean;
}

export function computeStreakUpdate(input: StreakUpdateInput): StreakUpdateResult {
  const { prevStreak, lastSessionDate, today } = input;
  if (!lastSessionDate) {
    return { newStreak: 1, isNewDay: true };
  }
  const diff = utcDayIndex(today) - utcDayIndex(lastSessionDate);
  if (diff === 0) return { newStreak: prevStreak, isNewDay: false };
  if (diff === 1) return { newStreak: prevStreak + 1, isNewDay: true };
  return { newStreak: 1, isNewDay: true };
}
