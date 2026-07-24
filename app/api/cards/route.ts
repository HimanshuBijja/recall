import { NextRequest } from "next/server";
import { readDb, writeDb } from "@/lib/db";
import type { Card, Tag, Group } from "@/types";
import { isVideoSource, isWebSource } from "@/lib/source";

import { buildCardFromInput } from "./validate";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const tag = params.get("tag");
  const videoId = params.get("videoId");
  const cards = await readDb<Card>("cards.json");
  if (videoId) {
    return Response.json(
      cards.flatMap((c) => {
        const s = c.source;
        if (!isVideoSource(s) || s.videoId !== videoId) return [];
        return [{ id: c.id, kind: c.kind ?? "mcq", timestamp: s.timestamp, marker: s.marker }];
      }),
    );
  }
  const filtered = tag ? cards.filter((c) => c.tags.includes(tag)) : cards;
  return Response.json(filtered);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { card: parsedCard, error } = buildCardFromInput(body);
  if (error) {
    return Response.json({ error }, { status: 400 });
  }

  const tags = await readDb<Tag>("tags.json");
  const tagByName = new Map(tags.map((t) => [t.name?.toLowerCase() || "", t.id]));
  const tagIdsSet = new Set(tags.map((t) => t.id));
  const resolvedTagIds: string[] = [];
  let tagsChanged = false;

  for (const tInput of parsedCard!.tags) {
    const trimmed = tInput.trim();
    if (!trimmed) continue;
    if (tagIdsSet.has(trimmed)) {
      resolvedTagIds.push(trimmed);
      continue;
    }
    const lowerName = trimmed.toLowerCase();
    const existingId = tagByName.get(lowerName);
    if (existingId) {
      resolvedTagIds.push(existingId);
    } else {
      const newTag: Tag = {
        id: crypto.randomUUID(),
        name: trimmed,
        parents: [],
      };
      tags.push(newTag);
      tagByName.set(lowerName, newTag.id);
      tagIdsSet.add(newTag.id);
      resolvedTagIds.push(newTag.id);
      tagsChanged = true;
    }
  }

  if (tagsChanged) {
    await writeDb("tags.json", tags);
  }

  const cards = await readDb<Card>("cards.json");
  const card: Card = {
    ...parsedCard!,
    tags: resolvedTagIds,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  cards.push(card);
  await writeDb("cards.json", cards);
  // Auto-group by video if this came from a video capture.
  const videoSource = isVideoSource(card.source) ? card.source : null;
  if (videoSource) {
    const groups = await readDb<Group>("groups.json");
    const groupExists = groups.some((g) => g.videoId === videoSource.videoId);
    if (!groupExists) {
      const newGroup: Group = {
        id: crypto.randomUUID(),
        name: videoSource.title || "Video Group",
        tagIds: [],
        createdAt: new Date().toISOString(),
        videoId: videoSource.videoId,
        videoUrl: videoSource.url,
      };
      groups.push(newGroup);
      await writeDb("groups.json", groups);
    }
  }

  // Auto-group by website if this came from a web capture.
  const webSource = isWebSource(card.source) ? card.source : null;
  if (webSource) {
    const groups = await readDb<Group>("groups.json");
    const groupExists = groups.some((g) => g.webUrl === webSource.url);
    if (!groupExists) {
      const gName = typeof body.groupName === "string" ? body.groupName.trim() : "";
      const newGroup: Group = {
        id: crypto.randomUUID(),
        name: gName || webSource.title || "Web Group",
        tagIds: [],
        createdAt: new Date().toISOString(),
        webUrl: webSource.url,
      };
      groups.push(newGroup);
      await writeDb("groups.json", groups);
    }
  }

  return Response.json(card, { status: 201 });
}
