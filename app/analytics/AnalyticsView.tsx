"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Card, Session, Tag } from "@/types";

interface Props {
  sessions: Session[];
  cards: Card[];
  tags: Tag[];
}

interface TagPerf {
  tag: Tag;
  /** Distinct cards with this tag that have been attempted at least once. */
  total: number;
  /** Cards whose latest attempt was correct. */
  correct: number;
  /** correct / total × 100. */
  accuracy: number;
  /** Avg time taken on the latest attempt of each attempted card. */
  avgTime: number;
  /** Total raw attempts across history (lifetime), for context. */
  attempts: number;
  band: "critical" | "shaky" | "solid" | "untested";
  lowCoverage: boolean;
  slow: boolean;
  /**
   * Per-card latest-vs-prior delta, averaged across cards with ≥2 attempts.
   * Positive = improving on retry; negative = backsliding.
   */
  trend: number | null;
}

const SLOW_THRESHOLD_MS = 10_000;
const LOW_COVERAGE_THRESHOLD = 3;

function fmtMs(ms: number) {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

export function AnalyticsView({ sessions, cards, tags }: Props) {
  const router = useRouter();
  const [range, setRange] = useState<"7d" | "30d" | "all">("all");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "critical" | "shaky" | "solid" | "lowCoverage" | "slow" | "regressing" | "untested">("all");
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());

  const cardById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);

  const filteredSessions = useMemo(() => {
    if (range === "all") return sessions;
    const days = range === "7d" ? 7 : 30;
    const cutoff = Date.now() - days * 86_400_000;
    return sessions.filter((s) => new Date(s.completedAt).getTime() >= cutoff);
  }, [sessions, range]);

  /**
   * Full per-card history sorted oldest → newest. Used for:
   *   - latest-attempt deduping (accuracy metrics)
   *   - per-card latest-vs-prior trend
   */
  const cardHistory = useMemo(() => {
    const m = new Map<string, { result: Session["results"][number]; t: string }[]>();
    for (const s of filteredSessions) {
      for (const r of s.results ?? []) {
        const arr = m.get(r.cardId) ?? [];
        arr.push({ result: r, t: s.completedAt });
        m.set(r.cardId, arr);
      }
    }
    for (const h of m.values()) h.sort((a, b) => a.t.localeCompare(b.t));
    return m;
  }, [filteredSessions]);

  /** Most-recent attempt per card. This is what "current understanding" means. */
  const latestPerCard = useMemo(() => {
    const m = new Map<string, Session["results"][number]>();
    for (const [cid, hist] of cardHistory) {
      if (hist.length > 0) m.set(cid, hist[hist.length - 1].result);
    }
    return m;
  }, [cardHistory]);

  const latestResults = useMemo(() => [...latestPerCard.values()], [latestPerCard]);
  const allResults = useMemo(
    () => filteredSessions.flatMap((s) => s.results ?? []),
    [filteredSessions]
  );

  // ── Aggregate top stats. Accuracy uses latest-per-card so retries reflect
  // improvement. Time stats use lifetime attempts because the time really was
  // spent. Best score is per-session as usual.
  const cardsAttempted = latestResults.length;
  const cardsCorrectNow = latestResults.filter((r) => r.correct).length;
  const overallAccuracy = cardsAttempted
    ? Math.round((cardsCorrectNow / cardsAttempted) * 100)
    : 0;
  const totalAttempts = allResults.length;
  const avgTime = cardsAttempted
    ? Math.round(latestResults.reduce((a, r) => a + r.timeTaken, 0) / cardsAttempted)
    : 0;
  const totalTime = allResults.reduce((a, r) => a + r.timeTaken, 0);
  const bestScore = filteredSessions.length
    ? Math.max(...filteredSessions.map((s) => s.score))
    : 0;

  // ── Charts data
  const trend = useMemo(
    () =>
      filteredSessions
        .slice()
        .sort((a, b) => a.completedAt.localeCompare(b.completedAt))
        .map((s) => ({
          label: new Date(s.completedAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          }),
          score: s.score,
        })),
    [filteredSessions]
  );

  // Difficulty accuracy uses latest-per-card so retries can improve a difficulty's accuracy.
  const byDifficulty = useMemo(() => {
    const buckets: Record<number, { total: number; correct: number }> = {
      1: { total: 0, correct: 0 },
      2: { total: 0, correct: 0 },
      3: { total: 0, correct: 0 },
      4: { total: 0, correct: 0 },
      5: { total: 0, correct: 0 },
    };
    for (const r of latestResults) {
      const c = cardById.get(r.cardId);
      if (!c) continue;
      buckets[c.difficulty].total += 1;
      if (r.correct) buckets[c.difficulty].correct += 1;
    }
    return Object.entries(buckets).map(([k, v]) => ({
      difficulty: `D${k}`,
      accuracy: v.total ? Math.round((v.correct / v.total) * 100) : 0,
      total: v.total,
    }));
  }, [latestResults, cardById]);

  // Confidence calibration is a per-answer metric (each answer carries its own
  // confidence rating), so we keep all attempts here — that's the honest signal.
  const byConfidence = useMemo(() => {
    const labels: Record<number, string> = { 1: "Not sure", 2: "OK", 3: "Confident" };
    const buckets: Record<number, { total: number; correct: number }> = {
      1: { total: 0, correct: 0 },
      2: { total: 0, correct: 0 },
      3: { total: 0, correct: 0 },
    };
    for (const r of allResults) {
      buckets[r.confidence].total += 1;
      if (r.correct) buckets[r.confidence].correct += 1;
    }
    return [1, 2, 3].map((k) => ({
      confidence: labels[k],
      accuracy: buckets[k].total ? Math.round((buckets[k].correct / buckets[k].total) * 100) : 0,
    }));
  }, [allResults]);

  // ── Per-tag performance
  const tagPerf = useMemo<TagPerf[]>(() => {
    return tags.map((tag) => {
      let total = 0;
      let correct = 0;
      let timeSum = 0;
      let attempts = 0;
      let retriedCards = 0;
      let trendSum = 0;

      for (const [cardId, hist] of cardHistory) {
        const card = cardById.get(cardId);
        if (!card || !card.tags.includes(tag.id)) continue;

        attempts += hist.length;
        const latest = hist[hist.length - 1].result;
        total += 1;
        timeSum += latest.timeTaken;
        if (latest.correct) correct += 1;

        // Per-card trend: latest correctness vs the attempt immediately before it.
        // Values: +1 (improved), 0 (same), -1 (regressed). Averaged at the end.
        if (hist.length >= 2) {
          const prior = hist[hist.length - 2].result;
          retriedCards += 1;
          trendSum += (latest.correct ? 1 : 0) - (prior.correct ? 1 : 0);
        }
      }

      const accuracy = total ? Math.round((correct / total) * 100) : 0;
      const avgTime = total ? Math.round(timeSum / total) : 0;
      const trend =
        retriedCards > 0 ? Math.round((trendSum / retriedCards) * 100) : null;

      let band: TagPerf["band"];
      if (total === 0) band = "untested";
      else if (accuracy < 50) band = "critical";
      else if (accuracy < 75) band = "shaky";
      else band = "solid";

      return {
        tag,
        total,
        correct,
        accuracy,
        avgTime,
        attempts,
        band,
        lowCoverage: total > 0 && total < LOW_COVERAGE_THRESHOLD,
        slow: avgTime >= SLOW_THRESHOLD_MS && accuracy >= 75,
        trend,
      };
    });
  }, [cardHistory, cardById, tags]);

  // ── Filter + search the tag list
  const visibleTags = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tagPerf
      .filter((p) => {
        if (q && !p.tag.name.toLowerCase().includes(q)) return false;
        switch (filter) {
          case "all": return true;
          case "critical": return p.band === "critical";
          case "shaky": return p.band === "shaky";
          case "solid": return p.band === "solid";
          case "untested": return p.band === "untested";
          case "lowCoverage": return p.lowCoverage;
          case "slow": return p.slow;
          case "regressing": return (p.trend ?? 0) <= -10;
        }
      })
      .sort((a, b) => {
        // Untested last; otherwise weakest first.
        if (a.band === "untested" && b.band !== "untested") return 1;
        if (b.band === "untested" && a.band !== "untested") return -1;
        return a.accuracy - b.accuracy;
      });
  }, [tagPerf, query, filter]);

  // ── Pre-built study groups
  const groups = useMemo(() => {
    const critical = tagPerf.filter((p) => p.band === "critical");
    const shaky = tagPerf.filter((p) => p.band === "shaky");
    const lowCov = tagPerf.filter((p) => p.lowCoverage);
    const slow = tagPerf.filter((p) => p.slow);
    const regressing = tagPerf.filter((p) => (p.trend ?? 0) <= -10 && p.total > 0);
    return [
      {
        key: "critical",
        title: "Critical",
        tone: "rose" as const,
        desc: "Below 50% accuracy — biggest priority.",
        items: critical,
      },
      {
        key: "regressing",
        title: "Regressing",
        tone: "amber" as const,
        desc: "Latest attempt worse than previous on retried cards.",
        items: regressing,
      },
      {
        key: "shaky",
        title: "Shaky",
        tone: "amber" as const,
        desc: "50–74% — almost there, push to solid.",
        items: shaky,
      },
      {
        key: "lowCoverage",
        title: "Low coverage",
        tone: "indigo" as const,
        desc: `Fewer than ${LOW_COVERAGE_THRESHOLD} cards attempted — too small to trust.`,
        items: lowCov,
      },
      {
        key: "slow",
        title: "Slow but accurate",
        tone: "violet" as const,
        desc: `Avg over ${SLOW_THRESHOLD_MS / 1000}s — drill for speed.`,
        items: slow,
      },
    ].filter((g) => g.items.length > 0);
  }, [tagPerf]);

  function startTest(tagIds: string[]) {
    if (tagIds.length === 0) return;
    const params = new URLSearchParams();
    params.set("tags", tagIds.join(","));
    params.set("shuffle", "true");
    params.set("min", "1");
    params.set("max", "5");
    router.push(`/test/session?${params.toString()}`);
  }

  function toggleTagSelect(id: string) {
    setSelectedTags((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function selectAllVisible() {
    setSelectedTags(new Set(visibleTags.map((v) => v.tag.id)));
  }
  function clearSelection() {
    setSelectedTags(new Set());
  }

  if (sessions.length === 0) {
    return (
      <div className="text-center py-20 space-y-3">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-zinc-500">Run a test to start collecting data.</p>
        <Link
          href="/test/setup"
          className="inline-block px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
        >
          Start a test
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <div className="inline-flex rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          {(["7d", "30d", "all"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={[
                "px-3 py-1.5 text-xs font-medium",
                range === r
                  ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                  : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800",
              ].join(" ")}
            >
              {r === "all" ? "All time" : `Last ${r}`}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label="Sessions" value={filteredSessions.length} />
        <Stat
          label="Cards seen"
          value={cardsAttempted}
          hint={totalAttempts !== cardsAttempted ? `${totalAttempts} attempts` : undefined}
        />
        <Stat
          label="Accuracy"
          value={`${overallAccuracy}%`}
          accent={overallAccuracy >= 75 ? "emerald" : overallAccuracy >= 50 ? "amber" : "rose"}
          hint="latest per card"
        />
        <Stat label="Best score" value={`${bestScore}%`} accent="indigo" />
        <Stat label="Avg time" value={fmtMs(avgTime)} />
      </div>

      <p className="text-[11px] text-zinc-500 -mt-3">
        Accuracy metrics use your <strong>latest attempt per card</strong>, so retrying a missed card
        and getting it right will improve your stats.
      </p>

      <div className="grid lg:grid-cols-2 gap-4">
        <ChartCard title="Accuracy over time" subtitle={`${trend.length} session${trend.length === 1 ? "" : "s"}`}>
          {trend.length === 0 ? (
            <Empty />
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 5, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.12} />
                  <XAxis dataKey="label" stroke="currentColor" fontSize={11} />
                  <YAxis domain={[0, 100]} stroke="currentColor" fontSize={11} />
                  <Tooltip content={<ChartTip />} />
                  <Line type="monotone" dataKey="score" stroke="#6366f1" strokeWidth={2} dot={{ r: 3, fill: "#6366f1" }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Accuracy by difficulty" subtitle="Are harder cards actually harder?">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byDifficulty} margin={{ top: 5, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.12} />
                <XAxis dataKey="difficulty" stroke="currentColor" fontSize={11} />
                <YAxis domain={[0, 100]} stroke="currentColor" fontSize={11} />
                <Tooltip content={<ChartTip />} />
                <Bar dataKey="accuracy" radius={[4, 4, 0, 0]}>
                  {byDifficulty.map((d) => (
                    <Cell
                      key={d.difficulty}
                      fill={d.total === 0 ? "#a1a1aa" : d.accuracy >= 75 ? "#10b981" : d.accuracy >= 50 ? "#f59e0b" : "#ef4444"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Confidence calibration" subtitle="Higher confidence should mean higher accuracy">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byConfidence} margin={{ top: 5, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.12} />
                <XAxis dataKey="confidence" stroke="currentColor" fontSize={11} />
                <YAxis domain={[0, 100]} stroke="currentColor" fontSize={11} />
                <Tooltip content={<ChartTip />} />
                <Bar dataKey="accuracy" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Time investment" subtitle="Total time on tests in this range">
          <div className="h-56 flex flex-col items-center justify-center">
            <div className="text-5xl font-bold">{fmtMs(totalTime)}</div>
            <div className="text-sm text-zinc-500 mt-2">across {filteredSessions.length} sessions</div>
          </div>
        </ChartCard>
      </div>

      {/* ── Study groups: pre-built buckets that suggest what to drill */}
      {groups.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Study groups</h2>
            <span className="text-xs text-zinc-500">Auto-grouped to focus your practice</span>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {groups.map((g) => (
              <GroupCard
                key={g.key}
                title={g.title}
                desc={g.desc}
                tone={g.tone}
                items={g.items}
                onSelect={() => setSelectedTags(new Set(g.items.map((p) => p.tag.id)))}
                onTest={() => startTest(g.items.map((p) => p.tag.id))}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Tag list with search & filters */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <h2 className="text-lg font-semibold">Tag performance</h2>
          <span className="text-xs text-zinc-500">
            {visibleTags.length} of {tagPerf.length} tags
          </span>
        </div>

        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
          <div className="p-3 border-b border-zinc-200 dark:border-zinc-800 space-y-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tags…"
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
            />
            <div className="flex flex-wrap gap-1.5">
              {([
                ["all", "All", tagPerf.length],
                ["critical", "Critical", tagPerf.filter((p) => p.band === "critical").length],
                ["shaky", "Shaky", tagPerf.filter((p) => p.band === "shaky").length],
                ["solid", "Solid", tagPerf.filter((p) => p.band === "solid").length],
                ["lowCoverage", "Low coverage", tagPerf.filter((p) => p.lowCoverage).length],
                ["slow", "Slow", tagPerf.filter((p) => p.slow).length],
                ["regressing", "Regressing", tagPerf.filter((p) => (p.trend ?? 0) <= -10 && p.total > 0).length],
                ["untested", "Untested", tagPerf.filter((p) => p.band === "untested").length],
              ] as const).map(([key, label, count]) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  disabled={count === 0 && key !== "all"}
                  className={[
                    "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                    filter === key
                      ? "bg-zinc-900 text-white border-zinc-900 dark:bg-white dark:text-zinc-900 dark:border-white"
                      : "border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800",
                    count === 0 && key !== "all" && "opacity-30 cursor-not-allowed",
                  ].filter(Boolean).join(" ")}
                >
                  {label} <span className="opacity-60">({count})</span>
                </button>
              ))}
            </div>
          </div>

          {/* Sticky action bar */}
          <div className="px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3 text-sm bg-zinc-50 dark:bg-zinc-900/60">
            <div className="text-zinc-600 dark:text-zinc-400">
              {selectedTags.size > 0
                ? `${selectedTags.size} tag${selectedTags.size === 1 ? "" : "s"} selected`
                : "Click a row to select tags"}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={selectAllVisible}
                className="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                disabled={visibleTags.length === 0}
              >
                Select all visible
              </button>
              {selectedTags.size > 0 && (
                <button
                  onClick={clearSelection}
                  className="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  Clear
                </button>
              )}
              <button
                onClick={() => startTest([...selectedTags])}
                disabled={selectedTags.size === 0}
                className="text-xs px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Test selected →
              </button>
            </div>
          </div>

          {visibleTags.length === 0 ? (
            <div className="p-8 text-center text-sm text-zinc-500">No tags match.</div>
          ) : (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {visibleTags.map((p) => (
                <TagRow
                  key={p.tag.id}
                  perf={p}
                  selected={selectedTags.has(p.tag.id)}
                  onToggle={() => toggleTagSelect(p.tag.id)}
                  onTest={() => startTest([p.tag.id])}
                />
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function TagRow({
  perf,
  selected,
  onToggle,
  onTest,
}: {
  perf: TagPerf;
  selected: boolean;
  onToggle: () => void;
  onTest: () => void;
}) {
  const tone =
    perf.band === "untested"
      ? "bg-zinc-300 dark:bg-zinc-700"
      : perf.band === "critical"
      ? "bg-rose-500"
      : perf.band === "shaky"
      ? "bg-amber-500"
      : "bg-emerald-500";

  return (
    <li
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      aria-pressed={selected}
      className={[
        "flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors group",
        selected
          ? "bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-950/60"
          : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50",
      ].join(" ")}
    >
      <span
        className={[
          "shrink-0 w-5 h-5 inline-flex items-center justify-center rounded border text-xs",
          selected
            ? "bg-indigo-600 border-indigo-600 text-white"
            : "border-zinc-300 dark:border-zinc-700 text-transparent group-hover:text-zinc-300 dark:group-hover:text-zinc-700",
        ].join(" ")}
        aria-hidden="true"
      >
        ✓
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={[
              "text-sm truncate",
              selected && "font-medium text-indigo-700 dark:text-indigo-300",
            ].filter(Boolean).join(" ")}
          >
            {perf.tag.name}
          </span>
          {perf.band === "untested" && (
            <Badge tone="zinc">untested</Badge>
          )}
          {perf.lowCoverage && <Badge tone="indigo">low coverage</Badge>}
          {perf.slow && <Badge tone="violet">slow</Badge>}
          {perf.trend !== null && perf.trend <= -10 && (
            <Badge tone="amber">▼ {Math.abs(perf.trend)}%</Badge>
          )}
          {perf.trend !== null && perf.trend >= 10 && (
            <Badge tone="emerald">▲ {perf.trend}%</Badge>
          )}
        </div>
        {perf.band !== "untested" && (
          <div className="mt-1.5 flex items-center gap-2">
            <div className="flex-1 max-w-[12rem] h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
              <div className={`h-full ${tone}`} style={{ width: `${perf.accuracy}%` }} />
            </div>
            <span
              className="text-[11px] font-mono text-zinc-500 shrink-0"
              title={
                perf.attempts !== perf.total
                  ? `${perf.attempts} total attempts across ${perf.total} card${perf.total === 1 ? "" : "s"}`
                  : undefined
              }
            >
              {perf.accuracy}% · {perf.correct}/{perf.total}
              {perf.attempts > perf.total && (
                <span className="opacity-70"> ({perf.attempts} att)</span>
              )}
              {" · "}
              {fmtMs(perf.avgTime)}
            </span>
          </div>
        )}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onTest();
        }}
        className="text-xs px-2.5 py-1 rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
        title="Test only this tag"
      >
        Test
      </button>
    </li>
  );
}

function GroupCard({
  title,
  desc,
  tone,
  items,
  onSelect,
  onTest,
}: {
  title: string;
  desc: string;
  tone: "rose" | "amber" | "indigo" | "violet";
  items: TagPerf[];
  onSelect: () => void;
  onTest: () => void;
}) {
  const toneCls = {
    rose: "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900",
    amber: "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900",
    indigo: "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-900",
    violet: "bg-violet-50 dark:bg-violet-950/40 border-violet-200 dark:border-violet-900",
  }[tone];
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-3 ${toneCls}`}>
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-semibold">{title}</h3>
          <span className="text-xs text-zinc-500 font-mono">{items.length}</span>
        </div>
        <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">{desc}</p>
      </div>
      <div className="flex flex-wrap gap-1 text-xs">
        {items.slice(0, 6).map((p) => (
          <span
            key={p.tag.id}
            className="px-2 py-0.5 rounded-full bg-white/60 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800"
          >
            {p.tag.name}
            {p.total > 0 && <span className="ml-1 font-mono text-zinc-500">{p.accuracy}%</span>}
          </span>
        ))}
        {items.length > 6 && (
          <span className="px-2 py-0.5 text-zinc-500">+{items.length - 6} more</span>
        )}
      </div>
      <div className="flex gap-2 mt-auto">
        <button
          onClick={onTest}
          className="flex-1 px-3 py-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-medium dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Test all →
        </button>
        <button
          onClick={onSelect}
          className="px-3 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 text-sm hover:bg-white/60 dark:hover:bg-zinc-900/60"
          title="Select these tags in the table below"
        >
          Select
        </button>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  accent?: "emerald" | "amber" | "rose" | "indigo";
  hint?: string;
}) {
  const cls = {
    emerald: "text-emerald-600 dark:text-emerald-400",
    amber: "text-amber-600 dark:text-amber-400",
    rose: "text-rose-600 dark:text-rose-400",
    indigo: "text-indigo-600 dark:text-indigo-400",
  };
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-900">
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`text-2xl font-bold mt-0.5 ${accent ? cls[accent] : ""}`}>{value}</div>
      {hint && <div className="text-[10px] text-zinc-500 mt-0.5">{hint}</div>}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 bg-white dark:bg-zinc-900">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h3 className="font-semibold">{title}</h3>
        {subtitle && <span className="text-xs text-zinc-500">{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

function Empty({ text = "Not enough data." }: { text?: string }) {
  return (
    <div className="h-40 flex items-center justify-center text-sm text-zinc-500">{text}</div>
  );
}

function Badge({ tone, children }: { tone: "zinc" | "indigo" | "violet" | "amber" | "emerald"; children: React.ReactNode }) {
  const cls = {
    zinc: "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400",
    indigo: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    violet: "bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300",
    amber: "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300",
    emerald: "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300",
  }[tone];
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${cls}`}>
      {children}
    </span>
  );
}

interface TipPayload {
  name: string;
  value: number | string;
  color?: string;
}
function ChartTip({ active, payload, label }: { active?: boolean; payload?: TipPayload[]; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-md bg-background border border-zinc-200 dark:border-zinc-800 px-2.5 py-1.5 shadow-md text-xs">
      <div className="text-zinc-500">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="font-medium" style={{ color: p.color }}>
          {p.name}: {p.value}
        </div>
      ))}
    </div>
  );
}
