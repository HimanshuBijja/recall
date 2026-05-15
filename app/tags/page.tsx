import { readDb } from "@/lib/db";
import type { Tag } from "@/types";
import { TagsManager } from "./TagsManager";

export const dynamic = "force-dynamic";

export default function TagsPage() {
  const tags = readDb<Tag>("tags.json");
  return <TagsManager initialTags={tags} />;
}
