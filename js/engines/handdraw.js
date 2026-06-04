// handdraw.js — Jasper's idea: draw a form with the mouse, get it cleaned into
// nice organic curves. Raw pointer points -> Catmull-Rom spline. Optional fold
// mirror gives instant symmetry — useful for marks that should feel "folded."
// Interactive: app.js captures strokes into ctx.data.strokes ([[{x,y}...], ...]).
import { smoothPath, el, round } from "../util.js";

export default {
  id: "draw",
  label: "Hand draw",
  blurb: "Sketch a form with your mouse — it's smoothed into clean curves. Optional fold-mirror for symmetry.",
  interactive: "draw",
  params: [
    { key: "tension", label: "Smoothing",   min: 0,  max: 1,  step: 0.01, default: 0.6 },
    { key: "weight",  label: "Stroke",      min: 1,  max: 24, step: 0.5,  default: 8 },
    { key: "mirror",  label: "Fold mirror", min: 0,  max: 1,  step: 1,    default: 0 },
    { key: "fillit",  label: "Fill",        min: 0,  max: 1,  step: 1,    default: 0 },
  ],

  render({ w, h, p, colors, ink, ground, seed, data }) {
    const strokes = (data && data.strokes) || [];
    const accent = colors[0] || ink;
    const tension = 0.2 + p.tension * 0.8;
    let out = "";

    const drawStroke = (pts, mirror) => {
      if (pts.length < 2) return "";
      const draw = mirror ? pts.map((q) => ({ x: w - q.x, y: q.y })) : pts;
      const d = smoothPath(draw, { tension, closed: !!p.fillit });
      return el("path", {
        d, fill: p.fillit ? accent : "none", "fill-opacity": p.fillit ? 0.9 : 0,
        stroke: ink, "stroke-width": round(p.weight), "stroke-linecap": "round",
        "stroke-linejoin": "round",
      });
    };

    for (const s of strokes) {
      out += drawStroke(s, false);
      if (p.mirror) out += drawStroke(s, true);
    }

    if (!strokes.length) {
      out += el("text", { x: round(w / 2), y: round(h / 2), "text-anchor": "middle",
        fill: ink, "fill-opacity": 0.35, "font-size": 18, "font-family": "system-ui" },
        "Click and drag on the canvas to draw");
    }
    return out;
  },
};
