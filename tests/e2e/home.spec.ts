import { test, expect } from "@playwright/test";
import { stubChat } from "./helpers/stub-chat";

test.describe("Home (cold anon user)", () => {
  test("lands on technique tab with hero + suggestion chips", async ({ page, isMobile }) => {
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

    // The desktop rail supplies training context; mobile prioritizes the prompt cards.
    if (isMobile) {
      await expect(page.getByText(/the mechanics room/i)).toBeVisible();
    } else {
      await expect(page.getByText(/camp board/i)).toBeVisible();
    }
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

  test("keeps every primary tab visible in the mobile viewport", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Mobile-only navigation layout regression");
    await stubChat(page);
    await page.goto("/");

    const gamesTab = page.getByRole("button", { name: "Games", exact: true });
    const box = await gamesTab.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  });

  test("tab switching renders each tab without crashing", async ({ page }) => {
    await stubChat(page);
    await page.goto("/");

    await page.getByRole("button", { name: /drills/i }).first().click();
    await expect(page.getByRole("heading", { name: /find your style first/i })).toBeVisible();

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
