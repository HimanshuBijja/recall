import { NextRequest } from "next/server";
import { readDb, writeDb } from "@/lib/db";
import type { NoteBook } from "@/types/notes";

export const dynamic = "force-dynamic";

export async function GET() {
  const notebooks = await readDb<NoteBook>("notes.json");
  return Response.json(notebooks);
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Partial<NoteBook>;
  if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }

  const groupIds = Array.isArray(body.groupIds) ? body.groupIds.map(String) : [];
  const notebooks = await readDb<NoteBook>("notes.json");

  const newNotebook: NoteBook = {
    id: crypto.randomUUID(),
    name: body.name.trim(),
    description: typeof body.description === "string" ? body.description.trim() : undefined,
    groupIds,
    createdAt: new Date().toISOString(),
  };

  notebooks.push(newNotebook);
  await writeDb("notes.json", notebooks);

  return Response.json(newNotebook, { status: 201 });
}
