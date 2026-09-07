import { readDb } from "@/lib/db";
import type { Card, Group, Tag } from "@/types";
import type { NoteBook } from "@/types/notes";
import { NotebookIndexClient } from "./NotebookIndexClient";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function NotebookIndexPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const notebooks = await readDb<NoteBook>("notes.json");
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

  const groups = await readDb<Group>("groups.json");
  const tags = await readDb<Tag>("tags.json");
  const cards = await readDb<Card>("cards.json");

  return (
    <NotebookIndexClient
      initialNotebook={notebook}
      groups={groups}
      tags={tags}
      cards={cards}
    />
  );
}
