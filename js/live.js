// live.js — shared scaffolding for animated canvas engines (physics, morph).
// Handles DPR-correct sizing, the RAF loop, pointer state, and teardown.

export function liveCanvas(host, { onFrame, square = true } = {}) {
  const canvas = document.createElement("canvas");
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
  canvas.style.touchAction = "none";
  host.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  const state = { w: 0, h: 0, dpr: Math.min(2, window.devicePixelRatio || 1) };
  const pointer = { x: 0, y: 0, down: false, justDown: false };

  function resize() {
    const r = host.getBoundingClientRect();
    let cw = r.width, ch = r.height;
    if (square) ch = cw; // logical square for marks
    state.w = cw; state.h = ch;
    canvas.width = Math.round(cw * state.dpr);
    canvas.height = Math.round(ch * state.dpr);
    canvas.style.height = ch + "px";
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(host);

  function toLocal(e) {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * state.w, y: ((e.clientY - r.top) / r.height) * state.h };
  }
  const onDown = (e) => { const p = toLocal(e); pointer.x = p.x; pointer.y = p.y; pointer.down = true; pointer.justDown = true; canvas.setPointerCapture?.(e.pointerId); };
  const onMove = (e) => { const p = toLocal(e); pointer.x = p.x; pointer.y = p.y; };
  const onUp = () => { pointer.down = false; };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointerleave", onUp);

  let raf = 0, t0 = performance.now(), running = true;
  function loop(now) {
    if (!running) return;
    onFrame(ctx, state.w, state.h, (now - t0) / 1000, pointer);
    pointer.justDown = false;
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);

  return {
    canvas, ctx, state, pointer,
    stop() {
      running = false; cancelAnimationFrame(raf); ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointerleave", onUp);
      canvas.remove();
    },
  };
}

// Draw a smooth closed curve through points (Catmull-Rom -> bezier) on a 2D ctx.
export function closedSmooth(ctx, pts, tension = 1) {
  const n = pts.length;
  if (n < 3) return;
  ctx.beginPath();
  ctx.moveTo((pts[n - 1].x + pts[0].x) / 2, (pts[n - 1].y + pts[0].y) / 2);
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1x = p1.x + ((p2.x - p0.x) / 6) * tension;
    const c1y = p1.y + ((p2.y - p0.y) / 6) * tension;
    const c2x = p2.x - ((p3.x - p1.x) / 6) * tension;
    const c2y = p2.y - ((p3.y - p1.y) / 6) * tension;
    ctx.bezierCurveTo(c1x, c1y, c2x, c2y, p2.x, p2.y);
  }
  ctx.closePath();
}
