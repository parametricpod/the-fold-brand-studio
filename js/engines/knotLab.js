// knotLab.js — "Knot Lab". A purpose-built explorer for folding-ribbon logomarks:
// a flat strip swept along a 3D knot curve, with a twisting cross-section that flips
// the strip over and reveals its darker back face — the whole language of a hand-drawn
// ribbon knot. Built to be STEERED (generate → refine): pick a topology, dial the
// sliders, orbit, Mutate for a nudge, ⟳ New seed for a fresh variant, and drag the
// control points directly. The same rail geometry drives the live WebGL view AND a
// clean vector SVG export — painter-sorted filled quads + outlined rails, so the
// over/under occlusion resolves the way it would take an afternoon to draw in
// Illustrator, and lands as editable paths.
import * as THREE from "three";
import { rng } from "../util.js";

const STAGE = 1080;                    // export viewBox — matches the studio's other marks
const M = 168;                         // ribbon segments along the length (fills + rails)

// ---- shape library: each topology places ~a dozen control points; a CatmullRom
// curve through them is the ribbon's centerline. Normalised to sit centred around
// the origin at a consistent scale so the framing is stable across forms. ----------
function centreScale(pts, radius = 1.5) {
  const c = new THREE.Vector3();
  pts.forEach((p) => c.add(p));
  c.multiplyScalar(1 / pts.length);
  let max = 1e-6;
  pts.forEach((p) => { p.sub(c); max = Math.max(max, p.length()); });
  const s = radius / max;
  pts.forEach((p) => p.multiplyScalar(s));
  return pts;
}

// trefoil parametric — the backbone of the knotted forms. `span` < 1 leaves the ends
// open so the ribbon dangles two tails (an overhand knot with tails, like the sketch).
function trefoilPts(n, span = 1, start = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (start + (i / (span < 1 ? n - 1 : n)) * span) * Math.PI * 2;
    pts.push(new THREE.Vector3(
      Math.sin(t) + 2 * Math.sin(2 * t),
      Math.cos(t) - 2 * Math.cos(2 * t),
      -Math.sin(3 * t),
    ));
  }
  return pts;
}
function figure8Pts(n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    pts.push(new THREE.Vector3(
      (2 + Math.cos(2 * t)) * Math.cos(3 * t),
      (2 + Math.cos(2 * t)) * Math.sin(3 * t),
      Math.sin(4 * t),
    ));
  }
  return pts;
}
function coilPts(loops) {
  const n = Math.max(8, loops * 5);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const a = u * loops * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a), (u - 0.5) * 3.2, Math.sin(a) * 0.9));
  }
  return pts;
}
function scarfPts(seed) {
  const r = rng(seed);
  const pts = [], n = 7;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    pts.push(new THREE.Vector3(
      Math.sin(u * Math.PI * 1.6) * 1.3 + (r() - 0.5) * 0.5,
      1.6 - u * 3.2,
      Math.cos(u * Math.PI * 2.2) * 0.9 + (r() - 0.5) * 0.4,
    ));
  }
  return pts;
}
function randomPts(seed) {
  const r = rng(seed);
  const n = 8, pts = [];
  for (let i = 0; i < n; i++) {
    const ty = 1.4 - (i / (n - 1)) * 2.8;
    pts.push(new THREE.Vector3((r() - 0.5) * 2.6, ty, (r() - 0.5) * 1.8));
  }
  return pts;
}

