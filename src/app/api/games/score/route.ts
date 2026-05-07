import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { enforceRateLimit } from "@/lib/rate-limit";
import { gameScoreSubmitSchema } from "@/lib/validation";
import { anonTokenForUserId } from "@/lib/games-leaderboard-anon";
import { sortDirectionFor } from "@/lib/games-types";
import type { GameType, ScoreUnit } from "@/lib/games-types";

const VALID_GAMES: GameType[] = ["reaction_tap", "schulte", "punch_prediction"];

function unitForGameType(gameType: GameType): ScoreUnit {
  if (gameType === "reaction_tap") return "ms";
  if (gameType === "schulte") return "seconds";
  return "accuracy_pct";
}

export async function POST(request: NextRequest) {
  try {
    const raw = await request.json();
    const parsed = gameScoreSubmitSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { status: "error", message: "Invalid request", issues: parsed.error.issues },
        { status: 400 }
      );
    }
    const { userId, gameType, scoreValue, scoreUnit } = parsed.data;

    if (userId === "anon") {
      return NextResponse.json(
        { status: "error", message: "Login required to save scores" },
        { status: 400 }
      );
    }

    if (scoreUnit !== unitForGameType(gameType)) {
      return NextResponse.json(
        { status: "error", message: "scoreUnit doesn't match gameType" },
        { status: 400 }
      );
    }

    const limited = await enforceRateLimit(request, userId);
    if (limited) return limited;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createServerClient() as any;
    const { error } = await supabase.from("game_scores").insert({
      user_id: userId,
      game_type: gameType,
      score_value: scoreValue,
      score_unit: scoreUnit,
    });

    if (error) {
      console.error("[games/score] insert failed:", error);
      return NextResponse.json(
        { status: "error", message: "Failed to save score" },
        { status: 500 }
      );
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("[games/score] POST threw:", err);
    return NextResponse.json(
      { status: "error", message: "Server error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const gameTypeRaw = url.searchParams.get("gameType");
    const kind = url.searchParams.get("kind") ?? "leaderboard";

    if (!gameTypeRaw || !VALID_GAMES.includes(gameTypeRaw as GameType)) {
      return NextResponse.json(
        { status: "error", message: "gameType required" },
        { status: 400 }
      );
    }
    const gameType = gameTypeRaw as GameType;
    const unit = unitForGameType(gameType);
    const direction = sortDirectionFor(unit);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createServerClient() as any;

    if (kind === "user-best") {
      const userId = url.searchParams.get("userId");
      if (!userId || userId === "anon") {
        return NextResponse.json({ status: "ok", score: null });
      }
      const ascending = direction === "asc";
      const { data, error } = await supabase
        .from("game_scores")
        .select("score_value")
        .eq("user_id", userId)
        .eq("game_type", gameType)
        .order("score_value", { ascending })
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error("[games/score] user-best failed:", error);
        return NextResponse.json(
          { status: "error", message: "Failed to fetch" },
          { status: 500 }
        );
      }
      const score = data ? Number(data.score_value) : null;
      return NextResponse.json({ status: "ok", score });
    }

    // kind === "leaderboard" — top 20 lifetime-best per user
    // We pull a generous window then group by user in memory because
    // Supabase JS doesn't expose window functions cleanly.
    const ascending = direction === "asc";
    const { data, error } = await supabase
      .from("game_scores")
      .select("user_id, score_value")
      .eq("game_type", gameType)
      .order("score_value", { ascending })
      .limit(500);

    if (error) {
      console.error("[games/score] leaderboard failed:", error);
      return NextResponse.json(
        { status: "error", message: "Failed to fetch" },
        { status: 500 }
      );
    }

    // Dedupe to one row per user (the first hit is their best given the order).
    const seen = new Set<string>();
    const bests: Array<{ userId: string; scoreValue: number }> = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of (data ?? []) as any[]) {
      if (seen.has(row.user_id)) continue;
      seen.add(row.user_id);
      bests.push({ userId: row.user_id, scoreValue: Number(row.score_value) });
      if (bests.length >= 20) break;
    }

    const entries = bests.map((b, i) => ({
      rank: i + 1,
      playerToken: anonTokenForUserId(b.userId),
      scoreValue: b.scoreValue,
    }));

    return NextResponse.json({ status: "ok", entries });
  } catch (err) {
    console.error("[games/score] GET threw:", err);
    return NextResponse.json(
      { status: "error", message: "Server error" },
      { status: 500 }
    );
  }
}
