// scripts/purge-video.ts
// Deletes all content_chunks for a video_id plus their knowledge_edges,
// so incremental-ingest re-processes the (corrected) transcript.
// Usage: npx tsx scripts/purge-video.ts <video_id>
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const videoId = process.argv[2];
  if (!videoId) {
    console.error("Usage: npx tsx scripts/purge-video.ts <video_id>");
    process.exit(1);
  }

  const { data: chunks, error: chunkErr } = await supabase
    .from("content_chunks")
    .select("id")
    .eq("video_id", videoId);
  if (chunkErr) throw new Error(`chunk lookup failed: ${chunkErr.message}`);

  const ids = (chunks ?? []).map((c: { id: string }) => c.id);
  console.log(`Found ${ids.length} chunks for video_id=${videoId}`);
  if (ids.length === 0) return;

  const { error: edgeErr, count: edgeCount } = await supabase
    .from("knowledge_edges")
    .delete({ count: "exact" })
    .in("target_chunk", ids);
  if (edgeErr) throw new Error(`edge delete failed: ${edgeErr.message}`);
  console.log(`Deleted ${edgeCount} knowledge_edges`);

  const { error: delErr, count: delCount } = await supabase
    .from("content_chunks")
    .delete({ count: "exact" })
    .eq("video_id", videoId);
  if (delErr) throw new Error(`chunk delete failed: ${delErr.message}`);
  console.log(`Deleted ${delCount} content_chunks`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
