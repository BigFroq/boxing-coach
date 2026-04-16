import type { DimensionScores } from "./fighter-profiles";

export type QuestionFormat = "mc" | "slider" | "multiselect";
export type QuestionPart = "A" | "B" | "C" | "D" | "E";
export type ExperienceLevel = "beginner" | "intermediate" | "advanced" | "competitor";

export interface QuestionOption {
  value: string;
  label: string;
  description?: string;
}

export interface Question {
  id: string;
  part: QuestionPart;
  partTitle: string;
  question: string;
  /** Alternative wording for advanced/competitor users */
  advancedQuestion?: string;
  format: QuestionFormat;
  options: QuestionOption[];
  /** For multiselect: max selections allowed */
  maxSelections?: number;
  /** For slider: labels for min and max ends */
  sliderLabels?: { min: string; max: string };
  /** If true, only shown to advanced/competitor */
  advancedOnly?: boolean;
  /** If true, this is a scenario question */
  isScenario?: boolean;
  /** Anti-aspirational hint shown above options */
  honestPrompt?: string;
}

// ─── Part A: Foundation ────────────────────────────────────────────────

const partA: Question[] = [
  {
    id: "stance",
    part: "A",
    partTitle: "Foundation",
    question: "Which stance do you use?",
    format: "mc",
    options: [
      { value: "orthodox", label: "Orthodox", description: "Left foot forward" },
      { value: "southpaw", label: "Southpaw", description: "Right foot forward" },
      { value: "switch", label: "Switch", description: "I fight from both stances" },
      { value: "unsure", label: "Not sure yet", description: "Still figuring it out" },
    ],
  },
  {
    id: "height",
    part: "A",
    partTitle: "Foundation",
    question: "What's your height?",
    format: "mc",
    options: [
      { value: "short", label: "Under 5'7\" / 170cm", description: "Compact frame" },
      { value: "average", label: "5'7\" – 6'0\" / 170–183cm", description: "Average build" },
      { value: "tall", label: "Over 6'0\" / 183cm", description: "Long frame" },
    ],
  },
  {
    id: "build",
    part: "A",
    partTitle: "Foundation",
    question: "What's your body type?",
    format: "mc",
    options: [
      { value: "stocky", label: "Stocky / Muscular", description: "Wide shoulders, thick build" },
      { value: "lean", label: "Lean / Athletic", description: "Balanced proportions" },
      { value: "lanky", label: "Long / Lanky", description: "Long limbs, narrow frame" },
    ],
  },
  {
    id: "reach",
    part: "A",
    partTitle: "Foundation",
    question: "How would you describe your reach relative to your height?",
    format: "mc",
    options: [
      { value: "short", label: "Short reach", description: "Arms shorter than average for my height" },
      { value: "average", label: "Average reach", description: "Proportional to height" },
      { value: "long", label: "Long reach", description: "Arms longer than average — reach advantage" },
    ],
  },
  {
    id: "experience",
    part: "A",
    partTitle: "Foundation",
    question: "What's your experience level?",
    format: "mc",
    options: [
      { value: "beginner", label: "Beginner", description: "Less than 1 year, still learning fundamentals" },
      { value: "intermediate", label: "Intermediate", description: "1–3 years, some sparring experience" },
      { value: "advanced", label: "Advanced", description: "3+ years, regular sparring or competition" },
      { value: "competitor", label: "Competitor", description: "Active amateur or pro fighter" },
    ],
  },
  {
    id: "goal",
    part: "A",
    partTitle: "Foundation",
    question: "What's your primary goal?",
    format: "mc",
    options: [
      { value: "competition", label: "Compete", description: "Amateur or pro" },
      { value: "sparring", label: "Hold my own in sparring", description: "Be competitive in the gym" },
      { value: "fitness", label: "Fitness with real technique", description: "Get in shape doing it right" },
      { value: "self_defense", label: "Self defense", description: "Be dangerous if I need to be" },
    ],
  },
];

// ─── Part B: Force Generation ──────────────────────────────────────────

