// scripts/generate-vault.ts
// Orchestrates the full vault generation pipeline: Extract → Synthesize → Edges → Validate+Insert
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { promises as fs } from "fs";
import path from "path";
import { extractEntities, type NodeCandidate } from "./vault-generation/pass1-extract";
import { synthesizeNodes, type SynthesizedNode } from "./vault-generation/pass2-synthesize";
import { discoverEdges, type DiscoveredEdge } from "./vault-generation/pass3-edges";
import { validateAndInsert } from "./vault-generation/pass4-validate";
import { writeVaultFiles } from "./vault-generation/write-vault";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CACHE_DIR = path.join(process.cwd(), "scripts", "vault-generation", ".cache");

async function ensureCacheDir() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

async function loadCache<T>(filename: string): Promise<T | null> {
  try {
    const data = await fs.readFile(path.join(CACHE_DIR, filename), "utf-8");
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

async function saveCache<T>(filename: string, data: T): Promise<void> {
  await fs.writeFile(path.join(CACHE_DIR, filename), JSON.stringify(data, null, 2));
}

async function main() {
  console.log("=== Punch Doctor AI — Vault Generation Pipeline ===\n");
  await ensureCacheDir();

  // If dirty-slugs.json is present (set by incremental-ingest), bust pass2/3
  // final caches so the partial-rerun in pass2 actually executes.
  const dirtyExists = await fs
    .stat(path.join(CACHE_DIR, "dirty-slugs.json"))
    .then(() => true)
    .catch(() => false);
  if (dirtyExists) {
    console.log("Dirty-slugs file present — busting pass2-nodes.json and pass3-edges.json caches.\n");
    for (const f of ["pass2-nodes.json", "pass3-edges.json"]) {
      await fs.rm(path.join(CACHE_DIR, f), { force: true });
    }
  }

  // Pass 1: Entity Extraction
  let candidates = await loadCache<NodeCandidate[]>("pass1-candidates.json");
  if (candidates) {
    console.log(`Pass 1: Loaded ${candidates.length} candidates from cache\n`);
  } else {
    candidates = await extractEntities(supabase);
    await saveCache("pass1-candidates.json", candidates);
  }

  // Pass 2: Knowledge Synthesis
  let nodes = await loadCache<SynthesizedNode[]>("pass2-nodes.json");
  if (nodes) {
    console.log(`Pass 2: Loaded ${nodes.length} synthesized nodes from cache\n`);
  } else {
    nodes = await synthesizeNodes(supabase, candidates);
    await saveCache("pass2-nodes.json", nodes);
  }

  // Pass 3: Edge Discovery
  let edges = await loadCache<DiscoveredEdge[]>("pass3-edges.json");
  if (edges) {
    console.log(`Pass 3: Loaded ${edges.length} edges from cache\n`);
  } else {
    edges = await discoverEdges(supabase, nodes);
    await saveCache("pass3-edges.json", edges);
  }

  // Pass 4: Validate + Insert into DB
  const { nodes: finalNodes, edges: finalEdges } = await validateAndInsert(
    supabase, nodes, edges
  );

  // Write vault files
  await writeVaultFiles(finalNodes, finalEdges);

  // Clear dirty-slugs marker after a successful end-to-end run
  if (dirtyExists) {
    await fs.rm(path.join(CACHE_DIR, "dirty-slugs.json"), { force: true });
    console.log("Cleared dirty-slugs.json (incremental work absorbed).");
  }

  console.log("\n=== Vault generation complete! ===");
  console.log(`Nodes: ${finalNodes.length}`);
  console.log(`Edges: ${finalEdges.length}`);
  console.log(`Vault: ${path.join(process.cwd(), "vault")}`);
}

main().catch(console.error);
