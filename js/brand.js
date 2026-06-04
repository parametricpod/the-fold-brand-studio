// brand.js — single source of truth for The Fold's brand data.
// Palettes/typography from the May 2026 Creative Brief + technosphere vault.

export const PALETTES = {
  v1: {
    label: "JessyKate · preferred",
    swatches: [
      { name: "Orange",    hex: "#ED591D" },
      { name: "Gold",      hex: "#EEA541" },
      { name: "Green",     hex: "#73C49F" },
      { name: "Deep blue", hex: "#171D60" },
    ],
  },
  v2: {
    label: "Eileen · contrast",
    swatches: [
      { name: "Red-orange",  hex: "#ED461D" },
      { name: "Golden",      hex: "#F2B450" },
      { name: "Light green", hex: "#A8D39C" },
      { name: "Off-white",   hex: "#ECE6E4" },
      { name: "Blue",        hex: "#1DB1ED" },
      { name: "Purple",      hex: "#51225D" },
    ],
  },
};

export const EXTERIOR = { ground: "#14130F", gold: "#C8973F", goldHi: "#E8C57A" };

export const SEASONS = [
  { key: "spring", label: "Spring", accent: "#73C49F", ground: "#ECE6E4", ink: "#171D60" },
  { key: "summer", label: "Summer", accent: "#EEA541", ground: "#FBF4E9", ink: "#ED591D" },
  { key: "autumn", label: "Autumn", accent: "#ED591D", ground: "#F3E7DD", ink: "#51225D" },
  { key: "winter", label: "Winter", accent: "#1DB1ED", ground: "#EEF1F2", ink: "#171D60" },
];

// A large, curated OFL type library on Google Fonts. Grouped so the picker can
// show optgroups. The brief leans high-contrast serif/display + characterful;
// industrial/condensed and a few grotesques are included for range. Avoid the
// generic-geometric-sans "WeWork" zone — none of those are here.
export const FONTS = {
  groups: [
    { group: "High-contrast serif", faces: [
      { name: "Fraunces",          weight: 600 },
      { name: "Playfair Display",  weight: 700 },
      { name: "Bodoni Moda",       weight: 700 },
      { name: "DM Serif Display",  weight: 400 },
      { name: "Abril Fatface",     weight: 400 },
      { name: "Cormorant Garamond",weight: 600 },
      { name: "Prata",             weight: 400 },
      { name: "Rozha One",         weight: 400 },
      { name: "Gilda Display",     weight: 400 },
      { name: "Italiana",          weight: 400 },
    ]},
    { group: "Display & character", faces: [
      { name: "Instrument Serif",  weight: 400 },
      { name: "Marcellus",         weight: 400 },
      { name: "Yeseva One",        weight: 400 },
      { name: "Bona Nova SC",      weight: 700 },
      { name: "Redaction",         weight: 400 },
      { name: "Cardo",             weight: 700 },
      { name: "Spectral",          weight: 600 },
      { name: "Newsreader",        weight: 500 },
    ]},
    { group: "Industrial & condensed", faces: [
      { name: "Big Shoulders Display", weight: 700 },
      { name: "Anton",             weight: 400 },
      { name: "Oswald",            weight: 600 },
      { name: "Archivo Black",     weight: 400 },
      { name: "Bebas Neue",        weight: 400 },
      { name: "Saira Condensed",   weight: 700 },
    ]},
    { group: "Solarpunk & edge", faces: [
      { name: "Space Grotesk",     weight: 600 },
      { name: "Syne",              weight: 700 },
      { name: "Unbounded",         weight: 600 },
      { name: "UnifrakturCook",    weight: 700 },
      { name: "Monoton",           weight: 400 },
      { name: "Silkscreen",        weight: 400 },
    ]},
  ],
};

// Flat list with usable css family strings.
export const ALL_FONTS = FONTS.groups.flatMap((g) =>
  g.faces.map((f) => ({ ...f, group: g.group, css: `'${f.name}', serif` }))
);

// Inject the Google Fonts stylesheet for the whole library. Plain family names
// (default weights) keep the request resilient — every face here ships a regular.
export function loadFonts() {
  const families = ALL_FONTS.map((f) => `family=${f.name.replace(/ /g, "+")}:wght@${f.weight}`).join("&");
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
  document.head.appendChild(link);
}

// Default editable custom palette — seeded from the preferred (v1) palette, with
// the brand's cream ground and deep-blue ink, so the editor opens on-brand.
export const DEFAULT_CUSTOM = {
  accents: ["#ED591D", "#EEA541", "#73C49F", "#171D60"],
  ground: "#ECE6E4",
  ink: "#171D60",
};
