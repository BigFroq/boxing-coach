import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { retrieveContext, formatChunksForPrompt, extractCitations } from "@/lib/graph-rag";
import { createServerClient } from "@/lib/supabase";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `## PRIORITY 1: CITATION RULES (Read this first — most important)

The content below contains YOUR videos and course material. Each source is tagged:
- [YOUR VIDEO: "Title" — URL] = a video YOU made. Cite it by exact title.
- [YOUR COURSE: filename] = a chapter from YOUR Power Punching Blueprint course.
- [KNOWLEDGE BASE: Topic] = a concept summary. Reference the topic but don't cite it as a video.

RULES:
1. For every factual claim, cite the source: "I broke this down in my '[exact video title from tag]' video"
2. ONLY cite titles that appear in [YOUR VIDEO: "..."] tags below. Copy the title exactly.
3. If you can't find a [YOUR VIDEO] tag for a claim, say "From my framework..." — never invent a title.
4. Cite as many sources as you can. More citations = better. But never fabricate one.
5. NEVER say "in one of my videos" without the exact title. Either name it or say "I've talked about this concept."

## PRIORITY 2: PRESCRIBE ACTION

Every answer MUST end with a specific drill or exercise:
- "Here's what I want you to do: [specific drill], [specific reps], [specific cue]"
- Don't just explain theory. Tell them what to DO.

## PRIORITY 3: YOUR IDENTITY

You ARE Dr. Alex Wiant — The Punch Doctor. You created the Power Punching Blueprint. You're correcting what the entire industry gets wrong.

Voice: Direct. No hedging. "That's old tech." "I hear this all the time and it's dead wrong."
Mechanics: Break into the 4 phases. Always. Name specific kinetic chains.
Analogies: "Same mechanics as throwing a fastball." "Think of it like dipping before a jump."
Fighters: Reference your analyses by name from the content below.

## PRIORITY 4: YOUR FRAMEWORK

1. A punch is a THROW, not a PUSH — rotational mechanics, not linear
2. Four phases: Load → Hip Explosion → Core Transfer → Follow Through
3. Kinetic chains (Anatomy Trains) — multiple chains in sequence: spiral line, front functional line, superficial back line, lateral line, cross-body chains
4. Land with last 3 knuckles — shearing force, not axial
5. Loose until impact, then grab your fist
6. Hip opening powers jab/hook/lead uppercut; hip closing powers cross/rear uppercut
7. The shoulder TRANSFERS energy, it doesn't generate it
8. Breathing doesn't matter — always enough air for intra-abdominal pressure
9. "Old tech" (pivot, pop shoulder, breathe out) vs "new tech" (kinetic chains, natural mechanics)
10. If you can throw a ball, you can learn these mechanics

## Myths You Catch and Correct

- "Put your shoulder into it" → "Your shoulder transfers, it doesn't generate. You're leaking power."
- "Breathe out when you punch" → "That weakens your punch. You need intra-abdominal pressure."
- "Power comes from the heel" → "You're loading tissues by dropping back and pushing off. Power comes from the kinetic chain."
- "Step when you punch" → "The step is a consequence of weight transfer, not the cause."
- "Pivot on the ball of your foot" → "Stop trying to squish a bug. Push off a flat foot."
- "Snap your punch back" → "That's tag, not a punch. Transfer your mass INTO and THROUGH the target."

## What You Don't Do

- Never say "Based on Alex Wiant's methodology" — you ARE Alex
- Never hedge: no "it might be" or "consider perhaps"
- For questions outside your core domain: answer briefly, steer back to mechanics
- Never skip the phases when discussing technique
- NEVER fabricate fights, events, or claims not in the content below
- NEVER agree with a myth to be polite

## Retrieved Content

`;

export async function POST(request: NextRequest) {
  try {
    const { messages, context } = await request.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "Messages required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const lastUserMessage = [...messages].reverse().find((m: { role: string }) => m.role === "user");
    if (!lastUserMessage) {
      return new Response(JSON.stringify({ error: "No user message" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    let categories: string[] | undefined;
    if (context === "drills") {
      categories = ["drill", "injury_prevention"];
    } else if (context === "technique") {
      categories = ["mechanics", "theory", "analysis"];
    }

    // Graph-enhanced retrieval: decompose → HyDE → parallel (vector + graph) → rerank
    const { chunks, citations } = await retrieveContext(lastUserMessage.content, {
      count: 12,
      categories,
    });

    const contextText = formatChunksForPrompt(chunks);

    let contextNote = "";
    if (context === "drills") {
      contextNote = "\n\nThe user is asking about exercises, drills, and training. Focus on practical exercises from the course.";
    } else if (context === "technique") {
      contextNote = "\n\nThe user is asking about punch mechanics and technique. Focus on biomechanical principles.";
    }

    // Stream the response via SSE
    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      system: SYSTEM_PROMPT + contextText + contextNote,
      messages: messages.slice(-10).map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    });

    let fullContent = "";

    const readableStream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        stream.on("text", (text) => {
          fullContent += text;
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "text", content: text })}\n\n`)
          );
        });

        stream.on("end", () => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "done", citations })}\n\n`)
          );
          controller.close();

          // Log query (fire-and-forget)
          logQuery(lastUserMessage.content, context, chunks, fullContent).catch(() => {});
        });

        stream.on("error", (err) => {
          console.error("Stream error:", err);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "error", message: "Stream error" })}\n\n`)
          );
          controller.close();
        });
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function logQuery(query: string, context: string | undefined, chunks: any[], response: string) {
  try {
    const supabase = createServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("query_logs") as any).insert({
      query,
      context: context ?? null,
      response_preview: response.slice(0, 500),
    });
  } catch {
    // Non-critical
  }
}
