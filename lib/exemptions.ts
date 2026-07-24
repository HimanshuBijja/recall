import type { Card, Group, Subject, Tag } from "@/types";
import { descendantTagIds } from "./tags";

/**
 * Computes which cards are exempted from spaced repetition.
 * A card is exempted if and only if:
 * 1. It belongs to at least one Group or Subject.
 * 2. ALL Groups and Subjects it belongs to are marked as exempted (`exempted === true`).
 *
 * If a card is in a mixture of exempted and non-exempted groups/subjects, it is included.
 * If a card belongs to no groups or subjects, it is included.
 */
export function getCardExemptionMap(
  cards: Card[],
  groups: Group[],
  subjects: Subject[],
  tags: Tag[]
): Map<string, boolean> {
  // Pre-expand tags for tag-based groups
  const groupExpandedTags = new Map<string, Set<string>>();
  for (const g of groups) {
    if (!g.videoId) {
      groupExpandedTags.set(g.id, descendantTagIds(tags, g.tagIds));
    }
  }

  // Pre-map groups to their parent subjects
  const groupSubjects = new Map<string, Subject[]>();
  for (const s of subjects) {
    for (const gid of s.groupIds) {
      const list = groupSubjects.get(gid) ?? [];
      list.push(s);
      groupSubjects.set(gid, list);
    }
  }

  const map = new Map<string, boolean>();

  for (const card of cards) {
    if (card.exempted === true) {
      map.set(card.id, true);
      continue;
    }
    const matchingGroups: Group[] = [];
    for (const g of groups) {
      if (g.videoId) {
        if (card.source?.videoId === g.videoId) {
          matchingGroups.push(g);
        }
      } else {
        const expanded = groupExpandedTags.get(g.id);
        if (expanded && card.tags.some((tid) => expanded.has(tid))) {
          matchingGroups.push(g);
        }
      }
    }

    const matchingSubjectsMap = new Map<string, Subject>();
    for (const g of matchingGroups) {
      const subs = groupSubjects.get(g.id) ?? [];
      for (const s of subs) {
        matchingSubjectsMap.set(s.id, s);
      }
    }
    const matchingSubjects = Array.from(matchingSubjectsMap.values());

    const totalAssociations = matchingGroups.length + matchingSubjects.length;
    if (totalAssociations === 0) {
      map.set(card.id, false);
    } else {
      const allExempted =
        matchingGroups.every((g) => g.exempted === true) &&
        matchingSubjects.every((s) => s.exempted === true);
      map.set(card.id, allExempted);
    }
  }

  return map;
}

/**
 * Returns only the cards that are NOT exempted from spaced repetition.
 */
export function filterExemptedCards(
  cards: Card[],
  groups: Group[],
  subjects: Subject[],
  tags: Tag[]
): Card[] {
  const exemptionMap = getCardExemptionMap(cards, groups, subjects, tags);
  return cards.filter((card) => !exemptionMap.get(card.id));
}
