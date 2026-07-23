const RE = /==(.+?)==/g;

export function parseCloze(text: string): { segments: string[]; answers: string[] } {
  const segments: string[] = [];
  const answers: string[] = [];
  let last = 0;
  for (const m of text.matchAll(RE)) {
    segments.push(text.slice(last, m.index));
    answers.push(m[1].trim());
    last = m.index + m[0].length;
  }
  segments.push(text.slice(last));
  return { segments, answers };
}

export function gradeCloze(answers: string[], filled: string[]): boolean {
  if (answers.length === 0) return false;
  return answers.every(
    (a, i) => (filled[i] ?? "").trim().toLowerCase() === a.trim().toLowerCase()
  );
}
