import { describe, it, expect } from "vitest";
import { buildProfileResponse, type AggregatorInput } from "./profile-aggregator";

function emptyInput(): AggregatorInput {
  return {
    userProfile: null,
    currentStyleProfile: null,
    focusAreas: [],
    focusAreasTotal: 0,
    recentDrills: [],
    lastSession: null,
  };
}

describe("buildProfileResponse", () => {
  it("returns skeletal shape when user has no data anywhere", () => {
    const result = buildProfileResponse(emptyInput());

    expect(result.identity).toEqual({ display_name: null, email: null });
    expect(result.training_context).toEqual({
      gym: null,
      trainer: null,
      started_boxing_at: null,
      goals: null,
    });
    expect(result.notes).toBeNull();
    expect(result.style_snapshot).toBeNull();
    expect(result.coach_snapshot).toBeNull();
  });

  it("pulls identity + training context + notes from user_profiles row", () => {
    const result = buildProfileResponse({
      ...emptyInput(),
      userProfile: {
        id: "u1",
        display_name: "Alex",
        email: "alex@example.com",
        gym: "Silverback BC",
        trainer: "Coach Joe",
        started_boxing_at: "2023-06-01",
        goals: "Amateur debut by summer",
        notes: "Left hook has been slow the last two weeks",
      },
    });

    expect(result.identity).toEqual({ display_name: "Alex", email: "alex@example.com" });
    expect(result.training_context).toEqual({
      gym: "Silverback BC",
      trainer: "Coach Joe",
      started_boxing_at: "2023-06-01",
      goals: "Amateur debut by summer",
    });
    expect(result.notes).toBe("Left hook has been slow the last two weeks");
  });

  it("builds style_snapshot from current style profile with first 3 matched fighters", () => {
    const result = buildProfileResponse({
      ...emptyInput(),
      currentStyleProfile: {
        id: "sp1",
        experience_level: "intermediate",
        physical_context: { height: "5'10", build: "athletic", reach: "71in", stance: "orthodox" },
        ai_result: {
          style_name: "Pressure Puncher",
          description: "Cuts distance and lands heavy inside.",
        },
        matched_fighters: [
          { slug: "mike-tyson", name: "Mike Tyson", match_pct: 82 },
          { slug: "gervonta-davis", name: "Gervonta Davis", match_pct: 78 },
          { slug: "ilia-topuria", name: "Ilia Topuria", match_pct: 71 },
          { slug: "alex-pereira", name: "Alex Pereira", match_pct: 68 },
        ],
      },
    });

    expect(result.style_snapshot).not.toBeNull();
    expect(result.style_snapshot!.profile_id).toBe("sp1");
    expect(result.style_snapshot!.style_name).toBe("Pressure Puncher");
    expect(result.style_snapshot!.stance).toBe("orthodox");
    expect(result.style_snapshot!.experience_level).toBe("intermediate");
    expect(result.style_snapshot!.height).toBe("5'10");
    expect(result.style_snapshot!.reach).toBe("71in");
    expect(result.style_snapshot!.build).toBe("athletic");
    expect(result.style_snapshot!.top_fighters).toHaveLength(3);
    expect(result.style_snapshot!.top_fighters[0].slug).toBe("mike-tyson");
    expect(result.style_snapshot!.top_fighters[2].slug).toBe("ilia-topuria");
  });

  it("builds coach_snapshot when focus areas, drills, or a session exist", () => {
    const result = buildProfileResponse({
      ...emptyInput(),
      focusAreas: [
        { id: "f1", name: "Jab recovery", status: "active" },
        { id: "f2", name: "Hip rotation on the hook", status: "improving" },
        { id: "f3", name: "Slipping the counter right", status: "new" },
      ],
      focusAreasTotal: 5,
      recentDrills: [
        { id: "d1", drill_name: "Shadow box 3x3", followed_up: true, created_at: "2026-04-20T10:00:00Z" },
        { id: "d2", drill_name: "Med-ball rotations", followed_up: false, created_at: "2026-04-18T10:00:00Z" },
      ],
      lastSession: {
        id: "s1",
        session_type: "bag_work",
        created_at: "2026-04-21T18:00:00Z",
      },
    });

    expect(result.coach_snapshot).not.toBeNull();
    expect(result.coach_snapshot!.last_session_at).toBe("2026-04-21T18:00:00Z");
    expect(result.coach_snapshot!.last_session_type).toBe("bag_work");
    expect(result.coach_snapshot!.active_focus_areas).toHaveLength(3);
    expect(result.coach_snapshot!.active_focus_areas_total).toBe(5);
    expect(result.coach_snapshot!.recent_drills).toHaveLength(2);
    expect(result.coach_snapshot!.recent_drills[0].drill_name).toBe("Shadow box 3x3");
  });

  it("returns null coach_snapshot when no focus areas, drills, or sessions", () => {
    const result = buildProfileResponse({
      ...emptyInput(),
      userProfile: {
        id: "u1",
        display_name: "Alex",
        email: null,
        gym: null,
        trainer: null,
        started_boxing_at: null,
        goals: null,
        notes: null,
      },
    });

    expect(result.coach_snapshot).toBeNull();
  });

  it("caps active_focus_areas at 3 even when input has more", () => {
    const result = buildProfileResponse({
      ...emptyInput(),
      focusAreas: [
        { id: "f1", name: "A", status: "active" },
        { id: "f2", name: "B", status: "active" },
        { id: "f3", name: "C", status: "active" },
        { id: "f4", name: "D", status: "active" },
      ],
      focusAreasTotal: 4,
    });

    expect(result.coach_snapshot!.active_focus_areas).toHaveLength(3);
    expect(result.coach_snapshot!.active_focus_areas_total).toBe(4);
  });
});
