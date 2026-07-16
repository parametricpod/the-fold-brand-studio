// export.js — download the composed lockup as SVG (vector, recommended) or PNG.

export function downloadSVG(svgEl, filename = "the-fold-mark.svg") {
  const clone = svgEl.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  // XMLSerializer emits strict XML (self-closed tags, escaped entities) —
  // outerHTML uses HTML serialization rules, which Illustrator can reject.
  const src = '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
  triggerDownload(new Blob([src], { type: "image/svg+xml" }), filename);
}

export function downloadPNG(svgEl, filename = "the-fold-mark.png", scale = 2) {
  const clone = svgEl.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const vb = (svgEl.getAttribute("viewBox") || "0 0 1080 1200").split(/\s+/).map(Number);
  const w = vb[2], h = vb[3];
  const svgStr = new XMLSerializer().serializeToString(clone);
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgStr);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = w * scale; canvas.height = h * scale;
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, w, h);
    canvas.toBlob((blob) => triggerDownload(blob, filename), "image/png");
  };
  img.onerror = () => alert("PNG export failed — use the SVG export (vector, higher fidelity).");
  img.src = url;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
