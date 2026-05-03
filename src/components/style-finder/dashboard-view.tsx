"use client";

import { useState } from "react";
import { Share2, MessageSquare, Sparkles, TrendingUp, Users, Target, Flame } from "lucide-react";
import { RadarChart } from "./radar-chart";
import { DimensionDrawer } from "./dimension-drawer";
import type { DimensionKey } from "@/lib/dimensions";
import { DimensionBars } from "./dimension-bars";
import { FighterMatchCard } from "./fighter-match-card";
import { FighterCounterCard } from "./fighter-counter-card";
import { RetakeComparison } from "./retake-comparison";
import { ChatTab } from "@/components/chat-tab";
import type { Suggestion } from "@/components/chat-tab";
import type { DimensionScores } from "@/data/fighter-profiles";
import { DIMENSION_LABELS } from "@/data/fighter-profiles";

// Stable non-crypto hash for namespacing anonymous/local storage keys.
// DJB2 is deterministic across retakes for the same style result.
function hashProfile(r: { style_name?: string; dimension_scores?: DimensionScores }): string {
  const s = (r.style_name ?? "") + "|" + JSON.stringify(r.dimension_scores ?? {});
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
}

export interface CounterExplanation {
  name: string;
  slug: string;
  attack_vector: string;
  paragraph: string;
  exploited_dimensions: Array<{
    dimension: string;
    user_score: number;
    fighter_score: number;
    gap: number;
  }>;
  one_shot_notes: string | null;
  recommended_drills: Array<{ slug: string; name: string; why: string }>;
  citations: Array<{ title: string; url_or_path: string }>;
}

export interface StyleProfileResult {
  style_name: string;
  description: string;
  dimension_scores: DimensionScores;
  fighter_explanations: { name: string; explanation: string }[];
  matched_fighters: { name: string; slug: string; overlappingDimensions: (keyof DimensionScores)[] }[];
  counter_fighters: CounterExplanation[];
  strengths: string[];
  growth_areas: { dimension: string; advice: string }[];
  punches_to_master: string[];
  stance_recommendation: string;
  training_priorities: string[];
  punch_doctor_insight: string;
}

interface DashboardViewProps {
  result: StyleProfileResult;
  physicalContext: { height: string; build: string; reach: string; stance: string };
  experienceLevel: string;
  previousScores?: DimensionScores;
  onRetake: () => void;
  onAskCoach?: (query: string) => void;
  profileId?: string;
  missingQuestionCount: number;
  onRefineClick: () => void;
  narrativeStale: boolean;
  onRefreshNarrative: () => void;
  error?: string | null;
}

function buildStyleSuggestions(result: StyleProfileResult): Suggestion[] {
  const suggestions: Suggestion[] = [];

  const topFighter = result.matched_fighters[0]?.name;
  if (topFighter) {
    suggestions.push({
      text: `Why does my style match ${topFighter}?`,
      Icon: Users,
    });
  }

  // Lowest dimension score = biggest growth lever
  const dimEntries = Object.entries(result.dimension_scores) as [keyof DimensionScores, number][];
  if (dimEntries.length > 0) {
    const [lowestKey] = dimEntries.reduce((min, cur) => (cur[1] < min[1] ? cur : min));
    const lowestLabel = DIMENSION_LABELS[lowestKey] ?? lowestKey;
    suggestions.push({
      text: `How do I improve my ${lowestLabel.toLowerCase()}?`,
      Icon: TrendingUp,
    });
  }

  const firstGrowth = result.growth_areas[0];
  if (firstGrowth) {
    suggestions.push({
      text: `Give me a drill for my ${firstGrowth.dimension.toLowerCase()}`,
      Icon: Target,
    });
  }

  if (result.punches_to_master.length > 0) {
    suggestions.push({
      text: `Walk me through the mechanics of a ${result.punches_to_master[0].toLowerCase()}`,
      Icon: Flame,
    });
  }

  return suggestions.slice(0, 4);
}

interface StyleChatSectionProps {
  result: StyleProfileResult;
  physicalContext: { height: string; build: string; reach: string; stance: string };
  experienceLevel: string;
  profileId?: string;
}