// Build the control points + closed flag for a topology. A little seeded jitter is
// baked in so ⟳ New seed yields a fresh *variant* of the same knot, not a clone.
function makeShape(topology, seed, loops) {
  let pts, closed = false;
  if (topology === "trefoil") { pts = trefoilPts(13, 1); closed = true; }
  else if (topology === "figure8") { pts = figure8Pts(15); closed = true; }
  else if (topology === "overhand") { pts = trefoilPts(11, 0.76, 0.12); closed = false; }
  else if (topology === "loop") { pts = coilPts(loops); closed = false; }
  else if (topology === "scarf") { pts = scarfPts(seed); closed = false; }
  else { pts = randomPts(seed); closed = false; }
  const r = rng(seed ^ 0x9e37);
  const j = topology === "scarf" || topology === "random" ? 0 : 0.22;   // those two are already seed-built
  pts.forEach((p) => p.add(new THREE.Vector3((r() - 0.5) * j, (r() - 0.5) * j, (r() - 0.5) * j)));
  centreScale(pts, 1.5);
  return { pts, closed };
}

// ---- tiny hex helpers (SVG fills) ------------------------------------------------
const hx = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const toHex = (r, g, b) => "#" + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("");
const mixHex = (a, b, t) => { const A = hx(a), B = hx(b); return toHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); };
const scaleHex = (a, f) => { const A = hx(a); return toHex(A[0] * f, A[1] * f, A[2] * f); };

// ---- two-tone paper-ribbon shader: cream front / grey back via gl_FrontFacing, a
// soft lambert term for the light/mid-grey variation on the backs, and an inked
// silhouette contour so the live view reads like the drawing (not a shiny render). --
const V = `
  varying vec3 vN; varying vec3 vView;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }`;
const F = `
  precision highp float;
  varying vec3 vN; varying vec3 vView;
  uniform vec3 uFront; uniform vec3 uBack; uniform vec3 uInk;
  uniform vec3 uLight; uniform float uShade; uniform float uContour;
  void main() {
    vec3 N = normalize(vN);
    bool front = gl_FrontFacing;
    if (!front) N = -N;
    vec3 base = front ? uFront : uBack;
    float ndl = clamp(dot(N, normalize(uLight)) * 0.5 + 0.5, 0.0, 1.0);
    float f = mix(1.0, 0.62 + 0.38 * ndl, uShade);          // never crushes to black
    vec3 col = base * f;
    float facing = abs(dot(N, normalize(vView)));           // silhouette contour
    float edge = smoothstep(0.34, 0.06, facing) * uContour;
    col = mix(col, uInk, edge);
    gl_FragColor = vec4(col, 1.0);
  }`;

