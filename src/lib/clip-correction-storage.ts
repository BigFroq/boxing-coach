// Write helper for the clip_corrections table — coach disagreements with a
// clip-review phase score. Same anon-key browser-client pattern as
// clip-log-storage: tagged results, never throws.

import { createBrowserClient } from "./supabase-browser";
import { track } from "./analytics";

export interface SaveCorrectionInput {
  userId: string;
  clipLogId: string | null;
  phase: string;
  aiScore: number | null;
  aiFeedback: string;
  correctedScore: number;
  note: string;
}

export type SaveCorrectionResult =
  | { status: "saved" }
  | { status: "error"; reason: string };

export async function saveClipCorrection(
  input: SaveCorrectionInput
): Promise<SaveCorrectionResult> {
  if (typeof window === "undefined") {
    return { status: "error", reason: "server-side" };
  }
  try {
    const supabase = createBrowserClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("clip_corrections") as any).insert({
      user_id: input.userId,
      clip_log_id: input.clipLogId,
      phase: input.phase,
      ai_score: input.aiScore,
      ai_feedback: input.aiFeedback,
      corrected_score: input.correctedScore,
      note: input.note,
    });
    if (error) {
      console.error("[clip-correction-storage] insert failed:", error);
      track("clip_correction_failed", { code: error.code });
      return { status: "error", reason: "db-insert-failed" };
    }
    track("clip_correction_saved", { phase: input.phase });
    return { status: "saved" };
  } catch (err) {
    console.error("[clip-correction-storage] insert threw:", err);
    track("clip_correction_failed", { code: "throw" });
    return { status: "error", reason: "db-insert-throw" };
  }
}
