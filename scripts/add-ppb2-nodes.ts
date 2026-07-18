// scripts/add-ppb2-nodes.ts
// One-shot bootstrap for the PPB 2.0 concepts that have no existing knowledge node.
// Inserts skeleton rows + registers them as pass1 candidates + marks them dirty,
// so the normal resynth-dirty pass (pass2) writes their real content from the
// newly-ingested ppb2-* chunks. Also adds PPB 2.0 aliases to two existing nodes.
//
// Idempotent: skips nodes/candidates that already exist, merges aliases.
//
// Run: npx tsx scripts/add-ppb2-nodes.ts

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { promises as fs } from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const CACHE_DIR = path.join(process.cwd(), "scripts", "vault-generation", ".cache");
const CANDIDATES_CACHE = path.join(CACHE_DIR, "pass1-candidates.json");
const DIRTY_SLUGS_FILE = path.join(CACHE_DIR, "dirty-slugs.json");

interface NodeCandidate {
  title: string;
  slug: string;
  node_type: string;
  aliases: string[];
  description: string;
}

const NEW_NODES: NodeCandidate[] = [
  {
    title: "Athletic Center",
    slug: "athletic-center",
    node_type: "concept",
    aliases: ["hara", "dantian", "lower dantian", "leading with the center"],
    description:
      "The point about two inches below the belly button in the pelvis (hara/dantian) that the body organizes rotational force around — the hub and source of movement and power in the KIMs system, distinct from the center of mass.",
  },
  {
    title: "Triple Threat Stance",
    slug: "triple-threat-stance",
    node_type: "concept",
    aliases: ["triple threat position", "alive stance", "ready athlete stance"],
    description:
      "Adapting basketball's triple threat position to boxing: a stance that can equally defend, attack, or move off the line — alive and ready, never frozen, with guy-wire muscle tension constantly loading and unloading.",
  },
  {
    title: "Natural vs Dynamic Loading",
    slug: "natural-vs-dynamic-loading",
    node_type: "concept",
    aliases: ["natural loading", "dynamic loading", "touch and go loading", "quick dip"],
    description:
      "PPB 2.0's two loading modes: natural loading created automatically whenever weight shifts onto a leg (launch touch-and-go), and dynamic loading — an intentional quick one-inch dip that re-loads a leg with elastic energy for extra speed and power.",
  },
  {
    title: "Loading Through Movement",
    slug: "loading-through-movement",
    node_type: "concept",
    aliases: ["linking defense and offense", "defensive loading", "hidden loading"],
    description:
      "Hiding significant elastic loading inside defensive movements (slips, bobs, weaves) whose larger range of motion loads legs and core more than a compact punch could — turning defense into a ballistic launch position.",
  },
];

// PPB 2.0 renames/extends these existing nodes — add the new aliases so pass2's
// keyword search pulls the ppb2 chunks in, and queue them dirty.
const ALIAS_ADDITIONS: Record<string, string[]> = {
  "integrated-mechanics": ["Kinetic Integrated Mechanics", "KIMs", "KIMs system"],
  "monkey-drum-drill": ["spaghetti arms", "shot shaping"],
};

async function embed(text: string): Promise<number[]> {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({ input: [text], model: "voyage-3-lite" }),
  });
  if (!res.ok) throw new Error(`Voyage error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { data: { embedding: number[] }[] };
  return data.data[0].embedding;
}

async function main() {
  const dirty = new Set<string>(JSON.parse(await fs.readFile(DIRTY_SLUGS_FILE, "utf-8")));
  const candidates: NodeCandidate[] = JSON.parse(await fs.readFile(CANDIDATES_CACHE, "utf-8"));
  const candidateSlugs = new Set(candidates.map((c) => c.slug));

  // 1. Skeleton nodes
  for (const n of NEW_NODES) {
    const { data: existing } = await sb.from("knowledge_nodes").select("id").eq("slug", n.slug).maybeSingle();
    if (existing) {
      console.log(`node exists: ${n.slug} — skipping insert`);
    } else {
      const placeholder = `# ${n.title}\n\n## Summary\n${n.description}\n`;
      const embedding = await embed(`${n.title}\n\n${placeholder}`);
      const { error } = await sb.from("knowledge_nodes").insert({
        slug: n.slug,
        title: n.title,
        node_type: n.node_type,
        content: placeholder,
        aliases: n.aliases,
        embedding: JSON.stringify(embedding),
        centrality: 0,
      });
      if (error) throw new Error(`insert ${n.slug}: ${error.message}`);
      console.log(`inserted skeleton: ${n.slug}`);
    }
    if (!candidateSlugs.has(n.slug)) {
      candidates.push(n);
      console.log(`registered candidate: ${n.slug}`);
    }
    dirty.add(n.slug);
  }

  // 2. Alias additions on existing nodes (DB + candidates cache), queue dirty
  for (const [slug, extra] of Object.entries(ALIAS_ADDITIONS)) {
    const { data: node, error } = await sb.from("knowledge_nodes").select("id, aliases").eq("slug", slug).single();
    if (error || !node) {
      console.warn(`alias target missing: ${slug}`);
      continue;
    }
    const merged = [...new Set([...(node.aliases ?? []), ...extra])];
    const { error: upErr } = await sb.from("knowledge_nodes").update({ aliases: merged }).eq("id", node.id);
    if (upErr) throw new Error(`alias update ${slug}: ${upErr.message}`);
    const cand = candidates.find((c) => c.slug === slug);
    if (cand) cand.aliases = [...new Set([...cand.aliases, ...extra])];
    dirty.add(slug);
    console.log(`aliases updated: ${slug} → ${merged.join(", ")}`);
  }

  await fs.writeFile(CANDIDATES_CACHE, JSON.stringify(candidates, null, 2));
  await fs.writeFile(DIRTY_SLUGS_FILE, JSON.stringify([...dirty], null, 2));
  console.log(`\ncandidates: ${candidates.length} total; dirty queue: ${dirty.size} slugs`);
  console.log("Next: SYNTHESIS_PROVIDER=cli SYNTHESIS_MODEL=claude-fable-5 npx tsx scripts/resynth-dirty.ts");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
