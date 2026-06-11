// gifExport.js — record a live engine's motion to a looping animated GIF. Grabs the
// engine canvas in real time over a few seconds and encodes with gifenc (pure ESM,
// no web worker — fits the no-build studio). Only the animated (live) engines have
// motion worth capturing; the SVG engines are static. Per-frame palettes keep the
// satin glint / phosphor bloom honest; per-frame delays make playback real-time.
// esm.run (jsDelivr) preserves gifenc's named exports; esm.sh collapses them to a default.
import { GIFEncoder, quantize, applyPalette } from "https://esm.run/gifenc@1.0.3";

export async function recordGif({ getCanvas, ground = "#ECE6E4", size = 480, fps = 18, seconds = 3, onProgress }) {
  const total = Math.max(2, Math.round(fps * seconds));
  const target = Math.round(1000 / fps);
  const tmp = document.createElement("canvas");
  tmp.width = size; tmp.height = size;
  const tctx = tmp.getContext("2d", { willReadFrequently: true });
  const gif = GIFEncoder();
  let last = performance.now();
  for (let i = 0; i < total; i++) {
    const src = getCanvas();
    tctx.fillStyle = ground; tctx.fillRect(0, 0, size, size);    // flatten — the cloth canvas is transparent
    if (src) tctx.drawImage(src, 0, 0, size, size);
    const { data } = tctx.getImageData(0, 0, size, size);
    const palette = quantize(data, 256);
    const index = applyPalette(data, palette);
    const now = performance.now();
    const delay = i === 0 ? target : Math.max(20, Math.min(200, Math.round(now - last)));
    last = now;
    gif.writeFrame(index, size, size, { palette, delay, first: i === 0, repeat: 0 });
    if (onProgress) onProgress((i + 1) / total);
    await new Promise((r) => setTimeout(r, target));            // let the engine advance ~real-time
  }
  gif.finish();
  return new Blob([gif.bytes()], { type: "image/gif" });
}
