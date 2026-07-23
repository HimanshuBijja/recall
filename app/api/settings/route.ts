import { NextRequest } from "next/server";
import type { FsrsSettings } from "@/types";
import { readSettings, writeSettings, validateSettings, DEFAULT_FSRS_SETTINGS } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await readSettings());
}

export async function PUT(req: NextRequest) {
  const body = (await req.json()) as Partial<FsrsSettings>;
  const settings: FsrsSettings = { ...DEFAULT_FSRS_SETTINGS, ...body };
  const error = validateSettings(settings);
  if (error) {
    return Response.json({ error }, { status: 400 });
  }
  await writeSettings(settings);
  return Response.json(settings);
}
