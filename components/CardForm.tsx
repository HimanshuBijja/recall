"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Card, Tag } from "@/types";
import { useToast } from "@/components/Toast";

interface Props {
  initial?: Card;
  tags: Tag[];
}

export function CardForm({ initial, tags }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [question, setQuestion] = useState(initial?.question ?? "");
  const [answer, setAnswer] = useState(initial?.answer ?? "");
  const [distractors, setDistractors] = useState<string[]>(
    initial?.distractors ?? ["", "", ""]
  );
  const [explanation, setExplanation] = useState(initial?.explanation ?? "");
  const [hint, setHint] = useState(initial?.hint ?? "");
  const [difficulty, setDifficulty] = useState<number>(initial?.difficulty ?? 3);
  const [selectedTags, setSelectedTags] = useState<string[]>(initial?.tags ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  function validate() {
    const e: Record<string, string> = {};
    if (!question.trim()) e.question = "Question is required";
    if (!answer.trim()) e.answer = "Answer is required";
    if (distractors.filter((d) => d.trim()).length !== 3)
      e.distractors = "Exactly 3 distractors required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) return;
    setSaving(true);
    const payload = {
      question: question.trim(),
      answer: answer.trim(),
      distractors: distractors.map((d) => d.trim()),
      explanation: explanation.trim(),
      hint: hint.trim(),
      difficulty,
      tags: selectedTags,
    };
    try {
      if (initial) {
        await api.put(`/cards/${initial.id}`, payload);
        toast("success", "Card updated");
      } else {
        await api.post("/cards", payload);
        toast("success", "Card created");
      }
      router.push("/cards");
      router.refresh();
    } catch {
      toast("error", "Failed to save card");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5 max-w-2xl">
      <Field label="Question" error={errors.question}>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={2}
          className={inputCls}
        />
      </Field>

      <Field label="Correct answer" error={errors.answer}>
        <input value={answer} onChange={(e) => setAnswer(e.target.value)} className={inputCls} />
      </Field>

      <Field label="Distractors (3 wrong answers)" error={errors.distractors}>
        <div className="space-y-2">
          {distractors.map((d, i) => (
            <input
              key={i}
              value={d}
              placeholder={`Distractor ${i + 1}`}
              onChange={(e) => {
                const next = [...distractors];
                next[i] = e.target.value;
                setDistractors(next);
              }}
              className={inputCls}
            />
          ))}
        </div>
      </Field>

      <Field label="Hint">
        <input value={hint} onChange={(e) => setHint(e.target.value)} className={inputCls} />
      </Field>

      <Field label="Explanation">
        <textarea
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          rows={3}
          className={inputCls}
        />
      </Field>

      <Field label={`Difficulty: ${difficulty}`}>
        <input
          type="range"
          min={1}
          max={5}
          value={difficulty}
          onChange={(e) => setDifficulty(Number(e.target.value))}
          className="w-full"
        />
      </Field>

      <Field label="Tags">
        <div className="flex flex-wrap gap-2">
          {tags.length === 0 && <p className="text-sm text-zinc-500">No tags yet.</p>}
          {tags.map((t) => {
            const on = selectedTags.includes(t.id);
            return (
              <button
                type="button"
                key={t.id}
                onClick={() =>
                  setSelectedTags((s) =>
                    on ? s.filter((x) => x !== t.id) : [...s, t.id]
                  )
                }
                className={[
                  "px-3 py-1 rounded-full text-xs border transition-colors",
                  on
                    ? "bg-indigo-600 border-indigo-600 text-white"
                    : "border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800",
                ].join(" ")}
              >
                {t.name}
              </button>
            );
          })}
        </div>
      </Field>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium disabled:opacity-50"
        >
          {saving ? "Saving…" : initial ? "Save changes" : "Create card"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

const inputCls =
  "w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500";

function Field({
  label,
  error,
  children,
}: {
  label: React.ReactNode;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-sm font-medium mb-1.5">{label}</div>
      {children}
      {error && <div className="text-xs text-rose-600 mt-1">{error}</div>}
    </label>
  );
}
