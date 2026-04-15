// scripts/incremental-ingest.ts
// Processes newly added transcripts, chunks them, embeds them,
// and connects them to existing knowledge graph nodes.
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { promises as fs } from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

const CONTENT_DIR = path.join(process.cwd(), "content");
const TRANSCRIPTS_DIR = path.join(CONTENT_DIR, "transcripts");
const CHUNK_TARGET = 2000;
const CHUNK_MAX = 3200;
const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY!;

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// --- Types ---

interface RawChunk {
  content: string;
  source_type: "transcript";
  video_id: string;
  video_title: string;
  video_url: string;
  chunk_index: number;
}

interface ChunkMetadata {
  techniques: string[];
  fighters: string[];
  category: "mechanics" | "analysis" | "drill" | "injury_prevention" | "theory";
}

interface NodeMatch {
  slug: string;
  relevance: "high" | "medium" | "low";
}

interface KnowledgeNode {
  id: string;
  slug: string;
  title: string;
  node_type: string;
}

// --- Chunking (same logic as ingest.ts) ---

function splitTranscript(text: string): string[] {
  const topicBreaks =
    /(?:(?:now let'?s|let me|moving on|next|so now|alright|okay so|the next thing|another thing|number \d))/i;
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    const isTopicShift = topicBreaks.test(sentence.slice(0, 60));
    const wouldExceedMax = (current + " " + sentence).length > CHUNK_MAX;
    const isAtTarget = current.length >= CHUNK_TARGET;

    if (current && (wouldExceedMax || (isAtTarget && isTopicShift))) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current = current ? current + " " + sentence : sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

// --- Find new transcripts ---

async function findNewTranscripts(): Promise<
  Array<{ filePath: string; videoId: string; videoTitle: string; videoUrl: string; text: string }>
> {
  const files = (await fs.readdir(TRANSCRIPTS_DIR)).filter((f) => f.endsWith(".md")).sort();

  // Get all video_ids already in content_chunks
  const { data: existingChunks, error } = await supabase
    .from("content_chunks")
    .select("video_id")
    .eq("source_type", "transcript")
    .not("video_id", "is", null);

  if (error) throw new Error(`Failed to fetch existing chunks: ${error.message}`);

  const existingVideoIds = new Set(
    (existingChunks ?? []).map((c: { video_id: string }) => c.video_id)
  );

  const newTranscripts: Array<{
    filePath: string;
    videoId: string;
    videoTitle: string;
    videoUrl: string;
    text: string;
  }> = [];

  for (const file of files) {
    const filePath = path.join(TRANSCRIPTS_DIR, file);
    const raw = await fs.readFile(filePath, "utf-8");

    const idMatch = raw.match(/\*\*Video ID:\*\* (.+)/m);
    const videoId = idMatch?.[1]?.trim();
    if (!videoId) continue;
    if (existingVideoIds.has(videoId)) continue;

    const titleMatch = raw.match(/^# (.+)/m);
    const urlMatch = raw.match(/\*\*Source:\*\* (.+)/m);
    const transcriptStart = raw.indexOf("## Transcript");
    const transcriptText =
      transcriptStart >= 0 ? raw.slice(transcriptStart + "## Transcript".length).trim() : raw;

    if (!transcriptText || transcriptText.length < 50) continue;

    newTranscripts.push({
      filePath,
      videoId,
      videoTitle: titleMatch?.[1]?.trim() ?? file.replace(/\.md$/, ""),
      videoUrl: urlMatch?.[1]?.trim() ?? "",
      text: transcriptText,
    });
  }

  return newTranscripts;
}

// --- Metadata extraction via Claude ---

async function extractMetadataBatch(chunks: RawChunk[]): Promise<ChunkMetadata[]> {
  const batchSize = 20;
  const allMetadata: ChunkMetadata[] = [];

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const batchPrompt = batch
      .map((c, idx) => `[CHUNK ${idx}]\n${c.content.slice(0, 1500)}`)
      .join("\n\n");

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: `Extract metadata from boxing content chunks. For each chunk, identify:
- techniques: specific boxing techniques mentioned (e.g., "jab", "hook", "uppercut", "kinetic chain", "phase 1", "phase 2", "hip rotation", "follow through", "stance")
- fighters: fighter names mentioned (e.g., "Canelo", "GGG", "Tyson", "Beterbiev")
- category: one of "mechanics" (punch technique/biomechanics), "analysis" (fight breakdown/fighter study), "drill" (exercises/training), "injury_prevention" (shoulder stability/neck/rehab), "theory" (physics/concepts/general principles)

Return a JSON array with one object per chunk, in order. Each object: {"techniques": [...], "fighters": [...], "category": "..."}
Return ONLY the JSON array, no markdown.`,
      messages: [{ role: "user", content: batchPrompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "[]";
    let jsonStr = text;
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();

    try {
      const parsed = JSON.parse(jsonStr) as ChunkMetadata[];
      allMetadata.push(...parsed);
    } catch {
      console.warn(`  Failed to parse metadata for batch starting at ${i}, using defaults`);
      for (const _chunk of batch) {
        void _chunk;
        allMetadata.push({ techniques: [], fighters: [], category: "theory" });
      }
    }

    console.log(`  Metadata: ${Math.min(i + batchSize, chunks.length)}/${chunks.length}`);
  }
  return allMetadata;
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

    if (i + batchSize < texts.length) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  return allEmbeddings;
}

// --- Insert chunks into content_chunks ---

async function insertChunks(
  chunks: RawChunk[],
  metadata: ChunkMetadata[],
  embeddings: number[][]
): Promise<string[]> {
  const insertedIds: string[] = [];
  const batchSize = 50;

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize).map((chunk, idx) => {
      const globalIdx = i + idx;
      return {
        content: chunk.content,
        embedding: JSON.stringify(embeddings[globalIdx]),
        source_type: chunk.source_type,
        video_id: chunk.video_id,
        video_title: chunk.video_title,
        video_url: chunk.video_url,
        pdf_file: null,
        chunk_index: chunk.chunk_index,
        techniques: metadata[globalIdx]?.techniques ?? [],
        fighters: metadata[globalIdx]?.fighters ?? [],
        category: metadata[globalIdx]?.category ?? "theory",
        char_count: chunk.content.length,
      };
    });

    const { data, error } = await supabase
      .from("content_chunks")
      .insert(batch)
      .select("id");

    if (error) {
      console.error(`  Insert error at batch ${i}: ${error.message}`);
    } else {
      const ids = (data ?? []).map((row: { id: string }) => row.id);
      insertedIds.push(...ids);
      console.log(`  Inserted: ${Math.min(i + batchSize, chunks.length)}/${chunks.length}`);
    }
  }

  return insertedIds;
}

// --- Knowledge graph node matching ---

async function fetchExistingNodes(): Promise<KnowledgeNode[]> {
  const { data, error } = await supabase
    .from("knowledge_nodes")
    .select("id, slug, title, node_type");

  if (error) throw new Error(`Failed to fetch knowledge nodes: ${error.message}`);
  return (data ?? []) as KnowledgeNode[];
}

async function matchChunkToNodes(
  chunkContent: string,
  nodes: KnowledgeNode[]
): Promise<NodeMatch[]> {
  if (nodes.length === 0) return [];

  const nodeList = nodes.map((n) => `- ${n.slug} (${n.title})`).join("\n");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: `Given a boxing content chunk and a list of existing knowledge graph nodes, identify which nodes this chunk is related to. Return a JSON array of { slug: string, relevance: "high" | "medium" | "low" }. Only include nodes that are genuinely mentioned or directly relevant. Return ONLY the JSON array, no markdown.`,
    messages: [
      {
        role: "user",
        content: `Chunk content: ${chunkContent.slice(0, 2000)}\n\nExisting nodes:\n${nodeList}`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "[]";
  let jsonStr = text;
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1].trim();

  try {
    const matches = JSON.parse(jsonStr) as NodeMatch[];
    return matches.filter(
      (m) =>
        typeof m.slug === "string" &&
        (m.relevance === "high" || m.relevance === "medium" || m.relevance === "low")
    );
  } catch {
    console.warn("  Failed to parse node matches, skipping");
    return [];
  }
}

async function createSourcedFromEdges(
  chunkIds: string[],
  chunks: RawChunk[],
  nodes: KnowledgeNode[]
): Promise<{ created: number; flaggedConcepts: string[] }> {
  const nodeBySlug = new Map(nodes.map((n) => [n.slug, n]));
  let created = 0;
  const flaggedConcepts: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunkId = chunkIds[i];
    if (!chunkId) continue;

    console.log(`  Matching chunk ${i + 1}/${chunks.length}...`);
    const matches = await matchChunkToNodes(chunks[i].content, nodes);

    const edges: Array<{
      source_node: string;
      target_chunk: string;
      edge_type: string;
      weight: number;
      evidence: string;
    }> = [];

    for (const match of matches) {
      if (match.relevance === "low") continue; // Only high and medium

      const node = nodeBySlug.get(match.slug);
      if (!node) {
        // Node slug from Claude doesn't exist in graph — flag for manual review
        flaggedConcepts.push(match.slug);
        continue;
      }

      const weight = match.relevance === "high" ? 0.9 : 0.6;
      edges.push({
        source_node: node.id,
        target_chunk: chunkId,
        edge_type: "SOURCED_FROM",
        weight,
        evidence: `Incremental ingest: ${match.relevance} relevance match`,
      });
    }

    if (edges.length > 0) {
      const { error } = await supabase.from("knowledge_edges").insert(edges);
      if (error) {
        console.error(`  Failed to create edges for chunk ${i}: ${error.message}`);
      } else {
        created += edges.length;
      }
    }

    // Small delay to avoid rate limiting Claude API
    if (i + 1 < chunks.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return { created, flaggedConcepts: [...new Set(flaggedConcepts)] };
}

// --- Main ---

async function main() {
  console.log("=== Punch Doctor AI — Incremental Ingest ===\n");

  // 1. Find new transcripts
  console.log("1. Scanning for new transcripts...");
  const newTranscripts = await findNewTranscripts();

  if (newTranscripts.length === 0) {
    console.log("   No new transcripts found. Everything is up to date.");
    return;
  }

  console.log(`   Found ${newTranscripts.length} new transcript(s):`);
  for (const t of newTranscripts) {
    console.log(`   - ${t.videoTitle} (${t.videoId})`);
  }
  console.log();

  // 2. Chunk new transcripts
  console.log("2. Chunking transcripts...");
  const allChunks: RawChunk[] = [];

  for (const transcript of newTranscripts) {
    const textChunks = splitTranscript(transcript.text);
    for (let i = 0; i < textChunks.length; i++) {
      allChunks.push({
        content: textChunks[i],
        source_type: "transcript",
        video_id: transcript.videoId,
        video_title: transcript.videoTitle,
        video_url: transcript.videoUrl,
        chunk_index: i,
      });
    }
  }
  console.log(`   Created ${allChunks.length} chunks\n`);

  // 3. Extract metadata via Claude
  console.log("3. Extracting metadata via Claude...");
  const metadata = await extractMetadataBatch(allChunks);
  console.log(`   Metadata extracted for ${metadata.length} chunks\n`);

  // 4. Generate embeddings via Voyage AI
  console.log("4. Generating embeddings via Voyage AI...");
  const embeddings = await embedTexts(allChunks.map((c) => c.content));
  console.log(`   Embeddings generated: ${embeddings.length}\n`);

  // 5. Insert into content_chunks
  console.log("5. Inserting chunks into content_chunks...");
  const chunkIds = await insertChunks(allChunks, metadata, embeddings);
  console.log(`   Inserted ${chunkIds.length} chunks\n`);

  // 6. Connect to knowledge graph
  console.log("6. Connecting chunks to knowledge graph...");
  const existingNodes = await fetchExistingNodes();
  console.log(`   Found ${existingNodes.length} existing knowledge nodes`);

  if (existingNodes.length === 0) {
    console.log("   No knowledge nodes in graph — skipping edge creation.\n");
  } else {
    const { created, flaggedConcepts } = await createSourcedFromEdges(
      chunkIds,
      allChunks,
      existingNodes
    );
    console.log(`   Created ${created} SOURCED_FROM edges`);

    if (flaggedConcepts.length > 0) {
      console.log(`\n   Concepts flagged for manual review (not in graph):`);
      for (const concept of flaggedConcepts) {
        console.log(`   - ${concept}`);
      }
    }
    console.log();
  }

  // 7. Recompute centrality
  console.log("7. Recomputing centrality...");
  const { error: centralityErr } = await supabase.rpc("recompute_centrality");
  if (centralityErr) {
    console.error(`   Centrality recomputation failed: ${centralityErr.message}`);
  } else {
    console.log("   Centrality recomputed.\n");
  }

  // 8. Summary
  console.log("=== Incremental ingest complete! ===");
  console.log(`New transcripts processed: ${newTranscripts.length}`);
  console.log(`Chunks created: ${chunkIds.length}`);
  console.log(`Knowledge nodes in graph: ${existingNodes.length}`);
}

main().catch(console.error);
