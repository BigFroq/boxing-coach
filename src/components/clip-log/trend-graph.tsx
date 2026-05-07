"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { fetchRecentClips } from "@/lib/clip-log-storage";
import { computeRollingAvgTrend } from "@/lib/clip-log-aggregation";

interface TrendGraphProps {
  userId: string;
}

const ROLL = 3;
const PHASE_COLORS = {
  loading: "#3b82f6",
  hipExplosion: "#f97316",
  energyTransfer: "#ef4444",
  followThrough: "#a855f7",
  overall: "#9ca3af",
};

export function TrendGraph({ userId }: TrendGraphProps) {
  const [points, setPoints] = useState<ReturnType<typeof computeRollingAvgTrend>>([]);
  const [clipCount, setClipCount] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId || userId === "anon") {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const r = await fetchRecentClips(userId, 60);
      if (cancelled) return;
      if (r.status === "ok") {
        setClipCount(r.clips.length);
        // fetchRecentClips returns DESC (newest first); computeRollingAvgTrend
        // expects chronological input for left-to-right chart rendering.
        const chronological = [...r.clips].reverse();
        setPoints(computeRollingAvgTrend(chronological, ROLL));
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!loaded) return null;

  if (clipCount < ROLL) {
    return (
      <div className="rounded-xl bg-surface-hover p-5 text-center text-sm text-muted">
        Log {ROLL} clips to see your trend.
      </div>
    );
  }

  const chartData = points.map((p) => ({
    date: new Date(p.createdAt).toLocaleDateString([], { month: "short", day: "numeric" }),
    Loading: p.loading,
    Hip: p.hipExplosion,
    Transfer: p.energyTransfer,
    Follow: p.followThrough,
    Overall: p.overall,
  }));

  return (
    <div className="rounded-xl bg-surface-hover p-4">
      <div className="text-sm font-semibold mb-3">Technique trend</div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="date" stroke="#9ca3af" fontSize={11} />
            <YAxis domain={[1, 10]} stroke="#9ca3af" fontSize={11} />
            <Tooltip
              contentStyle={{
                background: "#1c1c1c",
                border: "1px solid rgba(255,255,255,0.1)",
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="Loading" stroke={PHASE_COLORS.loading} dot={false} strokeWidth={1.5} />
            <Line type="monotone" dataKey="Hip" stroke={PHASE_COLORS.hipExplosion} dot={false} strokeWidth={1.5} />
            <Line type="monotone" dataKey="Transfer" stroke={PHASE_COLORS.energyTransfer} dot={false} strokeWidth={1.5} />
            <Line type="monotone" dataKey="Follow" stroke={PHASE_COLORS.followThrough} dot={false} strokeWidth={1.5} />
            <Line type="monotone" dataKey="Overall" stroke={PHASE_COLORS.overall} dot={false} strokeWidth={2.5} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="text-xs text-muted mt-2">
        3-clip rolling average · scores 1–10 · expect ±1 model variance
      </div>
    </div>
  );
}