const partB: Question[] = [
  {
    id: "power_feel",
    part: "B",
    partTitle: "How You Generate Force",
    question: "When you throw your hardest shot, what does it feel like?",
    advancedQuestion: "How do you initiate your power shots?",
    format: "mc",
    isScenario: true,
    options: [
      { value: "whip", label: "Like a whip cracking", description: "It starts in my hips and snaps through" },
      { value: "drive", label: "Like driving through a wall", description: "I put my whole body weight behind it" },
      { value: "timing", label: "Quick and sharp", description: "More about timing the shot than muscling it" },
      { value: "developing", label: "Still figuring that out", description: "I don't have a clear feel yet" },
    ],
  },
  {
    id: "power_speed",
    part: "B",
    partTitle: "How You Generate Force",
    question: "Where do you sit on the power vs speed spectrum?",
    format: "slider",
    sliderLabels: { min: "Heavy hands, fewer shots", max: "Fast combos, volume over power" },
    options: [],
  },
  {
    id: "default_state",
    part: "B",
    partTitle: "How You Generate Force",
    question: "Between exchanges, what's your default state?",
    format: "mc",
    options: [
      { value: "loaded", label: "Loaded and coiled", description: "I want to be able to fire at any moment" },
      { value: "moving", label: "Moving and resetting", description: "I reposition between everything" },
      { value: "relaxed", label: "Relaxed and conserving", description: "I turn it on when I need to" },
    ],
  },
  {
    id: "initiative",
    part: "B",
    partTitle: "How You Generate Force",
    question: "Who throws first in an exchange?",
    format: "mc",
    options: [
      { value: "lead", label: "Me", description: "I like being the one who starts the action" },
      { value: "counter", label: "Them", description: "I let them throw first so I can read it and counter" },
      { value: "adaptive", label: "Depends on who I'm fighting", description: "I'll lead against a counter-puncher, counter against a pressure fighter" },
    ],
  },
  {
    id: "preferred_punches",
    part: "B",
    partTitle: "How You Generate Force",
    question: "Which punches do you gravitate toward?",
    honestPrompt: "Pick your top 2. Not what your coach wants you to throw — what you naturally reach for.",
    format: "multiselect",
    maxSelections: 2,
    options: [
      { value: "jab", label: "Jab" },
      { value: "straight", label: "Straight / Cross" },
      { value: "lead_hook", label: "Lead hook" },
      { value: "rear_hook", label: "Rear hook" },
      { value: "lead_uppercut", label: "Lead uppercut" },
      { value: "rear_uppercut", label: "Rear uppercut" },
      { value: "body_shots", label: "Body shots (any)" },
      { value: "overhand", label: "Overhand" },
    ],
  },
];

// ─── Part C: Range & Movement ──────────────────────────────────────────

