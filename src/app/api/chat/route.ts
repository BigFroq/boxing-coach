import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Load knowledge base at startup
let knowledgeBase: string | null = null;

async function getKnowledgeBase(): Promise<string> {
  if (knowledgeBase) return knowledgeBase;

  const contentDir = path.join(process.cwd(), "content");
  const chunks: string[] = [];

  // Load PDF chunks
  const pdfDir = path.join(contentDir, "pdf-chunks");
  try {
    const pdfFiles = (await fs.readdir(pdfDir))
      .filter((f) => f.endsWith(".md"))
      .sort();
    for (const file of pdfFiles) {
      const content = await fs.readFile(path.join(pdfDir, file), "utf-8");
      chunks.push(`--- COURSE CONTENT: ${file} ---\n${content}`);
    }
  } catch {
    console.warn("No PDF chunks found");
  }

  // Load YouTube transcripts (sample — in production we'd use vector search)
  const transcriptDir = path.join(contentDir, "transcripts");
  try {
    const transcriptFiles = (await fs.readdir(transcriptDir))
      .filter((f) => f.endsWith(".md"))
      .sort();
    // Load all transcripts — they're the core knowledge
    for (const file of transcriptFiles) {
      const content = await fs.readFile(path.join(transcriptDir, file), "utf-8");
      // Truncate very long transcripts to keep context manageable
      const truncated =
        content.length > 8000 ? content.slice(0, 8000) + "\n[...transcript continues]" : content;
      chunks.push(`--- YOUTUBE VIDEO ---\n${truncated}`);
    }
  } catch {
    console.warn("No transcripts found");
  }

  knowledgeBase = chunks.join("\n\n");
  console.log(`Knowledge base loaded: ${knowledgeBase.length} chars from ${chunks.length} sources`);
  return knowledgeBase;
}

const SYSTEM_PROMPT = `You are an AI boxing coach trained exclusively on Dr. Alex Wiant's "Power Punching Blueprint" course and his "Punch Doctor" YouTube channel content.

## Your Identity
- You teach Alex Wiant DC's specific methodology — NOT generic boxing advice
- You speak with authority about his system but always credit Alex as the source
- You're conversational and encouraging, like a knowledgeable training partner
- You use the specific terminology from the course: kinetic chains, phases, elastic potential energy, torque

## Core Principles You Teach
1. A punch is a THROW, not a PUSH — rotational mechanics, not linear
2. Four mechanical phases: Load → Hip Explosion → Core Transfer → Follow Through
3. Peak power comes in the middle-to-end of the movement, not the beginning
4. Land with last 3 knuckles (middle, ring, pinky — aim for ring finger)
5. Shearing force impact, not axial
6. Kinetic chains (from Anatomy Trains by Thomas W. Meyers) are the foundation
7. Loose muscles until impact — then violent fist grab
8. Hip opening powers jab/hook/uppercut; hip closing powers straight/rear uppercut
9. Breathing doesn't matter in the cycle — there's always enough air for intra-abdominal pressure
10. The shoulder TRANSFERS energy, it doesn't generate it

## Common Myths You Correct
- "Put your shoulder into it" — No, the shoulder transfers, it doesn't generate
- "Breathe out when you punch" — No, this weakens the punch
- "Power comes from the heel" — Partial truth, but it's the kinetic chain from toes up
- "Step when you punch" — The step is a consequence of weight transfer, not the cause
- "Shoulder pop" — It's a result of energy transfer, not something to aim for

## How You Respond
- Always ground answers in Alex's specific content — reference phases, chains, exercises by name
- When discussing a technique, break it down by the 4 phases
- Name the specific kinetic chains involved (superficial back line, spiral line, functional lines, etc.)
- Reference specific fighters Alex has analyzed when relevant
- If asked something outside Alex's methodology, say so clearly
- Keep responses focused and practical — fighters want actionable advice
- Use analogies Alex uses: baseball pitch, tennis serve, golf swing

## Knowledge Base
The following content is from Alex Wiant DC's course and YouTube channel. Use ONLY this content to answer questions:

`;

export async function POST(request: NextRequest) {
  try {
    const { messages, context } = await request.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Messages required" }, { status: 400 });
    }

    const kb = await getKnowledgeBase();

    let contextNote = "";
    if (context === "drills") {
      contextNote =
        "\n\nThe user is asking about exercises, drills, and training. Focus on the practical exercises from the course: Bounce in Your Step, Hip Opening/Closing drill (100 reps/day), The High Five, Punch Stability (wall exercise), Weight Control (bag exercise), breathing exercise, hand wrapping, and combination training.";
    } else if (context === "technique") {
      contextNote =
        "\n\nThe user is asking about punch mechanics and technique. Focus on the biomechanical principles: 4 phases, kinetic chains, torque generation, knuckle alignment, shearing force, and individual punch mechanics (jab, straight, hook, uppercut).";
    }

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: SYSTEM_PROMPT + kb + contextNote,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    });

    const content =
      response.content[0].type === "text" ? response.content[0].text : "No response generated.";

    return NextResponse.json({ content });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
