// scripts/rerun-pass3-edges.ts
// Re-runs pass3-edges.ts for nodes that ended up with zero non-SOURCED_FROM edges in the DB.
// Context: scripts/diagnose-orphan-edges.ts found 15 nodes with zero edges. 5 of those are
// thin stubs (content < 200 chars) — we skip those. The remaining 10 have real synthesized
// content and deserve proper edges for the RAG + vault Connections sections to work right.
//
// Safety per /Users/mark/boxing-coach/CLAUDE.md:
// 1. Incremental save after every batch (batch size = 5) — crashes don't lose all work
// 2. Retry logic with exponential backoff on API errors
// 3. Sonnet by default (cheap); --opus to override
// 4. --dry-run processes only 2 nodes and prints without writing to DB
//
// Usage:
//   npx tsx scripts/rerun-pass3-edges.ts --dry-run         # sonnet, 2 nodes, no DB writes
//   npx tsx scripts/rerun-pass3-edges.ts                   # sonnet, all 10 real nodes, writes to DB
//   npx tsx scripts/rerun-pass3-edges.ts --opus            # opus, all 10 real nodes, writes to DB
//   npx tsx scripts/rerun-pass3-edges.ts --slug=foo,bar    # run for specific slugs only

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const BATCH_SIZE = 5;
const MIN_CONTENT_CHARS = 200; // below this = stub, skip

type EdgeType = "REQUIRES" | "DEMONSTRATES" | "TRAINS" | "CORRECTS" | "SEQUENCES" | "RELATED";

interface Node {
  id: string;
  slug: string;
  title: string;
  node_type: string;
  content: string;
  aliases: string[];
}

interface DiscoveredEdge {
  source_slug: string;
  target_slug: string;
  edge_type: EdgeType;
  weight: number;
  evidence: string;
}

interface Args {
  dryRun: boolean;
  opus: boolean;
  specificSlugs: string[] | null;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const slugArg = argv.find(a => a.startsWith("--slug="));
  return {
    dryRun: argv.includes("--dry-run"),
    opus: argv.includes("--opus"),
    specificSlugs: slugArg ? slugArg.replace("--slug=", "").split(",").map(s => s.trim()) : null,
  };
}

async function loadNodesAndEdgeCounts() {
  const { data: nodes, error: nErr } = await sb
    .from("knowledge_nodes")
    .select("id, slug, title, node_type, content, aliases");
  if (nErr) throw nErr;

  const { data: edges, error: eErr } = await sb
    .from("knowledge_edges")
    .select("source_node, target_node, edge_type")
    .neq("edge_type", "SOURCED_FROM");
  if (eErr) throw eErr;

  const degree = new Map<string, number>();
  for (const n of (nodes ?? []) as Node[]) degree.set(n.id, 0);
  for (const e of (edges ?? []) as { source_node: string; target_node: string | null }[]) {
    degree.set(e.source_node, (degree.get(e.source_node) ?? 0) + 1);
    if (e.target_node) degree.set(e.target_node, (degree.get(e.target_node) ?? 0) + 1);
  }

  return { allNodes: (nodes ?? []) as Node[], degree };
}

function buildSystemPrompt(nodeIndex: Array<{ slug: string; title: string; type: string; aliases: string[] }>): string {
  const nodeIndexText = JSON.stringify(nodeIndex, null, 2);
  return `You are discovering connections between nodes in a boxing knowledge graph.

Available edge types:
- REQUIRES: prerequisite ("Jab" requires "Phase 2 Hip Opening")
- DEMONSTRATES: fighter shows technique ("Canelo" demonstrates "Jab Mechanics")
- TRAINS: drill builds skill ("Hip Opening Drill" trains "Phase 2")
- CORRECTS: myth-busting ("Throw vs Push" corrects a misconception)
- SEQUENCES: ordering ("Phase 1" sequences to "Phase 2")
- RELATED: weaker association (use sparingly, weight 0.3-0.5)

Rules:
- Only create edges DIRECTLY SUPPORTED by the source material.
- If inferring a connection Alex didn't explicitly make, use RELATED with weight <= 0.5.
- Each edge needs evidence: a quote or specific reason from the content.
- Weight scale: 1.0 = essential/explicit, 0.8 = strong, 0.6 = moderate, 0.3-0.5 = inferred.
- Source slug = the node you're analyzing, target slug = the connected node.
- Only use slugs from the available nodes list.
- Aim for 5-12 edges per node.

For each node in the batch, return its edges as a JSON array.

Available nodes:
${nodeIndexText}

Return a flat JSON array of edge objects. No markdown fencing.
Each object: {"source_slug": "...", "target_slug": "...", "edge_type": "...", "weight": 0.8, "evidence": "..."}`;
}

async function callModelWithRetry(
  model: string,
  systemPrompt: string,
  userContent: string,
  batchLabel: string,
): Promise<string> {
  const maxAttempts = 4;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await anthropic.messages.create({
        model,
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
      });
      return response.content[0].type === "text" ? response.content[0].text : "[]";
    } catch (err: unknown) {
      lastErr = err;
      const delayMs = Math.min(30_000, 2 ** attempt * 1000);
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`  [${batchLabel}] attempt ${attempt}/${maxAttempts} failed: ${errMsg}`);
      if (attempt < maxAttempts) {
        console.warn(`  [${batchLabel}] retrying in ${delayMs}ms...`);
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }
  throw lastErr;
}

