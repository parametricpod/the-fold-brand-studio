// main.js — The Fold Brand Studio. Live mark + "THE FOLD" wordmark lockup across
// nine engines (SVG generative + canvas/SVG physics & morph), with an editable
// palette and a large curated type library.
import { PALETTES, EXTERIOR, SEASONS, ALL_FONTS, FONTS, DEFAULT_CUSTOM, loadFonts } from "./brand.js";
import { downloadSVG, downloadPNG } from "./export.js";
import { loadCurated, varCss } from "./curatedData.js";
let CURATED = [];

import cloth from "./engines/cloth.js";
import ribbon from "./engines/ribbon3d.js";
import knot from "./engines/knotLab.js";
import warp from "./engines/warpLab.js";
import letter from "./engines/letterWrap.js";
import scope from "./engines/oscilloscope.js";
import flow from "./engines/flowField.js";
import quilt from "./engines/quilt.js";
import graph from "./engines/graph.js";

loadFonts();

const ENGINES = [scope, ribbon, knot, warp, letter, cloth, flow, quilt, graph];
const STAGE = 1080;
const WMH = 240;

const state = {
  engineId: "scope",
  params: {},
  data: {},
  register: "custom",                       // interior | exterior | season | custom
  seasonKey: "spring",
  custom: structuredClone(DEFAULT_CUSTOM),
  bw: false,
  bwInvert: false,
  seed: 7,
  font: ALL_FONTS[0],
  showWordmark: true,
  wordmark: "THE FOLD",
};
for (const e of ENGINES) {
  state.params[e.id] = Object.fromEntries(e.params.map((p) => [p.key, p.default]));
  if (e.interactive === "draw") state.data[e.id] = { strokes: [] };
  if (e.interactive === "points") state.data[e.id] = { points: [] };
}
const engine = () => ENGINES.find((e) => e.id === state.engineId);
let controller = null;

// ---- colors ----------------------------------------------------------------
function resolveColors() {
  if (state.bw) {
    return state.bwInvert
      ? { ground: "#111111", ink: "#f2f2f2", colors: ["#f2f2f2", "#bdbdbd"] }
      : { ground: "#ffffff", ink: "#141414", colors: ["#1a1a1a", "#6e6e6e"] };
  }
  if (state.register === "custom") {
    return { ground: state.custom.ground, ink: state.custom.ink, colors: state.custom.accents.slice() };
  }
  if (state.register === "exterior") {
    return { ground: EXTERIOR.ground, ink: EXTERIOR.goldHi, colors: [EXTERIOR.gold, EXTERIOR.goldHi] };
  }
  if (state.register === "season") {
    const s = SEASONS.find((x) => x.key === state.seasonKey);
    const pal = state.custom.accents;
    return { ground: s.ground, ink: s.ink, colors: [s.accent, ...pal.filter((c) => c !== s.accent)] };
  }
  return { ground: "#ECE6E4", ink: "#171D60", colors: PALETTES.v1.swatches.map((s) => s.hex) };
}
function ctx() {
  const { ground, ink, colors } = resolveColors();
  return { w: STAGE, h: STAGE, params: state.params[state.engineId], colors, ink, ground, seed: state.seed, font: state.font, data: state.data[state.engineId] };
}

