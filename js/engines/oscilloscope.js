// oscilloscope.js — the brief calls the sine wave "the mathematical signature of
// time." This is that, alive: a sine oscillator pushed through a West-Coast
// triangle wavefolder, drawn as a glowing CRT phosphor trace (additive bloom +
// persistence trails). Two modes: Time (Y vs t) and XY/Lissajous (looping figures).
import { liveCanvas } from "../live.js";

export default {
  id: "scope",
  label: "Oscilloscope",
  kind: "live",
  blurb: "A live scope: a sine through a wavefolder. As a pen-plotter trace on cream graph paper (the Cloth register) or a glowing CRT phosphor. Switch to XY for Lissajous figures.",
  params: [
    { key: "mode",    label: "Register", type: "select", default: "paper",
      options: [{ value: "paper", label: "Paper / plotter" }, { value: "crt", label: "CRT phosphor" }] },
    { key: "xy",      label: "XY / Lissajous", min: 0, max: 1, step: 1,    default: 0 },
    { key: "freq",    label: "Frequency",   min: 1,  max: 12, step: 0.1,  default: 3 },
    { key: "ratio",   label: "XY ratio",    min: 0.5, max: 6, step: 0.01, default: 2 },
    { key: "phaseB",  label: "XY phase",    min: 0,  max: 1,  step: 0.005,default: 0.25 },
    { key: "fold",    label: "Wavefold",    min: 1,  max: 8,  step: 0.05, default: 2.2 },
    { key: "sym",     label: "Symmetry",    min: -1, max: 1,  step: 0.01, default: 0 },
    { key: "speed",   label: "Sweep speed", min: 0,  max: 3,  step: 0.01, default: 1 },
    { key: "glow",    label: "Trace glow",  min: 0,  max: 1,  step: 0.01, default: 0.7 },
    { key: "persist", label: "Persistence", min: 0,  max: 1,  step: 0.01, default: 0.55 },
    { key: "evolve",  label: "Evolve",      min: 0,  max: 1,  step: 1,    default: 1 },
    { key: "tri",     label: "Hard fold",   min: 0,  max: 1,  step: 1,    default: 0 },
    { key: "freeze",  label: "Freeze",      min: 0,  max: 1,  step: 1,    default: 0 },
    { key: "phosphor",label: "Phosphor",    type: "color",               default: "#73C49F" },
  ],

  mount(host, ctx) {
    let P = ctx.params, colors = ctx.colors, ink = ctx.ink, ground = ctx.ground;
    let phase = 0, lfoT = 0, lastT = 0;

    const traceColor = () => (state_bw() ? "#eaeaea" : (P.phosphor || colors[0] || "#73C49F"));
    function state_bw() { return false; } // phosphor picker governs the scope by design

    function screenColor() {
      const g = rgb(ground);
      if (lum(g) < 0.25) return css(g);            // honor an already-dark register
      const t = rgb(traceColor());
      return css([t[0] * 0.05 + 5, t[1] * 0.05 + 8, t[2] * 0.05 + 6]); // dark screen, phosphor-tinted
    }

    // West-Coast triangle wavefolder: reflects the signal back on itself.
    const foldTri = (x) => { x = ((x + 1) % 4 + 4) % 4; return x < 2 ? x - 1 : 3 - x; };
    function shape(raw, drive) {
      const folded = foldTri(drive * raw + P.sym);
      return P.tri ? folded : Math.sin((Math.PI / 2) * folded);
    }

    // Build the wavefolded trace path (shared by both registers) + the beam position.
    function buildTrace(w, drive, midX, midY, ampX, ampY) {
      const path = new Path2D();
      if (P.xy) {
        const N = 720, turns = 3, ph2 = P.phaseB * Math.PI * 2;
        for (let i = 0; i <= N; i++) {
          const th = (i / N) * Math.PI * 2 * turns + phase;
          const x = midX + ampX * shape(Math.sin(th), drive);
          const y = midY - ampY * shape(Math.sin(P.ratio * th + ph2), drive);
          i === 0 ? path.moveTo(x, y) : path.lineTo(x, y);
        }
      } else {
        const step = 1.4;
        for (let x = 0; x <= w; x += step) {
          const y = midY - shape(Math.sin(2 * Math.PI * ((x / w) * P.freq + phase)), drive) * ampY;
          x === 0 ? path.moveTo(x, y) : path.lineTo(x, y);
        }
      }
      const bx = P.xy ? midX + ampX * shape(Math.sin(phase), drive) : 2;
      const by = P.xy ? midY - ampY * shape(Math.sin(P.phaseB * Math.PI * 2), drive)
                      : midY - shape(Math.sin(2 * Math.PI * phase), drive) * ampY;
      return { path, bx, by };
    }

    const live = liveCanvas(host, {
      onFrame(c, w, h, t) {
        const dt = Math.min(0.05, t - lastT); lastT = t;
        if (!P.freeze) { phase += 0.6 * P.speed * dt; lfoT += dt; }
        const drive = P.fold * (P.evolve ? 1 + 0.4 * Math.sin(lfoT * 0.6) : 1);
        const midX = w / 2, midY = h / 2, ampX = w * 0.34, ampY = h * 0.34;
        const { path, bx, by } = buildTrace(w, drive, midX, midY, ampX, ampY);
        if (P.mode === "paper") drawPaper(c, w, h, path, bx, by);
        else drawCRT(c, w, h, path, bx, by);
      },
    });

    // ---- CRT register: glowing phosphor trace on a dark, scanlined screen --------
    function drawCRT(c, w, h, path, bx, by) {
      const trace = traceColor(), core = lighten(trace, 0.6);
      c.globalCompositeOperation = "source-over";
      c.globalAlpha = lerp(1, 0.05, P.persist);                 // persistence: fade rather than clear
      c.fillStyle = screenColor(); c.fillRect(0, 0, w, h);
      c.globalAlpha = 1;
      drawGrid(c, w, h, trace);
      c.globalCompositeOperation = "lighter";                   // additive phosphor bloom
      c.lineJoin = "round"; c.lineCap = "round"; c.shadowColor = trace;
      const G = P.glow;
      c.shadowBlur = 26 * G + 6; c.strokeStyle = trace; c.globalAlpha = 0.10 * G + 0.04; c.lineWidth = 9; c.stroke(path);
      c.shadowBlur = 14 * G + 4; c.globalAlpha = 0.32 * G + 0.12; c.lineWidth = 4; c.stroke(path);
      c.shadowBlur = 6 * G + 2; c.strokeStyle = core; c.globalAlpha = 0.95; c.lineWidth = 1.6; c.stroke(path);
      c.beginPath(); c.arc(bx, by, 2.6, 0, 7); c.fillStyle = core; c.globalAlpha = 0.9; c.fill();
      c.globalCompositeOperation = "source-over"; c.shadowBlur = 0; c.globalAlpha = 1;
      crtOverlay(c, w, h);
    }

    // ---- Paper register: a pen-plotter trace on cream graph paper, over a faint,
    // gently-broken coordinate lattice with the scope graticule drawn as quilting marks.
    function drawPaper(c, w, h, path, bx, by) {
      c.globalCompositeOperation = "source-over"; c.globalAlpha = 1; c.shadowBlur = 0;
      c.fillStyle = ground; c.fillRect(0, 0, w, h);
      paperGrid(c, w, h);
      const pen = traceColor();
      c.lineJoin = "round"; c.lineCap = "round";
      c.strokeStyle = pen; c.globalAlpha = 0.20; c.lineWidth = 3.4; c.stroke(path);   // soft ink-wash underlay
      c.strokeStyle = pen; c.globalAlpha = 0.95; c.lineWidth = 1.7; c.stroke(path);   // crisp pen line
      c.beginPath(); c.arc(bx, by, 3, 0, 7); c.fillStyle = inkCss(0.85); c.fill();     // beam node
      c.globalAlpha = 1;
    }
    function inkCss(a) { const I = rgb(ink); return `rgba(${I[0]},${I[1]},${I[2]},${a})`; }
    function paperGrid(c, w, h) {
      const I = rgb(ink);
      const warp = (x, y) => [
        x + Math.sin(y * 0.012 + x * 0.004) * 7 + Math.sin(y * 0.03) * 3,
        y + Math.sin(x * 0.012 + y * 0.004) * 7 + Math.sin(x * 0.03) * 3,
      ];
      const div = 16;
      c.lineJoin = "round";
      c.strokeStyle = `rgba(${I.join(",")},0.08)`; c.lineWidth = 1;   // faint warped lattice
      for (let i = 0; i <= div; i++) {
        c.beginPath();
        for (let s = 0; s <= 40; s++) { const [X, Y] = warp((i / div) * w, (s / 40) * h); s ? c.lineTo(X, Y) : c.moveTo(X, Y); }
        c.stroke();
        c.beginPath();
        for (let s = 0; s <= 40; s++) { const [X, Y] = warp((s / 40) * w, (i / div) * h); s ? c.lineTo(X, Y) : c.moveTo(X, Y); }
        c.stroke();
      }
      c.fillStyle = `rgba(${I.join(",")},0.16)`;                      // diagram nodes at major divisions
      for (let i = 2; i <= div - 2; i += 4) for (let j = 2; j <= div - 2; j += 4) {
        const [X, Y] = warp((i / div) * w, (j / div) * h); c.beginPath(); c.arc(X, Y, 1.5, 0, 7); c.fill();
      }
      c.strokeStyle = `rgba(${I.join(",")},0.28)`; c.lineWidth = 1.1; c.setLineDash([5, 6]);   // graticule axes as stitches
      c.beginPath(); c.moveTo(0, h / 2); c.lineTo(w, h / 2); c.stroke();
      c.beginPath(); c.moveTo(w / 2, 0); c.lineTo(w / 2, h); c.stroke();
      c.setLineDash([]);
      c.strokeStyle = `rgba(${I.join(",")},0.3)`; c.lineWidth = 1;    // graticule ticks
      for (let i = 1; i < div; i++) {
        const x = (i / div) * w, y = (i / div) * h;
        c.beginPath(); c.moveTo(x, h / 2 - 4); c.lineTo(x, h / 2 + 4); c.stroke();
        c.beginPath(); c.moveTo(w / 2 - 4, y); c.lineTo(w / 2 + 4, y); c.stroke();
      }
    }

    function drawGrid(c, w, h, trace) {
      c.save();
      c.strokeStyle = trace; c.globalAlpha = 0.08; c.lineWidth = 1;
      const div = 10;
      for (let i = 0; i <= div; i++) {
        const x = (i / div) * w, y = (i / div) * h;
        c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke();
        c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke();
      }
      c.globalAlpha = 0.18; c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(0, h / 2); c.lineTo(w, h / 2); c.stroke();
      c.beginPath(); c.moveTo(w / 2, 0); c.lineTo(w / 2, h); c.stroke();
      c.restore();
    }
    function crtOverlay(c, w, h) {
      c.save();
      c.globalAlpha = 0.05; c.fillStyle = "#000";
      for (let y = 0; y < h; y += 3) c.fillRect(0, y, w, 1);
      const v = c.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 0.72);
      v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,0.45)");
      c.globalAlpha = 1; c.fillStyle = v; c.fillRect(0, 0, w, h);
      c.restore();
    }

    return {
      update(nc) { P = nc.params; colors = nc.colors; ink = nc.ink; ground = nc.ground; },
      destroy() { live.stop(); },
      snapshotCanvas() { return live.canvas; },
    };
  },
};

function rgb(h) { const n = parseInt((h || "#000").replace("#", ""), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function css(a) { return `rgb(${a.map((v) => Math.max(0, Math.min(255, Math.round(v)))).join(",")})`; }
function lum(a) { return (0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]) / 255; }
function lerp(a, b, t) { return a + (b - a) * t; }
function lighten(h, t) { const a = rgb(h); return css([lerp(a[0], 255, t), lerp(a[1], 255, t), lerp(a[2], 255, t)]); }
