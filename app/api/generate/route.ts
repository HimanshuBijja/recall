import { NextRequest } from "next/server";
import type { CardKind } from "@/types";
import { draftCardsFromText } from "@/lib/gemini";

export const dynamic = "force-dynamic";

const KINDS: CardKind[] = ["mcq", "multi", "flash", "cloze", "tf-sort", "match"];
const MAX_COUNT = 20;

export async function POST(req: NextRequest): Promise<Response> {
  const body = (await req.json()) as {
    text?: unknown;
    kind?: unknown;
    count?: unknown;
    pageTitle?: unknown;
  };

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return Response.json({ ok: false, error: "text is required" }, { status: 400 });
  }
  if (!KINDS.includes(body.kind as CardKind)) {
    return Response.json({ ok: false, error: `unknown card kind: ${String(body.kind)}` }, { status: 400 });
  }
  const kind = body.kind as CardKind;

  const requested = Math.floor(Number(body.count));
  const count = Number.isFinite(requested) ? Math.min(MAX_COUNT, Math.max(1, requested)) : 1;
  const pageTitle = typeof body.pageTitle === "string" ? body.pageTitle : undefined;

  try {
    const { drafts, groupName } = await draftCardsFromText(text, kind, count, pageTitle);
    return Response.json({ ok: true, drafts, groupName });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "generation failed";
    console.error("[generate] 500:", msg, e);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
