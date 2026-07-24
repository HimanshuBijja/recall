import type { CardSource, VideoSource, WebSource } from "@/types";

export function isWebSource(s: CardSource | undefined): s is WebSource {
  return s?.type === "web";
}

export function isVideoSource(s: CardSource | undefined): s is VideoSource {
  return !!s && s.type !== "web" && typeof s.videoId === "string" && s.videoId.length > 0;
}
