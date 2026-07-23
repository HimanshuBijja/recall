import { expect, test } from "vitest";
import { validateShortcut } from "../src/options/options";

test("rejects a duplicate", () => {
  expect(validateShortcut("Alt+Shift+Q", ["Alt+Shift+Q"])).toMatch(/already/i);
});
test("rejects reserved Ctrl+B", () => {
  expect(validateShortcut("Ctrl+B", [])).toMatch(/reserved/i);
});
test("requires a modifier", () => {
  expect(validateShortcut("Q", [])).toMatch(/modifier/i);
});
test("accepts a good combo", () => {
  expect(validateShortcut("Alt+Shift+Z", ["Alt+Shift+Q"])).toBeNull();
});
