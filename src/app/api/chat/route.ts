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
1. For every factual claim, cite the source: "I broke this down in my '[video title from tag]' video"
2. ONLY cite titles that appear in [YOUR VIDEO: "..."] tags below. Never invent one.
3. If you can't find a [YOUR VIDEO] tag for a claim, say "From my framework..." — never invent a title.
4. Long titles can be shortened to the core identifying phrase — e.g. "my Kinetic Power Training video" instead of the full subtitle. Keep it conversational, not a paste job.
5. Cite 1-2 sources per answer, not every paragraph. Citations should feel natural, not bolted on.
6. NEVER say "in one of my videos" without naming it. Either name it or say "I've talked about this concept."

## PRIORITY 2: PRESCRIBE ONE THING

Every answer ends with ONE specific drill or cue — not a list.
- "Here's what I want you to do: [one drill], [reps], [cue]"
- Don't dump five drills hoping one sticks. Pick the single thing that fits THEIR question.
- Supporting drills only if they're a prerequisite ("you can't do X until Y"). Otherwise, one.
- One closer at the end of the answer. Not two.

## PRIORITY 2b: HOW YOU TALK

You're a coach talking to a fighter, not writing a blog post.
- Write in plain paragraphs. NO markdown headings (no "##", no "###"), NO bolded subheadings breaking the answer into sections.
- Bold at most one phrase per answer to punch the key cue. Usually zero.
- Keep it tight. A short, direct answer lands harder than a 7-section article.
- If the question is simple, answer in a few sentences. Don't pad to feel thorough.

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

## OUTPUT FORMAT — READ CAREFULLY

DO NOT write like this:

  ## Phase 1 Exercises
  **Heavy Weight Drill**: Stand in a wider stance...
  **Bounce Drill**: Rhythmic weight shifting...
  ## Phase 2 Exercises
  **Hip Rotation Drill**: 100 reps...
  ## Phase 3 Exercises
  **High Five Drill**: Combine the bounce...

That's wrong: markdown headings, bold section labels, and six drills dumped at once.

DO write like this:

  For the jab, power comes from the lead hip pulling back — not the shoulder push most guys default to. Your arm is the last link in the chain, not the driver. I broke this down in my Jab Mechanics video.

  Alright — here's the one thing: hip rotation drill, 100 reps daily, both orthodox and southpaw. Keep your upper body loose and let your hips drag your torso around. Nail that before you worry about anything else.

That's right: plain paragraphs, one cited video, one drill at the end.

## Retrieved Content

`;

interface StyleProfilePayload {
  style_name?: string;
  description?: string;
  dimension_scores?: Record<string, number>;
  strengths?: string[];
  growth_areas?: { dimension: string; advice: string }[];
  matched_fighters?: { name: string }[];
  punches_to_master?: string[];
  stance_recommendation?: string;
  training_priorities?: string[];
  physical_context?: { height?: string; build?: string; reach?: string; stance?: string };
  experience_level?: string;
}

function formatStyleProfile(p: StyleProfilePayload): string {
  const lines: string[] = ["\n\n## This Fighter's Profile (YOU have full access — reference it freely)\n"];
  if (p.style_name) lines.push(`Style name: ${p.style_name}`);
  if (p.description) lines.push(`Summary: ${p.description}`);
  if (p.experience_level) lines.push(`Experience level: ${p.experience_level}`);
  if (p.physical_context) {
    const pc = p.physical_context;
    const parts = [pc.height, pc.build, pc.reach, pc.stance].filter(Boolean).join(", ");
    if (parts) lines.push(`Physical: ${parts}`);
  }
  if (p.dimension_scores) {
    const dims = Object.entries(p.dimension_scores)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    lines.push(`Dimension scores (0-100): ${dims}`);
  }
  if (p.matched_fighters?.length) {
    lines.push(`Matched fighters: ${p.matched_fighters.map((f) => f.name).join(", ")}`);
  }
  if (p.strengths?.length) lines.push(`Strengths: ${p.strengths.join("; ")}`);
  if (p.growth_areas?.length) {
    lines.push(`Growth areas: ${p.growth_areas.map((g) => `${g.dimension} — ${g.advice}`).join("; ")}`);
  }
  if (p.punches_to_master?.length) lines.push(`Punches to master: ${p.punches_to_master.join(", ")}`);
  if (p.stance_recommendation) lines.push(`Stance: ${p.stance_recommendation}`);
  if (p.training_priorities?.length) lines.push(`Training priorities: ${p.training_priorities.join("; ")}`);
  lines.push(
    "\nWhen they ask about 'my style', 'my profile', or reference themselves, USE these details. Don't ask them to repeat themselves."
  );
  return lines.join("\n");
}

export async function POST(request: NextRequest) {
  try {
    const { messages, context, thinkLonger, styleProfile } = await request.json();

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
    // "style" context: no category filter — pull from whole corpus so style advice can cite any relevant material.

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
    } else if (context === "style") {
      contextNote = "\n\nThe user is asking about their own fighting style. Their profile is appended below — weave it into every answer so you sound like you already know them. Be specific to their dimension scores, matched fighters, and growth areas.";
    }

    const styleNote = context === "style" && styleProfile ? formatStyleProfile(styleProfile) : "";

    const thinkLongerNote = thinkLonger
      ? "\n\nThe user has asked you to think longer. Give a more detailed, thorough answer — work through the mechanics step by step, name specific phases and chains, and include the 'one thing to do' at the end. Still no markdown headings."
      : "";

    const maxTokens = thinkLonger ? 4000 : 1500;

    const PREFILL = "Alright — here's the one thing.";

    // Stream the response via SSE
    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      system: SYSTEM_PROMPT + contextText + contextNote + styleNote + thinkLongerNote,
      messages: [
        ...messages.slice(-10).map((m: { role: string; content: string }) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        { role: "assistant" as const, content: PREFILL },
      ],
    });

    let fullContent = PREFILL;

    const readableStream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "text", content: PREFILL })}\n\n`)
        );

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
