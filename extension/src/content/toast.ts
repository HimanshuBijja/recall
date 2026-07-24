export function showToast(text: string, isError = false): void {
  const el = document.createElement("div");
  el.textContent = text;
  el.style.cssText = [
    "position:fixed",
    "top:72px",
    "right:24px",
    "z-index:2147483647",
    "padding:8px 14px",
    "border-radius:4px",
    "border:1px solid #334155",
    "font:700 11px/1.4 system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    "text-transform:uppercase",
    "letter-spacing:0.05em",
    "background:#1e293b",
    `color:${isError ? "#fda4af" : "#f8fafc"}`,
    `border-color:${isError ? "#fda4af" : "#334155"}`,
    "opacity:0",
    "transition:opacity .2s",
  ].join(";");
  document.body.appendChild(el);
  requestAnimationFrame(() => {
    el.style.opacity = "1";
  });
  setTimeout(() => {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 250);
  }, 1500);
}
