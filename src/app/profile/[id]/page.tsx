import { createServerClient } from "@/lib/supabase";
import { ResultsProfile } from "@/components/style-finder/results-profile";
import type { StyleProfileResult } from "@/components/style-finder/results-profile";
import type { DimensionScores } from "@/data/fighter-profiles";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ id: string }>;
}

async function getProfile(id: string) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("style_profiles")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return data as Record<string, unknown>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const profile = await getProfile(id);

  if (!profile) {
    return { title: "Profile Not Found — Punch Doctor AI" };
  }

  const aiResult = profile.ai_result as Record<string, unknown>;
  const styleName = (aiResult.style_name as string) ?? "Fighter Profile";
  const description = (aiResult.description as string) ?? "A fighter profile from Punch Doctor AI";

  return {
    title: `${styleName} — Punch Doctor AI`,
    description,
    openGraph: {
      title: `${styleName} — Punch Doctor AI`,
      description,
      type: "profile",
    },
  };
}

export default async function ProfilePage({ params }: PageProps) {
  const { id } = await params;
  const profile = await getProfile(id);

  if (!profile) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Profile not found</h1>
          <p className="text-sm text-muted">This profile may have been removed or the link is invalid.</p>
        </div>
      </div>
    );
  }

  const aiResult = profile.ai_result as Record<string, unknown>;
  const dimensionScores = profile.dimension_scores as DimensionScores;
  const physicalContext = profile.physical_context as {
    height: string;
    build: string;
    reach: string;
    stance: string;
  };
  const matchedFighters = profile.matched_fighters as StyleProfileResult["matched_fighters"];

  const result: StyleProfileResult = {
    style_name: aiResult.style_name as string,
    description: aiResult.description as string,
    dimension_scores: dimensionScores,
    fighter_explanations: aiResult.fighter_explanations as StyleProfileResult["fighter_explanations"],
    matched_fighters: matchedFighters,
    counter_fighters: (profile.counter_fighters as StyleProfileResult["counter_fighters"]) ?? [],
    strengths: aiResult.strengths as string[],
    growth_areas: aiResult.growth_areas as StyleProfileResult["growth_areas"],
    punches_to_master: aiResult.punches_to_master as string[],
    stance_recommendation: aiResult.stance_recommendation as string,
    training_priorities: aiResult.training_priorities as string[],
    punch_doctor_insight: aiResult.punch_doctor_insight as string,
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-center border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent font-bold text-white text-sm">
            PD
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Punch Doctor AI</h1>
            <p className="text-xs text-muted">Shared Fighter Profile</p>
          </div>
        </div>
      </header>
      <main>
        <ResultsProfile
          result={result}
          physicalContext={physicalContext}
          experienceLevel={
            ((profile.experience_level as string) ?? "beginner") as
              | "beginner"
              | "intermediate"
              | "advanced"
          }
          onRetake={() => {}}
          profileId={id}
        />
      </main>
    </div>
  );
}
