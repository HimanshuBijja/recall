"use client";

import React, { useEffect, useImperativeHandle, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Card, CardKind, Tag, TfStatement, MatchPair } from "@/types";
import { useToast } from "@/components/Toast";
import { TagSelector, type TagSelectorHandle, type TagSelectorValue } from "@/components/TagSelector";
import { parseCloze } from "@/lib/cloze";

interface Props {
  initial?: Card;
  tags: Tag[];
}

interface AutoResizeTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  value: string;
}

const AutoResizeTextarea = React.forwardRef<
  HTMLTextAreaElement,
  AutoResizeTextareaProps
>(({ value, onChange, className, ...props }, ref) => {
  const localRef = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => localRef.current!);

  const adjustHeight = () => {
    const textarea = localRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight + 4}px`;
    }
  };

  useEffect(() => {
    adjustHeight();
  }, [value]);

  useEffect(() => {
    adjustHeight();
    window.addEventListener("resize", adjustHeight);
    return () => {
      window.removeEventListener("resize", adjustHeight);
    };
  }, []);

  return (
    <textarea
      ref={localRef}
      value={value}
      onChange={(e) => {
        onChange?.(e);
        adjustHeight();
      }}
      className={className}
      style={{ resize: "none", overflowY: "hidden", ...props.style }}
      {...props}
    />
  );
});
AutoResizeTextarea.displayName = "AutoResizeTextarea";

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
  const [kind, setKind] = useState<CardKind>(initial?.kind ?? "mcq");
  const [question, setQuestion] = useState(initial?.question ?? "");
  const [answer, setAnswer] = useState(initial?.answer ?? "");
  
  const [options, setOptions] = useState<Array<{ text: string; isCorrect: boolean }>>(() => {
    const initialOptions: Array<{ text: string; isCorrect: boolean }> = [];
    if (initial?.kind === "mcq") {
      initialOptions.push({ text: initial.answer ?? "", isCorrect: true });
      for (const d of initial.distractors ?? []) {
        initialOptions.push({ text: d, isCorrect: false });
      }
    } else if (initial?.kind === "multi") {
      const correctSet = new Set(initial.answers ?? []);
      if (initial.answer && correctSet.size === 0) {
        correctSet.add(initial.answer);
      }
      for (const c of correctSet) {
        initialOptions.push({ text: c, isCorrect: true });
      }
      for (const d of initial.distractors ?? []) {
        if (!correctSet.has(d)) {
          initialOptions.push({ text: d, isCorrect: false });
        }
      }
    }
    while (initialOptions.length < 2) {
      initialOptions.push({ text: "", isCorrect: false });
    }
    // For a brand new MCQ, make the first option correct by default if none is
    if (initialOptions.length > 0 && !initialOptions.some(o => o.isCorrect)) {
      initialOptions[0].isCorrect = true;
    }
    return initialOptions;
  });

  const [statements, setStatements] = useState<TfStatement[]>(
    initial?.statements && initial.statements.length > 0
      ? initial.statements
      : [
          { text: "", isTrue: true },
          { text: "", isTrue: false },
        ]
  );
  const [clozeText, setClozeText] = useState(initial?.clozeText ?? "");
  const [pairs, setPairs] = useState<MatchPair[]>(
    initial?.pairs && initial.pairs.length > 0
      ? initial.pairs
      : [
          { left: "", right: "" },
          { left: "", right: "" },
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
  const clozeRef = useRef<HTMLTextAreaElement>(null);
  const aRef = useRef<HTMLTextAreaElement>(null);
  const hRef = useRef<HTMLTextAreaElement>(null);
  const eRef = useRef<HTMLTextAreaElement>(null);
  const tagSelRef = useRef<TagSelectorHandle>(null);

  // Wrap TagSelectorHandle so makeAdvanceOnEnter can call .focus().
  const tagFocusProxy = useRef<HTMLElement | null>({
    focus: () => tagSelRef.current?.focus(),
  } as unknown as HTMLElement);

  // eslint-disable-next-line react-hooks/refs -- refs are only read inside the returned onKeyDown handlers, never during render
  const advance = makeAdvanceOnEnter([
    qRef, clozeRef, aRef, hRef, eRef, tagFocusProxy,
  ]);

  const handleKindChange = (newKind: CardKind) => {
    setKind(newKind);
    if (newKind === "mcq") {
      setOptions(prev => {
        let foundCorrect = false;
        const nextOpts = prev.map(opt => {
          if (opt.isCorrect) {
            if (!foundCorrect) {
              foundCorrect = true;
              return opt;
            }
            return { ...opt, isCorrect: false };
          }
          return opt;
        });
        if (!foundCorrect && nextOpts.length > 0) {
          nextOpts[0].isCorrect = true;
        }
        return nextOpts;
      });
    } else if (newKind === "multi") {
      setOptions(prev => {
        const hasCorrect = prev.some(o => o.isCorrect);
        if (!hasCorrect && prev.length > 0) {
          return prev.map((opt, i) => i === 0 ? { ...opt, isCorrect: true } : opt);
        }
        return prev;
      });
    }
  };

  const handleToggleOption = (idx: number) => {
    setOptions(prev =>
      prev.map((opt, i) => {
        if (kind === "mcq") {
          return { ...opt, isCorrect: i === idx };
        } else {
          return i === idx ? { ...opt, isCorrect: !opt.isCorrect } : opt;
        }
      })
    );
  };

  const handleAddOption = () => {
    setOptions(prev => [...prev, { text: "", isCorrect: false }]);
  };

  const handleRemoveOption = (idx: number) => {
    setOptions(prev => prev.filter((_, i) => i !== idx));
  };

  const handleOptionTextChange = (idx: number, text: string) => {
    setOptions(prev =>
      prev.map((opt, i) => (i === idx ? { ...opt, text } : opt))
    );
  };

  function validate() {
    const e: Record<string, string> = {};
    if (kind !== "cloze" && !question.trim()) e.question = "Question is required";
    
    if (kind === "mcq") {
      const correctCount = options.filter((o) => o.isCorrect && o.text.trim()).length;
      const filledCount = options.filter((o) => o.text.trim()).length;
      if (correctCount !== 1) {
        e.options = "Please select exactly one correct answer (with text)";
      } else if (filledCount < 2) {
        e.options = "At least 2 options are required";
      }
    } else if (kind === "multi") {
      const correctCount = options.filter((o) => o.isCorrect && o.text.trim()).length;
      const filledCount = options.filter((o) => o.text.trim()).length;
      if (correctCount < 1) {
        e.options = "At least 1 correct answer is required";
      } else if (filledCount < 2) {
        e.options = "At least 2 options total are required";
      }
    } else if (kind === "tf-sort") {
      const filled = statements.filter((s) => s.text.trim());
      if (filled.length < 2) e.statements = "At least 2 statements required";
    } else if (kind === "flash") {
      if (!answer.trim()) e.answer = "Answer is required";
    } else if (kind === "cloze") {
      if (!clozeText.trim()) {
        e.clozeText = "Cloze text is required";
      } else {
        const { answers } = parseCloze(clozeText);
        if (answers.length < 1) {
          e.clozeText = "At least one blank ==like this== is required";
        }
      }
    } else if (kind === "match") {
      const filled = pairs.filter((p) => p.left.trim() && p.right.trim());
      if (filled.length < 2) {
        e.pairs = "At least 2 pairs required";
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
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
        question: kind === "cloze" ? (question.trim() || clozeText.trim()) : question.trim(),
        answer:
          kind === "mcq"
            ? (options.find((o) => o.isCorrect)?.text ?? "").trim()
            : kind === "flash"
            ? answer.trim()
            : "",
        distractors:
          kind === "mcq" || kind === "multi"
            ? options
                .filter((o) => !o.isCorrect)
                .map((o) => o.text.trim())
                .filter(Boolean)
            : [],
        answers:
          kind === "multi"
            ? options
                .filter((o) => o.isCorrect)
                .map((o) => o.text.trim())
                .filter(Boolean)
            : undefined,
        statements:
          kind === "tf-sort"
            ? statements
                .map((s) => ({ text: s.text.trim(), isTrue: s.isTrue }))
                .filter((s) => s.text.length > 0)
            : undefined,
        clozeText: kind === "cloze" ? clozeText.trim() : undefined,
        pairs:
          kind === "match"
            ? pairs
                .map((p) => ({ left: p.left.trim(), right: p.right.trim() }))
                .filter((p) => p.left.length > 0 && p.right.length > 0)
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
    <form onSubmit={submit} className="space-y-5 max-w-4xl w-full">
      <Field label="Card type">
        <div className="flex flex-wrap gap-1 rounded-lg border border-zinc-300 dark:border-zinc-700 p-0.5 bg-zinc-50 dark:bg-zinc-900 w-fit">
          {([
            ["mcq", "Multiple choice"],
            ["multi", "Multiple answers"],
            ["tf-sort", "True / False sort"],
            ["flash", "Flashcard"],
            ["cloze", "Cloze deletion"],
            ["match", "Match pairs"],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => handleKindChange(k)}
              className={[
                "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                kind === k
                  ? "bg-indigo-600 text-white"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-zinc-500 mt-1.5">
          {kind === "mcq" && "One question, one correct answer, three distractors."}
          {kind === "multi" && "One question, several correct answers — scored all-or-nothing."}
          {kind === "tf-sort" && "User sorts each statement into True / False — scored all-or-nothing."}
          {kind === "flash" && "Self-graded flip card (question on front, answer on back) with swipe."}
          {kind === "cloze" && "Text with blanks created using ==word== syntax. All blanks must be correct."}
          {kind === "match" && "Match left terms to right definitions (2-8 pairs). All correct to pass."}
        </p>
      </Field>

      {kind !== "cloze" && (
        <Field label="Question" error={errors.question}>
          <AutoResizeTextarea
            ref={qRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={advance(0)}
            autoFocus
            className={inputCls}
            placeholder={
              kind === "tf-sort"
                ? "e.g. Sort each statement as True or False — advantages of go build"
                : undefined
            }
          />
        </Field>
      )}

      {(kind === "mcq" || kind === "multi") && (
        <Field
          label={
            kind === "mcq"
              ? "Options (toggle checkmark to select correct)"
              : "Options (multiple correct allowed)"
          }
          error={errors.options}
        >
          <div className="space-y-3">
            {options.map((opt, idx) => (
              <div key={idx} className="flex items-stretch gap-2">
                <button
                  type="button"
                  onClick={() => handleToggleOption(idx)}
                  className={[
                    "flex items-center justify-center w-9 h-9 rounded-lg border text-sm font-semibold transition-colors shrink-0",
                    opt.isCorrect
                      ? "bg-emerald-600 border-emerald-600 text-white dark:bg-emerald-700 dark:border-emerald-700"
                      : "border-zinc-300 dark:border-zinc-700 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:border-zinc-400 dark:hover:border-zinc-600",
                  ].join(" ")}
                  title={
                    kind === "mcq"
                      ? "Mark this option as correct"
                      : "Toggle correct status"
                  }
                >
                  {opt.isCorrect ? "✓" : "○"}
                </button>
                <AutoResizeTextarea
                  value={opt.text}
                  onChange={(e) => handleOptionTextChange(idx, e.target.value)}
                  placeholder={`Option ${idx + 1}`}
                  className={[inputCls, "flex-1 min-h-[38px]"].join(" ")}
                />
                <button
                  type="button"
                  onClick={() => handleRemoveOption(idx)}
                  disabled={options.length <= 2}
                  className="shrink-0 px-3 rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-500 hover:text-rose-600 hover:border-rose-300 disabled:opacity-40 disabled:hover:text-zinc-500 disabled:hover:border-zinc-300"
                  aria-label={`Remove option ${idx + 1}`}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={handleAddOption}
              className="text-xs px-2.5 py-1.5 rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-indigo-400 hover:text-indigo-600"
            >
              + Add option
            </button>
          </div>
        </Field>
      )}

      {kind === "tf-sort" && (
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

      {kind === "flash" && (
        <Field label="Back (answer)" error={errors.answer}>
          <AutoResizeTextarea
            ref={aRef}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={advance(2)}
            className={inputCls}
            placeholder="Answer shown on back of card"
          />
        </Field>
      )}

      {kind === "cloze" && (
        <>
          <Field label="Cloze Text" error={errors.clozeText}>
            <div className="space-y-2">
              <AutoResizeTextarea
                ref={clozeRef}
                value={clozeText}
                onChange={(e) => setClozeText(e.target.value)}
                className={inputCls}
                placeholder="Type your text here. Highlight a word and click 'Cloze it' to create a blank."
              />
              <button
                type="button"
                onClick={() => {
                  const el = clozeRef.current;
                  if (!el) return;
                  const start = el.selectionStart;
                  const end = el.selectionEnd;
                  if (start === end) return;
                  const text = el.value;
                  const selected = text.slice(start, end);
                  const newVal = text.slice(0, start) + `==${selected}==` + text.slice(end);
                  setClozeText(newVal);
                  setTimeout(() => {
                    el.focus();
                    el.setSelectionRange(start + 2, start + 2 + selected.length);
                  }, 0);
                }}
                className="text-xs px-3 py-1.5 rounded bg-indigo-100 hover:bg-indigo-200 text-indigo-700 font-semibold"
              >
                == Cloze it ==
              </button>
            </div>
          </Field>

          <div className="p-4 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-2">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Preview</div>
            <div className="text-sm leading-relaxed whitespace-pre-wrap">
              {(() => {
                const { segments, answers } = parseCloze(clozeText);
                if (answers.length === 0) return <span className="text-zinc-400">No blanks created yet.</span>;
                return segments.map((seg, i) => (
                  <span key={i}>
                    {seg}
                    {i < answers.length && (
                      <span className="inline-block px-2 py-0.5 mx-1 rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 font-mono text-zinc-600 dark:text-zinc-400">
                        ____
                      </span>
                    )}
                  </span>
                ));
              })()}
            </div>
          </div>
        </>
      )}

      {kind === "match" && (
        <Field label="Pairs" error={errors.pairs}>
          <div className="space-y-2">
            {pairs.map((p, i) => (
              <div key={i} className="flex items-stretch gap-2">
                <input
                  value={p.left}
                  onChange={(e) => {
                    const n = [...pairs];
                    n[i] = { ...n[i], left: e.target.value };
                    setPairs(n);
                  }}
                  placeholder={`Left term ${i + 1}`}
                  className={inputCls + " flex-1"}
                />
                <span className="flex items-center text-zinc-400">→</span>
                <input
                  value={p.right}
                  onChange={(e) => {
                    const n = [...pairs];
                    n[i] = { ...n[i], right: e.target.value };
                    setPairs(n);
                  }}
                  placeholder={`Right matches ${i + 1}`}
                  className={inputCls + " flex-1"}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (pairs.length <= 2) return;
                    setPairs(pairs.filter((_, j) => j !== i));
                  }}
                  disabled={pairs.length <= 2}
                  className="shrink-0 px-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-500 hover:text-rose-600 hover:border-rose-300 disabled:opacity-40 disabled:hover:text-zinc-500 disabled:hover:border-zinc-300"
                  aria-label={`Remove pair ${i + 1}`}
                >
                  ✕
                </button>
              </div>
            ))}
            {pairs.length < 8 && (
              <button
                type="button"
                onClick={() => setPairs([...pairs, { left: "", right: "" }])}
                className="text-xs px-2.5 py-1.5 rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-indigo-400 hover:text-indigo-600"
              >
                + Add pair
              </button>
            )}
            <p className="text-[11px] text-zinc-500">
              Create 2 to 8 matching pairs. The left side remains in order while the right side will be shuffled.
            </p>
          </div>
        </Field>
      )}

      <Field label="Hint">
        <AutoResizeTextarea
          ref={hRef}
          value={hint}
          onChange={(e) => setHint(e.target.value)}
          onKeyDown={advance(3)}
          className={inputCls}
        />
      </Field>

      <Field label="Explanation">
        <AutoResizeTextarea
          ref={eRef}
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          onKeyDown={advance(4)}
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

      <div className="flex gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-800">
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

