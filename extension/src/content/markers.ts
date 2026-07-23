import type { MarkerRow, MarkerShape, Settings } from "../shared/types";

export function shapeCss(shape: MarkerShape): string {
  switch (shape) {
    case "circle":
      return "border-radius:50%;";
    case "square":
      return "border-radius:2px;";
    case "triangle":
      return "clip-path:polygon(50% 0,0 100%,100% 100%);";
    case "diamond":
      return "clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%);";
    case "star":
      return "clip-path:polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%);";
    default:
      return "";
  }
}

export function filterVisible(rows: MarkerRow[], settings: Settings): MarkerRow[] {
  return rows.filter((r) => settings.kinds[r.kind]?.visible !== false);
}

function formatTs(seconds: number): string {
  const s = Math.floor(seconds),
    h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

export function renderMarkers(
  bar: HTMLElement,
  rows: MarkerRow[],
  duration: number,
  settings: Settings,
  onSeek: (t: number) => void,
): void {
  bar.querySelector("#recall-markers")?.remove();
  if (duration <= 0) return;
  const visible = filterVisible(rows, settings);
  const container = document.createElement("div");
  container.id = "recall-markers";
  container.style.cssText = "position:absolute;inset:0;pointer-events:none;";
  for (const row of visible) {
    const color = row.marker?.color ?? "#facc15";
    const shape = row.marker?.shape ?? "circle";
    const dot = document.createElement("div");
    dot.className = "recall-marker";
    dot.style.cssText = [
      "position:absolute",
      "top:-3px",
      "width:8px",
      "height:8px",
      `background:${color}`,
      "border:1.5px solid #0f0f0f",
      "transform:translateX(-50%)",
      "pointer-events:auto",
      "cursor:pointer",
      "z-index:60",
      shapeCss(shape),
      `left:${(row.timestamp / duration) * 100}%`,
    ].join(";");
    dot.addEventListener("click", (e) => {
      e.stopPropagation();
      onSeek(row.timestamp);
    });
    // Native `title` tooltips lose to YouTube's instant frame preview, so
    // render our own label above the dot on hover.
    const label = document.createElement("div");
    label.className = "recall-marker-label";
    label.textContent = `${row.kind} · ${formatTs(row.timestamp)}`;
    label.style.cssText = [
      "display:none",
      "position:absolute",
      "bottom:16px",
      "left:50%",
      "transform:translateX(-50%)",
      "padding:3px 8px",
      "border-radius:4px",
      `background:${color}`,
      "color:#0f0f0f",
      "font:600 12px/1.2 Roboto,Arial,sans-serif",
      "white-space:nowrap",
      "pointer-events:none",
      "z-index:70",
      "box-shadow:0 2px 6px rgba(0,0,0,.5)",
    ].join(";");
    dot.appendChild(label);
    dot.addEventListener("mouseenter", () => {
      label.style.display = "block";
    });
    dot.addEventListener("mouseleave", () => {
      label.style.display = "none";
    });
    container.appendChild(dot);
  }
  bar.appendChild(container);
}
