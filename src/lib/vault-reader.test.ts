import { describe, it, expect } from "vitest";
import { readFighterVaultEntry, readDrillVaultEntry, listDrillSlugs, readAllDrillVaultEntries } from "./vault-reader";

describe("readFighterVaultEntry", () => {
  it("returns the content for a known fighter slug", async () => {
    const content = await readFighterVaultEntry("mike-tyson");
    expect(content).not.toBeNull();
    expect(content!.length).toBeGreaterThan(100);
  });

  it("returns null for an unknown slug", async () => {
    const content = await readFighterVaultEntry("not-a-real-fighter-xyzzy");
    expect(content).toBeNull();
  });

  it("rejects path-traversal attempts in the slug", async () => {
    const content = await readFighterVaultEntry("../../etc/passwd");
    expect(content).toBeNull();
  });

  it("rejects slugs with suspicious characters", async () => {
    const content = await readFighterVaultEntry("mike/../tyson");
    expect(content).toBeNull();
  });
});

describe("readDrillVaultEntry", () => {
  it("returns content for a known drill slug", async () => {
    const content = await readDrillVaultEntry("barbell-punch");
    expect(content).not.toBeNull();
    expect(content!.length).toBeGreaterThan(100);
  });

  it("returns null for an unknown slug", async () => {
    const content = await readDrillVaultEntry("does-not-exist");
    expect(content).toBeNull();
  });

  it("rejects path-traversal attempts in the slug", async () => {
    const content = await readDrillVaultEntry("../../etc/passwd");
    expect(content).toBeNull();
  });

  it("rejects slugs with uppercase characters", async () => {
    const content = await readDrillVaultEntry("BAD-CASE");
    expect(content).toBeNull();
  });
});

describe("listDrillSlugs", () => {
  it("returns at least 14 entries, sorted, all lowercase, matching slug pattern", async () => {
    const slugs = await listDrillSlugs();
    expect(slugs.length).toBeGreaterThanOrEqual(14);
    expect(slugs).toEqual([...slugs].sort());
    const slugRe = /^[a-z0-9-]+$/;
    for (const slug of slugs) {
      expect(slug).toMatch(slugRe);
    }
    expect(slugs).toContain("barbell-punch");
    expect(slugs).toContain("hip-rotation-drill");
  });
});

describe("readAllDrillVaultEntries", () => {
  it("returns same count as listDrillSlugs with non-empty content for each", async () => {
    const [slugs, entries] = await Promise.all([listDrillSlugs(), readAllDrillVaultEntries()]);
    expect(entries.length).toBe(slugs.length);
    for (const entry of entries) {
      expect(entry).toHaveProperty("slug");
      expect(entry).toHaveProperty("content");
      expect(entry.content.length).toBeGreaterThan(50);
    }
  });
});
