import { test, expect } from "@playwright/test";

test.describe("/about — transparency page", () => {
  test("renders all three sections with back link", async ({ page }) => {
    await page.goto("/about");

    await expect(page.getByRole("heading", { name: /about this coach/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /what.s in the vault/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /how retrieval works/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /known limitations/i })).toBeVisible();

    // Explicit mention of women's boxing gap (Alex will look for honesty here).
    await expect(page.getByText(/no women.s boxing/i)).toBeVisible();

    // Back link works.
    await page.getByRole("link", { name: /back to the coach/i }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: /boxing coach ai/i })).toBeVisible();
  });
});
