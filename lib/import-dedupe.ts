export function cardFingerprint(c: { kind?: string; question?: string; clozeText?: string }): string {
  const kind = (c.kind ?? "mcq").toLowerCase();
  const body = (c.clozeText ?? c.question ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  return `${kind}::${body}`;
}

export function findDuplicates<T extends { kind?: string; question?: string; clozeText?: string }>(
  incoming: T[],
  existing: { kind?: string; question?: string; clozeText?: string }[],
): Set<number> {
  const seen = new Set(existing.map(cardFingerprint));
  const dup = new Set<number>();
  incoming.forEach((c, i) => { if (seen.has(cardFingerprint(c))) dup.add(i); });
  return dup;
}

export function applyBulkTags<T extends { tags?: string[] }>(cards: T[], tags: string[]): T[] {
  const add = tags.map((t) => t.trim()).filter(Boolean);
  return cards.map((c) => {
    const merged = new Map<string, string>();
    for (const t of [...(c.tags ?? []), ...add]) merged.set(t.toLowerCase(), t.toLowerCase());
    return { ...c, tags: [...merged.values()] };
  });
}
