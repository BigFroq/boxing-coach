/**
 * Honest loading narration for chat surfaces. Picks an opener from the
 * user's message, then returns a short rotation of work-narrating lines.
 * Shared by the technique/drills/style chat (chat-tab) and the coach
 * session log (coach-session).
 */

export function pickThinkingOpener(msg: string): string | null {
  const m = msg.toLowerCase();
  if (/\bjab\b/.test(m)) return "Looking at jab mechanics…";
  if (/\bcross\b|\bstraight right\b|\bstraight left\b/.test(m)) return "Looking at cross mechanics…";
  if (/\bhook\b/.test(m)) return "Looking at hook mechanics…";
  if (/\buppercut\b/.test(m)) return "Looking at uppercut mechanics…";
  if (/\bcombo\b|\bcombination\b/.test(m)) return "Thinking through the combo…";
  if (/\bbody shot\b|\bbody work\b|\bto the body\b/.test(m)) return "Looking at body work…";
  if (/\bsouthpaw\b/.test(m)) return "Thinking about the southpaw angle…";
  if (/\borthodox\b/.test(m)) return "Looking at orthodox mechanics…";
  if (/\bfoot(work)?\b|\bpivot\b|\bstep\b/.test(m)) return "Checking footwork…";
  if (/\bhip\b/.test(m)) return "Tracing hip rotation…";
  if (/\bshoulder\b/.test(m)) return "Checking shoulder transfer…";
  if (/\bpower\b|\bknockout\b|\bko\b/.test(m)) return "Tracing where power comes from…";
  if (/\bstance\b|\bguard\b/.test(m)) return "Checking stance…";
  if (/\bdefense\b|\bslip\b|\broll\b|\bblock\b|\bparry\b/.test(m)) return "Looking at defensive mechanics…";
  if (/\bgas(sing)?\b|\btired\b|\bbreath(ing)?\b|\bcardio\b/.test(m)) return "Thinking about conditioning…";
  const fighters = ["gervonta", "mayweather", "pacquiao", "canelo", "lomachenko", "fury", "usyk", "ali", "tyson", "roy jones", "crawford", "inoue"];
  for (const f of fighters) {
    if (m.includes(f)) {
      const cap = f.replace(/\b\w/g, (c) => c.toUpperCase());
      return `Pulling up ${cap}'s footage…`;
    }
  }
  return null;
}

export function getThinkingSequence(lastUserMessage: string, context: string): string[] {
  const opener = pickThinkingOpener(lastUserMessage);
  if (context === "drills") {
    return [opener ?? "Reading your question…", "Pulling relevant drills…", "Picking reps and cues…", "Writing it up…"];
  }
  if (context === "style") {
    return [opener ?? "Reading your question…", "Reading your fighter profile…", "Matching similar fighters…", "Tailoring to your style…"];
  }
  if (context === "coach") {
    // Coach session is a training log, not a Q&A — narrate around what the
    // user did and what's next, not "answering a question."
    return [opener ?? "Reading what you logged…", "Checking your recent focus…", "Thinking about what's next…", "Writing back…"];
  }
  return [opener ?? "Reading your question…", "Checking the kinetic chain…", "Mapping to the four phases…", "Writing it up…"];
}
