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
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    post: vi.fn().mockResolvedValue({ data: { id: "session-id" } }),
  },
}));

const mockMatchCard: Card = {
  id: "card-match-1",
  kind: "match",
  question: "Match elements",
  answer: "",
  pairs: [
    { left: "A", right: "1" },
    { left: "B", right: "2" }
  ],
  distractors: [],
  explanation: "Explanation text",
  hint: "Hint text",
  difficulty: 2,
  tags: [],
  createdAt: "",
};

test("renders match card and supports interactive tapping, mistakes, and rating", async () => {
  render(<TestSession cards={[mockMatchCard]} tags={[]} />);

  // Expect text instructions
  expect(screen.getByText(/Tap a left element/)).toBeInTheDocument();

  // Find pills
  const pA = screen.getByRole("button", { name: "A" });
  const pB = screen.getByRole("button", { name: "B" });
  const p1 = screen.getByRole("button", { name: "1" });
  const p2 = screen.getByRole("button", { name: "2" });

  expect(pA).toBeInTheDocument();
  expect(pB).toBeInTheDocument();
  expect(p1).toBeInTheDocument();
  expect(p2).toBeInTheDocument();

  // Click A, then click 2 (incorrect match)
  fireEvent.click(pA);
  fireEvent.click(p2);

  // Wait for the shake timeout to clear wrongPair state
  await waitFor(() => {
    expect(pA).not.toBeDisabled();
  }, { timeout: 1000 });

  // Click A, then click 1 (correct match)
  fireEvent.click(pA);
  fireEvent.click(p1);

  // Click B, then click 2 (correct match)
  fireEvent.click(pB);
  fireEvent.click(p2);

  // Once all matched, confidence buttons should appear
  const rateBtn = screen.getByRole("button", { name: /OK/ });
  expect(rateBtn).toBeInTheDocument();
  fireEvent.click(rateBtn);

  // Verify that api.post was called with correct: false (since user made a mistake)
  expect(api.post).toHaveBeenCalledWith("/sessions", expect.objectContaining({
    results: [
      expect.objectContaining({
        cardId: "card-match-1",
        correct: false,
        confidence: 2,
      }),
    ],
  }));
});
