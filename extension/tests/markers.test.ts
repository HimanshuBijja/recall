import { expect, test } from "vitest";
import { shapeCss, filterVisible } from "../src/content/markers";
import { DEFAULT_SETTINGS } from "../src/shared/config";

test("triangle uses clip-path", () => {
  expect(shapeCss("triangle")).toContain("clip-path");
});
test("filterVisible drops hidden kinds", () => {
  const s = structuredClone(DEFAULT_SETTINGS);
  s.kinds.flash.visible = false;
  const rows = [
    { id: "1", kind: "mcq" as const, timestamp: 1, marker: s.kinds.mcq.marker },
    { id: "2", kind: "flash" as const, timestamp: 2, marker: s.kinds.flash.marker },
  ];
  expect(filterVisible(rows, s).map((r) => r.id)).toEqual(["1"]);
});
