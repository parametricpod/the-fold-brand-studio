// fontlab.js — "Type lab" tab. Loads locally-scanned trial fonts (fonts-manifest.json,
// gitignored) and lets Jasper audit every face, pick the keepers with weight/style,
// tag a role, and export a JSON config for the final (licensed) build. Fonts are
// lazy-loaded via IntersectionObserver so 1800+ faces don't crater the browser.

let MANIFEST = null;
const selected = new Set();          // keys "famId::faceIdx"
const roles = {};                    // famId -> role
let sampleText = "THE FOLD";
const fileToCss = new Map();         // font file -> the @font-face family id it was loaded under
let io = null;
let faceCounter = 0;

// strip trial/marketing tokens as whole words only (so "Variable" survives)
const STRIP = /\s*\b(?:Unlicensed\s+Trial|Trial|TRIAL|Demo|VF|VAR|Test)\b\s*/gi;
const clean = (s) => s.replace(STRIP, " ").replace(/\s+/g, " ").replace(/[-–\s]+$/, "").trim() || s;

// variable-font axis state: face key -> { axisTag: value }
const varSettings = {};
const AXIS_LABEL = { wght: "Weight", wdth: "Width", slnt: "Slant", opsz: "Optical", ital: "Italic",
  GRAD: "Grade", CNTR: "Contrast", MONO: "Mono", CASL: "Casual", INKT: "Ink trap", BULL: "Bullet",
  ROND: "Round", soft: "Soft", SOFT: "Soft", YTAS: "Ascender", XTRA: "Width" };
const defaultsFrom = (axes) => Object.fromEntries(Object.entries(axes).map(([t, a]) => [t, a[1]]));
const varCss = (s) => Object.entries(s).map(([t, v]) => `'${t}' ${v}`).join(", ");

function axisBlock(key, axes) {
  const rows = Object.entries(axes).map(([tag, [mn, df, mx]]) => {
    const v = (varSettings[key] && varSettings[key][tag] != null) ? varSettings[key][tag] : df;
    const step = (mx - mn) >= 20 ? 1 : (mx - mn) >= 2 ? 0.5 : 0.05;
    return `<div class="vaxis"><span class="vaxis-tag" title="${tag}">${AXIS_LABEL[tag] || tag}</span>
      <input type="range" data-vaxis="${tag}" data-key="${key}" min="${mn}" max="${mx}" step="${step}" value="${v}">
      <span class="vaxis-val">${v}</span></div>`;
  }).join("");
  return `<div class="vaxes" data-vaxes="${key}">${rows}</div>`;
}

function applyVar(key) {
  const s = varSettings[key]; if (!s) return;
  const css = varCss(s);
  const label = document.querySelector(`.face[data-key="${key}"]`);
  if (!label) return;
  const fp = label.querySelector(".face-prev"); if (fp) fp.style.fontVariationSettings = css;
  const fam = label.closest(".fam"); const famp = fam && fam.querySelector(".fam-prev");
  if (famp) famp.style.fontVariationSettings = css;
}

function guessRole(family) {
  const f = family.toLowerCase();
  if (f.includes("mono")) return "mono";
  if (/(display|sectra|canon|pantheon|super|ultra|maru|alpina|era display|eesti display|flaire|reckless)/.test(f)) return "display";
  return "body";
}

export async function init(host) {
  host.innerHTML = `<div class="fl-loading">Loading local trial fonts…</div>`;
  try {
    const res = await fetch("fonts-manifest.json", { cache: "no-store" });
    if (!res.ok) throw new Error("no manifest");
    MANIFEST = await res.json();
  } catch (e) {
    host.innerHTML = emptyState();
    return;
  }
  // drop malformed families (no letters in the name, e.g. a "." family)
  MANIFEST.families = MANIFEST.families.filter((f) => /[A-Za-z]/.test(f.family));
  MANIFEST.count_families = MANIFEST.families.length;
  MANIFEST.count_faces = MANIFEST.families.reduce((n, f) => n + f.faces.length, 0);
  MANIFEST.families.forEach((fam) => { roles[fam.id] = guessRole(fam.family); });
  io = new IntersectionObserver(onIntersect, { root: host, rootMargin: "300px" });
  render(host);
}

