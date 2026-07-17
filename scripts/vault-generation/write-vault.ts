// scripts/vault-generation/write-vault.ts
// Write Obsidian-compatible vault files from synthesized nodes and edges
import { promises as fs } from "fs";
import path from "path";
import type { SynthesizedNode } from "./pass2-synthesize";
import type { DiscoveredEdge } from "./pass3-edges";

const VAULT_DIR = path.join(process.cwd(), "vault");

const TYPE_FOLDERS: Record<string, string> = {
  concept: "concepts",
  fighter: "fighters",
  technique: "techniques",
  phase: "phases",
  drill: "drills",
  injury_prevention: "injury-prevention",
};

function buildConnectionsSection(
  node: SynthesizedNode,
  edges: DiscoveredEdge[],
  nodesBySlug: Map<string, SynthesizedNode>
): string {
  const relevant = edges.filter(
    e => (e.source_slug === node.slug || e.target_slug === node.slug) && e.edge_type !== "SOURCED_FROM"
  );

  if (relevant.length === 0) return "";

  const lines: string[] = [];
  const edgePrefixes: Record<string, string> = {
    REQUIRES: "Requires",
    DEMONSTRATES: "Demonstrates",
    TRAINS: "Trains",
    CORRECTS: "Corrects",
    SEQUENCES: "Sequences to",
    RELATED: "See also",
  };

  for (const edge of relevant) {
    const otherSlug = edge.source_slug === node.slug ? edge.target_slug : edge.source_slug;
    if (!otherSlug) continue;
    const otherNode = nodesBySlug.get(otherSlug);
    if (!otherNode) continue;

    const prefix = edge.source_slug === node.slug
      ? edgePrefixes[edge.edge_type] ?? "Related"
      : `${edgePrefixes[edge.edge_type] ?? "Related"} (from)`;

    // Path-based link with title display: [[Title]] alone never resolves —
    // files are written as <folder>/<slug>.md, so title-links are ghost nodes in Obsidian.
    const otherPath = `${TYPE_FOLDERS[otherNode.node_type] ?? "concepts"}/${otherNode.slug}`;
    lines.push(`- ${prefix}: [[${otherPath}|${otherNode.title}]] — ${edge.evidence}`);
  }

  return lines.join("\n");
}

function buildFrontmatter(
  node: SynthesizedNode,
  edges: DiscoveredEdge[]
): string {
  const sourceCount = edges.filter(
    e => e.source_slug === node.slug && e.edge_type === "SOURCED_FROM"
  ).length;

  const tags: string[] = [];
  // Extract tags from node type and connections
  if (node.node_type === "phase") tags.push("four-phases");
  if (node.node_type === "technique") tags.push("punch-mechanics");
  if (node.node_type === "drill") tags.push("training");

  return [
    "---",
    `type: ${node.node_type}`,
    `aliases: [${node.aliases.map(a => `"${a}"`).join(", ")}]`,
    `tags: [${tags.join(", ")}]`,
    `centrality: 0`,
    `sources: ${sourceCount}`,
    "---",
  ].join("\n");
}

