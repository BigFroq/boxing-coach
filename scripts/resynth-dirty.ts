// scripts/resynth-dirty.ts
// Targeted, NON-DESTRUCTIVE re-synthesis of the knowledge nodes marked dirty by
// incremental-ingest (scripts/vault-generation/.cache/dirty-slugs.json).
//
// This is the cheap middle path between "do nothing" and a full `generate-vault`.
// It:
//   1. Re-synthesizes ONLY the dirty nodes via pass2 (pulling in newly-ingested chunks).
//   2. Surgically UPDATEs just those rows in knowledge_nodes (content + embedding).
//   3. Re-renders ONLY those nodes' vault/*.md (connections resolved from current edges) —
//      no orphan-pruning, no _MOC rewrite, no other files touched.
//   4. Clears the dirty marker (full run only).
//
// What it deliberately does NOT do (use a full `generate-vault` for these):
//   - No pass1 entity extraction → it will NOT create new nodes for entities unique to
//     the new videos (e.g. brand-new fighters). It only enriches existing nodes.
//   - No pass3 edge re-discovery and NO graph wipe. All existing edges are preserved.
//
// Usage:
//   npx tsx scripts/resynth-dirty.ts                  # all dirty nodes, then clear marker
//   npx tsx scripts/resynth-dirty.ts --limit 3        # only first 3 (test run); marker kept
//   SYNTHESIS_MODEL=claude-sonnet-4-6 npx tsx scripts/resynth-dirty.ts --limit 3
//
// Per project rule (CLAUDE.md): do a --limit test on a cheap model before the full Opus run.

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { promises as fs } from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import type { NodeCandidate } from "./vault-generation/pass1-extract";
import { synthesizeNodes, type SynthesizedNode } from "./vault-generation/pass2-synthesize";
import type { DiscoveredEdge } from "./vault-generation/pass3-edges";
import { writeVaultFiles } from "./vault-generation/write-vault";
import { withRetry } from "../src/lib/retry";

const CACHE_DIR = path.join(process.cwd(), "scripts", "vault-generation", ".cache");
const CANDIDATES_CACHE = path.join(CACHE_DIR, "pass1-candidates.json");
const DIRTY_SLUGS_FILE = path.join(CACHE_DIR, "dirty-slugs.json");
const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function loadJSON<T>(p: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(p, "utf-8")) as T;
  } catch {
    return null;
  }
}

// voyage-3-lite, same model the rest of the pipeline uses for node embeddings.
async function embedBatch(texts: string[]): Promise<number[][]> {
  const batchSize = 64;
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const data = await withRetry(
      async () => {
        const res = await fetch(VOYAGE_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
          },
          body: JSON.stringify({ input: batch, model: "voyage-3-lite" }),
        });
        if (!res.ok) throw new Error(`Voyage error ${res.status}: ${await res.text()}`);
        return (await res.json()) as { data: { embedding: number[] }[] };
      },
      { label: "resynth-voyage-embed", maxAttempts: 5 }
    );
    out.push(...data.data.map((d) => d.embedding));
    if (i + batchSize < texts.length) await new Promise((r) => setTimeout(r, 1000));
  }
  return out;
}

function parseLimit(argv: string[]): number | null {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--limit=")) return parseInt(a.split("=")[1], 10);
    if (a === "--limit") return parseInt(argv[i + 1] ?? "", 10);
  }
  return null;
}

