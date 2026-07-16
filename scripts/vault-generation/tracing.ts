// scripts/vault-generation/tracing.ts
// Langfuse tracing for vault-gen LLM calls. No-ops unless LANGFUSE_SECRET_KEY
// and LANGFUSE_PUBLIC_KEY are set (plus optional LANGFUSE_BASEURL), so the
// pipeline runs byte-identically without keys. One trace per script run, one
// generation per callLLM.
import { Langfuse } from "langfuse";
import { basename } from "path";

let client: Langfuse | null | undefined;
let trace: ReturnType<Langfuse["trace"]> | null = null;

function getTrace() {
  if (client === undefined) {
    const enabled =
      process.env.LANGFUSE_SECRET_KEY && process.env.LANGFUSE_PUBLIC_KEY;
    client = enabled ? new Langfuse() : null;
    if (client) {
      trace = client.trace({ name: basename(process.argv[1] ?? "vault-gen") });
    }
  }
  return trace;
}

export async function traceGeneration(g: {
  provider: string;
  model: string;
  system: string;
  user: string;
  startTime: Date;
  output?: string;
  error?: string;
}): Promise<void> {
  try {
    const t = getTrace();
    if (!t || !client) return;
    t.generation({
      name: `callLLM:${g.provider}`,
      model: g.model,
      input: { system: g.system, user: g.user },
      output: g.error ? undefined : g.output,
      startTime: g.startTime,
      endTime: new Date(),
      level: g.error ? "ERROR" : undefined,
      statusMessage: g.error,
    });
    // Awaited so batch scripts can't exit before the event ships; latency is
    // noise next to the multi-second LLM call itself.
    await client.flushAsync();
  } catch {
    // Tracing must never break the pipeline.
  }
}
