import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { AnalyticsView } from "@/app/analytics/AnalyticsView";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock("recharts", async (importOriginal) => {
  const original = await importOriginal<typeof import("recharts")>();
  return {
    ...original,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 800, height: 600 }}>{children}</div>
    ),
  };
});

test("empty data shows empty states, not broken numbers", () => {
  render(<AnalyticsView sessions={[]} cards={[]} tags={[]} reviews={[]} />);
  expect(screen.queryByText(/-Infinity|NaN/)).toBeNull();
});
