// scripts/ppb2-node-tool.ts
// Helper for the ultracode PPB 2.0 workflow: lets synthesis agents work per-node
// without touching the shared pipeline caches (dirty-slugs.json, pass2-synthesized.json),
// which another session keeps rewriting.
//
//   dump <slug>                       → JSON {candidate, currentContent, chunks[]} on stdout
//   apply <slug> <mdfile>             → embed + update knowledge_nodes + render vault/*.md
//   apply <slug> <mdfile> --create-type=concept --title="Athletic Center" [--aliases="a,b"]
//   edges <slug> <jsonfile>           → insert typed edges [{target_slug,edge_type,weight,evidence}] + render
//
// DB writes are per-row on distinct slugs → safe under 16-wide parallelism.

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { promises as fs } from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { writeVaultFiles } from "./vault-generation/write-vault";
import type { SynthesizedNode } from "./vault-generation/pass2-synthesize";
import type { DiscoveredEdge } from "./vault-generation/pass3-edges";

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const CANDIDATES_CACHE = path.join(process.cwd(), "scripts", "vault-generation", ".cache", "pass1-candidates.json");

async function embed(text: string, attempts = 5): Promise<number[]> {
  for (let i = 0; i < attempts; i++) {
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.VOYAGE_API_KEY}` },
      body: JSON.stringify({ input: [text.slice(0, 8000)], model: "voyage-3-lite" }),
    });
    if (res.ok) {
      const data = (await res.json()) as { data: { embedding: number[] }[] };
      return data.data[0].embedding;
    }
    if (res.status === 429 && i < attempts - 1) {
      await new Promise((r) => setTimeout(r, (15 + 15 * i) * 1000));
      continue;
    }
    throw new Error(`Voyage error ${res.status}: ${await res.text()}`);
  }
  throw new Error("embed: retries exhausted");
}

async function renderNode(slug: string) {
  const { data: nodeRows, error: nErr } = await sb
    .from("knowledge_nodes")
    .select("id, slug, title, node_type, content, aliases");
  if (nErr) throw nErr;
  const edgeRows: Array<{ source_node: string; target_node: string | null; target_chunk: string | null; edge_type: string; weight: number | null; evidence: string | null }> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("knowledge_edges")
      .select("source_node, target_node, target_chunk, edge_type, weight, evidence")
      .range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    edgeRows.push(...data);
    if (data.length < 1000) break;
  }
  const idToSlug = new Map((nodeRows ?? []).map((n) => [n.id, n.slug]));
  const nodes: SynthesizedNode[] = (nodeRows ?? []).map((n) => ({
    title: n.title, slug: n.slug, node_type: n.node_type, aliases: n.aliases ?? [],
    description: "", content: n.content, source_chunk_ids: [],
  }));
  const edges: DiscoveredEdge[] = edgeRows
    .map((e) => ({
      source_slug: idToSlug.get(e.source_node) ?? "",
      target_slug: e.target_node ? idToSlug.get(e.target_node) ?? null : null,
      target_chunk_id: e.target_chunk ?? null,
      edge_type: e.edge_type as DiscoveredEdge["edge_type"],
      weight: e.weight ?? 0.8,
      evidence: e.evidence ?? "",
    }))
    .filter((e) => e.source_slug);
  await writeVaultFiles(nodes, edges, { onlySlugs: new Set([slug]) });
}

async function cmdDump(slug: string) {
  const candidates = JSON.parse(await fs.readFile(CANDIDATES_CACHE, "utf-8")) as Array<{
    title: string; slug: string; node_type: string; aliases: string[]; description: string;
  }>;
  const candidate = candidates.find((c) => c.slug === slug) ?? null;
  const { data: node } = await sb.from("knowledge_nodes").select("title, node_type, aliases, content").eq("slug", slug).maybeSingle();

  const title = node?.title ?? candidate?.title ?? slug;
  const aliases: string[] = (node?.aliases as string[]) ?? candidate?.aliases ?? [];
  const searchText = [title, ...aliases].join(" ");
  const emb = await embed(searchText);

  const { data: vectorResults } = await sb.rpc("match_chunks", {
    query_embedding: emb, match_count: 15, filter_categories: null,
  });
  const keywordFilter = [title, ...aliases].map((k) => `content.ilike.%${k}%`).join(",");
  const { data: keywordResults } = await sb
    .from("content_chunks")
    .select("id, content, video_title, pdf_file, source_type")
    .or(keywordFilter)
    .limit(10);

  const seen = new Set<string>();
  const chunks: Array<{ id: string; content: string; source: string }> = [];
  for (const r of [...(vectorResults ?? []), ...(keywordResults ?? [])]) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    chunks.push({
      id: r.id,
      content: r.content,
      source: r.source_type === "transcript" ? `[Video: ${r.video_title}]` : `[Course: ${r.pdf_file}]`,
    });
    if (chunks.length >= 15) break;
  }

  console.log(JSON.stringify({
    candidate: candidate ?? { title, slug, node_type: node?.node_type ?? "concept", aliases, description: "" },
    currentContent: node?.content ?? null,
    chunks,
  }, null, 2));
}

async function cmdApply(slug: string, mdFile: string, argv: string[]) {
  const content = (await fs.readFile(mdFile, "utf-8")).trim();
  if (!content.startsWith("# ")) throw new Error("markdown must start with '# Title'");
  const emb = await embed(content);

  const { data: existing } = await sb.from("knowledge_nodes").select("id").eq("slug", slug).maybeSingle();
  if (existing) {
    const { error } = await sb
      .from("knowledge_nodes")
      .update({ content, embedding: JSON.stringify(emb), updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) throw error;
    console.log(`updated: ${slug}`);
  } else {
    const typeArg = argv.find((a) => a.startsWith("--create-type="))?.split("=")[1];
    const titleArg = argv.find((a) => a.startsWith("--title="))?.split("=").slice(1).join("=");
    if (!typeArg || !titleArg) throw new Error(`node ${slug} missing — pass --create-type= and --title=`);
    const aliasArg = argv.find((a) => a.startsWith("--aliases="))?.split("=")[1];
    const { error } = await sb.from("knowledge_nodes").insert({
      slug, title: titleArg, node_type: typeArg,
      aliases: aliasArg ? aliasArg.split(",").map((s) => s.trim()) : [],
      content, embedding: JSON.stringify(emb), centrality: 0,
    });
    if (error) throw error;
    console.log(`created: ${slug}`);
  }
  await renderNode(slug);
  console.log(`rendered vault file for ${slug}`);
}

async function cmdEdges(slug: string, jsonFile: string) {
  const wanted = JSON.parse(await fs.readFile(jsonFile, "utf-8")) as Array<{
    target_slug: string; edge_type: string; weight?: number; evidence?: string;
  }>;
  const { data: source } = await sb.from("knowledge_nodes").select("id").eq("slug", slug).single();
  if (!source) throw new Error(`source node ${slug} not found`);
  const targetSlugs = wanted.map((w) => w.target_slug);
  const { data: targets } = await sb.from("knowledge_nodes").select("id, slug").in("slug", targetSlugs);
  const bySlug = new Map((targets ?? []).map((t) => [t.slug, t.id]));

  const rows = [];
  const missing: string[] = [];
  for (const w of wanted) {
    const tid = bySlug.get(w.target_slug);
    if (!tid) { missing.push(w.target_slug); continue; }
    rows.push({
      source_node: source.id, target_node: tid, edge_type: w.edge_type,
      weight: w.weight ?? 0.8, evidence: w.evidence ?? "PPB 2.0 ultracode edges",
    });
  }
  if (rows.length) {
    const { error } = await sb.from("knowledge_edges").insert(rows);
    if (error) throw error;
  }
  console.log(`edges inserted: ${rows.length}${missing.length ? ` | missing targets: ${missing.join(", ")}` : ""}`);
  await renderNode(slug);
}

async function main() {
  const [cmd, slug, file, ...rest] = process.argv.slice(2);
  if (cmd === "dump" && slug) return cmdDump(slug);
  if (cmd === "apply" && slug && file) return cmdApply(slug, file, rest);
  if (cmd === "edges" && slug && file) return cmdEdges(slug, file);
  throw new Error("usage: ppb2-node-tool.ts dump <slug> | apply <slug> <mdfile> [--create-type= --title= --aliases=] | edges <slug> <jsonfile>");
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
