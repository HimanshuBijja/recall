import { describe, expect, it } from "vitest";
import { gradeMulti } from "./multi";

describe("gradeMulti", () => {
  it("is correct only when picked set equals correct set", () => {
    expect(gradeMulti(["TCP", "UDP"], ["UDP", "TCP"])).toBe(true); // order-independent
    expect(gradeMulti(["TCP", "UDP"], ["TCP"])).toBe(false); // missing one
    expect(gradeMulti(["TCP", "UDP"], ["TCP", "UDP", "HTTP"])).toBe(false); // extra
    expect(gradeMulti(["TCP"], ["UDP"])).toBe(false);
  });
  it("trims and ignores blank picks; empty correct set is never correct", () => {
    expect(gradeMulti([" TCP ", "UDP"], ["TCP", " UDP", ""])).toBe(true);
    expect(gradeMulti([], [])).toBe(false);
  });
});
