import Link from "next/link";
import { readDb } from "@/lib/db";
import type { Card, Group, Session, Tag, Review } from "@/types";
import { TagTree } from "@/components/TagTree";
import { GroupQuickLaunch } from "@/components/GroupQuickLaunch";
import { ExportAllButton } from "@/components/ExportAllButton";
import { exportBundle } from "@/lib/export";
import { getReviewsSummary } from "@/lib/due";
import { buildCardHistory, latestPerCard } from "@/lib/analytics";

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

export default async function Home() {
  const cards = await readDb<Card>("cards.json");
  const tags = await readDb<Tag>("tags.json");
  const sessions = await readDb<Session>("sessions.json");
  const groups = await readDb<Group>("groups.json");
  const reviews = await readDb<Review>("reviews.json");

  const summary = getReviewsSummary(cards, reviews, new Date());

  // Tag accuracy — uses the LATEST attempt per card so retries reflect improvement.
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const cardHistory = buildCardHistory(sessions);
  const latest = latestPerCard(cardHistory);
  const buckets = new Map<string, { total: number; correct: number }>();
  for (const [cid, result] of latest) {
    const card = cardById.get(cid);
    if (!card) continue;
    for (const tagId of card.tags) {
      const b = buckets.get(tagId) ?? { total: 0, correct: 0 };
      b.total += 1;
      if (result.correct) b.correct += 1;
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
    <div className="space-y-6">
      {/* Early Access / Protocol info */}
      <div className="flex items-center gap-3 text-xs tracking-widest text-muted uppercase font-semibold">
        <span className="w-6 h-[2px] bg-accent" />
        Protocol 01 // Revision System
      </div>

      {/* Main Headline */}
      <h1
        className="cinematic-headline text-[11.5vw] md:text-[8vw] sm:text-[11.5vw] leading-[0.85] font-display font-bold tracking-tight mb-8"
        data-text="RECALL"
      >
        RECALL
      </h1>

      <hr className="border-t border-divider mb-8" />

      {/* 12-Column Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        {/* Left Column (span 5) */}
        <div className="md:col-span-5 space-y-8">
          <div className="space-y-4">
            <p className="text-xl font-light text-foreground leading-relaxed uppercase tracking-wide">
              Recall is a protocol for quiet memorization. Spaced repetition without the noise. Local-first, off-the-grid, embedded directly in your youtube workflows.
            </p>

            <div className="flex items-center gap-2.5 text-xs font-bold uppercase tracking-wider text-accent">
              <span className="w-2.5 h-2.5 rounded-full bg-accent animate-pulse" />
              Streak: {streak} Days Active
            </div>
          </div>

          {/* Stats Summary Table */}
          <div className="grid grid-cols-3 gap-4 border-t border-divider pt-6">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted mb-1 font-semibold">Total Cards</div>
              <div className="text-2xl font-bold font-display text-foreground">{cards.length}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted mb-1 font-semibold">Study Groups</div>
              <div className="text-2xl font-bold font-display text-foreground">{groups.length}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted mb-1 font-semibold">Weak Topics</div>
              <div className="text-2xl font-bold font-display text-foreground">{weakTags.length}</div>
            </div>
          </div>

          {/* Tag Tree Component Box */}
          <div className="border border-border p-4 bg-zinc-950/20 space-y-3 rounded-[4px]">
            <div className="flex items-baseline justify-between">
              <h3 className="text-xs uppercase tracking-wider text-muted font-bold">Tags Index</h3>
              <Link href="/tags" className="text-xs text-accent hover:underline font-bold uppercase tracking-wider">
                Manage
              </Link>
            </div>
            <TagTree tags={tags} searchable />
          </div>
        </div>

        {/* Vertical Divider spacer */}
        <div className="hidden md:block md:col-span-1 border-l border-divider h-full justify-self-center" />

        {/* Right Column (span 6) */}
        <div className="md:col-span-6 space-y-6">
          {/* Spaced Repetition Panel */}
          <div className="border border-border p-6 bg-zinc-950/40 space-y-4 rounded-[4px]">
            <div className="space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-accent font-bold">Due Review Batch</div>
              <h2 className="text-lg font-bold uppercase font-display tracking-tight text-foreground flex items-center gap-2">
                Spaced Repetition
                {summary.due > 0 && <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />}
              </h2>
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted font-mono pt-1">
                <span>{summary.due} due</span>
                <span>·</span>
                <span>{summary.overdue} overdue</span>
                <span>·</span>
                <span>{summary.new} new</span>
              </div>
            </div>

            <Link
              href="/test/session?due=1"
              className="w-full inline-flex items-center justify-center px-4 py-3 bg-accent text-background font-bold text-xs uppercase tracking-widest transition-colors duration-150 hover:bg-opacity-90 rounded-[4px]"
            >
              Review Due Cards ({summary.due}) →
            </Link>
          </div>

          {/* Quick Links Grid */}
          <div className="grid grid-cols-3 gap-2">
            <Link
              href="/test/setup"
              className="border border-border px-3 py-4 text-center hover:bg-zinc-900/30 transition-colors flex flex-col justify-between h-24 rounded-[4px]"
            >
              <span className="text-left text-xs uppercase font-bold tracking-wider text-muted">Test</span>
              <span className="text-left text-sm font-bold text-foreground">Launch →</span>
            </Link>
            <Link
              href="/cards/new"
              className="border border-border px-3 py-4 text-center hover:bg-zinc-900/30 transition-colors flex flex-col justify-between h-24 rounded-[4px]"
            >
              <span className="text-left text-xs uppercase font-bold tracking-wider text-muted">Draft</span>
              <span className="text-left text-sm font-bold text-foreground">New Card →</span>
            </Link>
            <Link
              href="/groups"
              className="border border-border px-3 py-4 text-center hover:bg-zinc-900/30 transition-colors flex flex-col justify-between h-24 rounded-[4px]"
            >
              <span className="text-left text-xs uppercase font-bold tracking-wider text-muted">Groups</span>
              <span className="text-left text-sm font-bold text-foreground">Manage →</span>
            </Link>
          </div>

          {/* Study Groups */}
          {groups.length > 0 && (
            <div className="border border-border p-5 bg-zinc-950/20 space-y-3 rounded-[4px]">
              <div className="flex items-baseline justify-between">
                <h3 className="text-xs uppercase tracking-wider text-muted font-bold">Active Groups</h3>
                <Link href="/groups" className="text-xs text-accent hover:underline font-bold uppercase tracking-wider">
                  All →
                </Link>
              </div>
              <GroupQuickLaunch groups={groups} tags={tags} />
            </div>
          )}

          {/* Topics to Review (Weak tags) */}
          {weakTags.length > 0 && (
            <div className="border border-border p-5 bg-zinc-950/20 space-y-3 rounded-[4px]">
              <h3 className="text-xs uppercase tracking-wider text-muted font-bold">Review Topics</h3>
              <ul className="divide-y divide-divider">
                {weakTags.slice(0, 5).map(({ tag, accuracy, total }) => (
                  <li key={tag.id} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-foreground">{tag.name}</span>
                    <span className="text-accent font-mono font-semibold">
                      {Math.round(accuracy ?? 0)}% · {total} reviews
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Tools footer bar */}
          <div className="flex items-center justify-between pt-4 border-t border-divider text-xs">
            <div className="flex items-center gap-3">
              <span className="text-[10px] uppercase font-bold tracking-widest text-muted">Tools</span>
              <span className="w-1.5 h-1.5 rounded-full bg-divider" />
              <Link href="/import" className="text-accent hover:underline font-bold uppercase tracking-wider">
                Import
              </Link>
            </div>
            <ExportAllButton bundle={exportBundle(cards, tags, groups)} />
          </div>
        </div>
      </div>

      {/* Rotating Waitlist Badge */}
      <div className="fixed bottom-6 right-6 z-30 pointer-events-none hidden md:block">
        <div className="w-20 h-20 rounded-full border border-divider flex items-center justify-center bg-background/50 relative">
          <svg className="absolute w-full h-full animate-[spin_12s_linear_infinite]" viewBox="0 0 100 100">
            <path
              id="circlePath"
              d="M 50, 50 m -35, 0 a 35,35 0 1,1 70,0 a 35,35 0 1,1 -70,0"
              fill="none"
            />
            <text className="fill-divider text-[8px] font-display font-bold uppercase tracking-wider">
              <textPath href="#circlePath" startOffset="0%">
                • RECALL REVISION PROTOCOL • RECALL REVISION PROTOCOL
              </textPath>
            </text>
          </svg>
          <span className="text-accent text-sm leading-none font-bold">RE</span>
        </div>
      </div>
    </div>
  );
}
