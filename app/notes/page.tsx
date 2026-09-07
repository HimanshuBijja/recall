import { readDb } from "@/lib/db";
import type { Card, Group, Subject, Tag } from "@/types";
import { NotesHubClient } from "./NotesHubClient";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  const subjects = await readDb<Subject>("subjects.json");
  const groups = await readDb<Group>("groups.json");
  const tags = await readDb<Tag>("tags.json");
  const cards = await readDb<Card>("cards.json");

  return (
    <NotesHubClient
      subjects={subjects}
      groups={groups}
      tags={tags}
      cards={cards}
    />
  );
}
