// softBlob.js — a Verlet soft-body blob with turgor (internal pressure), springs,
// and damping — the blobSketch physics, ported to canvas. Grab and pull it; it
// wobbles back. A folded, breathing organic form built from clean physics.
import { liveCanvas, closedSmooth } from "../live.js";

export default {
  id: "blob",
  label: "Soft blob",
  kind: "live",
  blurb: "A pressurized soft-body — drag to deform it, watch it breathe back. Physics, not a filter.",
  params: [
    { key: "points",  label: "Points",     min: 8,   max: 64,  step: 1,    default: 28 },
    { key: "turgor",  label: "Pressure",   min: 0,   max: 1.5, step: 0.01, default: 0.6 },
    { key: "spring",  label: "Springiness",min: 0.02,max: 0.5, step: 0.01, default: 0.18 },
    { key: "damping", label: "Settle",     min: 0.6, max: 0.99,step: 0.01, default: 0.9 },
    { key: "gravity", label: "Gravity",    min: 0,   max: 1,   step: 0.01, default: 0 },
    { key: "wobble",  label: "Wobble",     min: 0,   max: 1,   step: 0.01, default: 0.15 },
    { key: "dots",    label: "Show points",min: 0,   max: 1,   step: 1,    default: 0 },
  ],

  mount(host, ctx) {
    let P = ctx.params, colors = ctx.colors, ink = ctx.ink, ground = ctx.ground;
    let verts = [], R0 = 0, A0 = 0, cx = 0, cy = 0, grabbed = -1;
    let seedCount = -1;

    function build(w, h) {
      const n = Math.round(P.points);
      cx = w / 2; cy = h / 2; R0 = Math.min(w, h) * 0.30;
      verts = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const x = cx + Math.cos(a) * R0, y = cy + Math.sin(a) * R0;
        verts.push({ x, y, px: x, py: y });
      }
      A0 = Math.PI * R0 * R0;
      seedCount = n;
    }
    function area() {
      let a = 0;
      for (let i = 0; i < verts.length; i++) {
        const p = verts[i], q = verts[(i + 1) % verts.length];
        a += p.x * q.y - q.x * p.y;
      }
      return Math.abs(a) / 2;
    }

    const live = liveCanvas(host, {
      onFrame(c, w, h, t, pointer) {
        if (!verts.length || seedCount !== Math.round(P.points)) build(w, h);
        const n = verts.length;

        // grab nearest vertex on press
        if (pointer.justDown) {
          let best = -1, bd = 1e9;
          for (let i = 0; i < n; i++) {
            const d = Math.hypot(verts[i].x - pointer.x, verts[i].y - pointer.y);
            if (d < bd) { bd = d; best = i; }
          }
          grabbed = bd < R0 * 1.2 ? best : -1;
        }
        if (!pointer.down) grabbed = -1;

        // Verlet integrate
        for (let i = 0; i < n; i++) {
          const v = verts[i];
          if (i === grabbed) { v.x = pointer.x; v.y = pointer.y; v.px = v.x; v.py = v.y; continue; }
          let vx = (v.x - v.px) * P.damping, vy = (v.y - v.py) * P.damping;
          if (P.wobble) { vx += (Math.random() - 0.5) * P.wobble * 1.5; vy += (Math.random() - 0.5) * P.wobble * 1.5; }
          v.px = v.x; v.py = v.y;
          v.x += vx; v.y += vy + P.gravity * 0.9;
        }
        // neighbour spring constraints (a few relaxation passes)
        const rest = (2 * Math.PI * R0) / n;
        for (let pass = 0; pass < 3; pass++) {
          for (let i = 0; i < n; i++) {
            const a = verts[i], b = verts[(i + 1) % n];
            const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
            const diff = ((d - rest) / d) * P.spring * 0.5;
            const ox = dx * diff, oy = dy * diff;
            if (i !== grabbed) { a.x += ox; a.y += oy; }
            if ((i + 1) % n !== grabbed) { b.x -= ox; b.y -= oy; }
          }
        }
        // turgor: push outward toward target area
        const A = area();
        const target = A0 * (1 + 1.2 * P.turgor);
        const push = ((target - A) / target) * 0.25;
        let mx = 0, my = 0; for (const v of verts) { mx += v.x; my += v.y; } mx /= n; my /= n;
        for (let i = 0; i < n; i++) {
          if (i === grabbed) continue;
          const v = verts[i]; const dx = v.x - mx, dy = v.y - my, d = Math.hypot(dx, dy) || 1;
          v.x += (dx / d) * push * R0; v.y += (dy / d) * push * R0;
        }

        // render
        c.clearRect(0, 0, w, h);
        const g = c.createLinearGradient(0, 0, w, h);
        g.addColorStop(0, colors[0] || ink);
        g.addColorStop(1, colors[1] || colors[0] || ink);
        closedSmooth(c, verts, 1);
        c.fillStyle = g; c.fill();
        c.lineWidth = 2; c.strokeStyle = ink; c.globalAlpha = 0.4; c.stroke(); c.globalAlpha = 1;
        if (P.dots) {
          c.fillStyle = ink;
          for (const v of verts) { c.beginPath(); c.arc(v.x, v.y, 3, 0, 7); c.fill(); }
        }
      },
    });

    return {
      update(nc) { P = nc.params; colors = nc.colors; ink = nc.ink; ground = nc.ground; },
      destroy() { live.stop(); },
      snapshotCanvas() { return live.canvas; },
    };
  },
};
