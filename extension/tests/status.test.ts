import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createStatusPill, STAGE_TEXT } from "../src/content/status";

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = "";
});
afterEach(() => vi.useRealTimers());

test("pill mounts, reflects stage text, and auto-removes after a terminal stage", () => {
  const pill = createStatusPill();
  pill.set("capturing");
  expect(pill.el.textContent).toContain(STAGE_TEXT.capturing);
  expect(document.body.contains(pill.el)).toBe(true);

  pill.set("generating");
  expect(pill.el.textContent).toContain(STAGE_TEXT.generating);

  pill.set("error", "boom");
  expect(pill.el.textContent).toContain("boom");
  vi.advanceTimersByTime(2000);
  expect(document.body.contains(pill.el)).toBe(false);
});

test("in-progress stages do not auto-remove", () => {
  const pill = createStatusPill();
  pill.set("generating");
  vi.advanceTimersByTime(5000);
  expect(document.body.contains(pill.el)).toBe(true);
  pill.remove();
});
