// letterWrap.js — the string IS the artwork. The text you type is set large and flat
// (2D, no rotation) in the chosen wordmark typeface. Tick the letter instances you want
// and a folded ribbon wraps around each one — passing in FRONT of the stroke and BEHIND
// it (the glyph is a real solid in the depth buffer, so it occludes the back passes).
// The wrap path is a seeded, slightly chaotic helix that clears the letter (no collision),
// and the ribbon can be a finite segment that travels along the path. Scroll to zoom.
import * as THREE from "three";
import { rng } from "../util.js";

const TAU = Math.PI * 2;
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const attr = (s) => String(s).replace(/"/g, "&quot;");
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const pingpong = (x) => { let m = x % 2; if (m < 0) m += 2; return m > 1 ? 2 - m : m; };
function makeNoise(rnd) {                                   // smooth seeded 1-D noise, range ~[-1,1]
  const c = []; let amp = 1, tot = 0;
  for (let j = 0; j < 3; j++) { c.push([1 + j + Math.floor(rnd() * 3), rnd() * TAU, amp]); tot += amp; amp *= 0.6; }
  return (t) => { let s = 0; for (const [f, p, a] of c) s += a * Math.sin(f * TAU * t + p); return s / tot; };
}

export default {
  id: "letter",
  label: "Letter weave",
  kind: "live",
  hideWordmark: true,
  blurb: "Your string, set large and flat. Tick letters to wrap a folded ribbon around each — or turn on ‘Weave across letters’ for one ribbon threading through them. Scroll to zoom · drag to pan.",
  params: [
    { key: "glyphs",  type: "hidden", default: "THE FOLD" },
    { key: "picks",   type: "hidden", default: [4] },
    { key: "band",    label: "Weave across letters", min: 0, max: 1, step: 1, default: 0 },
    { key: "wrap",    label: "Wrap spread",   min: 0.02, max: 0.8,  step: 0.005, default: 0.28 },
    { key: "depth",   label: "Wrap depth",    min: 0.15, max: 1.3,  step: 0.01,  default: 0.6 },
    { key: "passes",  label: "Wraps",         min: 1,    max: 10,   step: 1,     default: 3 },
    { key: "chaos",   label: "Randomness",    min: 0,    max: 1,    step: 0.01,  default: 0.4 },
    { key: "width",   label: "Ribbon width",  min: 0.01, max: 0.2,  step: 0.005, default: 0.075 },
    { key: "twist",   label: "Twist",         min: 0,    max: 3,    step: 0.01,  default: 0.2 },
    { key: "cover",   label: "Path length",   min: 0.3,  max: 1,    step: 0.01,  default: 1 },
    { key: "segment", label: "Ribbon length", min: 0.08, max: 1,   step: 0.01,  default: 1 },
    { key: "travel",  label: "Position",      min: 0,    max: 1,    step: 0.005, default: 0 },
    { key: "flow",    label: "Auto-travel",   min: 0,    max: 1,    step: 0.01,  default: 0 },
  ],

  // ---- custom controls: string input + per-letter chips ---------------------
  controls(p) {
    const chips = [...(p.glyphs || "")].map((ch, i) => ch.trim() === "" ? "" :
      `<button type="button" class="lw-chip ${p.picks.includes(i) ? "on" : ""}" data-pick="${i}">${esc(ch)}</button>`).join("");
    return `<label class="textparam"><span>String</span>
        <input type="text" id="lw-str" class="text" value="${attr(p.glyphs)}" maxlength="18" placeholder="Type your wordmark…"></label>
      <div class="lw-pick"><span class="lw-lbl">Wrap which letters</span>
        <div class="lw-chips" id="lw-chips">${chips}</div></div>`;
  },
  wireControls(root, p, api) {
    const str = root.querySelector("#lw-str"), box = root.querySelector("#lw-chips");
    const bind = () => box.querySelectorAll("[data-pick]").forEach((b) => b.onclick = () => {
      const i = +b.dataset.pick, k = p.picks.indexOf(i);
      if (k >= 0) p.picks.splice(k, 1); else p.picks.push(i);
      b.classList.toggle("on"); api.redraw();
    });
    const renderChips = () => {
      box.innerHTML = [...(p.glyphs || "")].map((ch, i) => ch.trim() === "" ? "" :
        `<button type="button" class="lw-chip ${p.picks.includes(i) ? "on" : ""}" data-pick="${i}">${esc(ch)}</button>`).join("");
      bind();
    };
    str.oninput = () => {
      p.glyphs = str.value || " ";
      p.picks = p.picks.filter((i) => i < p.glyphs.length && p.glyphs[i].trim() !== "");
      renderChips(); api.redraw();
    };
    bind();
  },

  mount(host, ctx) {
    let P = { ...ctx.params }, colors = ctx.colors, ink = ctx.ink, ground = ctx.ground, seed = ctx.seed, font = ctx.font;

    const canvas = document.createElement("canvas");
    canvas.style.width = "100%"; canvas.style.height = "100%"; canvas.style.display = "block"; canvas.style.touchAction = "none";
    host.appendChild(canvas);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1.8, 1.8, 1.8, -1.8, -50, 50);
    camera.position.set(0, 0, 12);

    const keyL = new THREE.DirectionalLight(0xffffff, 1.7); keyL.position.set(-1.4, 2, 3); scene.add(keyL);
    const rimL = new THREE.DirectionalLight(0xffffff, 0.7); rimL.position.set(2, -1, 2); scene.add(rimL);
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));

    const letterMat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.85, metalness: 0 });
    let letterGroup = null, ribbonGroup = null, specs = [], guides = new Map(), worldBox = null, gSample = null, contourKey = "", token = 0;
    let zoom = 1, panX = 0, panY = 0, dirty = true, seedAtBuild = seed;
    const picksChanged = (a, b) => { a = a || []; b = b || []; return a.length !== b.length || a.some((v, i) => v !== b[i]); };
    const PATH_KEYS = ["band", "wrap", "depth", "passes", "chaos", "width", "twist", "cover"];
    const LT = 0.3; // real letter thickness in z — a solid occluder (still reads 2D head-on)

    // ---- contour helpers (marching squares) ---------------------------------
    function trace(grid, W, H) {
      const val = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : grid[y * W + x]);
      const segs = [], push = (a, b) => segs.push({ a, b });
      for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
        const c = (val(x, y) ? 1 : 0) | (val(x + 1, y) ? 2 : 0) | (val(x + 1, y + 1) ? 4 : 0) | (val(x, y + 1) ? 8 : 0);
        if (c === 0 || c === 15) continue;
        const T = { x: x + 0.5, y }, R = { x: x + 1, y: y + 0.5 }, B = { x: x + 0.5, y: y + 1 }, L = { x, y: y + 0.5 };
        switch (c) {
          case 1: push(L, T); break; case 2: push(T, R); break; case 3: push(L, R); break;
          case 4: push(R, B); break; case 5: push(L, T); push(R, B); break; case 6: push(T, B); break;
          case 7: push(L, B); break; case 8: push(B, L); break; case 9: push(B, T); break;
          case 10: push(T, R); push(B, L); break; case 11: push(B, R); break; case 12: push(R, L); break;
          case 13: push(R, T); break; case 14: push(T, L); break;
        }
      }
      const k = (p) => p.x + "," + p.y, from = new Map();
      for (const s of segs) { (from.get(k(s.a)) || from.set(k(s.a), []).get(k(s.a))).push(s); }
      const used = new Set(), loops = [];
      for (const s of segs) {
        if (used.has(s)) continue;
        const loop = [s.a]; let cur = s, guard = 0;
        while (cur && !used.has(cur) && guard++ < 1e6) { used.add(cur); loop.push(cur.b); const a = from.get(k(cur.b)); cur = a ? a.find((x) => !used.has(x)) : null; }
        if (loop.length > 6) loops.push(loop);
      }
      return loops;
    }
    const area = (l) => { let a = 0; for (let i = 0; i < l.length - 1; i++) a += l[i].x * l[i + 1].y - l[i + 1].x * l[i].y; return Math.abs(a / 2); };
    function inPoly(poly, p) {
      let c = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i], b = poly[j];
        if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
      }
      return c;
    }
    function resampleClosed(pts, n) {
      const P0 = pts.slice(); if (P0[0] !== P0[P0.length - 1]) P0.push(P0[0]);
      const seg = []; let total = 0;
      for (let i = 0; i < P0.length - 1; i++) { const d = Math.hypot(P0[i + 1].x - P0[i].x, P0[i + 1].y - P0[i].y); seg.push(d); total += d; }
      const out = [];
      for (let i = 0; i < n; i++) {
        let t = (i / n) * total, j = 0;
        while (j < seg.length && t > seg[j]) { t -= seg[j]; j++; }
        const a = P0[j] || P0[0], b = P0[j + 1] || a, f = seg[j] ? t / seg[j] : 0;
        out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
      }
      return out;
    }
    function chaikin(pts, it) {
      for (let n = 0; n < it; n++) {
        const out = [];
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i], b = pts[(i + 1) % pts.length];
          out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
          out.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
        }
        pts = out;
      }
      return pts;
    }
    function rasterChar(ch, fam, wgt, ital, FS, pad) {
      const m = document.createElement("canvas").getContext("2d");
      m.font = `${ital}${wgt} ${FS}px ${fam}, serif`;
      const adv = m.measureText(ch).width;
      const w = Math.ceil(adv) + pad * 2, h = Math.ceil(FS * 1.6), bl = Math.round(FS * 1.2);
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      const g = cv.getContext("2d");
      g.font = `${ital}${wgt} ${FS}px ${fam}, serif`;
      g.textBaseline = "alphabetic"; g.textAlign = "left"; g.fillStyle = "#fff";
      g.fillText(ch, pad, bl);
      const data = g.getImageData(0, 0, w, h).data;
      const grid = new Uint8Array(w * h); let any = false;
      for (let i = 0; i < w * h; i++) if (data[i * 4 + 3] > 100) { grid[i] = 1; any = true; }
      return any ? { grid, W: w, H: h, adv, pad } : { adv, empty: true };
    }

    function buildContours() {
      const glyphs = (P.glyphs || " "), fam = (font && font.css) || "Georgia";
      const wgt = (font && font.weight) || 700, ital = font && font.italic ? "italic " : "";
      const FS = 200, pad = 30;
      const chars = []; let penX = 0;
      for (let i = 0; i < glyphs.length; i++) {
        const ch = glyphs[i];
        const rc = rasterChar(ch, fam, wgt, ital, FS, pad);
        if (!rc.empty && ch.trim() !== "") {
          const dx = penX - pad;
          let loops = trace(rc.grid, rc.W, rc.H).map((l) => ({ pts: l, a: area(l) })).filter((l) => l.a > 6).sort((p, q) => q.a - p.a);
          if (loops.length) {
            loops.forEach((l) => { l.depth = loops.reduce((n, o) => (o !== l && o.a > l.a && inPoly(o.pts, l.pts[0]) ? n + 1 : n), 0); });
            const g2 = (p) => ({ x: p.x + dx, y: p.y });
            const outers = loops.filter((l) => l.depth % 2 === 0).map((o) => ({
              outer: o.pts.map(g2),
              holes: loops.filter((h) => h.depth === o.depth + 1 && inPoly(o.pts, h.pts[0])).map((h) => h.pts.map(g2)),
            }));
            chars.push({ index: i, ch, outers, grid: rc.grid, W: rc.W, H: rc.H, dx });
          }
        }
        penX += rc.adv;
      }
      if (!chars.length) return null;

      let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
      for (const c of chars) for (const o of c.outers) for (const p of o.outer) {
        if (p.x < minx) minx = p.x; if (p.x > maxx) maxx = p.x; if (p.y < miny) miny = p.y; if (p.y > maxy) maxy = p.y;
      }
      const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2, K = 3.0 / Math.max(1, maxx - minx);
      const toW = (p) => ({ x: (p.x - cx) * K, y: -(p.y - cy) * K });

      const shapes = [], gmap = new Map();
      for (const c of chars) {
        for (const o of c.outers) {
          const outer = chaikin(resampleClosed(o.outer, Math.max(48, Math.min(160, Math.round(o.outer.length / 5)))), 1);
          const shape = new THREE.Shape(outer.map((p) => { const w = toW(p); return new THREE.Vector2(w.x, w.y); }));
          for (const h of o.holes) {
            const hh = chaikin(resampleClosed(h, Math.max(32, Math.min(120, Math.round(h.length / 5)))), 1);
            shape.holes.push(new THREE.Path(hh.map((p) => { const w = toW(p); return new THREE.Vector2(w.x, w.y); })));
          }
          shapes.push(shape);
        }
        // per-letter ink sampler (world -> this char's grid) + world bbox + scale (world units / glyph px)
        const dx = c.dx, gr = c.grid, GW = c.W, GH = c.H;
        const sample = (wx, wy) => {
          const lx = Math.round(wx / K + cx - dx), ly = Math.round(cy - wy / K);
          return lx < 0 || ly < 0 || lx >= GW || ly >= GH ? 0 : gr[ly * GW + lx];
        };
        let bxn = 1e9, bxx = -1e9, byn = 1e9, byx = -1e9;
        for (const o of c.outers) for (const p of o.outer) { const w = toW(p); if (w.x < bxn) bxn = w.x; if (w.x > bxx) bxx = w.x; if (w.y < byn) byn = w.y; if (w.y > byx) byx = w.y; }
        gmap.set(c.index, { minx: bxn, maxx: bxx, miny: byn, maxy: byx, sample });
      }
      // global sampler: is a world point over ANY letter's ink? (used by band mode to clear all glyphs)
      const gSample = (wx, wy) => {
        const gx = wx / K + cx, gy = cy - wy / K;
        for (const c of chars) { const lx = Math.round(gx - c.dx), ly = Math.round(gy); if (lx >= 0 && ly >= 0 && lx < c.W && ly < c.H && c.grid[ly * c.W + lx]) return 1; }
        return 0;
      };
      const wb = (() => { const a = toW({ x: minx, y: miny }), b = toW({ x: maxx, y: maxy }); return { minx: Math.min(a.x, b.x), maxx: Math.max(a.x, b.x), miny: Math.min(a.y, b.y), maxy: Math.max(a.y, b.y) }; })();
      return { shapes, guides: gmap, worldBox: wb, gSample };
    }

    // ---- meshes -------------------------------------------------------------
    function disposeLetters() { if (letterGroup) { letterGroup.children.forEach((m) => m.geometry.dispose()); scene.remove(letterGroup); letterGroup = null; } }
    function disposeRibbons() { if (ribbonGroup) { ribbonGroup.children.forEach((m) => { m.geometry.dispose(); m.material.dispose(); }); scene.remove(ribbonGroup); } specs = []; ribbonGroup = null; }

    function buildLetters(shapes) {
      disposeLetters();
      letterGroup = new THREE.Group();
      for (const s of shapes) {
        const geo = new THREE.ExtrudeGeometry(s, { depth: LT, bevelEnabled: false, curveSegments: 3 });
        geo.translate(0, 0, -LT / 2);
        letterGroup.add(new THREE.Mesh(geo, letterMat));
      }
      scene.add(letterGroup);
    }

    // Build the full wrap PATH for one letter: a seeded, slightly chaotic helix along the
    // glyph's long axis. The cross swing and z are 90° out of phase, so each crossing is
    // fully front or behind (alternating). Where the path is over ink, z is pushed to clear
    // the letter's depth band (LT/2 + ribbon half-width) — so the ribbon never collides.
    function generatePath(L, kColor) {
      const r = rng(seed * 131 + 7 + kColor * 53);
      const phase = r() * TAU, nAng = makeNoise(r), nAmp = makeNoise(r), nDep = makeNoise(r), nMain = makeNoise(r);
      const Wd = L.maxx - L.minx, Hd = L.maxy - L.miny;
      const vertical = Hd > Wd * 1.1;
      const mainLen = vertical ? Hd : Wd, crossLen = vertical ? Wd : Hd;
      const crossC = vertical ? (L.minx + L.maxx) / 2 : (L.miny + L.maxy) / 2;
      const pad = mainLen * 0.28;
      const mainLo = (vertical ? L.miny : L.minx) - pad, mainHi = (vertical ? L.maxy : L.maxx) + pad;
      const fullM = mainHi - mainLo;
      const startM = mainLo + fullM * (1 - P.cover) * 0.5, sweep = fullM * P.cover;
      const amp = Math.max(crossLen * (0.4 + 0.95 * P.wrap), 0.12);
      const band = LT / 2 + P.width * 0.5 + 0.05;        // depth the ribbon must clear over ink

      const N = 320, raw = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const env = Math.pow(Math.sin(Math.PI * t), 0.55);                 // taper ends: thread in / out
        const th = P.passes * TAU * t + phase + P.chaos * 2.4 * nAng(t);   // chaotic angle
        const co = amp * env * (1 + P.chaos * 0.7 * nAmp(t)) * Math.sin(th);
        const zr = P.depth * env * (1 + P.chaos * 0.55 * nDep(t)) * Math.cos(th);
        const mp = startM + sweep * t + P.chaos * 0.08 * mainLen * nMain(t);
        const x = vertical ? crossC + co : mp;
        const y = vertical ? mainHi - (mp - mainLo) : crossC + co;
        const side = Math.cos(th) >= 0 ? 1 : -1;
        raw.push({ x, y, zr, side, ink: L.sample(x, y) ? 1 : 0 });
      }
      // smooth the ink field, then push z clear of the glyph where it's over a stroke
      const win = 6, pts = [];
      for (let i = 0; i <= N; i++) {
        let s = 0, c = 0; for (let j = -win; j <= win; j++) { const k = i + j; if (k >= 0 && k <= N) { s += raw[k].ink; c++; } }
        const w = smoothstep(0.12, 0.55, s / c);
        const R = raw[i], zc = R.side * Math.max(Math.abs(R.zr), band);
        pts.push(new THREE.Vector3(R.x, R.y, R.zr * (1 - w) + zc * w));
      }
      return new THREE.CatmullRomCurve3(pts, false, "centripetal");
    }

    // Band mode: ONE ribbon sweeping horizontally across the selected letters, weaving in
    // front of and behind them. We split the sweep into "letter runs" (where it's over ink) and
    // "gaps". Each run gets a held side (+front / −back) that ALTERNATES run→run; the sign only
    // ever changes by smoothstepping across a gap — so a front↔back crossing always happens in
    // clear space, never on a stroke. z reach is bounded (a small multiple of the clearance), so
    // the dives are shallow and gentle instead of the deep, steep swings that used to shard.
    function generateBandPath(idxs) {
      const r = rng(seed * 131 + 911);
      const phase = r() * TAU, nY = makeNoise(r), nZ = makeNoise(r);
      let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
      for (const i of idxs) { const b = guides.get(i); minx = Math.min(minx, b.minx); maxx = Math.max(maxx, b.maxx); miny = Math.min(miny, b.miny); maxy = Math.max(maxy, b.maxy); }
      const spanW = maxx - minx, bandH = Math.max(0.1, maxy - miny), nLetters = idxs.length;
      const pad = bandH * 0.45, xLo = minx - pad, xHi = maxx + pad, fullX = xHi - xLo;
      const startX = xLo + fullX * (1 - P.cover) * 0.5, sweepX = fullX * P.cover, yc = (miny + maxy) / 2;
      const yAmp = clamp(bandH * (0.12 + 0.42 * P.wrap), 0.04, bandH * 0.62);
      const yLobes = Math.max(1, Math.round(nLetters * 0.6));
      const clearance = LT / 2 + P.width + 0.045;             // sit just clear of the glyph face
      const reach = clearance * (1 + 0.8 * P.depth);          // how far in front / behind (bounded by depth)
      const N = clamp(Math.round((spanW / bandH) * 90), 360, 900);

      // sample x, a gentle serpentine y, and ink occupancy across the sweep
      const X = [], Y = [], INK = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N, env = smoothstep(0, 0.05, t) * smoothstep(0, 0.05, 1 - t);
        const x = startX + sweepX * t;
        const y = yc + yAmp * env * (Math.sin(yLobes * TAU * t + phase) + P.chaos * 0.35 * nY(t));
        X.push(x); Y.push(y); INK.push(gSample(x, y) ? 1 : 0);
      }
      const win = Math.max(4, Math.round(N * 0.025));          // soften the ink field so runs are clean
      const inkS = INK.map((_, i) => { let s = 0, c = 0; for (let j = -win; j <= win; j++) { const k = i + j; if (k >= 0 && k <= N) { s += INK[k]; c++; } } return s / c; });

      // segment into letter runs (ink over threshold); merge tiny gaps, drop tiny runs
      const TH = 0.4, minLen = Math.max(2, Math.round(N * 0.015));
      const raw = []; let inRun = false, s0 = 0;
      for (let i = 0; i <= N; i++) {
        const hot = inkS[i] >= TH;
        if (hot && !inRun) { inRun = true; s0 = i; } else if (!hot && inRun) { inRun = false; raw.push([s0, i - 1]); }
      }
      if (inRun) raw.push([s0, N]);
      const runs = [];
      for (const [a, b] of raw) {
        if (runs.length && a - runs[runs.length - 1][1] <= minLen) runs[runs.length - 1][1] = b;
        else runs.push([a, b]);
      }
      const letters = runs.filter(([a, b]) => b - a >= minLen);

      // target weave side per sample: hold a sign over each letter, alternate run→run, and
      // smoothstep the sign across the GAP between runs (so every crossing lands in clear space).
      const sideAt = new Float32Array(N + 1);
      if (!letters.length) {
        for (let i = 0; i <= N; i++) sideAt[i] = Math.sin(Math.PI * (i / N));   // no ink → one gentle bow
      } else {
        const sgn = (k) => (k % 2 === 0 ? 1 : -1);
        for (let i = 0; i < letters[0][0]; i++) sideAt[i] = sgn(0);
        for (let k = 0; k < letters.length; k++) {
          const [a, b] = letters[k];
          for (let i = a; i <= b; i++) sideAt[i] = sgn(k);
          if (k < letters.length - 1) {
            const c = letters[k + 1][0], g = c - b;
            for (let i = b; i <= c; i++) { const f = g > 0 ? smoothstep(0, 1, (i - b) / g) : 1; sideAt[i] = sgn(k) * (1 - f) + sgn(k + 1) * f; }
          }
        }
        for (let i = letters[letters.length - 1][1]; i <= N; i++) sideAt[i] = sgn(letters.length - 1);
      }

      // z = bounded reach * side, eased in/out at the span ends, with a faint organic wobble
      const pts = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N, env = smoothstep(0, 0.07, t) * smoothstep(0, 0.07, 1 - t);
        const z = (reach * sideAt[i] + P.chaos * 0.1 * reach * nZ(t)) * env;
        pts.push(new THREE.Vector3(X[i], Y[i], z));
      }
      return new THREE.CatmullRomCurve3(pts, false, "centripetal");
    }

    function buildStrip(curve, a, b, faceView) {
      const M = 240, pos = [], tan = [];
      for (let i = 0; i <= M; i++) { const u = a + (b - a) * (i / M); pos.push(curve.getPoint(u)); tan.push(curve.getTangent(u).normalize()); }
      const verts = [], idx = [];
      if (faceView) {
        // Camera-stable frame (band mode): the strip's width is kept in the screen plane —
        // perpendicular to the path's xy-direction — so steep front↔back dives just foreshorten
        // the ribbon instead of spinning the frame into shards. Twist folds it around the path.
        const view = new THREE.Vector3(0, 0, 1);
        for (let i = 0; i <= M; i++) {
          const T = tan[i];
          const dir = new THREE.Vector3().crossVectors(view, T);
          if (dir.lengthSq() < 1e-8) dir.set(0, 1, 0); else dir.normalize();
          const out = new THREE.Vector3().crossVectors(T, dir).normalize();
          const theta = P.twist * Math.PI * 2 * (i / M);
          const d = dir.multiplyScalar(Math.cos(theta)).add(out.multiplyScalar(Math.sin(theta)));
          const taper = 1 - 0.8 * Math.pow(Math.abs((i / M) * 2 - 1), 2.4), hw = P.width * taper;
          const Lp = pos[i].clone().add(d.clone().multiplyScalar(hw)), Rp = pos[i].clone().add(d.clone().multiplyScalar(-hw));
          verts.push(Lp.x, Lp.y, Lp.z, Rp.x, Rp.y, Rp.z);
        }
      } else {
        const up = Math.abs(tan[0].z) > 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
        let normal = up.clone().sub(tan[0].clone().multiplyScalar(up.dot(tan[0]))).normalize();
        const normals = [normal.clone()];
        for (let i = 1; i <= M; i++) {
          const T0 = tan[i - 1], T = tan[i], ax = T0.clone().cross(T), len = ax.length(), nn = normals[i - 1].clone();
          if (len > 1e-6) { ax.normalize(); nn.applyAxisAngle(ax, Math.asin(Math.min(1, len))); }
          nn.sub(T.clone().multiplyScalar(nn.dot(T))).normalize(); normals.push(nn);
        }
        for (let i = 0; i <= M; i++) {
          const T = tan[i], Nv = normals[i], Bn = T.clone().cross(Nv).normalize();
          const theta = P.twist * Math.PI * 2 * (i / M);
          const dir = Nv.clone().multiplyScalar(Math.cos(theta)).add(Bn.clone().multiplyScalar(Math.sin(theta)));
          const taper = 1 - 0.8 * Math.pow(Math.abs((i / M) * 2 - 1), 2.4), hw = P.width * taper;
          const Lp = pos[i].clone().add(dir.clone().multiplyScalar(hw)), Rp = pos[i].clone().add(dir.clone().multiplyScalar(-hw));
          verts.push(Lp.x, Lp.y, Lp.z, Rp.x, Rp.y, Rp.z);
        }
      }
      for (let i = 0; i < M; i++) { const o = i * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
      geo.setIndex(idx); geo.computeVertexNormals();
      return geo;
    }

    function buildRibbons() {
      disposeRibbons();
      ribbonGroup = new THREE.Group();
      const picks = (P.picks || []).filter((i) => guides.has(i));
      const addRibbon = (curve, k, faceView) => {
        const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.55, metalness: 0.05, color: new THREE.Color(colors[k % colors.length] || ink) });
        const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
        ribbonGroup.add(mesh); specs.push({ curve, mesh, faceView: !!faceView });
      };
      if (P.band && picks.length && gSample) {
        addRibbon(generateBandPath(picks), 0, true);        // one ribbon woven across the selected letters
      } else {
        picks.forEach((i, k) => { const L = guides.get(i); if (L && L.sample) addRibbon(generatePath(L, k), k, false); });
      }
      scene.add(ribbonGroup);
      layoutRibbons(0);
    }
    function windowAB(clock) {
      let seg = clamp(P.segment, 0.05, 1);
      if (P.flow > 0) seg = Math.min(seg, 0.85);            // ensure room to travel even at full length
      const p = P.flow > 0 ? pingpong(P.travel + clock * P.flow * 0.22) : clamp(P.travel, 0, 1);
      const a = p * (1 - seg);
      return [a, a + seg];
    }
    function layoutRibbons(clock) {
      const [a, b] = windowAB(clock);
      for (const s of specs) { s.mesh.geometry.dispose(); s.mesh.geometry = buildStrip(s.curve, a, b, s.faceView); }
    }

    function applyCam() {
      if (!worldBox) return;
      const w = worldBox.maxx - worldBox.minx, h = worldBox.maxy - worldBox.miny;
      const half = Math.max(w, h) / 2 * 1.14 + P.depth * 0.4;
      camera.left = -half; camera.right = half; camera.top = half; camera.bottom = -half;
      camera.zoom = zoom; camera.position.x = panX; camera.position.y = panY;
      camera.updateProjectionMatrix();
      dirty = true;
    }
    function applyColors() { letterMat.color = new THREE.Color(ink); renderer.setClearColor(new THREE.Color(ground), 1); dirty = true; }

    function rebuildAll() {
      const fam = (font && font.css) || "";
      const want = [P.glyphs, fam, font && font.weight, font && font.italic].join("|");
      const my = ++token;
      const ready = (document.fonts && fam) ? document.fonts.load(`${font.weight || 700} 200px ${fam}`, P.glyphs || "F").catch(() => {}) : Promise.resolve();
      ready.then(() => {
        if (my !== token) return;
        const r = buildContours();
        if (!r) { disposeLetters(); disposeRibbons(); guides = new Map(); dirty = true; return; }
        guides = r.guides; worldBox = r.worldBox; gSample = r.gSample;
        buildLetters(r.shapes); buildRibbons(); applyCam(); contourKey = want; dirty = true;
      });
    }

    applyColors(); rebuildAll();

    function resize() {
      const rb = host.getBoundingClientRect(), s = Math.max(1, Math.min(rb.width, rb.height || rb.width));
      renderer.setSize(s, s, false); canvas.style.width = "100%"; canvas.style.height = "100%"; dirty = true;
    }
    resize();
    const ro = new ResizeObserver(resize); ro.observe(host);

    // ---- zoom (wheel) + pan (drag), no rotation -----------------------------
    const onWheel = (e) => { e.preventDefault(); zoom = clamp(zoom * (1 - e.deltaY * 0.0015), 0.4, 8); applyCam(); };
    let dragging = false, lx = 0, ly = 0;
    const onDown = (e) => { dragging = true; lx = e.clientX; ly = e.clientY; canvas.setPointerCapture?.(e.pointerId); };
    const onMove = (e) => {
      if (!dragging) return;
      const px = canvas.clientWidth || 1, wpp = (camera.right - camera.left) / camera.zoom / px;
      panX -= (e.clientX - lx) * wpp; panY += (e.clientY - ly) * wpp; lx = e.clientX; ly = e.clientY; applyCam();
    };
    const onUp = () => { dragging = false; };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointerleave", onUp);

    // ---- render loop: animate only when auto-travel is on; else render on demand
    let raf = 0, running = true, animStart = performance.now();
    function loop(now) {
      if (!running) return;
      const animating = P.flow > 0 && specs.length;
      if (animating) { layoutRibbons((now - animStart) / 1000); dirty = true; }
      if (dirty) { renderer.render(scene, camera); dirty = false; }
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    return {
      update(nc) {
        const fam = (nc.font && nc.font.css) || "";
        const want = [nc.params.glyphs, fam, nc.font && nc.font.weight, nc.font && nc.font.italic].join("|");
        const prev = P, prevSeed = seed;
        P = { ...nc.params }; colors = nc.colors; ink = nc.ink; ground = nc.ground; seed = nc.seed; font = nc.font;
        applyColors();
        if (want !== contourKey) { rebuildAll(); return; }                 // string / typeface → full retrace
        const pathChanged = PATH_KEYS.some((k) => prev[k] !== P[k]) || seed !== prevSeed || picksChanged(prev.picks, P.picks);
        if (pathChanged) { seedAtBuild = seed; buildRibbons(); applyCam(); } // regenerate wrap paths
        else { layoutRibbons((performance.now() - animStart) / 1000); }      // only travel / segment / flow → reposition
        dirty = true;
      },
      destroy() {
        running = false; cancelAnimationFrame(raf); ro.disconnect();
        canvas.removeEventListener("wheel", onWheel); canvas.removeEventListener("pointerdown", onDown);
        canvas.removeEventListener("pointermove", onMove); canvas.removeEventListener("pointerup", onUp);
        canvas.removeEventListener("pointerleave", onUp);
        disposeLetters(); disposeRibbons(); letterMat.dispose(); renderer.dispose(); canvas.remove();
      },
      snapshotCanvas() { renderer.render(scene, camera); return canvas; },
    };
  },
};
