// Canonical punch list for clip review. A slug is three things at once: the
// value stored in clip_logs.punch_type, the filename in vault/clip-review/,
// and the value the client sends to /api/coach/clip-review.
// "general" is the opt-out — no punch-specific instructions, generic prompt.

export const PUNCH_TYPES = [
  { slug: "jab", label: "Jab" },
  { slug: "cross", label: "Rear hand" },
  { slug: "lead-hook", label: "Lead hook" },
  { slug: "rear-hook", label: "Rear hook" },
  { slug: "lead-uppercut", label: "Lead uppercut" },
  { slug: "rear-uppercut", label: "Rear uppercut" },
  { slug: "overhand-right", label: "Overhand" },
  { slug: "general", label: "Not sure / something else" },
] as const;

export type PunchSlug = (typeof PUNCH_TYPES)[number]["slug"];

/** Zod-friendly tuple of every valid slug. */
export const PUNCH_SLUGS = PUNCH_TYPES.map((p) => p.slug) as unknown as [
  PunchSlug,
  ...PunchSlug[],
];

/** Display label for a stored slug. Returns null for unknown/absent slugs so
 *  pre-migration rows render without a badge. */
export function punchLabel(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return PUNCH_TYPES.find((p) => p.slug === slug)?.label ?? null;
}
