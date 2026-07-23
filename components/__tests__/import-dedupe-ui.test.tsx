import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { ImportView } from "@/app/import/ImportView";
import { api } from "@/lib/api";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/components/Toast", () => ({
  useToast: () => vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockResolvedValue({
      data: [
        {
          id: "existing-1",
          kind: "mcq",
          question: "Existing Q",
          answer: "A",
          distractors: ["a", "b", "c"],
          explanation: "",
          hint: "",
          difficulty: 3,
          tags: [],
          createdAt: "",
        },
      ],
    }),
    post: vi.fn().mockResolvedValue({
      data: {
        cards: { inserted: 1 },
        tags: { inserted: 0, updated: 0 },
        groups: { inserted: 0, updated: 0 },
      },
    }),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

test("flags duplicate card and skip-duplicates excludes it from the save payload", async () => {
  render(<ImportView />);

  await waitFor(() => expect(api.get).toHaveBeenCalledWith("/cards"));

  const payload = JSON.stringify([
    {
      kind: "mcq",
      question: "Existing Q",
      answer: "A",
      distractors: ["a", "b", "c"],
      difficulty: 3,
      tags: [],
    },
    {
      kind: "mcq",
      question: "Brand New Q",
      answer: "B",
      distractors: ["a", "b", "c"],
      difficulty: 3,
      tags: [],
    },
  ]);

  const textarea = screen.getByLabelText("JSON input");
  fireEvent.change(textarea, { target: { value: payload } });

  await waitFor(() => expect(screen.getByText("Duplicate")).toBeInTheDocument());
  expect(screen.getByText(/1 new/i)).toBeInTheDocument();
  expect(screen.getByText(/1 duplicate/i)).toBeInTheDocument();

  const skipCheckbox = screen.getByRole("checkbox", { name: /skip duplicates/i });
  expect(skipCheckbox).toBeChecked();

  const importBtn = screen.getByRole("button", { name: /Import/ });
  fireEvent.click(importBtn);

  await waitFor(() => expect(api.post).toHaveBeenCalled());
  const sentPayload = (api.post as ReturnType<typeof vi.fn>).mock.calls[0][1] as {
    cards: { question: string }[];
  };
  expect(sentPayload.cards).toHaveLength(1);
  expect(sentPayload.cards[0].question).toBe("Brand New Q");
});

test("unchecking skip duplicates includes the duplicate in the save payload", async () => {
  render(<ImportView />);

  await waitFor(() => expect(api.get).toHaveBeenCalledWith("/cards"));

  const payload = JSON.stringify([
    {
      kind: "mcq",
      question: "Existing Q",
      answer: "A",
      distractors: ["a", "b", "c"],
      difficulty: 3,
      tags: [],
    },
  ]);

  const textarea = screen.getByLabelText("JSON input");
  fireEvent.change(textarea, { target: { value: payload } });

  await waitFor(() => expect(screen.getByText("Duplicate")).toBeInTheDocument());

  const skipCheckbox = screen.getByRole("checkbox", { name: /skip duplicates/i });
  fireEvent.click(skipCheckbox);
  expect(skipCheckbox).not.toBeChecked();

  const importBtn = screen.getByRole("button", { name: /Import/ });
  fireEvent.click(importBtn);

  await waitFor(() => expect(api.post).toHaveBeenCalled());
  const sentPayload = (api.post as ReturnType<typeof vi.fn>).mock.calls[0][1] as {
    cards: { question: string }[];
  };
  expect(sentPayload.cards).toHaveLength(1);
  expect(sentPayload.cards[0].question).toBe("Existing Q");
});

test("bulk tags input applies tags to all previewed cards via mutateCards", async () => {
  render(<ImportView />);

  await waitFor(() => expect(api.get).toHaveBeenCalledWith("/cards"));

  const payload = JSON.stringify([
    {
      kind: "mcq",
      question: "Brand New Q",
      answer: "B",
      distractors: ["a", "b", "c"],
      difficulty: 3,
      tags: ["existing-tag"],
    },
  ]);

  const textarea = screen.getByLabelText("JSON input") as HTMLTextAreaElement;
  fireEvent.change(textarea, { target: { value: payload } });

  const bulkInput = await screen.findByPlaceholderText(/comma-separated tags/i);
  fireEvent.change(bulkInput, { target: { value: "video, Existing-Tag" } });
  fireEvent.click(screen.getByRole("button", { name: /Apply/i }));

  await waitFor(() => {
    const parsed = JSON.parse(textarea.value);
    expect(parsed[0].tags.sort()).toEqual(["existing-tag", "video"]);
  });
});
