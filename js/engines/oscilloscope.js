// oscilloscope.js — the brief calls the sine wave "the mathematical signature of
// time." This is that, alive: a CRT oscilloscope tracing a sine oscillator pushed
// through a West-Coast triangle wavefolder, rendered with a genuine phosphor glow
// (additive bloom + persistence trails) and a graticule. Fully animated.
import { liveCanvas } from "../live.js";

export default {
  id: "scope",
  label: "Oscilloscope",
  kind: "live",
  blurb: "A live CRT scope: a sine through a wavefolder, drawn as a glowing phosphor trace. Time, made visible.",
  params: [
    { key: "freq",    label: "Frequency",   min: 1,  max: 12, step: 0.1,  default: 3 },
    { key: "fold",    label: "Wavefold",    min: 1,  max: 8,  step: 0.05, default: 2.2 },
    { key: "sym",     label: "Symmetry",    min: -1, max: 1,  step: 0.01, default: 0 },
    { key: "speed",   label: "Sweep speed", min: 0,  max: 3,  step: 0.01, default: 1 },
    { key: "glow",    label: "Trace glow",  min: 0,  max: 1,  step: 0.01, default: 0.7 },
    { key: "persist", label: "Persistence", min: 0,  max: 1,  step: 0.01, default: 0.55 },
    { key: "evolve",  label: "Evolve",      min: 0,  max: 1,  step: 1,    default: 1 },
    { key: "tri",     label: "Hard fold",   min: 0,  max: 1,  step: 1,    default: 0 },
  ],

  mount(host, ctx) {
    let P = ctx.params, colors = ctx.colors, ink = ctx.ink, ground = ctx.ground;
    let phase = 0;

    // a scope is a dark instrument — derive a near-black screen tinted by the trace,
    // unless the ground is already dark (exterior / B&W invert), then honor it.
    function screenColor() {
      const g = rgb(ground);
      if (lum(g) < 0.25) return css(g);
      const t = rgb(colors[0] || ink);
      return css([t[0] * 0.06 + 6, t[1] * 0.06 + 9, t[2] * 0.06 + 7]);
    }

    // West-Coast triangle wavefolder: reflects the signal back on itself.
    const foldTri = (x) => { x = ((x + 1) % 4 + 4) % 4; return x < 2 ? x - 1 : 3 - x; };

    function sample(u, drive) {
      const raw = Math.sin(2 * Math.PI * (u * P.freq + phase));
      const folded = foldTri(drive * raw + P.sym);
      return P.tri ? folded : Math.sin((Math.PI / 2) * folded); // smooth (sine) fold unless hard
    }

    const live = liveCanvas(host, {
      onFrame(c, w, h, t) {
        phase += 0.004 * P.speed;
        const drive = P.fold * (P.evolve ? 1 + 0.4 * Math.sin(t * 0.6) : 1);
        const screen = screenColor();
        const trace = colors[0] || "#73C49F";
        const core = lighten(trace, 0.6);
        const amp = h * 0.34;
        const midY = h * 0.5;

        // persistence: fade the screen rather than clearing — long trails at high persist
        c.globalCompositeOperation = "source-over";
        c.globalAlpha = lerp(1, 0.05, P.persist);
        c.fillStyle = screen; c.fillRect(0, 0, w, h);
        c.globalAlpha = 1;

        // graticule
        drawGrid(c, w, h, trace);

        // build the trace path
        const path = new Path2D();
        const step = 1.4;
        for (let x = 0; x <= w; x += step) {
          const y = midY - sample(x / w, drive) * amp;
          x === 0 ? path.moveTo(x, y) : path.lineTo(x, y);
        }

        // genuine phosphor glow: additive multi-pass bloom + bright core
        c.globalCompositeOperation = "lighter";
        c.lineJoin = "round"; c.lineCap = "round";
        c.shadowColor = trace;
        const G = P.glow;
        // outer halo
        c.shadowBlur = 26 * G + 6; c.strokeStyle = trace; c.globalAlpha = 0.10 * G + 0.04; c.lineWidth = 9; c.stroke(path);
        // mid
        c.shadowBlur = 14 * G + 4; c.globalAlpha = 0.32 * G + 0.12; c.lineWidth = 4; c.stroke(path);
        // bright core
        c.shadowBlur = 6 * G + 2; c.strokeStyle = core; c.globalAlpha = 0.95; c.lineWidth = 1.6; c.stroke(path);

        // beam dot at the left edge of the sweep
        const by = midY - sample(0, drive) * amp;
        c.beginPath(); c.arc(2, by, 2.4, 0, 7); c.fillStyle = core; c.globalAlpha = 0.9; c.fill();

        // reset
        c.globalCompositeOperation = "source-over"; c.shadowBlur = 0; c.globalAlpha = 1;

        // subtle scanlines + vignette for CRT feel
        crtOverlay(c, w, h);
      },
    });

    function drawGrid(c, w, h, trace) {
      c.save();
      c.strokeStyle = trace; c.globalAlpha = 0.08; c.lineWidth = 1;
      const div = 10;
      for (let i = 0; i <= div; i++) {
        const x = (i / div) * w, y = (i / div) * h;
        c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke();
        c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke();
      }
      // center axes a touch brighter
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

// ---- color helpers ---------------------------------------------------------
function rgb(h) { const n = parseInt((h || "#000").replace("#", ""), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function css(a) { return `rgb(${a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString()).join(",")})`; }
function lum(a) { return (0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]) / 255; }
function lerp(a, b, t) { return a + (b - a) * t; }
function lighten(h, t) { const a = rgb(h); return css([lerp(a[0], 255, t), lerp(a[1], 255, t), lerp(a[2], 255, t)]); }
