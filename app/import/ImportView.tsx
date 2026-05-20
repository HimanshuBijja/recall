"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useToast } from "@/components/Toast";

interface RawCard {
  kind?: unknown;
  question?: unknown;
  answer?: unknown;
  distractors?: unknown;
  statements?: unknown;
  explanation?: unknown;
  hint?: unknown;
  difficulty?: unknown;
  tags?: unknown;
}

interface RawTag {
  name?: unknown;
  parents?: unknown;
}

interface RawGroup {
  name?: unknown;
  tags?: unknown;
  tagIds?: unknown;
}

interface ValidatedCard { raw: RawCard; errors: string[] }
interface ValidatedTag { raw: RawTag; errors: string[] }
interface ValidatedGroup { raw: RawGroup; errors: string[] }

interface ParsedBundle {
  cards: ValidatedCard[];
  tags: ValidatedTag[];
  groups: ValidatedGroup[];
  shape: "array" | "bundle";
}

function validateCard(row: unknown): ValidatedCard {
  const r = (row ?? {}) as RawCard;
  const errors: string[] = [];
  const kind = r.kind === "tf-sort" ? "tf-sort" : "mcq";
  if (typeof r.question !== "string" || !r.question.trim())
    errors.push("question missing");
  if (kind === "mcq") {
    if (typeof r.answer !== "string" || !r.answer.trim()) errors.push("answer missing");
    if (!Array.isArray(r.distractors) || r.distractors.length !== 3)
      errors.push("distractors must be exactly 3");
  } else {
    if (!Array.isArray(r.statements) || r.statements.length < 2) {
      errors.push("statements must be an array of at least 2");
    } else {
      const bad = r.statements.some((s) => {
        const o = (s ?? {}) as { text?: unknown; isTrue?: unknown };
        return typeof o.text !== "string" || !o.text.trim() || typeof o.isTrue !== "boolean";
      });
      if (bad) errors.push("each statement needs text (string) and isTrue (bool)");
    }
  }
  const d = Number(r.difficulty);
  if (r.difficulty !== undefined && (!Number.isInteger(d) || d < 1 || d > 5))
    errors.push("difficulty must be 1-5");
  if (r.tags !== undefined && !Array.isArray(r.tags)) errors.push("tags must be an array");
  return { raw: r, errors };
}

function validateTag(row: unknown): ValidatedTag {
  const r = (row ?? {}) as RawTag;
  const errors: string[] = [];
  if (typeof r.name !== "string" || !r.name.trim()) errors.push("name missing");
  if (r.parents !== undefined && !Array.isArray(r.parents))
    errors.push("parents must be an array");
  return { raw: r, errors };
}

function validateGroup(row: unknown): ValidatedGroup {
  const r = (row ?? {}) as RawGroup;
  const errors: string[] = [];
  if (typeof r.name !== "string" || !r.name.trim()) errors.push("name missing");
  if (r.tags !== undefined && !Array.isArray(r.tags)) errors.push("tags must be an array");
  if (r.tagIds !== undefined && !Array.isArray(r.tagIds))
    errors.push("tagIds must be an array");
  return { raw: r, errors };
}

function parseBundle(parsed: unknown): ParsedBundle {
  if (Array.isArray(parsed)) {
    return {
      cards: parsed.map(validateCard),
      tags: [],
      groups: [],
      shape: "array",
    };
  }
  if (parsed && typeof parsed === "object") {
    const obj = parsed as { cards?: unknown; tags?: unknown; groups?: unknown };
    return {
      cards: Array.isArray(obj.cards) ? obj.cards.map(validateCard) : [],
      tags: Array.isArray(obj.tags) ? obj.tags.map(validateTag) : [],
      groups: Array.isArray(obj.groups) ? obj.groups.map(validateGroup) : [],
      shape: "bundle",
    };
  }
  return { cards: [], tags: [], groups: [], shape: "array" };
}

const mcqSample = `[
  {
    "kind": "mcq",
    "question": "What does HTML stand for?",
    "answer": "HyperText Markup Language",
    "distractors": ["Home Tool Markup Language", "Hyperlink Trail Mode Language", "High Text Machine Logic"],
    "explanation": "HTML is the standard markup language for documents on the web.",
    "hint": "It's a markup language.",
    "difficulty": 1,
    "tags": ["web", "frontend"]
  }
]`;

const tfSample = `[
  {
    "kind": "tf-sort",
    "question": "Sort each statement as True or False — advantages of \`go build\`.",
    "statements": [
      { "text": "The program starts faster because it's already compiled.", "isTrue": true },
      { "text": "The binary is reusable without recompiling each run.", "isTrue": true },
      { "text": "Go must be installed on the target machine to run the binary.", "isTrue": false },
      { "text": "It supports cross-platform builds for Windows, Linux, and macOS.", "isTrue": true },
      { "text": "Compile errors are deferred until the program is actually run.", "isTrue": false }
    ],
    "explanation": "go build produces a standalone, statically-linked binary that the target machine can run without Go installed, and catches compile errors up-front.",
    "hint": "Think about deployment and what the binary contains.",
    "difficulty": 2,
    "tags": ["go", "tooling"]
  }
]`;

