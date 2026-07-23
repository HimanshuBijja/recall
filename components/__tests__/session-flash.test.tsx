import { render, screen, fireEvent } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { TestSession } from "../../app/test/session/TestSession";
import type { Card } from "@/types";
import { api } from "@/lib/api";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    post: vi.fn().mockResolvedValue({ data: { id: "session-id" } }),
  },
}));

const mockFlashCard: Card = {
  id: "card-flash-1",
  kind: "flash",
  question: "Flash Front Question",
  answer: "Flash Back Answer",
  distractors: [],
  explanation: "Explanation text",
  hint: "Hint text",
  difficulty: 3,
  tags: [],
  createdAt: "",
};

test("renders flashcard and supports flipping and grading", async () => {
  render(<TestSession cards={[mockFlashCard]} tags={[]} />);

  // Expect front of card to be visible (Question)
  expect(screen.getByText("Flash Front Question")).toBeInTheDocument();
  // Answer should not be visible yet
  expect(screen.queryByText("Flash Back Answer")).not.toBeInTheDocument();

  // Click card to flip it
  const cardDiv = screen.getByText("Flash Front Question").closest(".cursor-pointer");
  expect(cardDiv).not.toBeNull();
  fireEvent.click(cardDiv!);

  // Now answer and explanation should be visible
  expect(screen.getByText("Flash Back Answer")).toBeInTheDocument();
  expect(screen.getByText("Explanation text")).toBeInTheDocument();

  // Expect Know it / Review again buttons to be present
  const knowBtn = screen.getByRole("button", { name: /Know it/ });
  const reviewBtn = screen.getByRole("button", { name: /Review again/ });
  expect(knowBtn).toBeInTheDocument();
  expect(reviewBtn).toBeInTheDocument();

  // Click "Know it"
  fireEvent.click(knowBtn);

  // Verify that api.post was called to submit session with correct result
  expect(api.post).toHaveBeenCalledWith("/sessions", expect.objectContaining({
    results: [
      expect.objectContaining({
        cardId: "card-flash-1",
        correct: true,
        confidence: 3,
      }),
    ],
  }));
});
