import { expect, test, vi, beforeEach } from "vitest";

vi.mock("@/lib/gemini", () => ({
  editTextSelection: vi.fn(async (selection: string, prompt: string) => {
    if (prompt === "translate to Spanish") {
      return "hola";
    }
    return `edited: ${selection}`;
  }),
  editFullCard: vi.fn(async (draft: any, prompt: string) => {
    return { ...draft, question: `modified: ${draft.question}` };
  }),
}));

import { POST } from "@/app/api/edit/route";

function req(body: unknown) {
  return new Request("http://localhost/api/edit", { method: "POST", body: JSON.stringify(body) }) as never;
}

beforeEach(() => vi.clearAllMocks());

test("returns edited text from Gemini", async () => {
  const res = await POST(req({ selection: "hello", prompt: "translate to Spanish" }));
  const json = await res.json();
  expect(res.status).toBe(200);
  expect(json.ok).toBe(true);
  expect(json.editedText).toBe("hola");
});

test("returns edited full draft from Gemini", async () => {
  const draft = { kind: "mcq", question: "original q" };
  const res = await POST(req({ draft, prompt: "do changes" }));
  const json = await res.json();
  expect(res.status).toBe(200);
  expect(json.ok).toBe(true);
  expect(json.draft.question).toBe("modified: original q");
});

test("400 on missing arguments", async () => {
  const res = await POST(req({ selection: "hello" }));
  expect(res.status).toBe(400);
});
