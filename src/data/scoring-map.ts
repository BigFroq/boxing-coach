import type { DimensionScores } from "./fighter-profiles";

type DimensionKey = keyof DimensionScores;

/** Score contribution for a single answer option */
interface ScoreEntry {
  [dimension: string]: number;
}

/**
 * Maps each question → option → dimension score contributions.
 * Slider questions use a formula instead of discrete mappings.
 */
export const scoringMap: Record<string, Record<string, ScoreEntry>> = {
  // ─── Part B: Force Generation ──────────────────────────────────────

  power_feel: {
    whip: { powerMechanics: 18, positionalReadiness: 4 },
    drive: { powerMechanics: 10, outputPressure: 6 },
    timing: { powerMechanics: 6, deceptionSetup: 8, positionalReadiness: 4 },
    developing: { powerMechanics: 3 },
  },

  // power_speed handled by sliderScoring below

  default_state: {
    loaded: { positionalReadiness: 16, powerMechanics: 4 },
    moving: { positionalReadiness: 10, rangeControl: 8 },
    relaxed: { positionalReadiness: 4, outputPressure: -4 },
  },

  initiative: {
    lead: { outputPressure: 10, killerInstinct: 6, positionalReadiness: 4 },
    counter: { defensiveIntegration: 12, positionalReadiness: 8, ringIQ: 4 },
    adaptive: { ringIQ: 14, defensiveIntegration: 4, positionalReadiness: 4 },
  },

  // preferred_punches handled by multiselectScoring below

  // ─── Part C: Range & Movement ──────────────────────────────────────

  preferred_range: {
    long: { rangeControl: 16, defensiveIntegration: 4 },
    mid: { rangeControl: 8, outputPressure: 6, powerMechanics: 4 },
    inside: { outputPressure: 12, killerInstinct: 6, powerMechanics: 4 },
    anywhere: { rangeControl: 12, ringIQ: 8 },
  },

  closing_distance: {
    circle: { rangeControl: 14, positionalReadiness: 4 },
    time: { defensiveIntegration: 10, positionalReadiness: 8, ringIQ: 4 },
    embrace: { outputPressure: 12, killerInstinct: 6 },
  },

  footwork: {
    angles: { rangeControl: 12, deceptionSetup: 6, ringIQ: 4 },
    linear: { rangeControl: 10, positionalReadiness: 6 },
    planted: { powerMechanics: 10, positionalReadiness: 6, outputPressure: 4 },
    bouncy: { rangeControl: 8, positionalReadiness: 10, defensiveIntegration: 4 },
  },

  punch_output: {
    high: { outputPressure: 18, killerInstinct: 4 },
    moderate: { outputPressure: 10, ringIQ: 6 },
    selective: { deceptionSetup: 8, ringIQ: 6, powerMechanics: 6 },
  },

  jab_role: {
    weapon: { rangeControl: 14, powerMechanics: 6, positionalReadiness: 4 },
    setup: { rangeControl: 10, deceptionSetup: 8 },
    disruption: { deceptionSetup: 12, rangeControl: 4 },
    rarely: { outputPressure: 6, killerInstinct: 6, powerMechanics: 4 },
  },

  ring_position: {
    center: { rangeControl: 12, ringIQ: 6, positionalReadiness: 4 },
    cutting: { outputPressure: 12, rangeControl: 6, killerInstinct: 4 },
    circling: { rangeControl: 14, defensiveIntegration: 4 },
    trapped: { rangeControl: -6, ringIQ: -4 },
  },

  // ─── Part D: Defense & Ring IQ ─────────────────────────────────────

  defensive_instinct: {
    slip: { defensiveIntegration: 16, positionalReadiness: 4 },
    block: { defensiveIntegration: 10, outputPressure: 6 },
    pull: { rangeControl: 12, defensiveIntegration: 6 },
    parry: { defensiveIntegration: 12, deceptionSetup: 6, ringIQ: 4 },
  },

  clinch: {
    weapon: { defensiveIntegration: 8, ringIQ: 8, outputPressure: 4 },
    emergency: { defensiveIntegration: 10, ringIQ: 4 },
    avoid: { rangeControl: 10, defensiveIntegration: 2 },
    undeveloped: { defensiveIntegration: -2 },
  },

  defensive_system: {
    high_guard: { defensiveIntegration: 12, outputPressure: 6 },
    shoulder_roll: { defensiveIntegration: 16, deceptionSetup: 6 },
    peek_a_boo: { defensiveIntegration: 14, powerMechanics: 6, positionalReadiness: 4 },
    distance: { rangeControl: 12, defensiveIntegration: 10 },
    mixed: { ringIQ: 10, defensiveIntegration: 10 },
  },

  read_opponent: {
    immediate: { ringIQ: 18, defensiveIntegration: 4 },
    patient: { ringIQ: 12, deceptionSetup: 4 },
    focused_internal: { ringIQ: 2, outputPressure: 4 },
  },

  losing_rounds: {
    scrap: { ringIQ: 14, killerInstinct: 6 },
    adjust: { ringIQ: 16, positionalReadiness: 4 },
    commit: { outputPressure: 8, powerMechanics: 4, ringIQ: -2 },
  },

  setup_method: {
    feints: { deceptionSetup: 18, ringIQ: 4 },
    combos: { deceptionSetup: 10, outputPressure: 8 },
    timing: { defensiveIntegration: 10, deceptionSetup: 6, ringIQ: 4 },
    pressure: { outputPressure: 14, killerInstinct: 6 },
  },

  rhythm: {
    steady: { outputPressure: 12, positionalReadiness: 4 },
    broken: { deceptionSetup: 16, ringIQ: 6 },
    burst: { powerMechanics: 8, killerInstinct: 8, deceptionSetup: 4 },
    mirror: { ringIQ: 14, deceptionSetup: 6, defensiveIntegration: 4 },
  },

  // ─── Part E: Psychology & Instinct ─────────────────────────────────

  opponent_hurt: {
    swarm: { killerInstinct: 18, outputPressure: 6 },
    surgical: { killerInstinct: 12, ringIQ: 6, defensiveIntegration: 4 },
    test: { killerInstinct: 6, ringIQ: 8, defensiveIntegration: 4 },
  },

  you_hurt: {
    fire_back: { killerInstinct: 12, outputPressure: 6 },
    clinch: { ringIQ: 10, defensiveIntegration: 8 },
    shell: { defensiveIntegration: 14, positionalReadiness: 4 },
    panic: { defensiveIntegration: -4, ringIQ: -4 },
  },

  championship_rounds: {
    pace: { outputPressure: 14, killerInstinct: 6 },
    smart: { ringIQ: 14, deceptionSetup: 4, positionalReadiness: 4 },
    finish: { killerInstinct: 16, powerMechanics: 4, outputPressure: 4 },
  },

  combo_style: {
    short: { powerMechanics: 12, killerInstinct: 6 },
    medium: { outputPressure: 10, powerMechanics: 4, deceptionSetup: 4 },
    long: { outputPressure: 16, killerInstinct: 4 },
    single: { deceptionSetup: 10, ringIQ: 6, powerMechanics: 4 },
  },

  body_targeting: {
    body_first: { ringIQ: 10, outputPressure: 6, killerInstinct: 4 },
    opportunistic: { ringIQ: 8, defensiveIntegration: 4, rangeControl: 4 },
    headhunter: { powerMechanics: 8, killerInstinct: 10 },
    levels: { deceptionSetup: 10, ringIQ: 8, outputPressure: 4 },
  },

  pacing: {
    fast_start: { outputPressure: 12, killerInstinct: 8 },
    build: { ringIQ: 10, defensiveIntegration: 6, killerInstinct: 4 },
    consistent: { outputPressure: 8, positionalReadiness: 6 },
    instinctive: { ringIQ: -2, outputPressure: 4 },
  },

  weakness: {
    power: { powerMechanics: -8 },
    defense: { defensiveIntegration: -8 },
    cardio: { outputPressure: -8 },
    inside: { rangeControl: -4, defensiveIntegration: -4 },
    distance: { rangeControl: -8 },
    ring_iq: { ringIQ: -8 },
    setup: { deceptionSetup: -8 },
    finishing: { killerInstinct: -8 },
  },
};

