// LOGO RENDERING — making a brand mark actually READ on the pack it lands on.
//
// THE DEFECT: wisprflow.ai's harvested wordmark is `fill="#1A1A1A"`. Living City's
// ground is `#04050C`. The CTA therefore rendered a near-black logo on a near-black
// night sky — a 1.05:1 contrast ratio, invisible. The film had the brand's real mark
// and still looked unbranded at the one moment the brand matters most.
//
// This is not a fluke of one site. A site's navbar logo is drawn for the site's OWN
// header, so a light-background site ships a dark mark and a dark-background site ships
// a light one. Half of all harvested logos are therefore wrong for any given pack, and
// which half depends on a pairing nobody controls: the user's site versus the template
// they picked. It has to be resolved at render time, per logo, per pack.
//
// WHAT A BRAND SYSTEM ACTUALLY DOES. Real guidelines answer this in one of two ways,
// and which one is correct depends on the mark:
//
//   • A MONOCHROME mark (a one-colour wordmark like Wispr's) has a documented reversed
//     form: the same shape knocked out in white on dark grounds. Forcing it to the
//     ground's ink is exactly what the brand book prescribes — nothing is lost, because
//     the mark carries no colour information to begin with.
//   • A POLYCHROME mark (a multi-colour logo) must NOT be knocked out — that would
//     destroy the identity. The prescribed treatment is a containment field: the logo
//     at full colour on a small white/light plate, which is why you see logos on white
//     chips in dark-themed footers everywhere.
//
// So the decision is: measure the mark's ink, compare it to the ground, and if it fails
// to read, apply whichever of those two treatments the mark's own nature calls for.
//
// Measurement is async and I/O-bound, so it happens ONCE at intake and rides on the
// asset (`logo.ink`); composers are sync and receive no jobDir, so they only consume it.
// Fail-open throughout: no ink data ⇒ render exactly as before.

const fs = require("node:fs");
const { spawn } = require("node:child_process");

