import { readFile } from "fs/promises";
import path from "path";

const VAULT_ROOT = path.join(process.cwd(), "vault", "fighters");
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
