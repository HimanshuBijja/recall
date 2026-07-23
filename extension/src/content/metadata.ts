export function extractVideoId(url: string): string | null {
  const u = new URL(url);
  return u.pathname === "/watch" ? u.searchParams.get("v") : null;
}

export function cleanDocumentTitle(title: string): string {
  return title.replace(/ - YouTube$/, "");
}

export function thumbnailFor(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export interface PageMeta {
  videoId: string;
  url: string;
  title: string;
  channel: string;
  thumbnailUrl: string;
}

export function getPageMeta(loc: Location, doc: Document): PageMeta | null {
  const videoId = extractVideoId(loc.href);
  if (!videoId) return null;
  const titleEl = doc.querySelector("h1.ytd-watch-metadata yt-formatted-string");
  // Sequential fallback on purpose: a comma selector returns the first match
  // in DOCUMENT order, letting a commenter/recommendation channel link beat
  // the video owner's.
  const channelEl =
    doc.querySelector("#owner ytd-channel-name a") ?? doc.querySelector("ytd-watch-metadata ytd-channel-name a");
  return {
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title: titleEl?.textContent?.trim() || cleanDocumentTitle(doc.title),
    channel: channelEl?.textContent?.trim() || "Unknown channel",
    thumbnailUrl: thumbnailFor(videoId),
  };
}
