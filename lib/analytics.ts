import type { Session, SessionResult } from "@/types";

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