// ---- mark area (SVG engines emit strings; live engines mount themselves) ----
function svgMarkComposition(c) {
  const e = engine();
  // SVG engines destructure `p` (params); live engines read `params`. Pass both.
  const inner = e.render({ ...c, p: c.params, data: state.data[e.id] });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${STAGE} ${STAGE}" id="composition" style="width:100%;height:100%;display:block">
    <rect width="${STAGE}" height="${STAGE}" fill="${c.ground}"/>
    <g id="mark">${inner}</g>
  </svg>`;
}

function mountStage() {
  const e = engine();
  const c = ctx();
  const host = document.getElementById("markHost");
  if (controller) { controller.destroy(); controller = null; }
  host.style.background = c.ground;
  if (e.kind === "live") {
    host.innerHTML = "";
    controller = e.mount(host, c);
  } else {
    host.innerHTML = svgMarkComposition(c);
    attachPointer();
  }
  renderWordmark();
}

function updateMark() {
  const e = engine();
  const c = ctx();
  document.getElementById("markHost").style.background = c.ground;
  if (e.kind === "live") { controller && controller.update(c); }
  else { document.getElementById("markHost").innerHTML = svgMarkComposition(c); attachPointer(); }
}

function renderWordmark() {
  const bar = document.getElementById("wordmarkBar");
  const { ground, ink } = resolveColors();
  bar.style.background = ground;
  bar.style.display = (state.showWordmark && !engine().hideWordmark) ? "flex" : "none";
  bar.style.color = ink;
  bar.style.fontFamily = state.font.css;
  bar.style.fontWeight = state.font.weight;
  bar.style.fontStyle = state.font.italic ? "italic" : "normal";
  bar.style.fontVariationSettings = state.font.instance ? varCss(state.font.instance) : "normal";
  bar.textContent = state.wordmark;
}

// ---- pointer for interactive SVG engines (draw / points) -------------------
let drawing = false;
function svgPoint(evt) {
  const svg = document.getElementById("composition");
  const r = svg.getBoundingClientRect();
  return { x: ((evt.clientX - r.left) / r.width) * STAGE, y: ((evt.clientY - r.top) / r.height) * STAGE };
}
function attachPointer() {
  const e = engine();
  const svg = document.getElementById("composition");
  if (!svg || !e.interactive) { if (svg) svg.style.cursor = "default"; return; }
  svg.style.cursor = "crosshair";
  if (e.interactive === "points") {
    svg.onpointerdown = (ev) => { state.data[e.id].points.push(svgPoint(ev)); updateMark(); };
  }
  if (e.interactive === "draw") {
    svg.onpointerdown = (ev) => { drawing = true; state.data[e.id].strokes.push([svgPoint(ev)]); svg.setPointerCapture(ev.pointerId); };
    svg.onpointermove = (ev) => { if (!drawing) return; const s = state.data[e.id].strokes; s[s.length - 1].push(svgPoint(ev)); updateMark(); };
    svg.onpointerup = () => { drawing = false; };
  }
}

// ---- export ----------------------------------------------------------------
function exportComposition(kind) {
  const e = engine();
  const c = ctx();
  const showWM = state.showWordmark && !e.hideWordmark;
  const wmH = showWM ? WMH : 0;
  const totalH = STAGE + wmH;
  // Escape for XML: curated font css values contain double quotes ("cur-id"),
  // which silently corrupt the font-family attribute and make Illustrator
  // reject the whole file as invalid.
  const escAttr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const escText = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const wmSvg = showWM
    ? `<text x="${STAGE / 2}" y="${STAGE + WMH * 0.62}" text-anchor="middle" font-family="${escAttr(state.font.css)}" font-weight="${state.font.weight}" font-size="150" letter-spacing="6" fill="${c.ink}">${escText(state.wordmark)}</text>`
    : "";

  // Vector path: SVG engines and live engines exposing snapshotSVG.
  const markSVG = e.kind === "live" ? (controller && controller.snapshotSVG && controller.snapshotSVG()) : e.render({ ...c, p: c.params, data: state.data[e.id] });
  const markVB = e.kind === "live" && controller && controller.viewBox ? controller.viewBox : `0 0 ${STAGE} ${STAGE}`;

  if (kind === "svg" && markSVG) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${STAGE} ${totalH}`);
    svg.innerHTML = `<rect width="${STAGE}" height="${totalH}" fill="${c.ground}"/>
      <svg x="0" y="0" width="${STAGE}" height="${STAGE}" viewBox="${markVB}">${markSVG}</svg>${wmSvg}`;
    downloadSVG(svg, `the-fold-${e.id}-${state.seed}.svg`);
    return;
  }
  // Raster path (canvas live engines, or PNG button).
  const scale = 2;
  const out = document.createElement("canvas");
  out.width = STAGE * scale; out.height = totalH * scale;
  const o = out.getContext("2d"); o.scale(scale, scale);
  o.fillStyle = c.ground; o.fillRect(0, 0, STAGE, totalH);
  if (e.kind === "live" && controller && controller.snapshotCanvas) {
    o.drawImage(controller.snapshotCanvas(), 0, 0, STAGE, STAGE);
  } else if (markSVG) {
    // rasterize vector mark
    const tmp = `data:image/svg+xml;charset=utf-8,` + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${markVB}" width="${STAGE}" height="${STAGE}">${markSVG}</svg>`);
    const img = new Image();
    img.onload = () => { o.drawImage(img, 0, 0, STAGE, STAGE); finishPNG(o, c, wmH); };
    img.src = tmp; return;
  }
  finishPNG(o, c, wmH, out);
}
function finishPNG(o, c, wmH, out) {
  if (wmH) {
    o.fillStyle = c.ink; o.textAlign = "center";
    o.font = `${state.font.weight} 150px ${state.font.css}`;
    o.fillText(state.wordmark, STAGE / 2, STAGE + WMH * 0.62);
  }
  const canvas = out || o.canvas;
  canvas.toBlob((b) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b); a.download = `the-fold-${state.engineId}-${state.seed}.png`; a.click();
  }, "image/png");
}

