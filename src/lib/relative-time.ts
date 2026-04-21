/**
 * Format an ISO timestamp as a human-readable relative string.
 * Returns "Never" for null/undefined/invalid input.
 * Labels: "Today", "Yesterday", "N days ago", "N week(s) ago",
 * "N month(s) ago", "Over a year ago".
 */
export function formatRelativeTime(
  iso: string | null | undefined,
  now: Date = new Date()
): string {
  if (!iso) return "Never";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "Never";

  const diffMs = now.getTime() - then.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return "1 week ago";
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  const months = Math.round(diffDays / 30);
  if (months < 2) return "1 month ago";
  if (diffDays < 365) return `${months} months ago`;
  return "Over a year ago";
}
