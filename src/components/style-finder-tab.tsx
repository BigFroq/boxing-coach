"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Questionnaire } from "./style-finder/questionnaire";
import { DashboardView } from "./style-finder/dashboard-view";
import type { StyleProfileResult } from "./style-finder/dashboard-view";
import type { DimensionScores } from "@/data/fighter-profiles";
import { computeDimensionScores } from "@/lib/dimension-scoring";
import { matchFighters } from "@/lib/fighter-matching";
import { createBrowserClient } from "@/lib/supabase-browser";
import { allQuestions } from "@/data/questions";
import { compareTopFighters, getMissingQuestionIds } from "@/lib/profile-freshness";
import { mergeAnswersForRefinement } from "@/lib/style-profile-storage";
import { RefinementModal } from "./style-finder/refinement-modal";

type ViewState = "quiz" | "loading" | "dashboard";

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
  const [storedAnswers, setStoredAnswers] = useState<Record<string, string | string[] | number>>({});
  const [narrativeStale, setNarrativeStale] = useState(false);
  const [refinementOpen, setRefinementOpen] = useState(false);

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
            setStoredAnswers((data.answers as Record<string, string | string[] | number>) ?? {});
            setNarrativeStale(Boolean(data.narrative_stale));
            setView("dashboard");
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
          setResult({
            ...parsed.result,
            counter_fighters: parsed.result?.counter_fighters ?? [],
          });
          setPhysicalContext(parsed.physicalContext);
          setExperienceLevel(parsed.experienceLevel);
          setStoredAnswers(parsed.answers ?? {});
          setNarrativeStale(Boolean(parsed.narrativeStale));
          setView("dashboard");
        }
      } catch {
        // ignore
      }
    }
    load();
  }, [userId]);

  useEffect(() => {
    if (!result) return;
    const fresh = matchFighters(result.dimension_scores, 3);
    const freshPayload = fresh.map((m) => ({
      name: m.fighter.name,
      slug: m.fighter.slug,
      overlappingDimensions: m.overlappingDimensions,
    }));
    if (!compareTopFighters(result.matched_fighters, freshPayload).changed) return;

    // Updated rankings — apply locally and persist silently.
    setResult((prev) =>
      prev ? { ...prev, matched_fighters: freshPayload } : prev
    );

    // Best-effort persist; failure is non-fatal.
    (async () => {
      try {
        const supabase = createBrowserClient();
        const { data: authData } = await supabase.auth.getUser();
        if (authData.user && profileId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from("style_profiles") as any)
            .update({ matched_fighters: freshPayload })
            .eq("id", profileId);
        }
      } catch {
        // ignore
      }
    })();
    // run only when the result first lands or its dimension_scores change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.dimension_scores]);

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
      setStoredAnswers(answers);
      setNarrativeStale(false);

      // Save to localStorage always
      try {
        localStorage.setItem("boxing-coach-style-profile", JSON.stringify({
          result: profileResult,
          physicalContext: physical,
          experienceLevel: expLevel,
          answers,
          narrativeStale: false,
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

      setView("dashboard");
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

  const missingQuestionIds = getMissingQuestionIds(
    storedAnswers,
    allQuestions.map((q) => q.id)
  );

  async function handleRefreshNarrative() {
    if (!result) return;
    setView("loading");
    setError(null);

    // Hit the same endpoint the original quiz uses, with the merged answer set.
    try {
      const res = await fetch("/api/style-finder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: storedAnswers,
          dimension_scores: result.dimension_scores,
          physical_context: physicalContext,
          matched_fighters: result.matched_fighters.map((m) => ({
            name: m.name,
            slug: m.slug,
            overlappingDimensions: m.overlappingDimensions,
          })),
          experience_level: experienceLevel,
        }),
      });

      if (!res.ok) throw new Error("regen failed");
      const data = await res.json();

      const next: StyleProfileResult = {
        style_name: data.style_name,
        description: data.description,
        dimension_scores: result.dimension_scores,
        fighter_explanations: data.fighter_explanations,
        matched_fighters: result.matched_fighters,
        counter_fighters: Array.isArray(data.counter_fighters) ? data.counter_fighters : [],
        strengths: data.strengths,
        growth_areas: data.growth_areas,
        punches_to_master: data.punches_to_master,
        stance_recommendation: data.stance_recommendation,
        training_priorities: data.training_priorities,
        punch_doctor_insight: data.punch_doctor_insight,
      };

      setResult(next);
      setNarrativeStale(false);

      // Persist — Supabase if authed, else localStorage. Use the same soft-error
      // pattern as handleRefinementSubmit: only short-circuit on confirmed success.
      try {
        const supabase = createBrowserClient();
        const { data: authData } = await supabase.auth.getUser();
        if (authData.user) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: newRow, error: insertError } = await (supabase.from("style_profiles") as any)
            .insert({
              user_id: authData.user.id,
              answers: storedAnswers,
              dimension_scores: result.dimension_scores,
              physical_context: physicalContext,
              experience_level: experienceLevel,
              ai_result: data,
              matched_fighters: result.matched_fighters,
              counter_fighters: next.counter_fighters,
              narrative_stale: false,
            })
            .select("id")
            .single();
          if (!insertError && newRow) {
            setProfileId(newRow.id);
          } else {
            // Soft-error: also write localStorage so the regen isn't lost
            localStorage.setItem(
              "boxing-coach-style-profile",
              JSON.stringify({
                result: next,
                physicalContext,
                experienceLevel,
                answers: storedAnswers,
                narrativeStale: false,
              })
            );
          }
        } else {
          localStorage.setItem(
            "boxing-coach-style-profile",
            JSON.stringify({
              result: next,
              physicalContext,
              experienceLevel,
              answers: storedAnswers,
              narrativeStale: false,
            })
          );
        }
      } catch {
        // fall through — UI state still has the regenerated result; localStorage write is best-effort
        try {
          localStorage.setItem(
            "boxing-coach-style-profile",
            JSON.stringify({
              result: next,
              physicalContext,
              experienceLevel,
              answers: storedAnswers,
              narrativeStale: false,
            })
          );
        } catch {
          // truly best-effort
        }
      }

      setView("dashboard");
    } catch {
      setError("Failed to refresh analysis. Please try again.");
      setView("dashboard");
    }
  }

  async function handleRefinementSubmit(newAnswers: Record<string, string | string[] | number>) {
    const merged = mergeAnswersForRefinement(storedAnswers, newAnswers);
    const dimensionScores = computeDimensionScores(merged);
    const matches = matchFighters(dimensionScores, 3);
    const matchedPayload = matches.map((m) => ({
      name: m.fighter.name,
      slug: m.fighter.slug,
      overlappingDimensions: m.overlappingDimensions,
    }));

    // Update local state immediately
    setStoredAnswers(merged);
    setResult((prev) =>
      prev
        ? {
            ...prev,
            dimension_scores: dimensionScores,
            matched_fighters: matchedPayload,
          }
        : prev
    );
    setNarrativeStale(true);
    setRefinementOpen(false);

    // Persist — Supabase if authed, else localStorage
    try {
      const supabase = createBrowserClient();
      const { data: authData } = await supabase.auth.getUser();
      if (authData.user && result) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: newRow, error: insertError } = await (supabase.from("style_profiles") as any)
          .insert({
            user_id: authData.user.id,
            answers: merged,
            dimension_scores: dimensionScores,
            physical_context: physicalContext,
            experience_level: experienceLevel,
            // Carry forward the AI fields verbatim. Supabase JSON column accepts the existing object.
            ai_result: {
              style_name: result.style_name,
              description: result.description,
              fighter_explanations: result.fighter_explanations,
              strengths: result.strengths,
              growth_areas: result.growth_areas,
              punches_to_master: result.punches_to_master,
              stance_recommendation: result.stance_recommendation,
              training_priorities: result.training_priorities,
              punch_doctor_insight: result.punch_doctor_insight,
            },
            matched_fighters: matchedPayload,
            counter_fighters: result.counter_fighters,
            narrative_stale: true,
          })
          .select("id")
          .single();
        if (!insertError && newRow) {
          setProfileId(newRow.id);
          return;
        }
        // fall through to localStorage on soft Supabase error
      }
    } catch {
      // fall through to localStorage
    }

    // localStorage path — overwrite the saved blob with new merged answers + narrativeStale
    try {
      if (result) {
        localStorage.setItem(
          "boxing-coach-style-profile",
          JSON.stringify({
            result: {
              ...result,
              dimension_scores: dimensionScores,
              matched_fighters: matchedPayload,
            },
            physicalContext,
            experienceLevel,
            answers: merged,
            narrativeStale: true,
          })
        );
      }
    } catch {
      // ignore
    }
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

  if (view === "dashboard" && result) {
    return (
      <>
        <DashboardView
          result={result}
          physicalContext={physicalContext}
          experienceLevel={experienceLevel}
          previousScores={previousScores}
          onRetake={handleRetake}
          onAskCoach={onSwitchToChat}
          profileId={profileId}
          missingQuestionCount={missingQuestionIds.length}
          onRefineClick={() => setRefinementOpen(true)}
          narrativeStale={narrativeStale}
          onRefreshNarrative={handleRefreshNarrative}
        />
        {refinementOpen && (
          <RefinementModal
            questionIds={missingQuestionIds}
            onSubmit={handleRefinementSubmit}
            onClose={() => setRefinementOpen(false)}
          />
        )}
      </>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <Questionnaire userId={userId} onComplete={handleQuizComplete} />
    </div>
  );
}