const partC: Question[] = [
  {
    id: "preferred_range",
    part: "C",
    partTitle: "Range & Movement",
    question: "Where do your best exchanges happen?",
    format: "mc",
    options: [
      { value: "long", label: "Long range", description: "At the end of my jab, where I can see everything coming" },
      { value: "mid", label: "Mid-range", description: "Close enough for combinations but with room to move" },
      { value: "inside", label: "Inside", description: "I like being close enough to feel them breathe" },
      { value: "anywhere", label: "Comfortable anywhere", description: "I try to control where the fight happens" },
    ],
  },
  {
    id: "closing_distance",
    part: "C",
    partTitle: "Range & Movement",
    question: "Your opponent starts aggressively closing the distance on you.",
    format: "mc",
    isScenario: true,
    options: [
      { value: "circle", label: "I circle out and reset", description: "I need my space to work" },
      { value: "time", label: "I stand my ground and time them", description: "Let them walk into my shots" },
      { value: "embrace", label: "Good — now it's my fight", description: "I tie them up or work inside" },
    ],
  },
  {
    id: "footwork",
    part: "C",
    partTitle: "Range & Movement",
    question: "How would you describe your natural footwork?",
    format: "mc",
    options: [
      { value: "angles", label: "I cut angles", description: "Always stepping offline, pivoting, finding new positions" },
      { value: "linear", label: "Forward and back", description: "I control distance by moving in and out" },
      { value: "planted", label: "I plant my feet", description: "Small adjustments — heavy on the ground" },
      { value: "bouncy", label: "Light and bouncy", description: "Always on the balls of my feet" },
    ],
  },
  {
    id: "punch_output",
    part: "C",
    partTitle: "Range & Movement",
    question: "What's your natural punch output like?",
    format: "mc",
    options: [
      { value: "high", label: "High volume", description: "I'm always throwing something, staying busy" },
      { value: "moderate", label: "Moderate", description: "I pick my spots but stay active enough to control the round" },
      { value: "selective", label: "Selective", description: "Fewer punches, but every one has purpose and intent" },
    ],
  },
  {
    id: "jab_role",
    part: "C",
    partTitle: "Range & Movement",
    question: "What role does your jab play?",
    format: "mc",
    options: [
      { value: "weapon", label: "It's my main weapon", description: "Stiff, heavy — I build my whole game around it" },
      { value: "setup", label: "Range finder and setup", description: "Measures distance, opens the door for everything else" },
      { value: "disruption", label: "Mostly for disruption", description: "Flick it out to keep them honest while I look for the real shot" },
      { value: "rarely", label: "I don't use it much", description: "I prefer to lead with power punches or work inside" },
    ],
  },
  {
    id: "ring_position",
    part: "C",
    partTitle: "Range & Movement",
    question: "Where do you naturally end up in the ring?",
    format: "mc",
    options: [
      { value: "center", label: "Center ring", description: "I want the middle — I control the space" },
      { value: "cutting", label: "Cutting off the ring", description: "Herding them toward the ropes or corners" },
      { value: "circling", label: "Circling the outside", description: "Using the whole ring, staying off the ropes" },
      { value: "trapped", label: "On the ropes more than I'd like", description: "Something I'm working on" },
    ],
  },
];

// ─── Part D: Defense & Ring IQ ─────────────────────────────────────────

