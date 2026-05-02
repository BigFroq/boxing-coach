import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { withRetry } from "@/lib/retry";
import { readAllDrillVaultEntries } from "@/lib/vault-reader";
import { buildDrillProgramPrompt } from "@/lib/drill-program-prompt";
import { validateDrillProgram } from "@/lib/drill-program-validator";
import { INTENSITY_VALUES, CONTEXT_VALUES, TIME_MIN_VALUES } from "@/lib/drill-program-types";
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
      .select("id, dimension_scores, matched_fighters, physical_context, experience_level, drill_program")
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
      return NextResponse.json({ drill_program: profile.drill_program, cached: true });
    }

    // Derive experience_level: physical_context.experience_level → profile.experience_level → default
    const physCtx = profile.physical_context ?? {};
    const experienceLevel: string =
      (typeof physCtx.experience_level === "string" && physCtx.experience_level)
        ? physCtx.experience_level
        : (typeof profile.experience_level === "string" && profile.experience_level)
          ? profile.experience_level
          : "intermediate";

    const vaultDrills = await readAllDrillVaultEntries();

    const systemPrompt = buildDrillProgramPrompt({
      dimensionScores: profile.dimension_scores as DimensionScores,
      matchedFighters: profile.matched_fighters ?? [],
      physicalContext: physCtx,
      experienceLevel,
      vaultDrills,
    });

    const response = await withRetry(() =>
      anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: "Generate the DrillProgram JSON based on the user profile and vault drills above.",
          },
        ],
      })
    );

    const text = response.content[0].type === "text" ? response.content[0].text : "";

    // Strip markdown fences if present
    let jsonStr = text;
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();

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
