// main.js — The Fold Brand Studio. Composes a live mark + "THE FOLD" wordmark
// lockup from six generative engines, across the brand's color registers.
import { PALETTES, EXTERIOR, SEASONS, FONTS } from "./brand.js";
import { downloadSVG, downloadPNG } from "./export.js";

import fold from "./engines/foldedSurface.js";
import quilt from "./engines/quilt.js";
import graph from "./engines/graph.js";
import flow from "./engines/flowField.js";
import draw from "./engines/handdraw.js";
import wrap from "./engines/pointFold.js";

const ENGINES = [fold, quilt, graph, flow, wrap, draw];
const STAGE = 1080;          // mark coordinate space (square)
const LOCKH = 220;           // wordmark band height
const VBH = STAGE + LOCKH;

// ---- state -----------------------------------------------------------------
const state = {
  engineId: "fold",
  params: {},                // params[engineId] = {key: value}
  data: {},                  // interactive data per engine
  paletteKey: "v1",
  register: "interior",      // interior | exterior | season
  seasonKey: "spring",
  seed: 7,
  font: FONTS.display[0],
  showWordmark: true,
  wordmark: "THE FOLD",
};

// init default params + interactive data
for (const e of ENGINES) {
  state.params[e.id] = Object.fromEntries(e.params.map((p) => [p.key, p.default]));
  if (e.interactive === "draw") state.data[e.id] = { strokes: [] };
  if (e.interactive === "points") state.data[e.id] = { points: [] };
}

const engine = () => ENGINES.find((e) => e.id === state.engineId);

// ---- color resolution ------------------------------------------------------
function resolveColors() {
  const pal = PALETTES[state.paletteKey].swatches.map((s) => s.hex);
  if (state.register === "exterior") {
    return { ground: EXTERIOR.ground, ink: EXTERIOR.goldHi, colors: [EXTERIOR.gold, EXTERIOR.goldHi] };
  }
  if (state.register === "season") {
    const s = SEASONS.find((x) => x.key === state.seasonKey);
    return { ground: s.ground, ink: s.ink, colors: [s.accent, ...pal.filter((c) => c !== s.accent)] };
  }
  // interior: cream ground, deep-blue ink, full jewel palette
  const ink = state.paletteKey === "v1" ? "#171D60" : "#51225D";
  return { ground: state.paletteKey === "v1" ? "#ECE6E4" : "#ECE6E4", ink, colors: pal.filter((c) => c.toLowerCase() !== "#ece6e4") };
}