const partD: Question[] = [
  {
    id: "defensive_instinct",
    part: "D",
    partTitle: "Defense & Ring IQ",
    question: "A straight punch is coming at your face. Your instinct is to...",
    format: "mc",
    isScenario: true,
    options: [
      { value: "slip", label: "Slip it", description: "Move my head offline and look for the counter" },
      { value: "block", label: "Block and fire back", description: "Catch it on the gloves, then answer immediately" },
      { value: "pull", label: "Pull back or step out of range", description: "Make it fall short" },
      { value: "parry", label: "Parry it down", description: "Redirect their momentum against them" },
    ],
  },
  {
    id: "clinch",
    part: "D",
    partTitle: "Defense & Ring IQ",
    question: "What's your relationship with the clinch?",
    format: "mc",
    options: [
      { value: "weapon", label: "It's a weapon", description: "Smother their work, reset on my terms, throw short inside shots" },
      { value: "emergency", label: "Emergency brake", description: "When I'm hurt or out of position, it buys me time" },
      { value: "avoid", label: "I avoid it", description: "I want space to work — the clinch kills my rhythm" },
      { value: "undeveloped", label: "Don't really think about it", description: "It just happens and I deal with it" },
    ],
  },
  {
    id: "defensive_system",
    part: "D",
    partTitle: "Defense & Ring IQ",
    question: "Which defensive system feels most natural to you?",
    format: "mc",
    advancedOnly: true,
    options: [
      { value: "high_guard", label: "High guard", description: "Tight elbows, hands at temples, absorb and counter" },
      { value: "shoulder_roll", label: "Shoulder roll / Philly shell", description: "Lead shoulder up, rear hand high, slip and roll" },
      { value: "peek_a_boo", label: "Peek-a-boo", description: "Hands at cheeks, bob and weave, constant head movement" },
      { value: "distance", label: "Distance-based", description: "I don't get hit because I'm not there" },
      { value: "mixed", label: "I mix them depending on range", description: "Different systems for different situations" },
    ],
  },
  {
    id: "read_opponent",
    part: "D",
    partTitle: "Defense & Ring IQ",
    question: "You've noticed your opponent drops their right hand after throwing the jab. Two rounds in.",
    format: "mc",
    isScenario: true,
    honestPrompt: "All three are valid approaches — what do you actually do?",
    options: [
      { value: "immediate", label: "Already timing my counter", description: "I've been throwing the straight over their jab since I noticed" },
      { value: "patient", label: "I noticed, but I'll wait", description: "I'll capitalize at the right moment — no rush" },
      { value: "focused_internal", label: "Honestly, I'd probably miss that", description: "I'm usually too focused on executing my own game plan" },
    ],
  },
  {
    id: "losing_rounds",
    part: "D",
    partTitle: "Defense & Ring IQ",
    question: "Your game plan isn't working. You're clearly losing rounds.",
    format: "mc",
    isScenario: true,
    options: [
      { value: "scrap", label: "Scrap the plan", description: "Switch to something completely different — Plan B" },
      { value: "adjust", label: "Make adjustments", description: "Tweak what I'm doing, don't throw everything out" },
      { value: "commit", label: "Trust the process", description: "My style works — I just need to execute it sharper" },
    ],
  },
  {
    id: "setup_method",
    part: "D",
    partTitle: "Defense & Ring IQ",
    question: "How do you set up your best punch?",
    format: "mc",
    options: [
      { value: "feints", label: "Feints and fakes", description: "Make them react to nothing, then throw for real" },
      { value: "combos", label: "Combinations", description: "Work behind other punches to open the door" },
      { value: "timing", label: "Timing and patience", description: "Wait for them to commit, then exploit the opening" },
      { value: "pressure", label: "Pressure", description: "Overwhelm with volume until something lands clean" },
    ],
  },
  {
    id: "rhythm",
    part: "D",
    partTitle: "Defense & Ring IQ",
    question: "How would you describe your rhythm when you fight?",
    format: "mc",
    options: [
      { value: "steady", label: "Steady and consistent", description: "I find my pace and stick with it, grinding them down" },
      { value: "broken", label: "I deliberately break my rhythm", description: "Change speeds, pause, then explode — keep them off-balance" },
      { value: "burst", label: "Explosive bursts with quiet periods", description: "I wait, then unload, then reset" },
      { value: "mirror", label: "I match and disrupt their rhythm", description: "Speed up when they slow down, slow down when they speed up" },
    ],
  },
];

// ─── Part E: Psychology & Instinct ─────────────────────────────────────

