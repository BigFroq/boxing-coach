import { test, expect } from "@playwright/test";
import { allQuestions } from "@/data/questions";

// ─── Fixture helpers ────────────────────────────────────────────────────

function buildCompleteAnswers(): Record<string, string | string[] | number> {
  const answers: Record<string, string | string[] | number> = {};
  for (const q of allQuestions) {
    if (q.format === "multiselect") {
      answers[q.id] = [q.options[0].value];
    } else if (q.format === "slider") {
      answers[q.id] = 50;
    } else {
      answers[q.id] = q.options[0].value;
    }
  }
  return answers;
}

function buildSeedBlob({
  narrativeStale = false,
  omitAnswerId = null,
}: {
  narrativeStale?: boolean;
  omitAnswerId?: string | null;
} = {}) {
  const answers = buildCompleteAnswers();
  if (omitAnswerId) delete answers[omitAnswerId];
  return {
    result: {
      style_name: "Test Style",
      description: "Test description.",
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
      fighter_explanations: [
        { name: "Mike Tyson", explanation: "Aggressive pressure with kinetic chain power." },
      ],
      matched_fighters: [
        { name: "Mike Tyson", slug: "mike-tyson", overlappingDimensions: ["powerMechanics"] },
      ],
      counter_fighters: [],
      strengths: ["a", "b", "c", "d"],
      growth_areas: [{ dimension: "Defensive Integration", advice: "Slip more." }],
      punches_to_master: ["jab", "cross"],
      stance_recommendation: "Stay orthodox.",
      training_priorities: ["a", "b", "c", "d"],
      punch_doctor_insight: "Insight.",
    },
    physicalContext: { height: "average", build: "lean", reach: "average", stance: "orthodox" },
    experienceLevel: "beginner",
    answers,
    narrativeStale,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────

test.describe("Style dashboard", () => {
  test("profile loaded → dashboard renders, no banners", async ({ page }) => {
    await page.goto("/");
    await page.evaluate((blob) => {
      localStorage.setItem("boxing-coach-style-profile", JSON.stringify(blob));
    }, buildSeedBlob());
    await page.goto("/?tab=style");

    // Dashboard renders — the "Your fighting style" label above the h2 is a <p>, assert it
    await expect(
      page.getByText(/your fighting style/i)
    ).toBeVisible({ timeout: 10_000 });

    // No refinement banner
    await expect(page.getByText(/new question.* available/i)).toHaveCount(0);

    // No narrative-stale CTA
    await expect(page.getByText(/your analysis is out of date/i)).toHaveCount(0);
  });

  test("missing question → banner → refine modal → narrative-stale CTA", async ({ page }) => {
    await page.goto("/");
    await page.evaluate((blob) => {
      localStorage.setItem("boxing-coach-style-profile", JSON.stringify(blob));
    }, buildSeedBlob({ omitAnswerId: "power_feel" }));
    await page.goto("/?tab=style");

    // Refinement banner shows "1 new question available"
    await expect(
      page.getByText(/1 new question available/i)
    ).toBeVisible({ timeout: 10_000 });

    // Click the "Refine" button on the banner
    await page.getByRole("button", { name: /^refine$/i }).click();

    // Modal opens
    const modal = page.getByRole("dialog", { name: /refine your profile/i });
    await expect(modal).toBeVisible();

    // Click the first option of "power_feel" (scoring question)
    // "power_feel" options: whip, drive, timing, developing
    await modal.getByRole("button", { name: /like a whip cracking/i }).click();

    // Since this is the only question, the Refine submit button should be enabled
    // after selecting an option — click it to submit
    await modal.getByRole("button", { name: /^refine$/i }).click();

    // Modal closes and narrative-stale banner appears (scores changed because power_feel is a scoring question)
    await expect(
      page.getByText(/your analysis is out of date/i)
    ).toBeVisible({ timeout: 5_000 });
  });

  test("radar dimension click → drawer opens", async ({ page }) => {
    await page.goto("/");
    await page.evaluate((blob) => {
      localStorage.setItem("boxing-coach-style-profile", JSON.stringify(blob));
    }, buildSeedBlob());
    await page.goto("/?tab=style");

    // Wait for dashboard — the "Your fighting style" label (<p>) confirms we're on the dashboard
    await expect(
      page.getByText(/your fighting style/i)
    ).toBeVisible({ timeout: 10_000 });

    // Click the "Power" axis button in the SVG radar chart
    // The <g role="button"> wraps the SVG text labels
    await page.getByRole("button", { name: "Power" }).first().click();

    // Drawer opens with aria-label "Power Mechanics details"
    const drawer = page.getByRole("dialog", { name: /power mechanics details/i });
    await expect(drawer).toBeVisible({ timeout: 5_000 });

    // Drawer has expected content sections
    await expect(drawer.getByText(/what this is/i)).toBeVisible();
    await expect(drawer.getByText(/what your score means/i)).toBeVisible();
    await expect(drawer.getByText(/drills to develop this/i)).toBeVisible();
  });

  test("narrative-stale → Refresh my analysis succeeds (with stub)", async ({ page }) => {
    // Stub /api/style-finder before navigating
    await page.route("**/api/style-finder", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            style_name: "Refreshed Style",
            description: "New description.",
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
            fighter_explanations: [
              { name: "Mike Tyson", explanation: "Refreshed analysis." },
            ],
            strengths: ["a", "b", "c", "d"],
            growth_areas: [{ dimension: "Defensive Integration", advice: "Slip more." }],
            punches_to_master: ["jab"],
            stance_recommendation: "Stay orthodox.",
            training_priorities: ["a", "b", "c", "d"],
            punch_doctor_insight: "Insight.",
            counter_fighters: [],
            citations: [],
          }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto("/");
    await page.evaluate((blob) => {
      localStorage.setItem("boxing-coach-style-profile", JSON.stringify(blob));
    }, buildSeedBlob({ narrativeStale: true }));
    await page.goto("/?tab=style");

    // Narrative-stale banner is visible
    await expect(
      page.getByText(/your analysis is out of date/i)
    ).toBeVisible({ timeout: 10_000 });

    // Click "Refresh my analysis"
    await page.getByRole("button", { name: /refresh my analysis/i }).click();

    // Stale banner disappears (regen succeeded)
    await expect(
      page.getByText(/your analysis is out of date/i)
    ).toHaveCount(0, { timeout: 10_000 });

    // Dashboard is back — the "Your fighting style" label (<p>) confirms dashboard rendered
    await expect(
      page.getByText(/your fighting style/i)
    ).toBeVisible({ timeout: 10_000 });
  });
});
