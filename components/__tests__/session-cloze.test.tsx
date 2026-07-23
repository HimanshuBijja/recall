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

const mockClozeCard: Card = {
  id: "card-cloze-1",
  kind: "cloze",
  question: "Fill the blank",
  answer: "",
  clozeText: "Vitest is ==awesome== and ==fast==.",
  distractors: [],
  explanation: "Explanation text",
  hint: "Hint text",
  difficulty: 2,
  tags: [],
  createdAt: "",
};

test("renders cloze card and supports typing answers, grading, and rating", async () => {
  render(<TestSession cards={[mockClozeCard]} tags={[]} />);

  // Expect text segment to be visible
  expect(screen.getByText("Vitest is")).toBeInTheDocument();
  expect(screen.getByText("and")).toBeInTheDocument();

  // Find the two input elements
  const inputs = screen.getAllByPlaceholderText("???");
  expect(inputs).toHaveLength(2);

  // Type correct answer in first, incorrect in second
  fireEvent.change(inputs[0], { target: { value: "awesome" } });
  fireEvent.change(inputs[1], { target: { value: "slow" } });

  // Submit
  const submitBtn = screen.getByRole("button", { name: /Submit/ });
  fireEvent.click(submitBtn);

  // Verify correct answer is shown next to the incorrect one
  expect(screen.getByText("fast")).toBeInTheDocument();

  // Rate confidence as Confident (3)
  const rateBtn = screen.getByRole("button", { name: /Confident/ });
  fireEvent.click(rateBtn);

  // Verify that api.post was called with correct: false (since "slow" !== "fast")
  expect(api.post).toHaveBeenCalledWith("/sessions", expect.objectContaining({
    results: [
      expect.objectContaining({
        cardId: "card-cloze-1",
        correct: false,
        confidence: 3,
      }),
    ],
  }));
});
