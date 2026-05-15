"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Card, Tag } from "@/types";
import { useToast } from "@/components/Toast";
import { TagSelector, type TagSelectorHandle, type TagSelectorValue } from "@/components/TagSelector";

interface Props {
  initial?: Card;
  tags: Tag[];
}

/**
 * Custom onKeyDown that advances focus to the next field on Enter.
 * Shift+Enter inserts a newline in textareas as usual.
 * The tag selector has its own keyboard handling and is excluded.
 */
function makeAdvanceOnEnter(refs: React.RefObject<HTMLElement | null>[]) {
  return (idx: number) => (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    for (let i = idx + 1; i < refs.length; i++) {
      const el = refs[i].current;
      if (el) {
        // TagSelector's focus is on its inner input — use the imperative handle if needed.
        (el as HTMLElement & { focus: () => void }).focus();
        return;
      }
    }
  };
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
  const [tagValue, setTagValue] = useState<TagSelectorValue>({
    existing: initial?.tags ?? [],
    pending: [],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Refs for Enter-to-advance navigation.
  const qRef = useRef<HTMLTextAreaElement>(null);
  const aRef = useRef<HTMLInputElement>(null);
  const d0Ref = useRef<HTMLInputElement>(null);
  const d1Ref = useRef<HTMLInputElement>(null);
  const d2Ref = useRef<HTMLInputElement>(null);
  const hRef = useRef<HTMLInputElement>(null);
  const eRef = useRef<HTMLTextAreaElement>(null);
  const tagSelRef = useRef<TagSelectorHandle>(null);

  // Wrap TagSelectorHandle so makeAdvanceOnEnter can call .focus().
  const tagFocusProxy = useRef<HTMLElement | null>({
    focus: () => tagSelRef.current?.focus(),
  } as unknown as HTMLElement);

  const advance = makeAdvanceOnEnter([
    qRef, aRef, d0Ref, d1Ref, d2Ref, hRef, eRef, tagFocusProxy,
  ]);

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
    try {
      // Step 1: create any pending tags, deduping (case-insensitive) against
      // existing tags in case the user typed a name that already exists.
      const existingByName = new Map(tags.map((t) => [t.name.toLowerCase(), t.id]));
      const createdIds: string[] = [];
      const seen = new Set<string>();
      for (const name of tagValue.pending) {
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const existingId = existingByName.get(key);
        if (existingId) {
          createdIds.push(existingId);
        } else {
          const res = await api.post<Tag>("/tags", { name, parents: [] });
          createdIds.push(res.data.id);
        }
      }
      const finalTagIds = [...tagValue.existing, ...createdIds];

      const payload = {
        question: question.trim(),
        answer: answer.trim(),
        distractors: distractors.map((d) => d.trim()),
        explanation: explanation.trim(),
        hint: hint.trim(),
        difficulty,
        tags: finalTagIds,
      };

      if (initial) {
        await api.put(`/cards/${initial.id}`, payload);
        toast("success", "Card updated");
      } else {
        await api.post("/cards", payload);
        toast(
          "success",
          tagValue.pending.length > 0
            ? `Card created (${tagValue.pending.length} new tag${tagValue.pending.length === 1 ? "" : "s"})`
            : "Card created"
        );
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
          ref={qRef}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={advance(0)}
          rows={2}
          autoFocus
          className={inputCls}
        />
      </Field>

      <Field label="Correct answer" error={errors.answer}>
        <input
          ref={aRef}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          onKeyDown={advance(1)}
          className={inputCls}
        />
      </Field>

      <Field label="Distractors (3 wrong answers)" error={errors.distractors}>
        <div className="space-y-2">
          <input
            ref={d0Ref}
            value={distractors[0]}
            placeholder="Distractor 1"
            onChange={(e) => {
              const n = [...distractors];
              n[0] = e.target.value;
              setDistractors(n);
            }}
            onKeyDown={advance(2)}
            className={inputCls}
          />
          <input
            ref={d1Ref}
            value={distractors[1]}
            placeholder="Distractor 2"
            onChange={(e) => {
              const n = [...distractors];
              n[1] = e.target.value;
              setDistractors(n);
            }}
            onKeyDown={advance(3)}
            className={inputCls}
          />
          <input
            ref={d2Ref}
            value={distractors[2]}
            placeholder="Distractor 3"
            onChange={(e) => {
              const n = [...distractors];
              n[2] = e.target.value;
              setDistractors(n);
            }}
            onKeyDown={advance(4)}
            className={inputCls}
          />
        </div>
      </Field>

      <Field label="Hint">
        <input
          ref={hRef}
          value={hint}
          onChange={(e) => setHint(e.target.value)}
          onKeyDown={advance(5)}
          className={inputCls}
        />
      </Field>

      <Field label="Explanation">
        <textarea
          ref={eRef}
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          onKeyDown={advance(6)}
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
        <TagSelector
          ref={tagSelRef}
          allTags={tags}
          value={tagValue}
          onChange={setTagValue}
        />
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
