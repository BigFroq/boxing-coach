/**
 * 3-Layer Eval Suite for Punch Doctor AI Boxing Coach
 *
 * Layer 1: Retrieval Coverage (50 queries) — keyword matching on RAG chunks
 * Layer 2: Adversarial (20 queries) — misspellings, vague, off-topic, multi-topic, myth
 * Layer 3: Answer Quality (38 queries) — LLM-as-Judge scoring via Claude Sonnet
 *
 * Usage:
 *   npm run eval              # Run all 3 layers
 *   npm run eval -- --layer=1 # Run only Layer 1
 *   npm run eval -- --layer=2 # Run only Layer 2
 *   npm run eval -- --layer=3 # Run only Layer 3
 *
 * Env vars:
 *   CHAT_API_URL   Override chat endpoint (default: http://localhost:3001/api/chat)
 *
 * Outputs:
 *   docs/outreach/eval-results.json  — full structured results, saved incrementally
 *   docs/outreach/blueprint-fidelity.md — human-readable summary report
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import * as fs from "fs";
import * as path from "path";
import { retrieveContext } from "../src/lib/graph-rag";
import { withRetry } from "../src/lib/retry";
import Anthropic from "@anthropic-ai/sdk";

const CHAT_API_URL = process.env.CHAT_API_URL ?? "http://localhost:3001/api/chat";
const RESULTS_DIR = path.resolve(process.cwd(), "docs/outreach");
const RESULTS_JSON = path.join(RESULTS_DIR, "eval-results.json");
const RESULTS_MD = path.join(RESULTS_DIR, "blueprint-fidelity.md");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RetrievalTestCase {
  layer: 1;
  query: string;
  mustContain: string[];
  mustNotContain: string[];
  category: string;
}

interface AdversarialTestCase {
  layer: 2;
  query: string;
  subtype: "misspelling" | "vague" | "off-topic" | "multi-topic" | "myth";
  /** For misspelling: mustContain keywords in retrieval results */
  mustContain?: string[];
  /** For off-topic: patterns to find in chat response indicating refusal */
  refusalPatterns?: string[];
  /** For myth: patterns indicating correction */
  correctionPatterns?: string[];
  /** For vague/multi-topic: mustContain keywords in retrieval results */
  mustContainRetrieval?: string[];
}

interface JudgeTestCase {
  layer: 3;
  query: string;
  /** Source layer/category for reference */
  source: string;
}

interface JudgeScores {
  accuracy: number;
  voice: number;
  groundedness: number;
  actionability: number;
  myth_correction: number | null;
  reasoning: string;
}

type TestCase = RetrievalTestCase | AdversarialTestCase | JudgeTestCase;

// ---------------------------------------------------------------------------
// Incremental results store
// ---------------------------------------------------------------------------

interface Layer1CaseResult {
  query: string;
  category: string;
  pass: boolean;
  recall: number;
  found: string[];
  missing: string[];
  falsePositives: string[];
  error?: string;
}

interface Layer2CaseResult {
  query: string;
  subtype: string;
  pass: boolean;
  detail: string;
  error?: string;
}

interface Layer3CaseResult {
  query: string;
  source: string;
  response?: string;
  scores?: JudgeScores;
  error?: string;
}

interface EvalResultsFile {
  startedAt: string;
  completedAt?: string;
  chatApiUrl: string;
  layer1: Layer1CaseResult[];
  layer2: Layer2CaseResult[];
  layer3: Layer3CaseResult[];
  summary?: {
    layer1?: { passed: number; total: number };
    layer2?: { passed: number; total: number };
    layer3?: { averages: Record<string, number>; total: number };
  };
}

const evalState: EvalResultsFile = {
  startedAt: new Date().toISOString(),
  chatApiUrl: CHAT_API_URL,
  layer1: [],
  layer2: [],
  layer3: [],
};

