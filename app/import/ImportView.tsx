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

export function ImportView() {
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = useState("");
  const [importing, setImporting] = useState(false);

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

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={sample}
        rows={12}
        className="w-full font-mono text-xs px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
      />

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

          <button
            onClick={doImport}
            disabled={importing || validRows.length === 0}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium disabled:opacity-50"
          >
            {importing ? "Importing…" : `Import ${validRows.length} cards`}
          </button>
        </>
      )}
    </div>
  );
}
