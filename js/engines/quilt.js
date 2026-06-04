// quilt.js — generative patchwork in the "flying geese" tradition. Eileen asked
// for an "organic-analog quilted texture"; this makes it parametric. Geometric
// blocks, handmade feeling, seasonal palette. Reads as craft, not as a tech grid.
import { rng, el, round } from "../util.js";

const BLOCKS = ["geese", "hst", "square", "halfsq", "diag"];

export default {
  id: "quilt",
  label: "Quilt block",
  blurb: "Flying-geese tessellation — the brief's craft thread, made parametric in the seasonal palette.",
  params: [
    { key: "grid",    label: "Grid",       min: 2,  max: 9,  step: 1,    default: 5 },
    { key: "variety", label: "Variety",    min: 1,  max: 5,  step: 1,    default: 3 },
    { key: "rotate",  label: "Rotation",   min: 0,  max: 1,  step: 0.01, default: 0.6 },
    { key: "seam",    label: "Seam",       min: 0,  max: 1,  step: 0.01, default: 0.25 },
  ],

  render({ w, h, p, colors, ink, ground, seed }) {
    const r = rng(seed);
    const n = Math.round(p.grid);
    const size = Math.min(w, h);
    const ox = (w - size) / 2, oy = (h - size) / 2;
    const cell = size / n;
    const pal = colors.length ? colors : [ink];
    const pick = () => pal[Math.floor(r() * pal.length)];
    const seam = p.seam > 0.02 ? el("rect", {}, "") : "";
    const seamStroke = p.seam > 0.02 ? ground : "none";
    const sw = round(cell * 0.04 * p.seam * 3);
    const kinds = BLOCKS.slice(0, Math.max(1, Math.round(p.variety)));

    let out = "";
    for (let gy = 0; gy < n; gy++) {
      for (let gx = 0; gx < n; gx++) {
        const x = ox + gx * cell, y = oy + gy * cell;
        const kind = kinds[Math.floor(r() * kinds.length)];
        const rot = r() < p.rotate ? Math.floor(r() * 4) * 90 : 0;
        const a = pick(), b = pick();
        out += `<g transform="translate(${round(x)} ${round(y)}) rotate(${rot} ${round(cell/2)} ${round(cell/2)})">`;
        out += block(kind, cell, a, b, ink, seamStroke, sw);
        out += `</g>`;
      }
    }
    return out;
  },
};

function block(kind, c, a, b, ink, stroke, sw) {
  const base = el("rect", { x: 0, y: 0, width: round(c), height: round(c), fill: a });
  const s = { fill: b, stroke, "stroke-width": sw };
  switch (kind) {
    case "geese":
      return base + el("polygon", { points: `0,${round(c)} ${round(c/2)},0 ${round(c)},${round(c)}`, ...s });
    case "hst":
      return base + el("polygon", { points: `0,0 ${round(c)},0 0,${round(c)}`, ...s });
    case "halfsq":
      return base + el("rect", { x: 0, y: 0, width: round(c), height: round(c/2), ...s });
    case "diag":
      return base + el("polygon", { points: `0,0 ${round(c)},${round(c)} ${round(c)},0`, ...s }) +
                    el("polygon", { points: `0,0 0,${round(c)} ${round(c)},${round(c)}`, fill: a });
    case "square":
    default:
      return base + el("rect", { x: round(c*0.22), y: round(c*0.22), width: round(c*0.56), height: round(c*0.56), ...s });
  }
}
