import { NextRequest } from "next/server";
import { readDb } from "@/lib/db";
import type { Card, Review, Group, Subject, Tag } from "@/types";
import { selectDue, resolveGroupCards, resolveSubjectCards } from "@/lib/due";
import { filterExemptedCards } from "@/lib/exemptions";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const newLimit = Number(searchParams.get("newLimit") ?? 20);
  const excludeStr = searchParams.get("exclude") ?? "";
  const exclude = excludeStr ? excludeStr.split(",") : [];
  const kindsStr = searchParams.get("kinds") ?? "";
  const kinds = kindsStr ? kindsStr.split(",") : [];
  const groupId = searchParams.get("groupId") ?? "";
  const subjectId = searchParams.get("subjectId") ?? "";

  const cards = await readDb<Card>("cards.json");
  const reviews = await readDb<Review>("reviews.json");
  const groups = await readDb<Group>("groups.json");
  const subjects = await readDb<Subject>("subjects.json");
  const tags = await readDb<Tag>("tags.json");

  let targetCards = cards;
  if (groupId) {
    const group = groups.find((g) => g.id === groupId);
    targetCards = group ? resolveGroupCards(group, cards, tags) : [];
  } else if (subjectId) {
    const subject = subjects.find((s) => s.id === subjectId);
    targetCards = subject ? resolveSubjectCards(subject, groups, cards, tags) : [];
  } else {
    targetCards = filterExemptedCards(cards, groups, subjects, tags);
  }

  if (kinds.length > 0) {
    targetCards = targetCards.filter((c) => kinds.includes(c.kind || "mcq"));
  }

  const shuffle = searchParams.get("shuffle") === "true";

  const now = new Date();
  const res = selectDue(targetCards, reviews, now, { newLimit, exclude, shuffle });
  return Response.json(res);
}
