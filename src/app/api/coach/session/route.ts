import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase";
import { retrieveContext, formatChunksForPrompt, extractCitations, type SourceCitation } from "@/lib/graph-rag";
import { FOUR_PHASES, CORE_PRINCIPLES, MYTHS } from "@/lib/framework";
import { styleProfileSchema } from "@/lib/validation";
import { formatStyleProfileBlock } from "@/lib/style-profile-context";
import { computeNeglected } from "@/lib/neglected-focus-areas";
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const coachSessionRequestSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) }))
    .min(1)
    .max(100),
  userId: z.string().max(128),
  styleProfile: styleProfileSchema.optional(),
});

function buildMythsText(): string {
  return Object.values(MYTHS)
    .map((m) => `- Myth: "${m.myth}" → Correction: ${m.correction}`)
    .join("\n");
}

function buildCoachSystemPrompt(
  userContext: {
    profile: {
      tendencies: Record<string, string>;
      skill_levels: Record<string, string>;
      preferences: Record<string, string>;
      onboarding_complete: boolean;
    };
    focusAreas: {
      name: string;
      status: string;
      description: string | null;
      dimension: string | null;
      knowledge_node_slug: string | null;
    }[];
    recentSessions: { session_type: string; summary: Record<string, unknown>; created_at: string }[];
    pendingDrills: { drill_name: string; details: string | null }[];
    styleProfile: {
      style_name?: string;
      dimension_scores?: Record<string, number>;
      matched_fighters?: Array<{ name: string; overlappingDimensions?: string[] }>;
    } | null;
    neglected: string[];
  },
  ragContext: string
): string {
  const { profile, focusAreas, recentSessions, pendingDrills, styleProfile, neglected } = userContext;

  const phasesText = FOUR_PHASES.join("\n");
  const principlesText = CORE_PRINCIPLES.join("\n");
  const mythsText = buildMythsText();

  let userSection = "";

  if (!profile.onboarding_complete) {
    userSection = `\n## New User
This is a new user. Start with an onboarding conversation:
- Welcome them warmly
- Ask about their boxing experience (beginner, intermediate, advanced)
- Ask what they're currently working on or struggling with
- Ask about their training setup (gym, home, bag, sparring partners)
- Build their initial profile from the answers
After 3-4 exchanges, summarize what you've learned and set their first focus areas.`;
  } else {
    const tendenciesText = Object.entries(profile.tendencies)
      .map(([k, v]) => `- ${k}: ${v}`)
      .join("\n");
    const skillsText = Object.entries(profile.skill_levels)
      .map(([k, v]) => `- ${k}: ${v}`)
      .join("\n");
    const focusText = focusAreas
      .map((f) => `- ${f.name} (${f.status}): ${f.description ?? "No notes yet"}`)
      .join("\n");
    const sessionsText = recentSessions
      .map((s) => {
        const summary = s.summary as { breakthroughs?: string[]; struggles?: string[] };
        return `- ${s.created_at.split("T")[0]}: ${s.session_type} — breakthroughs: ${(summary.breakthroughs ?? []).join(", ") || "none"}, struggles: ${(summary.struggles ?? []).join(", ") || "none"}`;
      })
      .join("\n");
    const drillsText = pendingDrills
      .map((d) => `- ${d.drill_name}: ${d.details ?? ""}`)
      .join("\n");

    const avoidingBlock =
      neglected.length > 0
        ? `\n\n**Been avoiding (focus areas not touched in recent sessions):**\n${neglected.map((n) => `- ${n}`).join("\n")}`
        : "";

    userSection = `\n## This Fighter's Profile
**Known tendencies:**
${tendenciesText || "None recorded yet"}

**Skill levels:**
${skillsText || "Not assessed yet"}

**Active focus areas:**
${focusText || "None set yet"}

**Recent sessions:**
${sessionsText || "No sessions logged yet"}

**Pending drills (not yet followed up on):**
${drillsText || "None pending"}${avoidingBlock}`;
  }

  const styleBlock = formatStyleProfileBlock(styleProfile);
  const styleSection = styleBlock ? `\n\n${styleBlock}` : "";

  return `You are a boxing coach powered by Dr. Alex Wiant's Power Punching Blueprint methodology. You guide fighters through post-training reflection using a structured conversation.

## Your Framework
${phasesText}

## Core Principles
${principlesText}

## Myth Corrections
${mythsText}
${userSection}${styleSection}

## Relevant Knowledge Base Content
${ragContext || "No specific content retrieved for this exchange."}

## How to Use This Context
You have this fighter's profile, style, recent sessions, active focus areas, pending drills, and what they've been avoiding. Use it. Prioritise their gaps and avoidance over whatever they raise first — surface those before answering. Be direct. Plain prose, no markdown, no bolded subheadings. Ask one question at a time. End with one drill, never a list. Never fabricate — if the knowledge base content doesn't cover it, say so.`;
}

