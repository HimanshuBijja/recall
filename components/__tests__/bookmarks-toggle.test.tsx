import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { CardsBrowser } from "@/app/cards/CardsBrowser";
import type { Card, Tag } from "@/types";
import { api } from "@/lib/api";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    patch: vi.fn().mockResolvedValue({ data: { id: "card-1", bookmarked: true } }),
  },
}));

vi.mock("@/components/Toast", () => ({
  useToast: () => vi.fn(),
}));

const mockCards: Card[] = [
  {
    id: "card-1",
    kind: "mcq",
    question: "Question 1",
    answer: "Answer 1",
    distractors: ["D1", "D2", "D3"],
    explanation: "",
    hint: "",
    difficulty: 3,
    tags: ["tag-1"],
    createdAt: "",
    bookmarked: false,
  },
];

const mockTags: Tag[] = [
  { id: "tag-1", name: "Tag 1", parents: [] },
];

test("renders star bookmark button and updates it upon click", async () => {
  render(<CardsBrowser initialCards={mockCards} tags={mockTags} />);

  // Locate the bookmark toggle button
  const bookmarkBtn = screen.getByRole("button", { name: "Bookmark card" });
  expect(bookmarkBtn).toBeInTheDocument();
  expect(bookmarkBtn.textContent).toBe("☆");

  // Click it
  fireEvent.click(bookmarkBtn);

  // Expect optimistic update to filled star
  expect(bookmarkBtn.textContent).toBe("★");

  // Expect API call to have been triggered
  expect(api.patch).toHaveBeenCalledWith("/cards/card-1", { bookmarked: true });
});
