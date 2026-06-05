// letterWrap.js — the folded ribbon weaves through a letter. The chosen wordmark
// typeface is rasterized, its outline traced with marching squares (works for any
// @font-face family, no font-file access needed), extruded into a 3D glyph, and the
// ribbon is swept along a seeded weave path that rides in and out across the letter
// plane and around its strokes. Type one letter (best) or a few in "Letter(s)".
import * as THREE from "three";
import { rng } from "../util.js";

const TAU = Math.PI * 2;

export default {
  id: "letter",
  label: "Letter weave",
  kind: "live",
  blurb: "The folded ribbon threads in and out of and around a letter set in your chosen typeface. Type a letter below, then dial the weave. Drag to orbit.",
  params: [
    { key: "glyphs",    label: "Letter(s)",        type: "text", default: "F" },
    { key: "wrap",      label: "Wrap (in / out)",  min: 0,    max: 0.6,  step: 0.005, default: 0.14 },
    { key: "depth",     label: "Weave depth",      min: 0,    max: 0.85, step: 0.01,  default: 0.34 },
    { key: "passes",    label: "Passes",           min: 1,    max: 14,   step: 1,     default: 6 },
    { key: "width",     label: "Ribbon width",     min: 0.02, max: 0.3,  step: 0.005, default: 0.1 },
    { key: "twist",     label: "Twist",            min: 0,    max: 3,    step: 0.01,  default: 0.6 },
    { key: "shift",     label: "Shift start",      min: 0,    max: 1,    step: 0.005, default: 0 },
    { key: "cover",     label: "Length",           min: 0.2,  max: 1,    step: 0.01,  default: 1 },
    { key: "thickness", label: "Letter depth",     min: 0.02, max: 0.5,  step: 0.01,  default: 0.16 },
    { key: "showLetter",label: "Show letter",      min: 0,    max: 1,    step: 1,     default: 1 },
    { key: "spin",      label: "Auto-spin",        min: 0,    max: 1,    step: 0.01,  default: 0.2 },
  ],

  mount(host, ctx) {
    let P = { ...ctx.params }, colors = ctx.colors, ink = ctx.ink, ground = ctx.ground, seed = ctx.seed, font = ctx.font;

    const canvas = document.createElement("canvas");
    canvas.style.width = "100%"; canvas.style.height = "100%"; canvas.style.display = "block"; canvas.style.touchAction = "none";
    host.appendChild(canvas);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0, 4.4);

    const group = new THREE.Group();
    scene.add(group);
    const key = new THREE.DirectionalLight(0xffffff, 2.1); key.position.set(-2, 3, 2.5); scene.add(key);
    const rim = new THREE.DirectionalLight(0xffffff, 0.8); rim.position.set(3, -1, -2); scene.add(rim);
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));

    const ribbonMat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.6, metalness: 0.05 });
    const letterMat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.78, metalness: 0.0 });

    let ribbonMesh = null, letterGroup = null, guide = null, contourKey = "", rafBuilding = 0;

    // ---- rasterize the glyph(s) in the chosen face, trace contours ----------
    function rasterize() {
      const text = (P.glyphs || "F").slice(0, 8) || "F";
      const fam = (font && font.css) || "Georgia";
      const wgt = (font && font.weight) || 700;
      const ital = font && font.italic ? "italic " : "";
      const fs = 200, pad = 40;
      const meas = document.createElement("canvas").getContext("2d");
      meas.font = `${ital}${wgt} ${fs}px ${fam}, serif`;
      const w = Math.ceil(meas.measureText(text).width) + pad * 2;
      const h = Math.ceil(fs * 1.5) + pad * 2;
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      const g = cv.getContext("2d");
      g.font = `${ital}${wgt} ${fs}px ${fam}, serif`;
      g.textBaseline = "middle"; g.textAlign = "center";
      g.fillStyle = "#fff"; g.fillText(text, w / 2, h / 2);
      const img = g.getImageData(0, 0, w, h).data;

      // downsample to a binary grid (max dim ~ 200) so contours stay light
      const step = Math.max(1, Math.ceil(Math.max(w, h) / 200));
      const W = Math.ceil(w / step), H = Math.ceil(h / step);
      const grid = new Uint8Array(W * H);
      let minX = W, minY = H, maxX = 0, maxY = 0, any = false;
      for (let gy = 0; gy < H; gy++) for (let gx = 0; gx < W; gx++) {
        const px = Math.min(w - 1, gx * step + (step >> 1)), py = Math.min(h - 1, gy * step + (step >> 1));
        if (img[(py * w + px) * 4 + 3] > 100) {
          grid[gy * W + gx] = 1; any = true;
          if (gx < minX) minX = gx; if (gx > maxX) maxX = gx;
          if (gy < minY) minY = gy; if (gy > maxY) maxY = gy;
        }
      }
      if (!any) return null;
      return { grid, W, H, bbox: { minX, minY, maxX, maxY } };
    }

    // marching squares -> closed, chained loops (grid coords)
    function trace(grid, W, H) {
      const val = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : grid[y * W + x]);
      const segs = [];
      const push = (a, b) => segs.push({ a, b });
      for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
        const c = (val(x, y) ? 1 : 0) | (val(x + 1, y) ? 2 : 0) | (val(x + 1, y + 1) ? 4 : 0) | (val(x, y + 1) ? 8 : 0);
        if (c === 0 || c === 15) continue;
        const T = { x: x + 0.5, y }, R = { x: x + 1, y: y + 0.5 }, B = { x: x + 0.5, y: y + 1 }, L = { x, y: y + 0.5 };
        switch (c) {
          case 1: push(L, T); break;
          case 2: push(T, R); break;
          case 3: push(L, R); break;
          case 4: push(R, B); break;
          case 5: push(L, T); push(R, B); break;       // saddle (derived from singles)
          case 6: push(T, B); break;
          case 7: push(L, B); break;
          case 8: push(B, L); break;
          case 9: push(B, T); break;
          case 10: push(T, R); push(B, L); break;       // saddle
          case 11: push(B, R); break;
          case 12: push(R, L); break;
          case 13: push(R, T); break;
          case 14: push(T, L); break;
        }
      }
      const k = (p) => p.x + "," + p.y;
      const from = new Map();
      for (const s of segs) { (from.get(k(s.a)) || from.set(k(s.a), []).get(k(s.a))).push(s); }
      const used = new Set(), loops = [];
      for (const s of segs) {
        if (used.has(s)) continue;
        const loop = [s.a]; let cur = s, guard = 0;
        while (cur && !used.has(cur) && guard++ < 1e6) {
          used.add(cur); loop.push(cur.b);
          const arr = from.get(k(cur.b)); cur = arr ? arr.find((x) => !used.has(x)) : null;
        }
        if (loop.length > 6) loops.push(loop);
      }
      return loops;
    }

    const signedArea = (l) => { let a = 0; for (let i = 0; i < l.length - 1; i++) a += l[i].x * l[i + 1].y - l[i + 1].x * l[i].y; return a / 2; };
    function inside(poly, p) {
      let c = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i], b = poly[j];
        if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
      }
      return c;
    }
    const chaikin = (pts, n) => {
      for (let it = 0; it < n; it++) {
        const out = [];
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i], b = pts[i + 1];
          out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
          out.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
        }
        out.push(out[0]); pts = out;
      }
      return pts;
    };

    function buildLetter() {
      const r = rasterize();
      disposeLetter();
      guide = null;
      if (!r) return;
      const { grid, W, H, bbox } = r;
      const cx = (bbox.minX + bbox.maxX) / 2, cy = (bbox.minY + bbox.maxY) / 2;
      const span = Math.max(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY) || 1;
      const S = 2.2 / span;
      const toWorld = (p) => ({ x: (p.x - cx) * S, y: -(p.y - cy) * S });
      const inkAt = (gx, gy) => (gx < 0 || gy < 0 || gx >= W || gy >= H ? 0 : grid[(gy | 0) * W + (gx | 0)]);

      let loops = trace(grid, W, H).map((l) => ({ pts: l, area: signedArea(l), absA: Math.abs(signedArea(l)) }))
        .filter((l) => l.absA > 4).sort((a, b) => b.absA - a.absA);
      if (!loops.length) return;

      // nesting: a loop is a hole if contained in an odd number of others
      loops.forEach((l) => {
        const p0 = l.pts[0];
        l.depth = loops.reduce((n, o) => (o !== l && o.absA > l.absA && inside(o.pts, p0) ? n + 1 : n), 0);
      });

      // extruded glyph: outer loops (even depth) with their immediate holes
      letterGroup = new THREE.Group();
      const outers = loops.filter((l) => l.depth % 2 === 0);
      for (const o of outers) {
        const shape = new THREE.Shape(o.pts.map((p) => { const w = toWorld(p); return new THREE.Vector2(w.x, w.y); }));
        for (const hole of loops) {
          if (hole === o || hole.depth !== o.depth + 1) continue;
          if (!inside(o.pts, hole.pts[0])) continue;
          const path = new THREE.Path(hole.pts.map((p) => { const w = toWorld(p); return new THREE.Vector2(w.x, w.y); }));
          shape.holes.push(path);
        }
        const geo = new THREE.ExtrudeGeometry(shape, { depth: P.thickness, bevelEnabled: false, curveSegments: 4 });
        geo.translate(0, 0, -P.thickness / 2);
        letterGroup.add(new THREE.Mesh(geo, letterMat));
      }
      letterGroup.visible = !!P.showLetter;
      group.add(letterGroup);

      // ribbon guide: resample the dominant outer loop with outward normals
      const main = outers[0];
      let pts = chaikin(main.pts.slice(), 2);
      const NP = 240;
      // arc-length resample
      const seglen = []; let total = 0;
      for (let i = 0; i < pts.length - 1; i++) { const d = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y); seglen.push(d); total += d; }
      const base = [];
      for (let i = 0; i < NP; i++) {
        let target = (i / NP) * total, j = 0;
        while (j < seglen.length && target > seglen[j]) { target -= seglen[j]; j++; }
        const a = pts[j] || pts[pts.length - 1], b = pts[j + 1] || a;
        const t = seglen[j] ? target / seglen[j] : 0;
        base.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
      // outward normals (flip toward background using the ink grid)
      guide = base.map((p, i) => {
        const a = base[(i - 1 + NP) % NP], b = base[(i + 1) % NP];
        let nx = b.y - a.y, ny = -(b.x - a.x); const L = Math.hypot(nx, ny) || 1; nx /= L; ny /= L;
        if (inkAt(Math.round(p.x + nx * 3), Math.round(p.y + ny * 3))) { nx = -nx; ny = -ny; }
        const w = toWorld(p);
        const wnL = Math.hypot(nx, -ny) || 1;
        return { x: w.x, y: w.y, nx: nx / wnL, ny: -ny / wnL };
      });
    }

    // ---- ribbon sweep along the weave path ----------------------------------
    function buildRibbon() {
      if (ribbonMesh) { group.remove(ribbonMesh); ribbonMesh.geometry.dispose(); ribbonMesh = null; }
      if (!guide || guide.length < 8) return;
      const r = rng(seed * 131 + 7);
      const phA = r() * TAU, phB = r() * TAU, phC = r() * TAU;
      const NP = guide.length;
      const zf = Math.max(1, Math.round(P.passes * 0.6) + 1);

      // displaced control points (closed), then optionally slice for an open ribbon
      const ctrl = [];
      for (let i = 0; i < NP; i++) {
        const s = i / NP, gp = guide[i];
        const rad = P.wrap * Math.sin(P.passes * TAU * s + phA) + 0.45 * P.wrap * Math.sin(P.passes * 1.7 * TAU * s + phB);
        const z = P.depth * Math.sin(zf * TAU * s + phC);
        ctrl.push(new THREE.Vector3(gp.x + gp.nx * rad, gp.y + gp.ny * rad, z));
      }

      const closed = P.cover >= 0.999;
      let pathPts = ctrl, curve;
      if (!closed) {
        const start = Math.floor(P.shift * NP), count = Math.max(4, Math.floor(P.cover * NP));
        pathPts = []; for (let i = 0; i <= count; i++) pathPts.push(ctrl[(start + i) % NP]);
        curve = new THREE.CatmullRomCurve3(pathPts, false, "catmullrom", 0.5);
      } else {
        // rotate start by shift for variety while staying a closed band
        const off = Math.floor(P.shift * NP);
        pathPts = []; for (let i = 0; i < NP; i++) pathPts.push(ctrl[(off + i) % NP]);
        curve = new THREE.CatmullRomCurve3(pathPts, true, "catmullrom", 0.5);
      }

      const M = 420;
      const pos = [], tan = [];
      for (let i = 0; i <= M; i++) {
        const t = i / M;
        pos.push(curve.getPoint(closed ? (t % 1) : t));
        tan.push(curve.getTangent(closed ? (t % 1) : t).normalize());
      }
      // parallel-transport frame
      const up = Math.abs(tan[0].y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      let normal = up.clone().sub(tan[0].clone().multiplyScalar(up.dot(tan[0]))).normalize();
      const normals = [normal.clone()];
      for (let i = 1; i <= M; i++) {
        const T0 = tan[i - 1], T = tan[i], axis = T0.clone().cross(T), len = axis.length();
        const nn = normals[i - 1].clone();
        if (len > 1e-6) { axis.normalize(); nn.applyAxisAngle(axis, Math.asin(Math.min(1, len))); }
        nn.sub(T.clone().multiplyScalar(nn.dot(T))).normalize();
        normals.push(nn);
      }
      const verts = [], idx = [];
      for (let i = 0; i <= M; i++) {
        const T = tan[i], N = normals[i], Bn = T.clone().cross(N).normalize();
        const theta = P.twist * Math.PI * 2 * (i / M);
        const dir = N.clone().multiplyScalar(Math.cos(theta)).add(Bn.clone().multiplyScalar(Math.sin(theta)));
        const taper = closed ? 1 : 1 - 0.85 * Math.pow(Math.abs((i / M) * 2 - 1), 2.2);
        const hw = P.width * taper;
        const Lp = pos[i].clone().add(dir.clone().multiplyScalar(hw));
        const Rp = pos[i].clone().add(dir.clone().multiplyScalar(-hw));
        verts.push(Lp.x, Lp.y, Lp.z, Rp.x, Rp.y, Rp.z);
      }
      for (let i = 0; i < M; i++) { const o = i * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
      geo.setIndex(idx); geo.computeVertexNormals();
      ribbonMesh = new THREE.Mesh(geo, ribbonMat); group.add(ribbonMesh);
    }

    function disposeLetter() {
      if (letterGroup) { letterGroup.children.forEach((m) => m.geometry.dispose()); group.remove(letterGroup); letterGroup = null; }
    }
    function applyColors() {
      ribbonMat.color = new THREE.Color(colors[0] || ink);
      letterMat.color = new THREE.Color(ink);
      letterMat.opacity = 1; letterMat.transparent = false;
      renderer.setClearColor(new THREE.Color(ground), 1);
    }

    function rebuildAll() {
      const fam = (font && font.css) || "";
      const want = [P.glyphs, fam, font && font.weight, font && font.italic, P.thickness, P.showLetter, seed].join("|");
      // ensure the face is ready before rasterizing, then build
      const token = ++rafBuilding;
      const ready = (document.fonts && fam) ? document.fonts.load(`${font.weight || 700} 200px ${fam}`, P.glyphs || "F").catch(() => {}) : Promise.resolve();
      ready.then(() => { if (token !== rafBuilding) return; buildLetter(); buildRibbon(); contourKey = want; });
    }

    rebuildAll(); applyColors();

    function resize() {
      const r = host.getBoundingClientRect();
      const s = Math.max(1, Math.min(r.width, r.height || r.width));
      renderer.setSize(s, s, false);
      canvas.style.width = "100%"; canvas.style.height = "100%";
      camera.aspect = 1; camera.updateProjectionMatrix();
    }
    resize();
    const ro = new ResizeObserver(resize); ro.observe(host);

    let dragging = false, lx = 0, ly = 0, rotX = 0, rotY = 0;
    const onDown = (e) => { dragging = true; lx = e.clientX; ly = e.clientY; canvas.setPointerCapture?.(e.pointerId); };
    const onMove = (e) => { if (!dragging) return; rotY += (e.clientX - lx) * 0.01; rotX += (e.clientY - ly) * 0.01; lx = e.clientX; ly = e.clientY; };
    const onUp = () => { dragging = false; };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointerleave", onUp);

    let raf = 0, running = true, last = performance.now();
    function loop(now) {
      if (!running) return;
      const dt = (now - last) / 1000; last = now;
      if (!dragging) rotY += P.spin * dt * 0.7;
      group.rotation.x = rotX; group.rotation.y = rotY;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    return {
      update(nc) {
        const fam = (nc.font && nc.font.css) || "";
        const want = [nc.params.glyphs, fam, nc.font && nc.font.weight, nc.font && nc.font.italic, nc.params.thickness, nc.params.showLetter, nc.seed].join("|");
        P = { ...nc.params }; colors = nc.colors; ink = nc.ink; ground = nc.ground; seed = nc.seed; font = nc.font;
        applyColors();
        if (want !== contourKey) rebuildAll();      // glyph / face / depth / seed changed → retrace + resweep
        else buildRibbon();                         // only weave params changed → fast resweep
      },
      destroy() {
        running = false; cancelAnimationFrame(raf); ro.disconnect();
        canvas.removeEventListener("pointerdown", onDown); canvas.removeEventListener("pointermove", onMove);
        canvas.removeEventListener("pointerup", onUp); canvas.removeEventListener("pointerleave", onUp);
        if (ribbonMesh) ribbonMesh.geometry.dispose(); disposeLetter();
        ribbonMat.dispose(); letterMat.dispose(); renderer.dispose(); canvas.remove();
      },
      snapshotCanvas() { renderer.render(scene, camera); return canvas; },
    };
  },
};
