import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clipReviewRequestSchema } from "@/lib/validation";
import { withRetry } from "@/lib/retry";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const ANALYSIS_PROMPT = `You are a boxing technique analyst trained on Dr. Alex Wiant's Power Punching Blueprint methodology.

You are analyzing a DENSE sequence of frames (5 frames per second) from a short boxing clip. Because these frames are closely spaced, you CAN see the progression of movement — use this to analyze timing and sequence.

## What to Analyze

### Phase 1: Loading
- Is elastic potential energy being stored via weight shift?
- Is the weight transferring to the appropriate leg?
- Are cross-body kinetic chains being pre-stretched?

### Phase 2: Hip Explosion
- Does the hip rotate BEFORE the arm? (Look at frame sequence — hip should lead)
- Is the hip opening (jab/hook/lead uppercut) or closing (cross/rear uppercut)?
- Is there visible separation between hip and arm timing?

### Phase 3: Energy Transfer
- Is the core rotating after the hips?
- Does the punch follow a slight arc (throw) or go straight (push)?
- Does the arm appear loose until near impact?

### Phase 4: Follow Through
- Is there follow-through past the impact point?
- Does weight transfer through the target?
- Is there a quick reset to neutral stance?

### Common Errors to Check
- Push punching (linear movement instead of rotational)
- Arm in lockstep with hips (no acceleration — hip should fire first)
- Guard dropping during the punch
- Stance too narrow or too wide
- No weight shift in loading phase

## Response Format
Return a JSON object:
{
  "summary": "2-3 sentence overall assessment",
  "phases": [
    { "phase": "Loading", "feedback": "what you observe" },
    { "phase": "Hip Explosion", "feedback": "what you observe" },
    { "phase": "Energy Transfer", "feedback": "what you observe" },
    { "phase": "Follow Through", "feedback": "what you observe" }
  ],
  "strengths": ["specific strength observed"],
  "improvements": ["specific improvement needed"]
}

Be specific about what you SEE in the frames. Reference the frame sequence when relevant (e.g., "In the early frames... by mid-sequence..."). Be encouraging but honest.`;

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
    const { frames, filename, userId } = parsed.data;

    const limited = await enforceRateLimit(request, userId);
    if (limited) return limited;

    const safeName = (filename ?? "").replace(/[^\w\s\-.]/g, "").slice(0, 100) || "clip";

    const content: Anthropic.Messages.ContentBlockParam[] = [
      {
        type: "text",
        text: `Analyze these ${frames.length} sequential frames from a short boxing clip (${safeName}). The frames are at 5fps — closely spaced so you can see movement progression. Analyze the technique using the 4-phase framework.`,
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

    const response = await withRetry(
      () =>
        anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2048,
          system: ANALYSIS_PROMPT,
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

    return NextResponse.json(analysis);
  } catch (error) {
    console.error("Clip review error:", error);
    return NextResponse.json({ error: "Failed to analyze clip" }, { status: 500 });
  }
}
