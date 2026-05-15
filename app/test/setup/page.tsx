import { readDb } from "@/lib/db";
import type { Card, Tag } from "@/types";
import { TestSetup } from "./TestSetup";

export const dynamic = "force-dynamic";

export default function TestSetupPage() {
  const tags = readDb<Tag>("tags.json");
  const cards = readDb<Card>("cards.json");
  return <TestSetup tags={tags} cards={cards} />;
}
