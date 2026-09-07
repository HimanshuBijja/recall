import { readDb } from "@/lib/db";
import type { Card, Group, Subject, Tag } from "@/types";
import type { NoteBook } from "@/types/notes";
import { NotesHubClient } from "./NotesHubClient";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  const notebooks = await readDb<NoteBook>("notes.json");
  const groups = await readDb<Group>("groups.json");
  const tags = await readDb<Tag>("tags.json");
  const cards = await readDb<Card>("cards.json");

  return (
    <NotesHubClient
      initialNotebooks={notebooks}
      groups={groups}
      tags={tags}
      cards={cards}
    />
  );
}
