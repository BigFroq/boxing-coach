import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();

vi.mock("@/lib/supabase", () => ({
  createServerClient: () => ({ from: mockFrom }),
}));

async function callGet(userId: string) {
  const { GET } = await import("./route");
  const url = `http://test/api/coach/progress?userId=${userId}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return GET({ nextUrl: new URL(url) } as any);
}

// Helper: make a chainable mock for one .from(...) call.
function chain(resolveValue: unknown) {
  const p = Promise.resolve(resolveValue);
  const obj: Record<string, unknown> = {
    select: () => obj,
    eq: () => obj,
    order: () => obj,
    limit: () => obj,
    then: (fn: (v: unknown) => unknown) => p.then(fn),
  };
  return obj;
}

describe("GET /api/coach/progress — extended response", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns neglectedFocusAreas, drillPrescriptions, and focusAreaLastWorked", async () => {
    // training_sessions (limit 20)
    const sessions = [
      { id: "s1", session_type: "bag_work", rounds: 3, summary: { focus_areas_worked_keys: ["powerMechanics::hip-rotation"] }, created_at: "2026-04-20T12:00:00Z" },
      { id: "s2", session_type: "bag_work", rounds: 3, summary: { focus_areas_worked_keys: ["defensiveIntegration::"] }, created_at: "2026-04-18T12:00:00Z" },
      { id: "s3", session_type: "drills", rounds: 4, summary: { focus_areas_worked_keys: ["powerMechanics::hip-rotation"] }, created_at: "2026-04-10T12:00:00Z" },
    ];
    // focus_areas
    const focusAreas = [
      { id: "fa1", name: "Hip rotation", description: null, status: "active", history: [], dimension: "powerMechanics", knowledge_node_slug: "hip-rotation", created_at: "x", updated_at: "x" },
      { id: "fa2", name: "Defensive Integration", description: null, status: "active", history: [], dimension: "defensiveIntegration", knowledge_node_slug: null, created_at: "x", updated_at: "x" },
      { id: "fa3", name: "Ring IQ", description: null, status: "active", history: [], dimension: "ringIQ", knowledge_node_slug: null, created_at: "x", updated_at: "x" },
    ];
    // drill_prescriptions (pending + followed_up)
    const drills = [
      { id: "d1", drill_name: "Hip Rotation Drill", details: null, followed_up: false, followed_up_at: null, followed_up_session_id: null, created_at: "2026-04-19T12:00:00Z" },
      { id: "d2", drill_name: "Cross Body Chains", details: null, followed_up: true, followed_up_at: "2026-04-18T12:00:00Z", followed_up_session_id: "s2", created_at: "2026-04-10T12:00:00Z" },
      { id: "d3", drill_name: "Old Done Drill", details: null, followed_up: true, followed_up_at: "2026-04-05T12:00:00Z", followed_up_session_id: "sold", created_at: "2026-04-01T12:00:00Z" },
    ];
    // stats (count query, head: true)
    const statsCount = { data: null, count: 3 };

    // Four .from(...) calls in order: training_sessions (limit 20), focus_areas, training_sessions (count head), drill_prescriptions.
    mockFrom
      .mockReturnValueOnce(chain({ data: sessions, error: null }))
      .mockReturnValueOnce(chain({ data: focusAreas, error: null }))
      .mockReturnValueOnce(chain(statsCount))
      .mockReturnValueOnce(chain({ data: drills, error: null }));

    const res = await callGet("u1");
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.stats.totalSessions).toBe(3);
    expect(body.stats.activeFocusAreas).toBe(3);
    expect(body.focusAreas).toHaveLength(3);
    expect(body.recentSessions).toHaveLength(3);

    // neglected: fa3 (ringIQ) never worked in last 3 sessions
    expect(body.neglectedFocusAreas).toContain("Ring IQ");
    expect(body.neglectedFocusAreas).not.toContain("Hip rotation");
    expect(body.neglectedFocusAreas).not.toContain("Defensive Integration");

    // drillPrescriptions
    expect(body.drillPrescriptions.pending.map((d: { id: string }) => d.id)).toEqual(["d1"]);
    expect(body.drillPrescriptions.recent.map((d: { id: string }) => d.id)).toEqual(["d2", "d3"]);

    // focusAreaLastWorked
    expect(body.focusAreaLastWorked.fa1).toBe("2026-04-20T12:00:00Z");
    expect(body.focusAreaLastWorked.fa2).toBe("2026-04-18T12:00:00Z");
    expect(body.focusAreaLastWorked.fa3).toBeNull();
  });

  it("handles a user with no data — returns empty arrays + empty map", async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: [], error: null }))
      .mockReturnValueOnce(chain({ data: [], error: null }))
      .mockReturnValueOnce(chain({ data: null, count: 0 }))
      .mockReturnValueOnce(chain({ data: [], error: null }));

    const res = await callGet("u2");
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.stats.totalSessions).toBe(0);
    expect(body.neglectedFocusAreas).toEqual([]);
    expect(body.drillPrescriptions.pending).toEqual([]);
    expect(body.drillPrescriptions.recent).toEqual([]);
    expect(body.focusAreaLastWorked).toEqual({});
  });
});
