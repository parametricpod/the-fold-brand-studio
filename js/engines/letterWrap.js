// letterWrap.js — the string IS the artwork. The text you type is set large and flat
// (2D, no rotation) in the chosen wordmark typeface. Tick the letter instances you want
// and a folded satin ribbon wraps around each one — passing in FRONT of the stroke and
// BEHIND it (the glyph is a real solid in the depth buffer, so it occludes back passes).
// Weave mode threads ONE ribbon across the picked letters: a meandering, anchor-built
// path that crosses each letter at a seeded height/angle, swoops through the gaps, and
// drapes in z like fabric over solids — pinned flat against a glyph face wherever the
// strip overlaps ink, with smoothly rounded fold shoulders at every letter edge. The
// ribbon is lit as satin (sheen + anisotropy + a studio environment) and breathes with
// a slow billow. Scroll to zoom · drag to pan.
import * as THREE from "three";
import { rng } from "../util.js";
import { makeEnv, ribbonMaterial } from "./materials.js";

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
  blurb: "Your string, set large and flat. Tick letters to wrap a folded ribbon around each — or turn on ‘Weave across letters’ for one satin ribbon threading through them. Scroll to zoom · drag to pan.",
  params: [
    { key: "glyphs",  type: "hidden", default: "THE FOLD" },
    { key: "picks",   type: "hidden", default: [4] },
    { key: "material", label: "Material", type: "select", default: "satin",
      options: [{ value: "satin", label: "Satin" }, { value: "sketch", label: "Pencil / cross-hatch" }] },
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

    // Lighting rig — calibrated so a flat +z letter face sums to ~1.0 (brand color stays true).
    // Two key halves at the same direction (the split is a historical artifact of an old shadow
    // rig; kept so the satin's light sum is unchanged). No cast shadows — depth reads from the
    // glyphs being real solids in the depth buffer, not from a dramatic drop shadow.
    const keyDir = new THREE.Vector3(-2.2, 2.6, 3.5).normalize();
    const keyA = new THREE.DirectionalLight(0xfff3e4, 0.55);
    const keyB = new THREE.DirectionalLight(0xfff3e4, 0.42);
    const rimL = new THREE.DirectionalLight(0xdfe9ff, 0.32); rimL.position.set(2.5, -1.5, 2);
    scene.add(keyA, keyA.target, keyB, rimL, new THREE.AmbientLight(0xffffff, 0.16));

    // Studio environment (PMREM) — softboxes in a dim room — so the satin catches light.
    scene.environment = makeEnv(renderer);
    const pixScale = () => 12 * renderer.getPixelRatio();  // hatch spacing for the sketch material

    const letterMat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.85, metalness: 0, envMapIntensity: 0 });

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
        const mesh = new THREE.Mesh(geo, letterMat);
        letterGroup.add(mesh);
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

    // ---- weave mode: ONE satin ribbon threading across the picked letters ----
    // The path is built from seeded ANCHORS, not a sine: it enters off-canvas, crosses each
    // letter at its own height and angle, and swoops through the gaps (an S through wide word
    // spaces) — a meander, not a wave. Along that path the ribbon treats the glyphs as SOLIDS:
    // ink is sampled with the strip's half-width dilated in, and wherever the strip would
    // overlap a letter its z is PINNED flat against the front or back face (sides alternate
    // letter→letter; a flip is skipped when the gap is too tight to cross cleanly). Between
    // pins, z relaxes like a taut membrane, then the shoulders are ROUNDED (smooth + re-pin)
    // so every fold over a letter edge is a soft fabric fold, not a crease. The result is a
    // dense polyline TABLE — the strip is built straight from it (linear interpolation, no
    // spline overshoot, nothing can ever poke into a glyph).
    function generateBandTable(idxs) {
      const r = rng(seed * 131 + 911);
      const nY = makeNoise(r), nBillow = makeNoise(r), nSway = makeNoise(r);
      const Ls = idxs.map((i) => guides.get(i)).sort((a, b) => (a.minx + a.maxx) - (b.minx + b.maxx));
      let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
      for (const b of Ls) { minx = Math.min(minx, b.minx); maxx = Math.max(maxx, b.maxx); miny = Math.min(miny, b.miny); maxy = Math.max(maxy, b.maxy); }
      const H = Math.max(0.1, maxy - miny), yc = (miny + maxy) / 2;
      const clearance = LT / 2 + P.width + 0.05;            // ribbon face-to-face distance off a glyph
      const ride = clearance * (1 + 0.35 * P.depth);
      const pad = H * 0.5 + (maxx - minx) * 0.06;
      const drama = 0.3 + 0.9 * P.wrap;                     // swoop scale in the gaps
      const yLo = miny - H * 0.85, yHi = maxy + H * 0.85;

      // -- anchors: entry → (swoop, cross letter) per letter → exit
      const A = [];
      let prevY = yc + (r() - 0.5) * H * 0.7;
      A.push({ x: minx - pad * 1.45, y: clamp(prevY + (r() - 0.5) * H * 0.35, yLo, yHi) });
      A.push({ x: minx - pad * 0.55, y: prevY });
      Ls.forEach((L, k) => {
        const Lh = Math.max(0.05, L.maxy - L.miny), Lw = Math.max(0.05, L.maxx - L.minx);
        const fly = Ls.length >= 4 && r() < P.chaos * 0.22;            // occasionally soar OVER a letter
        const hm = fly ? L.maxy + H * 0.22 : L.miny + Lh * (0.22 + 0.56 * r());
        const tilt = fly ? (r() - 0.5) * H * 0.12 : (r() - 0.5) * Lh * (0.25 + 0.55 * P.wrap);
        const h0 = clamp(hm - tilt / 2, yLo, yHi), h1 = clamp(hm + tilt / 2, yLo, yHi);
        const gx0 = k === 0 ? minx - pad * 0.55 : Ls[k - 1].maxx, gx1 = L.minx, gw = gx1 - gx0;
        if (gw > H * 0.34) {                                          // room to swoop before this letter
          const dir = r() < 0.5 ? 1 : -1;
          let amp = H * drama * (0.35 + 0.75 * r()) * Math.min(1, gw / (H * 0.9));
          if (Math.abs(h0 - prevY) > H * 0.45) amp *= 0.4;            // the diagonal IS the drama — don't pile on
          if (gw > H * 1.6) {                                         // wide gap (word space): S-swoop
            A.push({ x: gx0 + gw * 0.26, y: clamp(prevY + dir * amp * 0.7, yLo, yHi) });
            A.push({ x: gx0 + gw * 0.74, y: clamp(h0 - dir * amp * 0.5, yLo, yHi) });
          } else {
            A.push({ x: gx0 + gw * (0.35 + 0.3 * r()), y: clamp((prevY + h0) / 2 + dir * amp, yLo, yHi) });
          }
        }
        A.push({ x: L.minx + Lw * 0.06, y: h0 });
        A.push({ x: L.maxx - Lw * 0.06, y: h1 });
        prevY = h1;
      });
      A.push({ x: maxx + pad * 0.55, y: clamp(prevY + (r() - 0.5) * H * 0.45, yLo, yHi) });
      A.push({ x: maxx + pad * 1.45, y: clamp(prevY + (r() - 0.5) * H * 0.8, yLo, yHi) });
      for (let i = 1; i < A.length; i++) if (A[i].x <= A[i - 1].x + 0.015) A[i].x = A[i - 1].x + 0.015; // keep x ordered (kerned overlaps)

      // -- sample the meander uniformly by arc length, add a whisper of drift
      const curve2 = new THREE.CatmullRomCurve3(A.map((p) => new THREE.Vector3(p.x, p.y, 0)), false, "centripetal", 0.5);
      const arcLen = curve2.getLength();
      const NS = clamp(Math.round((arcLen / H) * 150), 500, 1600);
      let sp = curve2.getSpacedPoints(NS);
      const ds = arcLen / NS;
      if (P.cover < 1) { const i0 = Math.round(NS * (1 - P.cover) * 0.5); sp = sp.slice(i0, sp.length - i0); }
      const N = sp.length - 1;
      const X = new Float64Array(N + 1), Y = new Float64Array(N + 1), INK = new Float64Array(N + 1);
      for (let i = 0; i <= N; i++) {
        X[i] = sp[i].x;
        Y[i] = clamp(sp[i].y + H * 0.05 * P.chaos * nY(i / N), yLo - H * 0.1, yHi + H * 0.1);
        INK[i] = gSample(X[i], Y[i]) ? 1 : 0;
      }
      const win = Math.max(3, Math.round(N * 0.02));
      const inkS = new Float64Array(N + 1);
      for (let i = 0; i <= N; i++) { let s = 0, c = 0; for (let j = -win; j <= win; j++) { const k = i + j; if (k >= 0 && k <= N) { s += INK[k]; c++; } } inkS[i] = s / c; }

      // -- letter runs along the path (ink over threshold); merge tiny gaps, drop tiny runs
      const TH = 0.4, minLen = Math.max(2, Math.round(N * 0.012));
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

      // -- weave side per run: alternate front/back, but DON'T flip across a gap too tight
      // to cross cleanly (the ribbon just stays on its side — drapes past both letters).
      const Rdil = P.width + 0.03;                          // ink dilation: the WHOLE strip must clear
      const fringe = Math.ceil(Rdil / ds) + 2;              // pins reach ~this far past a run's ends
      const minCross = Math.max(4, Math.round((ride * 1.1) / ds) + 2 * fringe);
      const signs = [];
      letters.forEach(([a], k) => {
        if (k === 0) signs.push(r() < 0.5 ? 1 : -1);
        else signs.push(a - letters[k - 1][1] >= minCross ? -signs[k - 1] : signs[k - 1]);
      });

      // target side field: hold the sign over each run (+fringe), ease across the rest of the gap
      const sideAt = new Float32Array(N + 1);
      if (!letters.length) {
        for (let i = 0; i <= N; i++) sideAt[i] = Math.sin(Math.PI * (i / N));   // no ink → one gentle bow
      } else {
        for (let i = 0; i < letters[0][0]; i++) sideAt[i] = signs[0];
        for (let k = 0; k < letters.length; k++) {
          const [a, b] = letters[k];
          for (let i = a; i <= b; i++) sideAt[i] = signs[k];
          if (k < letters.length - 1) {
            const c = letters[k + 1][0], g = c - b;
            const fr = Math.min(Math.floor(g * 0.33), fringe);
            const b2 = b + fr, c2 = c - fr;
            for (let i = b; i <= c; i++) {
              const f = i <= b2 ? 0 : i >= c2 ? 1 : smoothstep(0, 1, (i - b2) / Math.max(1, c2 - b2));
              sideAt[i] = signs[k] * (1 - f) + signs[k + 1] * f;
            }
          }
        }
        for (let i = letters[letters.length - 1][1]; i <= N; i++) sideAt[i] = signs[letters.length - 1];
      }

      // -- z drape against SOLIDS: pin z flat against a glyph face wherever the dilated strip
      // overlaps ink; relax the free spans (taut membrane), then ROUND the fold shoulders
      // (smooth everything, re-pin) so edges fold softly instead of creasing. Ends thread flat.
      const over = (x, y) => {
        if (gSample(x, y)) return true;
        for (let a = 0; a < 8; a++) { const an = (a * TAU) / 8; if (gSample(x + Rdil * Math.cos(an), y + Rdil * Math.sin(an))) return true; }
        return false;
      };
      const sgnOf = (i) => (sideAt[i] >= 0 ? 1 : -1);
      // each run rides at a slightly different height off the face, so two passes over the
      // same letter can never be coplanar (z-fight shimmer) — and the stack reads organic.
      // The field is smoothed so plateau heights blend continuously (never below clearance).
      const rideAt = new Float64Array(N + 1).fill(ride);
      letters.forEach(([a, b], k) => { const rk = ride * (1 + 0.11 * (k % 3)); for (let i = a; i <= b; i++) rideAt[i] = rk; });
      for (let it = 0; it < 30; it++) { const p2 = rideAt.slice(); for (let i = 1; i < N; i++) rideAt[i] = (p2[i - 1] + p2[i] + p2[i + 1]) / 3; }
      const fixed = new Uint8Array(N + 1);
      let z = new Float64Array(N + 1);
      for (let i = 0; i <= N; i++) { fixed[i] = over(X[i], Y[i]) ? 1 : 0; z[i] = sideAt[i] * rideAt[i]; }
      const pin = (arr) => { for (let i = 0; i <= N; i++) if (fixed[i]) arr[i] = sgnOf(i) * rideAt[i]; arr[0] = 0; arr[N] = 0; };
      pin(z);
      for (let it = 0; it < 50; it++) {                     // taut spans between pinned faces
        const prev = z.slice();
        for (let i = 1; i < N; i++) if (!fixed[i]) z[i] = (prev[i - 1] + prev[i + 1]) * 0.5;
        z[0] = 0; z[N] = 0;
      }
      for (let it = 0; it < 26; it++) {                     // rounded fabric shoulders at every edge
        const prev = z.slice();
        for (let i = 1; i < N; i++) z[i] = prev[i - 1] * 0.25 + prev[i] * 0.5 + prev[i + 1] * 0.25;
        pin(z);
      }

      // -- self-collision: where the meander crosses ITSELF in screen space (loops), push the
      // two strands apart in z (feathered, free samples only) so they layer like real ribbon
      // instead of z-fighting. `damp` quiets the billow there so they can't drift back together.
      const damp = new Float64Array(N + 1).fill(1);
      const sepZ = Math.max(0.07, P.width * 1.2), nearXY = (P.width * 1.35) ** 2;
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 2; i <= N; i += 2) for (let jj = i + 60; jj <= N - 2; jj += 2) {
          const dx = X[i] - X[jj], dy = Y[i] - Y[jj];
          if (dx * dx + dy * dy > nearXY) continue;
          const dzn = z[i] - z[jj], need = (sepZ - Math.abs(dzn)) / 2;
          if (need <= 0) continue;
          const s = dzn >= 0 ? 1 : -1;
          const feather = (idx, amt) => {
            for (let k = -16; k <= 16; k++) {
              const m = idx + k;
              if (m > 0 && m < N && !fixed[m]) { z[m] += amt * (1 - smoothstep(5, 16, Math.abs(k))); damp[m] = Math.min(damp[m], 0.3); }
            }
          };
          if (!fixed[i] && !fixed[jj]) { feather(i, s * need); feather(jj, -s * need); }
          else if (!fixed[i]) feather(i, s * need * 2);
          else if (!fixed[jj]) feather(jj, -s * need * 2);
        }
      }

      // -- billow freedom: 0 at pins (fabric is held), 1 mid-gap (fabric is free to breathe)
      const dist = new Float64Array(N + 1).fill(1e9);
      for (let i = 0; i <= N; i++) if (fixed[i] || i === 0 || i === N) dist[i] = 0;
      for (let i = 1; i <= N; i++) dist[i] = Math.min(dist[i], dist[i - 1] + 1);
      for (let i = N - 1; i >= 0; i--) dist[i] = Math.min(dist[i], dist[i + 1] + 1);

      // -- resample everything to a uniform-arc TABLE (3D length, so travel glides evenly)
      const cum = new Float64Array(N + 1);
      for (let i = 1; i <= N; i++) cum[i] = cum[i - 1] + Math.hypot(X[i] - X[i - 1], Y[i] - Y[i - 1], z[i] - z[i - 1]);
      const total = cum[N], NN = 1000;
      const TX = new Float32Array(NN + 1), TY = new Float32Array(NN + 1), TZ = new Float32Array(NN + 1), TE = new Float32Array(NN + 1);
      let j = 0;
      for (let i = 0; i <= NN; i++) {
        const want = (i / NN) * total;
        while (j < N - 1 && cum[j + 1] < want) j++;
        const f = (want - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]);
        TX[i] = X[j] + (X[j + 1] - X[j]) * f;
        TY[i] = Y[j] + (Y[j + 1] - Y[j]) * f;
        TZ[i] = z[j] + (z[j + 1] - z[j]) * f;
        const d = dist[j] + (dist[j + 1] - dist[j]) * f;
        TE[i] = smoothstep(3, 22, d) * (damp[j] + (damp[j + 1] - damp[j]) * f);
      }
      // normalized z-slope → drives the fold roll (the satin glint as it dives)
      const SL = new Float32Array(NN + 1);
      let mx = 1e-6;
      for (let i = 1; i < NN; i++) { SL[i] = (TZ[i + 1] - TZ[i - 1]) * 0.5; mx = Math.max(mx, Math.abs(SL[i])); }
      for (let pass = 0; pass < 3; pass++) { const p2 = SL.slice(); for (let i = 1; i < NN; i++) SL[i] = (p2[i - 1] + p2[i] + p2[i + 1]) / 3; }
      for (let i = 0; i <= NN; i++) SL[i] /= mx;

      return { X: TX, Y: TY, Z: TZ, EN: TE, SL, NN, ride, H, nBillow, nSway };
    }

    // shared geometry tail: indexed strip + uv (u along the length) + normals + tangents
    function stripGeo(verts, uvs, M) {
      const idx = [];
      for (let i = 0; i < M; i++) { const o = i * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(idx); geo.computeVertexNormals();
      try { geo.computeTangents(); } catch (e) { /* anisotropy falls back to derivative tangents */ }
      return geo;
    }

    // Weave strip: built straight from the table (no spline — nothing can overshoot into a
    // glyph). Camera-stable frame: width stays in the screen plane, so dives foreshorten
    // instead of spinning. A slope-driven ROLL folds the face over as it dives behind a
    // letter (the satin fold), and a slow billow lets the free spans breathe like silk.
    function buildBandStrip(tbl, a, b, time) {
      const M = 520, n = tbl.NN;
      const billowAmp = tbl.ride * (0.22 + 0.5 * P.chaos);
      const maxRoll = clamp(0.3 + 0.45 * P.twist, 0, 1.15);
      const px = new Float64Array(M + 1), py = new Float64Array(M + 1), pz = new Float64Array(M + 1), rl = new Float64Array(M + 1);
      for (let i = 0; i <= M; i++) {
        const u = a + (b - a) * (i / M), f = clamp(u, 0, 1) * n;
        const j = Math.min(n - 1, Math.floor(f)), t = f - j;
        const lerp = (A) => A[j] + (A[j + 1] - A[j]) * t;
        const en = lerp(tbl.EN);
        px[i] = lerp(tbl.X) + 0;
        py[i] = lerp(tbl.Y) + en * tbl.H * 0.018 * tbl.nSway(u * 2.6 + time * 0.09);
        pz[i] = lerp(tbl.Z) + en * billowAmp * tbl.nBillow(u * 2.0 + time * 0.13);
        rl[i] = maxRoll * lerp(tbl.SL) * (1 + 0.12 * Math.sin(time * 0.5 + u * 9));
      }
      const verts = [], uvs = [];
      const view = new THREE.Vector3(0, 0, 1), T = new THREE.Vector3(), dir = new THREE.Vector3(), out = new THREE.Vector3(), d = new THREE.Vector3();
      for (let i = 0; i <= M; i++) {
        const i0 = Math.max(0, i - 1), i1 = Math.min(M, i + 1);
        T.set(px[i1] - px[i0], py[i1] - py[i0], pz[i1] - pz[i0]).normalize();
        dir.crossVectors(view, T);
        if (dir.lengthSq() < 1e-8) dir.set(0, 1, 0); else dir.normalize();
        out.crossVectors(T, dir).normalize();
        const th = rl[i];
        d.copy(dir).multiplyScalar(Math.cos(th)).addScaledVector(out, Math.sin(th));
        const hw = P.width;                                 // constant width — a real satin ribbon, not a tapered worm
        verts.push(px[i] + d.x * hw, py[i] + d.y * hw, pz[i] + d.z * hw,
                   px[i] - d.x * hw, py[i] - d.y * hw, pz[i] - d.z * hw);
        uvs.push((i / M) * 12, 0, (i / M) * 12, 1);
      }
      return stripGeo(verts, uvs, M);
    }

    // Per-letter strip (helix paths): parallel-transport frame along the curve.
    function buildStrip(curve, a, b) {
      const M = 240, pos = [], tan = [];
      for (let i = 0; i <= M; i++) { const u = a + (b - a) * (i / M); pos.push(curve.getPoint(u)); tan.push(curve.getTangent(u).normalize()); }
      const up = Math.abs(tan[0].z) > 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
      let normal = up.clone().sub(tan[0].clone().multiplyScalar(up.dot(tan[0]))).normalize();
      const normals = [normal.clone()];
      for (let i = 1; i <= M; i++) {
        const T0 = tan[i - 1], T = tan[i], ax = T0.clone().cross(T), len = ax.length(), nn = normals[i - 1].clone();
        if (len > 1e-6) { ax.normalize(); nn.applyAxisAngle(ax, Math.asin(Math.min(1, len))); }
        nn.sub(T.clone().multiplyScalar(nn.dot(T))).normalize(); normals.push(nn);
      }
      const verts = [], uvs = [];
      for (let i = 0; i <= M; i++) {
        const T = tan[i], Nv = normals[i], Bn = T.clone().cross(Nv).normalize();
        const theta = P.twist * Math.PI * 2 * (i / M);
        const dir = Nv.clone().multiplyScalar(Math.cos(theta)).add(Bn.clone().multiplyScalar(Math.sin(theta)));
        const taper = 1 - 0.8 * Math.pow(Math.abs((i / M) * 2 - 1), 2.4), hw = P.width * taper;
        const Lp = pos[i].clone().add(dir.clone().multiplyScalar(hw)), Rp = pos[i].clone().add(dir.clone().multiplyScalar(-hw));
        verts.push(Lp.x, Lp.y, Lp.z, Rp.x, Rp.y, Rp.z);
        uvs.push((i / M) * 12, 0, (i / M) * 12, 1);
      }
      return stripGeo(verts, uvs, M);
    }

    const ribbonMat = (k) => ribbonMaterial(P.material, {
      color: colors[k % colors.length] || ink, ink, paper: ground, scale: pixScale(),
    });

    function buildRibbons() {
      disposeRibbons();
      ribbonGroup = new THREE.Group();
      const picks = (P.picks || []).filter((i) => guides.has(i));
      const addRibbon = (spec, k) => {
        const mesh = new THREE.Mesh(new THREE.BufferGeometry(), ribbonMat(k));
        ribbonGroup.add(mesh); specs.push({ ...spec, mesh, k });
      };
      if (P.band && picks.length && gSample) {
        addRibbon({ table: generateBandTable(picks), band: true }, 0);   // one ribbon woven across the letters
      } else {
        picks.forEach((i, k) => { const L = guides.get(i); if (L && L.sample) addRibbon({ curve: generatePath(L, k), band: false }, k); });
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
      for (const s of specs) {
        s.mesh.geometry.dispose();
        s.mesh.geometry = s.band ? buildBandStrip(s.table, a, b, clock) : buildStrip(s.curve, a, b);
      }
    }

    function applyCam() {
      if (!worldBox) return;
      const w = worldBox.maxx - worldBox.minx, h = worldBox.maxy - worldBox.miny;
      const half = Math.max(w, h) / 2 * 1.14 + P.depth * 0.4;
      camera.left = -half; camera.right = half; camera.top = half; camera.bottom = -half;
      camera.zoom = zoom; camera.position.x = panX; camera.position.y = panY;
      camera.updateProjectionMatrix();
      // aim the key lights at the word (direction only — no shadow camera to fit)
      const cx = (worldBox.minx + worldBox.maxx) / 2, cy = (worldBox.miny + worldBox.maxy) / 2;
      keyA.target.position.set(cx, cy, 0);
      keyA.position.set(cx + keyDir.x * half * 4, cy + keyDir.y * half * 4, keyDir.z * half * 4);
      keyB.position.copy(keyA.position);
      dirty = true;
    }
    function applyColors() {
      letterMat.color = new THREE.Color(ink);
      renderer.setClearColor(new THREE.Color(ground), 1);
      for (const s of specs) {
        const c = new THREE.Color(colors[s.k % colors.length] || ink);
        const m = s.mesh.material;
        if (m.isShaderMaterial) { m.uniforms.uInk.value.copy(c); m.uniforms.uPaper.value.set(ground); }
        else { m.color.copy(c); m.sheenColor.copy(c.clone().lerp(new THREE.Color(0xffffff), 0.55)); }
      }
      dirty = true;
    }

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

    // ---- render loop: weave mode is always alive (billow); helix mode animates with flow
    let raf = 0, running = true, animStart = performance.now();
    function loop(now) {
      if (!running) return;
      const animating = specs.length && (P.flow > 0 || specs.some((s) => s.band));
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
        const pathChanged = PATH_KEYS.some((k) => prev[k] !== P[k]) || seed !== prevSeed || picksChanged(prev.picks, P.picks) || prev.material !== P.material;
        if (pathChanged) { seedAtBuild = seed; buildRibbons(); applyCam(); } // regenerate wrap paths
        else { layoutRibbons((performance.now() - animStart) / 1000); }      // only travel / segment / flow → reposition
        dirty = true;
      },
      destroy() {
        running = false; cancelAnimationFrame(raf); ro.disconnect();
        canvas.removeEventListener("wheel", onWheel); canvas.removeEventListener("pointerdown", onDown);
        canvas.removeEventListener("pointermove", onMove); canvas.removeEventListener("pointerup", onUp);
        canvas.removeEventListener("pointerleave", onUp);
        disposeLetters(); disposeRibbons();
        if (scene.environment) scene.environment.dispose();
        letterMat.dispose(); renderer.dispose(); canvas.remove();
      },
      snapshotCanvas() { renderer.render(scene, camera); return canvas; },
    };
  },
};