// ---- controls --------------------------------------------------------------
function renderControls() {
  const e = engine();
  const p = state.params[e.id];
  const c = document.getElementById("controls");

  const engineBtns = ENGINES.map((x) =>
    `<button class="chip ${x.id === state.engineId ? "on" : ""}" data-engine="${x.id}">${x.label}${x.kind === "live" ? " ◆" : ""}</button>`).join("");

  const sliders = e.params.map((pr) => {
    const v = p[pr.key];
    if (pr.type === "hidden") return "";
    if (pr.type === "color") return `<label class="swrow gi"><span>${pr.label}</span><input type="color" data-param="${pr.key}" value="${v}"><code>${v}</code></label>`;
    if (pr.type === "text") return `<label class="textparam"><span>${pr.label}</span><input type="text" data-param="${pr.key}" value="${String(v).replace(/"/g, "&quot;")}" maxlength="8" class="text"></label>`;
    if (pr.type === "select") return `<label class="textparam"><span>${pr.label}</span><select data-param="${pr.key}">${(pr.options || []).map((o) => `<option value="${o.value}" ${String(v) === String(o.value) ? "selected" : ""}>${o.label}</option>`).join("")}</select></label>`;
    const isToggle = pr.min === 0 && pr.max === 1 && pr.step === 1;
    if (isToggle) return `<label class="toggle"><span>${pr.label}</span><input type="checkbox" data-param="${pr.key}" ${v ? "checked" : ""}></label>`;
    return `<label class="slider"><span>${pr.label}<em>${v}</em></span><input type="range" data-param="${pr.key}" min="${pr.min}" max="${pr.max}" step="${pr.step}" value="${v}"></label>`;
  }).join("");

  const interactiveTools = e.interactive ? `<button class="ghost" id="clearData">Clear ${e.interactive === "draw" ? "drawing" : "points"}</button>` : "";

  const accentRows = state.custom.accents.map((hex, i) =>
    `<div class="swrow"><input type="color" data-accent="${i}" value="${hex}"><input type="text" class="hexin" data-accenthex="${i}" value="${hex}" maxlength="7" spellcheck="false" autocapitalize="off"><button class="x" data-rmaccent="${i}">×</button></div>`).join("");

  const curatedOpt = CURATED.length ? `<optgroup label="Curated (trial)">` + CURATED.map((f) =>
      `<option value="cur:${f.id}" ${state.font.curated && state.font.id === f.id ? "selected" : ""}>${f.label}</option>`).join("") + `</optgroup>` : "";
  const fontOpts = curatedOpt + FONTS.groups.map((g) =>
    `<optgroup label="${g.group}">` + g.faces.map((f) =>
      `<option value="${f.name}" ${!state.font.curated && f.name === state.font.name ? "selected" : ""}>${f.name}</option>`).join("") + `</optgroup>`).join("");

  const seasonChips = SEASONS.map((s) =>
    `<button class="season ${state.register === "season" && state.seasonKey === s.key ? "on" : ""}" data-season="${s.key}" style="--c:${s.accent}">${s.label}</button>`).join("");

  const svgExportable = e.kind !== "live" || e.vector || (controller && controller.snapshotSVG);

  c.innerHTML = `
    <section>
      <div class="ttl">THE FOLD · STUDIO</div>
      <h3>Engine</h3>
      <div class="chips">${engineBtns}</div>
      <p class="blurb">${e.blurb}</p>
    </section>

    <section>
      <h3>Parameters</h3>
      ${e.controls ? e.controls(p) : ""}
      ${sliders}
      <div class="row"><button class="ghost" id="regen">⟳ New seed</button>${interactiveTools}</div>
    </section>

    <section>
      <h3>Palette <span class="tag ${state.bw ? "on" : (state.register === "custom" ? "on" : "")}">${state.bw ? "b&w" : "custom"}</span></h3>
      <label class="toggle"><span>Black &amp; white</span><input type="checkbox" id="bwToggle" ${state.bw ? "checked" : ""}></label>
      ${state.bw ? `<label class="toggle"><span>Invert (white on black)</span><input type="checkbox" id="bwInvert" ${state.bwInvert ? "checked" : ""}></label>` : ""}
      <div class="palette-editor" ${state.bw ? 'style="opacity:.4;pointer-events:none"' : ""}>${accentRows}</div>
      <button class="ghost sm" id="addAccent">+ color</button>
      <div class="swrow gi"><span>Ground</span><input type="color" id="cGround" value="${state.custom.ground}"><input type="text" class="hexin" id="cGroundHex" value="${state.custom.ground}" maxlength="7" spellcheck="false" autocapitalize="off"></div>
      <div class="swrow gi"><span>Ink</span><input type="color" id="cInk" value="${state.custom.ink}"><input type="text" class="hexin" id="cInkHex" value="${state.custom.ink}" maxlength="7" spellcheck="false" autocapitalize="off"></div>
      <div class="row">
        <button class="ghost sm" data-load="v1">Load v1</button>
        <button class="ghost sm" data-load="v2">Load v2</button>
        <button class="ghost sm" data-register="exterior">Gold/Black</button>
      </div>
      <h4>Seasonal line</h4>
      <div class="seasons">${seasonChips}</div>
    </section>

    <section>
      <h3>Wordmark</h3>
      <label class="toggle"><span>Show wordmark</span><input type="checkbox" id="wmToggle" ${state.showWordmark ? "checked" : ""}></label>
      <input type="text" id="wmText" value="${state.wordmark}" class="text">
      <select id="fontSel">${fontOpts}</select>
      <p class="blurb">${state.font.curated ? "Curated trial · " + state.font.name : (state.font.group || "") + " · " + ALL_FONTS.length + " faces"}</p>
    </section>

    <section class="exports">
      ${svgExportable ? `<button class="primary" id="expSVG">Export SVG</button>` : ""}
      <button class="${svgExportable ? "ghost" : "primary"}" id="expPNG">${e.kind === "live" ? "⤓ Freeze frame" : "PNG"}</button>
      ${e.kind === "live" ? `<button class="ghost" id="expGIF">◉ Record GIF</button>` : ""}
    </section>`;
  wire();
}

