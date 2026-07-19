// Shared types for the compounding clip log. Used by storage, aggregation,
// the API route's response shape, and all UI components. Phase names must
// match the existing analysis prompt: Loading / Hip Explosion / Energy
// Transfer / Follow Through.

export type PhaseName = "Loading" | "Hip Explosion" | "Energy Transfer" | "Follow Through";

export interface ClipPhase {
  phase: PhaseName | string;        // string for forward-compat if prompt evolves
  feedback: string;
  score?: number;                   // 1-10 integer; optional for backward compat with v1 rows
}

export interface ClipAnalysis {
  summary: string;
  phases: ClipPhase[];
  strengths: string[];
  improvements: string[];
}

export interface ClipScores {
  loading: number | null;
  hipExplosion: number | null;
  energyTransfer: number | null;
  followThrough: number | null;
  overall: number | null;
}

export interface ClipLog {
  id: string;
  userId: string;
  createdAt: string;                // ISO timestamp
  filename: string | null;
  durationSeconds: number | null;
  analysis: ClipAnalysis;
  scores: ClipScores;
  thumbnailB64: string | null;
  modelVersion: string;
  promptVersion: string;
  /** Punch the fighter asked to have assessed. Null on rows written before
   *  punch selection existed — render defensively. */
  punchType: string | null;
}

export interface ClipHistoryContext {
  windowDays: number;
  totalClips: number;
  trend?: {
    last5Avg: ClipScores;
    prior5Avg: ClipScores;
  };
  mostRecent?: {
    daysAgo: number;
    summary: string;
  };
}
