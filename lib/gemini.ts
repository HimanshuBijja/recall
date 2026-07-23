import { GoogleGenAI } from "@google/genai";
import type { CardKind } from "@/types";
import type { CardDraft } from "@/types/capture";

const MODEL = process.env.GEMINI_OCR_MODEL ?? "gemini-2.5-flash-lite";

// Vertex ADC (service-account.json) OR GEMINI_API_KEY — same detection as clipper.
let ai: GoogleGenAI | null = null;
function client(): GoogleGenAI {
  if (ai) return ai;
  ai = process.env.GEMINI_API_KEY
    ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    : new GoogleGenAI({ vertexai: true, project: process.env.GOOGLE_CLOUD_PROJECT, location: process.env.GOOGLE_CLOUD_LOCATION ?? "us-central1" });
  return ai;
}

const KIND_INSTRUCTIONS: Record<CardKind, string> = {
  mcq: `Produce a single multiple-choice question. JSON keys: question, answer (the ONE correct option), distractors (exactly 3 plausible wrong options), tags (2-4 lowercase topic tags), explanation, hint.`,
  flash: `Produce a flashcard. JSON keys: question (front), answer (back), tags, explanation, hint.`,
  cloze: `Produce a cloze-deletion card. JSON keys: clozeText (one sentence with 1-3 blanks written as ==answer==), tags, explanation, hint.`,
  "tf-sort": `Produce a true/false sorting card. JSON keys: question (the instruction), statements (array of >=4 objects {text, isTrue}), tags, explanation, hint.`,
  match: `Produce a match-the-pairs card. JSON keys: question (instruction), pairs (array of >=3 objects {left, right}), tags, explanation, hint.`,
};

function emptyDraft(kind: CardKind): CardDraft {
  return { kind, question: "", answer: "", distractors: [], tags: [], explanation: "", hint: "",
    ...(kind === "cloze" ? { clozeText: "" } : {}),
    ...(kind === "tf-sort" ? { statements: [] } : {}),
    ...(kind === "match" ? { pairs: [] } : {}) };
}

export function parseDraft(raw: string, kind: CardKind): CardDraft {
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(raw);
  const jsonText = (fence ? fence[1] : raw).trim();
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(jsonText);
  } catch {
    const braces = /\{[\s\S]*\}/.exec(jsonText);
    try { obj = braces ? JSON.parse(braces[0]) : {}; } catch { return emptyDraft(kind); }
  }
  const base = emptyDraft(kind);
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  base.question = s(obj.question);
  base.answer = s(obj.answer);
  base.explanation = s(obj.explanation);
  base.hint = s(obj.hint);
  base.tags = arr(obj.tags).map((t) => s(t).toLowerCase().trim()).filter(Boolean).slice(0, 4);
  base.distractors = arr(obj.distractors).map(s).filter(Boolean).slice(0, 3);
  if (kind === "cloze") base.clozeText = s(obj.clozeText);
  if (kind === "tf-sort") base.statements = arr(obj.statements)
    .map((x) => ({ text: s((x as Record<string, unknown>)?.text), isTrue: Boolean((x as Record<string, unknown>)?.isTrue) }))
    .filter((x) => x.text);
  if (kind === "match") base.pairs = arr(obj.pairs)
    .map((x) => ({ left: s((x as Record<string, unknown>)?.left), right: s((x as Record<string, unknown>)?.right) }))
    .filter((x) => x.left && x.right);
  return base;
}

export async function draftCardFromFrame(frameDataUrl: string, kind: CardKind): Promise<{ draft: CardDraft; ocrText: string }> {
  const m = /^data:([^;]+);base64,([\s\S]+)$/.exec(frameDataUrl);
  if (!m) throw new Error("bad frame data URL");
  const prompt = `You are turning a single screenshot from an educational video into ONE revision card.
First transcribe all readable text in the image (this is the OCR). Then write the card.
${KIND_INSTRUCTIONS[kind]}
Return ONLY a JSON object with the card keys above PLUS an "ocrText" key holding the raw transcription. No prose.`;
  const res = await client().models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [
      { text: prompt },
      { inlineData: { mimeType: m[1], data: m[2] } },
    ] }],
  });
  const text = res.text ?? "";
  const draft = parseDraft(text, kind);
  let ocrText = "";
  try {
    const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
    const obj = JSON.parse((fence ? fence[1] : text).trim());
    ocrText = typeof obj.ocrText === "string" ? obj.ocrText : "";
  } catch { /* ocrText optional */ }
  return { draft, ocrText };
}
