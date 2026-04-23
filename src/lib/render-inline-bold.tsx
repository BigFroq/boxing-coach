import type { ReactNode } from "react";

/**
 * The coach prompt allows at most one bolded phrase per answer using
 * `**markdown**`. Render that inline as a <strong>; anything else stays plain.
 * Defensive against unclosed ** (treats trailing segment as plain text).
 *
 * Keep this tiny and dependency-free — the goal is only to support the one
 * markdown convention the prompt actually uses, not to become a full renderer.
 */
export function renderInlineBold(text: string): ReactNode {
  // No `s` flag — bold phrases shouldn't span newlines; if they do, we'd
  // rather render them as plain text than silently swallow a line break.
  const parts = text.split(/\*\*([^\n]+?)\*\*/g);
  return parts.map((segment, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold">
        {segment}
      </strong>
    ) : (
      <span key={i}>{segment}</span>
    )
  );
}
