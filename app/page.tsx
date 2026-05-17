import Link from "next/link";
import { readDb } from "@/lib/db";
import type { Card, Group, Session, Tag } from "@/types";
import { TagTree } from "@/components/TagTree";
import { GroupQuickLaunch } from "@/components/GroupQuickLaunch";
import { ExportAllButton } from "@/components/ExportAllButton";
import { exportBundle } from "@/lib/export";

export const dynamic = "force-dynamic";

function computeStreak(sessions: Session[]): number {
  if (sessions.length === 0) return 0;
  const days = new Set(
    sessions.map((s) => new Date(s.completedAt).toISOString().slice(0, 10))
  );
  let streak = 0;
  const cursor = new Date();
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export default function Home() {
  const cards = readDb<Card>("cards.json");
  const tags = readDb<Tag>("tags.json");
  const sessions = readDb<Session>("sessions.json");
  const groups = readDb<Group>("groups.json");

  // Tag accuracy — uses the LATEST attempt per card so retries reflect improvement.
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const cardHistory = new Map<string, { correct: boolean; t: string }[]>();
  for (const s of sessions) {
    for (const r of s.results ?? []) {
      const arr = cardHistory.get(r.cardId) ?? [];
      arr.push({ correct: r.correct, t: s.completedAt });
      cardHistory.set(r.cardId, arr);
    }
  }
  const buckets = new Map<string, { total: number; correct: number }>();
  for (const [cid, hist] of cardHistory) {
    const card = cardById.get(cid);
    if (!card) continue;
    hist.sort((a, b) => a.t.localeCompare(b.t));
    const latest = hist[hist.length - 1];
    for (const tagId of card.tags) {
      const b = buckets.get(tagId) ?? { total: 0, correct: 0 };
      b.total += 1;
      if (latest.correct) b.correct += 1;
      buckets.set(tagId, b);
    }
  }
  const weakTags = tags
    .map((t) => {
      const b = buckets.get(t.id) ?? { total: 0, correct: 0 };
      return { tag: t, accuracy: b.total ? (b.correct / b.total) * 100 : null, total: b.total };
    })
    .filter((x) => x.accuracy !== null && x.accuracy < 50)
    .sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0));

  const streak = computeStreak(sessions);

  return (
    <div className="grid lg:grid-cols-[18rem_1fr] gap-6">
      <aside className="space-y-3 order-2 lg:order-1">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Tags</h2>
          <Link href="/tags" className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
            manage
          </Link>
        </div>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 bg-white dark:bg-zinc-900">
          <TagTree tags={tags} searchable />
        </div>
      </aside>

      <section className="space-y-6 order-1 lg:order-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Welcome back</h1>
          <p className="text-zinc-500 mt-1">Stay sharp. Pick a topic and run a quick test.</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <Stat label="Total cards" value={cards.length} />
          <Stat label="Groups" value={groups.length} />
          <Stat label="Weak tags (&lt;50%)" value={weakTags.length} accent="amber" />
          <Stat label="Day streak" value={streak} accent="emerald" />
        </div>

        <div className="flex flex-wrap gap-2 sm:gap-3">
          <Link
            href="/test/setup"
            className="flex-1 sm:flex-initial inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
          >
            Start a test →
          </Link>
          <Link
            href="/cards/new"
            className="flex-1 sm:flex-initial inline-flex items-center justify-center px-4 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 font-medium"
          >
            New card
          </Link>
          <Link
            href="/groups"
            className="flex-1 sm:flex-initial inline-flex items-center justify-center px-4 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 font-medium"
          >
            Manage groups
          </Link>
          <ExportAllButton bundle={exportBundle(cards, tags, groups)} />
        </div>

        {groups.length > 0 && (
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 bg-white dark:bg-zinc-900">
            <div className="flex items-baseline justify-between mb-3">
              <h3 className="font-semibold">Your groups</h3>
              <Link
                href="/groups"
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                manage →
              </Link>
            </div>
            <GroupQuickLaunch groups={groups} tags={tags} />
          </div>
        )}

        {weakTags.length > 0 && (
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 bg-white dark:bg-zinc-900">
            <h3 className="font-semibold mb-3">Topics to review</h3>
            <ul className="space-y-2">
              {weakTags.slice(0, 5).map(({ tag, accuracy, total }) => (
                <li key={tag.id} className="flex items-center justify-between text-sm">
                  <span>{tag.name}</span>
                  <span className="text-rose-600 dark:text-rose-400 font-mono">
                    {Math.round(accuracy ?? 0)}% · {total} tries
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: React.ReactNode;
  value: number;
  accent?: "amber" | "emerald";
}) {
  const accentClass =
    accent === "amber"
      ? "text-amber-600 dark:text-amber-400"
      : accent === "emerald"
      ? "text-emerald-600 dark:text-emerald-400"
      : "";
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-900">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`text-3xl font-bold mt-1 ${accentClass}`}>{value}</div>
    </div>
  );
}
