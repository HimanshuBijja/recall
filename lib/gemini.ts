import fs from "fs";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import type { CardKind } from "@/types";
import type { CardDraft } from "@/types/capture";

const MODEL = process.env.GEMINI_OCR_MODEL ?? "gemini-2.5-flash-lite";

// Vertex ADC (service-account.json) OR GEMINI_API_KEY — same detection as clipper.
let ai: GoogleGenAI | null = null;
function client(): GoogleGenAI {
  if (ai) return ai;

  if (process.env.GEMINI_API_KEY) {
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    return ai;
  }

  const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS)
    : path.join(process.cwd(), "service-account.json");

  let projectId = process.env.GOOGLE_CLOUD_PROJECT;

  if (fs.existsSync(saPath)) {
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = saPath;
    }
    if (!projectId) {
      try {
        const saJson = JSON.parse(fs.readFileSync(saPath, "utf-8"));
        if (saJson.project_id) {
          projectId = saJson.project_id;
        }
      } catch {
        /* ignore parse error */
      }
    }
  }

  ai = new GoogleGenAI({
    vertexai: true,
    project: projectId,
    location: process.env.GOOGLE_CLOUD_LOCATION ?? "us-central1",
  });
  return ai;
}

const KIND_INSTRUCTIONS: Record<CardKind, string> = {
  mcq: `Produce a single multiple-choice question. JSON keys: question (the exact verbatim question text from the screenshot without rephrasing), answer (the ONE correct option text), distractors (the remaining wrong option texts), tags (a list with exactly 1 lowercase topic tag representing the main concept from the video title), explanation, hint.`,
  multi: `Produce a multiple-answer question where MORE THAN ONE option is correct. JSON keys: question (the exact verbatim question text from the screenshot without rephrasing), answers (array of ALL correct option texts, 2 or more when the screenshot supports it), distractors (the remaining wrong option texts), tags (a list with exactly 1 lowercase topic tag representing the main concept from the video title), explanation, hint.`,
  flash: `Produce a flashcard. JSON keys: question (the exact verbatim question/topic front text from the screenshot without rephrasing), answer (back), tags (a list with exactly 1 lowercase topic tag representing the main concept from the video title), explanation, hint.`,
  cloze: `Produce a cloze-deletion card. JSON keys: clozeText (the sentence from the screenshot with 1-3 blanks written as ==answer==), tags (a list with exactly 1 lowercase topic tag representing the main concept from the video title), explanation, hint.`,
  "tf-sort": `Produce a true/false sorting card. JSON keys: question (instruction or exact header from screenshot), statements (array of >=4 objects {text, isTrue}), tags (a list with exactly 1 lowercase topic tag representing the main concept from the video title), explanation, hint.`,
  match: `Produce a match-the-pairs card. JSON keys: question (instruction or exact header from screenshot), pairs (array of >=3 objects {left, right}), tags (a list with exactly 1 lowercase topic tag representing the main concept from the video title), explanation, hint.`,
};

function emptyDraft(kind: CardKind): CardDraft {
  return { kind, question: "", answer: "", distractors: [], tags: [], explanation: "", hint: "",
    ...(kind === "cloze" ? { clozeText: "" } : {}),
    ...(kind === "tf-sort" ? { statements: [] } : {}),
    ...(kind === "match" ? { pairs: [] } : {}),
    ...(kind === "multi" ? { answers: [] } : {}) };
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
  base.tags = arr(obj.tags).map((t) => s(t).toLowerCase().trim()).filter(Boolean).slice(0, 1);
  base.distractors = arr(obj.distractors).map(s).filter(Boolean).slice(0, 3);
  if (kind === "multi") base.answers = arr(obj.answers).map(s).filter(Boolean);
  if (kind === "cloze") base.clozeText = s(obj.clozeText);
  if (kind === "tf-sort") base.statements = arr(obj.statements)
    .map((x) => ({ text: s((x as Record<string, unknown>)?.text), isTrue: Boolean((x as Record<string, unknown>)?.isTrue) }))
    .filter((x) => x.text);
  if (kind === "match") base.pairs = arr(obj.pairs)
    .map((x) => ({ left: s((x as Record<string, unknown>)?.left), right: s((x as Record<string, unknown>)?.right) }))
    .filter((x) => x.left && x.right);
  return base;
}

export async function draftCardFromFrame(
  frameDataUrl: string,
  kind: CardKind,
  videoTitle?: string,
): Promise<{ draft: CardDraft; ocrText: string }> {
  const m = /^data:([^;]+);base64,([\s\S]+)$/.exec(frameDataUrl);
  if (!m) throw new Error("bad frame data URL");
  const prompt = `You are turning a single screenshot from an educational video into ONE revision card.
The video title is: "${videoTitle || "Unknown"}".
First transcribe all readable text in the image (this is the OCR). Then write the card.

CRITICAL REQUIREMENT FOR QUESTION TEXT:
- Extract and preserve the EXACT question text from the screenshot VERBATIM (word-for-word).
- DO NOT rephrase, rewrite, summarize, or alter the question text. Keep it identical to what appears in the image.
- Strip leading markers like "Q.", "Q1.", "Question:" if present, but keep all original text of the question body verbatim.

CRITICAL REQUIREMENT FOR TAGS:
- Analyze the video title provided above. Identify the main concept or topic being taught (usually 1-3 words representing the concept, e.g. "coordination compounds", "cellular respiration", "newton's laws") and return it as the single tag.
- The "tags" list MUST contain exactly ONE string representing this concept.

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

export async function editTextSelection(selection: string, userPrompt: string): Promise<string> {
  const prompt = `You are an AI assistant helping a user edit a flashcard.
The user has selected the following text:
"${selection}"

They want you to edit it based on this instruction:
"${userPrompt}"

Return ONLY the edited text. Do NOT wrap it in quotes, markdown, or any other explanations. Return only the final replacement text.`;

  const res = await client().models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });
  return res.text ?? "";
}

export async function editFullCard(draft: CardDraft, userPrompt: string): Promise<CardDraft> {
  const prompt = `You are an AI assistant helping a user edit a flashcard.
Here is the current card draft:
${JSON.stringify(draft, null, 2)}

The user wants you to edit the entire card based on this instruction:
"${userPrompt}"

Make the edits requested. Preserve all other fields exactly as they are unless instructed to change them.
Return ONLY the updated card draft as a JSON object matching the keys of the original draft. Do NOT include markdown code blocks, prose, or explanations.`;

  const res = await client().models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });
  const rawText = res.text ?? "";
  return parseDraft(rawText, draft.kind);
}
