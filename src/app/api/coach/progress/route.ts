import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServerClient() as any;

  const [sessionsRes, focusRes, statsRes] = await Promise.all([
    supabase
      .from("training_sessions")
      .select("id, session_type, rounds, summary, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("focus_areas")
      .select("id, name, description, status, history, created_at, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("training_sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
  ]);

  const focusAreas = focusRes.data ?? [];
  const improvingCount = focusAreas.filter((f: { status: string }) => f.status === "improving").length;
  const activeCount = focusAreas.filter((f: { status: string }) => ["new", "active"].includes(f.status)).length;

  return NextResponse.json({
    stats: {
      totalSessions: statsRes.count ?? 0,
      areasImproving: improvingCount,
      activeFocusAreas: activeCount,
    },
    focusAreas,
    recentSessions: sessionsRes.data ?? [],
  });
}
