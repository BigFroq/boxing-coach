import { z } from "zod";

type NormalizedPatch = {
  display_name?: string | null;
  email?: string | null;
  gym?: string | null;
  trainer?: string | null;
  started_boxing_at?: string | null;
  goals?: string | null;
  notes?: string | null;
};

type NormalizeResult =
  | { ok: true; userId: string; patch: NormalizedPatch }
  | { ok: false; error: string };

// Accepts empty string (to clear) or a real value. We normalize both ways in the transform.
const optionalText = (max: number) =>
  z
    .union([z.string().max(max), z.null()])
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined;
      if (v === null) return null;
      const trimmed = v.trim();
      return trimmed === "" ? null : trimmed;
    });

// YYYY-MM or YYYY-MM-DD; coerced to YYYY-MM-DD.
const dateField = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v, ctx) => {
    if (v === undefined) return undefined;
    if (v === null) return null;
    const trimmed = v.trim();
    if (trimmed === "") return null;

    const monthOnly = /^\d{4}-(0[1-9]|1[0-2])$/.exec(trimmed);
    if (monthOnly) return `${trimmed}-01`;

    const full = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.exec(trimmed);
    if (full) {
      // Reject rollover dates (e.g. 2023-02-31 → Date silently coerces to 2023-03-03).
      const d = new Date(trimmed + "T00:00:00Z");
      if (!Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === trimmed) {
        return trimmed;
      }
    }

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "started_boxing_at must be YYYY-MM or YYYY-MM-DD",
    });
    return z.NEVER;
  });

const emailField = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v, ctx) => {
    if (v === undefined) return undefined;
    if (v === null) return null;
    const trimmed = v.trim();
    if (trimmed === "") return null;
    if (!trimmed.includes("@") || trimmed.length > 200) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "email must contain @" });
      return z.NEVER;
    }
    return trimmed;
  });

const patchSchema = z.object({
  userId: z.string().min(1).max(80),
  display_name: optionalText(80),
  email: emailField,
  gym: optionalText(80),
  trainer: optionalText(80),
  started_boxing_at: dateField,
  goals: optionalText(500),
  notes: optionalText(4000),
});

export function normalizeProfilePatch(raw: unknown): NormalizeResult {
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid patch" };
  }

  const { userId, ...rest } = parsed.data;
  // Drop undefined keys so partial patches don't clobber omitted columns.
  const patch: NormalizedPatch = {};
  for (const [k, v] of Object.entries(rest)) {
    if (v !== undefined) (patch as Record<string, unknown>)[k] = v;
  }

  return { ok: true, userId, patch };
}
