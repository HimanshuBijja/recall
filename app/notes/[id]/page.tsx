import { readDb } from "@/lib/db";
import type { Card, Group, Tag } from "@/types";
import type { NoteBook } from "@/types/notes";
import { resolveGroupCards } from "@/lib/due";
import { NotesReaderClient } from "./NotesReaderClient";
import Link from "next/link";

export const dynamic = "force-dynamic";

export interface ChapterCardItem {
  card: Card;
  chapterNum: number;
  groupName: string;
  groupId: string;
}

export default async function NotesReaderPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  const notebooks = await readDb<NoteBook>("notes.json");
  const groups = await readDb<Group>("groups.json");
  const tags = await readDb<Tag>("tags.json");
  const cards = await readDb<Card>("cards.json");

  const notebook = notebooks.find((n) => n.id === id);

  if (!notebook) {
    return (
      <div className="max-w-md mx-auto text-center space-y-6 py-12">
        <h1 className="text-2xl font-bold">Notebook Not Found</h1>
        <Link href="/notes" className="px-4 py-2 bg-indigo-600 text-white rounded text-xs uppercase font-bold">
          ← Back to Notebooks
        </Link>
      </div>
    );
  }

  const groupMap = new Map(groups.map((g) => [g.id, g]));

  // Build resolved chapter cards list preserving user's configured chapter sequence
  const chapterCards: ChapterCardItem[] = [];
  const chaptersSummary: { chapterNum: number; groupId: string; groupName: string; startIndex: number }[] = [];

  notebook.groupIds.forEach((gid, idx) => {
    const g = groupMap.get(gid);
    if (!g) return;
    const gCards = resolveGroupCards(g, cards, tags);

    // Sort cards inside group by timestamp ascending
    const sorted = [...gCards].sort((a, b) => {
      const timeA = a.source?.timestamp ?? Number.MAX_SAFE_INTEGER;
      const timeB = b.source?.timestamp ?? Number.MAX_SAFE_INTEGER;
      if (timeA !== timeB) return timeA - timeB;
      return a.createdAt.localeCompare(b.createdAt);
    });

    chaptersSummary.push({
      chapterNum: idx + 1,
      groupId: g.id,
      groupName: g.name,
      startIndex: chapterCards.length,
    });

    sorted.forEach((c) => {
      chapterCards.push({
        card: c,
        chapterNum: idx + 1,
        groupName: g.name,
        groupId: g.id,
      });
    });
  });

  return (
    <NotesReaderClient
      notebook={notebook}
      chapterCards={chapterCards}
      chaptersSummary={chaptersSummary}
      tags={tags}
    />
  );
}
