import { readDb } from "@/lib/db";
import type { Group } from "@/types";
import { NewSubjectClient } from "./NewSubjectClient";

export const dynamic = "force-dynamic";

export default async function NewSubjectPage() {
  const groups = await readDb<Group>("groups.json");

  return <NewSubjectClient groups={groups} />;
}
