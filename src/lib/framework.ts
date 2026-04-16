// Shared constants for Alex Wiant's Power Punching methodology
// Used across chat, video-review, and style-finder routes

export const FOUR_PHASES = [
  "Phase 1: Loading — elastic potential energy stored in tissues via weight shift",
  "Phase 2: Hip Explosion — hip rotation creates torque (opening for jab/hook/lead uppercut, closing for cross/rear uppercut)",
  "Phase 3: Core Transfer — cross-body kinetic chains transfer energy from hips through core to arm",
  "Phase 4: Follow Through — weight transfers through target, arm unwinds, quick reset",
] as const;

export const KINETIC_CHAINS = [
  "Spiral line",
  "Front functional line",
  "Superficial back line",
  "Lateral line",
  "Cross-body chains",
  "Deep front arm line",
  "Superficial front arm line",
  "Back functional line",
] as const;

export const MYTHS = {
  shoulder: {
    myth: "Put your shoulder into it",
    correction: "Your shoulder transfers energy, it doesn't generate it. Stop popping your shoulder — you're leaking power.",
  },
  breathing: {
    myth: "Breathe out when you punch",
    correction: "That weakens your punch. You need intra-abdominal pressure for core stability during Phase 3.",
  },
  heel: {
    myth: "Power comes from the heel",
    correction: "You're loading tissues by dropping back and pushing off. Power comes from the kinetic chain, not the heel.",
  },
  stepping: {
    myth: "Step when you punch",
    correction: "The step is a consequence of weight transfer, not the cause.",
  },
  pivot: {
    myth: "Pivot on the ball of your foot",
    correction: "Stop trying to squish a bug. Push off a flat foot.",
  },
  snap: {
    myth: "Snap your punch back quickly",
    correction: "That's tag, not a punch. Transfer your mass INTO and THROUGH the target.",
  },
} as const;

export const CORE_PRINCIPLES = [
  "A punch is a THROW, not a PUSH — rotational mechanics, not linear",
  "Four phases: Load → Hip Explosion → Core Transfer → Follow Through",
  "Kinetic chains (Anatomy Trains) — multiple chains in sequence, not a singular chain",
  "Land with last 3 knuckles — shearing force, not axial",
  "Loose until impact, then grab your fist — violent contraction at contact",
  "Hip opening powers jab/hook/lead uppercut; hip closing powers cross/rear uppercut",
  "The shoulder TRANSFERS energy, it doesn't generate it",
  "Breathing doesn't matter — always enough air for intra-abdominal pressure",
  "Old tech (pivot, pop shoulder, breathe out) vs new tech (kinetic chains, natural mechanics)",
  "If you can throw a ball, you can learn these mechanics",
] as const;