function wire() {
  const e = engine();
  document.querySelectorAll("[data-engine]").forEach((b) => b.onclick = () => { state.engineId = b.dataset.engine; renderAll(); });

  // engine-specific custom controls (e.g. Letter weave's string + per-letter chips)
  if (e.wireControls) e.wireControls(document.getElementById("controls"), state.params[e.id], { redraw: () => updateMark() });

  document.querySelectorAll("[data-param]").forEach((inp) => inp.oninput = () => {
    const val = inp.type === "checkbox" ? (inp.checked ? 1 : 0) : (inp.tagName === "SELECT" || inp.type === "color" || inp.type === "text") ? inp.value : Number(inp.value);
    state.params[e.id][inp.dataset.param] = val;
    if (inp.type === "range") { const em = inp.parentElement.querySelector("em"); if (em) em.textContent = inp.value; }
    if (inp.type === "color") { const cd = inp.parentElement.querySelector("code"); if (cd) cd.textContent = inp.value; }
    updateMark();
  });

  // palette editor
  document.querySelectorAll("[data-accent]").forEach((inp) => inp.oninput = () => {
    state.custom.accents[+inp.dataset.accent] = inp.value; state.register = "custom";
    const t = inp.parentElement.querySelector(".hexin"); if (t) t.value = inp.value;
    updateMark(); renderWordmark(); markCustom();
  });
  document.querySelectorAll("[data-accenthex]").forEach((inp) => inp.oninput = () => {
    const v = normHex(inp.value); if (!v) return;                 // wait for a complete, valid hex
    state.custom.accents[+inp.dataset.accenthex] = v; state.register = "custom";
    const sw = inp.parentElement.querySelector("[data-accent]"); if (sw) sw.value = v;
    updateMark(); renderWordmark(); markCustom();
  });
  document.querySelectorAll("[data-rmaccent]").forEach((b) => b.onclick = () => {
    if (state.custom.accents.length <= 1) return;
    state.custom.accents.splice(+b.dataset.rmaccent, 1); state.register = "custom"; renderControls(); updateMark();
  });
  const add = document.getElementById("addAccent");
  if (add) add.onclick = () => { state.custom.accents.push("#888888"); state.register = "custom"; renderControls(); updateMark(); };
  const cg = document.getElementById("cGround"), cgh = document.getElementById("cGroundHex");
  if (cg) cg.oninput = () => { state.custom.ground = cg.value; state.register = "custom"; if (cgh) cgh.value = cg.value; updateMark(); renderWordmark(); markCustom(); };
  if (cgh) cgh.oninput = () => { const v = normHex(cgh.value); if (!v) return; state.custom.ground = v; state.register = "custom"; if (cg) cg.value = v; updateMark(); renderWordmark(); markCustom(); };
  const ci = document.getElementById("cInk"), cih = document.getElementById("cInkHex");
  if (ci) ci.oninput = () => { state.custom.ink = ci.value; state.register = "custom"; if (cih) cih.value = ci.value; updateMark(); renderWordmark(); markCustom(); };
  if (cih) cih.oninput = () => { const v = normHex(cih.value); if (!v) return; state.custom.ink = v; state.register = "custom"; if (ci) ci.value = v; updateMark(); renderWordmark(); markCustom(); };
  document.querySelectorAll("[data-load]").forEach((b) => b.onclick = () => {
    const pal = PALETTES[b.dataset.load].swatches.map((s) => s.hex);
    state.custom.accents = pal.filter((h) => h.toLowerCase() !== "#ece6e4");
    state.register = "custom"; renderAll();
  });
  document.querySelectorAll("[data-register]").forEach((b) => b.onclick = () => { state.register = b.dataset.register; renderAll(); });
  document.querySelectorAll("[data-season]").forEach((b) => b.onclick = () => { state.register = "season"; state.seasonKey = b.dataset.season; renderAll(); });

  const regen = document.getElementById("regen"); if (regen) regen.onclick = () => { state.seed = Math.floor(Math.random() * 99999); updateMark(); };
  const clear = document.getElementById("clearData"); if (clear) clear.onclick = () => { if (e.interactive === "draw") state.data[e.id].strokes = []; if (e.interactive === "points") state.data[e.id].points = []; updateMark(); };

  const bw = document.getElementById("bwToggle"); if (bw) bw.onchange = () => { state.bw = bw.checked; renderControls(); updateMark(); renderWordmark(); };
  const bwi = document.getElementById("bwInvert"); if (bwi) bwi.onchange = () => { state.bwInvert = bwi.checked; updateMark(); renderWordmark(); };

  const wm = document.getElementById("wmToggle"); if (wm) wm.onchange = () => { state.showWordmark = wm.checked; renderWordmark(); };
  const wt = document.getElementById("wmText"); if (wt) wt.oninput = () => { state.wordmark = wt.value || " "; renderWordmark(); };
  const fontSel = document.getElementById("fontSel"); if (fontSel) fontSel.onchange = () => {
    const v = fontSel.value;
    if (v.startsWith("cur:")) {
      const f = CURATED.find((x) => x.id === v.slice(4));
      if (f) state.font = { name: f.label, css: f.css, weight: f.weight, italic: f.italic, instance: f.instance, curated: true, id: f.id };
    } else state.font = ALL_FONTS.find((f) => f.name === v);
    renderControls(); renderWordmark(); updateMark();   // live engines (Letter weave) read the selected face
  };

  const eSVG = document.getElementById("expSVG"); if (eSVG) eSVG.onclick = () => exportComposition("svg");
  const ePNG = document.getElementById("expPNG"); if (ePNG) ePNG.onclick = () => exportComposition("png");
  const eGIF = document.getElementById("expGIF"); if (eGIF) eGIF.onclick = () => recordGifExport(eGIF);
}

