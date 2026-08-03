import { NextRequest } from "next/server";
import { uploadFrame } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.fileDataUrl) {
      return Response.json({ error: "fileDataUrl is required" }, { status: 400 });
    }
    const publicUrl = await uploadFrame(body.fileDataUrl, "references");
    return Response.json({ url: publicUrl }, { status: 200 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "upload failed";
    console.error("[upload] error:", msg, error);
    return Response.json({ error: msg }, { status: 500 });
  }
}
