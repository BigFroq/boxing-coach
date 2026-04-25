import type { DimensionKey } from "@/lib/dimensions";

export type ScoreBand = "below_avg" | "average" | "strong" | "elite" | "peak";

export interface DimensionExplainer {
  /** ~80–100 words. What this dimension means in Alex's framework. */
  definition: string;
  /** Per-band one-line interpretation. */
  bands: Record<ScoreBand, string>;
  /** 2–3 short drill suggestions. */
  drills: string[];
}

export function bandFor(score: number): ScoreBand {
  if (score < 40) return "below_avg";
  if (score < 60) return "average";
  if (score < 75) return "strong";
  if (score < 90) return "elite";
  return "peak";
}

export const BAND_LABELS: Record<ScoreBand, string> = {
  below_avg: "Below average",
  average: "Average",
  strong: "Strong",
  elite: "Elite",
  peak: "Peak",
};

// PLACEHOLDER copy — to be replaced with Alex-authored content before launch.
// Engineering scaffolding only. Each `definition` ≈ 80–100 words; `bands` = one
// sentence per band; `drills` = 2–3 short strings.
export const DIMENSION_EXPLAINERS: Record<DimensionKey, DimensionExplainer> = {
  powerMechanics: {
    definition:
      "Power Mechanics measures how efficiently your body transfers ground reaction force into your fist. It's not about raw strength — it's about kinetic-chain integration: weight shift, hip rotation, oblique-to-serratus connection, and wrist alignment at impact. High scorers generate concussive force from compact movements; low scorers arm-punch and lose energy through breaks in the chain.",
    bands: {
      below_avg: "Punches are arm-driven; minimal hip and ground engagement.",
      average: "Some kinetic chain present; lacks consistency under fatigue.",
      strong: "Solid weight transfer most of the time; gaps in compound combinations.",
      elite: "Reliable through the full kinetic chain; transfers across angles.",
      peak: "Force transfer is automatic; punches feel light to throw, heavy to receive.",
    },
    drills: [
      "Bag work focused on hip-rotation lead with relaxed shoulders",
      "Heavy bag single-shot drills emphasizing weight transfer over speed",
      "Shadow-boxing with foot-stomp markers to feel ground reaction force",
    ],
  },
  positionalReadiness: {
    definition:
      "Positional Readiness is your ability to stay in a position from which you can attack, defend, or move at any moment. High scorers maintain stance integrity through exchanges; low scorers crash forward, square up, or get caught flat-footed. This is the foundation Alex calls 'always being ready to throw the next punch'.",
    bands: {
      below_avg: "Frequently out of stance after combinations.",
      average: "Holds stance early but breaks down under pressure.",
      strong: "Stance integrity through most exchanges; recovers quickly.",
      elite: "Always in position to throw; balanced across feints and slips.",
      peak: "Stance is the default — every action returns to a ready posture.",
    },
    drills: [
      "Shadow-boxing with a focus on returning hands and weight to stance after every combo",
      "3-punch combinations with mandatory pivot or step before the next combination",
      "Mirror work — partner mirrors your stance, you reset between every action",
    ],
  },
  rangeControl: {
    definition:
      "Range Control measures how well you dictate the distance of the fight. High scorers stay where their punches land and their opponent's don't — they own the edge of the bubble. Low scorers either crash inside without setup or drift to the perimeter without committing.",
    bands: {
      below_avg: "Distance is reactive; opponent dictates when exchanges happen.",
      average: "Can hold range against same-stance opponents; struggles vs. southpaws.",
      strong: "Imposes range against most styles; cuts the ring deliberately.",
      elite: "Owns the edge of the bubble; opponent fights at your distance.",
      peak: "Distance manipulation is itself a weapon — feints land like punches.",
    },
    drills: [
      "Jab-and-pivot drills with partner stepping in and out",
      "Footwork-only sparring rounds (no contact) focused on maintaining/changing range",
      "Long-bag work emphasizing the in-and-out without committing to combinations",
    ],
  },
  defensiveIntegration: {
    definition:
      "Defensive Integration is whether your defense flows naturally into your offense. High scorers slip-counter, parry-jab, roll-hook in single rhythm; low scorers either turtle (defense-only) or trade (offense-only). Alex frames this as 'the punch that lands is the one that follows the slip'.",
    bands: {
      below_avg: "Defense and offense are separate phases.",
      average: "Counter happens but with a delay; rhythm break is visible.",
      strong: "Slip-counter and parry-counter integrated against straight punches.",
      elite: "Defense-into-offense across all punch types; counters land in rhythm.",
      peak: "Defensive movement IS offensive setup — every block is a feint.",
    },
    drills: [
      "Partner slow-jab → slip + counter, repeated until it's reflexive",
      "Pad work with the coach mixing defensive cues into offensive sequences",
      "Sparring rounds with explicit rule: no offense without preceding defense",
    ],
  },
  ringIQ: {
    definition:
      "Ring IQ is your ability to read and adapt mid-fight. High scorers diagnose patterns within the first round and adjust their game plan; low scorers run the same script regardless of feedback. This is what separates technicians from athletes — the willingness and skill to change tools mid-exchange.",
    bands: {
      below_avg: "Same approach all three rounds, regardless of result.",
      average: "Adjusts between rounds; struggles to adjust mid-round.",
      strong: "Mid-round adjustments visible; reads opponent's primary tells.",
      elite: "Reads multiple layers (range, rhythm, intent); adjusts tools dynamically.",
      peak: "Several plans deep; sets up the opponent's adjustment with a counter-plan.",
    },
    drills: [
      "Sparring with self-imposed constraints (only jab; only southpaw; only counters) to expand toolkit",
      "Post-round verbal de-brief: identify one thing the opponent did and one thing you'll change",
      "Watch and break down 3 rounds of an opponent type you struggle against",
    ],
  },
  outputPressure: {
    definition:
      "Output & Pressure measures how much you make the opponent fight. High scorers force exchanges, punish breathing room, and turn passive moments into combinations. Low scorers wait — they fight reactively and let the opponent breathe.",
    bands: {
      below_avg: "Reactive; rarely initiates exchanges.",
      average: "Initiates in flurries with long gaps between.",
      strong: "Sustained pressure for 2–3 rounds; output drops late.",
      elite: "Consistent pressure across rounds; opponent never gets clean rest.",
      peak: "Pressure is suffocating — opponent's reads break down under volume.",
    },
    drills: [
      "Round-clock work: continuous output for the full 3 minutes, technique secondary",
      "Pad rounds with a 'no rest' rule — every breath is followed by a punch",
      "Combination cards: pull a random 4-punch sequence every 30s and execute on the bag",
    ],
  },
  deceptionSetup: {
    definition:
      "Deception & Setup is how well you make the opponent expect the wrong thing. High scorers use feints, broken rhythm, and posture changes to set up real punches. Low scorers telegraph — every punch arrives unmasked.",
    bands: {
      below_avg: "Punches are telegraphed; opponent reads intent early.",
      average: "Some basic feints; setups are repetitive.",
      strong: "Multiple feint families; commits are mostly disguised.",
      elite: "Feints and real punches are indistinguishable until late.",
      peak: "Pattern manipulation — opponent reacts to phantom commitments.",
    },
    drills: [
      "Shadow-boxing where 50% of punches are feints, 50% are real, identical setup",
      "Partner drill: throw 3-punch combos where the first one is a feint and partner must guess which",
      "Rhythm-breaking pad work — coach varies the call timing, you maintain composure",
    ],
  },
  killerInstinct: {
    definition:
      "Killer Instinct is the willingness and skill to escalate when the opponent is hurt. High scorers recognize the moment and finish; low scorers either miss it (no recognition) or hesitate (no commitment). Alex frames this as 'the difference between winning rounds and ending fights'.",
    bands: {
      below_avg: "Doesn't recognize hurt opponents; fights at the same intensity throughout.",
      average: "Recognizes the moment but hesitates to commit.",
      strong: "Commits when opponent is clearly hurt; can over-commit and gas.",
      elite: "Reads and exploits hurt windows efficiently without abandoning structure.",
      peak: "Stalks the kill — every exchange is set up to convert if the opportunity opens.",
    },
    drills: [
      "Sparring with explicit 'pressure round' rules — when the bell rings, escalate intent",
      "Heavy-bag finishing combos: 8–12 punches at full output to simulate finishing sequences",
      "Pad work with a coach yelling 'GO' randomly — you immediately commit a 5-punch finish",
    ],
  },
};
