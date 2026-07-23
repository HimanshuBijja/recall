import { expect, test } from "vitest";
import { cardFingerprint, findDuplicates, applyBulkTags } from "@/lib/import-dedupe";

test("fingerprint ignores case/whitespace", () => {
  expect(cardFingerprint({ kind: "mcq", question: " Big-O? " }))
    .toBe(cardFingerprint({ kind: "mcq", question: "big-o?" }));
});

test("findDuplicates flags matching indices", () => {
  const dup = findDuplicates(
    [{ kind: "mcq", question: "Big-O?" }, { kind: "flash", question: "New" }],
    [{ kind: "mcq", question: "big-o?" }],
  );
  expect([...dup]).toEqual([0]);
});

test("applyBulkTags union-merges case-insensitively", () => {
  const out = applyBulkTags([{ tags: ["algo"] }, { tags: [] }], ["Algo", "video"]);
  expect(out[0].tags.sort()).toEqual(["algo", "video"]);
  expect(out[1].tags.sort()).toEqual(["algo", "video"]);
});
