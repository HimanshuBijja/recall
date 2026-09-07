import { readDb } from "@/lib/db";
import type { Card, Group, Subject, Tag } from "@/types";
import { resolveGroupCards, resolveSubjectCards } from "@/lib/due";
import { NotesReaderClient } from "./NotesReaderClient";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function NotesReaderPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const { id } = await props.params;
  const searchParams = await props.searchParams;
  const isSubject = searchParams.type === "subject";

  const subjects = await readDb<Subject>("subjects.json");
  const groups = await readDb<Group>("groups.json");
  const tags = await readDb<Tag>("tags.json");
  const cards = await readDb<Card>("cards.json");

  let title = "";
  let subTitle = "";
  let matchingCards: Card[] = [];

  if (isSubject) {
    const subject = subjects.find((s) => s.id === id);
    if (!subject) {
      return (
        <div className="max-w-md mx-auto text-center space-y-6 py-12">
          <h1 className="text-2xl font-bold">Notebook Not Found</h1>
          <Link href="/notes" className="px-4 py-2 bg-indigo-600 text-white rounded text-xs uppercase font-bold">
            ← Back to Notes
          </Link>
        </div>
      );
    }
    title = subject.name;
    subTitle = `Subject Notebook · ${subject.groupIds.length} chapters inside`;
    matchingCards = resolveSubjectCards(subject, groups, cards, tags);
  } else {
    const group = groups.find((g) => g.id === id);
    if (!group) {
      return (
        <div className="max-w-md mx-auto text-center space-y-6 py-12">
          <h1 className="text-2xl font-bold">Notebook Not Found</h1>
          <Link href="/notes" className="px-4 py-2 bg-indigo-600 text-white rounded text-xs uppercase font-bold">
            ← Back to Notes
          </Link>
        </div>
      );
    }
    title = group.name;
    subTitle = group.videoId
      ? "YouTube Lecture Notebook"
      : group.webUrl
      ? "Web Article Notebook"
      : "Tag Bundle Notebook";
    matchingCards = resolveGroupCards(group, cards, tags);
  }

  // Sort cards chronologically by video timestamp ascending, or createdAt
  const sortedCards = [...matchingCards].sort((a, b) => {
    const timeA = a.source?.timestamp ?? Number.MAX_SAFE_INTEGER;
    const timeB = b.source?.timestamp ?? Number.MAX_SAFE_INTEGER;
    if (timeA !== timeB) return timeA - timeB;
    return a.createdAt.localeCompare(b.createdAt);
  });

  return (
    <NotesReaderClient
      title={title}
      subTitle={subTitle}
      initialCards={sortedCards}
      tags={tags}
    />
  );
}
