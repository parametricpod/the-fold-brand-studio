// graph.js — a social/network field as a living design object. The Fold exists
// for "emergent collaboration and serendipitous encounters"; nodes-and-edges is
// a true reading of that, not decoration. Kept sparse and intentional, not a hairball.
import { rng, el, round, smoothPath } from "../util.js";

export default {
  id: "graph",
  label: "Network field",
  blurb: "Nodes and connections as a mark — The Fold's actual purpose: people meeting.",
  params: [
    { key: "nodes",   label: "Nodes",      min: 4,  max: 40, step: 1,    default: 16 },
    { key: "density", label: "Density",    min: 0,  max: 1,  step: 0.01, default: 0.35 },
    { key: "spread",  label: "Spread",     min: 0.3, max: 1, step: 0.01, default: 0.7 },
    { key: "curve",   label: "Edge curve", min: 0,  max: 1,  step: 0.01, default: 0.5 },
  ],

  render({ w, h, p, colors, ink, ground, seed }) {
    const r = rng(seed);
    const n = Math.round(p.nodes);
    const cx = w / 2, cy = h / 2;
    const rad = Math.min(w, h) * 0.42 * p.spread;
    const pal = colors.length ? colors : [ink];

    // Poisson-ish placement: a few "hub" nodes, rest orbit — reads as a gathering.
    const nodes = [];
    for (let i = 0; i < n; i++) {
      const ang = r() * Math.PI * 2;
      const rr = Math.sqrt(r()) * rad * (0.4 + 0.6 * r());
      nodes.push({ x: cx + Math.cos(ang) * rr, y: cy + Math.sin(ang) * rr, c: pal[i % pal.length] });
    }

    // Connect by nearest-neighbour + a density-controlled sprinkle of long ties.
    const edges = [];
    for (let i = 0; i < n; i++) {
      const dists = nodes.map((m, j) => ({ j, d: Math.hypot(m.x - nodes[i].x, m.y - nodes[i].y) }))
        .filter((o) => o.j !== i).sort((a, b) => a.d - b.d);
      edges.push([i, dists[0].j]);
      for (const o of dists.slice(1, 6)) if (r() < p.density) edges.push([i, o.j]);
    }

    let edgeSvg = "";
    const seen = new Set();
    for (const [i, j] of edges) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (seen.has(key)) continue; seen.add(key);
      const a = nodes[i], b = nodes[j];
      if (p.curve < 0.02) {
        edgeSvg += el("line", { x1: round(a.x), y1: round(a.y), x2: round(b.x), y2: round(b.y),
          stroke: ink, "stroke-width": 1.1, "stroke-opacity": 0.4 });
      } else {
        // Bow the edge toward the centre — a soft "crease" where two things meet.
        const mx = (a.x + b.x) / 2 + (cx - (a.x + b.x) / 2) * p.curve * 0.4;
        const my = (a.y + b.y) / 2 + (cy - (a.y + b.y) / 2) * p.curve * 0.4;
        edgeSvg += el("path", { d: smoothPath([[a.x, a.y], [mx, my], [b.x, b.y]], { tension: 0.6 }),
          fill: "none", stroke: ink, "stroke-width": 1.1, "stroke-opacity": 0.4 });
      }
    }

    let nodeSvg = "";
    for (const nd of nodes) {
      const size = 4 + r() * 8;
      nodeSvg += el("circle", { cx: round(nd.x), cy: round(nd.y), r: round(size), fill: nd.c,
        stroke: ground, "stroke-width": 1.5 });
    }
    return edgeSvg + nodeSvg;
  },
};