const mixedSample = `[
  {
    "kind": "mcq",
    "question": "Which command compiles a Go program into a standalone binary?",
    "answer": "go build",
    "distractors": ["go run", "go install", "go compile"],
    "explanation": "go build writes the executable; go run compiles and executes in one step.",
    "hint": "It writes a file to disk.",
    "difficulty": 1,
    "tags": ["go", "tooling"]
  },
  {
    "kind": "tf-sort",
    "question": "Sort each statement as True or False — \`go build\`.",
    "statements": [
      { "text": "Produces a single binary you can ship.", "isTrue": true },
      { "text": "Requires Go on the target machine to execute the binary.", "isTrue": false }
    ],
    "explanation": "go build produces a standalone binary.",
    "hint": "",
    "difficulty": 2,
    "tags": ["go", "tooling"]
  }
]`;

const bundleSample = `{
  "cards": ${mixedSample.replace(/\n/g, "\n  ")},
  "tags": [
    { "name": "go", "parents": [] },
    { "name": "tooling", "parents": ["go"] }
  ],
  "groups": [
    { "name": "Go basics", "tags": ["go", "tooling"] }
  ]
}`;

const mcqPrompt = `Generate flashcard questions as a JSON array. Each card must follow this exact schema:

- kind:         "mcq" (literal string)
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

` + mcqSample + `

Now generate <N> cards on the topic: <TOPIC>.`;

const tfPrompt = `Generate "True / False sort" flashcards as a JSON array. Each card presents a set of statements that the learner must sort into True or False bins; the card is scored all-or-nothing. Follow this exact schema:

- kind:         "tf-sort" (literal string)
- question:     string (the framing prompt, e.g. "Sort each statement as True or False — <topic>")
- statements:   array of 4-8 objects, each:
                  - text:   string (a single claim about the topic)
                  - isTrue: boolean (whether the claim is true)
- explanation:  string (why the true ones are true and the false ones are false)
- hint:         string (a small nudge, not the answer)
- difficulty:   integer 1-5
- tags:         array of lowercase kebab-case strings

Rules:
- Output ONLY a valid JSON array. No markdown fences, no commentary.
- Each card must contain BOTH true and false statements (at least one of each).
- Make the false statements plausible — common misconceptions, not absurd claims.
- Keep each statement short and self-contained.

Example (one card):

` + tfSample + `

Now generate <N> cards on the topic: <TOPIC>.`;

type SchemaKey = "mcq" | "tf" | "mixed" | "bundle";
type PromptKey = "mcq" | "tf";

const SCHEMA_OPTIONS: { key: SchemaKey; label: string; hint: string; payload: string }[] = [
  { key: "mcq", label: "Multiple choice card", hint: "Single MCQ card array", payload: mcqSample },
  { key: "tf", label: "True / False sort card", hint: "Single tf-sort card array", payload: tfSample },
  { key: "mixed", label: "Mixed card array", hint: "MCQ + tf-sort together", payload: mixedSample },
  { key: "bundle", label: "Full bundle (cards + tags + groups)", hint: "Round-trippable export shape", payload: bundleSample },
];

const PROMPT_OPTIONS: { key: PromptKey; label: string; hint: string; payload: string }[] = [
  { key: "mcq", label: "MCQ prompt", hint: "Generate multiple-choice cards", payload: mcqPrompt },
  { key: "tf", label: "T/F sort prompt", hint: "Generate true/false sort cards", payload: tfPrompt },
];

