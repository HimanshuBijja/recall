import { render, screen, fireEvent } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { CardsBrowser } from "@/app/cards/CardsBrowser";
import type { Card, Tag } from "@/types";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    delete: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
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
  },
  {
    id: "card-2",
    kind: "mcq",
    question: "Question 2",
    answer: "Answer 2",
    distractors: ["D1", "D2", "D3"],
    explanation: "",
    hint: "",
    difficulty: 2,
    tags: ["tag-2"],
    createdAt: "",
  },
];

const mockTags: Tag[] = [
  { id: "tag-1", name: "Tag 1", parents: [] },
  { id: "tag-2", name: "Tag 2", parents: [] },
];

test("renders cards and tests selected cards", () => {
  render(<CardsBrowser initialCards={mockCards} tags={mockTags} />);

  // The Test button should not be present since nothing is selected
  expect(screen.queryByRole("button", { name: /Test/ })).not.toBeInTheDocument();

  // Click on the first card row to select it
  const cardElement = screen.getByText("Question 1");
  fireEvent.click(cardElement);

  // Now the Test button should be present
  const testBtn = screen.getByRole("button", { name: /Test/ });
  expect(testBtn).toBeInTheDocument();

  // Click it
  fireEvent.click(testBtn);

  // Verify that router.push was called with the selected card's ID
  expect(mockPush).toHaveBeenCalledWith("/test/session?ids=card-1&shuffle=true");
});
