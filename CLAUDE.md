@AGENTS.md

## Critical Rules

### Always cache expensive operations incrementally
Any script that makes multiple expensive API calls (especially Claude Opus, which costs $15/$75 per MTok and takes ~90s per call) MUST save progress incrementally — not just at the end. A 150-call pipeline that crashes at call 140 without incremental caching loses ~€30 and 4 hours of runtime. Save to disk every 5-10 calls. This applies to any batch processing script in `scripts/`.

### Test scripts with cheap models first
Before running a long pipeline with Claude Opus, do a dry run with 2-3 items using Sonnet to verify the script works end-to-end. Catch crashes, JSON parse errors, and timeout issues on a $0.01 test run, not a $30 production run.

### Add retry logic for all API calls in scripts
Every external API call (Claude, Voyage AI, Cohere) in batch scripts must have retry logic with exponential backoff. Free tier rate limits and timeouts WILL happen. The `scripts/vault-generation/pass2-synthesize.ts` timeout crash is the reference incident.
