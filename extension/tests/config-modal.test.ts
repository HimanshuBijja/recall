import { expect, test, beforeEach } from "vitest";
import { openConfigModal, KIND_LABELS } from "../src/web/config-modal";

beforeEach(() => {
  document.body.innerHTML = "";
});

function shadow(): ShadowRoot {
  const host = document.getElementById("recall-question-config-host");
  if (!host?.shadowRoot) throw new Error("modal host not mounted");
  return host.shadowRoot;
}

test("KIND_LABELS covers every capture kind", () => {
  expect(Object.keys(KIND_LABELS).sort()).toEqual(["cloze", "flash", "match", "mcq", "multi", "tf-sort"]);
});

test("resolves with the chosen count and kind on Generate", async () => {
  const pending = openConfigModal("Some selected passage of text");
  const countInput = shadow().querySelector<HTMLInputElement>("#recall-count")!;
  const kindSelect = shadow().querySelector<HTMLSelectElement>("#recall-kind")!;
  countInput.value = "7";
  kindSelect.value = "flash";
  shadow().querySelector<HTMLButtonElement>(".generate")!.click();

  await expect(pending).resolves.toEqual({ count: 7, kind: "flash" });
  expect(document.getElementById("recall-question-config-host")).toBeNull();
});

test("resolves null on Cancel", async () => {
  const pending = openConfigModal("text");
  shadow().querySelector<HTMLButtonElement>(".cancel")!.click();
  await expect(pending).resolves.toBeNull();
});

test("clamps an out-of-range count into 1..20", async () => {
  const pending = openConfigModal("text");
  shadow().querySelector<HTMLInputElement>("#recall-count")!.value = "500";
  shadow().querySelector<HTMLButtonElement>(".generate")!.click();
  await expect(pending).resolves.toEqual({ count: 20, kind: "mcq" });
});

test("seeds the form from the initial config", async () => {
  const pending = openConfigModal("text", { count: 3, kind: "cloze" });
  expect(shadow().querySelector<HTMLInputElement>("#recall-count")!.value).toBe("3");
  expect(shadow().querySelector<HTMLSelectElement>("#recall-kind")!.value).toBe("cloze");
  shadow().querySelector<HTMLButtonElement>(".cancel")!.click();
  await pending;
});

test("shows a truncated preview of the selection", () => {
  const pending = openConfigModal("y".repeat(500));
  const preview = shadow().querySelector(".selection-preview")!.textContent ?? "";
  expect(preview.length).toBeLessThanOrEqual(163);
  expect(preview.endsWith("…")).toBe(true);
  shadow().querySelector<HTMLButtonElement>(".cancel")!.click();
  return pending;
});
