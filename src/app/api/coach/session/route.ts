import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { retrieveContext, formatChunksForPrompt, extractCitations, type SourceCitation } from "@/lib/graph-rag";
import { FOUR_PHASES, CORE_PRINCIPLES, MYTHS } from "@/lib/framework";
import { getAuthenticatedUser } from "@/lib/auth-server";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

function buildMythsText(): string {
  return Object.values(MYTHS)
    .map((m) => `- Myth: "${m.myth}" → Correction: ${m.correction}`)
    .join("\n");
}

function buildCoachSystemPrompt(
  userContext: {
    profile: { tendencies: Record<string, string>; skill_levels: Record<string, string>; preferences: Record<string, string>; onboarding_complete: boolean };
    focusAreas: { name: string; status: string; description: string | null }[];
    recentSessions: { session_type: string; summary: Record<string, unknown>; created_at: string }[];
    pendingDrills: { drill_name: string; details: string | null }[];
  },
  ragContext: string
): string {
  const { profile, focusAreas, recentSessions, pendingDrills } = userContext;

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
${drillsText || "None pending"}`;
  }

  return `You are a boxing coach powered by Dr. Alex Wiant's Power Punching Blueprint methodology. You guide fighters through post-training reflection using a structured conversation.

## Your Framework
${phasesText}

## Core Principles
${principlesText}

## Myth Corrections
${mythsText}
${userSection}

## Relevant Knowledge Base Content
${ragContext || "No specific content retrieved for this exchange."}

## How to Coach This Session
1. If new user: run onboarding (see above)
2. If returning user: greet them with context from their last session and active focus areas
3. Ask 3-5 guided questions, one at a time:
   - What they worked on today
   - How their active focus areas felt
   - Whether they did prescribed drills
   - Any breakthroughs or frustrations
   - What they want to focus on next
4. Provide coaching context inline — connect their experience to Alex's framework
5. When the conversation feels complete, wrap up with a summary

## Rules
- Ask ONE question at a time. Wait for their response.
- Use Alex's exact terminology (kinetic chains, phases, loading, hip explosion, etc.)
- Be encouraging but honest. Don't sugarcoat.
- When prescribing drills, be specific: name, reps, sets, cues.
- Keep responses concise — 2-4 sentences per turn, max.
- Never fabricate information. If you don't know something, say so.`;
}

async function loadUserContext(userId: string) {
  const supabase = createServerClient();

  const [profileRes, focusRes, sessionsRes, drillsRes] = await Promise.all([
    supabase.from("user_profiles").select("tendencies, skill_levels, preferences, onboarding_complete").eq("id", userId).single(),
    supabase.from("focus_areas").select("name, status, description").eq("user_id", userId).in("status", ["new", "active", "improving"]).order("updated_at", { ascending: false }),
    supabase.from("training_sessions").select("session_type, summary, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(3),
    supabase.from("drill_prescriptions").select("drill_name, details").eq("user_id", userId).eq("followed_up", false),
  ]);

  return {
    profile: profileRes.data ?? { tendencies: {}, skill_levels: {}, preferences: {}, onboarding_complete: false },
    focusAreas: focusRes.data ?? [],
    recentSessions: sessionsRes.data ?? [],
    pendingDrills: drillsRes.data ?? [],
  };
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    const userId = authUser.id;

    const { messages } = await request.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "Missing messages" }), { status: 400 });
    }

    const userContext = await loadUserContext(userId);

    const lastUserMsg = [...messages].reverse().find((m: { role: string }) => m.role === "user");
    let ragContext = "";
    let citations: SourceCitation[] = [];

    if (lastUserMsg) {
      const { chunks, citations: ragCitations } = await retrieveContext(lastUserMsg.content, { count: 6 });
      ragContext = formatChunksForPrompt(chunks);
      citations = ragCitations;
    }

    const systemPrompt = buildCoachSystemPrompt(userContext, ragContext);

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
