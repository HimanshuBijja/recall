import type { CardKind } from "@/types";

export function CardKindBadge({ kind }: { kind?: CardKind | string }) {
  const k = kind || "mcq";
  let bgClass = "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300";
  let label = "MCQ";
  let title = "Multiple choice card";

  if (k === "tf-sort") {
    bgClass = "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300";
    label = "T/F";
    title = "True / False sort";
  } else if (k === "flash") {
    bgClass = "bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300";
    label = "Flash";
    title = "Flashcard";
  } else if (k === "cloze") {
    bgClass = "bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300";
    label = "Cloze";
    title = "Cloze deletion";
  } else if (k === "match") {
    bgClass = "bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300";
    label = "Match";
    title = "Match pairs";
  } else if (k === "multi") {
    bgClass = "bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300";
    label = "Multi";
    title = "Multiple answers";
  }

  return (
    <span
      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border border-transparent uppercase font-mono ${bgClass}`}
      title={title}
    >
      {label}
    </span>
  );
}
