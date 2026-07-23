import { expect, test } from "vitest";
import { buildCardHistory, latestPerCard, overallAccuracy, cardTrend, tagTrend, perVideoStats } from "@/lib/analytics";
import type { Card, Session } from "@/types";

const S = (id: string, at: string, results: [string, boolean][]): Session => ({
  id, tagIds: [], score: 0, completedAt: at,
  results: results.map(([cardId, correct]) => ({ cardId, correct, timeTaken: 1000, confidence: 2 })),
});

test("latest attempt wins for accuracy", () => {
  const sessions = [S("a","2026-01-01",[["c1",false]]), S("b","2026-01-02",[["c1",true]])];
  const h = buildCardHistory(sessions);
  expect(latestPerCard(h).get("c1")!.correct).toBe(true);
  expect(overallAccuracy(h)).toBe(100);
});

test("overallAccuracy is 0 with no attempts", () => {
  expect(overallAccuracy(new Map())).toBe(0);
});

test("cardTrend compares latest vs prior", () => {
  expect(cardTrend([{result:{cardId:"c",correct:false,timeTaken:1,confidence:1}},{result:{cardId:"c",correct:true,timeTaken:1,confidence:1}}])).toBe(1);
  expect(cardTrend([{result:{cardId:"c",correct:true,timeTaken:1,confidence:1}}])).toBeNull();
});

test("tagTrend averages per-card trend ×100", () => {
  const sessions = [S("a","2026-01-01",[["c1",false]]), S("b","2026-01-02",[["c1",true]])];
  const h = buildCardHistory(sessions);
  expect(tagTrend(["c1"], h)).toBe(100);
  expect(tagTrend(["cX"], h)).toBeNull();
});

test("perVideoStats groups by source video, weakest first", () => {
  const cards = [
    { id: "c1", source: { videoId: "v1", url: "", timestamp: 0, title: "Intro" } },
    { id: "c2", source: { videoId: "v1", url: "", timestamp: 0, title: "Intro" } },
    { id: "c3", source: { videoId: "v2", url: "", timestamp: 0, title: "Advanced" } },
    { id: "c4" },
  ] as Card[];
  const sessions = [S("s", "2026-01-01", [["c1", true], ["c2", false], ["c3", true]])];
  const stats = perVideoStats(cards, buildCardHistory(sessions));
  expect(stats.map((s) => s.videoId)).toEqual(["v1", "v2"]); // v1 50% before v2 100%
  expect(stats[0]).toMatchObject({ total: 2, correct: 1, accuracy: 50, title: "Intro" });
});
