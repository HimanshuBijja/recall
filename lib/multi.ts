/**
 * All-or-nothing scoring for the `multi` card kind: the learner's picked
 * options must be exactly the set of correct answers — no misses, no extras.
 * Comparison is trimmed and order-independent. Kept dependency-free so it can
 * be imported by client components (see CLAUDE.md: no DB code in client bundles).
 */
export function gradeMulti(correct: string[], picked: string[]): boolean {
  const norm = (s: string) => s.trim();
  const c = new Set(correct.map(norm).filter(Boolean));
  const p = new Set(picked.map(norm).filter(Boolean));
  if (c.size === 0 || c.size !== p.size) return false;
  for (const x of c) if (!p.has(x)) return false;
  return true;
}
