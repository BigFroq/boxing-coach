import type {
  ProfileResponse,
  ProfileStyleSnapshot,
  ProfileCoachSnapshot,
  ExperienceLevel,
} from "./profile-types";

export type UserProfileRow = {
  id: string;
  display_name: string | null;
  email: string | null;
  gym: string | null;
  trainer: string | null;
  started_boxing_at: string | null;
  goals: string | null;
  notes: string | null;
};

export type StyleProfileRow = {
  id: string;
  experience_level?: string | null;
  physical_context: {
    height?: string;
    build?: string;
    reach?: string;
    stance?: string;
  } | null;
  ai_result: {
    style_name?: string;
    description?: string;
  } | null;
  matched_fighters: Array<{
    slug?: string;
    name?: string;
    match_pct?: number;
  }> | null;
};

export type FocusAreaRow = {
  id: string;
  name: string;
  status: string;
};

export type DrillPrescriptionRow = {
  id: string;
  drill_name: string;
  followed_up: boolean;
  created_at: string;
};

export type TrainingSessionRow = {
  id: string;
  session_type: string | null;
  created_at: string;
};

export type AggregatorInput = {
  userProfile: UserProfileRow | null;
  currentStyleProfile: StyleProfileRow | null;
  focusAreas: FocusAreaRow[];
  focusAreasTotal: number;
  recentDrills: DrillPrescriptionRow[];
  lastSession: TrainingSessionRow | null;
};

function toExperienceLevel(v: string | null | undefined): ExperienceLevel {
  if (v === "intermediate" || v === "advanced") return v;
  return "beginner";
}

function buildStyleSnapshot(row: StyleProfileRow | null): ProfileStyleSnapshot | null {
  if (!row) return null;
  const phys = row.physical_context ?? {};
  const ai = row.ai_result ?? {};
  const fighters = (row.matched_fighters ?? [])
    .slice(0, 3)
    .map((f) => ({
      slug: f.slug ?? "",
      name: f.name ?? "",
      match_pct: typeof f.match_pct === "number" ? f.match_pct : 0,
    }));

  return {
    profile_id: row.id,
    style_name: ai.style_name ?? "",
    description: ai.description ?? "",
    stance: phys.stance ?? "",
    experience_level: toExperienceLevel(row.experience_level),
    height: phys.height ?? "",
    reach: phys.reach ?? "",
    build: phys.build ?? "",
    top_fighters: fighters,
  };
}

function buildCoachSnapshot(input: AggregatorInput): ProfileCoachSnapshot | null {
  const hasAny =
    input.focusAreas.length > 0 ||
    input.recentDrills.length > 0 ||
    input.lastSession !== null;
  if (!hasAny) return null;

  return {
    last_session_at: input.lastSession?.created_at ?? null,
    last_session_type: input.lastSession?.session_type ?? null,
    active_focus_areas: input.focusAreas.slice(0, 3).map((f) => ({
      id: f.id,
      name: f.name,
      status: f.status,
    })),
    active_focus_areas_total: input.focusAreasTotal,
    recent_drills: input.recentDrills.slice(0, 3).map((d) => ({
      id: d.id,
      drill_name: d.drill_name,
      followed_up: d.followed_up,
      created_at: d.created_at,
    })),
  };
}

export function buildProfileResponse(input: AggregatorInput): ProfileResponse {
  const up = input.userProfile;

  return {
    identity: {
      display_name: up?.display_name ?? null,
      email: up?.email ?? null,
    },
    training_context: {
      gym: up?.gym ?? null,
      trainer: up?.trainer ?? null,
      started_boxing_at: up?.started_boxing_at ?? null,
      goals: up?.goals ?? null,
    },
    notes: up?.notes ?? null,
    style_snapshot: buildStyleSnapshot(input.currentStyleProfile),
    coach_snapshot: buildCoachSnapshot(input),
  };
}
