// flowField.js — the clothesline made abstract. Strands hang from a baseline and
// drape through a flow field. Honors Eileen's favorite (the hanging-ribbon F) and
// the brief's "the stuff of life hangs from it" — without one literal sine wave.
import { rng, makeFlow, smoothPath, el, round } from "../util.js";

export default {
  id: "flow",
  label: "Drape lines",
  blurb: "Strands hung on a line and let drape through a flow field — the clothesline, abstracted.",
  params: [
    { key: "strands", label: "Strands",   min: 4,  max: 60, step: 1,    default: 26 },
    { key: "length",  label: "Length",    min: 0.2, max: 1, step: 0.01, default: 0.6 },
    { key: "curl",    label: "Curl",      min: 0,  max: 1,  step: 0.01, default: 0.45 },
    { key: "line",    label: "Hang line", min: 0.1, max: 0.6, step: 0.01, default: 0.28 },
  ],

  render({ w, h, p, colors, ink, ground, seed }) {
    const r = rng(seed);
    const flow = makeFlow(seed, 0.003 + p.curl * 0.004);
    const n = Math.round(p.strands);
    const baseY = h * p.line;
    const maxLen = h * 0.7 * p.length;
    const pal = colors.length ? colors : [ink];
    const step = 6;

    // The clothesline itself — a faint constant horizontal.
    let out = el("line", { x1: round(w * 0.04), y1: round(baseY), x2: round(w * 0.96), y2: round(baseY),
      stroke: ink, "stroke-width": 1, "stroke-opacity": 0.35 });

    for (let i = 0; i < n; i++) {
      const x0 = w * 0.06 + (i / (n - 1)) * w * 0.88 + (r() - 0.5) * 6;
      const len = maxLen * (0.5 + 0.5 * r());
      const pts = [{ x: x0, y: baseY }];
      let x = x0, y = baseY;
      for (let s = 0; s < len; s += step) {
        const ang = flow(x, y);
        // Bias strongly downward: cloth hangs. Flow only perturbs the fall.
        x += Math.cos(ang) * step * p.curl;
        y += step * (0.7 + 0.3 * Math.sin(ang));
        pts.push({ x, y });
        if (y > h * 0.96) break;
      }
      const col = pal[i % pal.length];
      out += el("path", { d: smoothPath(pts, { tension: 0.5 }), fill: "none", stroke: col,
        "stroke-width": round(1.5 + r() * 2.5), "stroke-opacity": 0.85, "stroke-linecap": "round" });
      // A small pin at the top — the peg on the line.
      out += el("circle", { cx: round(x0), cy: round(baseY), r: 2.2, fill: ink, "fill-opacity": 0.6 });
    }
    return out;
  },
};
