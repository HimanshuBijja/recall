import { expect, test } from "vitest";
import { parseCloze, gradeCloze } from "@/lib/cloze";

test("parses ==blanks==", () => {
  const { segments, answers } = parseCloze("React by ==Facebook== in ==2013==.");
  expect(answers).toEqual(["Facebook", "2013"]);
  expect(segments).toEqual(["React by ", " in ", "."]);
});

test("no blanks -> empty answers", () => {
  expect(parseCloze("plain").answers).toEqual([]);
});

test("grade is case-insensitive + trimmed, all-or-nothing", () => {
  expect(gradeCloze(["Facebook","2013"], [" facebook ","2013"])).toBe(true);
  expect(gradeCloze(["Facebook","2013"], ["Meta","2013"])).toBe(false);
  expect(gradeCloze(["A"], [""])).toBe(false);
});
