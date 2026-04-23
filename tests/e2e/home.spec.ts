import { test, expect } from "@playwright/test";
import { stubChat } from "./helpers/stub-chat";

test.describe("Home (cold anon user)", () => {
  test("lands on technique tab with hero + suggestion chips", async ({ page }) => {
    await stubChat(page);
    await page.goto("/");

    // Header + About link — these are the first things Alex will see.
    await expect(page.getByRole("heading", { name: /boxing coach ai/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /about.*limitations/i })).toBeVisible();

    // Four tabs visible.
    for (const tab of ["Technique", "Drills", "Coach", "Style"]) {
      await expect(page.getByRole("button", { name: new RegExp(tab, "i") }).first()).toBeVisible();
    }

    // Technique hero rendered.
    await expect(
      page.getByRole("heading", { name: /what technique are you curious about/i })
    ).toBeVisible();

    // At least one suggestion chip is clickable (viewport-dependent text fallback).
    await expect(page.getByText(/canelo.*kinetic chains/i).first()).toBeVisible();
  });

  test("clicking a suggestion chip submits a chat and streams a reply", async ({ page }) => {
    const state = await stubChat(page);
    await page.goto("/");

    await page.getByText(/canelo.*kinetic chains/i).first().click();

    // The stubbed response should appear.
    await expect(
      page.getByText(/stubbed coach reply for E2E testing/i)
    ).toBeVisible({ timeout: 10_000 });

    // Chat endpoint was called.
    expect(state.calls).toBeGreaterThanOrEqual(1);

    // Feedback widget appears once streaming completes.
    await expect(page.getByRole("button", { name: /helpful/i }).first()).toBeVisible();
  });

  test("tab switching renders each tab without crashing", async ({ page }) => {
    await stubChat(page);
    await page.goto("/");

    await page.getByRole("button", { name: /drills/i }).first().click();
    await expect(page.getByRole("heading", { name: /looking for a drill/i })).toBeVisible();

    await page.getByRole("button", { name: /coach/i }).first().click();
    // Coach tab mounts something — just make sure no error boundary tripped.
    await expect(page.getByText(/hit a snag/i)).toHaveCount(0);

    await page.getByRole("button", { name: /style/i }).first().click();
    await expect(page.getByText(/hit a snag/i)).toHaveCount(0);

    await page.getByRole("button", { name: /technique/i }).first().click();
    await expect(
      page.getByRole("heading", { name: /what technique are you curious about/i })
    ).toBeVisible();
  });
});
