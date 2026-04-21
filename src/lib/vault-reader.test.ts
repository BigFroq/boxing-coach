import { describe, it, expect } from "vitest";
import { readFighterVaultEntry } from "./vault-reader";

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
