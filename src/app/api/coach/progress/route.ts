import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { computeNeglected } from "@/lib/neglected-focus-areas";
import { computeLastWorkedMap } from "@/lib/focus-area-last-worked";

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServerClient() as any;

  const [sessionsRes, focusRes, statsRes, drillsRes] = await Promise.all([
    supabase
      .from("training_sessions")
      .select("id, session_type, rounds, summary, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("focus_areas")
      .select("id, name, description, status, history, dimension, knowledge_node_slug, created_at, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("training_sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    supabase
      .from("drill_prescriptions")
      .select("id, drill_name, details, followed_up, followed_up_at, followed_up_session_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
  ]);

  const focusAreas = focusRes.data ?? [];
  const recentSessions = sessionsRes.data ?? [];
  const allDrills = drillsRes.data ?? [];

  const improvingCount = focusAreas.filter((f: { status: string }) => f.status === "improving").length;
  const activeCount = focusAreas.filter((f: { status: string }) => ["new", "active"].includes(f.status)).length;

  // Neglected: canonical-key comparison via existing helper (uses last 3 sessions only).
  const neglectedFocusAreas = computeNeglected(
    focusAreas as Parameters<typeof computeNeglected>[0],
    recentSessions.slice(0, 3) as Parameters<typeof computeNeglected>[1]
  );

  // Last-worked: join focus-area canonical keys against all recent sessions' keys.
  const focusAreaLastWorked = computeLastWorkedMap(
    focusAreas as Parameters<typeof computeLastWorkedMap>[0],
    recentSessions as Parameters<typeof computeLastWorkedMap>[1]
  );

  // Split drills into pending vs recently-done.
  const pendingDrills = allDrills.filter((d: { followed_up: boolean }) => !d.followed_up);
  const recentDrills = allDrills
    .filter((d: { followed_up: boolean; followed_up_at: string | null }) => d.followed_up && d.followed_up_at)
    .sort(
      (a: { followed_up_at: string }, b: { followed_up_at: string }) =>
        new Date(b.followed_up_at).getTime() - new Date(a.followed_up_at).getTime()
    )
    .slice(0, 10);

  return NextResponse.json({
    stats: {
      totalSessions: statsRes.count ?? 0,
      areasImproving: improvingCount,
      activeFocusAreas: activeCount,
    },
    focusAreas,
    recentSessions,
    neglectedFocusAreas,
    drillPrescriptions: {
      pending: pendingDrills,
      recent: recentDrills,
    },
    focusAreaLastWorked,
  });
}
