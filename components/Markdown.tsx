"use client";
import React, { useMemo } from "react";
import { marked } from "marked";

export function Markdown({
  text,
  className = "",
  inline = false,
  highlightQuery = "",
}: {
  text: string;
  className?: string;
  inline?: boolean;
  highlightQuery?: string;
}) {
  const html = useMemo(() => {
    if (!text) return "";
    try {
      // Parse markdown to HTML using GFM spec
      let rawHtml = inline
        ? (marked.parseInline(text) as string)
        : (marked.parse(text, { gfm: true, breaks: true }) as string);

      if (highlightQuery && highlightQuery.trim()) {
        const escaped = highlightQuery.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(`(?![^<]*>)(${escaped})`, "gi");
        rawHtml = rawHtml.replace(
          regex,
          '<mark class="bg-amber-400/35 text-amber-200 border-b border-amber-400 font-bold px-0.5 rounded">$1</mark>'
        );
      }
      return rawHtml;
    } catch (e) {
      console.error("[Markdown] parsing error:", e);
      return text;
    }
  }, [text, inline, highlightQuery]);

  if (inline) {
    return (
      <span
        className={`inline-markdown ${className}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <div
      className={`prose-markdown ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
