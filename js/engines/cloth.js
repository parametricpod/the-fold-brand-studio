// cloth.js — a Verlet cloth printed with a Lattelier lattice: quilted space-time.
// The cloth is real physics (drag it, wind, re-pin it). Printed on the fabric is a
// seeded coordinate grid — present, but broken: bent by gravity-well masses, patched
// like a quilt where the field condenses, dotted and stitched like a diagram, and
// occasionally torn open by a void spanned with chords (after Spencer's Lattelier
// artifacts). The cloth's billow then warps the printed grid a second time — the
// algorithm meets the imperfection of analog process.
import { liveCanvas } from "../live.js";
import { rng, makeFlow, clamp } from "../util.js";

const TAU = Math.PI * 2;
function windPhases(seed) { const r = rng((seed || 1) >>> 0); return [r() * 6.283, r() * 6.283, r() * 6.283, r() * 6.283]; }

export default {
  id: "cloth",
  label: "Cloth",
  kind: "live",
  blurb: "Quilted space-time: a Lattelier lattice printed on real cloth physics. The grid is present, but broken — bent by seeded masses, patched, stitched, torn. Drag it, add wind.",
  params: [
    { key: "cols",   label: "Weave (cols)", min: 8,  max: 36, step: 1,    default: 22 },
    { key: "drop",   label: "Drape",        min: 0.2,max: 1,  step: 0.01, default: 0.7 },
    { key: "gravity",label: "Gravity",      min: 0,  max: 1.2,step: 0.01, default: 0.5 },
    { key: "wind",   label: "Wind",         min: 0,  max: 1,  step: 0.01, default: 0.2 },
    { key: "stiff",  label: "Stiffness",    min: 1,  max: 5,  step: 1,    default: 3 },
    { key: "shade",  label: "Shading",      min: 0,  max: 1,  step: 0.01, default: 0.8 },
    { key: "grid",   label: "Lattice density", min: 8, max: 32, step: 1,  default: 18 },
    { key: "warpA",  label: "Space-time warp", min: 0, max: 1, step: 0.01, default: 0.45 },
    { key: "patch",  label: "Patchwork",       min: 0, max: 1, step: 0.01, default: 0.35 },
    { key: "marks",  label: "Diagram marks",   min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: "pins",   label: "Pin count",    min: 2,  max: 8,  step: 1,    default: 3 },
    { key: "editPins", label: "Edit pins (click)", min: 0, max: 1, step: 1, default: 0 },
  ],

  mount(host, ctx) {
    let P = ctx.params, colors = ctx.colors, ink = ctx.ink, ground = ctx.ground, seed = ctx.seed;
    let pts = [], links = [], cols = 0, rows = 0, spacing = 0, grabbed = null, buildKey = "";
    let ph = windPhases(ctx.seed);
    let pattern = null, patKey = "";

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
      buildKey = [cols, P.drop, Math.round(P.pins), Math.round(w), Math.round(h)].join("|");
    }

    // ---- the Lattelier layer: built once per seed/param change, in cloth-UV space.
    // Every element is stored as warped UV coordinates; per frame they're mapped to
    // screen through the live cloth (bilinear over the physics grid).
    function buildPattern() {
      const r = rng((seed >>> 0) * 977 + 13);
      const A = rows / Math.max(1, cols);                 // v is this much "taller" than u in world
      const uvDist = (u1, v1, u2, v2) => Math.hypot(u1 - u2, (v1 - v2) * A);
      const G = Math.round(P.grid), Gv = Math.max(4, Math.round(G * A));

      // gravity-well masses — the space-time events the quilt condenses around
      const nm = 2 + Math.floor(r() * 3);
      const masses = [];
      for (let i = 0; i < nm; i++) masses.push({
        x: 0.12 + 0.76 * r(), y: 0.12 + 0.76 * r(),
        rad: 0.1 + 0.22 * r(), s: (r() < 0.55 ? -1 : 1) * (0.35 + 0.65 * r()),
      });
      const wobF = makeFlow(Math.floor(r() * 1e9) || 7);
      const nzF = makeFlow(Math.floor(r() * 1e9) || 11);
      const nz = (u, v) => nzF(u * 700, v * 700) / TAU;   // cheap scalar noise 0..1
      const warp = (u, v) => {
        let du = 0, dv = 0;
        for (const m of masses) {
          const vx = u - m.x, vy = v - m.y, d = uvDist(u, v, m.x, m.y) + 1e-5;
          const f = m.s * Math.exp(-(d * d) / (2 * m.rad * m.rad)) * 0.5 * P.warpA * m.rad;
          du += (vx / d) * f; dv += (vy / d) * f;
        }
        const a = wobF(u * 900, v * 900), wob = 0.013 * P.warpA;
        return [u + du + Math.cos(a) * wob, v + dv + Math.sin(a) * wob];
      };

      // void event — a tear in the lattice, spanned by a few chords
      const hasVoid = r() < 0.8 && P.marks > 0.12;
      const vm = hasVoid ? (masses.find((m) => m.s < 0) || masses[0]) : null;
      const voidC = vm ? warp(vm.x, vm.y) : null;
      const voidR = vm ? (0.06 + 0.08 * r()) * (0.6 + 0.8 * P.warpA) : 0;
      const inVoid = (w, k = 1) => voidC && uvDist(w[0], w[1], voidC[0], voidC[1]) < voidR * k;

      // lattice polylines (break where they cross the void)
      const lines = [], SAMP = 40;
      const emit = (uvFn) => {
        let cur = [];
        for (let s = 0; s <= SAMP; s++) {
          const [u, v] = uvFn(s / SAMP), w = warp(u, v);
          if (inVoid(w)) { if (cur.length > 1) lines.push(cur); cur = []; continue; }
          cur.push(w);
        }
        if (cur.length > 1) lines.push(cur);
      };
      for (let i = 0; i <= G; i++)  emit((t) => [i / G, t]);
      for (let j = 0; j <= Gv; j++) emit((t) => [t, j / Gv]);

      // quilt patches — denser where the field condenses (near masses)
      const patches = [];
      for (let i = 0; i < G; i++) for (let j = 0; j < Gv; j++) {
        const cu = (i + 0.5) / G, cv = (j + 0.5) / Gv;
        let boost = 0;
        for (const m of masses) { const d = uvDist(cu, cv, m.x, m.y); boost += Math.exp(-(d * d) / (2 * m.rad * m.rad)); }
        const prob = P.patch * (0.16 + 0.7 * nz(cu, cv) + 0.55 * boost) * 0.6;
        if (r() >= prob) continue;
        const wc = warp(cu, cv);
        if (inVoid(wc, 1.05)) continue;
        const poly = [], E = 6;
        const edges = [
          [i / G, j / Gv, (i + 1) / G, j / Gv], [(i + 1) / G, j / Gv, (i + 1) / G, (j + 1) / Gv],
          [(i + 1) / G, (j + 1) / Gv, i / G, (j + 1) / Gv], [i / G, (j + 1) / Gv, i / G, j / Gv],
        ];
        for (const [ua, va, ub, vb] of edges) for (let s = 0; s < E; s++) { const t = s / E; poly.push(warp(ua + (ub - ua) * t, va + (vb - va) * t)); }
        const inky = r() < 0.08;
        const ci = 1 + Math.floor(r() * Math.max(1, colors.length - 1));
        patches.push({ poly, color: inky ? ink : (colors[ci] || colors[0] || ink), alpha: inky ? 0.22 : 0.38 + 0.34 * r() });
      }

      // diagram nodes at lattice intersections
      const nodes = [];
      for (let i = 0; i <= G; i++) for (let j = 0; j <= Gv; j++) {
        const u = i / G, v = j / Gv;
        if (r() >= P.marks * (0.14 + 0.5 * nz(u + 0.31, v + 0.77))) continue;
        const w = warp(u, v);
        if (inVoid(w)) continue;
        nodes.push({ p: w, r: 1.1 + 1.3 * r() });
      }

      // stitch runs — dashed quilting along random stretches of the lattice
      const stitches = [];
      const ns = Math.round(P.marks * 7);
      for (let k = 0; k < ns; k++) {
        const vert = r() < 0.5, line = Math.floor(r() * ((vert ? G : Gv) + 1));
        const t0 = r() * 0.7, len = 0.12 + 0.3 * r();
        const run = []; let hit = false;
        for (let s = 0; s <= 16; s++) {
          const t = clamp(t0 + len * (s / 16), 0, 1);
          const w = warp(vert ? line / G : t, vert ? t : line / Gv);
          if (inVoid(w)) { hit = true; break; }
          run.push(w);
        }
        if (!hit && run.length > 1) stitches.push(run);
      }

      // void rim + chords (straight spans, gently bent by the warp they cross)
      let rim = null; const chords = [];
      if (voidC) {
        rim = [];
        for (let s = 0; s <= 64; s++) { const a = (s / 64) * TAU; rim.push([voidC[0] + Math.cos(a) * voidR, voidC[1] + (Math.sin(a) * voidR) / A]); }
        const nc = 2 + Math.floor(r() * 4);
        for (let k = 0; k < nc; k++) {
          const a1 = r() * TAU, a2 = a1 + 0.6 + r() * 2.2;
          const p1 = [voidC[0] + Math.cos(a1) * voidR, voidC[1] + (Math.sin(a1) * voidR) / A];
          const p2 = [voidC[0] + Math.cos(a2) * voidR, voidC[1] + (Math.sin(a2) * voidR) / A];
          const ch = [];
          for (let s = 0; s <= 12; s++) { const t = s / 12; ch.push([p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t]); }
          chords.push(ch);
        }
      }

      pattern = { lines, patches, nodes, stitches, rim, chords };
    }

    const live = liveCanvas(host, {
      onFrame(c, w, h, t, pointer) {
        if (!pts.length || buildKey !== [Math.round(P.cols), P.drop, Math.round(P.pins), Math.round(w), Math.round(h)].join("|")) build(w, h);
        const pk = [seed, Math.round(P.grid), P.warpA, P.patch, P.marks, cols, rows, (colors || []).join(","), ink].join("|");
        if (pk !== patKey) { buildPattern(); patKey = pk; }

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

        // ---- render --------------------------------------------------------
        c.clearRect(0, 0, w, h);
        const idx = (x, y) => y * (cols + 1) + x;
        // map a (warped) UV point to screen through the live cloth
        const mapUV = (u, v) => {
          const fx = clamp(u, 0, 1) * cols, fy = clamp(v, 0, 1) * rows;
          const x0 = Math.min(cols - 1, Math.floor(fx)), y0 = Math.min(rows - 1, Math.floor(fy));
          const tx = fx - x0, ty = fy - y0;
          const a = pts[idx(x0, y0)], b = pts[idx(x0 + 1, y0)], d2 = pts[idx(x0 + 1, y0 + 1)], e = pts[idx(x0, y0 + 1)];
          return [
            (a.x * (1 - tx) + b.x * tx) * (1 - ty) + (e.x * (1 - tx) + d2.x * tx) * ty,
            (a.y * (1 - tx) + b.y * tx) * (1 - ty) + (e.y * (1 - tx) + d2.y * tx) * ty,
          ];
        };
        const poly = (arr, close) => {
          c.beginPath();
          for (let i = 0; i < arr.length; i++) { const [X, Y] = mapUV(arr[i][0], arr[i][1]); if (i === 0) c.moveTo(X, Y); else c.lineTo(X, Y); }
          if (close) c.closePath();
        };

        // pale cloth field, shaded by fold compression (the fabric itself)
        const base = mix(colors[0] || ink, ground, 0.88);
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            const a = pts[idx(x, y)], b = pts[idx(x + 1, y)], d2 = pts[idx(x + 1, y + 1)], e = pts[idx(x, y + 1)];
            const stretch = Math.hypot(b.x - a.x, b.y - a.y) / spacing;
            const dark = Math.max(0, Math.min(1, (stretch - 1) * 1.6));   // folds read as soft shadow
            c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.lineTo(d2.x, d2.y); c.lineTo(e.x, e.y); c.closePath();
            c.fillStyle = mix(base, ink, P.shade * dark * 0.32);
            c.fill();
          }
        }

        if (pattern) {
          // quilt patches (under the lattice lines)
          for (const p of pattern.patches) {
            c.globalAlpha = p.alpha; c.fillStyle = p.color;
            poly(p.poly, true); c.fill();
          }
          c.globalAlpha = 1;
          // the bent coordinate grid
          c.strokeStyle = rgba(ink, 0.5); c.lineWidth = 1; c.lineJoin = "round";
          for (const ln of pattern.lines) { poly(ln); c.stroke(); }
          // dashed stitch runs
          c.setLineDash([5, 5]); c.strokeStyle = rgba(colors[0] || ink, 0.85); c.lineWidth = 1.4;
          for (const st of pattern.stitches) { poly(st); c.stroke(); }
          c.setLineDash([]);
          // diagram nodes
          c.fillStyle = rgba(ink, 0.8);
          for (const n of pattern.nodes) { const [X, Y] = mapUV(n.p[0], n.p[1]); c.beginPath(); c.arc(X, Y, n.r, 0, 7); c.fill(); }
          // the void: rim + chords
          if (pattern.rim) {
            c.strokeStyle = rgba(ink, 0.65); c.lineWidth = 1.2; poly(pattern.rim, true); c.stroke();
            c.strokeStyle = rgba(ink, 0.4); c.lineWidth = 0.8;
            for (const ch of pattern.chords) { poly(ch); c.stroke(); }
          }
          // perimeter stitch — the quilt's binding
          c.setLineDash([4, 6]); c.strokeStyle = rgba(ink, 0.45); c.lineWidth = 1.2;
          c.beginPath();
          for (let x = 0; x <= cols; x++) { const p = pts[idx(x, 0)]; x === 0 ? c.moveTo(p.x, p.y) : c.lineTo(p.x, p.y); }
          for (let y = 1; y <= rows; y++) { const p = pts[idx(cols, y)]; c.lineTo(p.x, p.y); }
          for (let x = cols - 1; x >= 0; x--) { const p = pts[idx(x, rows)]; c.lineTo(p.x, p.y); }
          for (let y = rows - 1; y >= 1; y--) { const p = pts[idx(0, y)]; c.lineTo(p.x, p.y); }
          c.closePath(); c.stroke(); c.setLineDash([]);
        }

        // pins
        c.fillStyle = ink;
        for (const p of pts) if (p.pin) { c.beginPath(); c.arc(p.x, p.y, 3, 0, 7); c.fill(); }
      },
    });

    return {
      update(nc) { P = nc.params; colors = nc.colors; ink = nc.ink; ground = nc.ground; seed = nc.seed; ph = windPhases(nc.seed); },
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
function rgba(h, a) { const p = hex(h); return `rgba(${p[0]},${p[1]},${p[2]},${a})`; }
function hex(h) {
  if (String(h).startsWith("rgb")) return String(h).match(/\d+/g).slice(0, 3).map(Number); // mix() output is re-mixable
  const n = parseInt(String(h).replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
