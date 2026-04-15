/**
 * Retrieval Eval Suite
 *
 * Tests retrieval quality by running predefined queries through the full
 * graph-RAG pipeline and checking whether expected keywords appear in the
 * returned chunks.
 *
 * Usage:  npm run eval
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { retrieveContext } from "../src/lib/graph-rag";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TestCase {
  query: string;
  /** Keywords that MUST appear (case-insensitive) in at least one chunk */
  mustContain: string[];
  /** Keywords that must NOT appear in any chunk */
  mustNotContain: string[];
}

interface TestResult {
  query: string;
  pass: boolean;
  recall: number;
  found: string[];
  missing: string[];
  falsePositives: string[];
  totalChunks: number;
}

// ---------------------------------------------------------------------------
// Test Cases
// ---------------------------------------------------------------------------

const TEST_CASES: TestCase[] = [
  {
    query: "How does Canelo use his jab?",
    mustContain: ["canelo", "jab"],
    mustNotContain: ["shoulder stability", "neck training"],
  },
  {
    query: "What drill helps with hip rotation?",
    mustContain: ["hip", "drill"],
    mustNotContain: ["hand wrapping"],
  },
  {
    query: "What's wrong with push punching?",
    mustContain: ["throw", "push"],
    mustNotContain: ["hand wrapping", "neck"],
  },
  {
    query: "How does Beterbiev generate power?",
    mustContain: ["beterbiev", "power"],
    mustNotContain: ["neck training"],
  },
  {
    query: "Explain the 4 phases of torque",
    mustContain: ["phase", "torque"],
    mustNotContain: ["hand wrapping"],
  },
  {
    query: "How should I land my knuckles for maximum impact?",
    mustContain: ["knuckle", "shearing"],
    mustNotContain: ["footwork"],
  },
  {
    query: "What exercises build punching power?",
    mustContain: ["exercise", "power"],
    mustNotContain: [],
  },
  {
    query: "How does Floyd Mayweather use mind games?",
    mustContain: ["mayweather", "mind"],
    mustNotContain: ["shoulder stability"],
  },
  {
    query: "Rotator cuff warm-up for boxing",
    mustContain: ["rotator", "cuff"],
    mustNotContain: ["canelo", "ggg"],
  },
  {
    query: "How to wrap hands for boxing",
    mustContain: ["wrap", "hand"],
    mustNotContain: ["beterbiev"],
  },
  // Additional test cases
  {
    query: "How does GGG cut off the ring?",
    mustContain: ["ggg", "ring"],
    mustNotContain: ["hand wrapping"],
  },
  {
    query: "What is the kinetic chain in a punch?",
    mustContain: ["kinetic", "chain"],
    mustNotContain: ["neck training"],
  },
  {
    query: "How to protect yourself from body shots?",
    mustContain: ["body", "protect"],
    mustNotContain: ["hand wrapping"],
  },
  {
    query: "Explain the difference between amateur and pro boxing stance",
    mustContain: ["stance"],
    mustNotContain: [],
  },
  {
    query: "What is shearing force in punching?",
    mustContain: ["shearing", "force"],
    mustNotContain: ["hand wrapping"],
  },
  {
    query: "How to develop a strong cross/straight right?",
    mustContain: ["cross"],
    mustNotContain: [],
  },
  {
    query: "What role does the rear foot play in punching?",
    mustContain: ["foot"],
    mustNotContain: [],
  },
  {
    query: "How to improve head movement and defense?",
    mustContain: ["head", "movement"],
    mustNotContain: [],
  },
  {
    query: "What makes a good counter puncher?",
    mustContain: ["counter"],
    mustNotContain: [],
  },
  {
    query: "Shoulder and neck conditioning for boxing",
    mustContain: ["shoulder"],
    mustNotContain: [],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function containsKeyword(text: string, keyword: string): boolean {
  return text.toLowerCase().includes(keyword.toLowerCase());
}

function allChunksText(chunks: { content: string }[]): string {
  return chunks.map((c) => c.content).join(" ");
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function runTestCase(tc: TestCase): Promise<TestResult> {
  const { chunks } = await retrieveContext(tc.query, { count: 12 });
  const combined = allChunksText(chunks);

  const found: string[] = [];
  const missing: string[] = [];

  for (const keyword of tc.mustContain) {
    if (containsKeyword(combined, keyword)) {
      found.push(keyword);
    } else {
      missing.push(keyword);
    }
  }

  const falsePositives: string[] = [];
  for (const keyword of tc.mustNotContain) {
    if (containsKeyword(combined, keyword)) {
      falsePositives.push(keyword);
    }
  }

  const recall =
    tc.mustContain.length > 0 ? found.length / tc.mustContain.length : 1;
  const pass = recall >= 0.8 && falsePositives.length === 0;

  return {
    query: tc.query,
    pass,
    recall,
    found,
    missing,
    falsePositives,
    totalChunks: chunks.length,
  };
}

async function main() {
  console.log("=".repeat(70));
  console.log("  Boxing Coach — Retrieval Eval Suite");
  console.log(`  ${TEST_CASES.length} test cases`);
  console.log("=".repeat(70));
  console.log();

  const results: TestResult[] = [];
  let passed = 0;
  let failed = 0;

  for (const tc of TEST_CASES) {
    try {
      const result = await runTestCase(tc);
      results.push(result);

      const pct = Math.round(result.recall * 100);
      const foundStr = `${result.found.length}/${result.found.length + result.missing.length} found`;

      if (result.pass) {
        console.log(`[PASS] "${result.query}" — recall: ${pct}% (${foundStr})`);
        passed++;
      } else {
        const extras: string[] = [];
        if (result.missing.length > 0) {
          extras.push(`missing: ${JSON.stringify(result.missing)}`);
        }
        if (result.falsePositives.length > 0) {
          extras.push(
            `unwanted present: ${JSON.stringify(result.falsePositives)}`
          );
        }
        console.log(
          `[FAIL] "${result.query}" — recall: ${pct}% (${foundStr}) — ${extras.join(", ")}`
        );
        failed++;
      }
    } catch (err) {
      console.log(
        `[ERROR] "${tc.query}" — ${err instanceof Error ? err.message : String(err)}`
      );
      failed++;
    }
  }

  // Summary
  console.log();
  console.log("=".repeat(70));
  console.log("  Summary");
  console.log("=".repeat(70));
  console.log(`  Total:  ${TEST_CASES.length}`);
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log(
    `  Pass rate: ${Math.round((passed / TEST_CASES.length) * 100)}%`
  );

  if (results.length > 0) {
    const avgRecall =
      results.reduce((sum, r) => sum + r.recall, 0) / results.length;
    console.log(`  Avg recall: ${Math.round(avgRecall * 100)}%`);
  }

  console.log("=".repeat(70));

  // Exit with non-zero if any failures
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Eval suite crashed:", err);
  process.exit(2);
});
