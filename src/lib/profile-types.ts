/**
 * Types shared between the /api/profile server handlers and the /me client.
 * Keeping them in one place prevents server/client drift.
 */

export type ExperienceLevel = "beginner" | "intermediate" | "advanced";

export type ProfileIdentity = {
  display_name: string | null;
  email: string | null;
};

export type ProfileTrainingContext = {
  gym: string | null;
  trainer: string | null;
  /** ISO date string (YYYY-MM-DD); month inputs land here as YYYY-MM-01. */
  started_boxing_at: string | null;
  goals: string | null;
};

export type ProfileStyleSnapshot = {
  style_name: string;
  description: string;
  stance: string;
  experience_level: ExperienceLevel;
  height: string;
  reach: string;
  build: string;
  top_fighters: Array<{ slug: string; name: string; match_pct: number }>;
  /** ID of the style_profiles row — lets the client deep-link to /profile/[id]. */
  profile_id: string;
};

export type ProfileCoachSnapshot = {
  last_session_at: string | null;
  last_session_type: string | null;
  active_focus_areas: Array<{ id: string; name: string; status: string }>;
  active_focus_areas_total: number;
  recent_drills: Array<{
    id: string;
    drill_name: string;
    followed_up: boolean;
    created_at: string;
  }>;
};

export type ProfileResponse = {
  identity: ProfileIdentity;
  training_context: ProfileTrainingContext;
  notes: string | null;
  style_snapshot: ProfileStyleSnapshot | null;
  coach_snapshot: ProfileCoachSnapshot | null;
};

export type ProfilePatch = {
  userId: string;
  display_name?: string | null;
  email?: string | null;
  gym?: string | null;
  trainer?: string | null;
  started_boxing_at?: string | null;
  goals?: string | null;
  notes?: string | null;
};

/** Field keys that are user-editable on /me. Used for analytics events. */
export type EditableProfileField =
  | "display_name"
  | "email"
  | "gym"
  | "trainer"
  | "started_boxing_at"
  | "goals"
  | "notes";