function emptyState() {
  return `<div class="fl-empty">
    <h2>Type lab</h2>
    <p>This tab loads <strong>trial fonts from your local <code>/fonts</code> folder</strong>, which is kept out of git (trial licenses must not be published).</p>
    <p>To populate it, drop the foundry trial folders in <code>~/Downloads</code> and run the scan script:</p>
    <pre>cd brand-studio && python3 scan-fonts.py</pre>
    <p>Then reload. You'll get every face here to audit, pick, and export as a JSON config.</p>
  </div>`;
}

function render(host) {
  const foundries = [...new Set(MANIFEST.families.map((f) => f.foundry))];
  host.innerHTML = `
    <div class="fl-bar">
      <div class="fl-bar-row">
        <input id="fl-search" class="fl-input" placeholder="Search families…" />
        <input id="fl-sample" class="fl-input" value="${sampleText}" title="Preview text" />
        <span class="fl-count"><b id="fl-n">0</b> faces selected</span>
        <button class="fl-btn primary" id="fl-export">Export JSON</button>
        <button class="fl-btn" id="fl-copy">Copy</button>
        <button class="fl-btn ghost" id="fl-clear">Clear</button>
      </div>
      <div class="fl-foundries">
        <button class="fchip on" data-foundry="*">All</button>
        ${foundries.map((f) => `<button class="fchip" data-foundry="${f}">${f}</button>`).join("")}
        <span class="fl-meta">${MANIFEST.count_families} families · ${MANIFEST.count_faces} faces · trial</span>
      </div>
    </div>
    <div class="fl-list" id="fl-list">${MANIFEST.families.map(familyRow).join("")}</div>
    <div class="fl-out" id="fl-out" hidden><div class="fl-out-head"><span>JSON config</span><button class="fl-btn" id="fl-out-close">close</button></div><textarea id="fl-json" readonly></textarea></div>`;
  wire(host);
  observePreviews(host);
}

function familyRow(fam) {
  const name = clean(fam.family);
  const varTag = fam.variable ? `<span class="vtag">VAR ${Object.keys(fam.axes).join(",")}</span>` : "";
  return `<div class="fam" data-fam="${fam.id}" data-name="${name.toLowerCase()}" data-foundry="${fam.foundry}">
    <div class="fam-head">
      <button class="caret" data-expand="${fam.id}">▸</button>
      <div class="fam-id">
        <div class="fam-name">${name} ${varTag}</div>
        <div class="fam-sub">${fam.foundry} · ${fam.faces.length} ${fam.faces.length === 1 ? "face" : "faces"}</div>
      </div>
      <div class="fam-prev tl-prev" data-file="${fam.faces[Math.floor(fam.faces.length / 2)].file}"
           data-wght="${fam.variable ? (fam.axes.wght ? fam.axes.wght[1] : 400) : fam.faces[Math.floor(fam.faces.length/2)].weight}"
           data-var="${fam.variable ? 1 : 0}"${fam.variable && Object.keys(fam.axes).length ? ` style="font-variation-settings:${varCss(defaultsFrom(fam.axes))}"` : ""}>${sampleText}</div>
      <select class="fam-role" data-role="${fam.id}">
        ${["display", "body", "mono", "accent", "skip"].map((r) => `<option value="${r}" ${roles[fam.id] === r ? "selected" : ""}>${r}</option>`).join("")}
      </select>
      <label class="fam-all"><input type="checkbox" data-all="${fam.id}"><span>all</span></label>
    </div>
    <div class="fam-faces" data-faces="${fam.id}" hidden></div>
  </div>`;
}