function parseEdges(raw: string, validSlugs: Set<string>): DiscoveredEdge[] {
  let jsonStr = raw.trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) jsonStr = fence[1].trim();
  try {
    const parsed = JSON.parse(jsonStr) as DiscoveredEdge[];
    return parsed.filter(
      e =>
        e.source_slug &&
        e.target_slug &&
        validSlugs.has(e.source_slug) &&
        validSlugs.has(e.target_slug) &&
        e.source_slug !== e.target_slug,
    );
  } catch (err) {
    console.warn(`  Parse failure: ${(err as Error).message}`);
    console.warn(`  Raw (first 500): ${raw.slice(0, 500)}`);
    return [];
  }
}

async function insertEdges(
  edges: DiscoveredEdge[],
  nodesBySlug: Map<string, Node>,
): Promise<number> {
  if (edges.length === 0) return 0;
  const rows = edges.map(e => ({
    source_node: nodesBySlug.get(e.source_slug)!.id,
    target_node: nodesBySlug.get(e.target_slug)!.id,
    edge_type: e.edge_type,
    weight: Math.max(0, Math.min(1, e.weight)),
    evidence: e.evidence?.slice(0, 1000) ?? "",
  }));
  const { error, count } = await sb.from("knowledge_edges").insert(rows, { count: "exact" });
  if (error) {
    console.error("  DB insert error:", error.message);
    return 0;
  }
  return count ?? rows.length;
}

async function main() {
  const args = parseArgs();
  const model = args.opus ? "claude-opus-4-6" : "claude-sonnet-4-6";

  console.log("=== pass3 rerun ===");
  console.log(`model: ${model}`);
  console.log(`dry-run: ${args.dryRun}`);
  console.log(`specific-slugs: ${args.specificSlugs ? args.specificSlugs.join(", ") : "(auto: all zero-edge, non-stub)"}`);
  console.log();

  const { allNodes, degree } = await loadNodesAndEdgeCounts();
  const nodesBySlug = new Map(allNodes.map(n => [n.slug, n]));
  const validSlugs = new Set(allNodes.map(n => n.slug));

  // Select target nodes
  let targets: Node[];
  if (args.specificSlugs) {
    targets = allNodes.filter(n => args.specificSlugs!.includes(n.slug));
    const missing = args.specificSlugs.filter(s => !targets.find(n => n.slug === s));
    if (missing.length) console.warn(`Slugs not in DB: ${missing.join(", ")}`);
  } else {
    targets = allNodes.filter(n => (degree.get(n.id) ?? 0) === 0 && (n.content?.length ?? 0) >= MIN_CONTENT_CHARS);
  }

  // In dry-run mode, cap to 2 nodes
  if (args.dryRun) targets = targets.slice(0, 2);

  console.log(`Targeting ${targets.length} node(s):`);
  for (const n of targets) {
    console.log(`  - ${n.slug} (${n.node_type}, ${n.content.length} chars)`);
  }
  console.log();

  if (targets.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  // Build the nodeIndex (all 89 nodes — so Opus/Sonnet knows the full target space)
  const nodeIndex = allNodes.map(n => ({
    slug: n.slug,
    title: n.title,
    type: n.node_type,
    aliases: n.aliases ?? [],
  }));
  const systemPrompt = buildSystemPrompt(nodeIndex);

  let totalEdgesDiscovered = 0;
  let totalEdgesInserted = 0;

  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE);
    const batchLabel = `batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(targets.length / BATCH_SIZE)}`;
    const batchText = batch
      .map(n => `### ${n.title} (${n.slug}, type: ${n.node_type})\n${n.content.slice(0, 3000)}`)
      .join("\n\n===\n\n");

    console.log(`${batchLabel}: ${batch.length} node(s) — ${batch.map(n => n.slug).join(", ")}`);
    const t0 = Date.now();
    const raw = await callModelWithRetry(model, systemPrompt, `Discover edges for these nodes:\n\n${batchText}`, batchLabel);
    const seconds = ((Date.now() - t0) / 1000).toFixed(1);

    const edges = parseEdges(raw, validSlugs);
    // Keep only edges where source is one of the batch nodes
    const batchSlugs = new Set(batch.map(n => n.slug));
    const ownEdges = edges.filter(e => batchSlugs.has(e.source_slug));
    totalEdgesDiscovered += ownEdges.length;
    console.log(`  ${batchLabel}: ${ownEdges.length} edge(s) discovered (${seconds}s)`);

    if (args.dryRun) {
      console.log(`  [DRY RUN] skipping DB insert. First 3 edges:`);
      for (const e of ownEdges.slice(0, 3)) {
        console.log(`    ${e.source_slug} --[${e.edge_type} w=${e.weight}]--> ${e.target_slug}`);
        console.log(`      evidence: ${e.evidence.slice(0, 120)}`);
      }
    } else {
      const inserted = await insertEdges(ownEdges, nodesBySlug);
      totalEdgesInserted += inserted;
      console.log(`  ${batchLabel}: ${inserted}/${ownEdges.length} inserted into knowledge_edges`);
    }

    // Incremental save = already done per batch via insertEdges above.
    // Pace between batches to avoid rate limits
    if (i + BATCH_SIZE < targets.length) await new Promise(r => setTimeout(r, 1000));
  }

  console.log();
  console.log("=== summary ===");
  console.log(`Nodes processed: ${targets.length}`);
  console.log(`Edges discovered: ${totalEdgesDiscovered}`);
  if (!args.dryRun) {
    console.log(`Edges inserted:   ${totalEdgesInserted}`);
    console.log();
    console.log("Next step: re-run the diagnostic to confirm zero-edge count drops:");
    console.log("  npx tsx scripts/diagnose-orphan-edges.ts");
    console.log("Then regenerate the vault so the files pick up the new edges.");
  }
}

main().catch(e => { console.error(e); process.exit(1); });