function ensureResultsDir() {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

function saveResultsIncremental() {
  try {
    ensureResultsDir();
    fs.writeFileSync(RESULTS_JSON, JSON.stringify(evalState, null, 2), "utf8");
  } catch (err) {
    // Don't crash the run over a failed save; just warn.
    console.warn(`[saveResultsIncremental] failed: ${err instanceof Error ? err.message : err}`);
  }
}

function writeMarkdownReport() {
  ensureResultsDir();

  const lines: string[] = [];
  lines.push("# Blueprint Fidelity — Eval Baseline");
  lines.push("");
  lines.push(`**Run started:** ${evalState.startedAt}  `);
  if (evalState.completedAt) lines.push(`**Run completed:** ${evalState.completedAt}  `);
  lines.push(`**Chat endpoint:** \`${evalState.chatApiUrl}\`  `);
  lines.push(`**Raw results:** \`docs/outreach/eval-results.json\``);
  lines.push("");
  lines.push("This report is regenerated every time the eval runs. The JSON sidecar has the full detail; this file is the human-readable summary for the pre-outreach plan.");
  lines.push("");
  lines.push("---");
  lines.push("");

  // Summary header
  lines.push("## Summary");
  lines.push("");
  if (evalState.summary?.layer1) {
    const { passed, total } = evalState.summary.layer1;
    lines.push(`- **Layer 1 (Retrieval Coverage):** ${passed}/${total} passed — ${Math.round((passed / total) * 100)}%`);
  }
  if (evalState.summary?.layer2) {
    const { passed, total } = evalState.summary.layer2;
    lines.push(`- **Layer 2 (Adversarial):** ${passed}/${total} passed — ${Math.round((passed / total) * 100)}%`);
  }
  if (evalState.summary?.layer3) {
    const a = evalState.summary.layer3.averages;
    const overall = (a.accuracy + a.voice + a.groundedness + a.actionability) / 4;
    lines.push(`- **Layer 3 (Answer Quality):** avg ${overall.toFixed(2)}/5 across ${evalState.summary.layer3.total} queries`);
    lines.push(`  - accuracy ${a.accuracy.toFixed(2)} · voice ${a.voice.toFixed(2)} · groundedness ${a.groundedness.toFixed(2)} · actionability ${a.actionability.toFixed(2)} · myth ${a.myth_correction.toFixed(2)}`);
  }
  lines.push("");

  // Baseline delta (persisted across reruns by referencing eval-results.baseline.json).
  // See `.baseline.json` / `.baseline.md` siblings for the pre-judge-fix baseline.
  const BASELINE_L3 = { accuracy: 4.0, voice: 4.0, groundedness: 2.0, actionability: 3.8, myth_correction: 4.1 };
  if (evalState.summary?.layer3) {
    const a = evalState.summary.layer3.averages;
    lines.push("### Delta vs. baseline (pre-judge-fix)");
    lines.push("");
    lines.push("The baseline scored the coach against a rubric that penalized the product for not citing sources it's explicitly forbidden to cite. The fixed rubric uses retrieved chunks as ground truth and scores groundedness as methodological fidelity.");
    lines.push("");
    lines.push("| Dimension | Baseline | Current | Δ |");
    lines.push("|---|---|---|---|");
    for (const [k, base] of Object.entries(BASELINE_L3) as [keyof typeof BASELINE_L3, number][]) {
      const now = a[k];
      if (typeof now === "number") {
        const d = now - base;
        const sign = d >= 0 ? "+" : "";
        lines.push(`| ${k} | ${base.toFixed(2)} | ${now.toFixed(2)} | ${sign}${d.toFixed(2)} |`);
      }
    }
    lines.push("");
  }

  // Accuracy misses (anything <= 2 on accuracy — these are the questions Alex is
  // most likely to probe, so flag them in the summary even when they're rare).
  const misses = evalState.layer3.filter((r) => r.scores && r.scores.accuracy <= 2);
  if (misses.length > 0) {
    lines.push("### Remaining accuracy misses (accuracy ≤ 2)");
    lines.push("");
    lines.push("These are worth flagging even at a high average — Alex will probe the topics he's taught directly. Each is linked to the detailed scoring below.");
    lines.push("");
    for (const r of misses) {
      lines.push(`- **${escapeMd(r.query)}** — accuracy ${r.scores?.accuracy}, source: \`${r.source}\``);
    }
    lines.push("");
  }

  // Layer 1 failures
  const l1fails = evalState.layer1.filter((r) => !r.pass);
  if (l1fails.length > 0) {
    lines.push("## Layer 1 — Retrieval failures");
    lines.push("");
    lines.push("| Query | Recall | Missing keywords | False positives |");
    lines.push("|---|---|---|---|");
    for (const r of l1fails) {
      const rec = `${Math.round(r.recall * 100)}%`;
      const miss = r.missing.length ? r.missing.join(", ") : "—";
      const fp = r.falsePositives.length ? r.falsePositives.join(", ") : "—";
      lines.push(`| ${escapeMd(r.query)} | ${rec} | ${escapeMd(miss)} | ${escapeMd(fp)} |`);
    }
    lines.push("");
  }

  // Layer 2 failures
  const l2fails = evalState.layer2.filter((r) => !r.pass);
  if (l2fails.length > 0) {
    lines.push("## Layer 2 — Adversarial failures");
    lines.push("");
    lines.push("| Query | Subtype | Detail |");
    lines.push("|---|---|---|");
    for (const r of l2fails) {
      lines.push(`| ${escapeMd(r.query)} | ${r.subtype} | ${escapeMd(r.detail)} |`);
    }
    lines.push("");
  }

  // Layer 3 — all scores + reasoning (Alex will want to see these)
  if (evalState.layer3.length > 0) {
    lines.push("## Layer 3 — Answer Quality (per query)");
    lines.push("");
    lines.push("Scored 1–5 on accuracy, voice, groundedness, actionability, myth correction.");
    lines.push("");
    for (const r of evalState.layer3) {
      lines.push(`### ${escapeMd(r.query)}`);
      if (r.scores) {
        const s = r.scores;
        lines.push(`- Scores — accuracy **${s.accuracy}** · voice **${s.voice}** · grounded **${s.groundedness}** · actionable **${s.actionability}** · myth ${s.myth_correction ?? "N/A"}`);
        lines.push(`- Judge reasoning: ${s.reasoning}`);
      } else if (r.error) {
        lines.push(`- **ERROR**: ${escapeMd(r.error)}`);
      }
      if (r.response) {
        lines.push("");
        lines.push("<details><summary>Coach response</summary>");
        lines.push("");
        lines.push("```");
        lines.push(r.response);
        lines.push("```");
        lines.push("</details>");
      }
      lines.push("");
    }
  }

  // Errors (any layer)
  const allErrors = [
    ...evalState.layer1.filter((r) => r.error).map((r) => ({ layer: 1, query: r.query, error: r.error! })),
    ...evalState.layer2.filter((r) => r.error).map((r) => ({ layer: 2, query: r.query, error: r.error! })),
    ...evalState.layer3.filter((r) => r.error).map((r) => ({ layer: 3, query: r.query, error: r.error! })),
  ];
  if (allErrors.length > 0) {
    lines.push("## Errors");
    lines.push("");
    for (const e of allErrors) {
      lines.push(`- **L${e.layer}** \`${escapeMd(e.query)}\` — ${escapeMd(e.error)}`);
    }
    lines.push("");
  }

  fs.writeFileSync(RESULTS_MD, lines.join("\n"), "utf8");
}

function escapeMd(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

// ---------------------------------------------------------------------------
// Layer 1: Retrieval Coverage (50 queries)
// ---------------------------------------------------------------------------

const LAYER_1_CASES: RetrievalTestCase[] = [
  // --- Fighters (23 queries) ---
  { layer: 1, category: "fighter", query: "How does Canelo Alvarez use his jab?", mustContain: ["canelo", "jab"], mustNotContain: [] },
  { layer: 1, category: "fighter", query: "How does Artur Beterbiev generate power?", mustContain: ["beterbiev", "power"], mustNotContain: [] },
  { layer: 1, category: "fighter", query: "How does GGG use his power punching?", mustContain: ["ggg"], mustNotContain: [] },
  { layer: 1, category: "fighter", query: "How does Mike Tyson generate knockout power?", mustContain: ["tyson", "power"], mustNotContain: [] },
  { layer: 1, category: "fighter", query: "How does Floyd Mayweather Jr use defense and timing?", mustContain: ["mayweather"], mustNotContain: [] },
  { layer: 1, category: "fighter", query: "How does Terence Crawford switch stances?", mustContain: ["crawford"], mustNotContain: [] },
  { layer: 1, category: "fighter", query: "How does Alex Pereira generate power in his strikes?", mustContain: ["pereira"], mustNotContain: [] },
  { layer: 1, category: "fighter", query: "How does Earnie Shavers generate his legendary power?", mustContain: ["shavers"], mustNotContain: [] },
  { layer: 1, category: "fighter", query: "How does Gervonta Davis generate knockout power?", mustContain: ["davis"], mustNotContain: [] },
  { layer: 1, category: "fighter", query: "How does Ilia Topuria use his punching technique?", mustContain: ["topuria"], mustNotContain: [] },
  { layer: 1, category: "fighter", query: "How does Deontay Wilder generate his right hand power?", mustContain: ["wilder"], mustNotContain: [] },
  { layer: 1, category: "fighter", query: "How does James Toney use his defensive technique?", mustContain: ["toney"], mustNotContain: [] },
  { layer: 1, category: "fighter", query: "What does Jake Paul do wrong in his technique?", mustContain: ["paul"], mustNotContain: [] },
  { layer: 1, category: "fighter", query: "How does Tim Bradley use his technique?", mustContain: ["bradley"], mustNotContain: [] },
  { layer: 1, category: "fighter", query: "How does Devin Haney use his jab?", mustContain: ["haney"], mustNotContain: [] },
  { layer: 1, category: "fighter", query: "How does Ciryl Gane use his striking technique?", mustContain: ["gane"], mustNotContain: [] },
  { layer: 1, category: "fighter", query: "How does Dmitry Bivol use his technique?", mustContain: ["bivol"], mustNotContain: [] },
  { layer: 1, category: "fighter", query: "How does Ramon Dekkers generate power in his punches?", mustContain: ["dekkers"], mustNotContain: [] },
  { layer: 1, category: "fighter", query: "How does Charles Oliveira use his striking?", mustContain: ["oliveira"], mustNotContain: [] },
  { layer: 1, category: "fighter", query: "How does Oscar De La Hoya use his technique?", mustContain: ["de la hoya"], mustNotContain: [] },
  { layer: 1, category: "fighter", query: "How does Tommy Hearns generate power?", mustContain: ["hearns"], mustNotContain: [] },
  { layer: 1, category: "fighter", query: "How does Naoya Inoue generate knockout power?", mustContain: ["inoue"], mustNotContain: [] },
  { layer: 1, category: "fighter", query: "How does Ryan Garcia use his speed and technique?", mustContain: ["garcia"], mustNotContain: [] },

  // --- Techniques (6 queries) ---
  { layer: 1, category: "technique", query: "How to throw a proper jab?", mustContain: ["jab"], mustNotContain: [] },
  { layer: 1, category: "technique", query: "How to throw a proper straight or cross?", mustContain: ["cross"], mustNotContain: [] },
  { layer: 1, category: "technique", query: "How to throw a proper hook?", mustContain: ["hook"], mustNotContain: [] },
  { layer: 1, category: "technique", query: "How to throw a proper uppercut?", mustContain: ["uppercut"], mustNotContain: [] },
  { layer: 1, category: "technique", query: "How to throw a proper overhand punch?", mustContain: ["overhand"], mustNotContain: [] },
  { layer: 1, category: "technique", query: "How to throw a proper left hook?", mustContain: ["hook", "left"], mustNotContain: [] },

  // --- Core Concepts (5 queries) ---
  { layer: 1, category: "concept", query: "Explain kinetic chains in punching", mustContain: ["kinetic", "chain"], mustNotContain: [] },
  { layer: 1, category: "concept", query: "Explain the 4 phases of power in punching", mustContain: ["phase"], mustNotContain: [] },
  { layer: 1, category: "concept", query: "What is shearing force in punching?", mustContain: ["shearing", "force"], mustNotContain: [] },
  { layer: 1, category: "concept", query: "What is the difference between throwing and pushing a punch?", mustContain: ["throw", "push"], mustNotContain: [] },
  { layer: 1, category: "concept", query: "What is the stretch-shortening cycle in punching?", mustContain: ["stretch", "shortening"], mustNotContain: [] },

  // --- Drills (4 queries) ---
  { layer: 1, category: "drill", query: "How do I do the hip opening drill?", mustContain: ["hip", "drill"], mustNotContain: [] },
  { layer: 1, category: "drill", query: "How do I do the medicine ball throw for boxing?", mustContain: ["medicine", "ball"], mustNotContain: [] },
  { layer: 1, category: "drill", query: "How do I do the high five exercise for punching?", mustContain: ["high five"], mustNotContain: [] },
  { layer: 1, category: "drill", query: "What bag work routine should I use?", mustContain: ["bag"], mustNotContain: [] },

  // --- Cross-topic (6 queries) ---
  { layer: 1, category: "cross-topic", query: "Compare Canelo's jab to GGG's power punch", mustContain: ["canelo", "ggg"], mustNotContain: [] },
  { layer: 1, category: "cross-topic", query: "Which kinetic chains are used in a hook vs an uppercut?", mustContain: ["kinetic", "chain", "hook"], mustNotContain: [] },
  { layer: 1, category: "cross-topic", query: "How does hip rotation differ between a jab and a straight?", mustContain: ["hip", "rotation"], mustNotContain: [] },
  { layer: 1, category: "cross-topic", query: "What drills help with Phase 2 hip explosion?", mustContain: ["phase", "hip"], mustNotContain: [] },
  { layer: 1, category: "cross-topic", query: "How does shearing force apply to the hook?", mustContain: ["shearing", "hook"], mustNotContain: [] },
  { layer: 1, category: "cross-topic", query: "Compare Beterbiev and Bivol's punch mechanics", mustContain: ["beterbiev", "bivol"], mustNotContain: [] },

  // --- Phase-specific (4 queries) ---
  { layer: 1, category: "phase", query: "What happens during Phase 1 Loading?", mustContain: ["phase", "load"], mustNotContain: [] },
  { layer: 1, category: "phase", query: "How does Phase 2 Hip Explosion generate torque?", mustContain: ["phase", "hip"], mustNotContain: [] },
  { layer: 1, category: "phase", query: "What is Phase 3 Core Transfer?", mustContain: ["phase", "core", "transfer"], mustNotContain: [] },
  { layer: 1, category: "phase", query: "Why is Phase 4 Follow Through important?", mustContain: ["phase", "follow"], mustNotContain: [] },

  // --- Injury Prevention (2 queries) ---
  { layer: 1, category: "injury", query: "Rotator cuff warm-up exercises for boxing", mustContain: ["rotator", "cuff"], mustNotContain: [] },
  { layer: 1, category: "injury", query: "Shoulder stability training for fighters", mustContain: ["shoulder"], mustNotContain: [] },

  // --- Crawford vs Canelo (5 queries) ---
  { layer: 1, category: "cross-topic", query: "How did Crawford beat Canelo?", mustContain: ["crawford", "canelo"], mustNotContain: [] },
  { layer: 1, category: "cross-topic", query: "What was Canelo's biggest mistake against Crawford?", mustContain: ["canelo"], mustNotContain: [] },
  { layer: 1, category: "cross-topic", query: "Explain Crawford's positional readiness against Canelo", mustContain: ["crawford"], mustNotContain: [] },
  { layer: 1, category: "cross-topic", query: "How did Crawford use his jab to control Canelo?", mustContain: ["crawford", "jab"], mustNotContain: [] },
  { layer: 1, category: "cross-topic", query: "What did Crawford do better than Canelo mechanically?", mustContain: ["crawford"], mustNotContain: [] },

  // --- Stance/Footwork/Defense (6 queries) ---
  { layer: 1, category: "technique", query: "How should I set up my boxing stance for maximum power?", mustContain: ["stance"], mustNotContain: [] },
  { layer: 1, category: "technique", query: "What's the right footwork for boxing?", mustContain: ["foot"], mustNotContain: [] },
  { layer: 1, category: "technique", query: "How does head movement work in boxing?", mustContain: ["head"], mustNotContain: [] },
  { layer: 1, category: "technique", query: "How do I improve my defense in boxing?", mustContain: ["defense"], mustNotContain: [] },
  { layer: 1, category: "technique", query: "What's the proper weight distribution in a boxing stance?", mustContain: ["weight"], mustNotContain: [] },
  { layer: 1, category: "technique", query: "How do I set up combinations effectively?", mustContain: ["combination"], mustNotContain: [] },
];

// ---------------------------------------------------------------------------
// Layer 2: Adversarial (20 queries)
// ---------------------------------------------------------------------------

const LAYER_2_CASES: AdversarialTestCase[] = [
  // --- Misspellings (5) ---
  { layer: 2, subtype: "misspelling", query: "beterbiyev power", mustContain: ["beterbiev"] },
  { layer: 2, subtype: "misspelling", query: "kineitc chains explained", mustContain: ["kinetic", "chain"] },
  { layer: 2, subtype: "misspelling", query: "canello jab mechanics", mustContain: ["canelo"] },
  { layer: 2, subtype: "misspelling", query: "uppercut mechancis", mustContain: ["uppercut"] },
  { layer: 2, subtype: "misspelling", query: "streching shortning cycle", mustContain: ["stretch", "shortening"] },

  // --- Vague/Beginner (5) ---
  { layer: 2, subtype: "vague", query: "my punches feel weak", mustContainRetrieval: ["power"] },
  { layer: 2, subtype: "vague", query: "I keep getting hit", mustContainRetrieval: ["defense"] },
  { layer: 2, subtype: "vague", query: "how do I punch harder", mustContainRetrieval: ["power"] },
  { layer: 2, subtype: "vague", query: "I'm a beginner what should I know first", mustContainRetrieval: ["phase"] },
  { layer: 2, subtype: "vague", query: "what am I probably doing wrong", mustContainRetrieval: ["push"] },

  // --- Off-topic (3) — should answer helpfully AND steer back to mechanics ---
  { layer: 2, subtype: "off-topic", query: "what should I eat before training", refusalPatterns: ["mechanic", "kinetic", "phase", "power", "technique", "punch"] },
  { layer: 2, subtype: "off-topic", query: "how to run faster for boxing", refusalPatterns: ["mechanic", "kinetic", "phase", "power", "technique", "explosive", "athletic"] },
  { layer: 2, subtype: "off-topic", query: "what are the best boxing gloves", refusalPatterns: ["mechanic", "kinetic", "phase", "wrap", "knuckle", "impact", "shearing"] },

  // --- Multi-topic (4) ---
  { layer: 2, subtype: "multi-topic", query: "compare Canelo's jab to Beterbiev's right hand", mustContainRetrieval: ["canelo", "beterbiev"] },
  { layer: 2, subtype: "multi-topic", query: "what's the difference between GGG and Mayweather's styles", mustContainRetrieval: ["ggg", "mayweather"] },
  { layer: 2, subtype: "multi-topic", query: "which phase matters most for hooks vs uppercuts", mustContainRetrieval: ["phase", "hook"] },
  { layer: 2, subtype: "multi-topic", query: "should I train like Tyson or like Crawford", mustContainRetrieval: ["tyson", "crawford"] },

  // --- Trick/Myth (3) ---
  { layer: 2, subtype: "myth", query: "should I breathe out when I punch", correctionPatterns: ["wrong", "myth", "actually", "doesn't generate", "don't", "no", "pressure", "intra-abdominal"] },
  { layer: 2, subtype: "myth", query: "should I put my shoulder into it for more power", correctionPatterns: ["wrong", "myth", "actually", "doesn't generate", "transfer", "leak", "doesn't"] },
  { layer: 2, subtype: "myth", query: "power comes from the heel right", correctionPatterns: ["wrong", "myth", "actually", "doesn't generate", "not really", "kinetic chain", "flat foot"] },
];

// ---------------------------------------------------------------------------
// Layer 3: Answer Quality — LLM-as-Judge (30 queries)
// ---------------------------------------------------------------------------

const LAYER_3_CASES: JudgeTestCase[] = [
  // From fighters
  { layer: 3, query: "How does Canelo Alvarez use his jab?", source: "fighter" },
  { layer: 3, query: "How does Artur Beterbiev generate power?", source: "fighter" },
  { layer: 3, query: "How does GGG use his power punching?", source: "fighter" },
  { layer: 3, query: "How does Mike Tyson generate knockout power?", source: "fighter" },
  { layer: 3, query: "How does Floyd Mayweather Jr use defense and timing?", source: "fighter" },
  { layer: 3, query: "How does Terence Crawford switch stances?", source: "fighter" },
  { layer: 3, query: "How does Gervonta Davis generate knockout power?", source: "fighter" },
  { layer: 3, query: "How does Naoya Inoue generate knockout power?", source: "fighter" },
  // From techniques
  { layer: 3, query: "How to throw a proper jab?", source: "technique" },
  { layer: 3, query: "How to throw a proper hook?", source: "technique" },
  { layer: 3, query: "How to throw a proper uppercut?", source: "technique" },
  { layer: 3, query: "How to throw a proper straight or cross?", source: "technique" },
  // From concepts
  { layer: 3, query: "Explain kinetic chains in punching", source: "concept" },
  { layer: 3, query: "Explain the 4 phases of power in punching", source: "concept" },
  { layer: 3, query: "What is shearing force in punching?", source: "concept" },
  { layer: 3, query: "What is the stretch-shortening cycle in punching?", source: "concept" },
  { layer: 3, query: "What is the difference between throwing and pushing a punch?", source: "concept" },
  // From drills
  { layer: 3, query: "How do I do the hip opening drill?", source: "drill" },
  { layer: 3, query: "What bag work routine should I use?", source: "drill" },
  // From cross-topic
  { layer: 3, query: "Compare Canelo's jab to GGG's power punch", source: "cross-topic" },
  { layer: 3, query: "Compare Beterbiev and Bivol's punch mechanics", source: "cross-topic" },
  // From phases
  { layer: 3, query: "How does Phase 2 Hip Explosion generate torque?", source: "phase" },
  { layer: 3, query: "Why is Phase 4 Follow Through important?", source: "phase" },
  // From adversarial — vague
  { layer: 3, query: "my punches feel weak", source: "vague" },
  { layer: 3, query: "how do I punch harder", source: "vague" },
  { layer: 3, query: "I'm a beginner what should I know first", source: "vague" },
  // From adversarial — myth
  { layer: 3, query: "should I breathe out when I punch", source: "myth" },
  { layer: 3, query: "should I put my shoulder into it for more power", source: "myth" },
  { layer: 3, query: "power comes from the heel right", source: "myth" },
  // From adversarial — off-topic
  { layer: 3, query: "what should I eat before training", source: "off-topic" },
  // Blueprint Fidelity — signature Alex teachings where drift is easy to spot.
  // Ground truth drawn from vault "What Alex Teaches" sections — these are questions
  // Alex would instantly recognize: either "yes that's exactly my framework" or
  // "no you got it wrong." If any of these score accuracy ≤3 it's a real fidelity issue.
  { layer: 3, query: "Should I land a hook with my palm facing me or palm down?", source: "blueprint-fidelity" },
  { layer: 3, query: "Should I pivot on the ball of my front foot for a hook?", source: "blueprint-fidelity" },
  { layer: 3, query: "Which knuckles should I land with when I punch?", source: "blueprint-fidelity" },
  { layer: 3, query: "Should I snap my punches back after contact?", source: "blueprint-fidelity" },
  { layer: 3, query: "Should I step forward when I throw a punch?", source: "blueprint-fidelity" },
  { layer: 3, query: "Should my shoulders be tense or loose when I punch?", source: "blueprint-fidelity" },
  { layer: 3, query: "How does arc trajectory work in a hook?", source: "blueprint-fidelity" },
  { layer: 3, query: "What does 'loose until impact' mean in punching?", source: "blueprint-fidelity" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function containsKeyword(text: string, keyword: string): boolean {
  return text.toLowerCase().includes(keyword.toLowerCase());
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function allChunksText(chunks: any[]): string {
  return chunks.map((c) => {
    const parts = [c.content as string];
    if (c.video_title) parts.push(c.video_title as string);
    if (c.pdf_file) parts.push(c.pdf_file as string);
    if (c.category) parts.push(c.category as string);
    return parts.join(" ");
  }).join(" ");
}

function parseLayerArg(): number | null {
  const arg = process.argv.find((a) => a.startsWith("--layer="));
  if (!arg) return null;
  const num = parseInt(arg.split("=")[1], 10);
  if (num >= 1 && num <= 3) return num;
  console.error(`Invalid --layer value. Use 1, 2, or 3.`);
  process.exit(1);
}

function parseSourceArg(): string | null {
  const arg = process.argv.find((a) => a.startsWith("--source="));
  if (!arg) return null;
  return arg.split("=")[1] ?? null;
}

async function chatAPI(query: string): Promise<string> {
  return withRetry(
    async () => {
      const res = await fetch(CHAT_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({
          messages: [{ role: "user", content: query }],
          context: "technique",
        }),
      });
      if (!res.ok) {
        throw new Error(`Chat API returned ${res.status}: ${await res.text()}`);
      }

      const contentType = res.headers.get("content-type") ?? "";

      // Streaming SSE response — concatenate text content from `data:` events.
      if (contentType.includes("text/event-stream") || contentType.includes("stream")) {
        return await consumeSSE(res);
      }

      // JSON fallback (covers future non-streaming variants).
      const data = await res.json();
      if (typeof data === "string") return data;
      if (data.content) return data.content;
      if (data.message) return data.message;
      if (data.response) return data.response;
      if (data.text) return data.text;
      if (data.choices?.[0]?.message?.content) return data.choices[0].message.content;
      return JSON.stringify(data);
    },
    { label: "chatAPI", maxAttempts: 4 }
  );
}

/**
 * Consume a Server-Sent Events stream from the chat endpoint.
 *
 * Event format (from src/app/api/chat/route.ts): lines like
 *   data: {"type":"text","content":"..."}
 *   data: {"type":"done"}
 * We concatenate the `content` fields of all `type:"text"` events.
 */
async function consumeSSE(res: Response): Promise<string> {
  if (!res.body) throw new Error("Streaming response had no body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Events are separated by blank lines, but we parse line-by-line for simplicity.
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload) continue;
      try {
        const ev = JSON.parse(payload);
        if (ev.type === "text" && typeof ev.content === "string") {
          text += ev.content;
        }
      } catch {
        // Non-JSON data line; ignore.
      }
    }
  }

  // Flush any final buffered line.
  const last = buffer.trim();
  if (last.startsWith("data:")) {
    const payload = last.slice(5).trim();
    try {
      const ev = JSON.parse(payload);
      if (ev.type === "text" && typeof ev.content === "string") text += ev.content;
    } catch {
      // ignore
    }
  }

  return text;
}

const JUDGE_PROMPT = `You are evaluating a boxing AI coach's response.

## What the product actually is (read carefully — the rubric depends on this)
This is a web app coach built on Dr. Alex Wiant's (The Punch Doctor) Power Punching Blueprint and his YouTube catalog. By DELIBERATE product design:
- The AI is a NEUTRAL boxing coach that teaches Alex's methodology. It does NOT claim to BE Alex (no first-person "I", no "my video," no "my course," no "I covered this in…").
- The AI does NOT cite video titles or course chapters by name. It does NOT invent source titles.
- The AI MAY name specific fighters when relevant (e.g., "Gervonta drives off his back foot…"), because fighter names are public domain.
- The AI delivers Alex's specific framework: kinetic chains, 4 phases (Load → Hip Explosion → Core Transfer → Follow Through), throw-not-push, shearing force, stretch-shortening cycle, cross-body chains, lateral hip muscles, last-3-knuckles landing.
- Format: plain paragraphs (no markdown headings), ends with exactly ONE specific drill, direct/tight, no hedging.

You will be given: USER QUESTION, COACH RESPONSE, and RETRIEVED CONTEXT (the RAG chunks the chat used). Use the retrieved context as GROUND TRUTH — do not rely on your own boxing knowledge to flag "hallucinations." If the coach references a fight or concept that appears in the retrieved context, that's grounded, even if you don't recognize it.

Score 1-5 on each criterion:

ACCURACY (1-5):
- 5: Biomechanically correct AND consistent with the retrieved context. No invented fights, drills, or facts.
- 3: Mostly correct, but includes generic advice not supported by the retrieved context.
- 1: Contains claims contradicted by the retrieved context, or fabricates specific fights/drills/events not present in retrieval.

VOICE (1-5):
- 5: Direct, confident, no hedging. Plain paragraphs without markdown headings. Corrects myths without apology. Does NOT impersonate Alex (no first-person "I", no "my framework").
- 3: Mostly direct but drifts into generic AI politeness, bullet lists, or markdown structure.
- 1: Chatbot voice — hedged, listy, apologetic, OR it incorrectly role-plays as Alex himself.

GROUNDEDNESS (methodological fidelity, 1-5):
- 5: Unmistakably rooted in Alex's specific framework — uses his terminology (kinetic chains, 4 phases, stretch-shortening, shearing force, cross-body chains), applies his concepts, names specific fighters when relevant. This answer could NOT have come from a generic boxing AI.
- 3: Uses some of Alex's concepts, but also leans on generic boxing advice.
- 1: Could be from any boxing AI — no specific methodology, platitudes only.
- NOTE: Do NOT reward naming of video titles, course chapters, or self-citations. Those are explicitly disallowed by the product design. Reward USE of the methodology.

ACTIONABILITY (1-5):
- 5: Ends with exactly ONE specific drill with reps/cues/stance. The user knows what to do today.
- 3: General advice, or multiple drills listed without a pick.
- 1: Just explains theory, no action step.

MYTH_CORRECTION (1-5, or null if no myth in the question):
- 5: Catches the misconception immediately and corrects directly with the underlying mechanic.
- 3: Partially addresses the myth.
- 1: Agrees with or ignores the misconception.

Return JSON only, no markdown fences: { "accuracy": N, "voice": N, "groundedness": N, "actionability": N, "myth_correction": N or null, "reasoning": "brief explanation citing specific evidence from the retrieved context when relevant" }`;

async function judgeResponse(
  query: string,
  response: string,
  retrievedContext: string,
  anthropic: Anthropic
): Promise<JudgeScores> {
  const retrievedBlock = retrievedContext
    ? `\n\nRETRIEVED CONTEXT (ground truth — what the RAG pulled):\n<retrieved>\n${retrievedContext.slice(0, 12000)}\n</retrieved>`
    : "\n\nRETRIEVED CONTEXT: (none available — judge on biomechanical plausibility only)";

  const result = await withRetry(
    () =>
      anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 700,
        messages: [
          {
            role: "user",
            content: `USER QUESTION: "${query}"\n\nCOACH RESPONSE:\n${response}${retrievedBlock}\n\n${JUDGE_PROMPT}`,
          },
        ],
      }),
    { label: "judgeResponse", maxAttempts: 4 }
  );

  const text =
    result.content[0].type === "text" ? result.content[0].text : "";

  // Parse JSON — handle potential markdown fences
  const cleaned = text.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
  const parsed = JSON.parse(cleaned) as {
    accuracy: number;
    voice: number;
    groundedness: number;
    actionability: number;
    myth_correction: number | null;
    reasoning: string;
  };

  return {
    accuracy: parsed.accuracy,
    voice: parsed.voice,
    groundedness: parsed.groundedness,
    actionability: parsed.actionability,
    myth_correction: parsed.myth_correction,
    reasoning: parsed.reasoning,
  };
}

