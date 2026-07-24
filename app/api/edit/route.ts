import { NextRequest } from "next/server";
import { editTextSelection, editFullCard } from "@/lib/gemini";

export async function POST(req: NextRequest) {
  try {
    const { selection, prompt, draft } = await req.json();
    if (draft) {
      if (typeof prompt !== "string") {
        return Response.json({ error: "prompt is required" }, { status: 400 });
      }
      const editedDraft = await editFullCard(draft, prompt);
      return Response.json({ ok: true, draft: editedDraft });
    }

    if (typeof selection !== "string" || typeof prompt !== "string") {
      return Response.json({ error: "selection and prompt are required" }, { status: 400 });
    }
    const editedText = await editTextSelection(selection, prompt);
    return Response.json({ ok: true, editedText });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "AI editing failed" },
      { status: 500 }
    );
  }
}
