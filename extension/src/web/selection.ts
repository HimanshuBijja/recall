import type { WebSourceMeta } from "../shared/types";

export interface SelectionSnapshot {
  text: string;
  url: string;
  title: string;
  siteName?: string;
}

const EXCERPT_CHARS = 400;

/**
 * Reads the live DOM selection rather than trusting the context-menu event's
 * `info.selectionText`, which Chrome truncates at roughly 1024 characters.
 */
export function readSelection(win: Window, doc: Document): SelectionSnapshot | null {
  const text = (win.getSelection()?.toString() ?? "").trim();
  if (!text) return null;

  const metaSite = doc.querySelector<HTMLMetaElement>('meta[property="og:site_name"]')?.content?.trim();
  let siteName = metaSite || undefined;
  if (!siteName) {
    try {
      siteName = new URL(win.location.href).hostname;
    } catch {
      siteName = undefined;
    }
  }

  return { text, url: win.location.href, title: doc.title, siteName };
}

export function buildWebSource(
  snap: SelectionSnapshot,
  now: () => string = () => new Date().toISOString(),
): WebSourceMeta {
  return {
    type: "web",
    url: snap.url,
    title: snap.title || undefined,
    siteName: snap.siteName,
    excerpt: snap.text.slice(0, EXCERPT_CHARS),
    capturedAt: now(),
  };
}