function StyleChatSection({ result, physicalContext, experienceLevel, profileId }: StyleChatSectionProps) {
  const suggestions = buildStyleSuggestions(result);
  const extraContext = {
    styleProfile: {
      style_name: result.style_name,
      description: result.description,
      dimension_scores: result.dimension_scores,
      strengths: result.strengths,
      growth_areas: result.growth_areas,
      matched_fighters: result.matched_fighters.map((f) => ({ name: f.name })),
      punches_to_master: result.punches_to_master,
      stance_recommendation: result.stance_recommendation,
      training_priorities: result.training_priorities,
      physical_context: physicalContext,
      experience_level: experienceLevel,
    },
  };

  // Namespace conversation storage per profile so different profiles don't bleed into each other.
  // For anonymous/local profiles, hash the archetype + dimension scores so retakes don't
  // inherit the previous profile's chat history.
  const storageKeyOverride = `boxing-coach-chat-style-${profileId ?? `local-${hashProfile(result)}`}`;

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="px-5 pt-5 pb-3 border-b border-border flex items-center gap-2">
        <Sparkles size={16} className="text-accent" />
        <h3 className="text-sm font-semibold">Ask about your style</h3>
      </div>
      <div className="h-[640px]">
        <ChatTab
          systemContext="style"
          heroIcon={MessageSquare}
          heroTitle={`You're a ${result.style_name}. What do you want to dig into?`}
          heroSubtitle="Your full profile is loaded — dimension scores, matched fighters, growth areas. Ask anything and I'll tailor the answer to you."
          placeholder="Ask about your style, drills, matchups..."
          suggestions={suggestions}
          extraContext={extraContext}
          storageKeyOverride={storageKeyOverride}
        />
      </div>
    </div>
  );
}

const PHYSICAL_LABELS: Record<string, Record<string, string>> = {
  height: { short: "Under 5'7\"", average: "5'7\" – 6'0\"", tall: "Over 6'0\"" },
  build: { stocky: "Stocky / Muscular", lean: "Lean / Athletic", lanky: "Long / Lanky" },
  reach: { short: "Short reach", average: "Average reach", long: "Long reach" },
  stance: { orthodox: "Orthodox", southpaw: "Southpaw", switch: "Switch", unsure: "Not decided" },
};

