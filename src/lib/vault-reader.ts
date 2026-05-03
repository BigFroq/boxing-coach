import { readFile, readdir } from "fs/promises";
import path from "path";

const VAULT_ROOT = path.join(process.cwd(), "vault", "fighters");
const DRILLS_ROOT = path.join(process.cwd(), "vault", "drills");
const SAFE_SLUG_RE = /^[a-z0-9-]+$/;

/**
 * Read a fighter vault markdown entry by slug.
 * Returns the raw file content, or null if the file does not exist
 * or the slug contains disallowed characters.
 */
export async function readFighterVaultEntry(slug: string): Promise<string | null> {
  if (!SAFE_SLUG_RE.test(slug)) return null;
  const filePath = path.join(VAULT_ROOT, `${slug}.md`);
  // Defence in depth: ensure the resolved path stays inside VAULT_ROOT.
  const normalized = path.normalize(filePath);
  if (!normalized.startsWith(VAULT_ROOT + path.sep)) return null;

  try {
    return await readFile(normalized, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Read a drill vault markdown entry by slug.
 * Returns the raw file content, or null if the file does not exist
 * or the slug contains disallowed characters.
 */
export async function readDrillVaultEntry(slug: string): Promise<string | null> {
  if (!SAFE_SLUG_RE.test(slug)) return null;
  const filePath = path.join(DRILLS_ROOT, `${slug}.md`);
  // Defence in depth: ensure the resolved path stays inside DRILLS_ROOT.
  const normalized = path.normalize(filePath);
  if (!normalized.startsWith(DRILLS_ROOT + path.sep)) return null;

  try {
    return await readFile(normalized, "utf-8");
  } catch {
    return null;
  }
}

/**
 * List all valid drill slugs available in the vault (sorted).
 * Files whose stems do not match SAFE_SLUG_RE are skipped.
 */
export async function listDrillSlugs(): Promise<string[]> {
  try {
    const entries = await readdir(DRILLS_ROOT);
    return entries
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.slice(0, -3))
      .filter((stem) => SAFE_SLUG_RE.test(stem))
      .sort();
  } catch {
    return [];
  }
}

/**
 * Read every drill vault entry. Convenience for callers that need all drills at once.
 */
export async function readAllDrillVaultEntries(): Promise<Array<{ slug: string; content: string }>> {
  const slugs = await listDrillSlugs();
  const results = await Promise.all(
    slugs.map(async (slug) => {
      const content = await readDrillVaultEntry(slug);
      return content !== null ? { slug, content } : null;
    })
  );
  return results.filter((r): r is { slug: string; content: string } => r !== null);
}
