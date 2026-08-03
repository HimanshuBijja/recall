"use client";
import React, { useMemo } from "react";
import { marked } from "marked";

export function Markdown({ text, className = "" }: { text: string; className?: string }) {
  const html = useMemo(() => {
    if (!text) return "";
    try {
      // Parse markdown to HTML using GFM spec
      return marked.parse(text, { gfm: true, breaks: true }) as string;
    } catch (e) {
      console.error("[Markdown] parsing error:", e);
      return text;
    }
  }, [text]);

  return (
    <div
      className={`prose-markdown ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