function faceRows(fam) {
  return fam.faces.map((fc, i) => {
    const key = `${fam.id}::${i}`;
    // the style name usually already carries "Italic" — only add it if missing
    const styleLabel = clean(fc.style) + (fc.italic && !/italic|oblique/i.test(fc.style) ? " Italic" : "");
    const isVar = fc.variable && fam.axes && Object.keys(fam.axes).length;
    if (isVar && !varSettings[key]) varSettings[key] = defaultsFrom(fam.axes);
    const varStyle = isVar ? ` style="font-variation-settings:${varCss(varSettings[key])}"` : "";
    const row = `<label class="face ${selected.has(key) ? "sel" : ""}" data-key="${key}">
      <input type="checkbox" data-face="${key}" ${selected.has(key) ? "checked" : ""}>
      <span class="face-w">${fc.variable ? "VAR" : fc.weight}</span>
      <span class="face-s">${styleLabel}${fc.variable ? " · variable" : ""}</span>
      <span class="face-prev tl-prev" data-file="${fc.file}" data-wght="${isVar ? (fam.axes.wght ? fam.axes.wght[1] : 400) : fc.weight}" data-var="${fc.variable ? 1 : 0}" data-italic="${fc.italic ? 1 : 0}"${varStyle}>${sampleText}</span>
    </label>`;
    return isVar ? row + axisBlock(key, fam.axes) : row;
  }).join("");
}

// ---- lazy font loading -----------------------------------------------------
function observePreviews(scope) {
  scope.querySelectorAll(".tl-prev:not([data-loaded])").forEach((el) => io.observe(el));
}
function onIntersect(entries) {
  for (const en of entries) {
    if (!en.isIntersecting) continue;
    const el = en.target; io.unobserve(el);
    const file = el.dataset.file;
    // reuse the family id if this file was already loaded (e.g. the family preview
    // and that same face's row share a file) — otherwise inject a fresh @font-face.
    let id = fileToCss.get(file);
    if (!id) {
      id = "tl" + (faceCounter++);
      fileToCss.set(file, id);
      const fmt = file.endsWith(".woff2") ? "woff2" : file.endsWith(".woff") ? "woff" : file.endsWith(".otf") ? "opentype" : "truetype";
      const wght = el.dataset.var === "1" ? "100 900" : (el.dataset.wght || "400");
      const style = el.dataset.italic === "1" ? "italic" : "normal";
      const css = `@font-face{font-family:"${id}";src:url("${file}") format("${fmt}");font-weight:${wght};font-style:${style};font-display:swap}`;
      const s = document.createElement("style"); s.textContent = css; document.head.appendChild(s);
    }
    el.style.fontFamily = `"${id}", serif`;
    if (el.dataset.var === "1" && el.dataset.wght) el.style.fontWeight = el.dataset.wght;
    el.dataset.loaded = "1";
  }
}

