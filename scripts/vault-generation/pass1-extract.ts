// scripts/vault-generation/pass1-extract.ts
// Pass 1: Entity Extraction — identify all concept nodes from source chunks
import Anthropic from "@anthropic-ai/sdk";

export interface NodeCandidate {
  title: string;
  slug: string;
  node_type: "concept" | "fighter" | "technique" | "phase" | "drill" | "injury_prevention";
  aliases: string[];
  description: string; // 1-sentence reason this deserves a node
}

let _anthropic: Anthropic | null = null;
function getAnthropic() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function extractEntities(
  supabase: any
): Promise<NodeCandidate[]> {
  console.log("=== Pass 1: Entity Extraction ===\n");

  // Fetch all content_chunks
  const { data: chunks, error } = await supabase
    .from("content_chunks")
    .select("id, content, source_type, video_title, pdf_file, category")
    .order("created_at");

  if (error || !chunks) {
    throw new Error(`Failed to fetch chunks: ${error?.message}`);
  }
  console.log(`Loaded ${chunks.length} content chunks\n`);

  // Batch chunks for Claude — ~40 chunks per batch to stay within context
  const batchSize = 40;
  const allCandidates: NodeCandidate[] = [];
  const seenSlugs = new Set<string>();

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const batchText = batch
      .map((c: { source_type: string; video_title: string | null; pdf_file: string | null; content: string }, idx: number) => {
        const source = c.source_type === "transcript"
          ? `[Video: ${c.video_title}]`
          : `[Course: ${c.pdf_file}]`;
        return `[CHUNK ${i + idx}] ${source}\n${c.content.slice(0, 2000)}`;
      })
      .join("\n\n---\n\n");

    const response = await getAnthropic().messages.create({
      model: "claude-opus-4-20250514",
      max_tokens: 8192,
      system: `You are analyzing boxing coaching content from Dr. Alex Wiant's "Punch Doctor" channel and "Power Punching Blueprint" course.

Your job: identify every distinct concept, fighter, technique, drill, phase, and injury prevention topic mentioned in these chunks.

For each entity, provide:
- title: Human-readable name (e.g., "Jab Mechanics", "Canelo Alvarez")
- slug: URL-safe lowercase (e.g., "jab-mechanics", "canelo-alvarez")
- node_type: One of "concept", "fighter", "technique", "phase", "drill", "injury_prevention"
- aliases: Alternative names users might use (e.g., ["jab", "lead hand punch"])
- description: One sentence explaining why this deserves its own knowledge node

Guidelines:
- A "concept" is a theoretical principle (kinetic chains, shearing force, throw vs push)
- A "fighter" is a specific boxer Alex analyzes
- A "technique" is a specific punch or movement pattern
- A "phase" is one of Alex's 4 mechanical phases
- A "drill" is a specific exercise or training activity
- An "injury_prevention" topic is about body maintenance/prehab
- Only create nodes for topics with substantial content — at least 2-3 mentions across the corpus
- The four phases should each be separate nodes
- Merge duplicates (e.g., "hook" and "left hook" should be one node if Alex treats them as the same topic)

Return ONLY a JSON array of objects. No markdown fencing.`,
      messages: [{ role: "user", content: batchText }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "[]";
    let jsonStr = text;
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();

    try {
      const candidates = JSON.parse(jsonStr) as NodeCandidate[];
      for (const c of candidates) {
        if (!seenSlugs.has(c.slug)) {
          seenSlugs.add(c.slug);
          allCandidates.push(c);
        }
      }
    } catch (e) {
      console.warn(`Failed to parse batch ${i}, skipping: ${e}`);
    }

    console.log(`  Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(chunks.length / batchSize)}: ${allCandidates.length} unique candidates so far`);
  }

  // Deduplication pass — ask Claude to merge overlapping candidates
  if (allCandidates.length > 0) {
    console.log(`\nDeduplication pass on ${allCandidates.length} candidates...`);

    const dedupeResponse = await getAnthropic().messages.create({
      model: "claude-opus-4-20250514",
      max_tokens: 8192,
      system: `You are deduplicating a list of knowledge graph node candidates from a boxing coaching corpus.

Rules:
- Merge nodes that cover the same topic (e.g., "Left Hook" and "Hook Mechanics" should be one node)
- Keep the more specific/descriptive title
- Combine aliases from merged nodes
- The 4 phases must remain as separate nodes
- Target: 60-80 total nodes
- Preserve node_type accuracy

Return the deduplicated JSON array. No markdown fencing.`,
      messages: [
        {
          role: "user",
          content: JSON.stringify(allCandidates, null, 2),
        },
      ],
    });

    const dedupeText = dedupeResponse.content[0].type === "text" ? dedupeResponse.content[0].text : "[]";
    let dedupeJson = dedupeText;
    const dedupeMatch = dedupeText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (dedupeMatch) dedupeJson = dedupeMatch[1].trim();

    try {
      const deduplicated = JSON.parse(dedupeJson) as NodeCandidate[];
      console.log(`Deduplicated: ${allCandidates.length} → ${deduplicated.length} nodes\n`);
      return deduplicated;
    } catch {
      console.warn("Deduplication parse failed, using raw candidates");
    }
  }

  return allCandidates;
}
