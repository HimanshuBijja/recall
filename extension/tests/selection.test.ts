import { expect, test } from "vitest";
import { readSelection, buildWebSource } from "../src/web/selection";

function fakeWindow(selectionText: string, href = "https://example.com/page"): Window {
  return {
    getSelection: () => ({ toString: () => selectionText }),
    location: { href },
  } as unknown as Window;
}

function fakeDoc(title: string, siteName?: string): Document {
  const doc = document.implementation.createHTMLDocument(title);
  if (siteName) {
    const meta = doc.createElement("meta");
    meta.setAttribute("property", "og:site_name");
    meta.setAttribute("content", siteName);
    doc.head.append(meta);
  }
  return doc;
}

test("readSelection returns the trimmed selection with page metadata", () => {
  const snap = readSelection(fakeWindow("  hello world  "), fakeDoc("My Page", "MDN"));
  expect(snap).toEqual({
    text: "hello world",
    url: "https://example.com/page",
    title: "My Page",
    siteName: "MDN",
  });
});

test("readSelection falls back to the hostname when og:site_name is absent", () => {
  const snap = readSelection(fakeWindow("text", "https://developer.mozilla.org/docs"), fakeDoc("Docs"));
  expect(snap?.siteName).toBe("developer.mozilla.org");
});

test("readSelection returns null for an empty or whitespace-only selection", () => {
  expect(readSelection(fakeWindow(""), fakeDoc("t"))).toBeNull();
  expect(readSelection(fakeWindow("   \n  "), fakeDoc("t"))).toBeNull();
});

test("buildWebSource produces a web-typed source with a truncated excerpt", () => {
  const long = "x".repeat(900);
  const src = buildWebSource(
    { text: long, url: "https://example.com/p", title: "T", siteName: "S" },
    () => "2026-07-25T00:00:00.000Z",
  );
  expect(src.type).toBe("web");
  expect(src.url).toBe("https://example.com/p");
  expect(src.title).toBe("T");
  expect(src.siteName).toBe("S");
  expect(src.capturedAt).toBe("2026-07-25T00:00:00.000Z");
  expect(src.excerpt).toHaveLength(400);
});
