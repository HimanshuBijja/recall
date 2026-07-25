import { NextRequest } from "next/server";
import { readDb, writeDb } from "@/lib/db";
import type { Subject } from "@/types";

export async function GET() {
  return Response.json(await readDb<Subject>("subjects.json"));
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Partial<Subject>;
  if (!body.name?.trim()) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }
  const subjects = await readDb<Subject>("subjects.json");
  const subject: Subject = {
    id: crypto.randomUUID(),
    name: body.name.trim(),
    groupIds: Array.isArray(body.groupIds) ? body.groupIds : [],
    exempted: !!body.exempted,
    createdAt: new Date().toISOString(),
  };
  subjects.push(subject);
  await writeDb("subjects.json", subjects);
  return Response.json(subject, { status: 201 });
}
