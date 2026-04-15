import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const ANALYSIS_PROMPT = `You are Dr. Alex Wiant's AI boxing analysis assistant, trained on his Power Punching Blueprint methodology and Punch Doctor YouTube content.

You are analyzing a sequence of video frames from a fighter's training footage (sparring, bag work, or shadow boxing). Analyze the technique using Alex's specific framework.

## What to Look For

### Stance & Foundation
- Stance width (should be wider than shoulder width per Alex's teaching)
- Center of gravity (should be low, pelvis sunk about an inch)
- Weight distribution between legs
- "Bounce" — is there elastic readiness in the stance?

### Phase 1: Loading
- Is the fighter loading elastic potential energy into their tissues?
- Weight transfer to the appropriate leg before punching?
- Are cross-body kinetic chains being pre-stretched?
- Is there a visible "bounce" or weight shift before explosive movement?

### Phase 2: Hip Explosion
- Is there visible hip rotation creating torque?
- Hip OPENING for jab/hook/uppercut?
- Hip CLOSING for straight/rear uppercut?
- Is the hip moving BEFORE the arm (creating acceleration), or in lockstep (losing power)?

### Phase 3: Energy Transfer
- Is the core rotating after the hips?
- Are the cross-body chains visibly engaged (spiral line, functional lines)?
- Is the arm loose until impact?
- Does the punch follow a slight arc (throw) or straight line (push)?

### Phase 4: Follow Through
- Is there follow through past the point of impact?
- Weight transfer through the target?
- Arm unwinding/turning over?
- Quick reset back to neutral stance?

### Common Errors (from Alex's course)
- "Push punching" — treating punch as linear/planar movement
- Shoulder popping intentionally instead of letting energy transfer naturally
- Breathing out at initiation (losing intra-abdominal pressure)
- Landing with first two knuckles instead of last three
- Arm moving in lockstep with hips (no acceleration)
- Stance too narrow
- Tensing arm before impact instead of staying loose

## Response Format
Return a JSON object with this structure:
{
  "summary": "2-3 sentence overall assessment",
  "phases": [
    { "phase": "Phase 1: Loading", "feedback": "what you observe" },
    { "phase": "Phase 2: Hip Explosion", "feedback": "what you observe" },
    { "phase": "Phase 3: Energy Transfer", "feedback": "what you observe" },
    { "phase": "Phase 4: Follow Through", "feedback": "what you observe" }
  ],
  "strengths": ["specific thing done well", "another strength"],
  "improvements": ["specific actionable improvement", "another improvement"]
}

Be specific and reference Alex's terminology (kinetic chains, phases, torque, shearing force, etc.). Be encouraging but honest. If the video quality makes it hard to assess something, say so.`;

export async function POST(request: NextRequest) {
  try {
    const { frames, filename } = await request.json();

    if (!frames || !Array.isArray(frames) || frames.length === 0) {
      return NextResponse.json({ error: "No frames provided" }, { status: 400 });
    }

    // Build the content array with images
    const content: Anthropic.Messages.ContentBlockParam[] = [
      {
        type: "text",
        text: `Analyze these ${frames.length} sequential frames from a boxing/fighting video (${filename}). The frames are in chronological order, showing the fighter's technique over time.`,
      },
      ...frames.map(
        (frame: string, i: number) =>
          ({
            type: "image",
            source: {
              type: "base64",
              media_type: "image/jpeg",
              data: frame,
            },
          }) as Anthropic.Messages.ImageBlockParam
      ),
      {
        type: "text",
        text: "Now analyze the technique shown across these frames using Dr. Alex Wiant's methodology. Return ONLY valid JSON matching the format specified in your instructions.",
      },
    ];

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: ANALYSIS_PROMPT,
      messages: [{ role: "user", content }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";

    // Parse JSON from response (handle markdown code blocks)
    let jsonStr = text;
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    const analysis = JSON.parse(jsonStr);

    return NextResponse.json(analysis);
  } catch (error) {
    console.error("Video review error:", error);
    return NextResponse.json(
      { error: "Failed to analyze video" },
      { status: 500 }
    );
  }
}
