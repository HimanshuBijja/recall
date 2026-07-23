import { render, screen, fireEvent } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { CardForm } from "../CardForm";
import { api } from "@/lib/api";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    post: vi.fn().mockResolvedValue({ data: { id: "new-card-id" } }),
    put: vi.fn(),
  },
}));

vi.mock("@/components/Toast", () => ({
  useToast: () => vi.fn(),
}));

test("CardForm supports creating a flashcard kind", async () => {
  render(<CardForm tags={[]} />);

  // Expect standard Question field to be present initially (MCQ)
  expect(screen.getByLabelText("Question", { selector: "textarea" })).toBeInTheDocument();

  // Click on "Flashcard" button
  const flashcardBtn = screen.getByRole("button", { name: "Flashcard" });
  fireEvent.click(flashcardBtn);

  // Expect "Back (answer)" input to be present and "Correct answer" to be gone
  expect(screen.getByLabelText("Back (answer)", { selector: "input" })).toBeInTheDocument();
  expect(screen.queryByLabelText("Correct answer", { selector: "input" })).not.toBeInTheDocument();

  // Fill in question and answer
  const questionInput = screen.getByLabelText("Question", { selector: "textarea" });
  fireEvent.change(questionInput, { target: { value: "Flash Question" } });

  const answerInput = screen.getByLabelText("Back (answer)", { selector: "input" });
  fireEvent.change(answerInput, { target: { value: "Flash Answer" } });

  // Submit the form
  const submitBtn = screen.getByRole("button", { name: /Create card/i });
  fireEvent.click(submitBtn);

  // Verify api.post called with correct kind and fields
  expect(api.post).toHaveBeenCalledWith("/cards", expect.objectContaining({
    kind: "flash",
    question: "Flash Question",
    answer: "Flash Answer",
    distractors: [],
  }));
});
