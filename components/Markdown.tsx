"use client";
import React, { useMemo } from "react";
import { marked } from "marked";

export function Markdown({
  text,
  className = "",
  inline = false,
}: {
  text: string;
  className?: string;
  inline?: boolean;
}) {
  const html = useMemo(() => {
    if (!text) return "";
    try {
      // Parse markdown to HTML using GFM spec
      if (inline) {
        return marked.parseInline(text) as string;
      }
      return marked.parse(text, { gfm: true, breaks: true }) as string;
    } catch (e) {
      console.error("[Markdown] parsing error:", e);
      return text;
    }
  }, [text, inline]);

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
