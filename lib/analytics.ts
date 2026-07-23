import type { Card, Session, SessionResult } from "@/types";

export type HistEntry = { result: SessionResult; t: string };
export type CardHistory = Map<string, HistEntry[]>;

export function buildCardHistory(sessions: Session[]): CardHistory {
  const m: CardHistory = new Map();
  for (const s of sessions) {
    for (const r of s.results ?? []) {
      const arr = m.get(r.cardId) ?? [];
      arr.push({ result: r, t: s.completedAt });
      m.set(r.cardId, arr);
    }
  }
  for (const h of m.values()) h.sort((a, b) => a.t.localeCompare(b.t));
  return m;
}

export function latestPerCard(h: CardHistory): Map<string, SessionResult> {
  const m = new Map<string, SessionResult>();
  for (const [cid, hist] of h) if (hist.length) m.set(cid, hist[hist.length - 1].result);
  return m;
}

export function overallAccuracy(h: CardHistory): number {
  const latest = [...latestPerCard(h).values()];
  if (!latest.length) return 0;
  return Math.round((latest.filter((r) => r.correct).length / latest.length) * 100);
}

export function cardTrend(hist: { result: SessionResult }[]): -1 | 0 | 1 | null {
  if (hist.length < 2) return null;
  const latest = hist[hist.length - 1].result.correct ? 1 : 0;
  const prior = hist[hist.length - 2].result.correct ? 1 : 0;
  return (latest - prior) as -1 | 0 | 1;
}

export function tagTrend(cardIds: string[], h: CardHistory): number | null {
  const trends: number[] = [];
  for (const id of cardIds) {
    const t = cardTrend(h.get(id) ?? []);
    if (t !== null) trends.push(t);
  }
  if (!trends.length) return null;
  return Math.round((trends.reduce((a, b) => a + b, 0) / trends.length) * 100);
}

export interface VideoStat {
  videoId: string;
  title: string;
  total: number;
  correct: number;
  accuracy: number;
}

/**
 * Accuracy grouped by the source video a card was captured from. Uses
 * latest-per-card (same invariant as every other accuracy metric); skips
 * cards with no `source`. Sorted weakest-first so the videos needing
 * revision surface at the top.
 */
export function perVideoStats(cards: Card[], h: CardHistory): VideoStat[] {
  const latest = latestPerCard(h);
  const byVideo = new Map<string, { title: string; total: number; correct: number }>();
  for (const c of cards) {
    const vid = c.source?.videoId;
    if (!vid) continue;
    const res = latest.get(c.id);
    if (!res) continue;
    const row = byVideo.get(vid) ?? { title: c.source!.title ?? vid, total: 0, correct: 0 };
    row.total += 1;
    if (res.correct) row.correct += 1;
    byVideo.set(vid, row);
  }
  return [...byVideo.entries()]
    .map(([videoId, r]) => ({
      videoId,
      title: r.title,
      total: r.total,
      correct: r.correct,
      accuracy: r.total ? Math.round((r.correct / r.total) * 100) : 0,
    }))
    .sort((a, b) => a.accuracy - b.accuracy);
}
