import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { retrieveContext, formatChunksForPrompt, extractCitations, type SourceCitation } from "@/lib/graph-rag";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const ANALYSIS_PROMPT = `You are Dr. Alex Wiant's AI boxing analysis assistant, trained on his Power Punching Blueprint methodology and Punch Doctor YouTube content.

You are analyzing a sequence of video frames from a fighter's training footage. Analyze using Alex's specific framework.

## What to Look For

### Stance & Foundation
- Stance width (wider than shoulder width per Alex's teaching)
- Center of gravity (low, pelvis sunk about an inch)
- Weight distribution and "bounce" — elastic readiness

### Phase 1: Loading
- Loading elastic potential energy into tissues
- Weight transfer to appropriate leg before punching
- Cross-body kinetic chains being pre-stretched

### Phase 2: Hip Explosion
- Visible hip rotation creating torque
- Hip OPENING for jab/hook/uppercut, CLOSING for straight/rear uppercut
- Hip moving BEFORE the arm (creating acceleration), not in lockstep

### Phase 3: Energy Transfer
- Core rotating after the hips
- Cross-body chains engaged (spiral line, functional lines)
- Arm loose until impact, punch follows slight arc (throw not push)

### Phase 4: Follow Through
- Follow through past impact point
- Weight transfer through target
- Quick reset to neutral stance

### Common Errors
- Push punching (linear/planar movement)
- Shoulder popping intentionally
- Breathing out at initiation
- Landing with first two knuckles instead of last three
- Arm in lockstep with hips (no acceleration)

## Response Format
Return a JSON object:
{
  "summary": "2-3 sentence overall assessment",
  "phases": [
    { "phase": "Phase 1: Loading", "feedback": "what you observe" },
    { "phase": "Phase 2: Hip Explosion", "feedback": "what you observe" },
    { "phase": "Phase 3: Energy Transfer", "feedback": "what you observe" },
    { "phase": "Phase 4: Follow Through", "feedback": "what you observe" }
  ],
  "strengths": ["specific strength"],
  "improvements": ["specific improvement"],
  "search_queries": ["query to find relevant coaching content for the main issues observed"]
}

The search_queries field should contain 1-3 short queries describing the key issues you'd want to look up in a coaching knowledge base (e.g., "hip rotation timing for hooks", "fixing push punch mechanics").

Be specific. Reference Alex's terminology. Be encouraging but honest.`;

export async function POST(request: NextRequest) {
  try {
    const { frames, filename } = await request.json();

    if (!frames || !Array.isArray(frames) || frames.length === 0) {
      return NextResponse.json({ error: "No frames provided" }, { status: 400 });
    }

    // Pass 1: Vision analysis
    const content: Anthropic.Messages.ContentBlockParam[] = [
      {
        type: "text",
        text: `Analyze these ${frames.length} sequential frames from a boxing/fighting video (${filename}). The frames are in chronological order.`,
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
        text: "Analyze the technique using Dr. Alex Wiant's methodology. Return ONLY valid JSON matching the specified format.",
      },
    ];

    const visionResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: ANALYSIS_PROMPT,
      messages: [{ role: "user", content }],
    });

    const visionText = visionResponse.content[0].type === "text" ? visionResponse.content[0].text : "";
    let jsonStr = visionText;
    const jsonMatch = visionText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();

    let analysis;
    try {
      analysis = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse vision analysis JSON:", jsonStr.slice(0, 200));
      return NextResponse.json(
        { error: "Failed to parse video analysis. The model returned an unexpected format. Please try again." },
        { status: 422 }
      );
    }

    // Pass 2: RAG grounding — retrieve relevant coaching content for the issues found
    const searchQueries: string[] = analysis.search_queries ?? [];
    let citations: SourceCitation[] = [];
    let coachingAdvice: string[] = [];

    if (searchQueries.length > 0) {
      // Parallel RAG retrieval
      const results = await Promise.all(
        searchQueries.slice(0, 3).map((q) => retrieveContext(q, { count: 4 }))
      );

      const allChunks = [];
      const seenIds = new Set<string>();
      for (const { chunks } of results) {
        for (const chunk of chunks) {
          const key = `${chunk.source_type}-${chunk.video_id ?? chunk.pdf_file}-${chunk.content.slice(0, 50)}`;
          if (!seenIds.has(key)) {
            seenIds.add(key);
            allChunks.push(chunk);
          }
        }
      }

      citations = extractCitations(allChunks.slice(0, 8));
      const ragContext = formatChunksForPrompt(allChunks.slice(0, 8));

      const adviceResponse = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: `You are Dr. Alex Wiant's coaching assistant. Based on a video analysis and relevant content from Alex's knowledge base, provide 2-4 specific, actionable coaching tips. Each tip should reference the specific content from Alex's videos or course. Keep each tip to 1-2 sentences. Return a JSON array of strings.`,
        messages: [
          {
            role: "user",
            content: `Video analysis summary: ${analysis.summary}\n\nImprovements needed: ${analysis.improvements.join("; ")}\n\nRelevant coaching content:\n${ragContext}\n\nReturn ONLY a JSON array of coaching tip strings.`,
          },
        ],
      });

      const adviceText = adviceResponse.content[0].type === "text" ? adviceResponse.content[0].text : "[]";
      let adviceJson = adviceText;
      const adviceMatch = adviceText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (adviceMatch) adviceJson = adviceMatch[1].trim();

      try {
        coachingAdvice = JSON.parse(adviceJson);
      } catch {
        coachingAdvice = [];
      }
    }

    delete analysis.search_queries;

    return NextResponse.json({
      ...analysis,
      coaching_advice: coachingAdvice,
      citations,
    });
  } catch (error) {
    console.error("Video review error:", error);
    return NextResponse.json({ error: "Failed to analyze video" }, { status: 500 });
  }
}
