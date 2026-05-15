import { NextRequest } from "next/server";
import { readDb, writeDb } from "@/lib/db";
import type { Session } from "@/types";

export async function GET() {
  return Response.json(readDb<Session>("sessions.json"));
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Partial<Session>;
  if (!body.results || !Array.isArray(body.results)) {
    return Response.json({ error: "results array required" }, { status: 400 });
  }
  const sessions = readDb<Session>("sessions.json");
  const total = body.results.length || 1;
  const correct = body.results.filter((r) => r.correct).length;
  const session: Session = {
    id: crypto.randomUUID(),
    tagIds: body.tagIds ?? [],
    results: body.results,
    score: Math.round((correct / total) * 100),
    completedAt: new Date().toISOString(),
  };
  sessions.push(session);
  writeDb("sessions.json", sessions);
  return Response.json(session, { status: 201 });
}
