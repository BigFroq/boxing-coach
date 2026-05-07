// Haiku 4.5 wrapper for the today-drill picker. Single function, tagged
// result, never throws. Extraction follows the same pattern as
// clip-review/route.ts (handles markdown-fenced JSON).

import Anthropic from "@anthropic-ai/sdk";
import { withRetry } from "./retry";
import type { LLMPickResult, RawLLMPick } from "./today-drill-types";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function pickDrillViaLLM(
  systemPrompt: string,
  userPayload: string
): Promise<LLMPickResult> {
  let response;
  try {
    response = await withRetry(
      () =>
        anthropic.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 512,
          system: systemPrompt,
          messages: [{ role: "user", content: userPayload }],
        }),
      { label: "today-drill-pick", maxAttempts: 3 }
    );
  } catch (err) {
    console.error("[today-drill-llm] api call failed:", err);
    return { status: "api-error", reason: err instanceof Error ? err.message : "unknown" };
  }

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  let jsonStr = text;
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1].trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    console.error("[today-drill-llm] JSON parse failed:", { text: text.slice(0, 200), err });
    return { status: "parse-failed", raw: text };
  }

  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "drill_id" in parsed &&
    "diagnosis" in parsed
  ) {
    return { status: "ok", raw: parsed as RawLLMPick };
  }

  return { status: "parse-failed", raw: text };
}