export function ImportView() {
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = useState("");
  const [importing, setImporting] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [hoverDelete, setHoverDelete] = useState<string | null>(null);
  const [hoverKeep, setHoverKeep] = useState<string | null>(null);
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [hideMarked, setHideMarked] = useState<Set<number>>(new Set());

  function toggleMark(cardIdx: number, sIdx: number) {
    const key = `${cardIdx}:${sIdx}`;
    setMarked((m) => {
      const n = new Set(m);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }

  function shiftMarksOnStatementDelete(cardIdx: number, sIdx: number) {
    setMarked((m) => {
      const n = new Set<string>();
      for (const k of m) {
        const [ci, si] = k.split(":").map(Number);
        if (ci !== cardIdx) {
          n.add(k);
          continue;
        }
        if (si === sIdx) continue;
        n.add(si > sIdx ? `${ci}:${si - 1}` : k);
      }
      return n;
    });
  }

  function clearMarksForCard(cardIdx: number) {
    setMarked((m) => {
      const n = new Set<string>();
      for (const k of m) {
        const [ci] = k.split(":").map(Number);
        if (ci !== cardIdx) n.add(k);
      }
      return n;
    });
  }
  const [schemaOpen, setSchemaOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [schemaPreview, setSchemaPreview] = useState<SchemaKey>("mcq");
  const [dragOver, setDragOver] = useState(false);
  const [textareaFocused, setTextareaFocused] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const schemaMenuRef = useRef<HTMLDivElement>(null);
  const promptMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!schemaOpen && !promptOpen) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (schemaMenuRef.current && !schemaMenuRef.current.contains(t)) setSchemaOpen(false);
      if (promptMenuRef.current && !promptMenuRef.current.contains(t)) setPromptOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSchemaOpen(false);
        setPromptOpen(false);
      }
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onEsc);
    };
  }, [schemaOpen, promptOpen]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const min = 180;
    const next = Math.max(min, el.scrollHeight);
    el.style.height = `${next}px`;
  }, [text]);

  async function pasteFromClipboard() {
    try {
      const clip = await navigator.clipboard.readText();
      if (!clip) {
        toast("error", "Clipboard is empty");
        return;
      }
      setText(clip);
      toast("success", "Pasted from clipboard");
      textareaRef.current?.focus();
    } catch {
      toast("error", "Couldn't read clipboard");
    }
  }

  function formatJson() {
    if (!text.trim()) return;
    try {
      const parsed = JSON.parse(text);
      setText(JSON.stringify(parsed, null, 2));
      toast("success", "Formatted");
    } catch {
      toast("error", "Can't format — invalid JSON");
    }
  }

  function mutateCards(fn: (cards: Record<string, unknown>[]) => void) {
    try {
      const parsed = JSON.parse(text);
      const cardsArr: Record<string, unknown>[] = Array.isArray(parsed)
        ? (parsed as Record<string, unknown>[])
        : Array.isArray((parsed as { cards?: unknown }).cards)
        ? ((parsed as { cards: Record<string, unknown>[] }).cards)
        : [];
      fn(cardsArr);
      setText(JSON.stringify(parsed, null, 2));
    } catch {
      toast("error", "Can't edit — invalid JSON");
    }
  }

  function deleteCardAt(cardIdx: number) {
    mutateCards((cards) => {
      cards.splice(cardIdx, 1);
    });
  }

  function deleteStatementAt(cardIdx: number, sIdx: number) {
    mutateCards((cards) => {
      const c = cards[cardIdx];
      if (!c || !Array.isArray(c.statements)) return;
      (c.statements as unknown[]).splice(sIdx, 1);
    });
  }

  function updateStatementText(cardIdx: number, sIdx: number, value: string) {
    mutateCards((cards) => {
      const c = cards[cardIdx];
      if (!c || !Array.isArray(c.statements)) return;
      const s = (c.statements as Record<string, unknown>[])[sIdx];
      if (s) s.text = value;
    });
  }

  function toggleStatementBool(cardIdx: number, sIdx: number) {
    mutateCards((cards) => {
      const c = cards[cardIdx];
      if (!c || !Array.isArray(c.statements)) return;
      const s = (c.statements as Record<string, unknown>[])[sIdx];
      if (s) s.isTrue = !s.isTrue;
    });
  }

  function addStatementAt(cardIdx: number) {
    mutateCards((cards) => {
      const c = cards[cardIdx];
      if (!c) return;
      if (!Array.isArray(c.statements)) c.statements = [];
      (c.statements as unknown[]).push({ text: "", isTrue: true });
    });
  }

  function updateCardField(cardIdx: number, field: "question" | "answer", value: string) {
    mutateCards((cards) => {
      const c = cards[cardIdx];
      if (!c) return;
      c[field] = value;
    });
  }

  async function copyPayload(id: string, payload: string, label: string) {
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(id);
      toast("success", `${label} copied`);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1800);
    } catch {
      toast("error", "Couldn't copy — your browser blocked clipboard access");
    }
  }

  async function handleFile(file: File | null | undefined) {
    if (!file) return;
    try {
      const raw = await file.text();
      setText(raw);
      toast("success", `Loaded ${file.name}`);
    } catch {
      toast("error", "Couldn't read file");
    }
  }

  const { bundle, parseError } = useMemo(() => {
    if (!text.trim()) {
      return { bundle: null as ParsedBundle | null, parseError: null as string | null };
    }
    try {
      const parsed = JSON.parse(text);
      return { bundle: parseBundle(parsed), parseError: null };
    } catch (e) {
      return { bundle: null, parseError: (e as Error).message };
    }
  }, [text]);

  const cardRows = bundle?.cards ?? [];
  const tagRows = bundle?.tags ?? [];
  const groupRows = bundle?.groups ?? [];

  const validCards = cardRows.filter((r) => r.errors.length === 0);
  const validTags = tagRows.filter((r) => r.errors.length === 0);
  const validGroups = groupRows.filter((r) => r.errors.length === 0);

  const totalValid = validCards.length + validTags.length + validGroups.length;
  const totalInvalid =
    cardRows.length - validCards.length +
    (tagRows.length - validTags.length) +
    (groupRows.length - validGroups.length);

  async function doImport() {
    if (totalValid === 0) return;
    setImporting(true);
    try {
      const payload = {
        cards: validCards.map((r) => {
          const kind = r.raw.kind === "tf-sort" ? "tf-sort" : "mcq";
          return {
            kind,
            question: String(r.raw.question),
            answer: kind === "mcq" ? String(r.raw.answer) : "",
            distractors:
              kind === "mcq" && Array.isArray(r.raw.distractors)
                ? (r.raw.distractors as unknown[]).map(String)
                : [],
            statements:
              kind === "tf-sort" && Array.isArray(r.raw.statements)
                ? (r.raw.statements as Array<{ text: string; isTrue: boolean }>).map((s) => ({
                    text: String(s.text),
                    isTrue: Boolean(s.isTrue),
                  }))
                : undefined,
            explanation: r.raw.explanation ? String(r.raw.explanation) : "",
            hint: r.raw.hint ? String(r.raw.hint) : "",
            difficulty: Number(r.raw.difficulty ?? 3),
            tags: Array.isArray(r.raw.tags) ? (r.raw.tags as unknown[]).map(String) : [],
          };
        }),
        tags: validTags.map((r) => ({
          name: String(r.raw.name),
          parents: Array.isArray(r.raw.parents) ? (r.raw.parents as unknown[]).map(String) : [],
        })),
        groups: validGroups.map((r) => ({
          name: String(r.raw.name),
          tags: Array.isArray(r.raw.tags) ? (r.raw.tags as unknown[]).map(String) : [],
          tagIds: Array.isArray(r.raw.tagIds) ? (r.raw.tagIds as unknown[]).map(String) : [],
        })),
      };
      const res = await api.post("/import", payload);
      const r = res.data as {
        cards: { inserted: number };
        tags: { inserted: number; updated: number };
        groups: { inserted: number; updated: number };
      };
      const parts: string[] = [];
      if (r.cards.inserted) parts.push(`${r.cards.inserted} card${r.cards.inserted === 1 ? "" : "s"}`);
      if (r.tags.inserted) parts.push(`${r.tags.inserted} tag${r.tags.inserted === 1 ? "" : "s"}`);
      if (r.groups.inserted) parts.push(`${r.groups.inserted} group${r.groups.inserted === 1 ? "" : "s"}`);
      toast("success", parts.length ? `Imported ${parts.join(", ")}` : "Nothing to import");
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
        <h1 className="text-2xl font-bold">Import</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Paste a JSON array of cards, or a full bundle <code>{`{cards, tags, groups}`}</code>{" "}
          exported from this app. Tags are matched by name (case-insensitive) and created if
          they don&apos;t exist.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/60 overflow-hidden">
        <div className="px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100/60 dark:bg-zinc-900 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Format
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5">
              Pick a schema variant to copy, or a full AI prompt. Paste below accepts MCQ, T/F, mixed, or full bundle.
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="relative flex-1 sm:flex-initial" ref={schemaMenuRef}>
              <button
                type="button"
                onClick={() => { setSchemaOpen((o) => !o); setPromptOpen(false); }}
                aria-haspopup="menu"
                aria-expanded={schemaOpen}
                className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 sm:py-1 rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-white dark:hover:bg-zinc-800 text-xs font-medium"
                title="Copy a JSON schema example"
              >
                <CopyIcon />
                {copied?.startsWith("schema:") ? "Copied" : "Schema"}
                <ChevronDown />
              </button>
              {schemaOpen && (
                <div
                  role="menu"
                  className="absolute right-0 z-20 mt-1 w-64 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-lg p-1"
                >
                  {SCHEMA_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      role="menuitem"
                      onMouseEnter={() => setSchemaPreview(opt.key)}
                      onFocus={() => setSchemaPreview(opt.key)}
                      onClick={() => {
                        setSchemaPreview(opt.key);
                        copyPayload(`schema:${opt.key}`, opt.payload, opt.label);
                        setSchemaOpen(false);
                      }}
                      className={[
                        "w-full text-left px-2.5 py-1.5 rounded-md text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800 flex flex-col gap-0.5",
                        schemaPreview === opt.key && "bg-zinc-50 dark:bg-zinc-800/60",
                      ].filter(Boolean).join(" ")}
                    >
                      <span className="font-medium">{opt.label}</span>
                      <span className="text-[10px] text-zinc-500">{opt.hint}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative flex-1 sm:flex-initial" ref={promptMenuRef}>
              <button
                type="button"
                onClick={() => { setPromptOpen((o) => !o); setSchemaOpen(false); }}
                aria-haspopup="menu"
                aria-expanded={promptOpen}
                className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 sm:py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium"
                title="Copy a full AI-ready prompt"
              >
                <CopyIcon />
                {copied?.startsWith("prompt:") ? "Copied" : "AI prompt"}
                <ChevronDown />
              </button>
              {promptOpen && (
                <div
                  role="menu"
                  className="absolute right-0 z-20 mt-1 w-64 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-lg p-1"
                >
                  {PROMPT_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        copyPayload(`prompt:${opt.key}`, opt.payload, opt.label);
                        setPromptOpen(false);
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded-md text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800 flex flex-col gap-0.5"
                    >
                      <span className="font-medium">{opt.label}</span>
                      <span className="text-[10px] text-zinc-500">{opt.hint}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="px-3 pt-2 pb-1 flex items-center gap-1 flex-wrap border-b border-zinc-200/70 dark:border-zinc-800/70">
          <span className="text-[10px] uppercase tracking-wide text-zinc-500 mr-1">Preview:</span>
          {SCHEMA_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setSchemaPreview(opt.key)}
              className={[
                "text-[11px] px-2 py-0.5 rounded-full transition-colors",
                schemaPreview === opt.key
                  ? "bg-indigo-600 text-white"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800",
              ].join(" ")}
            >
              {opt.label.replace(" (cards + tags + groups)", "")}
            </button>
          ))}
        </div>
        <pre className="px-3 py-3 text-[11px] font-mono leading-relaxed overflow-auto text-zinc-700 dark:text-zinc-300 max-h-64">
{SCHEMA_OPTIONS.find((o) => o.key === schemaPreview)?.payload ?? mcqSample}
        </pre>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }}
        className="hidden"
      />

      <div
        role="button"
        tabIndex={0}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFile(e.dataTransfer.files?.[0]);
        }}
        className={[
          "rounded-xl border-2 border-dashed px-4 py-6 sm:py-8 text-center cursor-pointer transition-colors",
          dragOver
            ? "border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/40"
            : "border-zinc-300 dark:border-zinc-700 hover:border-indigo-400 hover:bg-zinc-50/60 dark:hover:bg-zinc-900/60",
        ].join(" ")}
      >
        <div className="mx-auto w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-2 text-zinc-500">
          <UploadIcon />
        </div>
        <div className="text-sm font-medium">
          {dragOver ? "Drop to load" : "Drop a .json file, or click to browse"}
        </div>
        <div className="text-xs text-zinc-500 mt-1">
          Accepts a card array or a full <code className="font-mono">{`{cards, tags, groups}`}</code> bundle
        </div>
      </div>

      {parseError && (
        <div className="rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
          JSON error: {parseError}
        </div>
      )}

      {(bundle && (cardRows.length + tagRows.length + groupRows.length > 0)) && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sticky top-2 z-10 shadow-sm">
          <div className="text-sm flex flex-wrap items-center gap-x-3 gap-y-1">
            {bundle.shape === "bundle" && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                Bundle
              </span>
            )}
            <span className="text-emerald-700 dark:text-emerald-400 font-medium">
              {totalValid} valid
            </span>
            {totalInvalid > 0 && (
              <span className="text-rose-700 dark:text-rose-400 font-medium">
                {totalInvalid} invalid
              </span>
            )}
          </div>
          <button
            onClick={doImport}
            disabled={importing || totalValid === 0}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium disabled:opacity-50 text-sm whitespace-nowrap"
          >
            {importing
              ? "Importing…"
              : totalValid === 0
              ? "Nothing to import"
              : `Import ${[
                  validCards.length && `${validCards.length} card${validCards.length === 1 ? "" : "s"}`,
                  validTags.length && `${validTags.length} tag${validTags.length === 1 ? "" : "s"}`,
                  validGroups.length && `${validGroups.length} group${validGroups.length === 1 ? "" : "s"}`,
                ].filter(Boolean).join(", ")}`}
          </button>
        </div>
      )}

      {cardRows.length > 0 && (
        <Section title={`Cards (${cardRows.length})`}>
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {cardRows.map((r, i) => {
              const isTf = r.raw.kind === "tf-sort";
              const isOpen = expanded.has(i);
              const statements = Array.isArray(r.raw.statements)
                ? (r.raw.statements as Array<{ text?: unknown; isTrue?: unknown }>)
                : [];
              const tagList = Array.isArray(r.raw.tags) ? (r.raw.tags as string[]) : [];
              return (
                <li
                  key={i}
                  className={[
                    "px-3 py-2.5",
                    r.errors.length > 0 && "bg-rose-50/60 dark:bg-rose-950/30",
                  ].filter(Boolean).join(" ")}
                >
                  <div className="flex items-start gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded((s) => {
                          const n = new Set(s);
                          if (n.has(i)) n.delete(i);
                          else n.add(i);
                          return n;
                        })
                      }
                      className="shrink-0 w-5 h-5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 inline-flex items-center justify-center text-zinc-500"
                      aria-label={isOpen ? "Collapse" : "Expand"}
                    >
                      <span className={isOpen ? "rotate-90 transition-transform" : "transition-transform"}>
                        ▸
                      </span>
                    </button>
                    <span className="shrink-0 text-xs text-zinc-500 font-mono w-6 pt-0.5">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={[
                            "text-[10px] font-semibold px-1.5 py-0.5 rounded",
                            isTf
                              ? "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300"
                              : "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
                          ].join(" ")}
                        >
                          {isTf ? "T/F" : "MCQ"}
                        </span>
                        <div className="text-sm font-medium truncate">
                          {String(r.raw.question ?? "—")}
                        </div>
                      </div>
                      <div className="text-xs text-zinc-500 mt-0.5 truncate">
                        {isTf
                          ? `${statements.length} statement${statements.length === 1 ? "" : "s"}`
                          : `→ ${String(r.raw.answer ?? "—")}`}
                      </div>
                      {tagList.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {tagList.map((t, ti) => (
                            <span
                              key={ti}
                              className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                      {r.errors.length > 0 && (
                        <div className="text-xs text-rose-700 dark:text-rose-300 mt-1">
                          {r.errors.join(", ")}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (!confirm("Remove this card from the paste?")) return;
                        setExpanded((s) => {
                          const n = new Set(s);
                          n.delete(i);
                          return n;
                        });
                        clearMarksForCard(i);
                        deleteCardAt(i);
                      }}
                      className="shrink-0 text-xs px-2 py-1 rounded-md text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                      title="Delete this card"
                    >
                      ✕
                    </button>
                  </div>

                  {isOpen && (
                    <div className="mt-2 ml-7 pl-3 border-l-2 border-zinc-200 dark:border-zinc-800 space-y-2">
                      <label className="block">
                        <div className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">
                          Question
                        </div>
                        <textarea
                          value={String(r.raw.question ?? "")}
                          onChange={(e) => updateCardField(i, "question", e.target.value)}
                          rows={2}
                          className="w-full font-mono text-xs px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                        />
                      </label>

                      {isTf ? (
                        (() => {
                          const markedCount = statements.reduce(
                            (acc, _, si) => (marked.has(`${i}:${si}`) ? acc + 1 : acc),
                            0
                          );
                          const isHiding = hideMarked.has(i);
                          const allIndices = statements.map((_, si) => si);
                          const keptIndices = allIndices.filter((si) => marked.has(`${i}:${si}`));
                          const restIndices = allIndices.filter((si) => !marked.has(`${i}:${si}`));
                          const renderStatement = (si: number) => {
                                  const s = statements[si];
                                  const isTrue = Boolean(s.isTrue);
                                  const hoverKey = `${i}:${si}`;
                                  const isHoverDel = hoverDelete === hoverKey;
                                  const isHoverKeep = hoverKeep === hoverKey;
                                  const isMarked = marked.has(hoverKey);
                                  return (
                                    <li
                                      key={si}
                                      className={[
                                        "flex items-center gap-1.5 rounded-md transition-colors p-1 -m-1",
                                        isHoverDel
                                          ? "bg-rose-100 dark:bg-rose-900/60 ring-2 ring-rose-500"
                                          : isHoverKeep
                                          ? "bg-emerald-100 dark:bg-emerald-900/60 ring-2 ring-emerald-500"
                                          : isMarked
                                          ? "bg-emerald-50/60 dark:bg-emerald-950/30 ring-1 ring-emerald-200 dark:ring-emerald-900"
                                          : "",
                                      ].filter(Boolean).join(" ")}
                                    >
                                      <button
                                        type="button"
                                        onClick={() => toggleStatementBool(i, si)}
                                        className={[
                                          "shrink-0 w-7 h-7 inline-flex items-center justify-center rounded text-[11px] font-bold transition-all",
                                          isTrue
                                            ? "bg-emerald-600 text-white"
                                            : "bg-rose-600 text-white",
                                          isHoverDel && "opacity-50",
                                        ].filter(Boolean).join(" ")}
                                        title={isTrue ? "True (click to flip)" : "False (click to flip)"}
                                      >
                                        {isTrue ? "T" : "F"}
                                      </button>
                                      <input
                                        value={String(s.text ?? "")}
                                        onChange={(e) => updateStatementText(i, si, e.target.value)}
                                        placeholder={`Statement ${si + 1}`}
                                        className={[
                                          "flex-1 min-w-0 text-xs px-2 py-1.5 rounded border bg-white dark:bg-zinc-900 transition-all",
                                          isHoverDel
                                            ? "border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300"
                                            : "border-zinc-300 dark:border-zinc-700",
                                        ].join(" ")}
                                      />
                                      <button
                                        type="button"
                                        onClick={() => toggleMark(i, si)}
                                        onMouseEnter={() => setHoverKeep(hoverKey)}
                                        onMouseLeave={() =>
                                          setHoverKeep((c) => (c === hoverKey ? null : c))
                                        }
                                        onFocus={() => setHoverKeep(hoverKey)}
                                        onBlur={() =>
                                          setHoverKeep((c) => (c === hoverKey ? null : c))
                                        }
                                        className={[
                                          "shrink-0 w-7 h-7 inline-flex items-center justify-center rounded border text-[11px] font-bold transition-colors",
                                          isMarked
                                            ? "bg-emerald-600 border-emerald-600 text-white"
                                            : "border-zinc-300 dark:border-zinc-700 text-transparent hover:border-emerald-400 hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40",
                                        ].join(" ")}
                                        title={isMarked ? "Marked as keeper — click to unmark" : "Mark this statement as a keeper"}
                                        aria-pressed={isMarked}
                                        aria-label="Mark as keeper"
                                      >
                                        ✓
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          shiftMarksOnStatementDelete(i, si);
                                          deleteStatementAt(i, si);
                                        }}
                                        onMouseEnter={() => setHoverDelete(hoverKey)}
                                        onMouseLeave={() =>
                                          setHoverDelete((c) => (c === hoverKey ? null : c))
                                        }
                                        onFocus={() => setHoverDelete(hoverKey)}
                                        onBlur={() =>
                                          setHoverDelete((c) => (c === hoverKey ? null : c))
                                        }
                                        className="shrink-0 w-7 h-7 inline-flex items-center justify-center rounded text-zinc-500 hover:text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-950/60"
                                        title="Delete statement"
                                        aria-label="Delete statement"
                                      >
                                        ✕
                                      </button>
                                    </li>
                                  );
                          };
                          return (
                            <div>
                              <div className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1 flex items-center justify-between gap-2 flex-wrap">
                                <span>
                                  Statements
                                  {markedCount > 0 && (
                                    <span className="ml-1.5 normal-case tracking-normal text-emerald-700 dark:text-emerald-400">
                                      · {markedCount} kept
                                    </span>
                                  )}
                                </span>
                                <div className="flex items-center gap-1.5">
                                  {markedCount > 0 && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setHideMarked((s) => {
                                          const n = new Set(s);
                                          if (n.has(i)) n.delete(i);
                                          else n.add(i);
                                          return n;
                                        })
                                      }
                                      className={[
                                        "text-[11px] normal-case tracking-normal px-2 py-0.5 rounded border",
                                        isHiding
                                          ? "bg-indigo-600 border-indigo-600 text-white"
                                          : "border-zinc-300 dark:border-zinc-700 hover:border-indigo-400 hover:text-indigo-600",
                                      ].join(" ")}
                                      title="Hide marked statements so you can focus on the rest"
                                    >
                                      {isHiding ? "Show all" : "Hide kept"}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => addStatementAt(i)}
                                    className="text-[11px] normal-case tracking-normal px-2 py-0.5 rounded border border-dashed border-zinc-300 dark:border-zinc-700 hover:border-indigo-400 hover:text-indigo-600"
                                  >
                                    + Add statement
                                  </button>
                                </div>
                              </div>
                              {keptIndices.length > 0 && !isHiding && (
                                <div className="mb-2">
                                  <div className="text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-400 mb-1 flex items-center gap-1.5">
                                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                    Kept ({keptIndices.length})
                                  </div>
                                  <ul className="space-y-1.5 rounded-md bg-emerald-50/30 dark:bg-emerald-950/10 p-1.5 border border-dashed border-emerald-200 dark:border-emerald-900">
                                    {keptIndices.map(renderStatement)}
                                  </ul>
                                </div>
                              )}
                              {restIndices.length > 0 && (
                                <div>
                                  {keptIndices.length > 0 && !isHiding && (
                                    <div className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1 flex items-center gap-1.5">
                                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-zinc-400" />
                                      To review ({restIndices.length})
                                    </div>
                                  )}
                                  <ul className="space-y-1.5">
                                    {restIndices.map(renderStatement)}
                                  </ul>
                                </div>
                              )}
                              {statements.length === 0 && (
                                <p className="text-xs text-zinc-500 italic">No statements yet — add at least 2.</p>
                              )}
                              {statements.length > 0 && restIndices.length === 0 && (
                                <p className="text-xs text-zinc-500 italic mt-1">
                                  All {statements.length} statements marked as keepers — nothing left to review.
                                </p>
                              )}
                            </div>
                          );
                        })()
                      ) : (
                        <label className="block">
                          <div className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">
                            Answer
                          </div>
                          <input
                            value={String(r.raw.answer ?? "")}
                            onChange={(e) => updateCardField(i, "answer", e.target.value)}
                            className="w-full font-mono text-xs px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                          />
                          {Array.isArray(r.raw.distractors) && (
                            <div className="mt-1.5 text-[10px] text-zinc-500">
                              Distractors: {(r.raw.distractors as string[]).join(" · ")}
                            </div>
                          )}
                        </label>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {tagRows.length > 0 && (
        <Section title="Tags">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-900 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Parents</th>
                <th className="px-3 py-2 text-left">Errors</th>
              </tr>
            </thead>
            <tbody>
              {tagRows.map((r, i) => (
                <tr
                  key={i}
                  className={[
                    "border-t border-zinc-200 dark:border-zinc-800",
                    r.errors.length > 0 && "bg-rose-50/60 dark:bg-rose-950/30",
                  ].filter(Boolean).join(" ")}
                >
                  <td className="px-3 py-2 text-zinc-500">{i + 1}</td>
                  <td className="px-3 py-2">{String(r.raw.name ?? "—").slice(0, 60)}</td>
                  <td className="px-3 py-2 text-xs text-zinc-500">
                    {Array.isArray(r.raw.parents) ? (r.raw.parents as string[]).join(", ") : ""}
                  </td>
                  <td className="px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
                    {r.errors.join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {groupRows.length > 0 && (
        <Section title="Groups">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-900 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Tags</th>
                <th className="px-3 py-2 text-left">Errors</th>
              </tr>
            </thead>
            <tbody>
              {groupRows.map((r, i) => (
                <tr
                  key={i}
                  className={[
                    "border-t border-zinc-200 dark:border-zinc-800",
                    r.errors.length > 0 && "bg-rose-50/60 dark:bg-rose-950/30",
                  ].filter(Boolean).join(" ")}
                >
                  <td className="px-3 py-2 text-zinc-500">{i + 1}</td>
                  <td className="px-3 py-2">{String(r.raw.name ?? "—").slice(0, 60)}</td>
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
        </Section>
      )}

      <div className="flex items-center gap-3 text-xs text-zinc-500 pt-2">
        <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
        <span className="uppercase tracking-wider">or paste below</span>
        <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
      </div>

      <div
        className={[
          "rounded-xl border bg-white dark:bg-zinc-900 overflow-hidden transition-colors",
          textareaFocused
            ? "border-indigo-400 dark:border-indigo-600 ring-2 ring-indigo-100 dark:ring-indigo-950"
            : parseError
            ? "border-rose-300 dark:border-rose-800"
            : "border-zinc-300 dark:border-zinc-700",
        ].join(" ")}
      >
        <div className="px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/60 flex items-center justify-between gap-2">
          <div className="text-[11px] uppercase tracking-wide font-semibold text-zinc-500">
            JSON
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={pasteFromClipboard}
              className="px-2 py-1 rounded-md text-[11px] font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              title="Paste from clipboard"
            >
              Paste
            </button>
            <button
              type="button"
              onClick={formatJson}
              disabled={!text.trim()}
              className="px-2 py-1 rounded-md text-[11px] font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:hover:bg-transparent"
              title="Pretty-print the JSON"
            >
              Format
            </button>
            <button
              type="button"
              onClick={() => { setText(""); textareaRef.current?.focus(); }}
              disabled={!text}
              className="px-2 py-1 rounded-md text-[11px] font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:hover:bg-transparent"
              title="Clear the text area"
            >
              Clear
            </button>
          </div>
        </div>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setTextareaFocused(true)}
          onBlur={() => setTextareaFocused(false)}
          onKeyDown={(e) => {
            if (e.key === "Tab") {
              e.preventDefault();
              const el = e.currentTarget;
              const start = el.selectionStart;
              const end = el.selectionEnd;
              const next = text.slice(0, start) + "  " + text.slice(end);
              setText(next);
              requestAnimationFrame(() => {
                el.selectionStart = el.selectionEnd = start + 2;
              });
            }
          }}
          placeholder={mcqSample}
          spellCheck={false}
          className="w-full font-mono text-xs px-3 py-3 bg-transparent resize-none focus:outline-none leading-relaxed min-h-[180px]"
          style={{ overflow: "hidden" }}
        />
        <div className="px-3 py-1.5 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/60 flex items-center justify-between text-[11px] text-zinc-500">
          <div>
            {text
              ? `${text.split("\n").length} lines · ${text.length.toLocaleString()} chars`
              : "Empty"}
          </div>
          <div>
            {parseError ? (
              <span className="text-rose-600 dark:text-rose-400">Invalid JSON</span>
            ) : bundle ? (
              <span className="text-emerald-600 dark:text-emerald-400">Valid JSON</span>
            ) : (
              <span>Tip: ⇥ inserts two spaces</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">{title}</h2>
      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        {children}
      </div>
    </div>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function ChevronDown() {
  return (
    <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
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
