// TEMPLATE SHELVES — which gallery shelf (tab) a frame pack belongs on. Shared by
// the Templates page, the Create screen and the admin screens, so all three
// group packs identically.

// The two orientation groups, presented as side-by-side TABS rather than two
// stacked sections. Stacking buried the 9:16 packs under ~56 widescreen cards, and
// true side-by-side COLUMNS would be worse: the split is heavily lopsided, so one
// column would run for pages while the other sat nearly empty. Tabs put the two
// options next to each other while each grid still gets the full page width.
// Exported so the Create screen can present the SAME split — a merged grid there
// mixed 9:16 packs into a widescreen brief and vice versa.
export const ORIENTATIONS = [
  {
    key: "horizontal", tagc: "#e832a8", label: "Horizontal", ratio: "16:9", portrait: false,
    title: "Widescreen", blurb: "Landscape films for sites, product demos, YouTube and ads.",
    min: 310,
  },
  {
    key: "vertical", tagc: "#7a5cff", label: "Vertical", ratio: "9:16", portrait: true,
    title: "Reels & Stories", blurb: "Portrait-native packs built for Reels, Shorts, TikTok and Stories.",
    min: 230,
  },
  {
    key: "longform", tagc: "#b9f24a", label: "Long Form Video", ratio: "16:9", portrait: false,
    title: "Long Form", blurb: "Packs authored for 2–5 minute films — dozens of distinct beats, built to hold attention past the 30-second mark.",
    min: 310,
  },
  {
    key: "longformVertical", tagc: "#f5a524", label: "Long Form Vertical", ratio: "9:16", portrait: true,
    title: "Long Form Vertical",
    blurb: "Portrait-native packs authored for 2–5 minute films — long-form storytelling shot for Reels, Shorts and TikTok.",
    min: 230,
  },
];

// Split a pack list by NATIVE aspect. A pack belongs to Vertical only when its
// own art is 9:16 (`portrait`, derived in /api/frames from the poster's
// dimensions). Every pack can RENDER 9:16, but listing them all as vertical puts
// landscape art inside portrait cards — the exact mixed-aspect problem the split
// exists to fix. A pack becomes vertical by shipping vertical art.
// LONG FORM gets its own shelves rather than sitting in the aspect groups: a
// 50-beat pack listed inside the Horizontal grid reads as just another 30s
// template, underselling exactly what it is for. It is still split BY ASPECT,
// because "long form" and "9:16" are independent choices — one aspect-blind
// long-form shelf labelled 16:9 hid the portrait long-form packs inside a
// widescreen grid, so a long-form vertical film had no template to pick.
export function splitByOrientation(list) {
  return {
    horizontal: list.filter((p) => !p.portrait && !p.longForm),
    vertical: list.filter((p) => p.portrait && !p.longForm),
    longform: list.filter((p) => p.longForm && !p.portrait),
    longformVertical: list.filter((p) => p.longForm && p.portrait),
  };
}

// Which shelf a pack belongs to. Shared with the Create screen so a selected
// pack lands the grid on the SAME shelf the Templates page lists it under —
// keying off `portrait` alone sent a long-form portrait pack to the short-form
// Vertical tab, so selecting one silently moved the grid off its own shelf.
export function tabForPack(p) {
  if (!p) return null;
  if (p.longForm) return p.portrait ? "longformVertical" : "longform";
  return p.portrait ? "vertical" : "horizontal";
}