// ---- composition -----------------------------------------------------------
function compose() {
  const e = engine();
  const { ground, ink, colors } = resolveColors();
  const p = state.params[e.id];
  const markInner = e.render({ w: STAGE, h: STAGE, p, colors, ink, ground, seed: state.seed, data: state.data[e.id] });

  const showWM = state.showWordmark;
  const vbH = showWM ? VBH : STAGE;
  let wordmark = "";
  if (showWM) {
    const fs = 150;
    wordmark = `<g transform="translate(${STAGE / 2} ${STAGE + LOCKH * 0.62})">
      <text text-anchor="middle" font-family="${state.font.css}" font-weight="${state.font.weight}"
            font-size="${fs}" letter-spacing="6" fill="${ink}">${state.wordmark}</text>
    </g>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${STAGE} ${vbH}" id="composition">
    <rect x="0" y="0" width="${STAGE}" height="${vbH}" fill="${ground}"/>
    <g id="mark">${markInner}</g>
    ${wordmark}
  </svg>`;
}

function renderStage() {
  const stage = document.getElementById("stage");
  stage.innerHTML = compose();
  attachPointer();
}

// ---- pointer interaction for draw / points engines -------------------------
let drawing = false;
function svgPoint(evt) {
  const svg = document.getElementById("composition");
  const r = svg.getBoundingClientRect();
  const x = ((evt.clientX - r.left) / r.width) * STAGE;
  const y = ((evt.clientY - r.top) / r.height) * (state.showWordmark ? VBH : STAGE);
  return { x, y };
}
function attachPointer() {
  const e = engine();
  const svg = document.getElementById("composition");
  if (!e.interactive) { svg.style.cursor = "default"; return; }
  svg.style.cursor = "crosshair";
  if (e.interactive === "points") {
    svg.addEventListener("pointerdown", (ev) => {
      const pt = svgPoint(ev);
      if (pt.y > STAGE) return;
      state.data[e.id].points.push(pt);
      renderStage();
    });
  }
  if (e.interactive === "draw") {
    svg.addEventListener("pointerdown", (ev) => {
      const pt = svgPoint(ev); if (pt.y > STAGE) return;
      drawing = true; state.data[e.id].strokes.push([pt]);
      svg.setPointerCapture(ev.pointerId);
    });
    svg.addEventListener("pointermove", (ev) => {
      if (!drawing) return;
      const s = state.data[e.id].strokes;
      s[s.length - 1].push(svgPoint(ev));
      renderStage();
    });
    svg.addEventListener("pointerup", () => { drawing = false; });
  }
}

// ---- controls UI -----------------------------------------------------------
function renderControls() {
  const e = engine();
  const c = document.getElementById("controls");
  const p = state.params[e.id];

  const engineBtns = ENGINES.map((x) =>
    `<button class="chip ${x.id === state.engineId ? "on" : ""}" data-engine="${x.id}">${x.label}</button>`
  ).join("");

  const sliders = e.params.map((pr) => {
    const isToggle = pr.min === 0 && pr.max === 1 && pr.step === 1;
    const v = p[pr.key];
    if (isToggle) {
      return `<label class="toggle"><span>${pr.label}</span>
        <input type="checkbox" data-param="${pr.key}" ${v ? "checked" : ""}></label>`;
    }
    return `<label class="slider"><span>${pr.label}<em>${v}</em></span>
      <input type="range" data-param="${pr.key}" min="${pr.min}" max="${pr.max}" step="${pr.step}" value="${v}"></label>`;
  }).join("");

  const interactiveTools = e.interactive
    ? `<button class="ghost" id="clearData">Clear ${e.interactive === "draw" ? "drawing" : "points"}</button>` : "";

  const fontOpts = FONTS.display.map((f) =>
    `<option value="${f.name}" ${f.name === state.font.name ? "selected" : ""}>${f.name}</option>`).join("");

  const seasonChips = SEASONS.map((s) =>
    `<button class="season ${state.register === "season" && state.seasonKey === s.key ? "on" : ""}"
       data-season="${s.key}" style="--c:${s.accent}">${s.label}</button>`).join("");

  c.innerHTML = `
    <section>
      <h3>Mark engine</h3>
      <div class="chips">${engineBtns}</div>
      <p class="blurb">${e.blurb}</p>
    </section>

    <section>
      <h3>Parameters</h3>
      ${sliders}
      <div class="row">
        <button class="ghost" id="regen">⟳ New seed</button>
        ${interactiveTools}
      </div>
    </section>

    <section>
      <h3>Color register</h3>
      <div class="chips">
        <button class="chip ${state.register === "interior" ? "on" : ""}" data-register="interior">Interior</button>
        <button class="chip ${state.register === "exterior" ? "on" : ""}" data-register="exterior">Exterior · gold/black</button>
      </div>
      <div class="chips palettes">
        <button class="chip ${state.paletteKey === "v1" ? "on" : ""}" data-palette="v1">${PALETTES.v1.label}</button>
        <button class="chip ${state.paletteKey === "v2" ? "on" : ""}" data-palette="v2">${PALETTES.v2.label}</button>
      </div>
      <div class="swatches">${PALETTES[state.paletteKey].swatches.map((s) =>
        `<span title="${s.name} ${s.hex}" style="background:${s.hex}"></span>`).join("")}</div>
      <h4>Seasonal line</h4>
      <div class="seasons">${seasonChips}</div>
    </section>

    <section>
      <h3>Wordmark</h3>
      <label class="toggle"><span>Show “THE FOLD”</span>
        <input type="checkbox" id="wmToggle" ${state.showWordmark ? "checked" : ""}></label>
      <select id="fontSel">${fontOpts}</select>
      <p class="blurb" id="fontNote">${state.font.note}</p>
    </section>

    <section class="exports">
      <button class="primary" id="expSVG">Export SVG</button>
      <button class="ghost" id="expPNG">PNG</button>
    </section>
  `;
  wireControls();
}

function wireControls() {
  const e = engine();
  document.querySelectorAll("[data-engine]").forEach((b) =>
    b.onclick = () => { state.engineId = b.dataset.engine; renderAll(); });

  document.querySelectorAll("[data-param]").forEach((inp) => {
    inp.oninput = () => {
      const key = inp.dataset.param;
      state.params[e.id][key] = inp.type === "checkbox" ? (inp.checked ? 1 : 0) : Number(inp.value);
      // Update only the live value label — never rebuild the panel mid-drag, or
      // the slider element is replaced and the drag is interrupted.
      if (inp.type === "range") {
        const em = inp.parentElement.querySelector("em");
        if (em) em.textContent = inp.value;
      }
      renderStage();
    };
  });

  document.querySelectorAll("[data-register]").forEach((b) =>
    b.onclick = () => { state.register = b.dataset.register; renderAll(); });
  document.querySelectorAll("[data-palette]").forEach((b) =>
    b.onclick = () => { state.paletteKey = b.dataset.palette; renderAll(); });
  document.querySelectorAll("[data-season]").forEach((b) =>
    b.onclick = () => { state.register = "season"; state.seasonKey = b.dataset.season; renderAll(); });

  const regen = document.getElementById("regen");
  if (regen) regen.onclick = () => { state.seed = Math.floor(Math.random() * 99999); renderStage(); };

  const clear = document.getElementById("clearData");
  if (clear) clear.onclick = () => {
    if (e.interactive === "draw") state.data[e.id].strokes = [];
    if (e.interactive === "points") state.data[e.id].points = [];
    renderStage();
  };

  const wm = document.getElementById("wmToggle");
  if (wm) wm.onchange = () => { state.showWordmark = wm.checked; renderStage(); };

  const fontSel = document.getElementById("fontSel");
  if (fontSel) fontSel.onchange = () => {
    state.font = FONTS.display.find((f) => f.name === fontSel.value);
    renderControls(); renderStage();
  };

  document.getElementById("expSVG").onclick = () =>
    downloadSVG(document.getElementById("composition"), `the-fold-${state.engineId}-${state.seed}.svg`);
  document.getElementById("expPNG").onclick = () =>
    downloadPNG(document.getElementById("composition"), `the-fold-${state.engineId}-${state.seed}.png`);
}

function renderAll() { renderControls(); renderStage(); }

// ---- boot ------------------------------------------------------------------
renderAll();
