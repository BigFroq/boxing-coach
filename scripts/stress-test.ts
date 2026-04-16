/**
 * 100-Question Stress Test
 * Tests the full chat experience: answer quality, voice, structure, groundedness.
 * Sends real questions to the chat API and has Claude judge every response.
 *
 * Usage: npm run stress-test
 * Cost: ~$10-15 in API credits (100 chat + 100 judge calls)
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const CHAT_URL = "http://localhost:3001/api/chat";

// ---------------------------------------------------------------------------
// 100 Test Questions — diverse coverage
// ---------------------------------------------------------------------------

const QUESTIONS: { query: string; context: string; category: string }[] = [
  // === FIGHTER ANALYSIS (20) ===
  { query: "Break down how Canelo uses kinetic chains in his jab", context: "technique", category: "fighter" },
  { query: "What makes Beterbiev's right hand so devastating?", context: "technique", category: "fighter" },
  { query: "How does GGG cut off the ring and generate power at mid-range?", context: "technique", category: "fighter" },
  { query: "What did Crawford do to neutralize Canelo?", context: "technique", category: "fighter" },
  { query: "Why is Mike Tyson's power so legendary?", context: "technique", category: "fighter" },
  { query: "How does Floyd Mayweather use mind games to win fights?", context: "technique", category: "fighter" },
  { query: "What makes Gervonta Davis' knockouts so explosive?", context: "technique", category: "fighter" },
  { query: "How does Alex Pereira generate KO power in MMA?", context: "technique", category: "fighter" },
  { query: "What can we learn from Earnie Shavers about punching power?", context: "technique", category: "fighter" },
  { query: "How does Terence Crawford switch stances so effectively?", context: "technique", category: "fighter" },
  { query: "What's wrong with Devin Haney's punch mechanics?", context: "technique", category: "fighter" },
  { query: "Why are Ciryl Gane's punches weak and how can he fix them?", context: "technique", category: "fighter" },
  { query: "How does Ilia Topuria use boxing in MMA?", context: "technique", category: "fighter" },
  { query: "What makes Naoya Inoue so powerful at a lighter weight?", context: "technique", category: "fighter" },
  { query: "Compare Beterbiev and Bivol — who has better mechanics?", context: "technique", category: "fighter" },
  { query: "What did Jake Paul do wrong against Tyson?", context: "technique", category: "fighter" },
  { query: "How does James Toney throw his straight punch differently?", context: "technique", category: "fighter" },
  { query: "How did Crawford make Canelo look average?", context: "technique", category: "fighter" },
  { query: "What's the difference between how Tyson and Wilder generate power?", context: "technique", category: "fighter" },
  { query: "Who has the best jab mechanics of all the fighters you've analyzed?", context: "technique", category: "fighter" },

  // === TECHNIQUE (20) ===
  { query: "How do I throw a proper jab with full kinetic chain involvement?", context: "technique", category: "technique" },
  { query: "What's the biomechanics behind a powerful cross?", context: "technique", category: "technique" },
  { query: "How should I throw a left hook for maximum power?", context: "technique", category: "technique" },
  { query: "Break down the uppercut mechanics phase by phase", context: "technique", category: "technique" },
  { query: "What's the difference between a jab and a straight?", context: "technique", category: "technique" },
  { query: "How do I create snap in my punches?", context: "technique", category: "technique" },
  { query: "What knuckles should I land with and why?", context: "technique", category: "technique" },
  { query: "How does hip opening vs hip closing work for different punches?", context: "technique", category: "technique" },
  { query: "What is shearing force and why does it matter?", context: "technique", category: "technique" },
  { query: "How do I generate power without muscling my punches?", context: "technique", category: "technique" },
  { query: "What's the proper follow through on a power punch?", context: "technique", category: "technique" },
  { query: "How should my stance be set up for maximum power?", context: "technique", category: "technique" },
  { query: "What's the role of the rear foot in punching?", context: "technique", category: "technique" },
  { query: "How do I keep my punches loose until impact?", context: "technique", category: "technique" },
  { query: "What makes a punch a throw instead of a push?", context: "technique", category: "technique" },
  { query: "How do I stop arm punching?", context: "technique", category: "technique" },
  { query: "What's the gazelle hook and how do I throw it?", context: "technique", category: "technique" },
  { query: "How does the one inch punch work biomechanically?", context: "technique", category: "technique" },
  { query: "How do I improve my punch speed without losing power?", context: "technique", category: "technique" },
  { query: "What's the proper way to set up combinations?", context: "technique", category: "technique" },

  // === CONCEPTS (15) ===
  { query: "Explain kinetic chains in boxing — what are they and why do they matter?", context: "technique", category: "concept" },
  { query: "What are the 4 phases of power generation in a punch?", context: "technique", category: "concept" },
  { query: "What is the stretch-shortening cycle and how does it apply to punching?", context: "technique", category: "concept" },
  { query: "What's the difference between old tech and new tech in boxing?", context: "technique", category: "concept" },
  { query: "How does torque generation work in a punch?", context: "technique", category: "concept" },
  { query: "What are cross-body kinetic chains?", context: "technique", category: "concept" },
  { query: "How does the spiral line contribute to punch power?", context: "technique", category: "concept" },
  { query: "What is the front functional line and when is it used?", context: "technique", category: "concept" },
  { query: "How does weight transfer work through the 4 phases?", context: "technique", category: "concept" },
  { query: "What is lockstep and why is it bad for power?", context: "technique", category: "concept" },
  { query: "How does amplitude affect punch power?", context: "technique", category: "concept" },
  { query: "What's the relationship between relaxation and speed?", context: "technique", category: "concept" },
  { query: "How does the superficial back line work in punching?", context: "technique", category: "concept" },
  { query: "What does it mean to carry tension in your chains?", context: "technique", category: "concept" },
  { query: "How does the punch doctor approach differ from traditional coaching?", context: "technique", category: "concept" },

  // === DRILLS (10) ===
  { query: "What's the best drill for developing hip rotation?", context: "drills", category: "drill" },
  { query: "How do I do the medicine ball throw for punching power?", context: "drills", category: "drill" },
  { query: "What exercises build punching power using kinetic chains?", context: "drills", category: "drill" },
  { query: "Give me a bag work routine for developing power", context: "drills", category: "drill" },
  { query: "How do I practice the 4 phases of torque?", context: "drills", category: "drill" },
  { query: "What warm-up should I do before boxing training?", context: "drills", category: "drill" },
  { query: "How do I train my rotator cuff for boxing?", context: "drills", category: "drill" },
  { query: "What neck strengthening exercises should I do?", context: "drills", category: "drill" },
  { query: "How should I wrap my hands properly?", context: "drills", category: "drill" },
  { query: "What shoulder stability exercises do you recommend?", context: "drills", category: "drill" },

  // === MYTHS (10) ===
  { query: "Should I breathe out when I punch?", context: "technique", category: "myth" },
  { query: "Is it true that power comes from the heel?", context: "technique", category: "myth" },
  { query: "Should I put my shoulder into my punches for more power?", context: "technique", category: "myth" },
  { query: "Should I pivot on the ball of my foot when punching?", context: "technique", category: "myth" },
  { query: "I was told to snap my punch back quickly — is that right?", context: "technique", category: "myth" },
  { query: "My coach says to step when I punch — is that correct?", context: "technique", category: "myth" },
  { query: "Is it better to land with the first two knuckles?", context: "technique", category: "myth" },
  { query: "My trainer says natural punchers are born not made — true?", context: "technique", category: "myth" },
  { query: "Should I tense my arm throughout the entire punch?", context: "technique", category: "myth" },
  { query: "Is the shoulder pop a sign of good technique?", context: "technique", category: "myth" },

  // === BEGINNER / VAGUE (10) ===
  { query: "I'm brand new to boxing — where do I start?", context: "technique", category: "beginner" },
  { query: "My punches feel weak, what am I doing wrong?", context: "technique", category: "beginner" },
  { query: "How do I punch harder?", context: "technique", category: "beginner" },
  { query: "I keep getting hit — what should I focus on?", context: "technique", category: "beginner" },
  { query: "What's the most important thing to learn first in boxing?", context: "technique", category: "beginner" },
  { query: "How long does it take to develop real punching power?", context: "technique", category: "beginner" },
  { query: "I can throw a ball well — does that help with punching?", context: "technique", category: "beginner" },
  { query: "What's the biggest mistake beginners make?", context: "technique", category: "beginner" },
  { query: "How do I know if I'm a natural puncher?", context: "technique", category: "beginner" },
  { query: "Which punch should I master first?", context: "technique", category: "beginner" },

  // === COMPARISON / COMPLEX (10) ===
  { query: "Compare the jab mechanics of Canelo vs Crawford", context: "technique", category: "complex" },
  { query: "What's the difference between how a pressure fighter and a counter puncher generate power?", context: "technique", category: "complex" },
  { query: "How does Phase 2 differ for a hook vs an uppercut?", context: "technique", category: "complex" },
  { query: "If I have short reach, which fighters should I study?", context: "technique", category: "complex" },
  { query: "What's more important — speed or proper mechanics?", context: "technique", category: "complex" },
  { query: "How do MMA fighters use boxing kinetic chains differently?", context: "technique", category: "complex" },
  { query: "Which is harder to master — the hook or the uppercut?", context: "technique", category: "complex" },
  { query: "Can your methodology help with kicks too?", context: "technique", category: "complex" },
  { query: "How do southpaw mechanics differ from orthodox?", context: "technique", category: "complex" },
  { query: "What would you fix first about an average gym boxer's technique?", context: "technique", category: "complex" },

  // === OFF-TOPIC / EDGE (5) ===
  { query: "What should I eat before a fight?", context: "technique", category: "edge" },
  { query: "How do I build cardio for boxing?", context: "drills", category: "edge" },
  { query: "What gloves should I buy for sparring?", context: "technique", category: "edge" },
  { query: "How do I deal with pre-fight nerves?", context: "technique", category: "edge" },
  { query: "Is boxing dangerous for your brain?", context: "technique", category: "edge" },
];

// ---------------------------------------------------------------------------
// Judge Rubric
// ---------------------------------------------------------------------------

const JUDGE_PROMPT = `You are evaluating a boxing AI coach's response. The coach is supposed to sound like Dr. Alex Wiant (The Punch Doctor) — direct, authoritative, technically precise.

Score 1-5 on each criterion:

ACCURACY (1-5):
5: Perfectly matches Alex's methodology, no hallucinations
3: Mostly correct but includes some generic advice
1: Contains hallucinated or incorrect claims

VOICE (1-5):
5: Sounds exactly like Alex — direct, opinionated, uses his phrases ("old tech", "kinetic chains", "stretch-shortening cycle")
3: Sounds like a knowledgeable assistant, not Alex specifically
1: Generic AI chatbot voice

GROUNDEDNESS (1-5):
5: References specific video titles or course sections by name
3: General references ("as I teach", "in my methodology")
1: No citations, could be any boxing AI

ACTIONABILITY (1-5):
5: Ends with specific drill, reps, and cues — user knows exactly what to do
3: General advice ("work on hip rotation")
1: Just explains theory, no action steps

STRUCTURE (1-5):
5: Well-organized with clear sections (problem identification, mechanics breakdown by phases, specific prescription). Uses formatting effectively.
3: Readable but no clear structure — one big block of text
1: Rambling, disorganized, hard to follow

MYTH_CORRECTION (1-5, or null if no myth in the question):
5: Catches misconception immediately, corrects bluntly with evidence
3: Partially addresses the myth
1: Agrees with or ignores the misconception

Return ONLY valid JSON: {"accuracy":N,"voice":N,"groundedness":N,"actionability":N,"structure":N,"myth_correction":N_or_null,"brief_note":"one sentence summary"}`;

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

interface Scores {
  accuracy: number;
  voice: number;
  groundedness: number;
  actionability: number;
  structure: number;
  myth_correction: number | null;
  brief_note: string;
}

async function askChat(query: string, context: string): Promise<string> {
  const res = await fetch(CHAT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: query }],
      context,
    }),
  });
  if (!res.ok) throw new Error(`Chat API ${res.status}`);
  const data = await res.json();
  return data.content ?? "";
}

async function judgeResponse(query: string, response: string): Promise<Scores> {
  const result = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 300,
    system: JUDGE_PROMPT,
    messages: [
      {
        role: "user",
        content: `Question: "${query}"\n\nResponse:\n${response.slice(0, 3000)}`,
      },
    ],
  });

  const text = result.content[0].type === "text" ? result.content[0].text : "{}";
  let jsonStr = text;
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) jsonStr = match[1].trim();

  try {
    return JSON.parse(jsonStr) as Scores;
  } catch {
    return { accuracy: 3, voice: 3, groundedness: 3, actionability: 3, structure: 3, myth_correction: null, brief_note: "judge parse error" };
  }
}

async function main() {
  console.log("=".repeat(70));
  console.log("  Punch Doctor AI — 100 Question Stress Test");
  console.log("=".repeat(70));
  console.log();

  const allScores: { query: string; category: string; scores: Scores }[] = [];
  const categoryScores: Record<string, Scores[]> = {};

  for (let i = 0; i < QUESTIONS.length; i++) {
    const q = QUESTIONS[i];
    process.stdout.write(`[${i + 1}/100] ${q.category.padEnd(10)} "${q.query.slice(0, 50)}..." `);

    try {
      const response = await askChat(q.query, q.context);
      const scores = await judgeResponse(q.query, response);

      allScores.push({ query: q.query, category: q.category, scores });
      if (!categoryScores[q.category]) categoryScores[q.category] = [];
      categoryScores[q.category].push(scores);

      const avg = ((scores.accuracy + scores.voice + scores.groundedness + scores.actionability + scores.structure) / 5).toFixed(1);
      console.log(`avg=${avg} A=${scores.accuracy} V=${scores.voice} G=${scores.groundedness} Ac=${scores.actionability} S=${scores.structure}${scores.myth_correction != null ? ` M=${scores.myth_correction}` : ""}`);
    } catch (err) {
      console.log(`ERROR: ${(err as Error).message.slice(0, 60)}`);
      allScores.push({
        query: q.query,
        category: q.category,
        scores: { accuracy: 0, voice: 0, groundedness: 0, actionability: 0, structure: 0, myth_correction: null, brief_note: "error" },
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------

  console.log("\n" + "=".repeat(70));
  console.log("  OVERALL AVERAGES");
  console.log("=".repeat(70));

  const valid = allScores.filter((s) => s.scores.accuracy > 0);
  const avg = (key: keyof Scores) => {
    const vals = valid.map((s) => s.scores[key]).filter((v): v is number => typeof v === "number" && v > 0);
    return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : "N/A";
  };

  console.log(`  Accuracy:      ${avg("accuracy")}/5`);
  console.log(`  Voice:         ${avg("voice")}/5`);
  console.log(`  Groundedness:  ${avg("groundedness")}/5`);
  console.log(`  Actionability: ${avg("actionability")}/5`);
  console.log(`  Structure:     ${avg("structure")}/5`);
  console.log(`  Myth:          ${avg("myth_correction")}/5`);

  const overallAvg = valid.map((s) => {
    const base = [s.scores.accuracy, s.scores.voice, s.scores.groundedness, s.scores.actionability, s.scores.structure];
    return base.reduce((a, b) => a + b, 0) / base.length;
  });
  const totalAvg = overallAvg.length ? (overallAvg.reduce((a, b) => a + b, 0) / overallAvg.length).toFixed(2) : "N/A";
  console.log(`\n  OVERALL: ${totalAvg}/5`);

  // Per-category breakdown
  console.log("\n" + "=".repeat(70));
  console.log("  PER-CATEGORY BREAKDOWN");
  console.log("=".repeat(70));

  for (const [cat, scores] of Object.entries(categoryScores)) {
    const catAvg = (key: keyof Scores) => {
      const vals = scores.map((s) => s[key]).filter((v): v is number => typeof v === "number" && v > 0);
      return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : "N/A";
    };
    console.log(`\n  ${cat.toUpperCase()} (${scores.length} questions)`);
    console.log(`    Accuracy: ${catAvg("accuracy")}  Voice: ${catAvg("voice")}  Ground: ${catAvg("groundedness")}  Action: ${catAvg("actionability")}  Structure: ${catAvg("structure")}${scores.some(s => s.myth_correction != null) ? `  Myth: ${catAvg("myth_correction")}` : ""}`);
  }

  // Worst answers
  console.log("\n" + "=".repeat(70));
  console.log("  BOTTOM 10 (lowest scoring)");
  console.log("=".repeat(70));

  const ranked = [...valid].sort((a, b) => {
    const scoreA = [a.scores.accuracy, a.scores.voice, a.scores.groundedness, a.scores.actionability, a.scores.structure].reduce((x, y) => x + y, 0) / 5;
    const scoreB = [b.scores.accuracy, b.scores.voice, b.scores.groundedness, b.scores.actionability, b.scores.structure].reduce((x, y) => x + y, 0) / 5;
    return scoreA - scoreB;
  });

  for (const item of ranked.slice(0, 10)) {
    const a = item.scores;
    const avgScore = ((a.accuracy + a.voice + a.groundedness + a.actionability + a.structure) / 5).toFixed(1);
    console.log(`  [${avgScore}] "${item.query.slice(0, 55)}..."`);
    console.log(`       A=${a.accuracy} V=${a.voice} G=${a.groundedness} Ac=${a.actionability} S=${a.structure} — ${a.brief_note}`);
  }

  // Best answers
  console.log("\n" + "=".repeat(70));
  console.log("  TOP 10 (highest scoring)");
  console.log("=".repeat(70));

  for (const item of ranked.slice(-10).reverse()) {
    const a = item.scores;
    const avgScore = ((a.accuracy + a.voice + a.groundedness + a.actionability + a.structure) / 5).toFixed(1);
    console.log(`  [${avgScore}] "${item.query.slice(0, 55)}..."`);
    console.log(`       A=${a.accuracy} V=${a.voice} G=${a.groundedness} Ac=${a.actionability} S=${a.structure} — ${a.brief_note}`);
  }

  console.log("\n" + "=".repeat(70));
  console.log(`  COMPLETE: ${valid.length}/100 answered, overall ${totalAvg}/5`);
  console.log("=".repeat(70));

  process.exit(parseFloat(totalAvg as string) >= 4.0 ? 0 : 1);
}

main().catch(console.error);
