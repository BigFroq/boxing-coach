import { createServerClient } from "./supabase";
import { embedText } from "./voyage";

export interface RetrievedChunk {
  content: string;
  source_type: "pdf" | "transcript";
  video_id: string | null;
  video_title: string | null;
  video_url: string | null;
  pdf_file: string | null;
  techniques: string[];
  fighters: string[];
  category: string;
  similarity: number;
}

export async function retrieveChunks(
  query: string,
  options: {
    count?: number;
    categories?: string[];
  } = {}
): Promise<RetrievedChunk[]> {
  const { count = 10, categories } = options;

  const queryEmbedding = await embedText(query);
  const supabase = createServerClient();

  const { data, error } = await (supabase.rpc as Function)("match_chunks", {
    query_embedding: queryEmbedding,
    match_count: count,
    filter_categories: categories ?? null,
  });

  if (error) {
    console.error("RAG retrieval error:", error);
    return [];
  }

  return data as RetrievedChunk[];
}

export function formatChunksForPrompt(chunks: RetrievedChunk[]): string {
  // Prioritize real video/course chunks over concept nodes
  const sorted = [...chunks].sort((a, b) => {
    // Videos first (most citable), then course, then concepts last
    const score = (c: RetrievedChunk) => {
      if (c.source_type === "transcript" && c.video_title) return 3;
      if (c.pdf_file && !c.pdf_file.startsWith("concept:")) return 2;
      return 1;
    };
    return score(b) - score(a);
  });

  return sorted
    .map((chunk) => {
      let source: string;
      if (chunk.source_type === "transcript" && chunk.video_title) {
        source = `[YOUR VIDEO: "${chunk.video_title}" — ${chunk.video_url ?? ""}]`;
      } else if (chunk.pdf_file?.startsWith("concept:")) {
        source = `[KNOWLEDGE BASE: ${chunk.pdf_file.replace("concept:", "")}]`;
      } else if (chunk.pdf_file) {
        source = `[YOUR COURSE: ${chunk.pdf_file}]`;
      } else {
        source = `[Source]`;
      }
      return `${source}\n${chunk.content}`;
    })
    .join("\n\n---\n\n");
}

export interface SourceCitation {
  type: "video" | "course" | "concept";
  title: string;
  url?: string;
  file?: string;
}

export function extractCitations(chunks: RetrievedChunk[]): SourceCitation[] {
  const seen = new Set<string>();
  const citations: SourceCitation[] = [];

  for (const chunk of chunks) {
    const key = chunk.video_id ?? chunk.pdf_file ?? "";
    if (seen.has(key)) continue;
    seen.add(key);

    if (chunk.source_type === "transcript" && chunk.video_title) {
      citations.push({
        type: "video",
        title: chunk.video_title,
        url: chunk.video_url ?? undefined,
      });
    } else if (chunk.pdf_file) {
      citations.push({
        type: "course",
        title: chunk.pdf_file.replace(".md", "").replace(/^\d+-/, "").replace(/-/g, " "),
        file: chunk.pdf_file,
      });
    }
  }

  return citations;
}
