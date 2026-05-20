"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Card, CardKind, Tag, TfStatement } from "@/types";
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
  const [kind, setKind] = useState<CardKind>(initial?.kind === "tf-sort" ? "tf-sort" : "mcq");
  const [question, setQuestion] = useState(initial?.question ?? "");
  const [answer, setAnswer] = useState(initial?.answer ?? "");
  const [distractors, setDistractors] = useState<string[]>(
    initial?.distractors ?? ["", "", ""]
  );
  const [statements, setStatements] = useState<TfStatement[]>(
    initial?.statements && initial.statements.length > 0
      ? initial.statements
      : [
          { text: "", isTrue: true },
          { text: "", isTrue: false },
        ]
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
    if (kind === "mcq") {
      if (!answer.trim()) e.answer = "Answer is required";
      if (distractors.filter((d) => d.trim()).length !== 3)
        e.distractors = "Exactly 3 distractors required";
    } else {
      const filled = statements.filter((s) => s.text.trim());
      if (filled.length < 2) e.statements = "At least 2 statements required";
    }
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
        kind,
        question: question.trim(),
        answer: kind === "mcq" ? answer.trim() : "",
        distractors: kind === "mcq" ? distractors.map((d) => d.trim()) : [],
        statements:
          kind === "tf-sort"
            ? statements
                .map((s) => ({ text: s.text.trim(), isTrue: s.isTrue }))
                .filter((s) => s.text.length > 0)
            : undefined,
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
      <Field label="Card type">
        <div className="inline-flex rounded-lg border border-zinc-300 dark:border-zinc-700 p-0.5 bg-zinc-50 dark:bg-zinc-900">
          {(["mcq", "tf-sort"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={[
                "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                kind === k
                  ? "bg-indigo-600 text-white"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100",
              ].join(" ")}
            >
              {k === "mcq" ? "Multiple choice" : "True / False sort"}
            </button>
          ))}
        </div>
        <p className="text-xs text-zinc-500 mt-1.5">
          {kind === "mcq"
            ? "One question, one correct answer, three distractors."
            : "User sorts each statement into True / False — scored all-or-nothing."}
        </p>
      </Field>

      <Field label="Question" error={errors.question}>
        <textarea
          ref={qRef}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={advance(0)}
          rows={2}
          autoFocus
          className={inputCls}
          placeholder={
            kind === "tf-sort"
              ? "e.g. Sort each statement as True or False — advantages of go build"
              : undefined
          }
        />
      </Field>

      {kind === "mcq" ? (
        <>
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
        </>
      ) : (
        <Field label="Statements" error={errors.statements}>
          <div className="space-y-2">
            {statements.map((s, i) => (
              <div key={i} className="flex items-stretch gap-2">
                <div className="inline-flex rounded-lg border border-zinc-300 dark:border-zinc-700 p-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      const n = [...statements];
                      n[i] = { ...n[i], isTrue: true };
                      setStatements(n);
                    }}
                    className={[
                      "px-2.5 text-xs font-semibold rounded-md transition-colors",
                      s.isTrue
                        ? "bg-emerald-600 text-white"
                        : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100",
                    ].join(" ")}
                  >
                    T
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const n = [...statements];
                      n[i] = { ...n[i], isTrue: false };
                      setStatements(n);
                    }}
                    className={[
                      "px-2.5 text-xs font-semibold rounded-md transition-colors",
                      !s.isTrue
                        ? "bg-rose-600 text-white"
                        : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100",
                    ].join(" ")}
                  >
                    F
                  </button>
                </div>
                <input
                  value={s.text}
                  onChange={(e) => {
                    const n = [...statements];
                    n[i] = { ...n[i], text: e.target.value };
                    setStatements(n);
                  }}
                  placeholder={`Statement ${i + 1}`}
                  className={inputCls + " flex-1"}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (statements.length <= 2) return;
                    setStatements(statements.filter((_, j) => j !== i));
                  }}
                  disabled={statements.length <= 2}
                  className="shrink-0 px-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-500 hover:text-rose-600 hover:border-rose-300 disabled:opacity-40 disabled:hover:text-zinc-500 disabled:hover:border-zinc-300"
                  aria-label={`Remove statement ${i + 1}`}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setStatements([...statements, { text: "", isTrue: true }])}
              className="text-xs px-2.5 py-1.5 rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-indigo-400 hover:text-indigo-600"
            >
              + Add statement
            </button>
            <p className="text-[11px] text-zinc-500">
              Mark each as True or False — the user will sort them and is graded all-or-nothing.
            </p>
          </div>
        </Field>
      )}

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
