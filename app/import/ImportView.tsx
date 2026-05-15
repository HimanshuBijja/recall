"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useToast } from "@/components/Toast";

interface RawCard {
  question?: unknown;
  answer?: unknown;
  distractors?: unknown;
  explanation?: unknown;
  hint?: unknown;
  difficulty?: unknown;
  tags?: unknown;
}

interface ValidatedRow {
  raw: RawCard;
  errors: string[];
}

function validate(arr: unknown): ValidatedRow[] {
  if (!Array.isArray(arr)) return [];
  return arr.map((row) => {
    const r = (row ?? {}) as RawCard;
    const errors: string[] = [];
    if (typeof r.question !== "string" || !r.question.trim())
      errors.push("question missing");
    if (typeof r.answer !== "string" || !r.answer.trim()) errors.push("answer missing");
    if (!Array.isArray(r.distractors) || r.distractors.length !== 3)
      errors.push("distractors must be exactly 3");
    const d = Number(r.difficulty);
    if (r.difficulty !== undefined && (!Number.isInteger(d) || d < 1 || d > 5))
      errors.push("difficulty must be 1-5");
    if (r.tags !== undefined && !Array.isArray(r.tags)) errors.push("tags must be an array");
    return { raw: r, errors };
  });
}

const sample = `[
  {
    "question": "What does HTML stand for?",
    "answer": "HyperText Markup Language",
    "distractors": ["Home Tool Markup Language", "Hyperlink Trail Mode Language", "High Text Machine Logic"],
    "explanation": "HTML is the standard markup language for documents on the web.",
    "hint": "It's a markup language.",
    "difficulty": 1,
    "tags": ["web", "frontend"]
  }
]`;

const aiPrompt = `Generate flashcard questions as a JSON array. Each card must follow this exact schema:

- question:     string (the prompt)
- answer:       string (the single correct answer)
- distractors:  array of exactly 3 strings (plausible wrong answers)
- explanation:  string (why the answer is correct)
- hint:         string (a small nudge, not the answer)
- difficulty:   integer 1-5 (1 = trivial, 5 = expert)
- tags:         array of lowercase kebab-case strings (e.g. "binary-search")

Rules:
- Output ONLY a valid JSON array. No markdown fences, no commentary.
- Distractors must be the same TYPE/SHAPE as the answer (e.g. if the answer is a number, all distractors are numbers).
- Avoid "all of the above" / "none of the above" style distractors.
- Keep questions self-contained — no "as discussed earlier".

Example (one card):

` + sample + `

Now generate <N> cards on the topic: <TOPIC>.`;

export function ImportView() {
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = useState("");
  const [importing, setImporting] = useState(false);
  const [copied, setCopied] = useState<"schema" | "prompt" | null>(null);

  async function copy(kind: "schema" | "prompt") {
    const payload = kind === "schema" ? sample : aiPrompt;
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(kind);
      toast("success", kind === "schema" ? "Schema copied" : "AI prompt copied");
      setTimeout(() => setCopied((c) => (c === kind ? null : c)), 1800);
    } catch {
      toast("error", "Couldn't copy — your browser blocked clipboard access");
    }
  }

  const { rows, parseError } = useMemo(() => {
    if (!text.trim()) return { rows: [] as ValidatedRow[], parseError: null as string | null };
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) return { rows: [], parseError: "Expected a JSON array." };
      return { rows: validate(parsed), parseError: null };
    } catch (e) {
      return { rows: [], parseError: (e as Error).message };
    }
  }, [text]);

  const validRows = rows.filter((r) => r.errors.length === 0);
  const invalidCount = rows.length - validRows.length;

  async function doImport() {
    if (validRows.length === 0) return;
    setImporting(true);
    try {
      const payload = validRows.map((r) => ({
        question: String(r.raw.question),
        answer: String(r.raw.answer),
        distractors: (r.raw.distractors as string[]).map(String),
        explanation: r.raw.explanation ? String(r.raw.explanation) : "",
        hint: r.raw.hint ? String(r.raw.hint) : "",
        difficulty: Number(r.raw.difficulty ?? 3),
        tags: Array.isArray(r.raw.tags) ? (r.raw.tags as unknown[]).map(String) : [],
      }));
      const res = await api.post("/cards/bulk", payload);
      toast("success", `Imported ${res.data.inserted} cards`);
      router.push("/cards");
      router.refresh();
    } catch {
      toast("error", "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Import cards</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Paste a JSON array of cards. Tags are matched by name (case-insensitive) and
          created if they don&apos;t exist.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/60 overflow-hidden">
        <div className="px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100/60 dark:bg-zinc-900 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Format
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5">
              Copy the AI prompt, paste to ChatGPT / Claude, then paste the output below.
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => copy("schema")}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 sm:py-1 rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-white dark:hover:bg-zinc-800 text-xs font-medium"
              title="Copy just the example JSON"
            >
              <CopyIcon /> {copied === "schema" ? "Copied" : "Schema"}
            </button>
            <button
              type="button"
              onClick={() => copy("prompt")}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 sm:py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium"
              title="Copy a full AI-ready prompt: schema + rules + example, ready to paste into ChatGPT/Claude"
            >
              <CopyIcon /> {copied === "prompt" ? "Copied" : "AI prompt"}
            </button>
          </div>
        </div>
        <pre className="px-3 py-3 text-[11px] font-mono leading-relaxed overflow-x-auto text-zinc-700 dark:text-zinc-300 max-h-64">
{sample}
        </pre>
      </div>
      

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={sample}
        rows={12}
        className="w-full font-mono text-xs px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
      />
      <button
            onClick={doImport}
            disabled={importing || validRows.length === 0}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium disabled:opacity-50"
          >
            {importing ? "Importing…" : `Import ${validRows.length} cards`}
          </button>

      {parseError && (
        <div className="rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
          JSON error: {parseError}
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className="text-sm text-zinc-500">
            {validRows.length} valid · {invalidCount} invalid
          </div>
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Question</th>
                  <th className="px-3 py-2 text-left">Answer</th>
                  <th className="px-3 py-2 text-left">Tags</th>
                  <th className="px-3 py-2 text-left">Errors</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={i}
                    className={[
                      "border-t border-zinc-200 dark:border-zinc-800",
                      r.errors.length > 0 && "bg-rose-50/60 dark:bg-rose-950/30",
                    ].filter(Boolean).join(" ")}
                  >
                    <td className="px-3 py-2 text-zinc-500">{i + 1}</td>
                    <td className="px-3 py-2">{String(r.raw.question ?? "—").slice(0, 60)}</td>
                    <td className="px-3 py-2">{String(r.raw.answer ?? "—").slice(0, 40)}</td>
                    <td className="px-3 py-2 text-xs text-zinc-500">
                      {Array.isArray(r.raw.tags) ? (r.raw.tags as string[]).join(", ") : ""}
                    </td>
                    <td className="px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
                      {r.errors.join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          
        </>
      )}
    </div>
  );
}

function CopyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}
