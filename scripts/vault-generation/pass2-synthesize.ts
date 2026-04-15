// scripts/vault-generation/pass2-synthesize.ts
// Pass 2: For each node candidate, synthesize a structured concept note from source chunks
import Anthropic from "@anthropic-ai/sdk";
import type { NodeCandidate } from "./pass1-extract";

export interface SynthesizedNode extends NodeCandidate {
  content: string; // Full structured markdown content
  source_chunk_ids: string[]; // UUIDs of chunks used
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function synthesizeNodes(
  supabase: any,
  candidates: NodeCandidate[]
): Promise<SynthesizedNode[]> {
  console.log("=== Pass 2: Knowledge Synthesis ===\n");

  const synthesized: SynthesizedNode[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    console.log(`  [${i + 1}/${candidates.length}] Synthesizing: ${candidate.title}`);

    const relevantChunks = await findRelevantChunks(supabase, candidate);

    if (relevantChunks.length === 0) {
      console.warn(`    No chunks found for "${candidate.title}", skipping`);
      continue;
    }

    const chunksText = relevantChunks
      .map((c, idx) => {
        const source = c.source_type === "transcript"
          ? `[Video: ${c.video_title}]`
          : `[Course: ${c.pdf_file}]`;
        return `[SOURCE ${idx + 1}] ${source}\n${c.content}`;
      })
      .join("\n\n---\n\n");

    const response = await anthropic.messages.create({
      model: "claude-opus-4-6-20250515",
      max_tokens: 4096,
      system: `You are synthesizing a knowledge node for Dr. Alex Wiant's boxing methodology knowledge graph.

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
- Key Quotes must be verbatim from the sources (or very close paraphrases clearly marked)`,
      messages: [
        {
          role: "user",
          content: `Synthesize everything about "${candidate.title}" from these source chunks:\n\n${chunksText}`,
        },
      ],
    });

    const content = response.content[0].type === "text" ? response.content[0].text : "";

    synthesized.push({
      ...candidate,
      content,
      source_chunk_ids: relevantChunks.map(c => c.id),
    });

    // Rate limiting — small delay between Opus calls
    if (i < candidates.length - 1) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log(`\nSynthesized ${synthesized.length} nodes\n`);
  return synthesized;
}
