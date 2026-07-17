// scripts/merge-duplicate-nodes.ts
// Generalized DB node dedupe + slug alignment (successor to merge-duplicate-concepts.ts).
//
// Two operations, both driven by the tables below:
//   MERGES:  dupe node → canonical node. Edges repointed (id-based) unless an
//            equivalent edge already exists on the canonical (then the dupe edge is
//            deleted). Dupe's aliases + title are folded into canonical's aliases.
//            Dupe node deleted. Canonical CONTENT is kept as-is (dupe bodies are
//            same-source synthesis; re-synth of merged nodes is a separate, paid step).
//   RENAMES: node keeps identity, slug changes to match the app roster
//            (src/data/fighter-profiles.ts is the runtime contract — vault files are
//            read by roster slug). Old slug goes into aliases.
//
// Run: npx tsx scripts/merge-duplicate-nodes.ts --dry-run
//      npx tsx scripts/merge-duplicate-nodes.ts --execute
// After --execute: npx tsx scripts/regenerate-vault-from-db.ts  (re-renders + prunes files)

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Fighter dupes: canonical = the slug in src/data/fighter-profiles.ts (app roster).
const MERGES: Array<{ dupe: string; canonical: string }> = [
  { dupe: "bud-crawford", canonical: "terence-crawford" },
  { dupe: "devon-haney", canonical: "devin-haney" },
  { dupe: "errol-spence", canonical: "errol-spence-jr" },
  { dupe: "floyd-mayweather", canonical: "floyd-mayweather-jr" },
  { dupe: "naseem-hamed", canonical: "prince-naseem-hamed" },
  { dupe: "thomas-hearns", canonical: "tommy-hearns" },
  { dupe: "vasili-lomachenko", canonical: "vasiliy-lomachenko" },
  // Phases: 12 nodes → 5 canonical (content-reviewed 2026-07-17)
  { dupe: "load-phase", canonical: "phase-1-load" },
  { dupe: "phase-1-loading", canonical: "phase-1-load" },
  { dupe: "explode-phase", canonical: "phase-2-explode" },
  { dupe: "phase-2-hip-torque", canonical: "phase-2-explode" },
  { dupe: "accelerate-phase", canonical: "phase-3-acceleration" },
  { dupe: "phase-3-energy-transfer", canonical: "phase-3-acceleration" },
  { dupe: "follow-through-phase", canonical: "phase-4-follow-through" },
  // Concepts (content-reviewed 2026-07-17; canonical = richer/more-linked file)
  { dupe: "centripetal-force", canonical: "centripetal-force-punching" },
  { dupe: "cross-body-kinetic-chains", canonical: "cross-body-chains" },
  { dupe: "fascial-tension", canonical: "fascia-connective-tissue" },
  { dupe: "mind-games", canonical: "frame-control-mind-games" },
  { dupe: "frame-control", canonical: "frame-control-mind-games" },
  { dupe: "hip-rotation-torque", canonical: "hip-rotation" },
  { dupe: "kinetic-chain", canonical: "kinetic-chains" },
  { dupe: "linear-vs-integrated", canonical: "linear-vs-integrated-mechanics" },
  { dupe: "reading-intention", canonical: "reading-attention-intention" },
  { dupe: "shearing-force-at-impact", canonical: "shearing-force" },
  { dupe: "carrying-tension-through-impact", canonical: "tension-at-impact" },
  { dupe: "force-power-equations", canonical: "power-equation" },
  { dupe: "accelerating-arc", canonical: "arc-trajectory" },
  { dupe: "punching-arc-spiral", canonical: "arc-trajectory" },
  { dupe: "kinetic-sequencing", canonical: "kinetic-cascade" },
  { dupe: "range-management", canonical: "distance-management" },
  { dupe: "center-of-gravity", canonical: "lower-center-of-gravity" },
  { dupe: "background-tension", canonical: "tension-relaxation" },
  // Techniques (content-reviewed 2026-07-17): rear-straight cluster is ONE entity
  { dupe: "cross-rear-straight", canonical: "cross" },
  { dupe: "cross-straight-right", canonical: "cross" },
  { dupe: "straight-cross", canonical: "cross" },
  { dupe: "straight-right", canonical: "cross" },
  { dupe: "straight-punch", canonical: "cross" },
  { dupe: "straight-punch-mechanics", canonical: "cross" },
  { dupe: "counter-punching", canonical: "counter-punch" },
  { dupe: "hook-mechanics", canonical: "hook" },
  { dupe: "left-hook", canonical: "hook" },
  { dupe: "jab-mechanics", canonical: "jab" },
  { dupe: "uppercut-mechanics", canonical: "uppercut" },
  { dupe: "overhand", canonical: "overhand-right" },
  // Cross-folder merges (canonical's node_type decides its folder)
  { dupe: "back-foot-pivot", canonical: "pivot-on-back-foot" },
  { dupe: "faints", canonical: "faints-setups" }, // then renamed to feints-setups below
  // Injury prevention
  { dupe: "rotator-cuff-stability", canonical: "shoulder-stability" },
  { dupe: "rotator-cuff-strengthening", canonical: "shoulder-stability" },
  { dupe: "hip-flexibility-stability", canonical: "hip-mobility" },
  { dupe: "hip-hinge-mechanics", canonical: "hip-hinge" },
];

const RENAMES: Array<{ from: string; to: string }> = [
  { from: "cyril-gane", to: "ciryl-gane" }, // roster spelling (correct: Ciryl Gane)
  { from: "sugar-ray-leonard", to: "ray-leonard" }, // roster slug; "Sugar Ray Leonard" stays as title/alias
  // "faints" is a transcript-propagated misspelling of "feints"; runs after the
  // faints -> faints-setups merge above (MERGES execute before RENAMES).
  { from: "faints-setups", to: "feints-setups" },
];

