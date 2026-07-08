// One-time ingestion: label boxing clip stills via Claude vision and insert
// into punch_prediction_clips. Run from developer machine, NOT from the
// deployed app. Uses the Supabase service-role key from .env.local.
//
// Usage:
//   1) Drop ~50-100 boxing clip stills (jpg/png) in scripts/games/source-clips/
//   2) Run: npx tsx scripts/games/label-punch-clips.ts
//   3) The script reads, labels, and inserts each unique filename.
//      Re-running is idempotent: filenames already present are skipped.

import fs from "fs/promises";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { withRetry } from "../../src/lib/retry";

const SOURCE_DIR = path.join(__dirname, "source-clips");

const SYSTEM_PROMPT = `You are labeling a still frame from a boxing clip. The frame shows a boxer in setup position, just before throwing a punch.

Identify which punch is about to be thrown. Look at the loading phase — weight shift, hip orientation, lead vs rear hand position, shoulder rotation.

Return strict JSON:
{
  "punch_label": "jab" | "cross" | "hook" | "uppercut" | null,
  "difficulty": "easy" | "medium" | "hard",
  "confidence": 0.0..1.0,
  "notes": "brief justification, 1 sentence"
}

If the image doesn't clearly show a punch setup (e.g. mid-flight, recovery, defense, no boxer visible), return punch_label: null and we'll skip it.

Difficulty levels:
- easy: obvious commitment to one punch, clear loading
- medium: mostly clear but could be misread
- hard: ambiguous setup, requires real fight IQ to predict`;

interface LabelResult {
  punch_label: "jab" | "cross" | "hook" | "uppercut" | null;
  difficulty: "easy" | "medium" | "hard";
  confidence: number;
  notes: string;
}

async function labelOne(
  anthropic: Anthropic,
  imageB64: string
): Promise<LabelResult | null> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 256,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/jpeg", data: imageB64 },
          },
          {
            type: "text",
            text: "Return only the JSON. No surrounding text.",
          },
        ],
      },
    ],
  });
  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  let jsonStr = text;
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m) jsonStr = m[1].trim();
  try {
    const parsed = JSON.parse(jsonStr) as LabelResult;
    return parsed;
  } catch (err) {
    console.error("Failed to parse label JSON:", text.slice(0, 200), err);
    return null;
  }
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env");
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY in env");
  const anthropic = new Anthropic({ apiKey });

  // Read existing filenames so we skip duplicates.
  const { data: existing, error: existingErr } = await supabase
    .from("punch_prediction_clips")
    .select("source_filename");
  if (existingErr) throw existingErr;
  const seenFilenames = new Set(
    (existing ?? []).map((r: { source_filename: string }) => r.source_filename)
  );

  // List files in SOURCE_DIR
  let files: string[];
  try {
    files = await fs.readdir(SOURCE_DIR);
  } catch (err) {
    console.error(`Source directory not found: ${SOURCE_DIR}. Create it and drop images.`);
    throw err;
  }

  const candidates = files.filter((f) =>
    /\.(jpg|jpeg|png)$/i.test(f) && !seenFilenames.has(f)
  );
  console.log(`Found ${candidates.length} new file(s) to label out of ${files.length} total.`);

  let labeled = 0;
  let skipped = 0;
  for (const filename of candidates) {
    const buf = await fs.readFile(path.join(SOURCE_DIR, filename));
    const imageB64 = buf.toString("base64");
    console.log(`Labeling: ${filename} ...`);
    const result = await withRetry(
      () => labelOne(anthropic, imageB64),
      { label: `label-${filename}`, maxAttempts: 3 }
    );

    if (!result || result.punch_label === null) {
      console.log(`  -> skipped (unclear setup)`);
      skipped++;
      continue;
    }

    const { error } = await supabase.from("punch_prediction_clips").insert({
      source_filename: filename,
      image_b64: imageB64,
      punch_label: result.punch_label,
      difficulty: result.difficulty,
      llm_confidence: result.confidence,
      llm_notes: result.notes,
    });
    if (error) {
      console.error(`  -> insert failed: ${error.message}`);
      continue;
    }
    console.log(`  -> labeled as ${result.punch_label} (${result.difficulty}, conf ${result.confidence})`);
    labeled++;
  }

  console.log(`\nDone. Labeled ${labeled}. Skipped ${skipped}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
