import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { z } from "zod";

const feedbackSchema = z.object({
  surface: z.enum(["technique", "drills", "coach", "style", "clip_review", "other"]),
  rating: z.enum(["up", "down"]),
  userId: z.string().max(80).optional(),
  query: z.string().max(2000).optional(),
  responsePreview: z.string().max(2000).optional(),
  note: z.string().max(1000).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const raw = await request.json();
    const parsed = feedbackSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", issues: parsed.error.issues },
        { status: 400 }
      );
    }
    const { surface, rating, userId, query, responsePreview, note } = parsed.data;

    const supabase = createServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("response_feedback") as any).insert({
      user_id: userId ?? null,
      surface,
      rating,
      query: query ?? null,
      response_preview: responsePreview ?? null,
      note: note ?? null,
      user_agent: request.headers.get("user-agent") ?? null,
    });

    if (error) {
      // Non-critical — log but don't fail the user's action
      console.error("Feedback insert failed:", error);
      return NextResponse.json({ ok: false }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Feedback API error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
