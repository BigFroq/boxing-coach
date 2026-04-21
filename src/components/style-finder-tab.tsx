"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Questionnaire } from "./style-finder/questionnaire";
import { ResultsProfile } from "./style-finder/results-profile";
import type { StyleProfileResult } from "./style-finder/results-profile";
import type { DimensionScores } from "@/data/fighter-profiles";
import { computeDimensionScores } from "@/lib/dimension-scoring";
import { matchFighters } from "@/lib/fighter-matching";
import { createBrowserClient } from "@/lib/supabase-browser";

type ViewState = "quiz" | "loading" | "results";

interface StyleFinderTabProps {
  userId: string;
  onSwitchToChat?: (query: string) => void;
}

export function StyleFinderTab({ userId, onSwitchToChat }: StyleFinderTabProps) {
  const [view, setView] = useState<ViewState>("quiz");
  const [result, setResult] = useState<StyleProfileResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [physicalContext, setPhysicalContext] = useState({ height: "", build: "", reach: "", stance: "" });
  const [experienceLevel, setExperienceLevel] = useState("beginner");
  const [previousScores, setPreviousScores] = useState<DimensionScores | undefined>();
  const [profileId, setProfileId] = useState<string | undefined>();

  // Check for existing saved profile on mount
  // Load saved profile on mount (try Supabase if authed, then localStorage)
  useEffect(() => {
    async function load() {
      try {
        const supabase = createBrowserClient();
        const { data: authData } = await supabase.auth.getUser();
        if (authData.user) {
          const { data } = await supabase
            .from("style_profiles")
            .select("*")
            .eq("user_id", authData.user.id)
            .eq("is_current", true)
            .single() as { data: Record<string, unknown> | null };
          if (data) {
            setResult({
              ...(data.ai_result as Omit<StyleProfileResult, "dimension_scores" | "matched_fighters" | "counter_fighters">),
              dimension_scores: data.dimension_scores as DimensionScores,
              matched_fighters: data.matched_fighters as StyleProfileResult["matched_fighters"],
              counter_fighters: (data.counter_fighters as StyleProfileResult["counter_fighters"]) ?? [],
            });
            setPhysicalContext(data.physical_context as typeof physicalContext);
            setExperienceLevel((data.experience_level as string) ?? "beginner");
            setProfileId(data.id as string);
            setView("results");
            return;
          }
        }
      } catch {
        // not authed or Supabase unavailable
      }

      // Fallback: check localStorage
      try {
        const saved = localStorage.getItem("boxing-coach-style-profile");
        if (saved) {
          const parsed = JSON.parse(saved);
          setResult(parsed.result);
          setPhysicalContext(parsed.physicalContext);
          setExperienceLevel(parsed.experienceLevel);
          setView("results");
        }
      } catch {
        // ignore
      }
    }
    load();
  }, [userId]);

  async function handleQuizComplete(answers: Record<string, string | string[] | number>) {
    setView("loading");
    setError(null);

    const physical = {
      height: answers.height as string ?? "",
      build: answers.build as string ?? "",
      reach: answers.reach as string ?? "",
      stance: answers.stance as string ?? "",
    };
    setPhysicalContext(physical);

    const expLevel = (answers.experience as string) ?? "beginner";
    setExperienceLevel(expLevel);

    // Deterministic scoring
    const dimensionScores = computeDimensionScores(answers);
    const matches = matchFighters(dimensionScores, 3);

    try {
      const res = await fetch("/api/style-finder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers,
          dimension_scores: dimensionScores,
          physical_context: physical,
          matched_fighters: matches.map((m) => ({
            name: m.fighter.name,
            slug: m.fighter.slug,
            overlappingDimensions: m.overlappingDimensions,
          })),
          experience_level: expLevel,
        }),
      });

      if (!res.ok) throw new Error("Failed to get recommendation");

      const data = await res.json();

      const profileResult: StyleProfileResult = {
        style_name: data.style_name,
        description: data.description,
        dimension_scores: dimensionScores,
        fighter_explanations: data.fighter_explanations,
        matched_fighters: matches.map((m) => ({
          name: m.fighter.name,
          slug: m.fighter.slug,
          overlappingDimensions: m.overlappingDimensions,
        })),
        counter_fighters: Array.isArray(data.counter_fighters) ? data.counter_fighters : [],
        strengths: data.strengths,
        growth_areas: data.growth_areas,
        punches_to_master: data.punches_to_master,
        stance_recommendation: data.stance_recommendation,
        training_priorities: data.training_priorities,
        punch_doctor_insight: data.punch_doctor_insight,
      };

      setResult(profileResult);

      // Save to localStorage always
      try {
        localStorage.setItem("boxing-coach-style-profile", JSON.stringify({
          result: profileResult,
          physicalContext: physical,
          experienceLevel: expLevel,
        }));
        localStorage.removeItem("boxing-coach-quiz-progress");
      } catch {
        // ignore
      }

      // Try to save to Supabase if authed
      try {
        const supabase = createBrowserClient();
        const { data: authData } = await supabase.auth.getUser();
        if (authData.user) {
          // Fetch previous profile for comparison
          const { data: prevProfile } = await supabase
            .from("style_profiles")
            .select("dimension_scores")
            .eq("user_id", authData.user.id)
            .eq("is_current", true)
            .single() as { data: { dimension_scores: DimensionScores } | null };

          if (prevProfile) {
            setPreviousScores(prevProfile.dimension_scores);
          }

          // Insert new profile (trigger will mark old ones as not current)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: newProfile } = await (supabase.from("style_profiles") as any)
            .insert({
              user_id: authData.user.id,
              answers,
              dimension_scores: dimensionScores,
              physical_context: physical,
              ai_result: data,
              matched_fighters: matches.map((m) => ({
                name: m.fighter.name,
                slug: m.fighter.slug,
                overlappingDimensions: m.overlappingDimensions,
              })),
              counter_fighters: Array.isArray(data.counter_fighters) ? data.counter_fighters : [],
            })
            .select("id")
            .single();

          if (newProfile) {
            setProfileId(newProfile.id);
          }

          // Clear quiz progress
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from("quiz_progress") as any)
            .delete()
            .eq("user_id", authData.user.id);
        }
      } catch {
        // Supabase save failed, localStorage already saved
      }

      setView("results");
    } catch {
      setError("Failed to generate style recommendation. Please try again.");
      setView("quiz");
    }
  }

  function handleRetake() {
    setResult(null);
    setPreviousScores(result?.dimension_scores);
    setProfileId(undefined);
    setView("quiz");
  }

  if (view === "loading") {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent mb-4" />
        <h2 className="text-lg font-semibold mb-1">Building your fighter profile</h2>
        <p className="text-sm text-muted">
          Scoring dimensions, matching fighters, generating insights...
        </p>
        {error && <p className="text-red-400 text-sm mt-4">{error}</p>}
      </div>
    );
  }

  if (view === "results" && result) {
    return (
      <ResultsProfile
        result={result}
        physicalContext={physicalContext}
        experienceLevel={experienceLevel}
        previousScores={previousScores}
        onRetake={handleRetake}
        onAskCoach={onSwitchToChat}
        profileId={profileId}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <Questionnaire userId={userId} onComplete={handleQuizComplete} />
    </div>
  );
}
