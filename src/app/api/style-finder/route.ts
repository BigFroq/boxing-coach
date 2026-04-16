import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { retrieveContext, formatChunksForPrompt, extractCitations } from "@/lib/graph-rag";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const STYLE_FINDER_PROMPT = `You are Dr. Alex Wiant's AI style advisor, trained on his Power Punching Blueprint methodology and his Punch Doctor YouTube fighter analysis library.

A user has answered a questionnaire about their physical attributes, fighting tendencies, experience level, and goals. Based on their answers AND the retrieved content from Alex's knowledge base, recommend a fighting style.

## Alex's Core Principles
- Punching is a THROW not a PUSH
- 4 phases: Load → Hip Explosion → Core Transfer → Follow Through
- Land with last 3 knuckles for maximum power and stability
- Wider stance for lower center of gravity
- Loose until impact — violent fist grab at contact
- Hip opening (jab/hook/uppercut) vs closing (straight/rear uppercut)
- The shoulder TRANSFERS energy, doesn't generate it

## Response Format
Return a JSON object:
{
  "style_name": "Creative style name (e.g., 'Counter-Punching Sniper', 'Pressure Destroyer')",
  "description": "2-3 sentences describing this style and why it fits",
  "reference_fighters": [
    { "name": "Fighter Name", "why": "Why this fighter is a good model — reference Alex's specific analysis" }
  ],
  "key_techniques": ["Technique 1", "Technique 2", "Technique 3", "Technique 4"],
  "training_focus": ["Priority 1", "Priority 2", "Priority 3"],
  "punches_to_master": ["Jab", "Straight", etc.],
  "stance_recommendation": "Specific stance advice",
  "alex_wiant_tip": "A specific tip from the retrieved content that's relevant for this user"
}

Ground your fighter recommendations in the retrieved content — reference specific things Alex said about these fighters. 2-3 reference fighters.`;

export async function POST(request: NextRequest) {
  try {
    const { answers } = await request.json();

    if (!answers || typeof answers !== "object") {
      return NextResponse.json({ error: "Answers required" }, { status: 400 });
    }

    const userProfile = Object.entries(answers)
      .map(([key, value]) => `${key}: ${value}`)
      .join("\n");

    // Build a search query from user profile to find relevant fighter analyses
    const searchQuery = `fighter style ${answers.temperament ?? ""} ${answers.speed_vs_power ?? ""} ${answers.build ?? ""} boxing analysis`;

    const { chunks, citations } = await retrieveContext(searchQuery, {
      count: 8,
      categories: ["analysis", "mechanics"],
    });

    const ragContext = formatChunksForPrompt(chunks);

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: STYLE_FINDER_PROMPT + "\n\n## Retrieved Fighter Analysis Content\n\n" + ragContext,
      messages: [
        {
          role: "user",
          content: `User profile:\n\n${userProfile}\n\nAnalyze their attributes and recommend a fighting style. Ground your recommendations in the retrieved content. Return ONLY valid JSON.`,
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    let jsonStr = text;
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();

    let result;
    try {
      result = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse style finder JSON:", jsonStr.slice(0, 200));
      return NextResponse.json(
        { error: "Failed to parse style recommendation. The model returned an unexpected format. Please try again." },
        { status: 422 }
      );
    }
    return NextResponse.json({ ...result, citations });
  } catch (error) {
    console.error("Style finder error:", error);
    return NextResponse.json({ error: "Failed to analyze style" }, { status: 500 });
  }
}
