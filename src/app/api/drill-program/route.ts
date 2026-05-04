import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { withRetry } from "@/lib/retry";
import { readAllDrillVaultEntries } from "@/lib/vault-reader";
import { buildDrillProgramPrompt } from "@/lib/drill-program-prompt";
import { validateDrillProgram } from "@/lib/drill-program-validator";
import { INTENSITY_VALUES, CONTEXT_VALUES, TIME_MIN_VALUES } from "@/lib/drill-program-types";
import type { DrillProgram } from "@/lib/drill-program-types";
import type { DimensionScores } from "@/data/fighter-profiles";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const force = body?.force === true;
    const userId: string | undefined = body?.userId;

    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createServerClient() as any;

    const { data: profile, error: profileError } = await supabase
      .from("style_profiles")
      .select("id, dimension_scores, matched_fighters, physical_context, drill_program")
      .eq("user_id", userId)
      .eq("is_current", true)
      .maybeSingle();

    if (profileError) {
      console.error("style_profiles fetch error:", profileError);
      return NextResponse.json({ error: "Failed to load style profile" }, { status: 500 });
    }

    if (!profile) {
      return NextResponse.json(
        { error: "No current style profile. Complete the style quiz first." },
        { status: 404 }
      );
    }

    // Cache hit — skip LLM unless force=true
    if (profile.drill_program && !force) {
      const cached = profile.drill_program as DrillProgram;
      return NextResponse.json({
        drill_program: {
          ...cached,
          axis_values: {
            intensity: [...INTENSITY_VALUES],
            context: [...CONTEXT_VALUES],
            time_min: [...TIME_MIN_VALUES],
          },
        },
        cached: true,
      });
    }

    // Derive experience_level from physical_context (real column lives on
    // quiz_progress, not style_profiles — querying it is a deferred follow-up,
    // matching the same defer in /api/profile per PR #5).
    const physCtx = profile.physical_context ?? {};
    const experienceLevel: string =
      typeof physCtx.experience_level === "string" && physCtx.experience_level
        ? physCtx.experience_level
        : "intermediate";

    const vaultDrills = await readAllDrillVaultEntries();

    const systemPrompt = buildDrillProgramPrompt({
      dimensionScores: profile.dimension_scores as DimensionScores,
      matchedFighters: profile.matched_fighters ?? [],
      physicalContext: physCtx,
      experienceLevel,
      vaultDrills,
    });

    // Streaming is required by the SDK for max_tokens this large (Sonnet 4.6
    // with 65536 tokens projects past the 10-minute non-streaming guard).
    // .finalMessage() awaits full completion, so the route stays synchronous
    // from the client's perspective — only the Anthropic API leg streams.
    const response = await withRetry(() =>
      anthropic.messages
        .stream({
          model: "claude-sonnet-4-6",
          max_tokens: 65536,
          system: systemPrompt,
          messages: [
            {
              role: "user",
              content: "Generate the DrillProgram JSON based on the user profile and vault drills above.",
            },
          ],
        })
        .finalMessage()
    );

    const text = response.content[0].type === "text" ? response.content[0].text : "";

    // Strip markdown fences if present (lead and trail are independent so we
    // tolerate truncated output that lost its closing fence to max_tokens).
    let jsonStr = text.replace(/^\s*```(?:json)?\s*/, "");
    jsonStr = jsonStr.replace(/\s*```\s*$/, "").trim();

    let rawParsed: unknown;
    try {
      rawParsed = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse drill program JSON:", jsonStr.slice(0, 300));
      return NextResponse.json(
        { error: "Failed to parse drill program. The model returned an unexpected format. Please try again." },
        { status: 422 }
      );
    }

    const allowedSlugs = new Set(vaultDrills.map((d) => d.slug));
    const { program: validated, warnings } = validateDrillProgram(rawParsed, allowedSlugs);
    if (warnings.length > 0) {
      console.warn("[drill-program] validation warnings:", warnings);
    }

    if (validated.drills.length === 0 || validated.sessions.length === 0) {
      console.warn("Drill program generation produced empty drills/sessions; refusing to cache");
      return NextResponse.json(
        { error: "Generated program is empty. Please try again." },
        { status: 422 }
      );
    }

    const drillProgram = {
      generated_at: new Date().toISOString(),
      axis_values: {
        intensity: [...INTENSITY_VALUES],
        context: [...CONTEXT_VALUES],
        time_min: [...TIME_MIN_VALUES],
      },
      drills: validated.drills,
      sessions: validated.sessions,
    };

    const { error: updateError } = await supabase
      .from("style_profiles")
      .update({ drill_program: drillProgram })
      .eq("id", profile.id);

    if (updateError) {
      console.error("drill_program update error:", updateError);
      return NextResponse.json({ error: "Failed to save drill program" }, { status: 500 });
    }

    return NextResponse.json({ drill_program: drillProgram, cached: false });
  } catch (error) {
    console.error("drill-program error:", error);
    return NextResponse.json({ error: "Failed to generate drill program" }, { status: 500 });
  }
}
