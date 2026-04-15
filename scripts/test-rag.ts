import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";

async function embedText(text: string): Promise<number[]> {
  const res = await fetch(VOYAGE_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.VOYAGE_API_KEY}` },
    body: JSON.stringify({ input: [text], model: "voyage-3-lite" }),
  });
  const data = await res.json();
  return data.data[0].embedding;
}

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const query = "How does Canelo use kinetic chains in his jab?";

  console.log("=== Vector search on content_chunks ===");
  const emb = await embedText(query);
  const { data: vChunks } = await sb.rpc("match_chunks", {
    query_embedding: emb,
    match_count: 5,
    filter_categories: null,
  });
  for (const c of (vChunks || [])) {
    console.log(`  ${((c as any).video_title || (c as any).pdf_file || '?').slice(0, 60)} | sim: ${(c as any).similarity?.toFixed(3)}`);
  }

  console.log("\n=== Graph search ===");
  const { data: gResults, error } = await sb.rpc("search_graph", {
    query_embedding: emb,
    entry_keywords: ["canelo", "jab", "kinetic chains"],
    max_hops: 2,
    max_results: 10,
  });
  if (error) console.error("Graph error:", error.message);
  for (const r of (gResults || [])) {
    console.log(`  [${(r as any).item_type}] ${((r as any).title || '?').slice(0, 50)} | score: ${(r as any).graph_score?.toFixed(3)}`);
  }
}

main().catch(e => console.error(e.message));
