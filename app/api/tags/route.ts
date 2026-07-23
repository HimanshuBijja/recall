import { NextRequest } from "next/server";
import { readDb, writeDb } from "@/lib/db";
import type { Tag } from "@/types";

export async function GET() {
  return Response.json(await readDb<Tag>("tags.json"));
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Partial<Tag>;
  if (!body.name) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }
  const tags = await readDb<Tag>("tags.json");
  const tag: Tag = {
    id: crypto.randomUUID(),
    name: body.name,
    parents: body.parents ?? [],
  };
  tags.push(tag);
  await writeDb("tags.json", tags);
  return Response.json(tag, { status: 201 });
}
