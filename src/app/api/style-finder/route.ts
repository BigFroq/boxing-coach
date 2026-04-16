import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { retrieveContext, formatChunksForPrompt } from "@/lib/graph-rag";
import { CORE_PRINCIPLES } from "@/lib/framework";
import { type DimensionScores, DIMENSION_LABELS } from "@/data/fighter-profiles";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ---------------------------------------------------------------------------
// Retry helper with exponential backoff (per CLAUDE.md rules)
// ---------------------------------------------------------------------------

async function withRetry<T>(
  fn: () => Promise<T>,
  { maxRetries = 3, baseDelayMs = 1000 }: { maxRetries?: number; baseDelayMs?: number } = {}
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 500;
        console.warn(`Retry ${attempt + 1}/${maxRetries} after ${Math.round(delay)}ms`, err);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTopDimensions(scores: DimensionScores, n: number): { key: keyof DimensionScores; label: string; score: number }[] {
  return (Object.entries(scores) as [keyof DimensionScores, number][])
    .sort(([, a], [, b]) => b - a)
    .slice(0, n)
    .map(([key, score]) => ({ key, label: DIMENSION_LABELS[key], score }));
}

function getBottomDimensions(scores: DimensionScores, n: number): { key: keyof DimensionScores; label: string; score: number }[] {
  return (Object.entries(scores) as [keyof DimensionScores, number][])
    .sort(([, a], [, b]) => a - b)
    .slice(0, n)
    .map(([key, score]) => ({ key, label: DIMENSION_LABELS[key], score }));
}

function buildSearchQuery(
  topDimensions: { label: string }[],
  physical: { height: string; build: string; reach: string; stance: string }
): string {
  const dimensionTerms = topDimensions.map((d) => d.label.toLowerCase()).join(" ");
  return `${dimensionTerms} ${physical.build} ${physical.height} ${physical.stance} boxing analysis`;
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function buildPrompt(
  dimensionScores: DimensionScores,
  topDimensions: { key: keyof DimensionScores; label: string; score: number }[],
  bottomDimensions: { key: keyof DimensionScores; label: string; score: number }[],
  matchedFighters: { name: string; slug: string; overlappingDimensions: string[] }[],
  physical: { height: string; build: string; reach: string; stance: string },
  experienceLevel: string,
  ragContext: string
): string {
  const experienceNote =
    experienceLevel === "beginner" || experienceLevel === "none"
      ? `The user is a BEGINNER. Use language like "natural tendencies", "instincts", "your body wants to...". Avoid jargon. Frame everything as potential to develop.`
      : `The user is EXPERIENCED (${experienceLevel}). Use language like "strengths", "your game", "you excel at...". Be specific about mechanics and strategy.`;

  const allScoresFormatted = (Object.entries(dimensionScores) as [keyof DimensionScores, number][])
    .map(([key, score]) => `  ${DIMENSION_LABELS[key]}: ${score}/100`)
    .join("\n");

  const topFormatted = topDimensions.map((d) => `  ${d.label}: ${d.score}/100`).join("\n");
  const bottomFormatted = bottomDimensions.map((d) => `  ${d.label}: ${d.score}/100`).join("\n");

  const fighterList = matchedFighters
    .map((f) => `  - ${f.name} (overlapping dimensions: ${f.overlappingDimensions.join(", ")})`)
    .join("\n");

  return `You are Dr. Alex Wiant's AI style advisor. You help people find their fighting style based on his Power Punching Blueprint methodology.

## Alex's Core Principles
${CORE_PRINCIPLES.map((p) => `- ${p}`).join("\n")}

## Retrieved Vault Content
${ragContext}

## User Profile
Physical: ${physical.height}, ${physical.build} build, ${physical.reach} reach, ${physical.stance} stance
Experience: ${experienceLevel}

## Pre-Computed Dimension Scores (DO NOT recalculate — use these exactly)
${allScoresFormatted}

Top 3 dimensions:
${topFormatted}

Bottom 3 dimensions:
${bottomFormatted}

## Matched Fighters (DO NOT pick different ones — explain these)
${fighterList}

## Experience-Aware Language
${experienceNote}

## Your Task
Generate ONLY the qualitative content below. The dimension scores and fighter matches are already decided — your job is to explain and advise.

Return a JSON object with this exact shape:
{
  "style_name": "Creative style name (e.g., 'Counter-Punching Sniper', 'Pressure Destroyer')",
  "description": "2-3 sentences describing this style and why it fits the user. Ground in Alex's methodology.",
  "fighter_explanations": [
    { "name": "Fighter Name", "explanation": "Why this fighter is a model for the user — reference Alex's specific analysis from the vault content" }
  ],
  "strengths": ["Top strength description 1", "Top strength description 2", "Top strength description 3", "Top strength description 4"],
  "growth_areas": [
    { "dimension": "Dimension Name", "advice": "Specific actionable advice grounded in Alex's methodology" }
  ],
  "punches_to_master": ["Punch 1", "Punch 2", ...],
  "stance_recommendation": "Specific stance advice based on their physical attributes and style",
  "training_priorities": ["Priority 1", "Priority 2", "Priority 3", "Priority 4"],
  "punch_doctor_insight": "A specific insight from Alex's vault content that's particularly relevant for this user"
}

Rules:
- fighter_explanations: one entry per matched fighter (${matchedFighters.length} total). Reference specific things Alex said.
- strengths: exactly 4, based on top dimensions.
- growth_areas: exactly 3, based on bottom dimensions. Each must have actionable advice.
- training_priorities: exactly 4 items.
- Ground recommendations in the retrieved vault content. Reference specific analyses.
- Return ONLY valid JSON. No markdown fences, no preamble.`;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      dimension_scores,
      physical_context,
      matched_fighters,
      experience_level,
    } = body;

    // Validation
    if (!dimension_scores || typeof dimension_scores !== "object") {
      return NextResponse.json({ error: "dimension_scores required" }, { status: 400 });
    }
    if (!physical_context || typeof physical_context !== "object") {
      return NextResponse.json({ error: "physical_context required" }, { status: 400 });
    }
    if (!matched_fighters || !Array.isArray(matched_fighters) || matched_fighters.length === 0) {
      return NextResponse.json({ error: "matched_fighters required (non-empty array)" }, { status: 400 });
    }
    if (!experience_level || typeof experience_level !== "string") {
      return NextResponse.json({ error: "experience_level required" }, { status: 400 });
    }

    const scores = dimension_scores as DimensionScores;
    const topDimensions = getTopDimensions(scores, 3);
    const bottomDimensions = getBottomDimensions(scores, 3);

    // Build RAG search query from top dimensions + physical context
    const searchQuery = buildSearchQuery(topDimensions, physical_context);

    // Retrieve vault content with retry
    const { chunks, citations } = await withRetry(() =>
      retrieveContext(searchQuery, {
        count: 8,
        categories: ["analysis", "mechanics"],
      })
    );

    const ragContext = formatChunksForPrompt(chunks);

    // Build prompt
    const systemPrompt = buildPrompt(
      scores,
      topDimensions,
      bottomDimensions,
      matched_fighters,
      physical_context,
      experience_level,
      ragContext
    );

    // Call Claude with retry
    const response = await withRetry(() =>
      anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: "Generate the style analysis JSON based on the profile and vault content above.",
          },
        ],
      })
    );

    const text = response.content[0].type === "text" ? response.content[0].text : "";

    // Strip markdown fences if present
    let jsonStr = text;
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();

    let result;
    try {
      result = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse style finder JSON:", jsonStr.slice(0, 300));
      return NextResponse.json(
        {
          error:
            "Failed to parse style recommendation. The model returned an unexpected format. Please try again.",
        },
        { status: 422 }
      );
    }

    // Echo back dimension_scores alongside the qualitative content
    return NextResponse.json({
      style_name: result.style_name,
      description: result.description,
      dimension_scores: scores,
      fighter_explanations: result.fighter_explanations,
      strengths: result.strengths,
      growth_areas: result.growth_areas,
      punches_to_master: result.punches_to_master,
      stance_recommendation: result.stance_recommendation,
      training_priorities: result.training_priorities,
      punch_doctor_insight: result.punch_doctor_insight,
      citations,
    });
  } catch (error) {
    console.error("Style finder error:", error);
    return NextResponse.json({ error: "Failed to analyze style" }, { status: 500 });
  }
}
