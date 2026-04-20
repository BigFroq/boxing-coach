import { VAULT_SLUGS, dimensionLabelToKey, isDimensionKey, type DimensionKey } from "./dimensions";

export interface FocusAreaUpdateLike {
  dimension?: unknown;
  knowledge_node_slug?: unknown;
}

/**
 * Derive canonical "dimension::slug" keys from LLM-emitted focus_area_updates.
 *
 * Skips updates whose dimension can't be resolved. Coerces unknown slugs to "" so
 * they collapse into the (dim, null) bucket instead of creating phantom keys.
 * De-duplicates the output.
 */
export function deriveFocusAreaKeys(
  updates: FocusAreaUpdateLike[] | undefined
): string[] {
  if (!updates || updates.length === 0) return [];

  const out = new Set<string>();
  for (const u of updates) {
    const rawDim = u.dimension;
    const dim: DimensionKey | null = isDimensionKey(rawDim)
      ? rawDim
      : dimensionLabelToKey(String(rawDim ?? ""));
    if (!dim) continue;

    const rawSlug = typeof u.knowledge_node_slug === "string" ? u.knowledge_node_slug : "";
    const slug = rawSlug.length > 0 && (VAULT_SLUGS as readonly string[]).includes(rawSlug) ? rawSlug : "";

    out.add(`${dim}::${slug}`);
  }
  return Array.from(out);
}
