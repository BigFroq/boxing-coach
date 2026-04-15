// scripts/ingest.ts
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { promises as fs } from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { VoyageAIClient } from "voyageai";

const CONTENT_DIR = path.join(process.cwd(), "content");
const CHUNK_TARGET = 2000;
const CHUNK_MAX = 3200;

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const voyage = new VoyageAIClient({
  apiKey: process.env.VOYAGE_API_KEY,
});

interface RawChunk {
  content: string;
  source_type: "pdf" | "transcript";
  video_id?: string;
  video_title?: string;
  video_url?: string;
  pdf_file?: string;
  chunk_index: number;
}

function splitTranscript(text: string): string[] {
  const topicBreaks = /(?:(?:now let'?s|let me|moving on|next|so now|alright|okay so|the next thing|another thing|number \d))/i;
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

async function loadPdfChunks(): Promise<RawChunk[]> {
  const pdfDir = path.join(CONTENT_DIR, "pdf-chunks");
  const files = (await fs.readdir(pdfDir)).filter((f) => f.endsWith(".md")).sort();
  const chunks: RawChunk[] = [];
  for (const file of files) {
    const content = await fs.readFile(path.join(pdfDir, file), "utf-8");
    chunks.push({ content, source_type: "pdf", pdf_file: file, chunk_index: 0 });
  }
  console.log(`Loaded ${chunks.length} PDF chunks`);
  return chunks;
}

async function loadTranscriptChunks(): Promise<RawChunk[]> {
  const transcriptDir = path.join(CONTENT_DIR, "transcripts");
  const files = (await fs.readdir(transcriptDir)).filter((f) => f.endsWith(".md")).sort();
  const chunks: RawChunk[] = [];

  for (const file of files) {
    const raw = await fs.readFile(path.join(transcriptDir, file), "utf-8");
    const titleMatch = raw.match(/^# (.+)/m);
    const idMatch = raw.match(/\*\*Video ID:\*\* (.+)/m);
    const urlMatch = raw.match(/\*\*Source:\*\* (.+)/m);
    const transcriptStart = raw.indexOf("## Transcript");
    const transcriptText = transcriptStart >= 0
      ? raw.slice(transcriptStart + "## Transcript".length).trim()
      : raw;
    if (!transcriptText || transcriptText.length < 50) continue;

    const textChunks = splitTranscript(transcriptText);
    for (let i = 0; i < textChunks.length; i++) {
      chunks.push({
        content: textChunks[i],
        source_type: "transcript",
        video_id: idMatch?.[1]?.trim(),
        video_title: titleMatch?.[1]?.trim(),
        video_url: urlMatch?.[1]?.trim(),
        chunk_index: i,
      });
    }
  }
  console.log(`Loaded ${chunks.length} transcript chunks from ${files.length} videos`);
  return chunks;
}

interface ChunkMetadata {
  techniques: string[];
  fighters: string[];
  category: "mechanics" | "analysis" | "drill" | "injury_prevention" | "theory";
}

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
      console.warn(`Failed to parse metadata for batch starting at ${i}, using defaults`);
      for (const _ of batch) {
        allMetadata.push({ techniques: [], fighters: [], category: "theory" });
      }
    }

    console.log(`  Metadata: ${Math.min(i + batchSize, chunks.length)}/${chunks.length}`);
  }
  return allMetadata;
}

async function embedWithRetry(batch: string[], maxRetries = 5): Promise<number[][]> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await voyage.embed({ input: batch, model: "voyage-3-lite" });
      return result.data!.map((item) => item.embedding!);
    } catch (err: unknown) {
      const is429 = err && typeof err === "object" && "statusCode" in err && (err as { statusCode: number }).statusCode === 429;
      if (is429 && attempt < maxRetries - 1) {
        const delay = 30 + attempt * 15; // 30s, 45s, 60s, 75s
        console.log(`  Rate limited (attempt ${attempt + 1}), waiting ${delay}s...`);
        await new Promise((r) => setTimeout(r, delay * 1000));
      } else {
        throw err;
      }
    }
  }
  throw new Error("Max retries exceeded");
}

async function embedChunks(chunks: RawChunk[]): Promise<number[][]> {
  const texts = chunks.map((c) => c.content);
  // Free tier: 3 RPM, 10K TPM — use tiny batches with generous delay
  const batchSize = 4;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const embeddings = await embedWithRetry(batch);
    allEmbeddings.push(...embeddings);
    console.log(`  Embedded: ${Math.min(i + batchSize, texts.length)}/${texts.length}`);
    // 25s delay between calls (3 RPM = 1 per 20s, add buffer)
    if (i + batchSize < texts.length) {
      await new Promise((r) => setTimeout(r, 25000));
    }
  }
  return allEmbeddings;
}

async function upsertChunks(
  chunks: RawChunk[],
  metadata: ChunkMetadata[],
  embeddings: number[][]
): Promise<void> {
  const { error: deleteError } = await supabase
    .from("content_chunks")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (deleteError) console.warn("Delete error:", deleteError.message);

  const batchSize = 50;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize).map((chunk, idx) => {
      const globalIdx = i + idx;
      return {
        content: chunk.content,
        embedding: JSON.stringify(embeddings[globalIdx]),
        source_type: chunk.source_type,
        video_id: chunk.video_id ?? null,
        video_title: chunk.video_title ?? null,
        video_url: chunk.video_url ?? null,
        pdf_file: chunk.pdf_file ?? null,
        chunk_index: chunk.chunk_index,
        techniques: metadata[globalIdx].techniques,
        fighters: metadata[globalIdx].fighters,
        category: metadata[globalIdx].category,
        char_count: chunk.content.length,
      };
    });

    const { error } = await supabase.from("content_chunks").insert(batch);
    if (error) {
      console.error(`Insert error at batch ${i}:`, error.message);
    } else {
      console.log(`  Inserted: ${Math.min(i + batchSize, chunks.length)}/${chunks.length}`);
    }
  }
}

async function main() {
  console.log("=== Punch Doctor AI — Content Ingest ===\n");

  console.log("1. Loading content...");
  const pdfChunks = await loadPdfChunks();
  const transcriptChunks = await loadTranscriptChunks();
  const allChunks = [...pdfChunks, ...transcriptChunks];
  console.log(`Total chunks: ${allChunks.length}\n`);

  console.log("2. Extracting metadata via Claude...");
  const metadata = await extractMetadataBatch(allChunks);
  console.log(`Metadata extracted for ${metadata.length} chunks\n`);

  console.log("3. Generating embeddings via Voyage AI...");
  const embeddings = await embedChunks(allChunks);
  console.log(`Embeddings generated: ${embeddings.length}\n`);

  console.log("4. Upserting to Supabase...");
  await upsertChunks(allChunks, metadata, embeddings);

  console.log("\n=== Ingest complete! ===");
  console.log(`PDF chunks: ${pdfChunks.length}`);
  console.log(`Transcript chunks: ${transcriptChunks.length}`);
  console.log(`Total: ${allChunks.length}`);
}

main().catch(console.error);
