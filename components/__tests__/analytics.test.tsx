import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { AnalyticsView } from "../../app/analytics/AnalyticsView";
import type { Card, Session, Tag, Review } from "@/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

// Mock ResponsiveContainer from recharts since SVG measuring fails in JSDOM
vi.mock("recharts", async (importOriginal) => {
  const original = await importOriginal<typeof import("recharts")>();
  return {
    ...original,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 800, height: 600 }}>{children}</div>
    ),
  };
});

const mockCards: Card[] = [
  { id: "c1", question: "Q1", answer: "A", distractors: [], explanation: "", hint: "", difficulty: 3, tags: ["t1"], createdAt: "" }
];
const mockTags: Tag[] = [{ id: "t1", name: "Tag 1", parents: [] }];
const mockSessions: Session[] = [
  {
    id: "s1",
    tagIds: ["t1"],
    results: [{ cardId: "c1", correct: true, timeTaken: 1000, confidence: 3 }],
    score: 100,
    completedAt: new Date().toISOString(),
  }
];
const mockReviews: Review[] = [
  {
    cardId: "c1",
    dueAt: new Date().toISOString(),
    lastReviewedAt: new Date().toISOString(),
    firstSeenAt: new Date().toISOString(),
    fsrs: { stability: 1.5, difficulty: 2.0, elapsed_days: 1, scheduled_days: 2, reps: 2, state: 2, last_review: new Date().toISOString(), due: new Date().toISOString() },
  }
];

test("renders stats, charts, and srs forecast inside AnalyticsView", () => {
  render(<AnalyticsView sessions={mockSessions} cards={mockCards} tags={mockTags} reviews={mockReviews} />);

  // Expect main title
  expect(screen.getByRole("heading", { name: "Analytics" })).toBeInTheDocument();

  // Expect SRS retention stat card to display
  expect(screen.getByText("SRS Retention")).toBeInTheDocument();

  // Expect forecast chart title
  expect(screen.getByText("SRS review forecast")).toBeInTheDocument();
});