// Record the live mark's motion to a looping GIF (the SVG engines are static).
let gifBusy = false;
async function recordGifExport(btn) {
  if (gifBusy || !controller || !controller.snapshotCanvas) return;
  gifBusy = true;
  const label = btn.textContent; btn.disabled = true;
  const c = ctx();
  try {
    const { recordGif } = await import("./gifExport.js");
    const blob = await recordGif({
      getCanvas: () => controller.snapshotCanvas(),
      ground: c.ground,
      onProgress: (p) => { btn.textContent = `Recording… ${Math.round(p * 100)}%`; },
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `the-fold-${state.engineId}-${state.seed}.gif`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    btn.textContent = "✓ Saved GIF";
    setTimeout(() => { btn.textContent = label; }, 1400);
  } catch (err) {
    console.error("GIF export failed", err);
    alert("GIF export failed: " + (err && err.message ? err.message : err));
    btn.textContent = label;
  }
  btn.disabled = false; gifBusy = false;
}

function markCustom() { const t = document.querySelector(".tag"); if (t) t.classList.add("on"); }
// Accept "#abc", "abc", "#aabbcc", "aabbcc" (any case) → "#aabbcc", else null (incomplete input).
function normHex(s) {
  let h = String(s).trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(h)) h = h.split("").map((c) => c + c).join("");
  return /^[0-9a-fA-F]{6}$/.test(h) ? "#" + h.toLowerCase() : null;
}
function renderAll() { renderControls(); mountStage(); }

renderAll();

// load the curated shortlist, then add it to the wordmark picker
loadCurated().then((c) => { CURATED = c.faces; if (CURATED.length) renderControls(); });

// ---- tab switching: Studio | Curated | Type lab ----------------------------
const VIEWS = { studio: "studioView", curated: "curatedView", fontlab: "fontlabView" };
const inited = {};
function showView(view) {
  document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("on", x.dataset.view === view));
  Object.entries(VIEWS).forEach(([k, id]) => { document.getElementById(id).hidden = k !== view; });
  if (view === "studio") { mountStage(); }
  else if (controller) { controller.destroy(); controller = null; } // pause studio animation
  if (view === "curated" && !inited.curated) { inited.curated = true; import("./curated.js").then((m) => m.init(document.getElementById("curatedView"))); }
  if (view === "fontlab" && !inited.fontlab) { inited.fontlab = true; import("./fontlab.js").then((m) => m.init(document.getElementById("fontlabView"))); }
}
document.querySelectorAll(".tab").forEach((b) => b.onclick = () => showView(b.dataset.view));

// "Use in wordmark" from the Curated tab -> set the Studio's wordmark font
window.addEventListener("fold:useFont", (e) => {
  const f = e.detail;
  state.font = { name: f.label, css: f.css, weight: f.weight, italic: f.italic, instance: f.instance, curated: true, id: f.id };
  showView("studio");
  renderControls(); renderWordmark();
});
