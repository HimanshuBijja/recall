import { expect, test } from "vitest";
import { isVideoSource, isWebSource } from "@/lib/source";
import type { CardSource } from "@/types";

const video: CardSource = { videoId: "abc", url: "https://youtu.be/abc", timestamp: 12 };
const web: CardSource = { type: "web", url: "https://mdn.io/x", capturedAt: "2026-07-25T00:00:00.000Z" };

test("isVideoSource accepts a legacy source with no type field", () => {
  expect(isVideoSource(video)).toBe(true);
  expect(isWebSource(video)).toBe(false);
});

test("isWebSource accepts the web arm", () => {
  expect(isWebSource(web)).toBe(true);
  expect(isVideoSource(web)).toBe(false);
});

test("both guards reject undefined", () => {
  expect(isVideoSource(undefined)).toBe(false);
  expect(isWebSource(undefined)).toBe(false);
});

test("isVideoSource rejects a video-shaped source with an empty videoId", () => {
  expect(isVideoSource({ videoId: "", url: "u", timestamp: 0 } as CardSource)).toBe(false);
});
