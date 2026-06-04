// curatedData.js — loads the curated shortlist (curated-fonts.json), injects an
// @font-face per face, and exposes a flat list. Shared by the Curated tab and the
// Studio wordmark picker so a pick renders identically in both. Files are local
// (gitignored trials); on the public deploy this resolves empty and degrades.

let cache = null;
const done = new Set();

export async function loadCurated() {
  if (cache) return cache;
  try {
    const r = await fetch("curated-fonts.json", { cache: "no-store" });
    if (!r.ok) throw new Error("no curated config");
    const data = await r.json();
    const faces = [];
    data.selections.forEach((sel, si) => sel.faces.forEach((fc, fi) => {
      const id = `cur_${si}_${fi}`;
      injectFace(id, fc);
      faces.push({
        id, css: `"${id}"`, family: sel.family, foundry: sel.foundry, role: sel.role,
        weight: fc.weight, style: fc.style, italic: fc.italic, variable: fc.variable,
        instance: fc.instance || null, axes: sel.axes || {},
        label: `${sel.family} · ${fc.style}`,
      });
    }));
    cache = { faces, selections: data.selections, ok: true };
  } catch (e) {
    cache = { faces: [], selections: [], ok: false };
  }
  return cache;
}

function injectFace(id, fc) {
  if (done.has(id)) return; done.add(id);
  const fmt = fc.format === "woff2" ? "woff2" : fc.format === "woff" ? "woff" : fc.format === "otf" ? "opentype" : "truetype";
  const wght = fc.variable ? "100 1000" : fc.weight;
  const style = fc.italic ? "italic" : "normal";
  const css = `@font-face{font-family:"${id}";src:url("${fc.file}") format("${fmt}");font-weight:${wght};font-style:${style};font-display:swap}`;
  const s = document.createElement("style"); s.textContent = css; document.head.appendChild(s);
}

// single-quoted axis tags so this is safe inside an HTML style="" attribute too
export const varCss = (inst) => (inst ? Object.entries(inst).map(([t, v]) => `'${t}' ${v}`).join(", ") : "");
