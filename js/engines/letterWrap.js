// letterWrap.js — the string IS the artwork. The text you type is set large and flat
// (2D, no rotation) in the chosen wordmark typeface. Tick the letter instances you
// want and a folded ribbon weaves in and out of and around each one — diving behind
// the flat glyph and popping in front. Per-letter chips are generated from the string.
import * as THREE from "three";
import { rng } from "../util.js";

const TAU = Math.PI * 2;
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const attr = (s) => String(s).replace(/"/g, "&quot;");

export default {
  id: "letter",
  label: "Letter weave",
  kind: "live",
  hideWordmark: true,
  blurb: "Your string, set large and flat. Tick the letters below to weave a folded ribbon in and out of each one.",
  params: [
    { key: "glyphs", type: "hidden", default: "THE FOLD" },
    { key: "picks",  type: "hidden", default: [4] },
    { key: "wrap",   label: "Wrap (in / out)", min: 0,    max: 0.5,  step: 0.005, default: 0.1 },
    { key: "depth",  label: "Weave depth",     min: 0,    max: 1,    step: 0.01,  default: 0.46 },
    { key: "passes", label: "Passes",          min: 1,    max: 16,   step: 1,     default: 4 },
    { key: "width",  label: "Ribbon width",    min: 0.01, max: 0.2,  step: 0.005, default: 0.07 },
    { key: "twist",  label: "Twist",           min: 0,    max: 3,    step: 0.01,  default: 0.5 },
    { key: "shift",  label: "Shift start",     min: 0,    max: 1,    step: 0.005, default: 0 },
    { key: "cover",  label: "Length",          min: 0.2,  max: 1,    step: 0.01,  default: 0.88 },
  ],

  // ---- custom controls: string input + per-letter chips ---------------------
  controls(p) {
    const chips = [...(p.glyphs || "")].map((ch, i) => ch.trim() === "" ? "" :
      `<button type="button" class="lw-chip ${p.picks.includes(i) ? "on" : ""}" data-pick="${i}">${esc(ch)}</button>`).join("");
    return `<label class="textparam"><span>String</span>
        <input type="text" id="lw-str" class="text" value="${attr(p.glyphs)}" maxlength="18" placeholder="Type your wordmark…"></label>
      <div class="lw-pick"><span class="lw-lbl">Weave which letters</span>
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
    canvas.style.width = "100%"; canvas.style.height = "100%"; canvas.style.display = "block";
    host.appendChild(canvas);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1.8, 1.8, 1.8, -1.8, -20, 20);
    camera.position.set(0, 0, 6);

    const key = new THREE.DirectionalLight(0xffffff, 1.7); key.position.set(-1.4, 2, 3); scene.add(key);
    const rim = new THREE.DirectionalLight(0xffffff, 0.7); rim.position.set(2, -1, 2); scene.add(rim);
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));

    const letterMat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.85, metalness: 0 });
    let letterGroup = null, ribbonGroup = null, guides = new Map(), worldBox = null, contourKey = "", token = 0;
    const LT = 0.12; // tiny letter extrusion so ribbons occlude cleanly (still reads 2D head-on)

    // ---- geometry helpers ---------------------------------------------------
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
      const seg = [], P0 = pts.slice(); if (P0[0] !== P0[P0.length - 1]) P0.push(P0[0]);
      let total = 0; for (let i = 0; i < P0.length - 1; i++) { const d = Math.hypot(P0[i + 1].x - P0[i].x, P0[i + 1].y - P0[i].y); seg.push(d); total += d; }
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

    // rasterize one character, return contours (local px) + grid for ink tests
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
          const dx = penX - pad;                       // local px -> global px
          let loops = trace(rc.grid, rc.W, rc.H).map((l) => ({ pts: l, a: area(l) })).filter((l) => l.a > 6).sort((p, q) => q.a - p.a);
          if (loops.length) {
            loops.forEach((l) => { l.depth = loops.reduce((n, o) => (o !== l && o.a > l.a && inPoly(o.pts, l.pts[0]) ? n + 1 : n), 0); });
            const g2 = (p) => ({ x: p.x + dx, y: p.y });
            const outers = loops.filter((l) => l.depth % 2 === 0).map((o) => ({
              outer: o.pts.map(g2),
              holes: loops.filter((h) => h.depth === o.depth + 1 && inPoly(o.pts, h.pts[0])).map((h) => h.pts.map(g2)),
            }));
            chars.push({ index: i, ch, outers, dom: outers[0].outer, grid: rc.grid, W: rc.W, H: rc.H, dx });
          }
        }
        penX += rc.adv;
      }
      if (!chars.length) return null;

      // global bbox -> centered world transform (fit width)
      let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
      for (const c of chars) for (const o of c.outers) for (const p of o.outer) {
        if (p.x < minx) minx = p.x; if (p.x > maxx) maxx = p.x; if (p.y < miny) miny = p.y; if (p.y > maxy) maxy = p.y;
      }
      const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2, K = 3.0 / Math.max(1, maxx - minx);
      const toW = (p) => ({ x: (p.x - cx) * K, y: -(p.y - cy) * K });

      // letter shapes (smoothed) + per-letter ribbon guide (world + outward normals)
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
        // guide from the dominant outline; normals flipped outward via this char's grid
        const base = chaikin(resampleClosed(c.dom, 200), 1);
        const inkAt = (gx, gy) => { const lx = Math.round(gx - c.dx), ly = Math.round(gy); return lx < 0 || ly < 0 || lx >= c.W || ly >= c.H ? 0 : c.grid[ly * c.W + lx]; };
        const NP = base.length;
        const guide = base.map((p, i) => {
          const a = base[(i - 1 + NP) % NP], b = base[(i + 1) % NP];
          let nx = b.y - a.y, ny = -(b.x - a.x); const L = Math.hypot(nx, ny) || 1; nx /= L; ny /= L;
          if (inkAt(p.x + nx * 3, p.y + ny * 3)) { nx = -nx; ny = -ny; }
          const w = toW(p), wl = Math.hypot(nx, -ny) || 1;
          return { x: w.x, y: w.y, nx: nx / wl, ny: -ny / wl };
        });
        gmap.set(c.index, guide);
      }
      const wb = (() => { const a = toW({ x: minx, y: miny }), b = toW({ x: maxx, y: maxy }); return { minx: Math.min(a.x, b.x), maxx: Math.max(a.x, b.x), miny: Math.min(a.y, b.y), maxy: Math.max(a.y, b.y) }; })();
      return { shapes, guides: gmap, worldBox: wb };
    }

    // ---- meshes -------------------------------------------------------------
    function disposeLetters() { if (letterGroup) { letterGroup.children.forEach((m) => m.geometry.dispose()); scene.remove(letterGroup); letterGroup = null; } }
    function disposeRibbons() { if (ribbonGroup) { ribbonGroup.children.forEach((m) => { m.geometry.dispose(); m.material.dispose(); }); scene.remove(ribbonGroup); ribbonGroup = null; } }

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

    function ribbonFor(guide, kColor) {
      const r = rng(seed * 131 + 7 + kColor * 17);
      const phA = r() * TAU, phB = r() * TAU, phC = r() * TAU;
      const NP = guide.length, zf = Math.max(1, Math.round(P.passes * 0.55) + 1);
      const ctrl = [];
      for (let i = 0; i < NP; i++) {
        const s = i / NP, gp = guide[i];
        const rad = P.wrap * Math.sin(P.passes * TAU * s + phA) + 0.45 * P.wrap * Math.sin(P.passes * 1.7 * TAU * s + phB);
        const z = P.depth * Math.sin(zf * TAU * s + phC);
        ctrl.push(new THREE.Vector3(gp.x + gp.nx * rad, gp.y + gp.ny * rad, z));
      }
      const closed = P.cover >= 0.999;
      let curve;
      if (closed) {
        const off = Math.floor(P.shift * NP), pts = [];
        for (let i = 0; i < NP; i++) pts.push(ctrl[(off + i) % NP]);
        curve = new THREE.CatmullRomCurve3(pts, true, "catmullrom", 0.5);
      } else {
        const start = Math.floor(P.shift * NP), count = Math.max(4, Math.floor(P.cover * NP)), pts = [];
        for (let i = 0; i <= count; i++) pts.push(ctrl[(start + i) % NP]);
        curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.5);
      }
      const M = 360, pos = [], tan = [];
      for (let i = 0; i <= M; i++) { const t = i / M; pos.push(curve.getPoint(closed ? t % 1 : t)); tan.push(curve.getTangent(closed ? t % 1 : t).normalize()); }
      const up = Math.abs(tan[0].y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      let normal = up.clone().sub(tan[0].clone().multiplyScalar(up.dot(tan[0]))).normalize();
      const normals = [normal.clone()];
      for (let i = 1; i <= M; i++) {
        const T0 = tan[i - 1], T = tan[i], ax = T0.clone().cross(T), len = ax.length(), nn = normals[i - 1].clone();
        if (len > 1e-6) { ax.normalize(); nn.applyAxisAngle(ax, Math.asin(Math.min(1, len))); }
        nn.sub(T.clone().multiplyScalar(nn.dot(T))).normalize(); normals.push(nn);
      }
      const verts = [], idx = [];
      for (let i = 0; i <= M; i++) {
        const T = tan[i], N = normals[i], Bn = T.clone().cross(N).normalize();
        const theta = P.twist * Math.PI * 2 * (i / M);
        const dir = N.clone().multiplyScalar(Math.cos(theta)).add(Bn.clone().multiplyScalar(Math.sin(theta)));
        const taper = closed ? 1 : 1 - 0.85 * Math.pow(Math.abs((i / M) * 2 - 1), 2.2);
        const hw = P.width * taper;
        const Lp = pos[i].clone().add(dir.clone().multiplyScalar(hw)), Rp = pos[i].clone().add(dir.clone().multiplyScalar(-hw));
        verts.push(Lp.x, Lp.y, Lp.z, Rp.x, Rp.y, Rp.z);
      }
      for (let i = 0; i < M; i++) { const o = i * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
      geo.setIndex(idx); geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.55, metalness: 0.05, color: new THREE.Color(colors[kColor % colors.length] || ink) });
      return new THREE.Mesh(geo, mat);
    }

    function buildRibbons() {
      disposeRibbons();
      ribbonGroup = new THREE.Group();
      const picks = (P.picks || []).filter((i) => guides.has(i));
      picks.forEach((i, k) => { const g = guides.get(i); if (g && g.length > 8) ribbonGroup.add(ribbonFor(g, k)); });
      scene.add(ribbonGroup);
    }

    function fitCamera() {
      if (!worldBox) return;
      const w = worldBox.maxx - worldBox.minx, h = worldBox.maxy - worldBox.miny;
      const half = Math.max(w, h) / 2 * 1.14 + P.depth * 0.4;
      camera.left = -half; camera.right = half; camera.top = half; camera.bottom = -half;
      camera.updateProjectionMatrix();
    }
    function applyColors() {
      letterMat.color = new THREE.Color(ink);
      renderer.setClearColor(new THREE.Color(ground), 1);
    }
    function renderNow() { renderer.render(scene, camera); }

    function rebuildAll() {
      const fam = (font && font.css) || "";
      const want = [P.glyphs, fam, font && font.weight, font && font.italic].join("|");
      const my = ++token;
      const ready = (document.fonts && fam) ? document.fonts.load(`${font.weight || 700} 200px ${fam}`, P.glyphs || "F").catch(() => {}) : Promise.resolve();
      ready.then(() => {
        if (my !== token) return;
        const r = buildContours();
        if (!r) { disposeLetters(); disposeRibbons(); guides = new Map(); renderNow(); return; }
        guides = r.guides; worldBox = r.worldBox;
        buildLetters(r.shapes); buildRibbons(); fitCamera(); contourKey = want; renderNow();
      });
    }

    applyColors(); rebuildAll();

    function resize() {
      const rb = host.getBoundingClientRect(), s = Math.max(1, Math.min(rb.width, rb.height || rb.width));
      renderer.setSize(s, s, false); canvas.style.width = "100%"; canvas.style.height = "100%";
      renderNow();
    }
    resize();
    const ro = new ResizeObserver(resize); ro.observe(host);

    return {
      update(nc) {
        const fam = (nc.font && nc.font.css) || "";
        const want = [nc.params.glyphs, fam, nc.font && nc.font.weight, nc.font && nc.font.italic].join("|");
        P = { ...nc.params }; colors = nc.colors; ink = nc.ink; ground = nc.ground; seed = nc.seed; font = nc.font;
        applyColors();
        if (want !== contourKey) { rebuildAll(); }       // string / typeface changed → retrace
        else { buildRibbons(); fitCamera(); renderNow(); } // weave params or picks → fast resweep
      },
      destroy() {
        ro.disconnect(); disposeLetters(); disposeRibbons();
        letterMat.dispose(); renderer.dispose(); canvas.remove();
      },
      snapshotCanvas() { renderNow(); return canvas; },
    };
  },
};