// ---------------------------------------------------------------- colour math
function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function relLum(rgb) {
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(l1, l2) {
  if (l1 == null || l2 == null) return null;
  const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}
const chromaOf = (rgb) => (rgb ? (Math.max(...rgb) - Math.min(...rgb)) / 255 : 0);

// ---------------------------------------------------------------- measurement

// Every colour an SVG actually paints with. Deliberately INCLUDES near-black and
// near-white, which the brand-palette extractors drop as "not brand colours" — here
// those are precisely the values we need, since they are what makes a mark disappear.
function svgInkColors(markup) {
  const s = String(markup || "");
  const out = [];
  const push = (v) => {
    const t = String(v || "").trim().toLowerCase();
    if (!t || t === "none" || t === "transparent" || t === "currentcolor" || t.startsWith("url(")) return;
    const rgb = hexToRgb(t);
    if (rgb) { out.push(rgb); return; }
    const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(t);
    if (m) out.push([+m[1], +m[2], +m[3]]);
  };
  for (const m of s.matchAll(/\b(?:fill|stroke)\s*=\s*"([^"]*)"/gi)) push(m[1]);
  for (const m of s.matchAll(/\b(?:fill|stroke)\s*:\s*([^;"}\s]+)/gi)) push(m[1]);
  for (const m of s.matchAll(/stop-color\s*[:=]\s*"?([^;"}\s]+)/gi)) push(m[1]);
  return out;
}

// Mean luminance of a raster's OPAQUE pixels, alpha-weighted. Averaging every pixel
// would be meaningless for a logo: most of a logo PNG is transparent, so the mean
// would describe the empty space rather than the mark.
function rasterInk(absPath) {
  return new Promise((resolve) => {
    const ff = spawn("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-i", absPath,
      "-vf", "scale=48:48", "-f", "rawvideo", "-pix_fmt", "rgba", "pipe:1",
    ]);
    const chunks = [];
    ff.stdout.on("data", (d) => chunks.push(d));
    ff.on("error", () => resolve(null));
    ff.on("exit", (code) => {
      if (code !== 0) return resolve(null);
      const buf = Buffer.concat(chunks);
      let wSum = 0, lSum = 0, cSum = 0;
      const hues = [];
      for (let i = 0; i + 3 < buf.length; i += 4) {
        const a = buf[i + 3] / 255;
        if (a < 0.35) continue;                      // effectively transparent
        const rgb = [buf[i], buf[i + 1], buf[i + 2]];
        const l = relLum(rgb);
        wSum += a; lSum += l * a; cSum += chromaOf(rgb) * a;
        if (chromaOf(rgb) > 0.15) hues.push(rgb);
      }
      if (wSum < 1) return resolve(null);            // nothing opaque enough to judge
      resolve({ lum: lSum / wSum, chroma: cSum / wSum, colorful: hues.length });
    });
  });
}

/**
 * Measure a logo's ink: how light/dark it draws, and whether it carries colour.
 * Returns { lum, mono, source } or null when it cannot be determined (fail-open).
 */
async function measureLogoInk(absPath) {
  try {
    if (!absPath || !fs.existsSync(absPath)) return null;
    if (/\.svg($|\?)/i.test(absPath)) {
      const colors = svgInkColors(fs.readFileSync(absPath, "utf8"));
      if (!colors.length) return null;
      const lums = colors.map(relLum).filter((x) => x != null);
      if (!lums.length) return null;
      const chromas = colors.map(chromaOf);
      const maxChroma = Math.max(...chromas);
      // Monochrome = every painted colour is essentially greyscale. A mark with real
      // hue in it must keep that hue, so it is never knocked out.
      const mono = maxChroma < 0.12;
      return { lum: lums.reduce((a, b) => a + b, 0) / lums.length, mono, source: "svg" };
    }
    const r = await rasterInk(absPath);
    if (!r) return null;
    return { lum: r.lum, mono: r.chroma < 0.12 && r.colorful === 0, source: "raster" };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- rendering (pure)

// Below this ratio the mark does not read against the ground. 2.2:1 is deliberately
// below the WCAG 3:1 large-text floor: a logo is a recognised SHAPE rather than text to
// be read, so it tolerates a little less separation — but 1.05:1 (the audited case) is
// not "a little less", it is invisible.
const MIN_LOGO_CONTRAST = 2.2;

/**
 * Decide how to present a logo on a given ground.
 * Pure — takes the ink measured at intake, never touches disk.
 *
 * @returns {{ mode:"as-is"|"knockout"|"plate", filter:string, plate:boolean, reason:string }}
 */
function logoTreatment(logo, groundHex) {
  const ink = logo && logo.ink;
  const groundLum = relLum(hexToRgb(groundHex));
  if (!ink || typeof ink.lum !== "number" || groundLum == null) {
    return { mode: "as-is", filter: "", plate: false, reason: "ink not measured" };
  }
  const ratio = contrast(ink.lum, groundLum);
  if (ratio == null || ratio >= MIN_LOGO_CONTRAST) {
    return { mode: "as-is", filter: "", plate: false, reason: `reads at ${ratio ? ratio.toFixed(2) : "?"}:1` };
  }
  if (ink.mono) {
    // The reversed form of a one-colour mark: flatten to black, then invert on a dark
    // ground to get pure white. `brightness(0)` first so the result does not depend on
    // the original ink's value — a #1A1A1A and a #444 wordmark both knock out cleanly.
    const filter = groundLum < 0.5 ? "brightness(0) invert(1)" : "brightness(0)";
    return { mode: "knockout", filter, plate: false, reason: `mono mark at ${ratio.toFixed(2)}:1 — reversed` };
  }
  // Colour must survive, so give the mark a containment field instead.
  return { mode: "plate", filter: "", plate: true, reason: `colour mark at ${ratio.toFixed(2)}:1 — containment plate` };
}

/**
 * The CTA logo `<img>`, treated so it reads on this pack's ground.
 *
 * Replaces the hand-rolled `<img>` each composer had. `glow` is the pack's existing
 * drop-shadow colour (kept, so the signature treatment survives) — but it is DROPPED on
 * a knockout, because a coloured glow behind a reversed mark reads as a halo artifact.
 *
 * @param {object} logo      the logo asset (path, alt, ink)
 * @param {object} opts      { sizeCqw, ground, glow, escape }
 */
function logoMark(logo, { sizeCqw = 22, ground = "#000000", glow = null, extraFilter = null, escape } = {}) {
  if (!logo || !logo.path) return "";
  const esc = escape || ((s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"));
  const t = logoTreatment(logo, ground);
  const filters = [];
  if (t.filter) filters.push(t.filter);
  if (glow && t.mode !== "knockout") filters.push(`drop-shadow(0 0 3cqw ${glow})`);
  if (extraFilter && t.mode !== "knockout") filters.push(extraFilter);
  const filterCss = filters.length ? `filter:${filters.join(" ")};` : "";
  const img = `<img src="${esc(logo.path)}" alt="${esc(logo.alt || "logo")}" style="width:100%;height:100%;object-fit:contain;${filterCss}">`;
  if (!t.plate) {
    return `<div style="width:${sizeCqw}cqw;height:${sizeCqw}cqw;">${img}</div>`;
  }
  // Containment field: a light rounded plate with padding, sized so the MARK still
  // occupies the requested box (the plate grows around it rather than shrinking it).
  const pad = Math.max(1.2, sizeCqw * 0.12);
  return `<div style="width:${Math.round((sizeCqw + pad * 2) * 100) / 100}cqw;height:${Math.round((sizeCqw + pad * 2) * 100) / 100}cqw;padding:${Math.round(pad * 100) / 100}cqw;box-sizing:border-box;border-radius:${Math.round(sizeCqw * 0.18 * 100) / 100}cqw;background:#FFFFFF;box-shadow:0 0.6cqw 2.4cqw rgba(0,0,0,0.28);display:flex;align-items:center;justify-content:center;">${img}</div>`;
}

/**
 * Just the CSS `filter:` declaration (or "") for a logo on a ground.
 *
 * For composers whose logo markup is not a square cqw box — Prisma sizes its wordmark
 * by height with `width:auto` so a wide lockup keeps its aspect — and which therefore
 * cannot adopt logoMark's wrapper. They keep their own markup and take only the
 * correction. A colour mark that needs a containment plate cannot be expressed as a
 * filter, so this returns "" for that case rather than knocking the colour out.
 */
function logoFilterCss(logo, groundHex) {
  const t = logoTreatment(logo, groundHex);
  return t.filter ? `filter:${t.filter};` : "";
}

module.exports = { measureLogoInk, logoTreatment, logoMark, logoFilterCss, MIN_LOGO_CONTRAST, relLum, hexToRgb, contrast };
