import { expect, test } from "vitest";
import { projectPath, branchFromNew } from "@/lib/fsrs-preview";
import { toGeneratorParameters, DEFAULT_FSRS_SETTINGS } from "@/lib/settings";

const params = toGeneratorParameters(DEFAULT_FSRS_SETTINGS);
const start = new Date("2026-01-01T00:00:00Z");

test("projectPath returns one row per rep", () => {
  const rows = projectPath(params, ["good"], 5, start);
  expect(rows).toHaveLength(5);
  expect(rows.map((r) => r.rep)).toEqual([1, 2, 3, 4, 5]);
});

test("all-Easy path intervals grow and reach Review state", () => {
  const rows = projectPath(params, ["easy"], 5, start);
  for (let i = 1; i < rows.length; i++) {
    expect(rows[i].intervalDays).toBeGreaterThan(rows[i - 1].intervalDays);
  }
  expect(rows[rows.length - 1].state).toBe("Review");
});

test("all-Good path eventually graduates past the learning steps", () => {
  const rows = projectPath(params, ["good"], 6, start);
  expect(rows.some((r) => r.state === "Review")).toBe(true);
  expect(rows[rows.length - 1].intervalDays).toBeGreaterThan(1);
});

test("branchFromNew orders Again <= Hard <= Good <= Easy", () => {
  const branch = branchFromNew(params, start);
  const by = Object.fromEntries(branch.map((b) => [b.rating, b.intervalDays]));
  expect(by.again).toBeLessThanOrEqual(by.hard);
  expect(by.hard).toBeLessThanOrEqual(by.good);
  expect(by.good).toBeLessThanOrEqual(by.easy);
});

test("lower retention yields longer intervals than higher retention", () => {
  const low = toGeneratorParameters({ ...DEFAULT_FSRS_SETTINGS, request_retention: 0.8 });
  const high = toGeneratorParameters({ ...DEFAULT_FSRS_SETTINGS, request_retention: 0.95 });
  const lowRows = projectPath(low, ["good"], 4, start);
  const highRows = projectPath(high, ["good"], 4, start);
  const lowLast = lowRows[lowRows.length - 1].intervalDays;
  const highLast = highRows[highRows.length - 1].intervalDays;
  expect(lowLast).toBeGreaterThan(highLast);
});
