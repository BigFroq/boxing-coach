// scripts/vault-generation/llm-provider.ts
// Pluggable LLM provider for vault-gen passes.
// SDK = metered Anthropic API (default). CLI = `claude -p` subprocess, free on Max sub.
// Switch via SYNTHESIS_PROVIDER=cli env var.
import Anthropic from "@anthropic-ai/sdk";
import { spawn } from "child_process";

export interface LLMRequest {
  system: string;
  user: string;
  model: string;
  maxTokens?: number;
}

let _anthropic: Anthropic | null = null;
function getAnthropic() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

async function callSDK(req: LLMRequest): Promise<string> {
  const response = await getAnthropic().messages.create({
    model: req.model,
    max_tokens: req.maxTokens ?? 4096,
    system: req.system,
    messages: [{ role: "user", content: req.user }],
  });
  return response.content[0].type === "text" ? response.content[0].text : "";
}

async function callCLI(req: LLMRequest): Promise<string> {
  // claude -p uses the user's logged-in Max subscription auth. ANTHROPIC_API_KEY
  // is set in the script env for SDK fallback; unset it for the subprocess so
  // the CLI uses subscription auth instead of metered API.
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;

  return new Promise((resolve, reject) => {
    const proc = spawn(
      "claude",
      [
        "-p",
        req.user,
        "--system-prompt",
        req.system,
        "--model",
        req.model,
        "--output-format",
        "json",
        "--allowedTools",
        "", // no tools needed for pure synthesis
      ],
      { env, stdio: ["ignore", "pipe", "pipe"] }
    );

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d));
    proc.stderr.on("data", (d) => (stderr += d));

    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`claude CLI exit ${code}: ${stderr.slice(0, 500)}`));
      }
      try {
        const parsed = JSON.parse(stdout);
        if (parsed.is_error) {
          return reject(new Error(`claude CLI api error: ${parsed.api_error_status ?? "unknown"}`));
        }
        resolve(parsed.result ?? "");
      } catch (err) {
        reject(new Error(`claude CLI output not JSON: ${(err as Error).message}\n${stdout.slice(0, 300)}`));
      }
    });
  });
}

export async function callLLM(req: LLMRequest): Promise<string> {
  const provider = process.env.SYNTHESIS_PROVIDER ?? "sdk";
  if (provider === "cli") return callCLI(req);
  return callSDK(req);
}
