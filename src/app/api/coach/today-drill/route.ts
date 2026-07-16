import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { enforceRateLimit } from "@/lib/rate-limit";
import { dailyDrillPickPatchSchema } from "@/lib/validation";
import { buildPickerPrompt, validateLLMPick } from "@/lib/today-drill-picker";
import { pickDrillViaLLM } from "@/lib/today-drill-llm";
import { aggregateClipHistory } from "@/lib/clip-log-aggregation";
import { rowToClipLog } from "@/lib/clip-log-storage";
import { computeNeglected } from "@/lib/neglected-focus-areas";
import type { DrillEntry, DrillProgram } from "@/lib/drill-program-types";
import type { DailyDrillPick, DiagnosisInputs } from "@/lib/today-drill-types";

function utcDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function rowToPick(row: Record<string, unknown>): DailyDrillPick {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    drillDate: row.drill_date as string,
    drillId: row.drill_id as string,
    drillSnapshot: row.drill_snapshot as DrillEntry,
    diagnosis: row.diagnosis as string,
    completedAt: (row.completed_at as string | null) ?? null,
    skippedAt: (row.skipped_at as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

async function gatherInputs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string
): Promise<DiagnosisInputs | { status: "no-program" }> {
  // 1) Style profile + drill_program
  const { data: styleRow } = await supabase
    .from("style_profiles")
    .select("drill_program, ai_result, style_name, description")
    .eq("user_id", userId)
    .eq("is_current", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const drillProgram = (styleRow?.drill_program ?? null) as DrillProgram | null;
  if (!drillProgram || !drillProgram.drills || drillProgram.drills.length === 0) {
    return { status: "no-program" };
  }

  // 2) Recent clip logs (last 10) → aggregate
  const { data: clipRows } = await supabase
    .from("clip_logs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);

  const clips = (clipRows ?? []).map(rowToClipLog);
  const recentClipHistory = clips.length > 0 ? aggregateClipHistory(clips, new Date()) : null;

  // 3) Focus areas + recent training sessions → neglected names
  const { data: focusRows } = await supabase
    .from("focus_areas")
    .select("id, name, dimension, knowledge_node_slug, status")
    .eq("user_id", userId);

  const { data: sessionRows } = await supabase
    .from("training_sessions")
    .select("summary")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const focusAreas = (focusRows ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessions = (sessionRows ?? []) as any[];
  const neglectedFocusAreas = computeNeglected(focusAreas, sessions);

  // 4) Style summary (one-line)
  const styleSummary = (styleRow?.style_name as string | undefined) ?? null;

  return {
    drillProgram,
    recentClipHistory,
    neglectedFocusAreas,
    styleSummary,
  };
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    if (!userId || userId === "anon") {
      return NextResponse.json({ status: "error", message: "userId required" }, { status: 400 });
    }
    const todayParam = url.searchParams.get("today");
    const today = todayParam ?? utcDateString(new Date());

    const limited = await enforceRateLimit(request);
    if (limited) return limited;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createServerClient() as any;

    // 1) Cache check
    const { data: existing } = await supabase
      .from("daily_drill_picks")
      .select("*")
      .eq("user_id", userId)
      .eq("drill_date", today)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ status: "ok", pick: rowToPick(existing) });
    }

    // 2) Gather inputs
    const inputs = await gatherInputs(supabase, userId);
    if ("status" in inputs && inputs.status === "no-program") {
      return NextResponse.json({
        status: "no-program",
        message: "Take the style quiz first to get your drill program.",
      });
    }
    const diagnosisInputs = inputs as DiagnosisInputs;

    // 3) Build prompt + call LLM + validate
    const prompt = buildPickerPrompt(diagnosisInputs);
    const llmResult = await pickDrillViaLLM(prompt.systemPrompt, prompt.userPayload);

    let drillId: string;
    let diagnosis: string;
    if (llmResult.status === "ok") {
      const validation = validateLLMPick(llmResult.raw, prompt.validDrillIds);
      if (validation.status === "ok") {
        drillId = validation.drillId;
        diagnosis = validation.diagnosis;
      } else {
        // LLM picked invalid drill — fall back
        console.error("[today-drill] LLM returned invalid pick:", validation);
        drillId = prompt.validDrillIds[0];
        diagnosis = "Default starter drill while we calibrate to your style.";
      }
    } else {
      // LLM failed — fall back
      console.error("[today-drill] LLM failed:", llmResult);
      drillId = prompt.validDrillIds[0];
      diagnosis = "Default starter drill while we calibrate to your style.";
    }

    // 4) Persist (handle UNIQUE collision from concurrent requests)
    const drillSnapshot = diagnosisInputs.drillProgram.drills.find((d) => d.id === drillId)!;

    const { data: inserted, error: insertError } = await supabase
      .from("daily_drill_picks")
      .insert({
        user_id: userId,
        drill_date: today,
        drill_id: drillId,
        drill_snapshot: drillSnapshot,
        diagnosis,
      })
      .select("*")
      .maybeSingle();

    if (insertError) {
      // Likely a UNIQUE collision from a concurrent request — re-SELECT.
      const { data: existing2 } = await supabase
        .from("daily_drill_picks")
        .select("*")
        .eq("user_id", userId)
        .eq("drill_date", today)
        .maybeSingle();
      if (existing2) {
        return NextResponse.json({ status: "ok", pick: rowToPick(existing2) });
      }
      console.error("[today-drill] insert failed:", insertError);
      return NextResponse.json({ status: "error", message: "Failed to save pick" }, { status: 500 });
    }

    return NextResponse.json({ status: "ok", pick: rowToPick(inserted) });
  } catch (err) {
    console.error("[today-drill] GET threw:", err);
    return NextResponse.json({ status: "error", message: "Server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    if (!userId || userId === "anon") {
      return NextResponse.json({ status: "error", message: "userId required" }, { status: 400 });
    }
    const todayParam = url.searchParams.get("today");
    const today = todayParam ?? utcDateString(new Date());

    const raw = await request.json();
    const parsed = dailyDrillPickPatchSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { status: "error", message: "Invalid request", issues: parsed.error.issues },
        { status: 400 }
      );
    }
    const { action } = parsed.data;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createServerClient() as any;
    const update =
      action === "complete"
        ? { completed_at: new Date().toISOString() }
        : { skipped_at: new Date().toISOString() };

    const { error } = await supabase
      .from("daily_drill_picks")
      .update(update)
      .eq("user_id", userId)
      .eq("drill_date", today);

    if (error) {
      console.error("[today-drill] PATCH failed:", error);
      return NextResponse.json({ status: "error", message: "Failed to update" }, { status: 500 });
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("[today-drill] PATCH threw:", err);
    return NextResponse.json({ status: "error", message: "Server error" }, { status: 500 });
  }
}
