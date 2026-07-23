import { expect, test } from "vitest";
import { captureFrame } from "../src/content/capture";

test("captureFrame throws on a zero-size video", () => {
  const fake = { videoWidth: 0, videoHeight: 0 } as HTMLVideoElement;
  expect(() => captureFrame(fake)).toThrow();
});
