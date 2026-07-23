import { readDb } from "@/lib/db";
import type { Tag } from "@/types";
import { CardForm } from "@/components/CardForm";

export const dynamic = "force-dynamic";

export default async function NewCardPage() {
  const tags = await readDb<Tag>("tags.json");
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">New card</h1>
      <CardForm tags={tags} />
    </div>
  );
}
