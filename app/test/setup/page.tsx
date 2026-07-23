import { readDb } from "@/lib/db";
import type { Card, Tag } from "@/types";
import { TestSetup } from "./TestSetup";

export const dynamic = "force-dynamic";

export default async function TestSetupPage() {
  const tags = await readDb<Tag>("tags.json");
  const cards = await readDb<Card>("cards.json");
  return <TestSetup tags={tags} cards={cards} />;
}
