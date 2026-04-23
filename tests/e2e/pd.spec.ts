import { test, expect } from "@playwright/test";
import { stubChat } from "./helpers/stub-chat";

test.describe("/pd — Alex landing page", () => {
  test("renders personalized intro + seed questions", async ({ page }) => {
    await page.goto("/pd");

    await expect(page.getByRole("heading", { name: /hey alex/i })).toBeVisible();
    await expect(page.getByText(/built on your blueprint/i).first()).toBeVisible();
    await expect(page.getByText(/try a question from your own content/i)).toBeVisible();

    // At least one seed question visible.
    await expect(
      page.getByRole("button", { name: /palm facing me or palm down/i })
    ).toBeVisible();

    // Links to /about.
    await expect(
      page.getByRole("link", { name: /what.s in the vault/i })
    ).toBeVisible();
  });

  test("clicking a seed question launches the coach and fires the query", async ({ page }) => {
    const state = await stubChat(page);
    await page.goto("/pd");

    await page
      .getByRole("button", { name: /palm facing me or palm down/i })
      .click();

    // The user's seed query lands in the chat as a message bubble.
    await expect(
      page.getByText(/palm facing me or palm down/i).nth(0)
    ).toBeVisible({ timeout: 5_000 });

    // And /api/chat was hit — the full SSE→typewriter render is covered by the
    // home-tab spec, so here we just assert the launch path wired up correctly.
    await expect.poll(() => state.calls, { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
  });
});
