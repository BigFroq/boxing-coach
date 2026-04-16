export interface DimensionScores {
  powerMechanics: number;
  positionalReadiness: number;
  rangeControl: number;
  defensiveIntegration: number;
  ringIQ: number;
  outputPressure: number;
  deceptionSetup: number;
  killerInstinct: number;
}

export interface FighterProfile {
  slug: string;
  name: string;
  scores: DimensionScores;
  vaultPath: string;
}

export const DIMENSION_LABELS: Record<keyof DimensionScores, string> = {
  powerMechanics: "Power Mechanics",
  positionalReadiness: "Positional Readiness",
  rangeControl: "Range Control",
  defensiveIntegration: "Defensive Integration",
  ringIQ: "Ring IQ & Adaptation",
  outputPressure: "Output & Pressure",
  deceptionSetup: "Deception & Setup",
  killerInstinct: "Killer Instinct",
};

/** Pre-scored across 8 dimensions based on Alex Wiant's vault analyses */
export const fighterProfiles: FighterProfile[] = [
  {
    slug: "alex-pereira",
    name: "Alex Pereira",
    scores: { powerMechanics: 95, positionalReadiness: 88, rangeControl: 82, defensiveIntegration: 75, ringIQ: 78, outputPressure: 85, deceptionSetup: 72, killerInstinct: 88 },
    vaultPath: "vault/fighters/alex-pereira.md",
  },
  {
    slug: "canelo-alvarez",
    name: "Canelo Alvarez",
    scores: { powerMechanics: 65, positionalReadiness: 38, rangeControl: 52, defensiveIntegration: 48, ringIQ: 42, outputPressure: 58, deceptionSetup: 45, killerInstinct: 50 },
    vaultPath: "vault/fighters/canelo-alvarez.md",
  },
  {
    slug: "charles-oliveira",
    name: "Charles Oliveira",
    scores: { powerMechanics: 85, positionalReadiness: 65, rangeControl: 72, defensiveIntegration: 42, ringIQ: 78, outputPressure: 82, deceptionSetup: 80, killerInstinct: 72 },
    vaultPath: "vault/fighters/charles-oliveira.md",
  },
  {
    slug: "ciryl-gane",
    name: "Ciryl Gane",
    scores: { powerMechanics: 38, positionalReadiness: 60, rangeControl: 65, defensiveIntegration: 55, ringIQ: 58, outputPressure: 62, deceptionSetup: 50, killerInstinct: 45 },
    vaultPath: "vault/fighters/ciryl-gane.md",
  },
  {
    slug: "deontay-wilder",
    name: "Deontay Wilder",
    scores: { powerMechanics: 88, positionalReadiness: 72, rangeControl: 65, defensiveIntegration: 55, ringIQ: 48, outputPressure: 75, deceptionSetup: 45, killerInstinct: 80 },
    vaultPath: "vault/fighters/deontay-wilder.md",
  },
  {
    slug: "devin-haney",
    name: "Devin Haney",
    scores: { powerMechanics: 28, positionalReadiness: 62, rangeControl: 68, defensiveIntegration: 70, ringIQ: 65, outputPressure: 45, deceptionSetup: 50, killerInstinct: 35 },
    vaultPath: "vault/fighters/devin-haney.md",
  },
  {
    slug: "dmitry-bivol",
    name: "Dmitry Bivol",
    scores: { powerMechanics: 58, positionalReadiness: 75, rangeControl: 80, defensiveIntegration: 82, ringIQ: 78, outputPressure: 52, deceptionSetup: 65, killerInstinct: 48 },
    vaultPath: "vault/fighters/dmitry-bivol.md",
  },
  {
    slug: "earnie-shavers",
    name: "Earnie Shavers",
    scores: { powerMechanics: 82, positionalReadiness: 58, rangeControl: 62, defensiveIntegration: 50, ringIQ: 55, outputPressure: 70, deceptionSetup: 48, killerInstinct: 78 },
    vaultPath: "vault/fighters/earnie-shavers.md",
  },
  {
    slug: "floyd-mayweather-jr",
    name: "Floyd Mayweather Jr.",
    scores: { powerMechanics: 82, positionalReadiness: 90, rangeControl: 88, defensiveIntegration: 85, ringIQ: 88, outputPressure: 75, deceptionSetup: 85, killerInstinct: 80 },
    vaultPath: "vault/fighters/floyd-mayweather-jr.md",
  },
  {
    slug: "gervonta-davis",
    name: "Gervonta Davis",
    scores: { powerMechanics: 90, positionalReadiness: 82, rangeControl: 75, defensiveIntegration: 68, ringIQ: 72, outputPressure: 85, deceptionSetup: 70, killerInstinct: 88 },
    vaultPath: "vault/fighters/gervonta-davis.md",
  },
  {
    slug: "ilia-topuria",
    name: "Ilia Topuria",
    scores: { powerMechanics: 72, positionalReadiness: 58, rangeControl: 70, defensiveIntegration: 75, ringIQ: 72, outputPressure: 78, deceptionSetup: 68, killerInstinct: 82 },
    vaultPath: "vault/fighters/ilia-topuria.md",
  },
  {
    slug: "jake-paul",
    name: "Jake Paul",
    scores: { powerMechanics: 32, positionalReadiness: 45, rangeControl: 50, defensiveIntegration: 55, ringIQ: 48, outputPressure: 42, deceptionSetup: 40, killerInstinct: 35 },
    vaultPath: "vault/fighters/jake-paul.md",
  },
  {
    slug: "james-toney",
    name: "James Toney",
    scores: { powerMechanics: 82, positionalReadiness: 85, rangeControl: 78, defensiveIntegration: 88, ringIQ: 85, outputPressure: 72, deceptionSetup: 82, killerInstinct: 80 },
    vaultPath: "vault/fighters/james-toney.md",
  },
  {
    slug: "mike-tyson",
    name: "Mike Tyson",
    scores: { powerMechanics: 92, positionalReadiness: 88, rangeControl: 82, defensiveIntegration: 85, ringIQ: 80, outputPressure: 85, deceptionSetup: 75, killerInstinct: 90 },
    vaultPath: "vault/fighters/mike-tyson.md",
  },
  {
    slug: "oscar-de-la-hoya",
    name: "Oscar De La Hoya",
    scores: { powerMechanics: 70, positionalReadiness: 68, rangeControl: 72, defensiveIntegration: 65, ringIQ: 62, outputPressure: 68, deceptionSetup: 55, killerInstinct: 58 },
    vaultPath: "vault/fighters/oscar-de-la-hoya.md",
  },
  {
    slug: "ramon-dekkers",
    name: "Ramon Dekkers",
    scores: { powerMechanics: 85, positionalReadiness: 75, rangeControl: 80, defensiveIntegration: 65, ringIQ: 72, outputPressure: 85, deceptionSetup: 78, killerInstinct: 82 },
    vaultPath: "vault/fighters/ramon-dekkers.md",
  },
  {
    slug: "terence-crawford",
    name: "Terence Crawford",
    scores: { powerMechanics: 78, positionalReadiness: 95, rangeControl: 92, defensiveIntegration: 88, ringIQ: 92, outputPressure: 82, deceptionSetup: 85, killerInstinct: 78 },
    vaultPath: "vault/fighters/terence-crawford.md",
  },
  {
    slug: "tim-bradley",
    name: "Tim Bradley",
    scores: { powerMechanics: 38, positionalReadiness: 60, rangeControl: 62, defensiveIntegration: 68, ringIQ: 65, outputPressure: 48, deceptionSetup: 50, killerInstinct: 40 },
    vaultPath: "vault/fighters/tim-bradley.md",
  },
];
