export function showToast(text: string, isError = false): void {
  const el = document.createElement("div");
  el.textContent = text;
  el.style.cssText = [
    "position:fixed",
    "top:72px",
    "right:24px",
    "z-index:2147483647",
    "padding:8px 14px",
    "border-radius:8px",
    "font:500 13px/1.4 Roboto,Arial,sans-serif",
    `background:${isError ? "#b00020" : "#0f0f0f"}`,
    "color:#fff",
    "box-shadow:0 4px 12px rgba(0,0,0,.4)",
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
