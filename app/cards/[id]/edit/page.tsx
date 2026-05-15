import { notFound } from "next/navigation";
import { readDb } from "@/lib/db";
import type { Card, Tag } from "@/types";
import { CardForm } from "@/components/CardForm";

export const dynamic = "force-dynamic";

export default async function EditCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cards = readDb<Card>("cards.json");
  const card = cards.find((c) => c.id === id);
  if (!card) notFound();
  const tags = readDb<Tag>("tags.json");
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Edit card</h1>
      <CardForm initial={card} tags={tags} />
    </div>
  );
}
