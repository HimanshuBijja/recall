import { NextRequest } from "next/server";
import { readDb, writeDb } from "@/lib/db";
import type { Group } from "@/types";

export async function GET() {
  return Response.json(readDb<Group>("groups.json"));
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Partial<Group>;
  if (!body.name?.trim()) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }
  const groups = readDb<Group>("groups.json");
  const group: Group = {
    id: crypto.randomUUID(),
    name: body.name.trim(),
    tagIds: Array.isArray(body.tagIds) ? body.tagIds : [],
    createdAt: new Date().toISOString(),
  };
  groups.push(group);
  writeDb("groups.json", groups);
  return Response.json(group, { status: 201 });
}
