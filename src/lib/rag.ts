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

  const { data, error } = await supabase.rpc("match_chunks", {
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
  // Prioritize source chunks (with real video titles) over concept nodes
  const sorted = [...chunks].sort((a, b) => {
    const aHasVideo = a.video_url ? 1 : 0;
    const bHasVideo = b.video_url ? 1 : 0;
    return bHasVideo - aHasVideo;
  });

  return sorted
    .map((chunk) => {
      const source =
        chunk.source_type === "transcript" && chunk.video_title
          ? `[YOUR VIDEO: "${chunk.video_title}" — ${chunk.video_url ?? ""}]`
          : chunk.pdf_file
            ? `[YOUR COURSE: ${chunk.pdf_file}]`
            : `[Source]`;
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
