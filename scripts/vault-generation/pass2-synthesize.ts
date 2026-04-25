// scripts/vault-generation/pass2-synthesize.ts
// Pass 2: For each node candidate, synthesize a structured concept note from source chunks
import { promises as fs } from "fs";
import path from "path";
import type { NodeCandidate } from "./pass1-extract";
import { callLLM } from "./llm-provider";

export interface SynthesizedNode extends NodeCandidate {
  content: string; // Full structured markdown content
  source_chunk_ids: string[]; // UUIDs of chunks used
}

const CACHE_DIR = path.join(process.cwd(), "scripts", "vault-generation", ".cache");
const SYNTHESIZED_CACHE = path.join(CACHE_DIR, "pass2-synthesized.json");
const DIRTY_SLUGS_FILE = path.join(CACHE_DIR, "dirty-slugs.json");

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";

async function embedText(text: string): Promise<number[]> {
  const res = await fetch(VOYAGE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({ input: [text], model: "voyage-3-lite" }),
  });
  if (!res.ok) throw new Error(`Voyage error: ${res.status}`);
  const data = (await res.json()) as { data: { embedding: number[] }[] };
  return data.data[0].embedding;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findRelevantChunks(
  supabase: any,
  candidate: NodeCandidate
): Promise<{ id: string; content: string; video_title: string | null; pdf_file: string | null; source_type: string }[]> {
  // Vector search using title + aliases
  const searchText = [candidate.title, ...candidate.aliases].join(" ");
  const embedding = await embedText(searchText);

  const { data: vectorResults } = await supabase.rpc("match_chunks", {
    query_embedding: embedding,
    match_count: 15,
    filter_categories: null,
  });

  // Keyword search on content for title and aliases
  const keywords = [candidate.title, ...candidate.aliases];
  const keywordFilter = keywords.map(k => `content.ilike.%${k}%`).join(",");

  const { data: keywordResults } = await supabase
    .from("content_chunks")
    .select("id, content, video_title, pdf_file, source_type")
    .or(keywordFilter)
    .limit(10);

  // Merge and deduplicate
  const seen = new Set<string>();
  const merged: { id: string; content: string; video_title: string | null; pdf_file: string | null; source_type: string }[] = [];

  for (const r of [...(vectorResults ?? []), ...(keywordResults ?? [])]) {
    if (!seen.has(r.id)) {
      seen.add(r.id);
      merged.push(r);
    }
  }

  return merged.slice(0, 15);
}

