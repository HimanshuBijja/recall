import { render, screen, fireEvent } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { BookmarksView } from "../../app/bookmarks/BookmarksView";
import type { Card, Tag } from "@/types";
import { api } from "@/lib/api";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: vi.fn(),
  }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    patch: vi.fn().mockResolvedValue({ data: { id: "card-1", bookmarked: false } }),
    delete: vi.fn(),
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
    bookmarked: true,
  },
];

const mockTags: Tag[] = [
  { id: "tag-1", name: "Tag 1", parents: [] },
];

test("renders bookmarked cards, unbookmarks them, and supports testing them", async () => {
  render(<BookmarksView initialCards={mockCards} tags={mockTags} />);

  // Expect heading and count
  expect(screen.getByText("Bookmarks")).toBeInTheDocument();
  expect(screen.getByText("1 bookmarked card")).toBeInTheDocument();

  // Test bookmarks button should navigate to sessions with correct IDs
  const testBtn = screen.getByRole("button", { name: "▶ Test bookmarks" });
  expect(testBtn).toBeInTheDocument();
  fireEvent.click(testBtn);
  expect(mockPush).toHaveBeenCalledWith("/test/session?ids=card-1&shuffle=true");

  // Remove bookmark button (filled star) should remove card
  const starBtn = screen.getByRole("button", { name: "Remove bookmark" });
  expect(starBtn).toBeInTheDocument();
  fireEvent.click(starBtn);

  // Expect optimism to remove it immediately from screen
  expect(screen.queryByText("Question 1")).not.toBeInTheDocument();
  expect(api.patch).toHaveBeenCalledWith("/cards/card-1", { bookmarked: false });
});
