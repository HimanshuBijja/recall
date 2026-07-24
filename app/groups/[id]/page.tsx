import { readDb } from "@/lib/db";
import type { Card, Group, Tag } from "@/types";
import { GroupDetailClient } from "./GroupDetailClient";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function GroupDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const groups = await readDb<Group>("groups.json");
  const group = groups.find((g) => g.id === id);

  if (!group) {
    return (
      <div className="max-w-md mx-auto text-center space-y-6 py-12">
        <div className="flex items-center justify-center gap-3 text-xs tracking-widest text-muted uppercase font-semibold">
          <span className="w-6 h-[2px] bg-accent" />
          404 Not Found
        </div>
        <h1 className="cinematic-headline text-[5vw] leading-[0.85] font-display font-bold tracking-tight mb-2" data-text="ERROR">
          ERROR
        </h1>
        <p className="text-sm text-muted uppercase tracking-wider">
          The requested study group could not be located in database.
        </p>
        <Link
          href="/groups"
          className="inline-flex items-center justify-center px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-widest transition-colors duration-150 rounded-[4px]"
        >
          Return to Groups
        </Link>
      </div>
    );
  }

  const tags = await readDb<Tag>("tags.json");
  const cards = await readDb<Card>("cards.json");

  return (
    <GroupDetailClient
      group={group}
      tags={tags}
      cards={cards}
    />
  );
}
