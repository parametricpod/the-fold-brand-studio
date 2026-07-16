// warpLab.js — "Warp Lab". An explorer for space-time-warp line diagrams: a family
// of lines (rectangular lattice, polar grid, or traced streamlines) pushed and pulled
// by a handful of movable SINGULARITIES — gravity wells that dimple space and vortices
// that swirl it into a spiral. Drag the points, reseed their placement, dial the line
// spacing. Because the output is meant to read as a LOGOMARK, the whole field can be
// clipped to a contained shape (disc · ring · lens · rounded square), so a dense warp
// becomes an icon, not a full-bleed texture. It's all lines, so the SVG export is
// natively clean, editable vector. Same lineage as the Quilt engine's space-time warp,
// rebuilt as a focused, draggable, spacing-rich tool.
//
// Live view renders to a 2D canvas (fast with thousands of segments); snapshotSVG
// re-emits the identical warped polylines as vector paths under the same clip.
import { rng, smoothPath } from "../util.js";

const STAGE = 1080;
const TAU = Math.PI * 2;

// tiny hex → for line color alpha compositing we just use rgba via the hex + opacity
const clamp01 = (v) => Math.max(0, Math.min(1, v));

export default (() => {
  const engine = {
    id: "warp",
    label: "Warp Lab",
    kind: "live",
    vector: true,
    blurb: "Space-time-warp line diagrams as logomarks. A lattice / polar grid / streamlines bent by movable gravity wells & vortices. ⟳ New seed scatters the singularities · Mutate nudges them · toggle Edit points to drag. Clip to a disc/ring/lens to frame it as a mark. Exports clean vector.",
    params: [
      { key: "grid", label: "Field", type: "select", default: "rect", options: [
        { value: "rect", label: "Rectangular lattice" },
        { value: "polar", label: "Polar grid" },
        { value: "stream", label: "Streamlines" },
      ] },
      { key: "lines", label: "Line count / spacing", min: 8, max: 140, step: 1, default: 44 },
      { key: "res", label: "Smoothness", min: 20, max: 160, step: 2, default: 84 },
      { key: "warp", label: "Warp strength", min: 0, max: 1.6, step: 0.02, default: 0.7 },
      { key: "falloff", label: "Well radius", min: 0.05, max: 0.6, step: 0.01, default: 0.24 },
      { key: "swirl", label: "Vortex swirl", min: 0, max: 3, step: 0.02, default: 1 },
      { key: "depth", label: "Funnel depth", min: 0, max: 1, step: 0.02, default: 0.55 },
      { key: "tilt", label: "View tilt", min: 0, max: 1.3, step: 0.02, default: 0.35 },
      { key: "persp", label: "Perspective", min: 0, max: 1, step: 0.02, default: 0.6 },
      { key: "points", label: "Singularities", min: 1, max: 6, step: 1, default: 3 },
      { key: "streamLen", label: "Streamline length", min: 0.15, max: 1, step: 0.01, default: 0.55 },
      { key: "mask", label: "Frame (mark)", type: "select", default: "none", options: [
        { value: "none", label: "None (full field)" },
        { value: "circle", label: "Disc" },
        { value: "ring", label: "Ring" },
        { value: "lens", label: "Lens / eye" },
        { value: "square", label: "Rounded square" },
      ] },
      { key: "inner", label: "Ring / lens inner", min: 0.1, max: 0.85, step: 0.01, default: 0.45 },
      { key: "weight", label: "Line weight", min: 0.2, max: 3.5, step: 0.05, default: 0.8 },
      { key: "opacity", label: "Line opacity", min: 0.05, max: 1, step: 0.01, default: 0.5 },
      { key: "jitter", label: "Hand-drawn", min: 0, max: 1, step: 0.02, default: 0 },
      { key: "accent", label: "Accent color line", min: 0, max: 1, step: 1, default: 0 },
      { key: "handles", label: "Edit points (drag)", min: 0, max: 1, step: 1, default: 1 },
    ],

    controls() {
      return `<div class="knot-actions">
        <button class="ghost sm" id="warpMutate">✦ Mutate</button>
        <button class="ghost sm" id="warpAdd">＋ Point</button>
        <button class="ghost sm" id="warpType">↻ Flip type</button>
        <button class="ghost sm" id="warpBank">☆ Bank pose</button>
      </div>
      <p class="blurb" style="margin:0 0 8px">Wells (○) dimple space · vortices (◐) swirl it. Drag a point, then <b>Flip type</b> to switch the last-touched one. Right-click a point to remove.</p>
      <label class="slider"><span>Selected point · funnel depth<em id="warpSelVal">1.00</em></span><input type="range" id="warpSelDepth" min="0" max="2" step="0.05" value="1"></label>
      <div class="knot-tray" id="warpTray"></div>`;
    },
    wireControls(root) {
      const tray = root.querySelector("#warpTray");
      const renderTray = () => {
        tray.innerHTML = engine._poses.map((p, i) =>
          `<button class="knot-thumb" data-pose="${i}" title="Restore pose"><img src="${p.thumb}" alt=""></button>`).join("");
        tray.querySelectorAll("[data-pose]").forEach((b) =>
          b.onclick = () => engine._active && engine._active.restore(engine._poses[+b.dataset.pose]));
      };
      const bind = (id, fn) => { const el = root.querySelector(id); if (el) el.onclick = () => { if (engine._active) fn(engine._active); } };
      bind("#warpMutate", (A) => A.mutate());
      bind("#warpAdd", (A) => A.addPoint());
      bind("#warpType", (A) => A.flipType());
      bind("#warpBank", (A) => { A.bankPose(); renderTray(); });
      // per-point funnel depth — bound to the last-touched singularity
      const sd = root.querySelector("#warpSelDepth"), sv = root.querySelector("#warpSelVal");
      if (sd) sd.oninput = () => { if (engine._active) { engine._active.setSelDepth(Number(sd.value)); if (sv) sv.textContent = Number(sd.value).toFixed(2); } };
      engine._syncSel = (dz) => { if (sd) sd.value = dz; if (sv) sv.textContent = Number(dz).toFixed(2); };
      renderTray();
    },
    _poses: [],
    _active: null,

    mount(host, cx) {
      let P = cx.params, colors = cx.colors, ink = cx.ink, ground = cx.ground, seed = cx.seed;

      const canvas = document.createElement("canvas");
      Object.assign(canvas.style, { width: "100%", height: "100%", display: "block", touchAction: "none" });
      host.appendChild(canvas);
      const g2 = canvas.getContext("2d");

      let pts = [];              // singularities: {x,y in UV 0..1, type:'well'|'vortex', s:strength, dz:depth×}
      let lastTouched = 0;
      let pointsParam = Math.round(P.points);   // last seen value of the Singularities slider
      let uvLines = [];          // warped polylines in UV space (rebuilt on geometry change)

      // ---- singularity field ---------------------------------------------------
      function makePoints() {
        const r = rng((seed >>> 0) * 2654435761 >>> 0);
        const n = Math.round(P.points);
        pts = [];
        for (let i = 0; i < n; i++) {
          const type = r() < 0.5 ? "well" : "vortex";
          pts.push({
            x: 0.2 + 0.6 * r(), y: 0.2 + 0.6 * r(),
            type, s: (type === "well" ? -1 : 1) * (0.5 + 0.8 * r()),   // wells pull in by default
            dz: 1,                                                      // per-point funnel depth multiplier
          });
        }
        lastTouched = 0;
        notifySel();
      }
      function notifySel() { if (engine._syncSel) engine._syncSel(pts[lastTouched] ? (pts[lastTouched].dz ?? 1) : 1); }
      // velocity vector of the field at a UV point — used ONLY to trace streamlines.
      function field(u, v) {
        let du = 0, dv = 0;
        const rad = P.falloff;
        for (const m of pts) {
          const vx = u - m.x, vy = v - m.y, d = Math.hypot(vx, vy) + 1e-4;
          const g = Math.exp(-(d * d) / (2 * rad * rad)) * m.s;
          if (m.type === "vortex") {
            du += (-vy / d) * g * P.swirl + (vx / d) * g * -0.35;   // swirl + a mild inward pull → spiral
            dv += (vx / d) * g * P.swirl + (vy / d) * g * -0.35;
          } else {
            du += (vx / d) * g; dv += (vy / d) * g;
          }
        }
        return [du, dv];
      }
      const jit = (u, v, k) => {
        if (P.jitter < 0.01) return 0;
        const s = Math.sin((u * 127.1 + v * 311.7 + k * 74.7)) * 43758.5453;
        return ((s - Math.floor(s)) - 0.5) * P.jitter * 0.012;
      };
      // Warp the lattice/polar grids with a SMOOTH space deformation — the logomark-
      // quality guarantee. Vortices ROTATE points around themselves by an angle that
      // decays with distance (a rotation can never tear or fling lines off), and wells
      // SCALE the radius toward/away from their center by a clamped factor (a point can
      // shrink toward the center but never overshoot past it — no fold-through, no
      // space inversion). Composed over a few substeps so multiple singularities blend
      // as one continuous deformation instead of fighting each other.
      const SUB = 3;
      function warpUV(u, v) {
        let x = u, y = v;
        const rad = P.falloff;
        for (let s = 0; s < SUB; s++) {
          let dx = 0, dy = 0;
          for (const m of pts) {
            const vx = x - m.x, vy = y - m.y;
            const d2 = vx * vx + vy * vy;
            const g = Math.exp(-d2 / (2 * rad * rad));
            if (m.type === "vortex") {
              const ang = (m.s * P.swirl * 2.2 * g) / SUB;          // rotate about the vortex — can wrap full turns
              const ca = Math.cos(ang), sa = Math.sin(ang);
              dx += (vx * ca - vy * sa) - vx;
              dy += (vx * sa + vy * ca) - vy;
            } else {
              // radial scale: r' = r·(1+k). k ∈ (−0.94, 0.94) per substep total, so the
              // pinch can be extreme but the map stays monotonic — lines bunch, never cross.
              const k = Math.max(-0.94, Math.min(0.94, m.s * P.warp * g)) / SUB;
              dx += vx * k; dy += vy * k;
            }
          }
          x += dx; y += dy;
        }
        return [x + jit(u, v, 1), y + jit(u, v, 2)];
      }

      // ---- the third dimension: what makes the sheet FOLD BACK ON ITSELF --------
      // The 2D warp alone can bunch lines but never overlap them (a smooth planar map
      // has no folds). The time-warp-tunnel look comes from treating the grid as a 3D
      // SHEET: every singularity digs a funnel in z, the sheet is tilted toward the
      // camera, and perspective projects it back to 2D — near funnel walls swallow far
      // ones, and the surface self-overlaps as smoothly as draped fabric.
      function zAt(x, y) {
        let z = 0;
        const rz = P.falloff * 0.72;                 // funnel narrower than the in-plane pinch → steep walls, real tunnels
        for (const m of pts) {
          const dx = x - m.x, dy = y - m.y;
          const g = Math.exp(-(dx * dx + dy * dy) / (2 * rz * rz));
          z -= Math.abs(m.s) * P.depth * (m.dz ?? 1) * 0.9 * g * (m.type === "vortex" ? 0.85 : 1);
        }
        return z;
      }
      // warped-UV point → tilted, perspective-projected unit coords
      function place(pt) {
        const z = zAt(pt[0], pt[1]);
        const cx = pt[0] - 0.5, cy = pt[1] - 0.5;
        const ct = Math.cos(P.tilt), st = Math.sin(P.tilt);
        const y2 = cy * ct - z * st;
        const z2 = cy * st + z * ct;
        const f = 1 / Math.max(0.2, 1 + z2 * P.persp * 1.1);
        return [0.5 + cx * f, 0.5 + y2 * f];
      }
      // Project every line, then normalize to a centered, frame-filling composition —
      // tilt/depth reshape the sheet, but the MARK always sits centered at full size.
      function projectAll() {
        const raw = uvLines.map((ln) => ln.map(place));
        let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
        for (const ln of raw) for (const [x, y] of ln) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
        const s = 0.94 / Math.max(1e-6, Math.max(maxX - minX, maxY - minY));
        const ox = 0.5 - s * (minX + maxX) / 2, oy = 0.5 - s * (minY + maxY) / 2;
        const fit = (p) => [p[0] * s + ox, p[1] * s + oy];
        return { plines: raw.map((ln) => ln.map(fit)), fit };
      }
      let lastFit = (p) => p;                        // handles & hit-testing share the current fit

      // ---- geometry: warped polylines in UV -----------------------------------
      function buildLines() {
        const N = Math.round(P.lines), R = Math.round(P.res);
        const out = [];
        if (P.grid === "rect") {
          for (let i = 0; i <= N; i++) {
            const c = i / N, hl = [], vl = [];
            for (let s = 0; s <= R; s++) { const t = s / R; hl.push(warpUV(t, c)); vl.push(warpUV(c, t)); }
            out.push(hl, vl);
          }
        } else if (P.grid === "polar") {
          const cx0 = 0.5, cy0 = 0.5, maxR = 0.5;
          for (let i = 1; i <= N; i++) {                 // concentric rings
            const rr = (i / N) * maxR, ring = [];
            for (let s = 0; s <= R; s++) { const a = (s / R) * TAU; ring.push(warpUV(cx0 + Math.cos(a) * rr, cy0 + Math.sin(a) * rr)); }
            out.push(ring);
          }
          const K = Math.max(6, Math.round(N * 1.4));
          for (let i = 0; i < K; i++) {                  // radial spokes
            const a = (i / K) * TAU, sp = [];
            for (let s = 0; s <= R; s++) { const rr = (s / R) * maxR; sp.push(warpUV(cx0 + Math.cos(a) * rr, cy0 + Math.sin(a) * rr)); }
            out.push(sp);
          }
        } else {                                          // streamlines: integrate the field
          const r = rng((seed >>> 0) * 40503 + 7);
          const count = Math.round(P.lines * 2.2);
          const steps = Math.round(30 + P.streamLen * 160);
          const h = 0.0016 + P.streamLen * 0.004;
          for (let i = 0; i < count; i++) {
            const sx = 0.5 + (r() - 0.5) * 0.94, sy = 0.5 + (r() - 0.5) * 0.94;
            const line = [];
            let x = sx, y = sy;
            for (let s = 0; s < steps; s++) {             // forward
              line.push([x, y]);
              const [du, dv] = field(x, y); const L = Math.hypot(du, dv) + 1e-5;
              x += (du / L) * h; y += (dv / L) * h;
              if (x < -0.3 || x > 1.3 || y < -0.3 || y > 1.3) break;
            }
            x = sx; y = sy; const back = [];
            for (let s = 0; s < steps; s++) {             // backward, for a full streamline
              const [du, dv] = field(x, y); const L = Math.hypot(du, dv) + 1e-5;
              x -= (du / L) * h; y -= (dv / L) * h;
              if (x < -0.3 || x > 1.3 || y < -0.3 || y > 1.3) break;
              back.push([x, y]);
            }
            const full = back.reverse().concat(line);
            if (full.length > 2) out.push(full);
          }
        }
        uvLines = out;
      }

      // ---- mask (logomark frame) ----------------------------------------------
      // Returns a Path2D (canvas) or a d-string (svg) at the given dimension, plus
      // whether it needs even-odd fill (for the ring annulus).
      function maskShape(dim, forSvg) {
        const c = dim / 2, F = dim * 0.9, rad = F / 2;
        const kind = P.mask;
        if (kind === "none") return null;
        const arc = (cx, cy, rr, from, to, sweep) => forSvg
          ? `M ${(cx + Math.cos(from) * rr).toFixed(1)} ${(cy + Math.sin(from) * rr).toFixed(1)} A ${rr} ${rr} 0 ${Math.abs(to - from) > Math.PI ? 1 : 0} ${sweep} ${(cx + Math.cos(to) * rr).toFixed(1)} ${(cy + Math.sin(to) * rr).toFixed(1)}`
          : null;
        if (forSvg) {
          if (kind === "circle") return { d: `M ${c - rad} ${c} a ${rad} ${rad} 0 1 0 ${rad * 2} 0 a ${rad} ${rad} 0 1 0 ${-rad * 2} 0`, evenodd: false };
          if (kind === "ring") { const ir = rad * P.inner;
            return { d: `M ${c - rad} ${c} a ${rad} ${rad} 0 1 0 ${rad * 2} 0 a ${rad} ${rad} 0 1 0 ${-rad * 2} 0 Z M ${c - ir} ${c} a ${ir} ${ir} 0 1 1 ${ir * 2} 0 a ${ir} ${ir} 0 1 1 ${-ir * 2} 0 Z`, evenodd: true }; }
          if (kind === "square") { const s = F * 0.5, o = c - s, k = F * 0.14;
            return { d: `M ${o + k} ${o} h ${s * 2 - 2 * k} q ${k} 0 ${k} ${k} v ${s * 2 - 2 * k} q 0 ${k} ${-k} ${k} h ${-(s * 2 - 2 * k)} q ${-k} 0 ${-k} ${-k} v ${-(s * 2 - 2 * k)} q 0 ${-k} ${k} ${-k} Z`, evenodd: false }; }
          // lens / vesica: intersection of two circles offset horizontally
          const off = rad * (0.6 + 0.4 * (1 - P.inner)); const cr = rad * 1.15;
          const ay = Math.acos(clamp01(off / cr));
          return { d: `${arc(c - off, c, cr, -ay, ay, 1)} ${arc(c + off, c, cr, Math.PI - ay, Math.PI + ay, 1)} Z`, evenodd: false };
        }
        const path = new Path2D();
        if (kind === "circle") path.arc(c, c, rad, 0, TAU);
        else if (kind === "ring") { path.arc(c, c, rad, 0, TAU); path.arc(c, c, rad * P.inner, 0, TAU, true); }
        else if (kind === "square") { const s = F * 0.5, k = F * 0.14; roundRect(path, c - s, c - s, s * 2, s * 2, k); }
        else { const off = rad * (0.6 + 0.4 * (1 - P.inner)), cr = rad * 1.15, ay = Math.acos(clamp01(off / cr));
          path.arc(c - off, c, cr, -ay, ay); path.arc(c + off, c, cr, Math.PI - ay, Math.PI + ay); path.closePath(); }
        return { path, evenodd: kind === "ring" };
      }
      function roundRect(path, x, y, w, h, r) {
        path.moveTo(x + r, y); path.arcTo(x + w, y, x + w, y + h, r); path.arcTo(x + w, y + h, x, y + h, r);
        path.arcTo(x, y + h, x, y, r); path.arcTo(x, y, x + w, y, r); path.closePath();
      }
      const mapUV = (uv, dim) => { const F = dim * 0.9, o = dim * 0.05; return [o + uv[0] * F, o + uv[1] * F]; };

      // ---- canvas render -------------------------------------------------------
      function lineColor() { return P.accent && colors.length ? colors[0] : ink; }
      function draw(showHandles) {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const rect = host.getBoundingClientRect();
        const size = Math.max(1, Math.min(rect.width, rect.height || rect.width));
        if (canvas.width !== Math.round(size * dpr)) { canvas.width = Math.round(size * dpr); canvas.height = Math.round(size * dpr); }
        g2.setTransform(dpr, 0, 0, dpr, 0, 0);
        g2.clearRect(0, 0, size, size);
        g2.fillStyle = ground; g2.fillRect(0, 0, size, size);
        g2.save();
        const mask = maskShape(size, false);
        if (mask) g2.clip(mask.path, mask.evenodd ? "evenodd" : "nonzero");
        g2.strokeStyle = lineColor(); g2.globalAlpha = P.opacity; g2.lineWidth = P.weight;
        g2.lineJoin = "round"; g2.lineCap = "round";
        g2.beginPath();
        // midpoint-quadratic smoothing: pass through segment midpoints with each sample
        // as the control point — no visible facets even where the warp is violent.
        const proj = projectAll(); lastFit = proj.fit;
        for (const pl of proj.plines) {
          const n = pl.length;
          if (n < 2) continue;
          let [x0, y0] = mapUV(pl[0], size);
          g2.moveTo(x0, y0);
          for (let i = 1; i < n - 1; i++) {
            const [cx, cy] = mapUV(pl[i], size);
            const [nx, ny] = mapUV(pl[i + 1], size);
            g2.quadraticCurveTo(cx, cy, (cx + nx) / 2, (cy + ny) / 2);
          }
          const [xe, ye] = mapUV(pl[n - 1], size);
          g2.lineTo(xe, ye);
        }
        g2.stroke();
        g2.restore();
        if (showHandles && P.handles) drawHandles(size);
      }
      function drawHandles(size) {
        pts.forEach((m, i) => {
          const [x, y] = mapUV(lastFit(place(warpUV(m.x, m.y))), size);   // sit on the projected funnel
          g2.globalAlpha = 1; g2.lineWidth = 2;
          g2.strokeStyle = m.type === "vortex" ? "#c9a24a" : "#3a6b5f";
          g2.fillStyle = i === lastTouched ? g2.strokeStyle : "rgba(255,255,255,.85)";
          g2.beginPath(); g2.arc(x, y, 7, 0, TAU); g2.fill(); g2.stroke();
          if (m.type === "vortex") { g2.beginPath(); g2.arc(x, y, 7, -Math.PI / 2, Math.PI / 2); g2.fillStyle = g2.strokeStyle; g2.fill(); }
        });
      }

      function rebuild(regen) {
        if (regen) makePoints();
        buildLines(); draw(true);
      }
      rebuild(true);

      const ro = new ResizeObserver(() => draw(true)); ro.observe(host);

      // ---- pointer: drag singularities ----------------------------------------
      let dragging = -1;
      const uvAt = (e) => { const r = canvas.getBoundingClientRect(); const size = Math.min(r.width, r.height); const F = size * 0.9, o = size * 0.05; return [((e.clientX - r.left) - o) / F, ((e.clientY - r.top) - o) / F]; };
      const hit = (e) => {
        const r = canvas.getBoundingClientRect(); const size = Math.min(r.width, r.height);
        let best = -1, bd = 16;
        pts.forEach((m, i) => { const [hx, hy] = mapUV(lastFit(place(warpUV(m.x, m.y))), size); const d = Math.hypot(e.clientX - r.left - hx, e.clientY - r.top - hy); if (d < bd) { bd = d; best = i; } });
        return best;
      };
      let lastUV = null;
      const onDown = (e) => {
        if (!P.handles) return;
        const i = hit(e);
        if (i >= 0) { dragging = i; lastTouched = i; lastUV = uvAt(e); canvas.setPointerCapture?.(e.pointerId); notifySel(); draw(true); }
      };
      const onMove = (e) => {
        if (dragging < 0) return;
        // delta drag — under tilt/perspective the cursor's absolute UV no longer maps
        // 1:1 onto the sheet, but relative motion still feels exact.
        const [u, v] = uvAt(e);
        pts[dragging].x = clamp01(pts[dragging].x + (u - lastUV[0]));
        pts[dragging].y = clamp01(pts[dragging].y + (v - lastUV[1]));
        lastUV = [u, v];
        buildLines(); draw(true);
      };
      const onUp = () => { dragging = -1; };
      const onContext = (e) => {                 // right-click removes the point under the cursor
        if (!P.handles) return; const i = hit(e); if (i >= 0 && pts.length > 1) { e.preventDefault(); pts.splice(i, 1); lastTouched = 0; notifySel(); buildLines(); draw(true); }
      };
      canvas.addEventListener("pointerdown", onDown);
      canvas.addEventListener("pointermove", onMove);
      canvas.addEventListener("pointerup", onUp);
      canvas.addEventListener("pointerleave", onUp);
      canvas.addEventListener("contextmenu", onContext);

      // ---- vector SVG (same warped polylines, same clip) ----------------------
      function snapshotSVG() {
        const col = lineColor();
        const mask = maskShape(STAGE, true);
        const paths = projectAll().plines.map((ln) => {
          // Catmull-Rom → cubic Bézier, same smoothing family as the live view: the
          // exported vector is genuinely smooth curves, not faceted polylines.
          const d = smoothPath(ln.map((pt) => { const [x, y] = mapUV(pt, STAGE); return { x, y }; }), { tension: 0.5 });
          return `<path d="${d}" fill="none" stroke="${col}" stroke-width="${P.weight}" stroke-opacity="${P.opacity}" stroke-linejoin="round" stroke-linecap="round"/>`;
        }).join("");
        if (!mask) return paths;
        const cid = "warpclip";
        return `<defs><clipPath id="${cid}"><path d="${mask.d}" clip-rule="${mask.evenodd ? "evenodd" : "nonzero"}"/></clipPath></defs><g clip-path="url(#${cid})">${paths}</g>`;
      }

      function thumb() {
        draw(false);
        const t = document.createElement("canvas"); t.width = t.height = 96;
        t.getContext("2d").drawImage(canvas, 0, 0, 96, 96); draw(true);
        return t.toDataURL("image/png");
      }
      engine._active = {
        mutate() { const r = rng((seed * 7 + pts.length * 131 + lastTouched) >>> 0); pts.forEach((m) => { m.x = clamp01(m.x + (r() - 0.5) * 0.18); m.y = clamp01(m.y + (r() - 0.5) * 0.18); m.s *= 0.8 + 0.4 * r(); }); buildLines(); draw(true); },
        addPoint() { if (pts.length >= 8) return; pts.push({ x: 0.5, y: 0.5, type: "well", s: -0.9, dz: 1 }); lastTouched = pts.length - 1; notifySel(); buildLines(); draw(true); },
        flipType() { const m = pts[lastTouched]; if (!m) return; m.type = m.type === "well" ? "vortex" : "well"; m.s = (m.type === "well" ? -1 : 1) * Math.abs(m.s); buildLines(); draw(true); },
        setSelDepth(v) { const m = pts[lastTouched]; if (!m) return; m.dz = v; draw(true); },   // z is applied at projection — no rebuild needed
        bankPose() {
          engine._poses.unshift({ thumb: thumb(), seed, pts: pts.map((m) => ({ ...m })), params: { ...P } });
          engine._poses = engine._poses.slice(0, 12);
        },
        restore(pose) { seed = pose.seed; pts = pose.pts.map((m) => ({ ...m })); Object.assign(P, pose.params); pointsParam = Math.round(P.points); lastTouched = 0; notifySel(); buildLines(); draw(true); },
      };

      return {
        viewBox: `0 0 ${STAGE} ${STAGE}`,
        update(nc) {
          const reseed = nc.seed !== seed;
          P = nc.params; colors = nc.colors; ink = nc.ink; ground = nc.ground;
          // Regenerate points only when the seed OR the Singularities slider itself
          // changes — never because pts.length drifted from a manual add/delete
          // (that comparison used to resurrect right-click-deleted points on any tweak).
          if (reseed) { seed = nc.seed; pointsParam = Math.round(P.points); rebuild(true); }
          else if (Math.round(P.points) !== pointsParam) { pointsParam = Math.round(P.points); makePoints(); buildLines(); draw(true); }
          else { buildLines(); draw(true); }
        },
        snapshotSVG,
        snapshotCanvas() { draw(false); setTimeout(() => draw(true), 0); return canvas; },   // clean read now, handles back after
        destroy() {
          ro.disconnect();
          canvas.removeEventListener("pointerdown", onDown); canvas.removeEventListener("pointermove", onMove);
          canvas.removeEventListener("pointerup", onUp); canvas.removeEventListener("pointerleave", onUp);
          canvas.removeEventListener("contextmenu", onContext);
          canvas.remove(); engine._active = null;
        },
      };
    },
  };
  return engine;
})();
