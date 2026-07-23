export function getPlayerVideo(): HTMLVideoElement | null {
  return document.querySelector<HTMLVideoElement>(".html5-main-video, video");
}

// YouTube plays via MSE, so drawing the <video> to canvas does NOT taint it.
export function captureFrame(video: HTMLVideoElement): string {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) throw new Error("video has no dimensions");
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(video, 0, 0, w, h);
  return canvas.toDataURL("image/png");
}