export async function writeVaultFiles(
  nodes: SynthesizedNode[],
  edges: DiscoveredEdge[],
  opts: { onlySlugs?: Set<string> } = {}
): Promise<void> {
  console.log("=== Writing Vault Files ===\n");

  // Create directory structure
  const folders = new Set(Object.values(TYPE_FOLDERS));
  for (const folder of folders) {
    await fs.mkdir(path.join(VAULT_DIR, folder), { recursive: true });
  }

  const nodesBySlug = new Map(nodes.map(n => [n.slug, n]));
  const validPaths = new Set(nodes.map(n => `${TYPE_FOLDERS[n.node_type] ?? "concepts"}/${n.slug}`));

  // Write each node as a .md file
  let written = 0;
  for (const node of nodes) {
    // Scoped mode (targeted re-synth): render only requested slugs, leave others alone.
    if (opts.onlySlugs && !opts.onlySlugs.has(node.slug)) continue;
    const folder = TYPE_FOLDERS[node.node_type] ?? "concepts";
    const frontmatter = buildFrontmatter(node, edges);
    const connections = buildConnectionsSection(node, edges, nodesBySlug);

    // Replace the Connections section in content with discovered connections.
    // Always clear the pass2 "[Leave empty]" placeholder, even if connections is empty
    // (a zero-edge node should render an empty Connections section, not a TODO).
    let content = node.content;
    // Sources sections cite videos as [[src/...]] — a path that has never existed in the
    // vault, so every such link is a ghost node in Obsidian. Render as plain text:
    // "[[src/X]] — Title" keeps just the title; a bare [[src/X]] falls back to a cleaned X.
    content = content.replace(/\[\[src\/([^\]|]+?)\]\]\s*—\s*(.+)/g, (_m, _slug, title) => `**${title.trim()}**`);
    content = content.replace(/\[\[src\/([^\]|]+?)\]\]/g, (_m, slug) => `**${String(slug).replace(/_/g, " ").trim()}**`);
    const connectionsPattern = /## Connections\n[\s\S]*?(?=\n## |$)/;
    const newSection = connections ? `## Connections\n${connections}\n` : "## Connections\n";
    if (connectionsPattern.test(content)) {
      content = content.replace(connectionsPattern, newSection);
    } else if (connections) {
      // Node has no Connections heading at all — append one before ## Sources if present
      const sourcesIdx = content.indexOf("## Sources");
      if (sourcesIdx !== -1) {
        content = content.slice(0, sourcesIdx) + `${newSection}\n` + content.slice(sourcesIdx);
      } else {
        content += `\n\n${newSection}`;
      }
    }

    let fileContent = `${frontmatter}\n\n${content}\n`;
    // Final guarantee: no dead links leave the renderer. Anything that isn't a
    // [[folder/slug]] path backed by a real node renders as plain bold text
    // (edge evidence and synthesized prose carry stray [[Video: ...]]/[[SOURCE n]] junk).
    fileContent = fileContent.replace(/\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]/g, (m, target, display) => {
      if (validPaths.has(String(target).trim())) return m;
      const text = (display ?? String(target).replace(/_/g, " ")).trim();
      return text ? `**${text}**` : "";
    });
    const filePath = path.join(VAULT_DIR, folder, `${node.slug}.md`);
    await fs.writeFile(filePath, fileContent, "utf-8");
    written++;
  }

  console.log(`Wrote ${written} node files`);

  // Scoped write (targeted re-synth): we deliberately touched only a subset, so skip
  // orphan-pruning and _MOC regeneration — both would disturb files we didn't intend to.
  if (opts.onlySlugs) return;

  // Remove orphaned .md files — nodes deleted from the DB (merge, stub cleanup, etc.)
  // leave stale files on disk unless we prune them here.
  const currentFiles = new Set(nodes.map(n => `${TYPE_FOLDERS[n.node_type] ?? "concepts"}/${n.slug}.md`));
  let pruned = 0;
  for (const folder of folders) {
    const folderPath = path.join(VAULT_DIR, folder);
    let entries: string[];
    try { entries = await fs.readdir(folderPath); } catch { continue; }
    for (const entry of entries) {
      if (!entry.endsWith(".md")) continue;
      if (currentFiles.has(`${folder}/${entry}`)) continue;
      await fs.unlink(path.join(folderPath, entry));
      pruned++;
    }
  }
  if (pruned) console.log(`Pruned ${pruned} orphaned file(s)`);

  // Write _MOC.md
  const grouped: Record<string, SynthesizedNode[]> = {};
  for (const node of nodes) {
    const group = node.node_type;
    if (!grouped[group]) grouped[group] = [];
    grouped[group].push(node);
  }

  const mocSections: string[] = [
    "# Punch Doctor Knowledge Base\n",
    "Welcome to Dr. Alex Wiant's Power Punching methodology, organized as an interconnected knowledge system.\n",
  ];

  const sectionConfig: { type: string; heading: string }[] = [
    { type: "concept", heading: "Core Concepts" },
    { type: "phase", heading: "The Four Phases" },
    { type: "technique", heading: "Punch Mechanics" },
    { type: "fighter", heading: "Fighter Analyses" },
    { type: "drill", heading: "Training & Drills" },
    { type: "injury_prevention", heading: "Injury Prevention" },
  ];

  for (const { type, heading } of sectionConfig) {
    const typeNodes = grouped[type] ?? [];
    if (typeNodes.length === 0) continue;

    mocSections.push(`## ${heading}`);
    if (type === "phase") {
      // Special formatting for phases — show sequence
      const sorted = typeNodes.sort((a, b) => a.slug.localeCompare(b.slug));
      mocSections.push(sorted.map(n => `[[${TYPE_FOLDERS[type] ?? "concepts"}/${n.slug}|${n.title}]]`).join(" → "));
    } else {
      mocSections.push(typeNodes.map(n => `- [[${TYPE_FOLDERS[type] ?? "concepts"}/${n.slug}|${n.title}]]`).join("\n"));
    }
    mocSections.push("");
  }

  await fs.writeFile(path.join(VAULT_DIR, "_MOC.md"), mocSections.join("\n"), "utf-8");
  console.log("Wrote _MOC.md");
}