// ---------------------------------------------------------------------------
// Layer 1 Runner
// ---------------------------------------------------------------------------

interface Layer1Result {
  query: string;
  pass: boolean;
  recall: number;
  found: string[];
  missing: string[];
  falsePositives: string[];
}

async function runLayer1(): Promise<{ passed: number; total: number }> {
  console.log("=".repeat(70));
  console.log("  Layer 1: Retrieval Coverage (50 queries)");
  console.log("=".repeat(70));

  let passed = 0;
  const total = LAYER_1_CASES.length;

  for (const tc of LAYER_1_CASES) {
    try {
      const { chunks } = await withRetry(
        () => retrieveContext(tc.query, { count: 12 }),
        { label: "retrieveContext", maxAttempts: 3 }
      );
      const combined = allChunksText(chunks);

      const found: string[] = [];
      const missing: string[] = [];
      for (const kw of tc.mustContain) {
        if (containsKeyword(combined, kw)) found.push(kw);
        else missing.push(kw);
      }

      const falsePositives: string[] = [];
      for (const kw of tc.mustNotContain) {
        if (containsKeyword(combined, kw)) falsePositives.push(kw);
      }

      const recall = tc.mustContain.length > 0 ? found.length / tc.mustContain.length : 1;
      const pass = recall >= 0.8 && falsePositives.length === 0;

      evalState.layer1.push({
        query: tc.query,
        category: tc.category,
        pass,
        recall,
        found,
        missing,
        falsePositives,
      });

      if (pass) {
        console.log(
          `[PASS] "${tc.query}" — recall: ${Math.round(recall * 100)}% (${found.length}/${tc.mustContain.length})`
        );
        passed++;
      } else {
        const extras: string[] = [];
        if (missing.length > 0) extras.push(`missing: [${missing.join(", ")}]`);
        if (falsePositives.length > 0) extras.push(`unwanted: [${falsePositives.join(", ")}]`);
        console.log(
          `[FAIL] "${tc.query}" — recall: ${Math.round(recall * 100)}% (${found.length}/${tc.mustContain.length}) — ${extras.join(", ")}`
        );
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.log(`[ERROR] "${tc.query}" — ${errMsg}`);
      evalState.layer1.push({
        query: tc.query,
        category: tc.category,
        pass: false,
        recall: 0,
        found: [],
        missing: tc.mustContain,
        falsePositives: [],
        error: errMsg,
      });
    }
    saveResultsIncremental();
  }

  evalState.summary = { ...(evalState.summary ?? {}), layer1: { passed, total } };
  saveResultsIncremental();

  console.log();
  console.log(`Layer 1: ${passed}/${total} passed (${Math.round((passed / total) * 100)}%)`);
  console.log();

  return { passed, total };
}

// ---------------------------------------------------------------------------
// Layer 2 Runner
// ---------------------------------------------------------------------------

async function runLayer2(): Promise<{ passed: number; total: number }> {
  console.log("=".repeat(70));
  console.log("  Layer 2: Adversarial (20 queries)");
  console.log("=".repeat(70));

  let passed = 0;
  const total = LAYER_2_CASES.length;

  for (const tc of LAYER_2_CASES) {
    let pass = false;
    let detail = "";
    let errorMsg: string | undefined;
    try {
      if (tc.subtype === "misspelling") {
        const { chunks } = await withRetry(
          () => retrieveContext(tc.query, { count: 12 }),
          { label: "retrieveContext", maxAttempts: 3 }
        );
        const combined = allChunksText(chunks);
        const keywords = tc.mustContain ?? [];
        const found = keywords.filter((kw) => containsKeyword(combined, kw));
        const missing = keywords.filter((kw) => !containsKeyword(combined, kw));
        const recall = keywords.length > 0 ? found.length / keywords.length : 1;
        pass = recall >= 0.8;
        detail = pass
          ? `recall: ${Math.round(recall * 100)}%`
          : `recall: ${Math.round(recall * 100)}% — missing: [${missing.join(", ")}]`;
      } else if (tc.subtype === "vague" || tc.subtype === "multi-topic") {
        const { chunks } = await withRetry(
          () => retrieveContext(tc.query, { count: 12 }),
          { label: "retrieveContext", maxAttempts: 3 }
        );
        const combined = allChunksText(chunks);
        const keywords = tc.mustContainRetrieval ?? [];
        const found = keywords.filter((kw) => containsKeyword(combined, kw));
        const missing = keywords.filter((kw) => !containsKeyword(combined, kw));
        const recall = keywords.length > 0 ? found.length / keywords.length : 1;
        pass = recall >= 0.8;
        detail = pass
          ? `recall: ${Math.round(recall * 100)}%`
          : `recall: ${Math.round(recall * 100)}% — missing: [${missing.join(", ")}]`;
      } else if (tc.subtype === "off-topic") {
        const response = await chatAPI(tc.query);
        const lower = response.toLowerCase();
        const patterns = tc.refusalPatterns ?? [];
        const matched = patterns.some((p) => lower.includes(p.toLowerCase()));
        pass = matched;
        detail = pass ? "correctly refused" : `no refusal pattern found in response`;
      } else if (tc.subtype === "myth") {
        const response = await chatAPI(tc.query);
        const lower = response.toLowerCase();
        const patterns = tc.correctionPatterns ?? [];
        const matched = patterns.some((p) => lower.includes(p.toLowerCase()));
        pass = matched;
        detail = pass ? "correctly corrected myth" : `no correction pattern found in response`;
      }

      const subtypeLabel = `(${tc.subtype})`;
      if (pass) {
        console.log(`[PASS] "${tc.query}" ${subtypeLabel} — ${detail}`);
        passed++;
      } else {
        console.log(`[FAIL] "${tc.query}" ${subtypeLabel} — ${detail}`);
      }
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err);
      console.log(`[ERROR] "${tc.query}" — ${errorMsg}`);
      pass = false;
      detail = `error: ${errorMsg}`;
    }

    evalState.layer2.push({
      query: tc.query,
      subtype: tc.subtype,
      pass,
      detail,
      error: errorMsg,
    });
    saveResultsIncremental();
  }

  evalState.summary = { ...(evalState.summary ?? {}), layer2: { passed, total } };
  saveResultsIncremental();

  console.log();
  console.log(`Layer 2: ${passed}/${total} passed (${Math.round((passed / total) * 100)}%)`);
  console.log();

  return { passed, total };
}

