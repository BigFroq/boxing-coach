// scripts/add-missing-common-mistakes.ts
// Adds `## Common Mistakes` sections to the 3 fighter nodes missing them:
//   - floyd-mayweather-jr   — positive exemplar, no documented flaws; note points to counter-cases
//   - terence-crawford      — same
//   - ilia-topuria          — real content: heel-lift on hooks + pre-fight frame cracks
//
// The section is inserted before `## Connections` in node.content (DB) so regenerate-vault-from-db
// picks it up on next render. Running this twice is idempotent — the insertion checks first.
//
// Run: npx tsx scripts/add-missing-common-mistakes.ts --dry-run
//      npx tsx scripts/add-missing-common-mistakes.ts --execute

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const CONTENT_BY_SLUG: Record<string, string> = {
  "floyd-mayweather-jr": `## Common Mistakes
Floyd is used as a positive exemplar throughout Alex's content — the bounce step, the pull counter, neutral weight balance, edge-of-the-bubble distance management, and resting muscle tension are all taught through his footage. No notable mechanical flaws are documented. For the counter-cases, see [[Devin Haney]] (push mechanics), [[Canelo Alvarez]] (positional readiness failures), and [[Oscar De La Hoya]] (ring IQ collapse under psychological pressure).`,

  "terence-crawford": `## Common Mistakes
Crawford is Alex's premier positive exemplar for positional readiness, ring IQ, and the pull counter. His mechanics are analyzed as consistently elite — seven-frame jab to impact, seamless defense-to-offense linking, disciplined distance management. No notable mechanical flaws are documented. For the counter-case within the same fight, see [[Canelo Alvarez]]: the Canelo-vs-Crawford breakdown is Alex's most detailed case study of what Crawford does right *by* showing what Canelo does wrong.`,

  "ilia-topuria": `## Common Mistakes
- **Lifting the heel during hooks** — Alex explicitly flags this mechanical deviation in Topuria's technique. It compromises the flat-footed push-off that generates cleaner hip rotation, though Topuria still manages effectiveness through other attributes.
- **Pre-fight frame leakage** — Alex reads Topuria's pre-fight body language against Charles Oliveira as betraying pressure: "he's smirking like a kid who got caught red-handed," "the embarrassed smile is acting almost as a release valve." These are subtle but real indicators that the dominant frame wasn't fully his going in.
- **Closing the hip on the lead hook instead of opening it** — Alex notes Topuria "is closing his hip to power that lead hook instead of opening it, which allows for a better position of follow-up. These things might seem minor, however that's the difference between someone who's great and someone who's all time."`,
};

async function main() {
  const argv = process.argv.slice(2);
  const execute = argv.includes("--execute");
  console.log(`mode: ${execute ? "EXECUTE" : "DRY RUN"}`);

  for (const [slug, newSection] of Object.entries(CONTENT_BY_SLUG)) {
    console.log(`\n=== ${slug} ===`);
    const { data: node, error } = await sb
      .from("knowledge_nodes")
      .select("id, content")
      .eq("slug", slug)
      .single();
    if (error || !node) { console.log(`  ! not found`); continue; }

    if (node.content.includes("## Common Mistakes")) {
      console.log(`  already has section — skipping`);
      continue;
    }

    // Insert the new section before "## Connections" so it renders in the conventional order.
    const connectionsIdx = node.content.indexOf("## Connections");
    let newContent: string;
    if (connectionsIdx !== -1) {
      newContent =
        node.content.slice(0, connectionsIdx) +
        newSection + "\n\n" +
        node.content.slice(connectionsIdx);
    } else {
      // Fall back to appending at the end (no Connections section yet)
      newContent = node.content.trimEnd() + "\n\n" + newSection + "\n";
    }

    console.log(`  content: ${node.content.length} → ${newContent.length} chars (+${newContent.length - node.content.length})`);

    if (!execute) {
      console.log(`  [DRY RUN] preview of inserted section (first 200 chars):`);
      console.log(`    ${newSection.slice(0, 200).replace(/\n/g, "\\n")}`);
      continue;
    }

    const { error: updErr } = await sb
      .from("knowledge_nodes")
      .update({ content: newContent })
      .eq("id", node.id);
    if (updErr) console.error(`  update error: ${updErr.message}`);
    else console.log(`  updated`);
  }

  console.log(`\nNext: npx tsx scripts/regenerate-vault-from-db.ts`);
}

main().catch(e => { console.error(e); process.exit(1); });
