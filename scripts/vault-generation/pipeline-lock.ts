// scripts/vault-generation/pipeline-lock.ts
// Cross-session mutex for the vault pipeline. resynth-dirty, incremental-ingest
// and generate-vault share mutable state (dirty-slugs.json, pass2-synthesized.json,
// knowledge_nodes/edges) — two sessions running concurrently on 2026-07-18 caused
// FK violations, clobbered dirty queues, and a duplicate resynth.
//
// O_EXCL lockfile with pid; stale locks (dead pid) are taken over.

import { promises as fs } from "fs";
import path from "path";

const LOCK_FILE = path.join(process.cwd(), "scripts", "vault-generation", ".cache", "pipeline.lock");

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function acquirePipelineLock(label: string): Promise<void> {
  await fs.mkdir(path.dirname(LOCK_FILE), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await fs.writeFile(LOCK_FILE, JSON.stringify({ pid: process.pid, label, at: new Date().toISOString() }), { flag: "wx" });
      break; // acquired
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      let holder: { pid: number; label?: string; at?: string } | null = null;
      try {
        holder = JSON.parse(await fs.readFile(LOCK_FILE, "utf-8"));
      } catch { /* unreadable → treat as stale */ }
      if (holder && pidAlive(holder.pid)) {
        console.error(
          `Pipeline lock held by pid ${holder.pid} (${holder.label ?? "?"}, since ${holder.at ?? "?"}).\n` +
          `Another session is running the vault pipeline — wait for it or kill that process.\n` +
          `Lock file: ${LOCK_FILE}`
        );
        process.exit(1);
      }
      await fs.rm(LOCK_FILE, { force: true }); // stale — take over
    }
  }
  const release = () => {
    try {
      // Sync best-effort removal on exit paths
      require("fs").rmSync(LOCK_FILE, { force: true });
    } catch { /* already gone */ }
  };
  process.on("exit", release);
  process.on("SIGINT", () => { release(); process.exit(130); });
  process.on("SIGTERM", () => { release(); process.exit(143); });
}