// ---------------------------------------------------------------------------
// Layer 3 Runner
// ---------------------------------------------------------------------------

async function runLayer3(): Promise<{
  averages: Record<string, number>;
  total: number;
}> {
  console.log("=".repeat(70));
  console.log("  Layer 3: Answer Quality (38 queries)");
  console.log("=".repeat(70));

  const anthropic = new Anthropic();

  const sourceFilter = parseSourceArg();
  const cases = sourceFilter
    ? LAYER_3_CASES.filter((c) => c.source === sourceFilter)
    : LAYER_3_CASES;
  if (sourceFilter) {
    console.log(`  Filtered to source="${sourceFilter}": ${cases.length} of ${LAYER_3_CASES.length}`);
  }

  const allScores: JudgeScores[] = [];
  const total = cases.length;

  for (const tc of cases) {
    let response: string | undefined;
    let scores: JudgeScores | undefined;
    let errorMsg: string | undefined;
    try {
      // Retrieve the same context the chat API would see, so the judge can
      // use it as ground truth. Small extra cost (~1 Voyage + 1 Supabase query
      // per case), but prevents false-positive hallucination flags when the
      // vault contains information past the judge model's training cutoff.
      const { chunks: judgeChunks } = await withRetry(
        () => retrieveContext(tc.query, { count: 12 }),
        { label: "retrieveContext(judge)", maxAttempts: 3 }
      );
      const retrievedForJudge = allChunksText(judgeChunks);

      response = await chatAPI(tc.query);
      scores = await judgeResponse(tc.query, response, retrievedForJudge, anthropic);
      allScores.push(scores);

      console.log(`"${tc.query}"`);
      console.log(
        `  Accuracy: ${scores.accuracy}  Voice: ${scores.voice}  Grounded: ${scores.groundedness}  Action: ${scores.actionability}  Myth: ${scores.myth_correction ?? "N/A"}`
      );
      console.log(`  Reasoning: ${scores.reasoning}`);
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err);
      console.log(`[ERROR] "${tc.query}" — ${errorMsg}`);
    }

    evalState.layer3.push({
      query: tc.query,
      source: tc.source,
      response,
      scores,
      error: errorMsg,
    });
    saveResultsIncremental();
  }

  // Compute averages
  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const accuracyScores = allScores.map((s) => s.accuracy);
  const voiceScores = allScores.map((s) => s.voice);
  const groundednessScores = allScores.map((s) => s.groundedness);
  const actionabilityScores = allScores.map((s) => s.actionability);
  const mythScores = allScores
    .filter((s) => s.myth_correction !== null)
    .map((s) => s.myth_correction as number);

  const averages: Record<string, number> = {
    accuracy: avg(accuracyScores),
    voice: avg(voiceScores),
    groundedness: avg(groundednessScores),
    actionability: avg(actionabilityScores),
    myth_correction: avg(mythScores),
  };

  evalState.summary = { ...(evalState.summary ?? {}), layer3: { averages, total } };
  saveResultsIncremental();

  console.log();
  console.log("Layer 3 Averages:");
  console.log(`  Accuracy:      ${averages.accuracy.toFixed(1)}/5`);
  console.log(`  Voice:         ${averages.voice.toFixed(1)}/5`);
  console.log(`  Groundedness:  ${averages.groundedness.toFixed(1)}/5`);
  console.log(`  Actionability: ${averages.actionability.toFixed(1)}/5`);
  console.log(
    `  Myth:          ${mythScores.length > 0 ? averages.myth_correction.toFixed(1) + "/5" : "N/A"}`
  );
  console.log();

  return { averages, total };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // `--report-only` regenerates the markdown report from the existing JSON
  // without rerunning the eval. Useful after tweaks to the report format
  // (delta tables, misses section, etc.) so we don't need to burn ~18 min
  // and ~$1 of judge cost just to refresh formatting.
  if (process.argv.includes("--report-only")) {
    try {
      const raw = fs.readFileSync(RESULTS_JSON, "utf8");
      const loaded = JSON.parse(raw) as EvalResultsFile;
      Object.assign(evalState, loaded);
      writeMarkdownReport();
      console.log(`Regenerated report at ${RESULTS_MD}`);
      return;
    } catch (err) {
      console.error(`--report-only failed to load ${RESULTS_JSON}: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  }

  const layerFilter = parseLayerArg();
  let anyFailed = false;

  let l1Result: { passed: number; total: number } | null = null;
  let l2Result: { passed: number; total: number } | null = null;
  let l3Result: { averages: Record<string, number>; total: number } | null = null;

  // Layer 1
  if (!layerFilter || layerFilter === 1) {
    l1Result = await runLayer1();
    if (l1Result.passed < l1Result.total) anyFailed = true;
  }

  // Layer 2
  if (!layerFilter || layerFilter === 2) {
    l2Result = await runLayer2();
    if (l2Result.passed < l2Result.total) anyFailed = true;
  }

  // Layer 3
  if (!layerFilter || layerFilter === 3) {
    l3Result = await runLayer3();
    // Fail if any average is below 4.0
    if (l3Result) {
      for (const [key, val] of Object.entries(l3Result.averages)) {
        if (key === "myth_correction") continue; // may have no data
        if (val < 4.0) anyFailed = true;
      }
    }
  }

  // Overall Summary
  console.log("=".repeat(70));
  console.log("  Overall Summary");
  console.log("=".repeat(70));

  if (l1Result) {
    console.log(
      `  Layer 1: ${l1Result.passed}/${l1Result.total} (${Math.round((l1Result.passed / l1Result.total) * 100)}%)`
    );
  }
  if (l2Result) {
    console.log(
      `  Layer 2: ${l2Result.passed}/${l2Result.total} (${Math.round((l2Result.passed / l2Result.total) * 100)}%)`
    );
  }
  if (l3Result) {
    const overallAvg =
      (l3Result.averages.accuracy +
        l3Result.averages.voice +
        l3Result.averages.groundedness +
        l3Result.averages.actionability) /
      4;
    console.log(`  Layer 3: avg ${overallAvg.toFixed(1)}/5`);
  }

  console.log("=".repeat(70));

  // Finalize: stamp completion, save JSON, write markdown report
  evalState.completedAt = new Date().toISOString();
  saveResultsIncremental();
  try {
    writeMarkdownReport();
    console.log(`\n  Report: ${RESULTS_MD}`);
    console.log(`  JSON:   ${RESULTS_JSON}\n`);
  } catch (err) {
    console.warn(`[writeMarkdownReport] failed: ${err instanceof Error ? err.message : err}`);
  }

  if (anyFailed) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Eval suite crashed:", err);
  // Even on crash, try to save the partial report
  try {
    evalState.completedAt = new Date().toISOString();
    saveResultsIncremental();
    writeMarkdownReport();
    console.error(`  Partial report saved to: ${RESULTS_MD}`);
  } catch {
    // swallow — we're already crashing
  }
  process.exit(2);
});
