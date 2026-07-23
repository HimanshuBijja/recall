import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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
  useSearchParams: () => new URLSearchParams("due=1"),
}));

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn().mockResolvedValue({ data: { id: "session-abc" } }),
  },
}));

const mockCard1: Card = {
  id: "card-due-1",
  kind: "mcq",
  question: "Question due 1",
  answer: "Answer A",
  distractors: ["B", "C", "D"],
  explanation: "",
  hint: "",
  difficulty: 3,
  tags: [],
  createdAt: "",
};

test("loads due batch, completes it, and finishes session via prompt", async () => {
  // Mock API get for initial load
  vi.mocked(api.get).mockResolvedValueOnce({
    data: {
      dueIds: ["card-due-1"],
      newIds: [],
    },
  });

  render(<TestSession cards={[mockCard1]} tags={[]} />);

  // Wait for the card to load
  await waitFor(() => {
    expect(screen.getByText("Question due 1")).toBeInTheDocument();
  });

  // Select correct answer
  const correctOption = screen.getByRole("button", { name: /Answer A/ });
  fireEvent.click(correctOption);

  // Rate confidence Good (2)
  const rateGood = screen.getByRole("button", { name: /OK/ });
  fireEvent.click(rateGood);

  // Batch complete screen should show
  await waitFor(() => {
    expect(screen.getByText("Batch complete!")).toBeInTheDocument();
  });

  // Mock API get for load more (empty)
  vi.mocked(api.get).mockResolvedValueOnce({
    data: {
      dueIds: [],
      newIds: [],
    },
  });

  // Verify Finish session saves
  const finishBtn = screen.getByRole("button", { name: "Finish session" });
  fireEvent.click(finishBtn);

  await waitFor(() => {
    expect(api.post).toHaveBeenCalledWith("/sessions", expect.objectContaining({
      results: [
        expect.objectContaining({
          cardId: "card-due-1",
          correct: true,
          confidence: 2,
        }),
      ],
    }));
  });
});
