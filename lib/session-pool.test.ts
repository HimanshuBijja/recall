import { expect, test } from "vitest";
import { selectPool } from "@/lib/session-pool";
import type { Card } from "@/types";

const c = (id: string, tags: string[], difficulty = 3): Card => ({
  id, kind: "mcq", question: id, answer: "a", distractors: ["b","c","d"],
  explanation: "", hint: "", difficulty: difficulty as Card["difficulty"], tags, createdAt: "",
});

test("ids selects exactly those cards, ignoring difficulty", () => {
  const cards = [c("1", [], 1), c("2", [], 5), c("3", [], 3)];
  const pool = selectPool(cards, { ids: ["1","2"], minDiff: 3, maxDiff: 3 });
  expect(pool.map((p) => p.id).sort()).toEqual(["1","2"]);
});

test("tag + difficulty filtering when no ids", () => {
  const cards = [c("1", ["t"], 1), c("2", ["t"], 3), c("3", ["x"], 3)];
  const pool = selectPool(cards, { tagIds: ["t"], expanded: new Set(["t"]), minDiff: 2, maxDiff: 4 });
  expect(pool.map((p) => p.id)).toEqual(["2"]);
});

test("no filters returns all within difficulty", () => {
  const cards = [c("1", [], 1), c("2", [], 3)];
  expect(selectPool(cards, { minDiff: 2, maxDiff: 5 }).map((p)=>p.id)).toEqual(["2"]);
});