const partE: Question[] = [
  {
    id: "opponent_hurt",
    part: "E",
    partTitle: "Psychology & Instinct",
    question: "You land a clean shot and your opponent's legs buckle.",
    format: "mc",
    isScenario: true,
    honestPrompt: "All three are legitimate finishing strategies used by world champions.",
    options: [
      { value: "swarm", label: "Time to swarm", description: "Close the distance, pour everything on before they recover" },
      { value: "surgical", label: "Stay sharp", description: "Hurt fighters are dangerous — I pick the right finishing shot, not just any shot" },
      { value: "test", label: "Test them first", description: "Throw a couple probing shots to see if they're really hurt before I commit" },
    ],
  },
  {
    id: "you_hurt",
    part: "E",
    partTitle: "Psychology & Instinct",
    question: "You just got caught with a hard shot. You're hurt.",
    format: "mc",
    isScenario: true,
    honestPrompt: "Be honest — what's your ACTUAL reaction, not what a coach would want you to do.",
    options: [
      { value: "fire_back", label: "I fire back immediately", description: "Make them think twice about pressing forward" },
      { value: "clinch", label: "Grab, clinch, move", description: "Survive the moment, clear my head, then re-engage" },
      { value: "shell", label: "Tighten up my guard", description: "Weather the storm with disciplined defense until I recover" },
      { value: "panic", label: "Honestly — I tend to panic", description: "I just try to survive however I can" },
    ],
  },
  {
    id: "championship_rounds",
    part: "E",
    partTitle: "Psychology & Instinct",
    question: "It's a close fight heading into the championship rounds.",
    format: "mc",
    isScenario: true,
    options: [
      { value: "pace", label: "I raise the pace", description: "Dig deeper and outwork them down the stretch" },
      { value: "smart", label: "I get smarter", description: "Control the pace, make them fight my fight in the rounds that matter" },
      { value: "finish", label: "I go for the finish", description: "Put everything into hurting them and ending it" },
    ],
  },
  {
    id: "combo_style",
    part: "E",
    partTitle: "Psychology & Instinct",
    question: "What kind of combinations feel most natural to you?",
    format: "mc",
    options: [
      { value: "short", label: "Short and sharp — 1-2 punches", description: "Intent behind each one" },
      { value: "medium", label: "3-4 punch combinations", description: "Enough to break through the guard" },
      { value: "long", label: "Long chains — 5+ punches", description: "Head and body, keep firing until something lands" },
      { value: "single", label: "Single shots", description: "I'm a sniper — one perfectly timed punch is all I need" },
    ],
  },
  {
    id: "body_targeting",
    part: "E",
    partTitle: "Psychology & Instinct",
    question: "How do you think about head vs body targeting?",
    format: "mc",
    options: [
      { value: "body_first", label: "Invest in the body early", description: "Slow them down, take their legs, then the head opens up late" },
      { value: "opportunistic", label: "Go where the opening is", description: "Head or body, whatever's there" },
      { value: "headhunter", label: "Mostly headhunting", description: "Looking for the clean shot that changes the fight" },
      { value: "levels", label: "Mix levels constantly", description: "Up-down, down-up — keep them guessing where the next one's coming" },
    ],
  },
  {
    id: "pacing",
    part: "E",
    partTitle: "Psychology & Instinct",
    question: "How do you pace yourself across a fight or hard sparring rounds?",
    format: "mc",
    options: [
      { value: "fast_start", label: "Start fast", description: "Establish dominance early and make them fight my fight from round one" },
      { value: "build", label: "Build momentum", description: "Start calculated, read them, then turn it up as the rounds go on" },
      { value: "consistent", label: "Same gear throughout", description: "Maintain a consistent pace I can sustain" },
      { value: "instinctive", label: "I don't plan it", description: "I react to what's happening and go from there" },
    ],
  },
  {
    id: "weakness",
    part: "E",
    partTitle: "Psychology & Instinct",
    question: "What's the biggest weakness you want to fix?",
    honestPrompt: "Pick the one that bothers you most. This shapes your training recommendations.",
    format: "mc",
    options: [
      { value: "power", label: "Lack of power", description: "I land but don't hurt people" },
      { value: "defense", label: "Getting hit too much", description: "My defense needs serious work" },
      { value: "cardio", label: "Gas tank / cardio", description: "I slow down after a round or two" },
      { value: "inside", label: "Inside fighting", description: "I struggle when opponents get close" },
      { value: "distance", label: "Distance management", description: "I'm either too far or too close" },
      { value: "ring_iq", label: "Ring IQ / reading opponents", description: "I miss patterns and don't adapt enough" },
      { value: "setup", label: "Feinting / setting things up", description: "My punches are too predictable" },
      { value: "finishing", label: "Finishing fights", description: "I hurt people but can't close the show" },
    ],
  },
];

export const allQuestions: Question[] = [...partA, ...partB, ...partC, ...partD, ...partE];

/**
 * Get the question sequence for a given experience level.
 * Beginners/intermediates skip advancedOnly questions.
 */
export function getQuestionSequence(experience: ExperienceLevel): Question[] {
  const isAdvanced = experience === "advanced" || experience === "competitor";
  return allQuestions.filter((q) => !q.advancedOnly || isAdvanced);
}

/**
 * Get the question text appropriate for the experience level.
 */
export function getQuestionText(question: Question, experience: ExperienceLevel): string {
  const isAdvanced = experience === "advanced" || experience === "competitor";
  if (isAdvanced && question.advancedQuestion) {
    return question.advancedQuestion;
  }
  return question.question;
}
