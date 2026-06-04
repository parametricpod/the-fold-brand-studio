#!/usr/bin/env python3
"""Scan local trial-font folders, read real metadata via fontTools, dedupe
formats, copy web-ready files into ./fonts/, and emit ./fonts-manifest.json
for the Brand Studio's Type lab tab.

Trial fonts are licensed for EVALUATION ONLY — ./fonts and ./fonts-manifest.json
are gitignored and must never be published. The Type lab is a local curation
tool; its output is a JSON config of which faces to license for production.

Usage:  cd brand-studio && python3 scan-fonts.py
Requires: fontTools  (pip install fonttools)
Add foundry trial folders to ~/Downloads, then extend ROOT_NAMES below if needed.
"""
import os, re, json, shutil, glob
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
DL = os.path.join(os.path.expanduser("~"), "Downloads")
OUT_DIR = os.path.join(HERE, "fonts")
MANIFEST = os.path.join(HERE, "fonts-manifest.json")

# folder-name (under ~/Downloads) -> foundry label. Add your own here.
ROOT_NAMES = {
    "Grilli-Type-Trial-Fonts-2026-04": "Grilli Type",
    "DINAMO Trial Fonts": "Dinamo",
    "Focal_Collection": "Focal",
}
ROOTS = [(os.path.join(DL, n), label) for n, label in ROOT_NAMES.items() if os.path.isdir(os.path.join(DL, n))]
for p in glob.glob(os.path.join(DL, "DP_trial-*")):      # Displaay trials ship with a uuid suffix
    if os.path.isdir(p):
        ROOTS.append((p, "Displaay"))

EXT_RANK = {".woff2": 0, ".otf": 1, ".ttf": 2, ".woff": 3}  # prefer woff2 for the web
safe = lambda s: re.sub(r"[^A-Za-z0-9._-]", "_", s)

def read_meta(path):
    try:
        f = TTFont(path, fontNumber=0, lazy=True)
    except Exception:
        return None
    nm = f["name"]
    def n(i):
        try:
            v = nm.getDebugName(i); return v.strip() if v else None
        except Exception:
            return None
    family = n(16) or n(1) or os.path.splitext(os.path.basename(path))[0]
    style = n(17) or n(2) or "Regular"
    full = n(4) or f"{family} {style}"
    ps = n(6)
    weight, italic = 400, False
    if "OS/2" in f:
        try: weight = int(f["OS/2"].usWeightClass)
        except Exception: pass
        try: italic = bool(f["OS/2"].fsSelection & 0x01)
        except Exception: pass
    if "head" in f and not italic:
        try: italic = bool(f["head"].macStyle & 0x02)
        except Exception: pass
    if "italic" in style.lower() or "oblique" in style.lower():
        italic = True
    variable, axes = False, {}
    if "fvar" in f:
        variable = True
        for a in f["fvar"].axes:
            axes[a.axisTag] = [round(a.minValue, 1), round(a.defaultValue, 1), round(a.maxValue, 1)]
    f.close()
    return dict(family=family, style=style, full=full, ps=ps, weight=weight,
                italic=italic, variable=variable, axes=axes)

if not ROOTS:
    print("No trial folders found under ~/Downloads. Edit ROOT_NAMES in this script.")
    raise SystemExit(1)

faces = {}
for root, foundry in ROOTS:
    for dp, _, files in os.walk(root):
        for fn in files:
            ext = os.path.splitext(fn)[1].lower()
            if ext not in EXT_RANK:
                continue
            meta = read_meta(os.path.join(dp, fn))
            if not meta or not re.search(r"[A-Za-z]", meta["family"]):
                continue
            key = (foundry, meta["family"], meta["style"], meta["italic"], meta["variable"])
            faces.setdefault(key, {"foundry": foundry, "meta": meta, "files": []})
            faces[key]["files"].append((EXT_RANK[ext], os.path.join(dp, fn), ext))

os.makedirs(OUT_DIR, exist_ok=True)
for old in glob.glob(os.path.join(OUT_DIR, "*")):
    os.remove(old)

families = {}
for (foundry, family, style, italic, variable), rec in faces.items():
    rec["files"].sort()
    _, src, ext = rec["files"][0]
    meta = rec["meta"]
    base = safe(meta["ps"] or f"{family}-{style}")
    dst = f"{base}{ext}"; i = 1
    while os.path.exists(os.path.join(OUT_DIR, dst)):
        dst = f"{base}-{i}{ext}"; i += 1
    shutil.copy2(src, os.path.join(OUT_DIR, dst))
    fkey = f"{foundry} · {family}"
    fam = families.setdefault(fkey, {"foundry": foundry, "family": family, "variable": variable, "axes": meta["axes"], "faces": []})
    if variable:
        fam["variable"] = True; fam["axes"] = meta["axes"]
    fam["faces"].append({"style": style, "weight": meta["weight"], "italic": italic,
                         "variable": variable, "file": f"fonts/{dst}", "format": ext.lstrip("."),
                         "full": meta["full"], "ps": meta["ps"]})

out = []
for fkey, fam in sorted(families.items()):
    fam["faces"].sort(key=lambda x: (x["weight"], x["italic"], x["style"]))
    fam["id"] = safe(fkey)
    out.append(fam)

with open(MANIFEST, "w") as fp:
    json.dump({"families": out, "count_families": len(out),
               "count_faces": sum(len(f["faces"]) for f in out)}, fp, indent=2)
print(f"families: {len(out)}  faces: {sum(len(f['faces']) for f in out)}  ->  fonts-manifest.json")
