import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { retrieveContext, formatChunksForPrompt } from "@/lib/graph-rag";
import { createServerClient } from "@/lib/supabase";
import { enforceRateLimit } from "@/lib/rate-limit";
import { chatRequestSchema } from "@/lib/validation";

type AnthropicMsg = { role: "user" | "assistant"; content: string };

export function clampHistoryForAnthropic(messages: AnthropicMsg[]): AnthropicMsg[] {
  let recent = messages.slice(-10);
  if (recent.length > 0 && recent[0].role !== "user") {
    recent = recent.slice(1);
  }
  return recent;
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `You are a boxing coach teaching punch mechanics. Your job is to relay the framework below clearly and directly.

## How you talk
- Plain paragraphs. NO markdown headings, NO section labels, NO bolded subheadings.
- You're a teacher explaining mechanics, not a personality. Don't pretend to be a specific person with a backstory. Don't say "I broke this down in my video," don't reference "my framework" or "my course," don't name yourself.
- Don't cite sources, videos, or course chapters by name in your reply. The knowledge is the knowledge — deliver it directly.
- You MAY name specific fighters when the question or retrieved context is about them (e.g., "Gervonta drives off his back foot..."). Fighter names are fair game; source titles are not.
- Keep it tight. A short, direct answer lands harder than a long one. If the question is simple, answer in a few sentences.
- Bold at most one phrase per answer to punch the key cue. Usually zero.
- Don't hedge ("it might be," "perhaps consider"). Don't posture either. Just teach.

## End every answer with one specific drill
- Finish with ONE drill or cue: "Here's what to do: [drill], [reps], [cue]."
- Don't dump a list. Pick the single thing that fits the question.
- Supporting drills only if they're a prerequisite. Otherwise, one.

## The framework
1. A punch is a THROW, not a PUSH — rotational mechanics, not linear
2. Four phases: Load → Hip Explosion → Core Transfer → Follow Through
3. Kinetic chains (Anatomy Trains) in sequence: spiral line, front functional line, superficial back line, lateral line, cross-body chains
4. Land with the last 3 knuckles — shearing force, not axial
5. Loose until impact, then grab the fist
6. Hip opening powers jab/hook/lead uppercut; hip closing powers cross/rear uppercut
7. The shoulder TRANSFERS energy, it doesn't generate it
8. Breathing doesn't matter — there's always enough air for intra-abdominal pressure
9. If you can throw a ball, you can learn these mechanics

## Common myths to correct (neutrally)
- "Put your shoulder into it" — the shoulder transfers, it doesn't generate. Leading with the shoulder leaks power.
- "Breathe out when you punch" — that weakens the punch. Intra-abdominal pressure matters more.
- "Power comes from the heel" — it comes from the kinetic chain, not pushing off.
- "Step when you punch" — the step is a consequence of weight transfer, not the cause.
- "Pivot on the ball of your foot" — push off a flat foot instead.
- "Snap the punch back" — transfer mass through the target, not a tag.

## What not to do
- Don't fabricate claims, fights, events, or drill names.
- Don't invent video titles or course chapters — and don't reference them at all.
- For questions outside punch mechanics, answer briefly and steer back to mechanics.
- Never agree with a myth to be polite.

## Example output

For the jab, power comes from the lead hip pulling back — not the shoulder push most people default to. The arm is the last link in the chain, not the driver. The shoulder is there to transfer energy, not generate it.

Here's what to do: hip rotation drill, 100 reps daily, orthodox and southpaw. Keep the upper body loose and let the hips drag the torso around. Nail that before worrying about anything else.

## Retrieved content (for your reference only — do not cite titles, URLs, or filenames in your reply)

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
  const lines: string[] = ["\n\n## This fighter's profile (reference it freely — you already know this about them)\n<fighter_profile>"];
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
  lines.push("</fighter_profile>");
  lines.push(
    "\nWhen they ask about 'my style', 'my profile', or reference themselves, USE these details. Don't ask them to repeat themselves."
  );
  return lines.join("\n");
}

export async function POST(request: NextRequest) {
  try {
    const raw = await request.json();
    const parsed = chatRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", issues: parsed.error.issues },
        { status: 400 }
      );
    }
    const { messages, context, thinkLonger, styleProfile, userId } = parsed.data;

    const limited = await enforceRateLimit(request, userId);
    if (limited) return limited;

    const lastUserMessage = [...messages].reverse().find((m: { role: string }) => m.role === "user");
    if (!lastUserMessage) {
      return NextResponse.json({ error: "No user message" }, { status: 400 });
    }

    let categories: string[] | undefined;
    if (context === "drills") {
      categories = ["drill", "injury_prevention"];
    } else if (context === "technique") {
      categories = ["mechanics", "theory", "analysis"];
    }
    // "style" context: no category filter — pull from whole corpus so style advice can cite any relevant material.

    // Graph-enhanced retrieval: decompose → HyDE → parallel (vector + graph) → rerank
    const { chunks } = await retrieveContext(lastUserMessage.content, {
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

    // When thinkLonger is on, enable extended thinking and bump max_tokens so
    // the budget (which counts toward max_tokens) doesn't eat the final answer.
    const thinkingBudget = 2000;
    const maxTokens = thinkLonger ? 6000 : 1500;

    // Stream the response via SSE
    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      system: SYSTEM_PROMPT + contextText + contextNote + styleNote + thinkLongerNote,
      messages: clampHistoryForAnthropic(
        messages.map((m: { role: string; content: string }) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }))
      ),
      ...(thinkLonger
        ? { thinking: { type: "enabled" as const, budget_tokens: thinkingBudget } }
        : {}),
    });

    let fullContent = "";

    const readableStream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        // Track whether we've already closed the stream so trailing error/end
        // events after the first terminal event don't throw
        // `ERR_INVALID_STATE: Controller is already closed`.
        let closed = false;
        const safeEnqueue = (payload: string) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(payload));
          } catch {
            closed = true;
          }
        };
        const safeClose = () => {
          if (closed) return;
          closed = true;
          try {
            controller.close();
          } catch {
            // already closed by the runtime
          }
        };

        stream.on("thinking", (thinkingDelta) => {
          safeEnqueue(`data: ${JSON.stringify({ type: "thinking", content: thinkingDelta })}\n\n`);
        });

        stream.on("text", (text) => {
          fullContent += text;
          safeEnqueue(`data: ${JSON.stringify({ type: "text", content: text })}\n\n`);
        });

        stream.on("end", () => {
          safeEnqueue(`data: ${JSON.stringify({ type: "done" })}\n\n`);
          safeClose();

          // Log query (fire-and-forget)
          logQuery(lastUserMessage.content, context, chunks, fullContent).catch(() => {});
        });

        stream.on("error", (err) => {
          console.error("Stream error:", err);
          safeEnqueue(`data: ${JSON.stringify({ type: "error", message: "Stream error" })}\n\n`);
          safeClose();
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
    const msg = error instanceof Error ? error.message.toLowerCase() : "";
    // Detect Anthropic billing/quota exhaustion specifically — distinct from
    // a transient 5xx, the user can't retry their way out of it.
    if (/credit balance|quota|insufficient_quota|billing/i.test(msg)) {
      return NextResponse.json(
        { error: "The chat service is temporarily unavailable. Please try again later." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
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
