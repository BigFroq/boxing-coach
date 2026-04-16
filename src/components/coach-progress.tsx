"use client";

import { useState, useEffect } from "react";
import { Loader2, TrendingUp, Target, Calendar } from "lucide-react";

interface FocusArea {
  id: string;
  name: string;
  description: string | null;
  status: string;
  history: { date: string; note: string }[];
  created_at: string;
}

interface SessionSummary {
  id: string;
  session_type: string;
  rounds: number | null;
  summary: {
    breakthroughs?: string[];
    struggles?: string[];
    focus_areas_worked?: string[];
  };
  created_at: string;
}

interface ProgressData {
  stats: { totalSessions: number; areasImproving: number; activeFocusAreas: number };
  focusAreas: FocusArea[];
  recentSessions: SessionSummary[];
}

export function CoachProgress({ userId }: { userId: string }) {
  const [data, setData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/coach/progress?userId=${userId}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [userId]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted" />
      </div>
    );
  }

  if (!data || data.stats.totalSessions === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="text-center">
          <Calendar className="mx-auto mb-3 h-10 w-10 text-muted" />
          <p className="font-medium">No sessions yet</p>
          <p className="mt-1 text-sm text-muted">Log your first training session to start tracking progress.</p>
        </div>
      </div>
    );
  }

  const statusColors: Record<string, { bg: string; text: string }> = {
    new: { bg: "bg-blue-500/15", text: "text-blue-400" },
    active: { bg: "bg-blue-500/15", text: "text-blue-400" },
    improving: { bg: "bg-green-500/15", text: "text-green-400" },
    resolved: { bg: "bg-green-500/15", text: "text-green-400" },
  };

  const statusBarWidth: Record<string, string> = {
    new: "15%",
    active: "40%",
    improving: "70%",
    resolved: "100%",
  };

  const statusBarColor: Record<string, string> = {
    new: "bg-blue-500",
    active: "bg-blue-500",
    improving: "bg-blue-400",
    resolved: "bg-green-500",
  };

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-6 py-4 space-y-6">
      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-surface-hover p-4 text-center">
          <div className="text-2xl font-bold text-accent">{data.stats.totalSessions}</div>
          <div className="mt-1 text-xs text-muted uppercase">Sessions</div>
        </div>
        <div className="rounded-xl bg-surface-hover p-4 text-center">
          <div className="text-2xl font-bold text-green-400">{data.stats.areasImproving}</div>
          <div className="mt-1 text-xs text-muted uppercase">Improving</div>
        </div>
        <div className="rounded-xl bg-surface-hover p-4 text-center">
          <div className="text-2xl font-bold text-yellow-400">{data.stats.activeFocusAreas}</div>
          <div className="mt-1 text-xs text-muted uppercase">Active focus</div>
        </div>
      </div>

      {/* Focus Areas */}
      {data.focusAreas.length > 0 && (
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Target size={14} /> Focus Areas
          </h3>
          <div className="space-y-2">
            {data.focusAreas
              .sort((a, b) => {
                const order = { new: 0, active: 1, improving: 2, resolved: 3 };
                return (order[a.status as keyof typeof order] ?? 4) - (order[b.status as keyof typeof order] ?? 4);
              })
              .map((fa) => {
                const colors = statusColors[fa.status] ?? statusColors.new;
                return (
                  <div key={fa.id} className="rounded-xl bg-surface-hover p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">{fa.name}</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${colors.bg} ${colors.text}`}>
                        {fa.status}
                      </span>
                    </div>
                    {fa.description && (
                      <p className="text-xs text-muted leading-relaxed mb-3">{fa.description}</p>
                    )}
                    <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${statusBarColor[fa.status] ?? "bg-blue-500"}`}
                        style={{ width: statusBarWidth[fa.status] ?? "15%" }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Session Timeline */}
      <div>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <TrendingUp size={14} /> Recent Sessions
        </h3>
        <div className="border-l-2 border-white/10 ml-2 pl-4 space-y-4">
          {data.recentSessions.map((s) => {
            const date = new Date(s.created_at);
            const label = formatRelativeDate(date);
            const breakthroughs = s.summary?.breakthroughs ?? [];
            const struggles = s.summary?.struggles ?? [];

            return (
              <div key={s.id} className="relative">
                <div className="absolute -left-[22px] top-1 h-2.5 w-2.5 rounded-full bg-white/20" />
                <div className="text-xs text-muted">{label}</div>
                <div className="mt-0.5 text-sm">
                  {formatSessionType(s.session_type)}
                  {s.rounds ? ` — ${s.rounds} rounds` : ""}
                </div>
                {(breakthroughs.length > 0 || struggles.length > 0) && (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {breakthroughs.map((b, i) => (
                      <span key={`b-${i}`} className="rounded-md bg-green-500/10 px-2 py-0.5 text-[11px] text-green-400">
                        {b}
                      </span>
                    ))}
                    {struggles.map((st, i) => (
                      <span key={`s-${i}`} className="rounded-md bg-yellow-500/10 px-2 py-0.5 text-[11px] text-yellow-400">
                        {st}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString();
}

function formatSessionType(type: string): string {
  const labels: Record<string, string> = {
    bag_work: "Heavy bag",
    shadow_boxing: "Shadow boxing",
    sparring: "Sparring",
    drills: "Drills",
    mixed: "Mixed training",
  };
  return labels[type] ?? type;
}