async function loadUserContext(userId: string) {
  const supabase = createServerClient();

  const [profileRes, focusRes, sessionsRes, drillsRes, styleRes] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("tendencies, skill_levels, preferences, onboarding_complete")
      .eq("id", userId)
      .single(),
    supabase
      .from("focus_areas")
      .select("name, status, description, dimension, knowledge_node_slug")
      .eq("user_id", userId)
      .in("status", ["new", "active", "improving"])
      .order("updated_at", { ascending: false }),
    supabase
      .from("training_sessions")
      .select("session_type, summary, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(3),
    supabase
      .from("drill_prescriptions")
      .select("drill_name, details")
      .eq("user_id", userId)
      .eq("followed_up", false),
    supabase
      .from("style_profiles")
      .select("dimension_scores, matched_fighters, ai_result")
      .eq("user_id", userId)
      .eq("is_current", true)
      .maybeSingle(),
  ]);

  const dbStyle = styleRes.data as {
    ai_result: { style_name?: string } | null;
    dimension_scores: Record<string, number>;
    matched_fighters: Array<{ name: string; slug?: string; overlappingDimensions?: string[] }>;
  } | null;
  const styleProfile = dbStyle
    ? {
        style_name: dbStyle.ai_result?.style_name,
        dimension_scores: dbStyle.dimension_scores,
        matched_fighters: dbStyle.matched_fighters,
      }
    : null;

  return {
    profile: profileRes.data ?? { tendencies: {}, skill_levels: {}, preferences: {}, onboarding_complete: false },
    focusAreas: focusRes.data ?? [],
    recentSessions: sessionsRes.data ?? [],
    pendingDrills: drillsRes.data ?? [],
    styleProfile,
  };
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json();
    const parsed = coachSessionRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid request body" }), { status: 400 });
    }
    const { messages, userId, styleProfile: bodyStyleProfile } = parsed.data;

    const userContext = await loadUserContext(userId);

    const styleProfile = userContext.styleProfile ?? bodyStyleProfile ?? null;
    const neglected = computeNeglected(
      userContext.focusAreas,
      userContext.recentSessions as { summary?: { focus_areas_worked_keys?: string[] } | null }[]
    );

    const lastUserMsg = [...messages].reverse().find((m: { role: string }) => m.role === "user");
    let ragContext = "";
    let citations: SourceCitation[] = [];

    if (lastUserMsg) {
      const { chunks, citations: ragCitations } = await retrieveContext(lastUserMsg.content, { count: 6 });
      ragContext = formatChunksForPrompt(chunks);
      citations = ragCitations;
    }

    const systemPrompt = buildCoachSystemPrompt(
      { ...userContext, styleProfile, neglected },
      ragContext
    );

    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: systemPrompt,
      messages: messages.slice(-12).map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    });

    const readableStream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        stream.on("text", (text) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "text", content: text })}\n\n`)
          );
        });

        stream.on("end", () => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "done", citations })}\n\n`)
          );
          controller.close();
        });

        stream.on("error", (err) => {
          console.error("Coach stream error:", err);
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
    console.error("Coach session error:", error);
    return new Response(JSON.stringify({ error: "Failed to process session" }), { status: 500 });
  }
}
