"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Session, TagStat } from "@/types";

export function AnalyticsView({
  sessions,
  stats,
}: {
  sessions: Session[];
  stats: TagStat[];
}) {
  const trend = sessions
    .slice()
    .sort((a, b) => a.completedAt.localeCompare(b.completedAt))
    .map((s, i) => ({
      x: i + 1,
      label: new Date(s.completedAt).toLocaleDateString(),
      score: s.score,
    }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Analytics</h1>

      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 bg-white dark:bg-zinc-900">
        <h3 className="font-semibold mb-4">Accuracy over time</h3>
        {trend.length === 0 ? (
          <p className="text-sm text-zinc-500">Take a test to see your trend.</p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.15} />
                <XAxis dataKey="label" stroke="currentColor" fontSize={12} />
                <YAxis domain={[0, 100]} stroke="currentColor" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: "var(--background)",
                    border: "1px solid rgba(128,128,128,0.3)",
                    borderRadius: 8,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 bg-white dark:bg-zinc-900">
        <h3 className="font-semibold mb-4">Tag heatmap</h3>
        {stats.length === 0 ? (
          <p className="text-sm text-zinc-500">No tags yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {stats.map((s) => {
              const cls =
                s.total === 0
                  ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
                  : s.accuracy < 50
                  ? "bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/40"
                  : s.accuracy < 75
                  ? "bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-500/40"
                  : "bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border-emerald-500/40";
              return (
                <div
                  key={s.tagId}
                  className={`rounded-lg border border-transparent p-3 ${cls}`}
                >
                  <div className="text-sm font-medium truncate">{s.tagName}</div>
                  <div className="text-xs opacity-80">
                    {s.total === 0 ? "no data" : `${s.accuracy}% · ${s.total} tries`}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
