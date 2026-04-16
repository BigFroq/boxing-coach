import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
async function callWithRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === maxRetries - 1) throw err;
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
  throw new Error("Unreachable");
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const EXTRACTION_PROMPT = `You are extracting structured data from a boxing coaching conversation. The conversation is between a coach AI and a fighter logging their training session.

Extract the following as JSON:
{
  "session_type": "bag_work" | "shadow_boxing" | "sparring" | "drills" | "mixed",
  "rounds": <number or null>,
  "breakthroughs": ["specific breakthrough noted"],
  "struggles": ["specific struggle or ongoing issue"],
  "focus_areas_worked": ["name of focus area discussed"],
  "drills_done": ["drill name they reported doing"],
  "drills_prescribed": [{"name": "drill name", "details": "reps, sets, cues"}],
  "focus_area_updates": [{"name": "area name", "status": "new|active|improving|resolved", "description": "current state"}],
  "profile_updates": {
    "tendencies": {"key": "observation"},
    "skill_levels": {"key": "level"}
  },
  "onboarding_complete": true | false
}

Rules:
- Only include data explicitly discussed in the conversation
- For focus_area_updates, only include areas that were actively discussed
- Set onboarding_complete to true if this was an onboarding conversation and the user shared enough info
- Be conservative — don't infer things not stated
- Return ONLY valid JSON, no markdown fences`;

export async function POST(request: NextRequest) {
  try {
    const { messages, userId } = await request.json();

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: "Missing messages" }, { status: 400 });
    }

    // Extract structured data from conversation
    const transcript = messages
      .map((m: { role: string; content: string }) => `${m.role === "user" ? "Fighter" : "Coach"}: ${m.content}`)
      .join("\n\n");

    const extractionResponse = await callWithRetry(() =>
      anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: EXTRACTION_PROMPT,
        messages: [{ role: "user", content: transcript }],
      })
    );

    const extractionText =
      extractionResponse.content[0].type === "text" ? extractionResponse.content[0].text : "{}";

    let jsonStr = extractionText;
    const jsonMatch = extractionText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();

    let extracted;
    try {
      extracted = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse extraction JSON:", jsonStr.slice(0, 200));
      extracted = {};
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createServerClient() as any;

    // 1. Save training session
    const { data: session, error: sessionError } = await supabase
      .from("training_sessions")
      .insert({
        user_id: userId,
        session_type: extracted.session_type ?? "mixed",
        rounds: extracted.rounds ?? null,
        transcript: messages,
        summary: {
          breakthroughs: extracted.breakthroughs ?? [],
          struggles: extracted.struggles ?? [],
          focus_areas_worked: extracted.focus_areas_worked ?? [],
          drills_done: extracted.drills_done ?? [],
        },
        prescriptions_given: extracted.drills_prescribed ?? [],
      })
      .select("id")
      .single();

    if (sessionError) {
      console.error("Session save error:", sessionError);
      return NextResponse.json({ error: "Failed to save session" }, { status: 500 });
    }

    // 2. Upsert user profile (create if doesn't exist for anonymous users)
    if (extracted.profile_updates || extracted.onboarding_complete) {
      // Ensure profile exists
      await supabase
        .from("user_profiles")
        .upsert({ id: userId }, { onConflict: "id", ignoreDuplicates: true });

      const { data: existingProfile } = await supabase
        .from("user_profiles")
        .select("tendencies, skill_levels, onboarding_complete")
        .eq("id", userId)
        .single();

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

      if (extracted.profile_updates?.tendencies) {
        updates.tendencies = {
          ...(existingProfile?.tendencies as Record<string, string> ?? {}),
          ...extracted.profile_updates.tendencies,
        };
      }
      if (extracted.profile_updates?.skill_levels) {
        updates.skill_levels = {
          ...(existingProfile?.skill_levels as Record<string, string> ?? {}),
          ...extracted.profile_updates.skill_levels,
        };
      }
      if (extracted.onboarding_complete && !existingProfile?.onboarding_complete) {
        updates.onboarding_complete = true;
      }

      await supabase.from("user_profiles").update(updates).eq("id", userId);
    }

    // 3. Upsert focus areas
    if (extracted.focus_area_updates && Array.isArray(extracted.focus_area_updates)) {
      for (const update of extracted.focus_area_updates) {
        const { data: existing } = await supabase
          .from("focus_areas")
          .select("id, history")
          .eq("user_id", userId)
          .eq("name", update.name)
          .single();

        if (existing) {
          const history = [...((existing.history as Array<{ date: string; note: string }>) ?? [])];
          history.push({ date: new Date().toISOString().split("T")[0], note: update.description });

          await supabase
            .from("focus_areas")
            .update({
              status: update.status,
              description: update.description,
              history,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
        } else {
          await supabase.from("focus_areas").insert({
            user_id: userId,
            name: update.name,
            status: update.status ?? "new",
            description: update.description,
            history: [{ date: new Date().toISOString().split("T")[0], note: update.description }],
          });
        }
      }
    }

    // 4. Save drill prescriptions
    if (extracted.drills_prescribed && Array.isArray(extracted.drills_prescribed)) {
      for (const drill of extracted.drills_prescribed) {
        await supabase.from("drill_prescriptions").insert({
          user_id: userId,
          focus_area_id: null,
          session_id: session.id,
          drill_name: drill.name,
          details: drill.details ?? null,
        });
      }
    }

    return NextResponse.json({ success: true, sessionId: session.id });
  } catch (error) {
    console.error("Save session error:", error);
    return NextResponse.json({ error: "Failed to save session" }, { status: 500 });
  }
}
