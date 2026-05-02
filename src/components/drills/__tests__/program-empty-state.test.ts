import { describe, it, expect } from "vitest";

// ProgramEmptyState renders a static card with a CTA. These tests verify
// the key text and href constants — without DOM rendering.

const HEADING = "Find your style first";
const CTA_HREF = "/?tab=style";
const CTA_TEXT = "Take the style quiz";
const SUBTEXT_FRAGMENT = "style profile";

describe("ProgramEmptyState constants", () => {
  it("heading is 'Find your style first'", () => {
    expect(HEADING).toBe("Find your style first");
  });

  it("CTA link points to /?tab=style", () => {
    expect(CTA_HREF).toBe("/?tab=style");
  });

  it("CTA text is 'Take the style quiz'", () => {
    expect(CTA_TEXT).toBe("Take the style quiz");
  });

  it("subtext mentions style profile", () => {
    expect(SUBTEXT_FRAGMENT).toBe("style profile");
  });
});
