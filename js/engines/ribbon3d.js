// ribbon3d.js — a real 3D folded ribbon (three.js). A flat strip is swept along a
// random-seeded 3D curve with a twisting cross-section, lit so the folds self-shade
// like a pencil sketch. The "shift" control slides the ribbon along its path, so one
// seed yields a family of folded-ribbon edge forms. Echoes Eileen's favorite mark.
import * as THREE from "three";
import { rng } from "../util.js";

export default {
  id: "ribbon",
  label: "Folded ribbon 3D",
  kind: "live",
  blurb: "A 3D strip swept along a seeded curve. Shift it along its path to find folded-ribbon forms. Drag to orbit.",
  params: [
    { key: "shift",  label: "Shift along path", min: 0, max: 1,   step: 0.005, default: 0.2 },
    { key: "width",  label: "Ribbon width",     min: 0.04, max: 0.45, step: 0.01, default: 0.18 },
    { key: "twist",  label: "Twist",            min: 0, max: 2.5, step: 0.01, default: 0.8 },
    { key: "nodes",  label: "Complexity",       min: 3, max: 10,  step: 1,    default: 6 },
    { key: "taper",  label: "Taper",            min: 0, max: 1,   step: 0.01, default: 0.5 },
    { key: "cover",  label: "Length",           min: 0.3, max: 0.95, step: 0.01, default: 0.7 },
    { key: "spin",   label: "Auto-spin",        min: 0, max: 1,   step: 0.01, default: 0.25 },
  ],

  mount(host, ctx) {
    let P = ctx.params, colors = ctx.colors, ink = ctx.ink, ground = ctx.ground, seed = ctx.seed;

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

    const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.62, metalness: 0.04 });
    let mesh = null, curve = null, builtKey = "";

    function buildCurve() {
      const r = rng(seed);
      const n = Math.round(P.nodes);
      const pts = [];
      for (let i = 0; i < n; i++) {
        const ty = 1.3 - (i / (n - 1)) * 2.6;
        pts.push(new THREE.Vector3((r() - 0.5) * 2.0, ty, (r() - 0.5) * 1.2));
      }
      curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.5);
    }

    function buildRibbon() {
      if (mesh) { group.remove(mesh); mesh.geometry.dispose(); }
      const M = 200;
      const a = P.shift * (1 - P.cover), b = a + P.cover;
      const c01 = (u) => Math.max(0, Math.min(1, u));
      const pos = [], tan = [];
      for (let i = 0; i <= M; i++) {
        const t = c01(a + (b - a) * (i / M));
        pos.push(curve.getPointAt(t));
        tan.push(curve.getTangentAt(t).normalize());
      }
      // parallel-transport frame (avoids twist flips)
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
      const verts = [], idx = [];
      for (let i = 0; i <= M; i++) {
        const T = tan[i], N = normals[i], B = T.clone().cross(N).normalize();
        const theta = P.twist * Math.PI * 2 * (i / M);
        const dir = N.clone().multiplyScalar(Math.cos(theta)).add(B.clone().multiplyScalar(Math.sin(theta)));
        const taper = 1 - P.taper * Math.pow(Math.abs((i / M) * 2 - 1), 1.6);
        const hw = P.width * taper;
        const L = pos[i].clone().add(dir.clone().multiplyScalar(hw));
        const R = pos[i].clone().add(dir.clone().multiplyScalar(-hw));
        verts.push(L.x, L.y, L.z, R.x, R.y, R.z);
      }
      for (let i = 0; i < M; i++) {
        const o = i * 2;
        idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
      geo.setIndex(idx); geo.computeVertexNormals();
      mesh = new THREE.Mesh(geo, mat); group.add(mesh);
    }

    function applyColors() {
      mat.color = new THREE.Color(colors[0] || ink);
      renderer.setClearColor(new THREE.Color(ground), 1);
    }

    function rebuild() {
      const k = [seed, P.nodes].join("|");
      if (k !== builtKey) { buildCurve(); builtKey = k; }
      buildRibbon();
    }
    buildCurve(); builtKey = [seed, P.nodes].join("|"); buildRibbon(); applyColors();

    // sizing
    function resize() {
      const r = host.getBoundingClientRect();
      const s = Math.max(1, Math.min(r.width, r.height || r.width));
      renderer.setSize(s, s, false);
      canvas.style.width = "100%"; canvas.style.height = "100%";
      camera.aspect = 1; camera.updateProjectionMatrix();
    }
    resize();
    const ro = new ResizeObserver(resize); ro.observe(host);

    // drag to orbit
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
        const reseed = nc.seed !== seed;
        P = nc.params; colors = nc.colors; ink = nc.ink; ground = nc.ground; seed = nc.seed;
        rebuild(); applyColors();
      },
      destroy() {
        running = false; cancelAnimationFrame(raf); ro.disconnect();
        canvas.removeEventListener("pointerdown", onDown); canvas.removeEventListener("pointermove", onMove);
        canvas.removeEventListener("pointerup", onUp); canvas.removeEventListener("pointerleave", onUp);
        if (mesh) mesh.geometry.dispose(); mat.dispose(); renderer.dispose(); canvas.remove();
      },
      snapshotCanvas() { renderer.render(scene, camera); return canvas; },
    };
  },
};
