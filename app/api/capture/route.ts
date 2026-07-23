import { NextRequest } from "next/server";
import type { CaptureRequest, CaptureResponse } from "@/types/capture";
import type { CardKind, MarkerShape } from "@/types";
import { draftCardFromFrame } from "@/lib/gemini";
import { uploadFrame } from "@/lib/storage";

export const dynamic = "force-dynamic";

const MARKER: Record<CardKind, { shape: MarkerShape; color: string }> = {
  mcq: { shape: "circle", color: "#f59e0b" },
  flash: { shape: "square", color: "#3b82f6" },
  cloze: { shape: "triangle", color: "#a855f7" },
  "tf-sort": { shape: "diamond", color: "#10b981" },
  match: { shape: "star", color: "#ec4899" },
};

export async function POST(req: NextRequest): Promise<Response> {
  const body = (await req.json()) as Partial<CaptureRequest>;
  if (!body.frameDataUrl || !body.kind || !body.videoId) {
    return Response.json({ ok: false, error: "frameDataUrl, kind, videoId required" } satisfies CaptureResponse, { status: 400 });
  }
  try {
    // Run both concurrently but don't let an R2 failure discard the
    // already-paid-for Gemini draft — return the draft with no screenshot.
    const [draftRes, uploadRes] = await Promise.allSettled([
      draftCardFromFrame(body.frameDataUrl, body.kind),
      uploadFrame(body.frameDataUrl),
    ]);
    if (uploadRes.status === "rejected") {
      console.error("[capture] R2 upload failed (non-fatal):", uploadRes.reason);
    }
    if (draftRes.status === "rejected") {
      console.error("[capture] Gemini draft failed:", draftRes.reason);
      throw draftRes.reason;
    }
    const { draft, ocrText } = draftRes.value;
    const screenshotUrl = uploadRes.status === "fulfilled" ? uploadRes.value : undefined;
    return Response.json({ ok: true, draft, ocrText, screenshotUrl, marker: MARKER[body.kind] } satisfies CaptureResponse);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "capture failed";
    console.error("[capture] 500:", msg, e);
    return Response.json({ ok: false, error: msg } satisfies CaptureResponse, { status: 500 });
  }
}
