import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { buildProfileResponse } from "@/lib/profile-aggregator";
import { normalizeProfilePatch } from "@/lib/profile-patch";

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServerClient() as any;

  const [userProfileRes, styleProfileRes, focusAreasRes, focusAreasCountRes, drillsRes, sessionRes] =
    await Promise.all([
      supabase
        .from("user_profiles")
        .select("id, display_name, email, gym, trainer, started_boxing_at, goals, notes")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("style_profiles")
        .select("id, experience_level, physical_context, ai_result, matched_fighters")
        .eq("user_id", userId)
        .eq("is_current", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("focus_areas")
        .select("id, name, status")
        .eq("user_id", userId)
        .in("status", ["new", "active", "improving"])
        .order("updated_at", { ascending: false })
        .limit(3),
      supabase
        .from("focus_areas")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("status", ["new", "active", "improving"]),
      supabase
        .from("drill_prescriptions")
        .select("id, drill_name, followed_up, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(3),
      supabase
        .from("training_sessions")
        .select("id, session_type, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const errors = [
    userProfileRes,
    styleProfileRes,
    focusAreasRes,
    focusAreasCountRes,
    drillsRes,
    sessionRes,
  ]
    .map((r) => r.error)
    .filter(Boolean);
  if (errors.length) {
    console.error("Profile GET errors:", errors);
    return NextResponse.json({ error: "Fetch failed" }, { status: 500 });
  }

  const response = buildProfileResponse({
    userProfile: userProfileRes.data ?? null,
    currentStyleProfile: styleProfileRes.data ?? null,
    focusAreas: focusAreasRes.data ?? [],
    focusAreasTotal: focusAreasCountRes.count ?? 0,
    recentDrills: drillsRes.data ?? [],
    lastSession: sessionRes.data ?? null,
  });

  return NextResponse.json(response);
}

export async function PATCH(request: NextRequest) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = normalizeProfilePatch(raw);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  const { userId, patch } = result;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServerClient() as any;

  const { error } = await supabase
    .from("user_profiles")
    .upsert(
      { id: userId, ...patch, updated_at: new Date().toISOString() },
      { onConflict: "id" }
    );

  if (error) {
    console.error("Profile upsert failed:", error);
    return NextResponse.json({ error: "Upsert failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
