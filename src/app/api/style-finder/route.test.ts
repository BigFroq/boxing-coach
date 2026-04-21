import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mockCreate };
  },
}));

vi.mock("@/lib/graph-rag", () => ({
  retrieveContext: vi.fn().mockResolvedValue({ chunks: [], citations: [] }),
  formatChunksForPrompt: vi.fn().mockReturnValue(""),
}));

vi.mock("@/lib/vault-reader", () => ({
  readFighterVaultEntry: vi.fn().mockResolvedValue("# Mock vault entry"),
}));

async function callPost(body: unknown) {
  const { POST } = await import("./route");
  const req = new Request("http://test/api/style-finder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return POST(req as any);
}

describe("style-finder POST with counters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns counter_fighters in the response, with unknown drill slugs dropped", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            style_name: "Test",
            description: "x",
            fighter_explanations: [{ name: "Mike Tyson", explanation: "y" }],
            strengths: ["a", "b", "c", "d"],
            growth_areas: [{ dimension: "Defensive Integration", advice: "z" }],
            punches_to_master: ["jab"],
            stance_recommendation: "orthodox",
            training_priorities: ["a", "b", "c", "d"],
            punch_doctor_insight: "insight",
            counter_explanations: [
              {
                name: "Mike Tyson",
                slug: "mike-tyson",
                attack_vector: "Power Puncher",
                paragraph: "Tyson exploits your low defence.",
                exploited_dimensions: [
                  {
                    dimension: "defensiveIntegration",
                    user_score: 25,
                    fighter_score: 60,
                    gap: 35,
                  },
                ],
                one_shot_notes: null,
                recommended_drills: [
                  {
                    slug: "hip-rotation-drill",
                    name: "Hip Rotation Drill",
                    why: "builds defence",
                  },
                  { slug: "not-a-real-drill", name: "Fake", why: "should be dropped" },
                ],
                citations: [
                  {
                    title: "vault/fighters/mike-tyson.md",
                    url_or_path: "vault/fighters/mike-tyson.md",
                  },
                ],
              },
            ],
          }),
        },
      ],
    });

    const res = await callPost({
      dimension_scores: {
        powerMechanics: 40,
        positionalReadiness: 35,
        rangeControl: 50,
        defensiveIntegration: 25,
        ringIQ: 50,
        outputPressure: 50,
        deceptionSetup: 50,
        killerInstinct: 50,
      },
      physical_context: { height: "5'10", build: "medium", reach: "72", stance: "orthodox" },
      matched_fighters: [
        {
          name: "Terence Crawford",
          slug: "terence-crawford",
          overlappingDimensions: ["deceptionSetup"],
        },
      ],
      experience_level: "intermediate",
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.counter_fighters)).toBe(true);
    expect(body.counter_fighters.length).toBeGreaterThanOrEqual(1);
    const drills = body.counter_fighters[0].recommended_drills;
    const slugs = drills.map((d: { slug: string }) => d.slug);
    expect(slugs).toContain("hip-rotation-drill");
    expect(slugs).not.toContain("not-a-real-drill");
  });

  it("returns counter_fighters: [] when user is balanced (gate fails)", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            style_name: "Test",
            description: "x",
            fighter_explanations: [{ name: "a", explanation: "y" }],
            strengths: ["a", "b", "c", "d"],
            growth_areas: [{ dimension: "x", advice: "z" }],
            punches_to_master: ["jab"],
            stance_recommendation: "orthodox",
            training_priorities: ["a", "b", "c", "d"],
            punch_doctor_insight: "insight",
            // counter_explanations intentionally omitted
          }),
        },
      ],
    });

    const res = await callPost({
      dimension_scores: {
        powerMechanics: 60,
        positionalReadiness: 60,
        rangeControl: 60,
        defensiveIntegration: 60,
        ringIQ: 60,
        outputPressure: 60,
        deceptionSetup: 60,
        killerInstinct: 60,
      },
      physical_context: { height: "5'10", build: "medium", reach: "72", stance: "orthodox" },
      matched_fighters: [
        { name: "a", slug: "alex-pereira", overlappingDimensions: [] },
      ],
      experience_level: "intermediate",
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.counter_fighters)).toBe(true);
    expect(body.counter_fighters.length).toBe(0);
  });
});
