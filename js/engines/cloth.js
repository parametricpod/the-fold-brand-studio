// cloth.js — a Verlet cloth: a grid of points pinned along the top, draping under
// gravity with wind, draggable. Rendered as a shaded fabric surface. The literal
// "Fold" — cloth caught mid-breath — as real-time physics.
import { liveCanvas } from "../live.js";
import { rng } from "../util.js";

function windPhases(seed) { const r = rng((seed || 1) >>> 0); return [r() * 6.283, r() * 6.283, r() * 6.283, r() * 6.283]; }

export default {
  id: "cloth",
  label: "Cloth",
  kind: "live",
  blurb: "Real cloth physics — drag it, add wind, watch it drape. The Fold, simulated.",
  params: [
    { key: "cols",   label: "Weave (cols)", min: 8,  max: 36, step: 1,    default: 22 },
    { key: "drop",   label: "Drape",        min: 0.2,max: 1,  step: 0.01, default: 0.7 },
    { key: "gravity",label: "Gravity",      min: 0,  max: 1.2,step: 0.01, default: 0.5 },
    { key: "wind",   label: "Wind",         min: 0,  max: 1,  step: 0.01, default: 0.2 },
    { key: "stiff",  label: "Stiffness",    min: 1,  max: 5,  step: 1,    default: 3 },
    { key: "shade",  label: "Shading",      min: 0,  max: 1,  step: 0.01, default: 0.8 },
    { key: "pins",   label: "Pin count",    min: 2,  max: 8,  step: 1,    default: 3 },
    { key: "editPins", label: "Edit pins (click)", min: 0, max: 1, step: 1, default: 0 },
  ],

  mount(host, ctx) {
    let P = ctx.params, colors = ctx.colors, ink = ctx.ink, ground = ctx.ground;
    let pts = [], links = [], cols = 0, rows = 0, spacing = 0, grabbed = null, built = -1;
    let ph = windPhases(ctx.seed);

    function build(w, h) {
      cols = Math.round(P.cols);
      spacing = (w * 0.66) / cols;
      rows = Math.max(6, Math.round((h * 0.62 * P.drop) / spacing));
      const ox = (w - cols * spacing) / 2, oy = h * 0.12;
      pts = []; links = [];
      const pinEvery = Math.max(1, Math.floor(cols / (Math.round(P.pins) - 1 || 1)));
      for (let y = 0; y <= rows; y++) {
        for (let x = 0; x <= cols; x++) {
          const px = ox + x * spacing, py = oy + y * spacing;
          const pinned = y === 0 && (x % pinEvery === 0 || x === cols);
          pts.push({ x: px, y: py, px, py, pin: pinned, ox: px, oy: py });
        }
      }
      const idx = (x, y) => y * (cols + 1) + x;
      for (let y = 0; y <= rows; y++)
        for (let x = 0; x <= cols; x++) {
          if (x < cols) links.push([idx(x, y), idx(x + 1, y)]);
          if (y < rows) links.push([idx(x, y), idx(x, y + 1)]);
        }
      built = cols * 1000 + rows;
    }

    const live = liveCanvas(host, {
      onFrame(c, w, h, t, pointer) {
        if (!pts.length || built !== Math.round(P.cols) * 1000 + rows || cols !== Math.round(P.cols)) build(w, h);

        if (pointer.justDown) {
          let bd = 1e9, bi = null;
          for (let i = 0; i < pts.length; i++) { const d = Math.hypot(pts[i].x - pointer.x, pts[i].y - pointer.y); if (d < bd) { bd = d; bi = i; } }
          if (bd < spacing * 1.5) {
            if (P.editPins) { // click toggles a pin at the nearest node
              const p = pts[bi]; p.pin = !p.pin; p.ox = p.x; p.oy = p.y; grabbed = null;
            } else grabbed = bi;
          } else grabbed = null;
        }
        if (!pointer.down) grabbed = null;

        // turbulent, seeded multi-octave wind with per-frame gusts + a little lift
        const windX = P.wind * (0.55 * Math.sin(t * 1.3 + ph[0]) + 0.35 * Math.sin(t * 3.1 + ph[1]) + 0.3 * Math.sin(t * 0.6 + ph[2]))
                    + P.wind * (Math.random() - 0.5) * 0.7;
        const windY = P.wind * 0.22 * Math.sin(t * 2.2 + ph[3]);
        for (const p of pts) {
          if (p.pin) { p.x = p.ox; p.y = p.oy; continue; }
          let vx = (p.x - p.px) * 0.98, vy = (p.y - p.py) * 0.98;
          p.px = p.x; p.py = p.y;
          p.x += vx + windX; p.y += vy + windY + P.gravity;
        }
        // dragging: a pinned node relocates its anchor; a free node is pulled
        if (grabbed != null && pointer.down) {
          const g = pts[grabbed];
          if (g.pin) { g.ox = pointer.x; g.oy = pointer.y; g.x = pointer.x; g.y = pointer.y; }
          else { g.x = pointer.x; g.y = pointer.y; g.px = pointer.x; g.py = pointer.y; }
        }

        const passes = Math.round(P.stiff);
        for (let s = 0; s < passes; s++) {
          for (const [a, b] of links) {
            const pa = pts[a], pb = pts[b];
            const dx = pb.x - pa.x, dy = pb.y - pa.y, d = Math.hypot(dx, dy) || 1;
            const diff = ((d - spacing) / d) * 0.5;
            const ox = dx * diff, oy = dy * diff;
            if (!pa.pin) { pa.x += ox; pa.y += oy; }
            if (!pb.pin) { pb.x -= ox; pb.y -= oy; }
          }
        }

        // render as shaded fabric quads
        c.clearRect(0, 0, w, h);
        const idx = (x, y) => y * (cols + 1) + x;
        const base = colors[0] || ink;
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            const a = pts[idx(x, y)], b = pts[idx(x + 1, y)], d2 = pts[idx(x + 1, y + 1)], e = pts[idx(x, y + 1)];
            // shade by horizontal stretch of the quad (folds read darker)
            const stretch = Math.hypot(b.x - a.x, b.y - a.y) / spacing;
            const lit = Math.max(0, Math.min(1, 1 - (stretch - 1) * 2));
            const shadeAmt = P.shade;
            c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.lineTo(d2.x, d2.y); c.lineTo(e.x, e.y); c.closePath();
            c.fillStyle = mix(base, ink, shadeAmt * (1 - lit) * 0.7);
            c.fill();
          }
        }
        // pins
        c.fillStyle = ink;
        for (const p of pts) if (p.pin) { c.beginPath(); c.arc(p.x, p.y, 3, 0, 7); c.fill(); }
      },
    });

    return {
      update(nc) { P = nc.params; colors = nc.colors; ink = nc.ink; ground = nc.ground; ph = windPhases(nc.seed); },
      destroy() { live.stop(); },
      snapshotCanvas() { return live.canvas; },
    };
  },
};

function mix(a, b, t) {
  const pa = hex(a), pb = hex(b);
  const r = Math.round(pa[0] + (pb[0] - pa[0]) * t);
  const g = Math.round(pa[1] + (pb[1] - pa[1]) * t);
  const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t);
  return `rgb(${r},${g},${bl})`;
}
function hex(h) {
  const n = parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
