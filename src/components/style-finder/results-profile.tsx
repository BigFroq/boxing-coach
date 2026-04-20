"use client";

import { RotateCcw, Share2, MessageSquare, Sparkles, TrendingUp, Users, Target, Flame } from "lucide-react";
import { RadarChart } from "./radar-chart";
import { DimensionBars } from "./dimension-bars";
import { FighterMatchCard } from "./fighter-match-card";
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

export interface StyleProfileResult {
  style_name: string;
  description: string;
  dimension_scores: DimensionScores;
  fighter_explanations: { name: string; explanation: string }[];
  matched_fighters: { name: string; slug: string; overlappingDimensions: (keyof DimensionScores)[] }[];
  strengths: string[];
  growth_areas: { dimension: string; advice: string }[];
  punches_to_master: string[];
  stance_recommendation: string;
  training_priorities: string[];
  punch_doctor_insight: string;
}

interface ResultsProfileProps {
  result: StyleProfileResult;
  physicalContext: { height: string; build: string; reach: string; stance: string };
  experienceLevel: string;
  previousScores?: DimensionScores;
  onRetake: () => void;
  onAskCoach?: (query: string) => void;
  profileId?: string;
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

export function ResultsProfile({
  result,
  physicalContext,
  experienceLevel,
  previousScores,
  onRetake,
  onAskCoach,
  profileId,
}: ResultsProfileProps) {
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
          <p className="text-xs uppercase tracking-wider text-accent mb-2">Your Fighter Profile</p>
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
            <RadarChart scores={result.dimension_scores} />
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
            {result.fighter_explanations.map((fe, i) => {
              const match = result.matched_fighters[i];
              return (
                <FighterMatchCard
                  key={fe.name}
                  rank={i + 1}
                  fighter={{ name: fe.name, slug: match?.slug ?? "" }}
                  explanation={fe.explanation}
                  overlappingDimensions={
                    (match?.overlappingDimensions ?? []).map(
                      (d) => DIMENSION_LABELS[d as keyof DimensionScores] ?? d
                    )
                  }
                />
              );
            })}
          </div>
        </div>

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
                  {onAskCoach && (
                    <button
                      onClick={() =>
                        onAskCoach(
                          `How do I improve my ${ga.dimension.toLowerCase()}? My current profile shows it as a growth area.`
                        )
                      }
                      className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 mt-1 transition-colors"
                    >
                      <MessageSquare size={12} />
                      Ask the coach about this
                    </button>
                  )}
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
        <div className="flex items-center justify-center gap-4 pt-2">
          {profileId && (
            <button
              onClick={handleShare}
              className="flex items-center gap-2 text-sm text-muted hover:text-foreground transition-colors"
            >
              <Share2 size={14} />
              Share
            </button>
          )}
          <button
            onClick={onRetake}
            className="flex items-center gap-2 text-sm text-muted hover:text-foreground transition-colors"
          >
            <RotateCcw size={14} />
            Retake quiz
          </button>
        </div>
      </div>
    </div>
  );
}
