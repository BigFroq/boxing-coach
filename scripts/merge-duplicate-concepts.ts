// scripts/merge-duplicate-concepts.ts
// Merge confirmed duplicate concept pairs in the DB:
//   four-phases-of-the-punch  → four-phases-of-punching
//   throw-vs-push-mechanics   → throw-vs-push
//   hand-wrapping-technique   → hand-wrapping
//
// For each pair (dupe → canonical):
//   1. For each edge referencing dupe, redirect to canonical IF no equivalent edge exists on canonical.
//      If one does exist (would be a duplicate after merge), delete the dupe-edge.
//   2. Merge dupe's aliases into canonical's aliases (dedupe).
//   3. Delete dupe node. CASCADE from knowledge_edges will clean up any leftovers.
//
// Run: npx tsx scripts/merge-duplicate-concepts.ts --dry-run
//      npx tsx scripts/merge-duplicate-concepts.ts --execute
//
// After --execute, run `npx tsx scripts/regenerate-vault-from-db.ts` to rebuild vault files.

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const PAIRS: Array<{ dupe: string; canonical: string }> = [
  { dupe: "four-phases-of-the-punch", canonical: "four-phases-of-punching" },
  { dupe: "throw-vs-push-mechanics", canonical: "throw-vs-push" },
  { dupe: "hand-wrapping-technique", canonical: "hand-wrapping" },
];

interface EdgeRow {
  id: string;
  source_node: string;
  target_node: string | null;
  target_chunk: string | null;
  edge_type: string;
  weight: number;
  evidence: string;
}

async function loadEdgesForNode(nodeId: string): Promise<EdgeRow[]> {
  // Paginate (the table exceeds the default 1000-row limit)
  const all: EdgeRow[] = [];
  for (const field of ["source_node", "target_node"] as const) {
    let from = 0;
    while (true) {
      const { data, error } = await sb
        .from("knowledge_edges")
        .select("id, source_node, target_node, target_chunk, edge_type, weight, evidence")
        .eq(field, nodeId)
        .range(from, from + 999);
      if (error) throw error;
      if (!data || data.length === 0) break;
      all.push(...(data as EdgeRow[]));
      if (data.length < 1000) break;
      from += 1000;
    }
  }
  // Dedupe by id (an edge where source and target both reference the node would show up twice)
  const seen = new Set<string>();
  return all.filter(e => (seen.has(e.id) ? false : (seen.add(e.id), true)));
}

function edgeKey(e: Omit<EdgeRow, "id" | "weight" | "evidence">, newSource: string, newTarget: string | null): string {
  return `${newSource}|${newTarget ?? e.target_chunk ?? "NONE"}|${e.edge_type}`;
}

async function mergePair(dupeSlug: string, canonicalSlug: string, execute: boolean) {
  console.log(`\n=== Merging ${dupeSlug} → ${canonicalSlug} ===`);

  const { data: nodes } = await sb
    .from("knowledge_nodes")
    .select("id, slug, title, aliases, content")
    .in("slug", [dupeSlug, canonicalSlug]);
  const dupe = nodes?.find(n => n.slug === dupeSlug);
  const canonical = nodes?.find(n => n.slug === canonicalSlug);
  if (!dupe) { console.log(`  ! ${dupeSlug} not found — skipping`); return; }
  if (!canonical) { console.log(`  ! ${canonicalSlug} not found — skipping`); return; }

  // 1. Fetch all edges referencing either node
  const dupeEdges = await loadEdgesForNode(dupe.id);
  const canonicalEdges = await loadEdgesForNode(canonical.id);
  console.log(`  dupe edges: ${dupeEdges.length}   canonical edges: ${canonicalEdges.length}`);

  // Build a key set for canonical's existing edges (so we can detect duplicates after redirect)
  const canonicalKeys = new Set(
    canonicalEdges.map(e => edgeKey(e, e.source_node, e.target_node))
  );

  const toUpdate: Array<{ id: string; source_node: string; target_node: string | null }> = [];
  const toDelete: string[] = [];

  for (const e of dupeEdges) {
    const newSource = e.source_node === dupe.id ? canonical.id : e.source_node;
    const newTarget = e.target_node === dupe.id ? canonical.id : e.target_node;

    // Skip self-loops (edge from canonical to canonical)
    if (newTarget === newSource && newTarget !== null) {
      toDelete.push(e.id);
      continue;
    }

    const key = `${newSource}|${newTarget ?? e.target_chunk ?? "NONE"}|${e.edge_type}`;
    if (canonicalKeys.has(key)) {
      // An equivalent edge already exists on canonical — drop the dupe one
      toDelete.push(e.id);
    } else {
      toUpdate.push({ id: e.id, source_node: newSource, target_node: newTarget });
      canonicalKeys.add(key); // avoid creating duplicates from within the dupe set itself
    }
  }

  console.log(`  redirect: ${toUpdate.length} edges    delete (duplicates/self-loops): ${toDelete.length} edges`);

  // 2. Merge aliases + add dupe's slug and title as aliases for backward-compat
  const mergedAliases = Array.from(new Set([
    ...(canonical.aliases ?? []),
    ...(dupe.aliases ?? []),
    dupe.slug,
    dupe.title,
  ])).filter(a => a && a !== canonical.slug && a !== canonical.title);
  const addedAliases = mergedAliases.filter(a => !(canonical.aliases ?? []).includes(a));
  console.log(`  aliases to add to canonical: ${JSON.stringify(addedAliases)}`);

  if (!execute) {
    console.log(`  [DRY RUN] skipping DB writes`);
    return;
  }

  // 3. Apply — redirects first (in chunks to keep payloads small)
  for (const u of toUpdate) {
    const { error } = await sb
      .from("knowledge_edges")
      .update({ source_node: u.source_node, target_node: u.target_node })
      .eq("id", u.id);
    if (error) console.error(`  update error on ${u.id}: ${error.message}`);
  }
  if (toDelete.length) {
    const { error } = await sb.from("knowledge_edges").delete().in("id", toDelete);
    if (error) console.error(`  delete error: ${error.message}`);
  }

  // 4. Update canonical aliases
  if (addedAliases.length) {
    const { error } = await sb
      .from("knowledge_nodes")
      .update({ aliases: mergedAliases })
      .eq("id", canonical.id);
    if (error) console.error(`  alias update error: ${error.message}`);
  }

  // 5. Delete the dupe node (CASCADE will remove any residual edges — shouldn't be any)
  const { error: delErr } = await sb.from("knowledge_nodes").delete().eq("id", dupe.id);
  if (delErr) {
    console.error(`  node delete error: ${delErr.message}`);
  } else {
    console.log(`  deleted dupe node ${dupe.slug}`);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const execute = argv.includes("--execute");
  const dryRun = argv.includes("--dry-run") || !execute;
  console.log(`=== merge-duplicate-concepts ===`);
  console.log(`mode: ${execute ? "EXECUTE (will write to DB)" : "DRY RUN"}`);

  for (const pair of PAIRS) {
    await mergePair(pair.dupe, pair.canonical, execute);
  }

  console.log();
  console.log("Next step: npx tsx scripts/regenerate-vault-from-db.ts");
}

main().catch(e => { console.error(e); process.exit(1); });
