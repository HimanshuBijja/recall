import { describe, expect, test } from "vitest";
import { extractVideoId, cleanDocumentTitle, thumbnailFor, getPageMeta } from "../src/content/metadata";

describe("metadata helpers", () => {
  test("extracts video id from watch url", () => {
    expect(extractVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s")).toBe("dQw4w9WgXcQ");
    expect(extractVideoId("https://www.youtube.com/feed/subscriptions")).toBeNull();
  });
  test("strips ' - YouTube' suffix from document title", () => {
    expect(cleanDocumentTitle("DBMS Lecture 5 - YouTube")).toBe("DBMS Lecture 5");
    expect(cleanDocumentTitle("Plain title")).toBe("Plain title");
  });
  test("builds hqdefault thumbnail url", () => {
    expect(thumbnailFor("abc")).toBe("https://i.ytimg.com/vi/abc/hqdefault.jpg");
  });

  test("getPageMeta prefers #owner channel over earlier ytd-channel-name elements", () => {
    // A decoy channel link (e.g. a commenter/recommendation) appears BEFORE
    // the owner block in document order — it must not win.
    document.body.innerHTML = `
      <ytd-channel-name><a href="/@decoy">Kika Kim</a></ytd-channel-name>
      <div id="owner">
        <ytd-channel-name><a href="/@real">Physics Wallah</a></ytd-channel-name>
      </div>`;
    const loc = { href: "https://www.youtube.com/watch?v=abc123" } as Location;
    const meta = getPageMeta(loc, document);
    expect(meta?.channel).toBe("Physics Wallah");
  });
});
