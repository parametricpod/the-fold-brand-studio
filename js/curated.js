// curated.js — "Curated" tab. Shows Jasper's shortlist grouped by role, each face
// rendered large in its real (trial) font with a secondary specimen and metadata.
// "Use in wordmark" sends the face to the Studio (via a custom event) and switches tab.
import { loadCurated, varCss } from "./curatedData.js";

let sample = "THE FOLD";
const ROLE_ORDER = ["display", "body", "mono", "accent"];
const ROLE_LABEL = { display: "Display", body: "Body / Text", mono: "Mono", accent: "Accent" };
const SECONDARY = "The quick brown fox 0123456789 — &?!";

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

function styleFor(f) {
  // f.id is a bare CSS identifier — safe unquoted inside a style="" attribute
  return `font-family:${f.id},serif;font-weight:${f.weight};font-style:${f.italic ? "italic" : "normal"};${f.instance ? `font-variation-settings:${varCss(f.instance)};` : ""}`;
}

function card(f, i) {
  const inst = f.instance ? " · " + Object.entries(f.instance).map(([t, v]) => `${t} ${v}`).join(" ") : "";
  return `<div class="cur-card">
    <div class="cur-prev" style="${styleFor(f)}">${sample}</div>
    <div class="cur-second" style="${styleFor(f)}">${SECONDARY}</div>
    <div class="cur-meta">
      <div class="cur-fam">${f.family} <span class="cur-style">${f.style}</span></div>
      <div class="cur-sub">${f.foundry} · ${f.weight}${f.italic ? " · italic" : ""}${f.variable ? " · variable" : ""}${inst}</div>
    </div>
    <button class="cur-use" data-use="${i}">Use in wordmark →</button>
  </div>`;
}

function render(host, faces) {
  const groups = ROLE_ORDER.filter((r) => faces.some((f) => f.role === r));
  host.innerHTML = `
    <div class="cur-bar">
      <input id="cur-sample" class="fl-input" value="${sample}" title="Preview text" />
      <span class="cur-count">${faces.length} faces · ${new Set(faces.map((f) => f.family)).size} families</span>
      <span class="cur-hint">Trial — license before production · refine in Type&nbsp;lab</span>
    </div>
    <div class="cur-body">
      ${groups.map((role) => `
        <section class="cur-group">
          <h3 class="cur-role">${ROLE_LABEL[role]}</h3>
          <div class="cur-grid">${faces.map((f, i) => [f, i]).filter(([f]) => f.role === role).map(([f, i]) => card(f, i)).join("")}</div>
        </section>`).join("")}
    </div>`;

  host.querySelector("#cur-sample").oninput = (e) => {
    sample = e.target.value || " ";
    host.querySelectorAll(".cur-prev").forEach((p) => (p.textContent = sample));
  };
  host.querySelectorAll("[data-use]").forEach((b) => b.onclick = () => {
    const f = faces[+b.dataset.use];
    window.dispatchEvent(new CustomEvent("fold:useFont", { detail: f }));
  });
}