export default (() => {
  const engine = {
    id: "knot",
    label: "Knot Lab",
    kind: "live",
    vector: true,                        // exposes snapshotSVG → the Export SVG button shows for this live engine
    hideWordmark: false,
    blurb: "Folding-ribbon logomark explorer. Pick a knot, twist & tighten it, orbit to frame it. ⟳ New seed = randomize · Mutate = nudge · toggle Edit points to drag. Exports clean vector SVG with the over/under folds resolved.",
    params: [
      { key: "topology", label: "Form", type: "select", default: "overhand", options: [
        { value: "overhand", label: "Overhand knot" },
        { value: "trefoil", label: "Trefoil" },
        { value: "figure8", label: "Figure-eight" },
        { value: "loop", label: "Loop / coil" },
        { value: "scarf", label: "Scarf fold" },
        { value: "random", label: "Random" },
      ] },
      { key: "width", label: "Ribbon width", min: 0.06, max: 0.5, step: 0.01, default: 0.2 },
      { key: "twist", label: "Twist turns", min: 0, max: 3, step: 0.05, default: 0.6 },
      { key: "twistPhase", label: "Twist phase", min: 0, max: 1, step: 0.01, default: 0 },
      { key: "tightness", label: "Tightness", min: 0.5, max: 1.8, step: 0.02, default: 1 },
      { key: "loops", label: "Loops (coil)", min: 2, max: 6, step: 1, default: 3 },
      { key: "roundness", label: "Roundness", min: 0, max: 1, step: 0.02, default: 0.5 },
      { key: "contrast", label: "Face contrast", min: 0, max: 1, step: 0.02, default: 0.55 },
      { key: "shade", label: "Shading", min: 0, max: 1, step: 0.02, default: 0.4 },
      { key: "outline", label: "Outline weight", min: 0, max: 1, step: 0.02, default: 0.5 },
      { key: "jitter", label: "Hand-drawn", min: 0, max: 1, step: 0.02, default: 0.25 },
      { key: "handles", label: "Edit points (drag)", min: 0, max: 1, step: 1, default: 0 },
      { key: "spin", label: "Auto-spin", min: 0, max: 1, step: 0.01, default: 0.12 },
    ],

    // Action bar + snapshot tray live above the sliders. ⟳ New seed (main's button)
    // is Randomize; these add Mutate / Reset / Bank pose and the pose tray.
    controls() {
      return `<div class="knot-actions">
        <button class="ghost sm" id="knotMutate">✦ Mutate</button>
        <button class="ghost sm" id="knotReset">↺ Reset shape</button>
        <button class="ghost sm" id="knotBank">☆ Bank pose</button>
      </div>
      <div class="knot-tray" id="knotTray"></div>`;
    },
    wireControls(root) {
      // NB: wireControls runs before mount(), so look up _active lazily at click time.
      const tray = root.querySelector("#knotTray");
      const renderTray = () => {
        tray.innerHTML = engine._poses.map((p, i) =>
          `<button class="knot-thumb" data-pose="${i}" title="Restore pose"><img src="${p.thumb}" alt=""></button>`).join("");
        tray.querySelectorAll("[data-pose]").forEach((b) =>
          b.onclick = () => engine._active && engine._active.restore(engine._poses[+b.dataset.pose]));
      };
      const m = root.querySelector("#knotMutate"); if (m) m.onclick = () => engine._active && engine._active.mutate();
      const r = root.querySelector("#knotReset"); if (r) r.onclick = () => engine._active && engine._active.reset();
      const bank = root.querySelector("#knotBank");
      if (bank) bank.onclick = () => { if (engine._active) { engine._active.bankPose(); renderTray(); } };
      renderTray();
    },
    _poses: [],
    _active: null,

    mount(host, cx) {
      let P = cx.params, colors = cx.colors, ink = cx.ink, ground = cx.ground, seed = cx.seed;

      const canvas = document.createElement("canvas");
      Object.assign(canvas.style, { width: "100%", height: "100%", display: "block", touchAction: "none" });
      host.appendChild(canvas);

      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);

      const mat = new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        uniforms: {
          uFront: { value: new THREE.Color() }, uBack: { value: new THREE.Color() },
          uInk: { value: new THREE.Color() }, uLight: { value: new THREE.Vector3(-0.4, 0.8, 0.6).normalize() },
          uShade: { value: P.shade }, uContour: { value: 0.9 },
        },
        vertexShader: V, fragmentShader: F,
      });

      // control-point drag handles (small spheres in world space)
      const handleGroup = new THREE.Group(); scene.add(handleGroup);
      const handleGeo = new THREE.SphereGeometry(0.07, 16, 12);
      const handleMat = new THREE.MeshBasicMaterial({ color: 0xc9a24a });

      let mesh = null, pts = [], closed = false, rails = null, shapeKey = "";
      const lightWorld = new THREE.Vector3(-0.4, 0.8, 0.6).normalize();

      function regenPoints() {
        const s = makeShape(P.topology, seed, Math.round(P.loops));
        pts = s.pts; closed = s.closed;
      }
      function syncHandles() {
        while (handleGroup.children.length) handleGroup.remove(handleGroup.children[0]);
        if (!P.handles) return;
        pts.forEach((p, i) => {
          const h = new THREE.Mesh(handleGeo, handleMat);
          h.position.copy(p).multiplyScalar(1 / P.tightness);
          h.userData.i = i; handleGroup.add(h);
        });
      }

      // Sweep the strip: parallel-transport frame (no twist flips) + a twisting
      // cross-section. Returns L/R rails + face normals, reused by mesh + SVG.
      function buildRibbon() {
        if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); }
        const cpts = pts.map((p) => p.clone().multiplyScalar(1 / P.tightness));
        const curve = new THREE.CatmullRomCurve3(cpts, closed, "catmullrom", P.roundness);
        const pos = [], tan = [];
        for (let i = 0; i <= M; i++) {
          const t = i / M;
          pos.push(curve.getPointAt(t));
          tan.push(curve.getTangentAt(t).normalize());
        }
        const up = Math.abs(tan[0].y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
        let normal = up.clone().sub(tan[0].clone().multiplyScalar(up.dot(tan[0]))).normalize();
        const normals = [normal.clone()];
        for (let i = 1; i <= M; i++) {
          const T0 = tan[i - 1], T = tan[i];
          const axis = T0.clone().cross(T); const len = axis.length();
          const nn = normals[i - 1].clone();
          if (len > 1e-6) { axis.normalize(); nn.applyAxisAngle(axis, Math.asin(Math.min(1, len))); }
          nn.sub(T.clone().multiplyScalar(nn.dot(T))).normalize();
          normals.push(nn);
        }
        const L = [], R = [], FN = [], verts = [], idx = [];
        for (let i = 0; i <= M; i++) {
          const T = tan[i], N = normals[i], B = T.clone().cross(N).normalize();
          const theta = (P.twist * (i / M) + P.twistPhase) * Math.PI * 2;
          const dir = N.clone().multiplyScalar(Math.cos(theta)).add(B.clone().multiplyScalar(Math.sin(theta)));
          const l = pos[i].clone().add(dir.clone().multiplyScalar(P.width));
          const r = pos[i].clone().add(dir.clone().multiplyScalar(-P.width));
          L.push(l); R.push(r);
          FN.push(dir.clone().cross(T).normalize());   // strip face normal
          verts.push(l.x, l.y, l.z, r.x, r.y, r.z);
        }
        for (let i = 0; i < M; i++) { const o = i * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
        geo.setIndex(idx); geo.computeVertexNormals();
        mesh = new THREE.Mesh(geo, mat); scene.add(mesh);
        rails = { L, R, FN };
      }

      function applyColors() {
        const front = ground;
        const back = mixHex(ground, ink, 0.35 + P.contrast * 0.45);
        mat.uniforms.uFront.value.set(front);
        mat.uniforms.uBack.value.set(back);
        mat.uniforms.uInk.value.set(ink);
        mat.uniforms.uShade.value = P.shade;
        renderer.setClearColor(new THREE.Color(ground), 1);
      }

      function rebuild(regen) {
        const k = [seed, P.topology, Math.round(P.loops)].join("|");
        if (regen || k !== shapeKey) { regenPoints(); shapeKey = k; }
        buildRibbon(); syncHandles(); applyColors();
      }
      rebuild(true);

      // ---- orbit camera (world-space so handle dragging is simple) --------------
      let theta = 0.6, phi = 1.12, radius = 5.4;
      function placeCamera() {
        camera.position.set(
          radius * Math.sin(phi) * Math.sin(theta),
          radius * Math.cos(phi),
          radius * Math.sin(phi) * Math.cos(theta));
        camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
      }
      placeCamera();

      function resize() {
        const r = host.getBoundingClientRect();
        const s = Math.max(1, Math.min(r.width, r.height || r.width));
        renderer.setSize(s, s, false);
        camera.aspect = 1; camera.updateProjectionMatrix();
      }
      resize();
      const ro = new ResizeObserver(resize); ro.observe(host);

      // ---- pointer: drag a handle if one is under the cursor, else orbit --------
      const ray = new THREE.Raycaster();
      let dragging = false, dragIdx = -1, lx = 0, ly = 0;
      function ndc(e) {
        const r = canvas.getBoundingClientRect();
        return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
      }
      const onDown = (e) => {
        canvas.setPointerCapture?.(e.pointerId);
        if (P.handles && handleGroup.children.length) {
          ray.setFromCamera(ndc(e), camera);
          const hit = ray.intersectObjects(handleGroup.children, false)[0];
          if (hit) { dragIdx = hit.object.userData.i; dragging = true; return; }
        }
        dragging = true; dragIdx = -1; lx = e.clientX; ly = e.clientY;
      };
      const onMove = (e) => {
        if (!dragging) return;
        if (dragIdx >= 0) {
          // move the point in the screen-parallel plane at its current depth
          const p = ndc(e);
          const far = new THREE.Vector3(p.x, p.y, 0.5).unproject(camera);
          const dir = far.sub(camera.position).normalize();
          const camDir = new THREE.Vector3(); camera.getWorldDirection(camDir);
          const world = pts[dragIdx].clone().multiplyScalar(1 / P.tightness);
          const t = world.clone().sub(camera.position).dot(camDir) / dir.dot(camDir);
          const hitPt = camera.position.clone().add(dir.multiplyScalar(t));
          pts[dragIdx].copy(hitPt.multiplyScalar(P.tightness));
          handleGroup.children[dragIdx]?.position.copy(hitPt);
          buildRibbon();
        } else {
          theta -= (e.clientX - lx) * 0.008; phi = Math.max(0.15, Math.min(Math.PI - 0.15, phi - (e.clientY - ly) * 0.008));
          lx = e.clientX; ly = e.clientY; placeCamera();
        }
      };
      const onUp = () => { dragging = false; dragIdx = -1; };
      canvas.addEventListener("pointerdown", onDown);
      canvas.addEventListener("pointermove", onMove);
      canvas.addEventListener("pointerup", onUp);
      canvas.addEventListener("pointerleave", onUp);

      let raf = 0, running = true, last = performance.now();
      function loop(now) {
        if (!running) return;
        const dt = (now - last) / 1000; last = now;
        if (!dragging && P.spin > 0) { theta += P.spin * dt * 0.6; placeCamera(); }
        renderer.render(scene, camera);
        raf = requestAnimationFrame(loop);
      }
      raf = requestAnimationFrame(loop);

      // ---- project current geometry to a clean vector SVG -----------------------
      // Painter-sorted quads (far→near) so over/under folds resolve; each quad is a
      // filled polygon (cream front / shaded grey back) and its two long edges are
      // inked rails. Drawing per-segment in depth order occludes both fills AND rails.
      function snapshotSVG() {
        if (!rails) return "";
        camera.updateMatrixWorld();
        const { L, R, FN } = rails;
        const jit = P.jitter * 7;
        const ow = 2 + P.outline * 8;
        const front = ground, back = mixHex(ground, ink, 0.35 + P.contrast * 0.45);
        const proj = (v) => {
          const n = v.clone().project(camera);
          return { x: (n.x * 0.5 + 0.5) * STAGE, y: (1 - (n.y * 0.5 + 0.5)) * STAGE, z: n.z };
        };
        const PL = L.map(proj), PR = R.map(proj);
        const wob = (i) => { const s = Math.sin(i * 12.9898) * 43758.5453; return ((s - Math.floor(s)) - 0.5) * jit; };
        const camDir = new THREE.Vector3(); camera.getWorldDirection(camDir);
        const segs = [];
        for (let i = 0; i < M; i++) {
          const depth = (PL[i].z + PR[i].z + PL[i + 1].z + PR[i + 1].z) / 4;
          const centroid = L[i].clone().add(R[i]).add(L[i + 1]).add(R[i + 1]).multiplyScalar(0.25);
          const view = camera.position.clone().sub(centroid).normalize();
          const isFront = FN[i].dot(view) > 0;
          const ndl = Math.max(0, Math.min(1, FN[i].dot(lightWorld) * 0.5 + 0.5));
          const f = 1 - P.shade * (1 - (0.62 + 0.38 * ndl));
          const fill = scaleHex(isFront ? front : back, f);
          segs.push({ i, depth, fill });
        }
        segs.sort((a, b) => b.depth - a.depth);
        const pt = (arr, i, k) => `${(arr[i].x + wob(i * 2 + k)).toFixed(1)},${(arr[i].y + wob(i * 2 + k + 99)).toFixed(1)}`;
        let out = "";
        for (const s of segs) {
          const i = s.i;
          out += `<path d="M ${pt(PL, i, 0)} L ${pt(PR, i, 0)} L ${pt(PR, i + 1, 0)} L ${pt(PL, i + 1, 0)} Z" fill="${s.fill}" stroke="${s.fill}" stroke-width="1.1" stroke-linejoin="round"/>`;
          out += `<path d="M ${pt(PL, i, 0)} L ${pt(PL, i + 1, 0)}" fill="none" stroke="${ink}" stroke-width="${ow}" stroke-linecap="round"/>`;
          out += `<path d="M ${pt(PR, i, 0)} L ${pt(PR, i + 1, 0)}" fill="none" stroke="${ink}" stroke-width="${ow}" stroke-linecap="round"/>`;
          if (!closed && i === 0) out += `<path d="M ${pt(PL, 0, 0)} L ${pt(PR, 0, 0)}" fill="none" stroke="${ink}" stroke-width="${ow}" stroke-linecap="round"/>`;
          if (!closed && i === M - 1) out += `<path d="M ${pt(PL, M, 0)} L ${pt(PR, M, 0)}" fill="none" stroke="${ink}" stroke-width="${ow}" stroke-linecap="round"/>`;
        }
        return out;
      }

      // ---- expose actions for the control-panel buttons -------------------------
      function thumb() {
        renderer.render(scene, camera);
        const t = document.createElement("canvas"); t.width = t.height = 96;
        t.getContext("2d").drawImage(canvas, 0, 0, 96, 96);
        return t.toDataURL("image/png");
      }
      engine._active = {
        mutate() {
          const r = rng((seed * 2654435761) >>> 0);
          pts.forEach((p) => p.add(new THREE.Vector3((r() - 0.5) * 0.4, (r() - 0.5) * 0.4, (r() - 0.5) * 0.4)));
          buildRibbon(); syncHandles();
        },
        reset() { rebuild(true); },
        bankPose() {
          const hv = handleGroup.visible; handleGroup.visible = false;
          const th = thumb(); handleGroup.visible = hv;
          engine._poses.unshift({
            thumb: th, seed, closed,
            pts: pts.map((p) => [p.x, p.y, p.z]), theta, phi,
            params: { ...P },
          });
          engine._poses = engine._poses.slice(0, 12);
        },
        restore(pose) {
          seed = pose.seed; closed = pose.closed;
          pts = pose.pts.map((a) => new THREE.Vector3(a[0], a[1], a[2]));
          Object.assign(P, pose.params);
          theta = pose.theta; phi = pose.phi;
          shapeKey = "__restored__";               // don't clobber restored points
          placeCamera(); buildRibbon(); syncHandles(); applyColors();
        },
      };

      return {
        viewBox: `0 0 ${STAGE} ${STAGE}`,
        update(nc) {
          const reseeded = nc.seed !== seed;
          P = nc.params; colors = nc.colors; ink = nc.ink; ground = nc.ground; seed = nc.seed;
          rebuild(reseeded);
        },
        snapshotSVG,
        snapshotCanvas() {
          const hv = handleGroup.visible; handleGroup.visible = false;
          renderer.render(scene, camera); handleGroup.visible = hv;
          return canvas;
        },
        destroy() {
          running = false; cancelAnimationFrame(raf); ro.disconnect();
          canvas.removeEventListener("pointerdown", onDown); canvas.removeEventListener("pointermove", onMove);
          canvas.removeEventListener("pointerup", onUp); canvas.removeEventListener("pointerleave", onUp);
          if (mesh) mesh.geometry.dispose();
          handleGeo.dispose(); handleMat.dispose(); mat.dispose();
          renderer.dispose(); canvas.remove();
          engine._active = null;
        },
      };
    },
  };
  return engine;
})();
