// brand.js — single source of truth for The Fold's brand data.
// Palettes and typography pulled verbatim from the May 2026 Creative Brief
// and the technosphere vault (02 Brand and Voice/Color System.md).

export const PALETTES = {
  // Version 1 — JessyKate's colors, marked *preferred* in the brief.
  v1: {
    label: "JessyKate · preferred",
    swatches: [
      { name: "Orange",    hex: "#ED591D" },
      { name: "Gold",      hex: "#EEA541" },
      { name: "Green",     hex: "#73C49F" },
      { name: "Deep blue", hex: "#171D60" },
    ],
  },
  // Version 2 — Eileen's contrast adjustment.
  v2: {
    label: "Eileen · contrast",
    swatches: [
      { name: "Red-orange",   hex: "#ED461D" },
      { name: "Golden",       hex: "#F2B450" },
      { name: "Light green",  hex: "#A8D39C" },
      { name: "Off-white",    hex: "#ECE6E4" },
      { name: "Blue",         hex: "#1DB1ED" },
      { name: "Purple",       hex: "#51225D" },
    ],
  },
};

// The exterior register: black ground, warm gold leaf. Constant across seasons.
export const EXTERIOR = {
  ground: "#14130F",
  gold:   "#C8973F",   // warm, not yellow — references actual gold leaf
  goldHi: "#E8C57A",
};

// Seasonal "Line" system: structure constant, color is the variable.
// Each season picks an accent from the active palette's world.
export const SEASONS = [
  { key: "spring", label: "Spring", accent: "#73C49F", ground: "#ECE6E4", ink: "#171D60" },
  { key: "summer", label: "Summer", accent: "#EEA541", ground: "#FBF4E9", ink: "#ED591D" },
  { key: "autumn", label: "Autumn", accent: "#ED591D", ground: "#F3E7DD", ink: "#51225D" },
  { key: "winter", label: "Winter", accent: "#1DB1ED", ground: "#EEF1F2", ink: "#171D60" },
];

// Curated OFL typefaces. The brief asks for a high-contrast serif/display face
// with formal weight, paired with a warm readable body — "brasserie menu
// confidence, not tech startup." Everything here is Open Font License and on
// Google Fonts so the tool stays dependency-light and the team can actually use it.
export const FONTS = {
  display: [
    { name: "Fraunces",        css: "'Fraunces', serif",          note: "high-contrast 'old-style' soft serif — warmth + authority", weight: 600, gf: "Fraunces:opsz,wght@9..144,400;9..144,600;9..144,900" },
    { name: "Instrument Serif",css: "'Instrument Serif', serif",  note: "elegant high-contrast display — quiet confidence",          weight: 400, gf: "Instrument+Serif" },
    { name: "Bodoni Moda",     css: "'Bodoni Moda', serif",       note: "didone contrast — institutional, printed-menu",            weight: 700, gf: "Bodoni+Moda:opsz,wght@6..96,400;6..96,700;6..96,900" },
    { name: "Big Shoulders",   css: "'Big Shoulders Display', sans-serif", note: "condensed industrial display — signage energy",   weight: 700, gf: "Big+Shoulders+Display:wght@400;700;900" },
    { name: "Redaction",       css: "'Redaction', serif",         note: "degraded printed quality — craft + edge",                  weight: 400, gf: "Redaction:wght@400;700" },
    { name: "Unifraktur",      css: "'UnifrakturCook', cursive",  note: "blackletter nod to the existing gilded sign",              weight: 700, gf: "UnifrakturCook:wght@700" },
  ],
  body: [
    { name: "Geist",     css: "'Geist', sans-serif",     note: "the brief's pick — expansive, neutral, modern", weight: 400, gf: "Geist:wght@300;400;500;700" },
    { name: "Newsreader",css: "'Newsreader', serif",     note: "warm reading serif — long-form interior copy",  weight: 400, gf: "Newsreader:opsz,wght@6..72,400;6..72,500" },
    { name: "Fraunces",  css: "'Fraunces', serif",       note: "pairs display+body in one superfamily",         weight: 400, gf: null },
  ],
};

// A small helper to build the Google Fonts <link> URL from the sets above.
export function googleFontsHref() {
  const families = new Set();
  for (const f of [...FONTS.display, ...FONTS.body]) {
    if (f.gf) families.add(f.gf);
  }
  const params = [...families].map((f) => `family=${f}`).join("&");
  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}
