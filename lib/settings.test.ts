import { expect, test } from "vitest";
import {
  DEFAULT_FSRS_SETTINGS,
  parseSteps,
  formatSteps,
  toGeneratorParameters,
  validateSettings,
} from "@/lib/settings";
import type { FsrsSettings } from "@/types";

test("parseSteps accepts valid tokens and trims", () => {
  expect(parseSteps("1m, 10m")).toEqual(["1m", "10m"]);
  expect(parseSteps(" 1h ,  1d ")).toEqual(["1h", "1d"]);
  expect(parseSteps("")).toEqual([]);
});

test("parseSteps rejects garbage", () => {
  expect(() => parseSteps("1x")).toThrow();
  expect(() => parseSteps("abc")).toThrow();
  expect(() => parseSteps("10")).toThrow();
});

test("formatSteps round-trips parseSteps", () => {
  const s = "1m, 10m";
  expect(formatSteps(parseSteps(s))).toBe(s);
});

test("toGeneratorParameters maps the practical fields", () => {
  const s: FsrsSettings = {
    ...DEFAULT_FSRS_SETTINGS,
    request_retention: 0.85,
    maximum_interval: 1000,
    enable_short_term: false,
  };
  const p = toGeneratorParameters(s);
  expect(p.request_retention).toBe(0.85);
  expect(p.maximum_interval).toBe(1000);
  expect(p.enable_short_term).toBe(false);
});

test("validateSettings enforces ranges", () => {
  expect(validateSettings(DEFAULT_FSRS_SETTINGS)).toBeNull();
  expect(validateSettings({ ...DEFAULT_FSRS_SETTINGS, request_retention: 0.5 })).toMatch(/retention/);
  expect(validateSettings({ ...DEFAULT_FSRS_SETTINGS, request_retention: 0.99 })).toMatch(/retention/);
  expect(validateSettings({ ...DEFAULT_FSRS_SETTINGS, maximum_interval: 0 })).toMatch(/interval/);
  expect(validateSettings({ ...DEFAULT_FSRS_SETTINGS, learning_steps: [] })).toMatch(/learning_steps/);
  expect(validateSettings({ ...DEFAULT_FSRS_SETTINGS, learning_steps: ["bad"] })).toBeTruthy();
});
