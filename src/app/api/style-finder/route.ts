import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { retrieveContext, formatChunksForPrompt } from "@/lib/graph-rag";
import { CORE_PRINCIPLES } from "@/lib/framework";
import { type DimensionScores, DIMENSION_LABELS, fighterProfiles } from "@/data/fighter-profiles";
import { matchCounters, ATTACK_VECTORS, type CounterMatch, type AttackVectorId } from "@/lib/fighter-counter-matching";
import { readFighterVaultEntry } from "@/lib/vault-reader";
import { VAULT_SLUGS } from "@/lib/dimensions";

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

function buildCounterQuery(fighterName: string, vectorLabel: string, exploitedLabels: string[]): string {
  const dims = exploitedLabels.join(", ").toLowerCase();
  return `${vectorLabel.toLowerCase()} ${fighterName} exploits ${dims} defensive vulnerability drills training counter`;
}

function attackVectorLabel(id: AttackVectorId): string {
  const v = ATTACK_VECTORS.find((a) => a.id === id);
  return v ? v.label : id;
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

interface CounterContext {
  counter: CounterMatch;
  vaultEntry: string | null;
  ragContext: string;
}

function buildPrompt(
  dimensionScores: DimensionScores,
  topDimensions: { key: keyof DimensionScores; label: string; score: number }[],
  bottomDimensions: { key: keyof DimensionScores; label: string; score: number }[],
  matchedFighters: { name: string; slug: string; overlappingDimensions: string[]; source?: "alex" | "public" }[],
  counterContexts: CounterContext[],
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
    .map((f) => {
      const sourceTag = f.source === "public"
        ? " [public-knowledge — no Alex-specific teachings; describe archetype generally without 'Alex said' attribution]"
        : "";
      return `  - ${f.name} (overlapping dimensions: ${f.overlappingDimensions.join(", ")})${sourceTag}`;
    })
    .join("\n");

  // ---- Counter analysis block (only when counters exist) ----
  let counterBlock = "";
  if (counterContexts.length > 0) {
    counterBlock =
      `\n\n## Counter Matchups (these fighters exploit the user's weaknesses)\n` +
      `DO NOT pick or reorder counters — the ranking is deterministic. Write one \`counter_explanations\` entry per counter, in the order given.\n\n` +
      counterContexts.map((ctx, i) => {
        const c = ctx.counter;
        const exploited = c.exploitedDimensions
          .map((d) => `${DIMENSION_LABELS[d.dimension]} (user ${d.user_score}, fighter ${d.fighter_score}, gap +${d.gap})`)
          .join("\n  - ");
        const oneShots = c.oneShotDominance.length > 0
          ? c.oneShotDominance.map((d) => DIMENSION_LABELS[d]).join(", ")
          : "none";
        return `### Counter ${i + 1}: ${c.fighter.name} (${attackVectorLabel(c.primaryAttackVector)})

Threat score: ${c.threatScore.toFixed(1)}
Exploited dimensions:
  - ${exploited}
One-shot dominance (fighter ≥85 AND user ≤40 on same dim): ${oneShots}

Vault entry for ${c.fighter.name}:
${ctx.vaultEntry ?? "(vault entry unavailable — rely on retrieved context only)"}

Retrieved concepts and drills relevant to this matchup:
${ctx.ragContext || "(no additional chunks retrieved)"}`;
      }).join("\n\n---\n\n");
  }

  // ---- Counter schema injection into the JSON output ----
  const counterSchema = counterContexts.length > 0
    ? `,
  "counter_explanations": [
    {
      "name": "Fighter Name (echo from Counter ${counterContexts.length === 1 ? "1" : "N"} above)",
      "slug": "fighter-slug",
      "attack_vector": "Power Puncher | Pressure Fighter | Technical Boxer | Defensive Sniper",
      "paragraph": "150-200 words. Analytical, specific. Cite Alex's vault teachings. Explain HOW this archetype attacks, WHY it exploits this user's profile, WHAT happens tactically in the exchange, and END with a concrete training direction tied to the user's weakest defensive counterpart.",
      "exploited_dimensions": [{ "dimension": "Power Mechanics", "user_score": 35, "fighter_score": 92, "gap": 57 }],
      "one_shot_notes": "If any one-shot dims exist for this counter, describe the kill-shot dynamic in one sentence. Otherwise null.",
      "recommended_drills": [
        { "slug": "hip-rotation-drill", "name": "Hip Rotation Drill", "why": "Single sentence tying the drill to the exploited gap. MUST use a slug from the provided VAULT_SLUGS list." }
      ],
      "citations": [{ "title": "Vault source title", "url_or_path": "vault/path/or/url" }]
    }
  ]`
    : "";

  return `You are Dr. Alex Wiant's AI style advisor. You help people find their fighting style based on his Power Punching Blueprint methodology.

## Alex's Core Principles
${CORE_PRINCIPLES.map((p) => `- ${p}`).join("\n")}

## Retrieved Vault Content (style-level)
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
${fighterList}${counterBlock}

## Experience-Aware Language
${experienceNote}

## Your Task
Generate ONLY the qualitative content below. The dimension scores, fighter matches, and counter matchups are already decided — your job is to explain and advise.

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
  "punches_to_master": ["Punch 1", "Punch 2", "..."],
  "stance_recommendation": "Specific stance advice based on their physical attributes and style",
  "training_priorities": ["Priority 1", "Priority 2", "Priority 3", "Priority 4"],
  "punch_doctor_insight": "A specific insight from Alex's vault content that's particularly relevant for this user"${counterSchema}
}

Rules:
- fighter_explanations: one entry per matched fighter (${matchedFighters.length} total). Reference specific things Alex said when the fighter is Alex-sourced.
- If a fighter is tagged \`[public-knowledge — no Alex-specific teachings...]\` in the matched-fighter list above, OR their vault entry declares \`source: public-analysis\` in its frontmatter (kickboxers, Muay Thai fighters, Skillr-Boxing-sourced entries, historic boxers Alex hasn't specifically covered), treat that fighter as a public-knowledge summary — describe the archetype in general terms, do NOT attribute quotes or specific teachings to Alex Wiant for that fighter, and do NOT fabricate an "Alex said..." framing. Ground the recommendation in Alex's broader principles instead. If the vault entry cites Skillr Boxing's breakdown, you may reference that framing explicitly (e.g. "Skillr Boxing characterizes this style as...") but do NOT attribute it to Alex.
- strengths: exactly 4, based on top dimensions.
- growth_areas: exactly 3, based on bottom dimensions. Each must have actionable advice.
- training_priorities: exactly 4 items.
- Ground recommendations in the retrieved vault content. Reference specific analyses.${counterContexts.length > 0 ? `
- counter_explanations: exactly ${counterContexts.length} entries, in the SAME ORDER as the Counter Matchups above. Never skip, reorder, or invent fighters.
- Each counter paragraph: 150-200 words, vault-grounded. Cite specific teachings from the fighter's vault entry AND the retrieved chunks. No invented facts.
- Each recommended_drills slug MUST appear in this list: ${VAULT_SLUGS.join(", ")}. Drills not in this list will be dropped.` : ""}
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

    // Compute counters (server-side, excluding matched fighters)
    const matchedSlugs = (matched_fighters as Array<{ slug: string }>).map((m) => m.slug);
    const counters: CounterMatch[] = matchCounters(scores, matchedSlugs, 3);

    // Enrich matched fighters with source flag (alex|public) so the prompt can
    // tell the LLM not to fabricate Alex quotes for public-knowledge entries.
    const enrichedMatchedFighters = (matched_fighters as Array<{ name: string; slug: string; overlappingDimensions: string[] }>).map((m) => {
      const profile = fighterProfiles.find((f) => f.slug === m.slug);
      return { ...m, source: profile?.source };
    });

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

    // Gather per-counter context in parallel: vault entry + targeted RAG
    const counterContexts: CounterContext[] = await Promise.all(
      counters.map(async (c) => {
        const vectorLabel = attackVectorLabel(c.primaryAttackVector);
        const exploitedLabels = c.exploitedDimensions.map((d) => DIMENSION_LABELS[d.dimension]);
        const query = buildCounterQuery(c.fighter.name, vectorLabel, exploitedLabels);

        const [vaultEntry, ragResult] = await Promise.all([
          readFighterVaultEntry(c.fighter.slug),
          withRetry(() =>
            retrieveContext(query, { count: 6, categories: ["analysis", "mechanics", "drill"] })
          ).catch(() => ({ chunks: [], citations: [] })),
        ]);

        return {
          counter: c,
          vaultEntry,
          ragContext: formatChunksForPrompt(ragResult.chunks),
        };
      })
    );

    // Build prompt
    const systemPrompt = buildPrompt(
      scores,
      topDimensions,
      bottomDimensions,
      enrichedMatchedFighters,
      counterContexts,
      physical_context,
      experience_level,
      ragContext
    );

    // Call Claude with retry
    const response = await withRetry(() =>
      anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
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

    // Validate counter_explanations: drop drills with unknown slugs; tolerate missing array.
    const rawCounters = Array.isArray(result.counter_explanations) ? result.counter_explanations : [];
    const validatedCounters = rawCounters.map((entry: unknown) => {
      const e = entry as Record<string, unknown>;
      const drills = Array.isArray(e.recommended_drills) ? e.recommended_drills : [];
      const validDrills = drills.filter((d: unknown) => {
        const drill = d as { slug?: unknown };
        return typeof drill.slug === "string" && (VAULT_SLUGS as readonly string[]).includes(drill.slug);
      });
      return {
        name: typeof e.name === "string" ? e.name : "",
        slug: typeof e.slug === "string" ? e.slug : "",
        attack_vector: typeof e.attack_vector === "string" ? e.attack_vector : "",
        paragraph: typeof e.paragraph === "string" ? e.paragraph : "",
        exploited_dimensions: Array.isArray(e.exploited_dimensions) ? e.exploited_dimensions : [],
        one_shot_notes: typeof e.one_shot_notes === "string" ? e.one_shot_notes : null,
        recommended_drills: validDrills,
        citations: Array.isArray(e.citations) ? e.citations : [],
      };
    });

    // Cross-check: the LLM was told to echo counter slugs in the same order as our ranking.
    // If slugs mismatch, log a warning — paragraphs may have been attached to the wrong fighter.
    // We don't reorder (that would silently misrepresent the ranking); log only so this surfaces.
    for (let i = 0; i < Math.min(validatedCounters.length, counters.length); i++) {
      const expected = counters[i].fighter.slug;
      const got = validatedCounters[i].slug;
      if (got !== expected) {
        console.warn(
          `counter_explanations[${i}].slug mismatch: expected "${expected}", got "${got}". Paragraphs may be attributed to the wrong fighter.`
        );
      }
    }

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
      counter_fighters: validatedCounters,
      citations,
    });
  } catch (error) {
    console.error("Style finder error:", error);
    return NextResponse.json({ error: "Failed to analyze style" }, { status: 500 });
  }
}