// ---- interaction -----------------------------------------------------------
function wire(host) {
  const list = host.querySelector("#fl-list");

  host.querySelector("#fl-search").oninput = (e) => {
    const q = e.target.value.toLowerCase();
    list.querySelectorAll(".fam").forEach((f) => {
      f.style.display = (f.dataset.name.includes(q) || f.dataset.foundry.toLowerCase().includes(q)) ? "" : "none";
    });
  };
  host.querySelector("#fl-sample").oninput = (e) => {
    sampleText = e.target.value || " ";
    host.querySelectorAll(".tl-prev").forEach((p) => (p.textContent = sampleText));
  };
  host.querySelectorAll("[data-foundry]").forEach((b) => b.onclick = () => {
    host.querySelectorAll("[data-foundry].fchip").forEach((x) => x.classList.remove("on"));
    b.classList.add("on");
    const f = b.dataset.foundry;
    list.querySelectorAll(".fam").forEach((fam) => { fam.style.display = (f === "*" || fam.dataset.foundry === f) ? "" : "none"; });
  });

  list.addEventListener("click", (e) => {
    const exp = e.target.closest("[data-expand]");
    if (exp) {
      const id = exp.dataset.expand;
      const fam = MANIFEST.families.find((x) => x.id === id);
      const box = list.querySelector(`[data-faces="${id}"]`);
      if (box.hidden) {
        if (!box.dataset.built) {
          box.innerHTML = faceRows(fam); box.dataset.built = "1"; observePreviews(box);
          fam.faces.forEach((fc, i) => { if (fc.variable) applyVar(`${fam.id}::${i}`); });
        }
        box.hidden = false; exp.textContent = "▾";
      } else { box.hidden = true; exp.textContent = "▸"; }
    }
  });

  list.addEventListener("input", (e) => {
    const ax = e.target.closest("[data-vaxis]");
    if (!ax) return;
    const key = ax.dataset.key, tag = ax.dataset.vaxis;
    (varSettings[key] = varSettings[key] || {})[tag] = Number(ax.value);
    const val = ax.parentElement.querySelector(".vaxis-val"); if (val) val.textContent = ax.value;
    applyVar(key);
  });

  list.addEventListener("change", (e) => {
    const all = e.target.closest("[data-all]");
    if (all) {
      const id = all.dataset.all;
      const fam = MANIFEST.families.find((x) => x.id === id);
      fam.faces.forEach((_, i) => { const k = `${id}::${i}`; all.checked ? selected.add(k) : selected.delete(k); });
      const box = list.querySelector(`[data-faces="${id}"]`);
      if (box.dataset.built) box.querySelectorAll("[data-face]").forEach((cb) => { cb.checked = all.checked; cb.closest(".face").classList.toggle("sel", all.checked); });
      updateCount(host); return;
    }
    const face = e.target.closest("[data-face]");
    if (face) {
      const k = face.dataset.face;
      face.checked ? selected.add(k) : selected.delete(k);
      face.closest(".face").classList.toggle("sel", face.checked);
      updateCount(host); return;
    }
    const role = e.target.closest("[data-role]");
    if (role) roles[role.dataset.role] = role.value;
  });

  host.querySelector("#fl-clear").onclick = () => {
    selected.clear();
    list.querySelectorAll("[data-face]").forEach((cb) => { cb.checked = false; cb.closest(".face").classList.remove("sel"); });
    list.querySelectorAll("[data-all]").forEach((cb) => (cb.checked = false));
    updateCount(host);
  };
  host.querySelector("#fl-export").onclick = () => showJSON(host, true);
  host.querySelector("#fl-copy").onclick = async () => {
    const json = buildJSON();
    try { await navigator.clipboard.writeText(json); flash(host.querySelector("#fl-copy"), "Copied!"); }
    catch { showJSON(host, false); }
  };
  host.querySelector("#fl-out-close").onclick = () => (host.querySelector("#fl-out").hidden = true);
}

function updateCount(host) { host.querySelector("#fl-n").textContent = selected.size; }
function flash(btn, txt) { const o = btn.textContent; btn.textContent = txt; setTimeout(() => (btn.textContent = o), 1200); }

function buildJSON() {
  const byFam = {};
  for (const key of selected) {
    const [famId, idx] = key.split("::");
    const fam = MANIFEST.families.find((x) => x.id === famId);
    const fc = fam.faces[+idx];
    const name = clean(fam.family);
    byFam[famId] = byFam[famId] || { foundry: fam.foundry, family: name, role: roles[famId], variable: fam.variable, axes: fam.axes, cssFamily: name, faces: [] };
    const face = { style: clean(fc.style), weight: fc.weight, italic: fc.italic, variable: fc.variable };
    if (fc.variable && fam.axes && Object.keys(fam.axes).length) face.instance = varSettings[key] || defaultsFrom(fam.axes);
    byFam[famId].faces.push(face);
  }
  return JSON.stringify({
    project: "The Fold",
    note: "Trial fonts — evaluation only. License & self-host the chosen faces before production. weights/styles below are the exact picks.",
    selections: Object.values(byFam),
  }, null, 2);
}

function showJSON(host, download) {
  const json = buildJSON();
  const out = host.querySelector("#fl-out");
  host.querySelector("#fl-json").value = json;
  out.hidden = false;
  if (download) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    a.download = "the-fold-fonts.json"; a.click();
  }
}
