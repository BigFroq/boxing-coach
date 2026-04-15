// scripts/vault-to-db.ts
// Reads Obsidian vault .md files, parses frontmatter + content + backlinks,
// and syncs changes back to Supabase knowledge_nodes / knowledge_edges.
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { promises as fs } from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const VAULT_DIR = path.join(process.cwd(), "vault");

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY!;

// --- Types ---

interface ParsedNode {
  slug: string;
  title: string;
  node_type: string;
  content: string;
  aliases: string[];
  tags: string[];
  centrality: number | null;
  sources: string[];
  connections: ParsedConnection[];
}

interface ParsedConnection {
  target_slug: string;
  edge_type: string;
  evidence: string;
  reverse: boolean; // if true, edge goes target → source instead of source → target
}

interface DbNode {
  id: string;
  slug: string;
  title: string;
  node_type: string;
  content: string;
  aliases: string[] | null;
  centrality: number | null;
}

interface DbEdge {
  id: string;
  source_node: string;
  target_node: string;
  edge_type: string;
  evidence: string | null;
}

// --- Folder → node_type mapping ---

const FOLDER_TYPE_MAP: Record<string, string> = {
  concepts: "concept",
  fighters: "fighter",
  techniques: "technique",
  phases: "phase",
  drills: "drill",
  "injury-prevention": "injury_prevention",
};

// --- Prefix → edge_type mapping ---

function prefixToEdgeType(prefix: string): { edge_type: string; reverse: boolean } {
  const p = prefix.trim().replace(/:$/, "").toLowerCase();
  if (p === "uses" || p === "requires") return { edge_type: "REQUIRES", reverse: false };
  if (p === "analyzed in" || p === "demonstrated by") return { edge_type: "DEMONSTRATES", reverse: true };
  if (p === "drill" || p === "trains") return { edge_type: "TRAINS", reverse: false };
  if (p === "corrects") return { edge_type: "CORRECTS", reverse: false };
  if (p === "sequence" || p === "next" || p === "→") return { edge_type: "SEQUENCES", reverse: false };
  return { edge_type: "RELATED", reverse: false };
}

// --- Parsing ---

