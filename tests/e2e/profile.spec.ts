import { test, expect } from "@playwright/test";

test.describe("/me — personal profile", () => {
  test("empty state → name persists across reload → initials show in header", async ({ page }) => {
    // Anonymous first-visit: no prior data anywhere.
    await page.goto("/me");

    // Identity card renders with empty inputs.
    await expect(page.getByRole("heading", { name: /your profile/i })).toBeVisible();
    await expect(page.getByPlaceholder(/your name/i)).toBeVisible();

    // Style + coach sections render their empty states.
    await expect(page.getByText(/take the style finder quiz/i)).toBeVisible();
    await expect(page.getByText(/log your first session in my coach/i)).toBeVisible();

    // Type a name and blur to save.
    const nameField = page.getByPlaceholder(/your name/i);
    await nameField.fill("Alex Rivera");
    await nameField.blur();

    // Wait for the Saved indicator to flash.
    await expect(page.getByText(/^Saved$/).first()).toBeVisible();

    // Reload — the value should still be there.
    await page.reload();
    await expect(page.getByPlaceholder(/your name/i)).toHaveValue("Alex Rivera");

    // Back to the main app — header avatar should show initials "AR".
    await page.getByRole("link", { name: /back to the coach/i }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("link", { name: /your profile/i })).toContainText(/AR/);
  });

  test("all editable fields persist across reload", async ({ page }) => {
    await page.goto("/me");

    await page.getByPlaceholder(/you@example\.com/i).fill("alex@example.com");
    await page.getByPlaceholder(/you@example\.com/i).blur();

    await page.getByPlaceholder(/silverback/i).fill("Silverback BC");
    await page.getByPlaceholder(/silverback/i).blur();

    await page.getByPlaceholder(/coach joe/i).fill("Coach Joe");
    await page.getByPlaceholder(/coach joe/i).blur();

    await page.getByPlaceholder(/what are you working toward/i).fill("Amateur debut by summer");
    await page.getByPlaceholder(/what are you working toward/i).blur();

    await page
      .getByPlaceholder(/things about how you box/i)
      .fill("Left hook has been slow the last two weeks.");
    await page.getByPlaceholder(/things about how you box/i).blur();

    await page.waitForTimeout(500); // let the last PATCH settle
    await page.reload();

    await expect(page.getByPlaceholder(/you@example\.com/i)).toHaveValue("alex@example.com");
    await expect(page.getByPlaceholder(/silverback/i)).toHaveValue("Silverback BC");
    await expect(page.getByPlaceholder(/coach joe/i)).toHaveValue("Coach Joe");
    await expect(page.getByPlaceholder(/what are you working toward/i)).toHaveValue(
      "Amateur debut by summer"
    );
    await expect(page.getByPlaceholder(/things about how you box/i)).toHaveValue(
      "Left hook has been slow the last two weeks."
    );
  });

  test("invalid email is rejected with inline error", async ({ page }) => {
    await page.goto("/me");

    const emailField = page.getByPlaceholder(/you@example\.com/i);
    await emailField.fill("not-an-email");
    await emailField.blur();

    // Inline error near the email field.
    await expect(page.getByText(/email must contain @/i)).toBeVisible();
  });

  test("no horizontal scroll on any section", async ({ page }) => {
    await page.goto("/me");

    // Fill every text field with realistic content so sections at their tallest render.
    await page.getByPlaceholder(/your name/i).fill("Alex Rivera");
    await page.getByPlaceholder(/your name/i).blur();
    await page.getByPlaceholder(/silverback/i).fill("Silverback Boxing Club — East Side Branch");
    await page.getByPlaceholder(/silverback/i).blur();

    // Compare document width vs. viewport width. Any positive diff → horizontal overflow.
    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth - document.documentElement.clientWidth;
    });
    expect(overflow, "horizontal overflow in px").toBeLessThanOrEqual(0);
  });
});
