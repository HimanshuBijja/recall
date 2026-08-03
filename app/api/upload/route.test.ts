import { expect, test, vi, beforeEach } from "vitest";

vi.mock("@/lib/storage", () => ({
  uploadFrame: vi.fn(async () => "https://r2/references/image.png"),
}));

import { POST } from "@/app/api/upload/route";

function req(body: unknown) {
  return new Request("http://localhost/api/upload", { method: "POST", body: JSON.stringify(body) }) as never;
}

beforeEach(() => vi.clearAllMocks());

test("returns uploaded public URL", async () => {
  const res = await POST(req({
    fileDataUrl: "data:image/png;base64,AAAA",
  }));
  const json = await res.json();
  expect(res.status).toBe(200);
  expect(json.url).toBe("https://r2/references/image.png");
});

test("400 on missing fileDataUrl", async () => {
  const res = await POST(req({}));
  expect(res.status).toBe(400);
});
