// curated.js — "Curated" tab. A clean single-column type tester: each shortlisted
// face renders the entered text and nothing else, at one global size. Variable
// faces get per-axis sliders. "Use in wordmark" sends the face (with its current
// instance) to the Studio.
import { loadCurated, varCss } from "./curatedData.js";

let sample = "THE FOLD";
let size = 72;
const curVar = {};                       // face.id -> { axisTag: value }
const AXIS_LABEL = { wght: "Weight", wdth: "Width", slnt: "Slant", opsz: "Optical", ital: "Italic",
  GRAD: "Grade", CNTR: "Contrast", MONO: "Mono", CASL: "Casual", INKT: "Ink trap", BULL: "Bullet", ROND: "Round" };
const ROLE_ORDER = ["display", "body", "mono", "accent"];
const ROLE_LABEL = { display: "Display", body: "Body / Text", mono: "Mono", accent: "Accent" };

export async function init(host) {
  host.innerHTML = `<div class="cur-loading">Loading curated fonts…</div>`;
  const data = await loadCurated();
  if (!data.ok || !data.faces.length) { host.innerHTML = emptyState(); return; }
  render(host, data.faces);
}

function emptyState() {
  return `<div class="cur-empty">
    <h2>Curated</h2>
    <p>Your shortlist loads from <code>curated-fonts.json</code> using the local trial-font files (gitignored, not published).</p>
    <p>Run the studio locally to see it:</p>
    <pre>cd brand-studio && python3 -m http.server 8731</pre>
    <p>Refine the list in the <strong>Type lab</strong> tab, export, and replace <code>curated-fonts.json</code>.</p>
  </div>`;
}

function defaults(f) {
  const d = {};
  for (const [t, a] of Object.entries(f.axes || {})) d[t] = a[1];
  return Object.assign(d, f.instance || {});
}
function fvs(f) {
  return f.variable && curVar[f.id] ? `font-variation-settings:${varCss(curVar[f.id])};` : "";
}
function styleFor(f) {
  return `font-family:${f.id},serif;font-weight:${f.weight};font-style:${f.italic ? "italic" : "normal"};${fvs(f)}`;
}

function axisRow(f) {
  if (!f.variable || !f.axes || !Object.keys(f.axes).length) return "";
  const sliders = Object.entries(f.axes).map(([tag, [mn, df, mx]]) => {
    const v = curVar[f.id][tag] != null ? curVar[f.id][tag] : df;
    const step = (mx - mn) >= 20 ? 1 : (mx - mn) >= 2 ? 0.5 : 0.05;
    return `<span class="cur-ax"><b>${AXIS_LABEL[tag] || tag}</b>
      <input type="range" data-axis="${tag}" data-fid="${f.id}" min="${mn}" max="${mx}" step="${step}" value="${v}">
      <i class="cur-axv">${v}</i></span>`;
  }).join("");
  return `<div class="cur-axes">${sliders}</div>`;
}

function row(f, i) {
  if (f.variable && !curVar[f.id]) curVar[f.id] = defaults(f);
  return `<div class="cur-row" data-fid="${f.id}">
    <div class="cur-prev" style="${styleFor(f)}">${escapeHtml(sample)}</div>
    <div class="cur-foot">
      <span class="cur-label">${f.family} <i>${f.style}</i> · ${f.foundry}</span>
      ${axisRow(f)}
      <button class="cur-use" data-use="${i}">Use in wordmark →</button>
    </div>
  </div>`;
}

function render(host, faces) {
  const groups = ROLE_ORDER.filter((r) => faces.some((f) => f.role === r));
  host.innerHTML = `
    <div class="cur-bar">
      <input id="cur-sample" class="fl-input" value="${escapeAttr(sample)}" placeholder="Type to preview…" />
      <label class="cur-size"><span>Size</span>
        <input type="range" id="cur-size" min="18" max="220" value="${size}"><i id="cur-sizev">${size}</i></label>
      <span class="cur-hint">Trial — license before production · refine in Type&nbsp;lab</span>
    </div>
    <div class="cur-list" id="cur-list" style="--cur-size:${size}px">
      ${groups.map((role) => `<div class="cur-rolebar">${ROLE_LABEL[role]}</div>` +
        faces.map((f, i) => [f, i]).filter(([f]) => f.role === role).map(([f, i]) => row(f, i)).join("")).join("")}
    </div>`;

  const list = host.querySelector("#cur-list");

  host.querySelector("#cur-sample").oninput = (e) => {
    sample = e.target.value;
    host.querySelectorAll(".cur-prev").forEach((p) => (p.textContent = sample));
  };
  host.querySelector("#cur-size").oninput = (e) => {
    size = +e.target.value;
    host.querySelector("#cur-sizev").textContent = size;
    list.style.setProperty("--cur-size", size + "px");
  };

  list.addEventListener("input", (e) => {
    const ax = e.target.closest("[data-axis]");
    if (!ax) return;
    const fid = ax.dataset.fid, tag = ax.dataset.axis;
    (curVar[fid] = curVar[fid] || {})[tag] = Number(ax.value);
    ax.parentElement.querySelector(".cur-axv").textContent = ax.value;
    const prev = list.querySelector(`.cur-row[data-fid="${fid}"] .cur-prev`);
    if (prev) prev.style.fontVariationSettings = varCss(curVar[fid]);
  });

  list.querySelectorAll("[data-use]").forEach((b) => b.onclick = () => {
    const f = faces[+b.dataset.use];
    const instance = f.variable ? (curVar[f.id] || defaults(f)) : f.instance;
    window.dispatchEvent(new CustomEvent("fold:useFont", { detail: { ...f, instance } }));
  });
}

const escapeHtml = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])) || "&nbsp;";
const escapeAttr = (s) => s.replace(/"/g, "&quot;");