async function loadJSON<T>(p: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(p, "utf-8")) as T;
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function synthesizeNodes(
  supabase: any,
  candidates: NodeCandidate[]
): Promise<SynthesizedNode[]> {
  console.log("=== Pass 2: Knowledge Synthesis ===\n");

  await fs.mkdir(CACHE_DIR, { recursive: true });

  // Incremental mode: if dirty-slugs.json exists, only re-synthesize those
  // (set by incremental-ingest after new chunks land). Absent = synth all missing.
  const dirtyList = await loadJSON<string[]>(DIRTY_SLUGS_FILE);
  const dirtySlugs = dirtyList ? new Set(dirtyList) : null;

  // Resume: load any partial results from prior run. In incremental mode,
  // drop dirty slugs from the carried set so they get re-synthesized.
  const priorAll = (await loadJSON<SynthesizedNode[]>(SYNTHESIZED_CACHE)) ?? [];
  const existing = dirtySlugs
    ? priorAll.filter((n) => !dirtySlugs.has(n.slug))
    : priorAll;
  const doneSlugs = new Set(existing.map((n) => n.slug));

  const pending = candidates.filter((c) => {
    if (doneSlugs.has(c.slug)) return false;
    if (dirtySlugs && !dirtySlugs.has(c.slug)) return false;
    return true;
  });

  if (existing.length > 0) {
    console.log(`  Resuming: ${existing.length} already synthesized, ${pending.length} remaining`);
  }
  if (dirtySlugs) {
    console.log(`  Incremental mode: ${dirtySlugs.size} dirty slug(s), ${pending.length} pending`);
  }
  if (pending.length === 0) {
    console.log("  Nothing to synthesize.\n");
    return existing;
  }

  const synthesized = [...existing];
  const provider = process.env.SYNTHESIS_PROVIDER ?? "sdk";
  const model = process.env.SYNTHESIS_MODEL ?? "claude-opus-4-6";
  console.log(`  Provider: ${provider}, model: ${model}\n`);

  for (let i = 0; i < pending.length; i++) {
    const candidate = pending[i];
    console.log(`  [${i + 1}/${pending.length}] Synthesizing: ${candidate.title}`);

    const relevantChunks = await findRelevantChunks(supabase, candidate);
    if (relevantChunks.length === 0) {
      console.warn(`    No chunks found for "${candidate.title}", skipping`);
      continue;
    }

    const chunksText = relevantChunks
      .map((c, idx) => {
        const source =
          c.source_type === "transcript" ? `[Video: ${c.video_title}]` : `[Course: ${c.pdf_file}]`;
        return `[SOURCE ${idx + 1}] ${source}\n${c.content}`;
      })
      .join("\n\n---\n\n");

    const systemPrompt = `You are synthesizing a knowledge node for Dr. Alex Wiant's boxing methodology knowledge graph.

Output ONLY the markdown content described below. No preamble, no "Here is...", no permission requests, no closing remarks. Your entire response must start with "# ${candidate.title}" and contain only the note itself.

Create a structured concept note about "${candidate.title}" (type: ${candidate.node_type}).

Follow this EXACT format:

# ${candidate.title}

## Summary
[2-3 sentences capturing the essence of what Alex teaches about this topic]

## What Alex Teaches
[3-5 paragraphs synthesizing ALL relevant information from the source material. Be specific and technical. Use Alex's exact terminology, analogies (baseball pitch, tennis serve, golf swing), and framework. Do NOT add information Alex hasn't taught.]

## Key Quotes
> "Exact quote from source material..."
> — Video/Course title

[Include 2-4 direct quotes that capture Alex's voice]

## Common Mistakes
- [Specific mistake Alex corrects, if applicable]
[List 2-5 if the topic has common errors. Omit this section entirely if not applicable.]

## Connections
[Leave this section empty — it will be filled in Pass 3]

## Sources
[List each source chunk used, formatted as:]
- [[src/VIDEO_ID]] — Video title
- [[src/PDF_FILE]] — Course section title

Rules:
- Preserve Alex's EXACT voice, terminology, and analogies
- Every claim must be traceable to the source material provided
- Do NOT invent content Alex hasn't said
- Be comprehensive — use ALL relevant source material
- Key Quotes must be verbatim from the sources (or very close paraphrases clearly marked)`;

    let content = "";
    let ok = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        content = await callLLM({
          system: systemPrompt,
          user: `Synthesize everything about "${candidate.title}" from these source chunks:\n\n${chunksText}`,
          model,
          maxTokens: 4096,
        });
        // Strip any persona preamble (CLI provider can inject explanatory framing)
        const titleHeading = `# ${candidate.title}`;
        const headingIdx = content.indexOf(titleHeading);
        if (headingIdx > 0) content = content.slice(headingIdx);
        // Strip surrounding code fences if model wrapped the markdown
        content = content.replace(/^```(?:markdown)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
        ok = true;
        break;
      } catch (err) {
        if (attempt < 2) {
          console.warn(`    Retry ${attempt + 1} for "${candidate.title}" (${(err as Error).message?.slice(0, 80)})`);
          await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
        } else {
          console.error(`    Failed after 3 attempts: "${candidate.title}", skipping`);
        }
      }
    }
    if (!ok) continue;

    synthesized.push({
      ...candidate,
      content,
      source_chunk_ids: relevantChunks.map((c) => c.id),
    });

    // Save after every node so a crash doesn't lose the last batch
    await fs.writeFile(SYNTHESIZED_CACHE, JSON.stringify(synthesized, null, 2));

    // Rate limiting — small delay between calls
    if (i < pending.length - 1) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  console.log(`\nSynthesized ${synthesized.length} nodes total (${synthesized.length - existing.length} new this run)\n`);
  return synthesized;
}
