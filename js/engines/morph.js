// morph.js — continuous shape-morphing between brand forms, using Flubber for the
// path interpolation and anime.js to drive the tween. The mark is never static:
// it breathes between a circle, a folded ribbon, an organic blob, a quilt diamond,
// and a trefoil fold. Vector throughout — exports as clean SVG.
import { interpolate } from "flubber";
import anime from "animejs";
import { smoothPath, rng } from "../util.js";

const W = 1000, CX = 500, CY = 500;

function circle(n = 40, r = 300) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [CX + Math.cos(a) * r, CY + Math.sin(a) * r];
  });
}
function blob(seed, n = 40, r = 300) {
  const rnd = rng(seed);
  const k = 3 + Math.floor(rnd() * 3), ph = rnd() * 6;
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (1 + 0.22 * Math.sin(k * a + ph) + 0.1 * Math.sin(2 * a));
    return [CX + Math.cos(a) * rr, CY + Math.sin(a) * rr];
  });
}
function ribbon(n = 48, r = 300) {
  // a folded horizontal band — two sine edges
  const top = [], bot = [];
  for (let i = 0; i <= n / 2; i++) {
    const x = CX - r + (i / (n / 2)) * 2 * r;
    const w = 130 * (0.5 + 0.5 * Math.sin((i / (n / 2)) * Math.PI));
    const c = CY + 90 * Math.sin((i / (n / 2)) * Math.PI * 3);
    top.push([x, c - w]); bot.push([x, c + w]);
  }
  return top.concat(bot.reverse());
}
function diamond(r = 320) {
  return [[CX, CY - r], [CX + r * 0.7, CY], [CX, CY + r], [CX - r * 0.7, CY]];
}
function trefoil(n = 60, r = 300) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.7 + 0.3 * Math.abs(Math.sin(1.5 * a)));
    return [CX + Math.cos(a) * rr, CY + Math.sin(a) * rr];
  });
}

export default {
  id: "morph",
  label: "Morph",
  kind: "live",
  blurb: "The mark in motion — morphs continuously between brand forms (Flubber + anime.js). Never static.",
  params: [
    { key: "speed", label: "Speed",  min: 0.3, max: 3,  step: 0.1, default: 1 },
    { key: "hold",  label: "Hold",   min: 0,   max: 1,  step: 0.01,default: 0.25 },
    { key: "fill",  label: "Fill",   min: 0,   max: 1,  step: 1,   default: 1 },
    { key: "edge",  label: "Outline",min: 0,   max: 14, step: 0.5, default: 2 },
  ],

  mount(host, ctx) {
    let P = ctx.params, colors = ctx.colors, ink = ctx.ink, ground = ctx.ground;
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${W}`);
    svg.style.width = "100%"; svg.style.height = "100%"; svg.style.display = "block";
    svg.innerHTML = `<defs><linearGradient id="mgrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${colors[0] || ink}"/>
      <stop offset="100%" stop-color="${colors[1] || colors[0] || ink}"/></linearGradient></defs>
      <path id="mpath" fill="url(#mgrad)"/>`;
    host.appendChild(svg);
    const path = svg.querySelector("#mpath");

    const shapes = [circle(), ribbon(), blob(7), diamond(), trefoil()].map((pts) => smoothPath(pts, { closed: true, tension: 0.6 }));
    let i = 0, interp = null, tl = null, currentD = shapes[0];

    function style() {
      path.setAttribute("fill", P.fill ? "url(#mgrad)" : "none");
      path.setAttribute("stroke", ink);
      path.setAttribute("stroke-width", P.edge);
      path.setAttribute("stroke-opacity", P.fill ? 0.4 : 1);
      svg.querySelector("#mgrad stop:first-child").setAttribute("stop-color", colors[0] || ink);
      svg.querySelector("#mgrad stop:last-child").setAttribute("stop-color", colors[1] || colors[0] || ink);
    }
    function step() {
      const from = shapes[i % shapes.length], to = shapes[(i + 1) % shapes.length];
      interp = interpolate(from, to, { maxSegmentLength: 12 });
      const obj = { t: 0 };
      tl = anime({
        targets: obj, t: 1,
        duration: 1400 / P.speed,
        easing: "easeInOutSine",
        delay: (700 * P.hold) / P.speed,
        update() { currentD = interp(obj.t); path.setAttribute("d", currentD); },
        complete() { i++; step(); },
      });
    }
    style(); path.setAttribute("d", currentD); step();

    return {
      update(nc) {
        P = nc.params; colors = nc.colors; ink = nc.ink; ground = nc.ground; style();
      },
      destroy() { if (tl) anime.remove(tl); svg.remove(); },
      snapshotSVG() {
        return `<defs><linearGradient id="mgrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${colors[0] || ink}"/>
          <stop offset="100%" stop-color="${colors[1] || colors[0] || ink}"/></linearGradient></defs>
          <path d="${currentD}" fill="${P.fill ? "url(#mgrad)" : "none"}" stroke="${ink}" stroke-width="${P.edge}" stroke-opacity="${P.fill ? 0.4 : 1}"/>`;
      },
      viewBox: `0 0 ${W} ${W}`,
    };
  },
};
