export type CaptureStage =
  | "capturing"
  | "generating"
  | "ready"
  | "saving"
  | "saved"
  | "queued"
  | "error";

export const STAGE_TEXT: Record<CaptureStage, string> = {
  capturing: "Capturing frame…",
  generating: "Generating card (AI)…",
  ready: "Card ready — review below",
  saving: "Saving…",
  saved: "Saved ✓",
  queued: "Server offline — queued",
  error: "Capture failed",
};

const IN_PROGRESS: CaptureStage[] = ["capturing", "generating", "saving"];
const TERMINAL: CaptureStage[] = ["ready", "saved", "queued", "error"];

export interface StatusHandle {
  set(stage: CaptureStage, message?: string): void;
  remove(): void;
  el: HTMLElement;
}

export function createStatusPill(): StatusHandle {
  const el = document.createElement("div");
  el.setAttribute("data-recall-status", "");
  el.style.cssText = [
    "position:fixed", "top:72px", "left:50%", "transform:translateX(-50%)",
    "z-index:2147483647", "display:flex", "align-items:center", "gap:10px",
    "padding:10px 16px", "border-radius:4px", "border:1px solid #334155",
    "font:700 11px/1.2 system-ui, -apple-system, BlinkMacSystemFont, sans-serif", "color:#f8fafc",
    "background:#1e293b", "text-transform:uppercase", "letter-spacing:0.05em",
    "opacity:0", "transition:opacity .18s ease",
  ].join(";");

  const spinner = document.createElement("span");
  spinner.style.cssText = [
    "width:12px", "height:12px", "border-radius:50%",
    "border:2px solid rgba(248, 250, 252, 0.2)", "border-top-color:#38bdf8",
    "animation:recall-spin .7s linear infinite", "flex:0 0 auto",
  ].join(";");

  const label = document.createElement("span");

  // keyframes live in a <style> appended once
  if (!document.getElementById("recall-status-kf")) {
    const kf = document.createElement("style");
    kf.id = "recall-status-kf";
    kf.textContent = "@keyframes recall-spin{to{transform:rotate(360deg)}}";
    (document.head ?? document.documentElement).appendChild(kf);
  }

  el.append(spinner, label);
  (document.body ?? document.documentElement).appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = "1"; });

  let removeTimer: ReturnType<typeof setTimeout> | null = null;

  function remove(): void {
    if (removeTimer) { clearTimeout(removeTimer); removeTimer = null; }
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 200);
  }

  function set(stage: CaptureStage, message?: string): void {
    label.textContent = message ?? STAGE_TEXT[stage];
    const inProgress = IN_PROGRESS.includes(stage);
    spinner.style.display = inProgress ? "" : "none";
    el.style.background = "#1e293b";
    el.style.borderColor = stage === "error" ? "#fda4af" : stage === "saved" || stage === "ready" ? "#86efac" : "#334155";
    el.style.color = stage === "error" ? "#fda4af" : stage === "saved" ? "#86efac" : "#f8fafc";
    
    if (removeTimer) { clearTimeout(removeTimer); removeTimer = null; }
    if (TERMINAL.includes(stage) && stage !== "ready") {
      removeTimer = setTimeout(remove, 1400);
    }
  }

  return { set, remove, el };
}