/**
 * Scoring formula for slider questions (power_speed: 0-100).
 * 0 = pure power, 100 = pure speed/volume.
 */
export function sliderScoring(questionId: string, value: number): ScoreEntry {
  if (questionId === "power_speed") {
    return {
      powerMechanics: Math.round((100 - value) * 0.18),
      outputPressure: Math.round(value * 0.16),
      killerInstinct: Math.round((100 - value) * 0.06),
      deceptionSetup: Math.round(value * 0.04),
    };
  }
  return {};
}

/**
 * Scoring for multiselect questions (preferred_punches: pick 2).
 * Each selected punch adds to relevant dimensions.
 */
export const multiselectScoring: Record<string, Record<string, ScoreEntry>> = {
  preferred_punches: {
    jab: { rangeControl: 8, positionalReadiness: 4 },
    straight: { powerMechanics: 8, rangeControl: 4 },
    lead_hook: { powerMechanics: 6, outputPressure: 4, killerInstinct: 4 },
    rear_hook: { powerMechanics: 8, killerInstinct: 4 },
    lead_uppercut: { defensiveIntegration: 6, deceptionSetup: 6 },
    rear_uppercut: { powerMechanics: 8, killerInstinct: 6 },
    body_shots: { outputPressure: 6, ringIQ: 6 },
    overhand: { powerMechanics: 8, killerInstinct: 6 },
  },
};
