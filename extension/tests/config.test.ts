import { expect, test } from "vitest";
import { matchShortcut, DEFAULT_SETTINGS } from "../src/shared/config";

function key(opts: Partial<KeyboardEvent>): KeyboardEvent {
  return opts as KeyboardEvent;
}

test("matchShortcut parses modifiers + key", () => {
  expect(matchShortcut(key({ altKey: true, shiftKey: true, key: "q" }), "Alt+Shift+Q")).toBe(true);
  expect(matchShortcut(key({ altKey: true, shiftKey: false, key: "q" }), "Alt+Shift+Q")).toBe(false);
  expect(matchShortcut(key({ altKey: true, shiftKey: true, key: "f" }), "Alt+Shift+Q")).toBe(false);
});

test("defaults cover all six kinds", () => {
  expect(Object.keys(DEFAULT_SETTINGS.kinds).sort()).toEqual(["cloze", "flash", "match", "mcq", "multi", "tf-sort"]);
  expect(DEFAULT_SETTINGS.kinds.mcq.shortcut).toBe("Alt+Shift+Q");
});
