/**
 * 3-Layer Eval Suite for Punch Doctor AI Boxing Coach
 *
 * Layer 1: Retrieval Coverage (50 queries) — keyword matching on RAG chunks
 * Layer 2: Adversarial (20 queries) — misspellings, vague, off-topic, multi-topic, myth
 * Layer 3: Answer Quality (30 queries) — LLM-as-Judge scoring via Claude Sonnet
 *
 * Usage:
 *   npm run eval              # Run all 3 layers
 *   npm run eval -- --layer=1 # Run only Layer 1
 *   npm run eval -- --layer=2 # Run only Layer 2
 *   npm run eval -- --layer=3 # Run only Layer 3
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { retrieveContext } from "../src/lib/graph-rag";
import Anthropic from "@anthropic-ai/sdk";

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

  // --- Off-topic (3) — should answer helpfully but steer back to mechanics ---
  { layer: 2, subtype: "off-topic", query: "what should I eat before training", refusalPatterns: ["mechanic", "power", "train", "performance", "energy", "fuel"] },
  { layer: 2, subtype: "off-topic", query: "how to run faster for boxing", refusalPatterns: ["mechanic", "athletic", "explosive", "power", "footwork", "condition"] },
  { layer: 2, subtype: "off-topic", query: "what are the best boxing gloves", refusalPatterns: ["mechanic", "hand", "wrap", "impact", "knuckle", "protect"] },

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

async function chatAPI(query: string): Promise<string> {
  const res = await fetch("http://localhost:3001/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: query }],
      context: "technique",
    }),
  });
  if (!res.ok) {
    throw new Error(`Chat API returned ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  // The response shape may vary — try common patterns
  if (typeof data === "string") return data;
  if (data.content) return data.content;
  if (data.message) return data.message;
  if (data.response) return data.response;
  if (data.text) return data.text;
  // If it's a streaming response with choices
  if (data.choices?.[0]?.message?.content) return data.choices[0].message.content;
  return JSON.stringify(data);
}

const JUDGE_PROMPT = `You are evaluating a boxing AI coach response. The coach is supposed to sound like Dr. Alex Wiant (The Punch Doctor) — direct, authoritative, technically precise, uses his specific terminology (kinetic chains, 4 phases, stretch-shortening cycle, shearing force), corrects myths bluntly, prescribes specific drills, references fighters he's analyzed.

Score 1-5 on each criterion:

ACCURACY (1-5):
- 5: Perfectly matches Alex's methodology, no hallucinations
- 3: Mostly correct but includes some generic advice
- 1: Contains hallucinated or incorrect claims

VOICE (1-5):
- 5: Sounds exactly like Alex — direct, opinionated, uses his phrases
- 3: Sounds like a knowledgeable assistant, not Alex specifically
- 1: Generic AI chatbot voice, no personality

GROUNDEDNESS (1-5):
- 5: References specific videos, course sections, fighters by name
- 3: General references ("as Alex teaches...")
- 1: No citations, could be any boxing AI

ACTIONABILITY (1-5):
- 5: Specific drills, reps, cues — user knows exactly what to do
- 3: General advice ("work on hip rotation")
- 1: Just explains theory, no action steps

MYTH_CORRECTION (1-5, or N/A if no myth in the question):
- 5: Catches the misconception immediately, corrects bluntly with evidence
- 3: Partially addresses the myth
- 1: Agrees with or ignores the misconception

Return JSON only, no markdown fences: { "accuracy": N, "voice": N, "groundedness": N, "actionability": N, "myth_correction": N or null, "reasoning": "brief explanation" }`;

async function judgeResponse(
  query: string,
  response: string,
  anthropic: Anthropic
): Promise<JudgeScores> {
  const result = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: `USER QUESTION: "${query}"\n\nCOACH RESPONSE:\n${response}\n\n${JUDGE_PROMPT}`,
      },
    ],
  });

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
      const { chunks } = await retrieveContext(tc.query, { count: 12 });
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
      console.log(`[ERROR] "${tc.query}" — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

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
    try {
      let pass = false;
      let detail = "";

      if (tc.subtype === "misspelling") {
        // Test retrieval — misspelled query should still find correct content
        const { chunks } = await retrieveContext(tc.query, { count: 12 });
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
        // Test retrieval — vague/multi-topic queries should retrieve relevant content
        const { chunks } = await retrieveContext(tc.query, { count: 12 });
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
        // Test chat API — should refuse gracefully
        const response = await chatAPI(tc.query);
        const lower = response.toLowerCase();
        const patterns = tc.refusalPatterns ?? [];
        const matched = patterns.some((p) => lower.includes(p.toLowerCase()));
        pass = matched;
        detail = pass ? "correctly refused" : `no refusal pattern found in response`;
      } else if (tc.subtype === "myth") {
        // Test chat API — should correct the myth
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
      console.log(`[ERROR] "${tc.query}" — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

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
  console.log("  Layer 3: Answer Quality (30 queries)");
  console.log("=".repeat(70));

  const anthropic = new Anthropic();

  const allScores: JudgeScores[] = [];
  const total = LAYER_3_CASES.length;

  for (const tc of LAYER_3_CASES) {
    try {
      const response = await chatAPI(tc.query);
      const scores = await judgeResponse(tc.query, response, anthropic);
      allScores.push(scores);

      console.log(`"${tc.query}"`);
      console.log(
        `  Accuracy: ${scores.accuracy}  Voice: ${scores.voice}  Grounded: ${scores.groundedness}  Action: ${scores.actionability}  Myth: ${scores.myth_correction ?? "N/A"}`
      );
      console.log(`  Reasoning: ${scores.reasoning}`);
    } catch (err) {
      console.log(`[ERROR] "${tc.query}" — ${err instanceof Error ? err.message : String(err)}`);
    }
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

  if (anyFailed) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Eval suite crashed:", err);
  process.exit(2);
});
