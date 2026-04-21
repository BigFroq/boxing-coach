"use client";

import { useState, useEffect } from "react";
import { Loader2, TrendingUp, Target, Calendar, AlertTriangle } from "lucide-react";
import { formatRelativeTime } from "@/lib/relative-time";

interface FocusArea {
  id: string;
  name: string;
  description: string | null;
  status: string;
  history: { date: string; note: string }[];
  created_at: string;
  dimension?: string | null;
  knowledge_node_slug?: string | null;
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

interface DrillPrescription {
  id: string;
  drill_name: string;
  details: string | null;
  followed_up: boolean;
  followed_up_at: string | null;
  followed_up_session_id: string | null;
  created_at: string;
}

interface ProgressData {
  stats: { totalSessions: number; areasImproving: number; activeFocusAreas: number };
  focusAreas: FocusArea[];
  recentSessions: SessionSummary[];
  neglectedFocusAreas?: string[];
  drillPrescriptions?: { pending: DrillPrescription[]; recent: DrillPrescription[] };
  focusAreaLastWorked?: Record<string, string | null>;
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

      {/* Been Avoiding */}
      {(data.neglectedFocusAreas?.length ?? 0) > 0 && (
        <div>
          <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-red-400">
            <AlertTriangle size={14} /> Been Avoiding
          </h3>
          <p className="mb-3 text-xs text-muted">
            Focus areas not touched in your last 3 sessions.
          </p>
          <div className="flex flex-wrap gap-2">
            {data.neglectedFocusAreas!.map((name, i) => (
              <span
                key={`${i}-${name}`}
                className="inline-block rounded-full bg-red-500/10 px-3 py-1 text-xs font-medium text-red-300"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      )}

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
                      <p className="text-xs text-muted leading-relaxed mb-2">{fa.description}</p>
                    )}
                    <p className="text-xs text-muted mb-3">
                      Last worked: {formatRelativeTime(data.focusAreaLastWorked?.[fa.id] ?? null)}
                    </p>
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

      {/* Drill History */}
      {((data.drillPrescriptions?.pending.length ?? 0) > 0 ||
        (data.drillPrescriptions?.recent.length ?? 0) > 0) && (
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Target size={14} /> Drill History
          </h3>
          <div className="space-y-4">
            {(data.drillPrescriptions!.pending.length > 0) && (
              <div>
                <p className="mb-2 text-xs font-semibold text-muted uppercase">
                  Pending ({data.drillPrescriptions!.pending.length})
                </p>
                <div className="space-y-2">
                  {data.drillPrescriptions!.pending.map((d) => (
                    <div key={d.id} className="rounded-xl bg-surface-hover p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{d.drill_name}</span>
                        <span className="text-xs text-muted">
                          Prescribed {formatRelativeTime(d.created_at).toLowerCase()}
                        </span>
                      </div>
                      {d.details && <p className="mt-1 text-xs text-muted">{d.details}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {(data.drillPrescriptions!.recent.length > 0) && (
              <div>
                <p className="mb-2 text-xs font-semibold text-muted uppercase">
                  Recently Done ({data.drillPrescriptions!.recent.length})
                </p>
                <div className="space-y-2">
                  {data.drillPrescriptions!.recent.map((d) => (
                    <div key={d.id} className="rounded-xl bg-surface-hover p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{d.drill_name}</span>
                        <span className="text-xs text-green-400">
                          Done {formatRelativeTime(d.followed_up_at).toLowerCase()}
                        </span>
                      </div>
                      {d.details && <p className="mt-1 text-xs text-muted">{d.details}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
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
            const label = formatRelativeTime(s.created_at);
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