const EXECUTE = process.argv.includes("--execute");

interface EdgeRow {
  id: string;
  source_node: string;
  target_node: string | null;
  target_chunk: string | null;
  edge_type: string;
}

async function loadEdgesForNode(nodeId: string): Promise<EdgeRow[]> {
  const all: EdgeRow[] = [];
  for (const field of ["source_node", "target_node"] as const) {
    let from = 0;
    while (true) {
      const { data, error } = await sb
        .from("knowledge_edges")
        .select("id, source_node, target_node, target_chunk, edge_type")
        .eq(field, nodeId)
        .range(from, from + 999);
      if (error) throw error;
      if (!data || data.length === 0) break;
      all.push(...(data as EdgeRow[]));
      if (data.length < 1000) break;
      from += 1000;
    }
  }
  const seen = new Set<string>();
  return all.filter(e => (seen.has(e.id) ? false : (seen.add(e.id), true)));
}

async function getNode(slug: string) {
  const { data, error } = await sb
    .from("knowledge_nodes")
    .select("id, slug, title, node_type, aliases")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data;
}

const edgeKey = (e: EdgeRow, remap: (id: string) => string) =>
  [remap(e.source_node), e.target_node ? remap(e.target_node) : "", e.target_chunk ?? "", e.edge_type].join("|");

async function main() {
  console.log(EXECUTE ? "=== EXECUTE ===" : "=== DRY RUN ===");

  for (const { dupe, canonical } of MERGES) {
    const d = await getNode(dupe);
    const c = await getNode(canonical);
    if (!d) { console.log(`skip merge ${dupe}→${canonical}: dupe not in DB`); continue; }
    if (!c) { console.log(`skip merge ${dupe}→${canonical}: CANONICAL MISSING`); continue; }

    const dupeEdges = await loadEdgesForNode(d.id);
    const canonEdges = await loadEdgesForNode(c.id);
    const remap = (id: string) => (id === d.id ? c.id : id);
    const canonKeys = new Set(canonEdges.map(e => edgeKey(e, id => id)));

    let repointed = 0, dropped = 0;
    for (const e of dupeEdges) {
      const wouldBe = edgeKey(e, remap);
      const selfLoop = remap(e.source_node) === remap(e.target_node ?? "");
      if (canonKeys.has(wouldBe) || selfLoop) {
        dropped++;
        if (EXECUTE) {
          const { error } = await sb.from("knowledge_edges").delete().eq("id", e.id);
          if (error) throw error;
        }
      } else {
        repointed++;
        canonKeys.add(wouldBe);
        if (EXECUTE) {
          const patch: Record<string, string> = {};
          if (e.source_node === d.id) patch.source_node = c.id;
          if (e.target_node === d.id) patch.target_node = c.id;
          const { error } = await sb.from("knowledge_edges").update(patch).eq("id", e.id);
          if (error) throw error;
        }
      }
    }

    const mergedAliases = [...new Set([...(c.aliases ?? []), ...(d.aliases ?? []), d.title, d.slug])]
      .filter(a => a && a !== c.title);
    console.log(`merge ${dupe} → ${canonical}: ${repointed} edges repointed, ${dropped} dup/self edges dropped, aliases → [${mergedAliases.join(", ")}]`);
    if (EXECUTE) {
      let { error } = await sb.from("knowledge_nodes").update({ aliases: mergedAliases }).eq("id", c.id);
      if (error) throw error;
      ({ error } = await sb.from("knowledge_nodes").delete().eq("id", d.id));
      if (error) throw error;
    }
  }

  for (const { from, to } of RENAMES) {
    const n = await getNode(from);
    if (!n) { console.log(`skip rename ${from}→${to}: not in DB`); continue; }
    const clash = await getNode(to);
    if (clash) { console.log(`skip rename ${from}→${to}: target slug already exists — needs a MERGE instead`); continue; }
    const aliases = [...new Set([...(n.aliases ?? []), from])];
    console.log(`rename ${from} → ${to} (aliases → [${aliases.join(", ")}])`);
    if (EXECUTE) {
      const { error } = await sb.from("knowledge_nodes").update({ slug: to, aliases }).eq("id", n.id);
      if (error) throw error;
    }
  }

  // Remap stored user references (focus_areas.knowledge_node_slug is a text tag,
  // deduped by a unique index — update row-by-row, skip on conflict).
  const slugRemaps = [
    ...MERGES.map(m => ({ from: m.dupe, to: m.canonical })),
    ...RENAMES,
  ];
  for (const { from, to } of slugRemaps) {
    const { data, error } = await sb.from("focus_areas").select("id").eq("knowledge_node_slug", from);
    if (error) throw error;
    if (!data?.length) continue;
    console.log(`focus_areas: ${data.length} row(s) reference ${from} → remap to ${to}`);
    if (EXECUTE) {
      for (const row of data) {
        const { error: uErr } = await sb.from("focus_areas")
          .update({ knowledge_node_slug: to }).eq("id", row.id);
        if (uErr) console.log(`  skipped row ${row.id} (likely dedup conflict): ${uErr.message}`);
      }
    }
  }

  console.log(EXECUTE ? "\nDone. Now run: npx tsx scripts/regenerate-vault-from-db.ts" : "\nDry run only — nothing written.");
}

main().catch(e => { console.error(e); process.exit(1); });