export function DashboardView({
  result,
  physicalContext,
  experienceLevel,
  previousScores,
  onRetake,
  onAskCoach,
  profileId,
  missingQuestionCount,
  onRefineClick,
  narrativeStale,
  onRefreshNarrative,
  error,
}: DashboardViewProps) {
  const [drawerKey, setDrawerKey] = useState<DimensionKey | null>(null);

  const isBeginner = experienceLevel === "beginner" || experienceLevel === "intermediate";
  const tendencyLabel = isBeginner ? "Natural Tendencies" : "Your Strengths";
  const growthLabel = isBeginner ? "Areas to Develop" : "Growth Areas";

  async function handleShare() {
    if (profileId) {
      const url = `${window.location.origin}/profile/${profileId}`;
      await navigator.clipboard.writeText(url);
      alert("Profile link copied to clipboard!");
    }
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="max-w-2xl mx-auto w-full px-6 py-8 space-y-6">
        {/* Refinement banner */}
        {missingQuestionCount > 0 && !narrativeStale && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-accent/40 bg-accent/5 px-3 py-2">
            <div>
              <p className="text-sm font-medium">
                {missingQuestionCount === 1
                  ? "1 new question available"
                  : `${missingQuestionCount} new questions available`}
              </p>
              <p className="text-xs text-muted">
                Refine your profile (~{Math.max(1, Math.round(missingQuestionCount * 0.3))} min)
              </p>
            </div>
            <button
              type="button"
              onClick={onRefineClick}
              className="rounded-md bg-accent px-3 py-1.5 text-sm text-white"
            >
              Refine
            </button>
          </div>
        )}

        {/* Narrative-stale CTA */}
        {narrativeStale && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2">
            <div>
              <p className="text-sm font-medium">Your analysis is out of date</p>
              <p className="text-xs text-muted">
                Your scores have changed since this analysis was generated.
              </p>
            </div>
            <button
              type="button"
              onClick={onRefreshNarrative}
              className="rounded-md bg-amber-500 px-3 py-1.5 text-sm text-white"
            >
              Refresh my analysis
            </button>
          </div>
        )}

        {/* Regen error banner */}
        {error && (
          <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/5 px-3 py-2 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Physical Profile Card */}
        <div className="flex flex-wrap gap-3 justify-center">
          {Object.entries(physicalContext).map(([key, value]) => (
            <span
              key={key}
              className="px-3 py-1.5 bg-surface border border-border rounded-lg text-xs text-muted"
            >
              {PHYSICAL_LABELS[key]?.[value] ?? value}
            </span>
          ))}
        </div>

        {/* Style Header */}
        <div className="text-center">
          <p className="text-xs uppercase tracking-wider text-accent mb-2">Your fighting style</p>
          <h2 className="text-3xl font-bold mb-3">{result.style_name}</h2>
          <p className="text-muted text-sm leading-relaxed max-w-lg mx-auto">
            {result.description}
          </p>
        </div>

        {/* Radar Chart */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-accent mb-4 text-center">
            Dimensional Profile
          </h3>
          <div className="max-w-sm mx-auto">
            <RadarChart
              scores={result.dimension_scores}
              onDimensionClick={(k) => setDrawerKey(k as DimensionKey)}
            />
          </div>
        </div>

        {/* Dimension Bars */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-accent mb-3">Score Breakdown</h3>
          <DimensionBars scores={result.dimension_scores} />
        </div>

        {/* Retake Comparison */}
        {previousScores && (
          <RetakeComparison current={result.dimension_scores} previous={previousScores} />
        )}

        {/* Fighter Matches */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-accent mb-3">Fighters Who Match Your Profile</h3>
          <div className="space-y-4">
            {result.matched_fighters.map((mf, i) => {
              const explanation =
                result.fighter_explanations.find((fe) => fe.name === mf.name)?.explanation ?? null;
              return (
                <FighterMatchCard
                  key={mf.slug}
                  rank={i + 1}
                  fighter={{ name: mf.name, slug: mf.slug }}
                  explanation={explanation}
                  overlappingDimensions={
                    (mf.overlappingDimensions ?? []).map(
                      (d) => DIMENSION_LABELS[d as keyof DimensionScores] ?? d
                    )
                  }
                  onGenerateAnalysis={onRefreshNarrative}
                />
              );
            })}
          </div>
        </div>

        {/* Fighters Strongest Against You */}
        {result.counter_fighters.length > 0 && (
          <div className="bg-surface border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-red-400 mb-1">Fighters Strongest Against You</h3>
            <p className="text-xs text-muted mb-4">
              Archetypes that exploit your lowest dimensions. Train the gap, not the headline.
            </p>
            <div className="space-y-4">
              {result.counter_fighters.map((counter, i) => (
                <FighterCounterCard
                  key={counter.slug}
                  rank={i + 1}
                  counter={counter}
                  onAskMatchup={onAskCoach}
                />
              ))}
            </div>
          </div>
        )}

        {/* Strengths vs Growth Areas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-surface border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-blue-400 mb-3">{tendencyLabel}</h3>
            <ul className="space-y-1.5">
              {result.strengths.map((s, i) => (
                <li key={i} className="text-sm flex gap-2">
                  <span className="text-blue-400 shrink-0">-</span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-surface border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-red-400 mb-3">{growthLabel}</h3>
            <div className="space-y-3">
              {result.growth_areas.map((ga, i) => (
                <div key={i}>
                  <p className="text-sm">{ga.advice}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Technique Recommendations */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-accent mb-3">Punches to Master</h3>
          <div className="flex flex-wrap gap-2">
            {result.punches_to_master.map((p, i) => (
              <span
                key={i}
                className="px-3 py-1.5 bg-accent/10 border border-accent/20 rounded-lg text-sm text-accent"
              >
                {p}
              </span>
            ))}
          </div>
        </div>

        {/* Stance */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-accent mb-2">Stance Recommendation</h3>
          <p className="text-sm leading-relaxed">{result.stance_recommendation}</p>
        </div>

        {/* Training Priorities */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-accent mb-3">Training Priorities</h3>
          <ul className="space-y-1.5">
            {result.training_priorities.map((t, i) => (
              <li key={i} className="text-sm flex gap-2">
                <span className="text-green-500 shrink-0 font-semibold">{i + 1}.</span>
                {t}
              </li>
            ))}
          </ul>
        </div>

        {/* Punch Doctor Insight */}
        <div className="bg-accent/5 border border-accent/20 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-accent mb-2">Punch Doctor Insight</h3>
          <p className="text-sm leading-relaxed italic">{result.punch_doctor_insight}</p>
        </div>

        {/* Ask About Your Style — embedded chat */}
        <StyleChatSection
          result={result}
          physicalContext={physicalContext}
          experienceLevel={experienceLevel}
          profileId={profileId}
        />

        {/* Actions */}
        {profileId && (
          <div className="flex items-center justify-center pt-2">
            <button
              onClick={handleShare}
              className="flex items-center gap-2 text-sm text-muted hover:text-foreground transition-colors"
            >
              <Share2 size={14} />
              Share
            </button>
          </div>
        )}

        <footer className="mt-8 pt-4 border-t border-border text-center">
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Start over from a blank quiz? You'll lose your refinement progress on this profile.")) {
                onRetake();
              }
            }}
            className="text-xs text-muted hover:text-foreground underline-offset-2 hover:underline"
          >
            Start over with a blank quiz
          </button>
        </footer>
      </div>

      <DimensionDrawer
        dimensionKey={drawerKey}
        score={drawerKey ? result.dimension_scores[drawerKey] : 0}
        onClose={() => setDrawerKey(null)}
        onAskCoach={onAskCoach}
      />
    </div>
  );
}
