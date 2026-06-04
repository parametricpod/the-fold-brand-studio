# The Fold — Brand Studio

A live, generative studio for exploring The Fold's brand identity: dial fonts,
colors, and parametric marks together — geometric *and* organic, in one place.

Built for the Jubilee Studio brand sprint as an exploratory tool the whole team
can use to *see* directions instead of only describing them.

## What it does

Six mark engines, all driven by real brand data (both palettes from the creative
brief, OFL display faces, the dual exterior/interior color registers):

| Engine | What it explores |
|---|---|
| **Folded surface** | A draped ribbon from pure sine math — the brief's "cloth caught in motion." |
| **Quilt block** | Flying-geese tessellation in the seasonal palette — the craft thread, parametric. |
| **Network field** | Nodes and connections — The Fold's actual purpose, as a mark. |
| **Drape lines** | The clothesline abstracted: strands hung on a line, draping through a flow field. |
| **Point fold** | *Interactive* — place anchor points, a curved surface wraps and folds around them. |
| **Hand draw** | *Interactive* — sketch a form, it's smoothed into clean organic curves (with fold-mirror). |

Every mark composes with the **THE FOLD** wordmark and exports as clean vector **SVG**
(or PNG). Colors follow the brand's two registers — exterior gold-on-black (the gilded
sign) and interior jewel tones — plus the seasonal "Line" system (structure constant,
color variable).

## Run locally

No build step. Any static server:

```bash
cd brand-studio
python3 -m http.server 8731
# open http://localhost:8731
```

## Structure

```
brand-studio/
├── index.html          # shell + Google Fonts (OFL)
├── styles.css          # UI honors the dual register (black/gold chrome, warm panel)
└── js/
    ├── brand.js        # single source of truth: palettes, fonts, seasons (from the brief)
    ├── util.js         # seeded RNG, curve smoothing, hull, SVG helpers
    ├── main.js         # app state, composition, interaction, export wiring
    ├── export.js       # SVG / PNG download
    └── engines/        # the six mark engines (one file each)
```

Colors and typography are pulled verbatim from the May 2026 Creative Brief and the
technosphere vault's `02 Brand and Voice/Color System.md`, so the tool stays faithful
to what's already been decided.
