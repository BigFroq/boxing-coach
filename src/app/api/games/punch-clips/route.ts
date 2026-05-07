import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

const MAX_COUNT = 30;

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const countRaw = url.searchParams.get("count") ?? "10";
    const count = Math.min(Math.max(parseInt(countRaw, 10) || 10, 1), MAX_COUNT);
    const excludeRaw = url.searchParams.get("exclude") ?? "";
    const excludeIds = excludeRaw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createServerClient() as any;

    // Fetch a wider pool than count, exclude seen, shuffle in memory.
    let query = supabase.from("punch_prediction_clips").select("*").limit(count * 4);
    if (excludeIds.length > 0) {
      query = query.not("id", "in", `(${excludeIds.map((id) => `"${id}"`).join(",")})`);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[games/punch-clips] select failed:", error);
      return NextResponse.json(
        { status: "error", message: "Failed to fetch clips" },
        { status: 500 }
      );
    }

    // Shuffle and trim to `count`.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pool = (data ?? []) as any[];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const clips = pool.slice(0, count);

    return NextResponse.json({ status: "ok", clips });
  } catch (err) {
    console.error("[games/punch-clips] GET threw:", err);
    return NextResponse.json(
      { status: "error", message: "Server error" },
      { status: 500 }
    );
  }
}
