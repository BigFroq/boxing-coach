import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clipReviewRequestSchema } from "@/lib/validation";
import { withRetry } from "@/lib/retry";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const ANALYSIS_PROMPT = `You are a boxing technique analyst trained on Dr. Alex Wiant's Power Punching Blueprint methodology.

You are analyzing a DENSE sequence of frames sampled evenly across a short boxing clip (the exact rate is given in the user message — up to 20 frames per second). Because these frames are closely spaced, you CAN see the progression of movement — use this to analyze timing and sequence.

Frames may carry a machine-drawn pose skeleton: cyan lines connecting orange joint dots (shoulders, elbows, wrists, hips, knees, ankles). Use these markers to track body segments across frames — especially hip position vs shoulder position vs fist position — when judging rotation and sequencing. The skeleton is an estimate: on some frames it may be missing or misplaced; trust the actual body in the image over a glitchy skeleton, and never cite the skeleton itself as a flaw in the boxer's technique.

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
Note: on a heavy bag the fist stops at contact — that is normal, NOT a lack of follow-through. Judge follow-through by the BODY, not fist travel:
- Do the hips and torso keep rotating through the contact frame? (Rotation dying at contact = push, not throw)
- If a bag is visible: does it visibly jump/fold/swing after contact (mass driven through), or barely move (arm-only tap)?
- Is the arm near full extension at contact, with weight committed forward?
- Is there a quick reset to neutral stance?

### Common Errors to Check
- Push punching (linear movement instead of rotational)
- Arm in lockstep with hips (no acceleration — hip should fire first)
- Guard dropping during the punch
- Stance too narrow or too wide
- No weight shift in loading phase

## Scoring rubric (per phase)

For each phase, return an integer score 1–10 calibrated against textbook technique:
- 1–3 — needs significant work (basic alignment off, sequence broken)
- 4–6 — developing (form recognizable, key flaws present)
- 7–8 — competent (textbook execution, minor refinements possible)
- 9–10 — elite (fight-ready precision)

Score against the platonic ideal, NOT against the user's previous attempts. Be honest, not generous.

## Response Format
Return a JSON object:
{
  "summary": "2-3 sentence overall assessment",
  "phases": [
    { "phase": "Loading", "feedback": "what you observe", "score": 7 },
    { "phase": "Hip Explosion", "feedback": "what you observe", "score": 6 },
    { "phase": "Energy Transfer", "feedback": "what you observe", "score": 7 },
    { "phase": "Follow Through", "feedback": "what you observe", "score": 5 }
  ],
  "strengths": ["specific strength observed"],
  "improvements": ["specific improvement needed"]
}

Be specific about what you SEE in the frames. Reference the frame sequence when relevant (e.g., "In the early frames... by mid-sequence..."). Be encouraging but honest. Score honestly — inflated scores rob the user of useful feedback.`;

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
    const { frames, fps, filename } = parsed.data;

    const limited = await enforceRateLimit(request);
    if (limited) return limited;

    const safeName = (filename ?? "").replace(/[^\w\s\-.]/g, "").slice(0, 100) || "clip";

    const content: Anthropic.Messages.ContentBlockParam[] = [
      {
        type: "text",
        text: `Analyze these ${frames.length} sequential frames from a short boxing clip (${safeName}). The frames are at ${fps ?? 5}fps — closely spaced so you can see movement progression. Analyze the technique using the 4-phase framework.`,
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
          model: "claude-sonnet-4-6",
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