async function main() {
  console.log("=== Punch Doctor AI — Targeted Dirty-Node Re-Synthesis ===\n");

  const limit = parseLimit(process.argv.slice(2));
  if (limit !== null && Number.isNaN(limit)) {
    throw new Error("--limit requires a number, e.g. `--limit 3`");
  }
  const model = process.env.SYNTHESIS_MODEL ?? "claude-opus-4-6";
  const provider = process.env.SYNTHESIS_PROVIDER ?? "cli"; // display only; dispatch defaults to cli in llm-provider.ts

  // 1. Inputs
  const candidates = await loadJSON<NodeCandidate[]>(CANDIDATES_CACHE);
  if (!candidates) {
    throw new Error(`Missing ${CANDIDATES_CACHE} — run \`npm run generate-vault\` at least once first.`);
  }
  const fullDirty = await loadJSON<string[]>(DIRTY_SLUGS_FILE);
  if (!fullDirty || fullDirty.length === 0) {
    console.log("No dirty slugs queued. Nothing to do.");
    return;
  }

  const isPartial = limit != null && limit < fullDirty.length;
  const target = isPartial ? fullDirty.slice(0, limit!) : fullDirty;
  const targetSet = new Set(target);

  console.log(`Dirty queued:           ${fullDirty.length}`);
  console.log(`This run re-synthesizes: ${target.length}${isPartial ? ` (--limit ${limit})` : ""}`);
  console.log(`Model: ${model} | Provider: ${provider}\n`);

  // 2. Re-synthesize. pass2 reads dirty-slugs.json itself; for a partial run we
  //    temporarily narrow that file to the subset, then restore it in `finally`.
  //    (priorAll in pass2 still holds all 290 nodes, so the cache never loses the
  //    non-subset nodes — they're carried over with their existing content.)
  if (isPartial) {
    await fs.writeFile(DIRTY_SLUGS_FILE, JSON.stringify(target, null, 2));
  }
  let allNodes: SynthesizedNode[];
  try {
    allNodes = await synthesizeNodes(supabase, candidates);
  } finally {
    if (isPartial) await fs.writeFile(DIRTY_SLUGS_FILE, JSON.stringify(fullDirty, null, 2));
  }

  const updated = allNodes.filter((n) => targetSet.has(n.slug));
  const gotSlugs = new Set(updated.map((n) => n.slug));
  const skipped = target.filter((s) => !gotSlugs.has(s));
  if (skipped.length) {
    console.warn(
      `\n  ${skipped.length} dirty slug(s) could not be synthesized (no candidate or no source chunks): ${skipped.join(", ")}`
    );
  }
  if (updated.length === 0) {
    console.log("\nNothing synthesized — leaving DB and dirty marker untouched.");
    return;
  }

  // 3. Embed + surgical UPDATE (content + embedding only — no edges, no wipe).
  console.log(`\nEmbedding ${updated.length} re-synthesized node(s)...`);
  const embeddings = await embedBatch(
    updated.map((n) => `${n.title}\n\n${n.content}`.slice(0, 8000))
  );

  console.log("Updating knowledge_nodes rows (content + embedding)...");
  let ok = 0;
  for (let i = 0; i < updated.length; i++) {
    const n = updated[i];
    const { error } = await supabase
      .from("knowledge_nodes")
      .update({
        content: n.content,
        embedding: JSON.stringify(embeddings[i]),
        updated_at: new Date().toISOString(),
      })
      .eq("slug", n.slug);
    if (error) console.error(`  UPDATE failed for ${n.slug}: ${error.message}`);
    else ok++;
  }
  console.log(`  Updated ${ok}/${updated.length} rows.`);

  // 4. Re-render ONLY these nodes' vault/*.md from current DB state. We load ALL
  //    nodes + edges so connections resolve correctly, but writeVaultFiles is scoped
  //    via onlySlugs → other files, deleted files, and _MOC are left untouched.
  console.log("Re-rendering vault/*.md for updated nodes...");
  const { data: nodeRows, error: nErr } = await supabase
    .from("knowledge_nodes")
    .select("id, slug, title, node_type, content, aliases");
  if (nErr) throw nErr;

  // Edges — paginate (table exceeds the 1000-row default).
  const edgeRows: Array<{
    source_node: string;
    target_node: string | null;
    target_chunk: string | null;
    edge_type: string;
    weight: number | null;
    evidence: string | null;
  }> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("knowledge_edges")
      .select("source_node, target_node, target_chunk, edge_type, weight, evidence")
      .range(from, from + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    edgeRows.push(...data);
    if (data.length < 1000) break;
  }

  const idToSlug = new Map<string, string>();
  for (const n of nodeRows ?? []) idToSlug.set(n.id, n.slug);

  const nodes: SynthesizedNode[] = (nodeRows ?? []).map((n) => ({
    title: n.title,
    slug: n.slug,
    node_type: n.node_type,
    aliases: n.aliases ?? [],
    description: "",
    content: n.content,
    source_chunk_ids: [],
  }));

  const edges: DiscoveredEdge[] = [];
  for (const e of edgeRows) {
    const sourceSlug = idToSlug.get(e.source_node);
    if (!sourceSlug) continue;
    edges.push({
      source_slug: sourceSlug,
      target_slug: e.target_node ? idToSlug.get(e.target_node) ?? null : null,
      target_chunk_id: e.target_chunk ?? null,
      edge_type: e.edge_type as DiscoveredEdge["edge_type"],
      weight: e.weight ?? 0.8,
      evidence: e.evidence ?? "",
    });
  }

  await writeVaultFiles(nodes, edges, { onlySlugs: gotSlugs });

  // 5. Marker bookkeeping.
  if (isPartial) {
    console.log(`\nPartial run — dirty-slugs.json left intact (${fullDirty.length} still queued).`);
  } else if (skipped.length) {
    await fs.writeFile(DIRTY_SLUGS_FILE, JSON.stringify(skipped, null, 2));
    console.log(`\nKept ${skipped.length} unresolved slug(s) in dirty-slugs.json.`);
  } else {
    await fs.rm(DIRTY_SLUGS_FILE, { force: true });
    console.log("\nCleared dirty-slugs.json — all dirty nodes absorbed.");
  }

  console.log("\n=== Done ===");
  console.log(`Re-synthesized & updated: ${ok} node(s) | Skipped: ${skipped.length}`);
  console.log("Graph edges: untouched | Graph wipe: none | Other vault files: untouched");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
