// Loads the coach-authored per-punch assessment protocols that the clip-review
// analyst runs on.
//
// These live in src/content/clip-review/ rather than in vault/ on purpose:
// vault/ is gitignored (it is pipeline output, rebuilt by scripts/generate-vault.ts
// and served from the content_chunks table), so anything stored there never
// reaches a deployment. These files are hand-written by the coach and must ship
// with the build, so they sit in tracked source.
//
// Because they are read at request time from a path built at runtime, file
// tracing cannot see them — next.config.ts lists them in
// outputFileTracingIncludes for the routes below.

import { readFile } from "fs/promises";
import path from "path";

const INSTRUCTIONS_ROOT = path.join(process.cwd(), "src", "content", "clip-review");
const SAFE_SLUG_RE = /^[a-z0-9-]+$/;

/**
 * Read the assessment protocol for a punch.
 * Returns the raw markdown, or null if the punch has no protocol yet or the
 * slug contains disallowed characters — callers fall back to the generic prompt.
 */
export async function readClipReviewInstructions(slug: string): Promise<string | null> {
  if (!SAFE_SLUG_RE.test(slug)) return null;
  const filePath = path.join(INSTRUCTIONS_ROOT, `${slug}.md`);
  // Defence in depth: ensure the resolved path stays inside INSTRUCTIONS_ROOT.
  const normalized = path.normalize(filePath);
  if (!normalized.startsWith(INSTRUCTIONS_ROOT + path.sep)) return null;

  try {
    return await readFile(normalized, "utf-8");
  } catch {
    return null;
  }
}
