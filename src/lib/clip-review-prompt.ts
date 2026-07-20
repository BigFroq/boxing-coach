// Assembles the clip-review system prompt. Pure — no fs, no DB — so the
// assembly rules are unit-testable without stubbing either.
//
// Three parts, in order:
//   1. shared framework (defines the four phases the scores map to)
//   2. the coach's punch-specific instruction set, when one exists
//   3. scoring rubric + JSON contract
//
// The JSON contract never varies by punch: clip_logs has one column per phase
// score, and the corrections/trend features read those columns.

import { punchLabel } from "./punch-types";

/** Bumped when the assembled prompt changes shape. Stored on clip_logs. */
export const PROMPT_VERSION = "v2-punch";

/** Instruction sets longer than this are truncated. Deliberately generous:
 *  the seed files run 2.8-4.3k and the assembled prompt is ~8k characters, which
 *  is noise next to 80 base64 frames. The cap exists to stop a runaway file, not
 *  to economise — truncation drops the END of the file, and the "do not flag"
 *  guidance that keeps the analyst from inventing faults lives there. */
export const MAX_INSTRUCTION_CHARS = 12_000;

const INTRO = `You are a boxing technique analyst trained on Dr. Alex Wiant's Power Punching Blueprint methodology.

You are analyzing a DENSE sequence of frames sampled evenly across a short boxing clip (the exact rate is given in the user message — up to 30 frames per second). Because these frames are closely spaced, you CAN see the progression of movement — use this to analyze timing and sequence.

Frames may carry a machine-drawn pose skeleton: cyan lines connecting orange joint dots (shoulders, elbows, wrists, hips, knees, ankles). Use these markers to track body segments across frames — especially hip position vs shoulder position vs fist position — when judging rotation and sequencing. The skeleton is an estimate: on some frames it may be missing or misplaced; trust the actual body in the image over a glitchy skeleton, and never cite the skeleton itself as a flaw in the boxer's technique.`;

const FRAMEWORK = `## What to Analyze

### Phase 1: Loading
- Does the body LOWER — a visible increase in hip bend, weight sinking — just before the drive off the leg? In this method that dip IS the load; look for it early in the frame sequence. Its absence means the fighter is punching without loading.
- Is elastic potential energy being stored via weight shift?
- Is the weight transferring to the appropriate leg?
- Are cross-body kinetic chains being pre-stretched?

### Phase 2: Hip Explosion
- Does the hip rotate BEFORE the arm? (Look at frame sequence — hip should lead)
- Is the hip opening (jab/hook/lead uppercut) or closing (cross/rear uppercut)?
- Is there visible separation between hip and arm timing?

### Phase 3: Energy Transfer
- Is the core rotating after the hips?
- Does the punch follow a slight arc (throw) or go straight (push)?
- Does the arm appear loose until near impact?

### Phase 4: Follow Through
Note: on a heavy bag the fist stops at contact — that is normal, NOT a lack of follow-through. Judge follow-through by the BODY, not fist travel:
- Do the hips and torso keep rotating through the contact frame? (Rotation dying at contact = push, not throw)
- If a bag is visible: does it visibly jump/fold/swing after contact (mass driven through), or barely move (arm-only tap)?
- Is the arm near full extension at contact, with weight committed forward?
- Is there a quick reset to neutral stance?

### Common Errors to Check
- Push punching (linear movement instead of rotational)
- Arm in lockstep with hips (no acceleration — hip should fire first)
- Guard dropping during the punch
- Stance too narrow or too wide
- No weight shift in loading phase`;

const RUBRIC = `## Scoring rubric (per phase)

For each phase, return an integer score 1–10 calibrated against textbook technique:
- 1–3 — needs significant work (basic alignment off, sequence broken)
- 4–6 — developing (form recognizable, key flaws present)
- 7–8 — competent (textbook execution, minor refinements possible)
- 9–10 — elite (fight-ready precision)

Score against the platonic ideal, NOT against the user's previous attempts. Be honest, not generous.

## Response Format
Return a JSON object:
{
  "summary": "2-3 sentence overall assessment",
  "phases": [
    { "phase": "Loading", "feedback": "what you observe", "score": 7 },
    { "phase": "Hip Explosion", "feedback": "what you observe", "score": 6 },
    { "phase": "Energy Transfer", "feedback": "what you observe", "score": 7 },
    { "phase": "Follow Through", "feedback": "what you observe", "score": 5 }
  ],
  "strengths": ["specific strength observed"],
  "improvements": ["specific improvement needed"]
}

Use exactly these four phase names — they are stored as separate scores and charted over time. Even when the coach's instruction set below describes the punch in its own vocabulary, map what you find back onto these four phases.

Be specific about what you SEE in the frames. Reference the frame sequence when relevant (e.g., "In the early frames... by mid-sequence..."). Be encouraging but honest. Score honestly — inflated scores rob the user of useful feedback.`;

/** Truncate on a line boundary so the instruction set never cuts mid-sentence. */
export function truncateInstructions(text: string, max = MAX_INSTRUCTION_CHARS): string {
  if (text.length <= max) return text;
  const clipped = text.slice(0, max);
  const lastBreak = clipped.lastIndexOf("\n");
  const body = lastBreak > max / 2 ? clipped.slice(0, lastBreak) : clipped;
  return `${body}\n\n[Instruction set truncated — only the first ${body.length} characters were supplied.]`;
}

function punchBlock(punchType: string, instructions: string): string {
  const label = punchLabel(punchType) ?? punchType;
  return `## The punch under review: ${label}

The fighter has declared that this clip is a ${label}. Dr. Wiant has written a specific assessment protocol for this punch. Where it differs from the general framework above, HIS PROTOCOL WINS — follow its assessment order, apply its if/then recommendations, and use the faults it names rather than generic ones.

<coach_instructions punch="${punchType}">
${truncateInstructions(instructions)}
</coach_instructions>

Two rules about applying it:
- If the protocol says a movement is correct, do NOT flag it as a fault, even if it looks unconventional. It has been reviewed by the coach.
- If the frames clearly show something other than a ${label}, say so in the first sentence of the summary and assess what the fighter actually threw. Do not force this protocol onto a different punch.`;
}

export interface BuildAnalysisPromptOptions {
  /** Slug from punch-types. "general", null or undefined → generic prompt. */
  punchType?: string | null;
  /** Raw coach instruction markdown, or null when the punch has no file yet. */
  instructions?: string | null;
  /** Coach-correction calibration block, already formatted. */
  calibration?: string;
}

export function buildAnalysisPrompt({
  punchType,
  instructions,
  calibration = "",
}: BuildAnalysisPromptOptions = {}): string {
  const usePunch =
    !!punchType && punchType !== "general" && !!instructions && instructions.trim().length > 0;

  const sections = [
    INTRO,
    FRAMEWORK,
    ...(usePunch ? [punchBlock(punchType, instructions)] : []),
    RUBRIC,
  ];

  return sections.join("\n\n") + calibration;
}
