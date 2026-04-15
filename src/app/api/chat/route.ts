import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { retrieveChunks, formatChunksForPrompt, extractCitations } from "@/lib/rag";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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

## How You Respond
- Always ground answers in the retrieved content below — cite which video or course section your answer draws from
- When discussing a technique, break it down by the 4 phases
- Name the specific kinetic chains involved when relevant
- Reference specific fighters Alex has analyzed when relevant
- If the retrieved content doesn't cover the question, say so honestly rather than guessing
- Keep responses focused and practical — fighters want actionable advice
- Use analogies Alex uses: baseball pitch, tennis serve, golf swing

## Retrieved Content
The following excerpts were retrieved from Alex's knowledge base based on the user's question. Ground your answer in this content:

`;

export async function POST(request: NextRequest) {
  try {
    const { messages, context } = await request.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Messages required" }, { status: 400 });
    }

    const lastUserMessage = [...messages].reverse().find((m: { role: string }) => m.role === "user");
    if (!lastUserMessage) {
      return NextResponse.json({ error: "No user message" }, { status: 400 });
    }

    let categories: string[] | undefined;
    if (context === "drills") {
      categories = ["drill", "injury_prevention"];
    } else if (context === "technique") {
      categories = ["mechanics", "theory", "analysis"];
    }

    const chunks = await retrieveChunks(lastUserMessage.content, {
      count: 10,
      categories,
    });

    const contextText = formatChunksForPrompt(chunks);
    const citations = extractCitations(chunks);

    let contextNote = "";
    if (context === "drills") {
      contextNote = "\n\nThe user is asking about exercises, drills, and training. Focus on practical exercises from the course.";
    } else if (context === "technique") {
      contextNote = "\n\nThe user is asking about punch mechanics and technique. Focus on biomechanical principles.";
    }

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      system: SYSTEM_PROMPT + contextText + contextNote,
      messages: messages.slice(-10).map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    });

    const content =
      response.content[0].type === "text" ? response.content[0].text : "No response generated.";

    return NextResponse.json({ content, citations });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
