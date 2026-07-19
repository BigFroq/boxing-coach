import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clipReviewRequestSchema } from "@/lib/validation";
import { withRetry } from "@/lib/retry";
import { createServerClient } from "@/lib/supabase";
import { buildAnalysisPrompt, PROMPT_VERSION } from "@/lib/clip-review-prompt";
import { readClipReviewInstructions } from "@/lib/clip-review-instructions";
import { punchLabel } from "@/lib/punch-types";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Recent coach corrections become calibration examples appended to the system
// prompt. Best-effort: any failure returns "" and the analysis runs uncalibrated.
// ponytail: last-5 injection, no retrieval — add relevance ranking when the
// corrections table outgrows a flat tail.
async function fetchCalibrationBlock(): Promise<string> {
  try {
    const supabase = createServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = (await supabase
      .from("clip_corrections")
      .select("phase, ai_score, ai_feedback, corrected_score, note")
      .order("created_at", { ascending: false })
      .limit(5)) as { data: any[] | null; error: unknown };
    if (error || !data || data.length === 0) return "";
    const examples = data
      .map((c) => {
        const parts = [
          `- ${c.phase}: the analyst scored ${c.ai_score ?? "?"}/10` +
            (c.ai_feedback ? ` saying "${c.ai_feedback}"` : ""),
          `the coach corrected this to ${c.corrected_score}/10`,
          c.note ? `because: "${c.note}"` : "",
        ];
        return parts.filter(Boolean).join("; ");
      })
      .join("\n");
    return `\n\n## Coach calibration
Dr. Wiant has reviewed past analyses from this system and corrected them. Calibrate your scoring and attention to match his standard:
${examples}`;
  } catch (err) {
    console.error("[clip-review] calibration fetch failed:", err);
    return "";
  }
}

export async function POST(request: NextRequest) {
  try {
    const raw = await request.json();
    const parsed = clipReviewRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", issues: parsed.error.issues },
        { status: 400 }
      );
    }
    const { frames, fps, filename, punchType } = parsed.data;

    const limited = await enforceRateLimit(request);
    if (limited) return limited;

    const safeName = (filename ?? "").replace(/[^\w\s\-.]/g, "").slice(0, 100) || "clip";
    const declaredPunch = punchLabel(punchType);

    const content: Anthropic.Messages.ContentBlockParam[] = [
      {
        type: "text",
        text: `Analyze these ${frames.length} sequential frames from a short boxing clip (${safeName}). The frames are at ${fps ?? 5}fps — closely spaced so you can see movement progression.${
          punchType && punchType !== "general"
            ? ` The fighter says this clip is a ${declaredPunch}.`
            : " The fighter did not specify which punch this is — identify it yourself, name it in the summary, and assess accordingly."
        } Analyze the technique using the 4-phase framework.`,
      },
      ...frames.map(
        (frame: string) =>
          ({
            type: "image",
            source: { type: "base64", media_type: "image/jpeg", data: frame },
          }) as Anthropic.Messages.ImageBlockParam
      ),
      {
        type: "text",
        text: "Analyze the technique. Return ONLY valid JSON matching the specified format.",
      },
    ];

    // A punch with no instruction file yet falls back to the generic prompt
    // rather than failing the request.
    const [instructions, calibration] = await Promise.all([
      punchType && punchType !== "general"
        ? readClipReviewInstructions(punchType)
        : Promise.resolve(null),
      fetchCalibrationBlock(),
    ]);
    if (punchType && punchType !== "general" && !instructions) {
      console.warn(
        `[clip-review] no instruction file for punch "${punchType}" — using generic prompt`
      );
    }

    const response = await withRetry(
      () =>
        anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 2048,
          system: buildAnalysisPrompt({ punchType, instructions, calibration }),
          messages: [{ role: "user", content }],
        }),
      { label: "clip-review", maxAttempts: 3 }
    );

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    let jsonStr = text;
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();

    let analysis;
    try {
      analysis = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse analysis JSON:", jsonStr.slice(0, 200));
      return NextResponse.json(
        { error: "Failed to parse analysis. Please try again." },
        { status: 422 }
      );
    }

    // promptVersion travels back so the client can store which prompt shape
    // produced these scores — punch-specific scoring is not comparable to v1.
    return NextResponse.json({ ...analysis, promptVersion: PROMPT_VERSION });
  } catch (error) {
    console.error("Clip review error:", error);
    const msg = error instanceof Error ? error.message.toLowerCase() : "";
    if (/credit balance|quota|insufficient_quota|billing/i.test(msg)) {
      return NextResponse.json(
        { error: "Clip analysis is temporarily unavailable. Please try again later." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Failed to analyze clip" }, { status: 500 });
  }
}
