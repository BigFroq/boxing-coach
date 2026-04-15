import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function embedText(text: string): Promise<number[]> {
  const res = await fetch(VOYAGE_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.VOYAGE_API_KEY}` },
    body: JSON.stringify({ input: [text], model: "voyage-3-lite" }),
  });
  const data = await res.json();
  return data.data[0].embedding;
}

async function debugQuery(query: string, mustContain: string[], mustNotContain: string[]) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Query: "${query}"`);
  console.log(`Must contain: ${mustContain.join(", ")}`);
  console.log(`Must NOT contain: ${mustNotContain.join(", ")}`);
  console.log(`${"=".repeat(60)}`);

  const emb = await embedText(query);

  // Vector search
  const { data: vChunks } = await sb.rpc("match_chunks", {
    query_embedding: emb, match_count: 12, filter_categories: null,
  });
  console.log(`\nVector search (${vChunks?.length} results):`);
  for (const c of (vChunks || []).slice(0, 8)) {
    const title = ((c as any).video_title || (c as any).pdf_file || "?").slice(0, 55);
    const content = (c as any).content?.slice(0, 100) || "";
    const hasMust = mustContain.filter(k => content.toLowerCase().includes(k.toLowerCase()) || title.toLowerCase().includes(k.toLowerCase()));
    const hasNot = mustNotContain.filter(k => content.toLowerCase().includes(k.toLowerCase()) || title.toLowerCase().includes(k.toLowerCase()));
    console.log(`  sim=${(c as any).similarity?.toFixed(3)} | ${title}`);
    if (hasMust.length) console.log(`    ✓ contains: ${hasMust.join(", ")}`);
    if (hasNot.length) console.log(`    ✗ unwanted: ${hasNot.join(", ")}`);
  }

  // Graph search
  const { data: gResults, error } = await sb.rpc("search_graph", {
    query_embedding: emb,
    entry_keywords: mustContain,
    max_hops: 2, max_results: 12,
  });
  if (error) { console.log(`\nGraph search ERROR: ${error.message}`); return; }
  console.log(`\nGraph search (${gResults?.length} results):`);
  for (const r of (gResults || []).slice(0, 8)) {
    const title = ((r as any).title || "?").slice(0, 55);
    const content = (r as any).content?.slice(0, 100) || "";
    const hasMust = mustContain.filter(k => content.toLowerCase().includes(k.toLowerCase()) || title.toLowerCase().includes(k.toLowerCase()));
    const hasNot = mustNotContain.filter(k => content.toLowerCase().includes(k.toLowerCase()) || title.toLowerCase().includes(k.toLowerCase()));
    console.log(`  [${(r as any).item_type}] score=${(r as any).graph_score?.toFixed(3)} | ${title}`);
    if (hasMust.length) console.log(`    ✓ contains: ${hasMust.join(", ")}`);
    if (hasNot.length) console.log(`    ✗ unwanted: ${hasNot.join(", ")}`);
  }
}

async function main() {
  // The two failures
  await debugQuery("How does Beterbiev generate power?", ["beterbiev", "power"], ["neck training"]);
  await debugQuery("How to wrap hands for boxing", ["wrap", "hand"], ["beterbiev"]);

  // Additional stress tests
  await debugQuery("What's the difference between a jab and a straight?", ["jab", "straight"], []);
  await debugQuery("How does Mike Tyson generate knockout power?", ["tyson", "power"], []);
  await debugQuery("Shoulder stability exercises for fighters", ["shoulder", "stability"], []);
  await debugQuery("How to throw a proper left hook", ["hook"], []);
}

main().catch(e => console.error(e));
