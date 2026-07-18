// scripts/resync-candidate-cache.ts
// Resync scripts/vault-generation/.cache/pass1-candidates.json with the current DB.
//
// Why this exists: node merges/renames (scripts/merge-duplicate-nodes.ts) change
// knowledge_nodes but NOT the pass1 candidate cache. That leaves the cache with
//   - stale candidates for merged-away dupes → a full `generate-vault` RESURRECTS them,
//     silently undoing the dedupe;
//   - no candidate for renamed nodes → pass2 can never re-synthesize them, so they sit
//     in dirty-slugs.json failing every run.
//
// The DB is the source of truth for slug/title/node_type/aliases. The cache is the only
// home of `description`, so descriptions are carried over — for a renamed node, resolved
// via its old slug (merge/rename folds the old slug into the node's aliases).
//
// Candidate aliases matter: pass2's findRelevantChunks() builds both its vector query and
// its keyword filter from [title, ...aliases]. Using the DB's merged aliases preserves
// chunk-retrieval recall for material that came in under a dupe's name.
//
// Run: npx tsx scripts/resync-candidate-cache.ts --dry-run
//      npx tsx scripts/resync-candidate-cache.ts --execute

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import { promises as fs } from "fs";
import path from "path";

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const CACHE = path.join(process.cwd(), "scripts", "vault-generation", ".cache", "pass1-candidates.json");
const EXECUTE = process.argv.includes("--execute");

interface Candidate {
  title: string;
  slug: string;
  node_type: string;
  aliases: string[];
  description: string;
}

async function main() {
  console.log(EXECUTE ? "=== EXECUTE ===" : "=== DRY RUN ===");

  const nodes: { slug: string; title: string; node_type: string; aliases: string[] }[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from("knowledge_nodes")
      .select("slug, title, node_type, aliases")
      .range(from, from + 999);
    if (error) throw error;
    nodes.push(...(data as typeof nodes));
    if (data!.length < 1000) break;
    from += 1000;
  }

  const old: Candidate[] = JSON.parse(await fs.readFile(CACHE, "utf8"));
  const bySlug = new Map(old.map(c => [c.slug, c]));

  const next: Candidate[] = [];
  const recovered: string[] = [];
  const noDescription: string[] = [];

  for (const n of nodes) {
    const aliases = n.aliases ?? [];
    let src = bySlug.get(n.slug);
    if (!src) {
      // Renamed node: its old slug was folded into aliases by the rename step.
      const oldSlug = aliases.find(a => bySlug.has(a));
      if (oldSlug) {
        src = bySlug.get(oldSlug)!;
        recovered.push(`${oldSlug} → ${n.slug}`);
      }
    }
    if (!src) noDescription.push(n.slug);
    next.push({
      title: n.title,
      slug: n.slug,
      node_type: n.node_type,
      aliases,
      description: src?.description ?? "",
    });
  }

  const dbSlugs = new Set(nodes.map(n => n.slug));
  const dropped = old.filter(c => !dbSlugs.has(c.slug)).map(c => c.slug);

  console.log(`candidates: ${old.length} → ${next.length} (DB nodes: ${nodes.length})`);
  console.log(`\ndropped ${dropped.length} stale candidate(s) (merged away / renamed):\n  ${dropped.sort().join(", ")}`);
  console.log(`\nrecovered description via old slug for ${recovered.length}: ${recovered.join(", ")}`);
  if (noDescription.length) console.log(`\n⚠ no description found for ${noDescription.length}: ${noDescription.join(", ")}`);

  if (EXECUTE) {
    await fs.writeFile(CACHE + ".bak", JSON.stringify(old, null, 2));
    await fs.writeFile(CACHE, JSON.stringify(next, null, 2));
    console.log(`\nWrote ${CACHE}\nBackup at ${CACHE}.bak`);
  } else {
    console.log("\nDry run only — nothing written.");
  }
}

main().catch(e => { console.error(e); process.exit(1); });
