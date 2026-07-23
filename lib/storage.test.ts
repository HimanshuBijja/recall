import { expect, test } from "vitest";
import { parseDataUrl } from "@/lib/storage";

test("parseDataUrl splits mime + bytes", () => {
  // 1x1 transparent PNG
  const b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const { buffer, contentType } = parseDataUrl(`data:image/png;base64,${b64}`);
  expect(contentType).toBe("image/png");
  expect(buffer.length).toBeGreaterThan(10);
});

test("parseDataUrl rejects non-data URLs", () => {
  expect(() => parseDataUrl("https://x/y.png")).toThrow();
});