function parseFrontmatter(raw: string): Record<string, unknown> {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const yaml = match[1];
  const result: Record<string, unknown> = {};
  for (const line of yaml.split("\n")) {
    // Handle array items (continuation of previous key)
    const arrayItemMatch = line.match(/^\s+-\s+(.+)/);
    if (arrayItemMatch) {
      // Find the last key and append to it
      const keys = Object.keys(result);
      const lastKey = keys[keys.length - 1];
      if (lastKey && Array.isArray(result[lastKey])) {
        (result[lastKey] as string[]).push(arrayItemMatch[1].trim().replace(/^["']|["']$/g, ""));
      }
      continue;
    }
    const kvMatch = line.match(/^(\w[\w-]*):\s*(.*)/);
    if (!kvMatch) continue;
    const [, key, rawValue] = kvMatch;
    const value = rawValue.trim();
    // Detect inline array: [a, b, c]
    const inlineArray = value.match(/^\[(.+)\]$/);
    if (inlineArray) {
      result[key] = inlineArray[1].split(",").map((s) => s.trim().replace(/^["']|["']$/g, ""));
    } else if (value === "" || value === "[]") {
      result[key] = [];
    } else {
      // Try number
      const num = Number(value);
      if (!isNaN(num) && value !== "") {
        result[key] = num;
      } else {
        result[key] = value.replace(/^["']|["']$/g, "");
      }
    }
  }
  return result;
}

function parseConnections(raw: string): ParsedConnection[] {
  const connectionsMatch = raw.match(/## Connections\r?\n([\s\S]*?)(?=\n## |\n---|\s*$)/);
  if (!connectionsMatch) return [];

  const connections: ParsedConnection[] = [];
  const lines = connectionsMatch[1].split("\n").filter((l) => l.trim().startsWith("-"));

  for (const line of lines) {
    // Pattern: - {prefix} [[{target}]] — {evidence}
    const match = line.match(/^-\s+(.+?)\[\[(.+?)\]\](?:\s*[—–-]\s*(.*))?/);
    if (!match) continue;
    const prefix = match[1].trim();
    const target = match[2].trim();
    const evidence = match[3]?.trim() ?? "";
    const targetSlug = target.toLowerCase().replace(/\s+/g, "-");
    const { edge_type, reverse } = prefixToEdgeType(prefix);
    connections.push({ target_slug: targetSlug, edge_type, evidence, reverse });
  }
  return connections;
}

function parseVaultFile(filePath: string, raw: string): ParsedNode | null {
  const relativePath = path.relative(VAULT_DIR, filePath);
  const parts = relativePath.split(path.sep);

  // Determine folder and slug
  let folder: string;
  let filename: string;
  if (parts.length >= 2) {
    folder = parts[0];
    filename = parts[parts.length - 1];
  } else {
    folder = "";
    filename = parts[0];
  }

  const slug = filename.replace(/\.md$/, "").toLowerCase().replace(/\s+/g, "-");
  const node_type = FOLDER_TYPE_MAP[folder] ?? "concept";

  // Parse frontmatter
  const fm = parseFrontmatter(raw);

  // Extract title from first # heading or filename
  const headingMatch = raw.match(/^#\s+(.+)/m);
  const title =
    typeof fm.title === "string"
      ? fm.title
      : headingMatch
        ? headingMatch[1].trim()
        : filename.replace(/\.md$/, "");

  // Extract content between frontmatter and ## Connections
  const afterFrontmatter = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  const connectionsIdx = afterFrontmatter.indexOf("## Connections");
  const sourcesIdx = afterFrontmatter.indexOf("## Sources");
  const cutoff = [connectionsIdx, sourcesIdx].filter((i) => i >= 0);
  const content =
    cutoff.length > 0
      ? afterFrontmatter.slice(0, Math.min(...cutoff)).trim()
      : afterFrontmatter.trim();

  const aliases = Array.isArray(fm.aliases) ? (fm.aliases as string[]) : [];
  const tags = Array.isArray(fm.tags) ? (fm.tags as string[]) : [];
  const centrality = typeof fm.centrality === "number" ? fm.centrality : null;

  // Parse sources
  const sourcesMatch = raw.match(/## Sources\r?\n([\s\S]*?)(?=\n## |\s*$)/);
  const sources: string[] = [];
  if (sourcesMatch) {
    for (const line of sourcesMatch[1].split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("-")) {
        sources.push(trimmed.replace(/^-\s*/, ""));
      }
    }
  }

  const connections = parseConnections(raw);

  return { slug, title, node_type, content, aliases, tags, centrality, sources, connections };
}

// --- File discovery ---

async function discoverVaultFiles(): Promise<string[]> {
  const files: string[] = [];

  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip src/ subdirectory
        if (entry.name === "src") continue;
        await walk(fullPath);
      } else if (entry.name.endsWith(".md") && !entry.name.endsWith("_MOC.md")) {
        files.push(fullPath);
      }
    }
  }

  await walk(VAULT_DIR);
  return files;
}

// --- Embedding via Voyage AI direct API ---

async function embedTexts(texts: string[]): Promise<number[][]> {
  const batchSize = 64;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const response = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${VOYAGE_API_KEY}`,
      },
      body: JSON.stringify({ input: batch, model: "voyage-3-lite" }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Voyage AI error ${response.status}: ${body}`);
    }

    const json = (await response.json()) as {
      data: Array<{ embedding: number[] }>;
    };
    allEmbeddings.push(...json.data.map((d) => d.embedding));
    console.log(`  Embedded: ${Math.min(i + batchSize, texts.length)}/${texts.length}`);
  }

  return allEmbeddings;
}

// --- Sync logic ---

async function main() {
  console.log("=== Punch Doctor AI — Vault-to-DB Sync ===\n");

  // 1. Discover and parse vault files
  console.log("1. Scanning vault files...");
  const filePaths = await discoverVaultFiles();
  console.log(`   Found ${filePaths.length} files\n`);

  if (filePaths.length === 0) {
    console.log("No vault files found. Nothing to sync.");
    return;
  }

  const parsedNodes: ParsedNode[] = [];
  for (const fp of filePaths) {
    const raw = await fs.readFile(fp, "utf-8");
    const node = parseVaultFile(fp, raw);
    if (node) parsedNodes.push(node);
  }
  console.log(`   Parsed ${parsedNodes.length} nodes\n`);

  // 2. Fetch current DB state
  console.log("2. Fetching current database state...");
  const { data: dbNodes, error: nodesErr } = await supabase
    .from("knowledge_nodes")
    .select("id, slug, title, node_type, content, aliases, centrality");
  if (nodesErr) throw new Error(`Failed to fetch nodes: ${nodesErr.message}`);

  const { data: dbEdges, error: edgesErr } = await supabase
    .from("knowledge_edges")
    .select("id, source_node, target_node, edge_type, evidence");
  if (edgesErr) throw new Error(`Failed to fetch edges: ${edgesErr.message}`);

  const nodesBySlug = new Map<string, DbNode>();
  for (const n of (dbNodes ?? []) as DbNode[]) {
    nodesBySlug.set(n.slug, n);
  }

  const nodeIdBySlug = new Map<string, string>();
  for (const n of (dbNodes ?? []) as DbNode[]) {
    nodeIdBySlug.set(n.slug, n.id);
  }

  console.log(`   DB has ${nodesBySlug.size} nodes, ${(dbEdges ?? []).length} edges\n`);

  // 3. Diff nodes — find changed content
  console.log("3. Comparing vault against DB...");
  const changedNodes: ParsedNode[] = [];
  const newNodes: ParsedNode[] = [];

  for (const parsed of parsedNodes) {
    const existing = nodesBySlug.get(parsed.slug);
    if (!existing) {
      newNodes.push(parsed);
    } else if (
      existing.content !== parsed.content ||
      existing.title !== parsed.title ||
      existing.node_type !== parsed.node_type ||
      JSON.stringify(existing.aliases ?? []) !== JSON.stringify(parsed.aliases)
    ) {
      changedNodes.push(parsed);
    }
  }
  console.log(`   New nodes: ${newNodes.length}`);
  console.log(`   Changed nodes: ${changedNodes.length}\n`);

  // 4. Update changed nodes
  if (changedNodes.length > 0) {
    console.log("4. Updating changed nodes...");
    for (const node of changedNodes) {
      const dbNode = nodesBySlug.get(node.slug)!;
      const { error } = await supabase
        .from("knowledge_nodes")
        .update({
          title: node.title,
          node_type: node.node_type,
          content: node.content,
          aliases: node.aliases,
          updated_at: new Date().toISOString(),
        })
        .eq("id", dbNode.id);
      if (error) {
        console.error(`   Failed to update ${node.slug}: ${error.message}`);
      } else {
        console.log(`   Updated: ${node.slug}`);
      }
    }
    console.log();
  } else {
    console.log("4. No node updates needed.\n");
  }

  // 5. Insert new nodes (rare — vault usually generated from DB)
  if (newNodes.length > 0) {
    console.log("5. Inserting new nodes...");
    for (const node of newNodes) {
      const { data, error } = await supabase
        .from("knowledge_nodes")
        .insert({
          slug: node.slug,
          title: node.title,
          node_type: node.node_type,
          content: node.content,
          aliases: node.aliases,
        })
        .select("id")
        .single();
      if (error) {
        console.error(`   Failed to insert ${node.slug}: ${error.message}`);
      } else {
        console.log(`   Inserted: ${node.slug}`);
        nodeIdBySlug.set(node.slug, data.id as string);
      }
    }
    console.log();
  } else {
    console.log("5. No new nodes to insert.\n");
  }

  // 6. Sync edges
  console.log("6. Syncing edges...");
  const existingEdgeSet = new Set(
    ((dbEdges ?? []) as DbEdge[]).map(
      (e) => `${e.source_node}|${e.target_node}|${e.edge_type}`
    )
  );
  const existingEdgeMap = new Map<string, DbEdge>();
  for (const e of (dbEdges ?? []) as DbEdge[]) {
    existingEdgeMap.set(`${e.source_node}|${e.target_node}|${e.edge_type}`, e);
  }

  // Collect desired edges from vault
  const desiredEdgeKeys = new Set<string>();
  const edgesToCreate: Array<{
    source_node: string;
    target_node: string;
    edge_type: string;
    evidence: string;
  }> = [];

  for (const parsed of parsedNodes) {
    const sourceId = nodeIdBySlug.get(parsed.slug);
    if (!sourceId) continue;

    for (const conn of parsed.connections) {
      const targetId = nodeIdBySlug.get(conn.target_slug);
      if (!targetId) {
        // Target node not in DB — skip
        continue;
      }

      const actualSource = conn.reverse ? targetId : sourceId;
      const actualTarget = conn.reverse ? sourceId : targetId;
      const key = `${actualSource}|${actualTarget}|${conn.edge_type}`;
      desiredEdgeKeys.add(key);

      if (!existingEdgeSet.has(key)) {
        edgesToCreate.push({
          source_node: actualSource,
          target_node: actualTarget,
          edge_type: conn.edge_type,
          evidence: conn.evidence,
        });
      }
    }
  }

  // Edges to remove: in DB but not in vault
  const edgesToRemove: string[] = [];
  for (const e of (dbEdges ?? []) as DbEdge[]) {
    const key = `${e.source_node}|${e.target_node}|${e.edge_type}`;
    if (!desiredEdgeKeys.has(key)) {
      edgesToRemove.push(e.id);
    }
  }

  if (edgesToCreate.length > 0) {
    const { error } = await supabase.from("knowledge_edges").insert(edgesToCreate);
    if (error) {
      console.error(`   Failed to create edges: ${error.message}`);
    } else {
      console.log(`   Created ${edgesToCreate.length} new edges`);
    }
  }

  if (edgesToRemove.length > 0) {
    const { error } = await supabase
      .from("knowledge_edges")
      .delete()
      .in("id", edgesToRemove);
    if (error) {
      console.error(`   Failed to remove edges: ${error.message}`);
    } else {
      console.log(`   Removed ${edgesToRemove.length} stale edges`);
    }
  }

  if (edgesToCreate.length === 0 && edgesToRemove.length === 0) {
    console.log("   Edges are in sync.");
  }
  console.log();

  // 7. Re-embed nodes whose content changed
  const nodesToEmbed = [...changedNodes, ...newNodes];
  if (nodesToEmbed.length > 0) {
    console.log(`7. Re-embedding ${nodesToEmbed.length} nodes...`);
    const texts = nodesToEmbed.map((n) => `${n.title}\n\n${n.content}`);
    const embeddings = await embedTexts(texts);

    for (let i = 0; i < nodesToEmbed.length; i++) {
      const nodeId = nodeIdBySlug.get(nodesToEmbed[i].slug);
      if (!nodeId) continue;
      const { error } = await supabase
        .from("knowledge_nodes")
        .update({ embedding: JSON.stringify(embeddings[i]) })
        .eq("id", nodeId);
      if (error) {
        console.error(`   Failed to embed ${nodesToEmbed[i].slug}: ${error.message}`);
      }
    }
    console.log(`   Embedded ${nodesToEmbed.length} nodes\n`);
  } else {
    console.log("7. No nodes need re-embedding.\n");
  }

  // 8. Recompute centrality
  console.log("8. Recomputing centrality...");
  const { error: centralityErr } = await supabase.rpc("recompute_centrality");
  if (centralityErr) {
    console.error(`   Centrality recomputation failed: ${centralityErr.message}`);
  } else {
    console.log("   Centrality recomputed.\n");
  }

  // 9. Summary
  console.log("=== Sync complete! ===");
  console.log(`Vault files scanned: ${filePaths.length}`);
  console.log(`Nodes updated: ${changedNodes.length}`);
  console.log(`Nodes inserted: ${newNodes.length}`);
  console.log(`Edges created: ${edgesToCreate.length}`);
  console.log(`Edges removed: ${edgesToRemove.length}`);
  console.log(`Nodes re-embedded: ${nodesToEmbed.length}`);
}

main().catch(console.error);
