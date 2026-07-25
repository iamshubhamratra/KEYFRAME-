// Website Asset Intelligence — the integration layer (M1).
//
// Turns the harvester's raw on-disk files (ingest/website_assets.js) into a
// classified, blank-gated, deduped manifest on `job.website_assets`, and — the
// highest-lift move in the whole engine — extracts the site's LOGO colors and
// seeds them onto `intent.logo.brandColors` at the SAME "logo" provenance tier the
// UPLOADED-logo path uses, so the Art Director skins every pack in the site's real
// brand color with ZERO downstream change.
//
// M1 does NOT pin harvested imagery into scenes (that is M2) — it writes the
// manifest + disclosure and delivers brand-accurate colour. pinWebsiteAssets (M2)
// will materialize wire records from this manifest for BOTH orchestrators.
//
// FAIL-OPEN, like every director: a swept file, a failed probe, an empty harvest
// all degrade to "keep what exists" and never throw. Shares the screenshot
// deduper so a harvested hero that also appears in a page screenshot is dropped.

const fs = require("node:fs");
const path = require("node:path");
const config = require("../config");
const { validateImage, makeImageDeduper } = require("./asset_sources/util");
const { dominantColors } = require("./ingest/website");
const { WEBSITE_BRAND_SOURCE, WEBSITE_ASSET_SOURCE } = require("./asset_priority");

const LOGO_RX = /\b(logo|wordmark|brand[-_ ]?mark|brandmark|brand)\b/i;

// Skip near-white / near-black / low-saturation "page chrome" colours — the same
// filter dominantColors uses on pixels, applied here to declared SVG colours.
function isChromeColor(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  const lum = (r + g + b) / 765;
  return lum > 0.92 || lum < 0.08 || sat < 0.15;
}

// Extract a brand palette from an SVG logo's DECLARED colours (fill/stroke/stop-color,
// hex or rgb()). ffmpeg can't rasterize SVG, and a mark's declared fills are usually
// CLEANER than quantized pixels anyway. Ranked by frequency, chrome colours dropped.
function extractSvgColors(markup) {
  const s = String(markup || "");
  const freq = new Map();
  const bump = (r, g, b) => {
    if (r > 255 || g > 255 || b > 255 || isChromeColor(r, g, b)) return;
    const hex = "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
    freq.set(hex, (freq.get(hex) || 0) + 1);
  };
  let m;
  const rxHex = /(?:fill|stroke|stop-color)\s*[=:]\s*["']?\s*#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;
  while ((m = rxHex.exec(s))) {
    let h = m[1];
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    bump(parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16));
  }
  const rxRgb = /(?:fill|stroke|stop-color)\s*[=:]\s*["']?\s*rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g;
  while ((m = rxRgb.exec(s))) bump(Number(m[1]), Number(m[2]), Number(m[3]));
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map((e) => e[0]);
}

// Build a palette from a list of already-resolved CSS colour strings (hex or rgb()),
// e.g. an inline SVG's COMPUTED fill/color captured in-page. This is what recovers a
// brand colour from a currentColor / CSS-styled monochrome logo (no inline hex fills).
function paletteFromCssList(list) {
  const freq = new Map();
  const bump = (r, g, b) => {
    if (r > 255 || g > 255 || b > 255 || isChromeColor(r, g, b)) return;
    const hex = "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
    freq.set(hex, (freq.get(hex) || 0) + 1);
  };
  for (const c of (list || [])) {
    const s = String(c || "").trim();
    let m = s.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
    if (m) { let h = m[1]; if (h.length === 3) h = h.split("").map((x) => x + x).join(""); bump(parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)); continue; }
    m = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*[,/]\s*([\d.]+))?/i);
    // Skip (near-)transparent values — a fully-transparent COLOURED button (rgba(r,g,b,0))
    // is not a painted brand colour and must not be counted as opaque.
    if (m) { const alpha = m[4] !== undefined ? Number(m[4]) : 1; if (!(alpha < 0.05)) bump(Number(m[1]), Number(m[2]), Number(m[3])); }
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map((e) => e[0]);
}

// Deterministic DOM-context + shape classifier (M3). Returns assetType (the fuller
// taxonomy), kindHint (the ONLY field VLD/scene_kit route on: vector|photo|screenshot),
// brandCritical (v1: LOGO only → tier-90 website-brand; everything else is tier-70
// website-asset and must earn prominence via the CD's visionOk), and logoVariant.
function classify(f) {
  const tokens = `${f.cls || ""} ${f.alt || ""} ${f.url || ""}`.toLowerCase();
  const longEdge = Math.max(f.width || 0, f.height || 0);
  const minEdge = Math.min(f.width || 0, f.height || 0);
  const ratio = f.width && f.height ? f.width / f.height : 0;

  // 1) LOGO — the one thing we classify with high confidence (JSON-LD, or a header
  //    mark with alpha/vector + a logo/brand token). brandCritical.
  const isLogoAsset = f.discovery === "jsonld-logo"
    || (f.nearHeader && (f.isSvg || f.hasAlpha) && LOGO_RX.test(tokens))
    || (f.discovery === "link-icon" && f.isSvg && LOGO_RX.test(tokens));
  if (isLogoAsset) {
    return {
      assetType: "logo", kindHint: "vector", brandCritical: true,
      logoVariant: { format: f.isSvg ? "svg" : f.hasAlpha ? "png" : "raster", placement: f.nearHeader ? "header" : "footer" },
    };
  }
  // 2) DECORATIVE — explicit spacer/pattern/ornament tokens (any size), before icon.
  if (/\b(spacer|divider|decoration|pattern|blob|texture|ornament|gradient|dots)\b/.test(tokens)) {
    return { assetType: "decorative", kindHint: f.isSvg ? "vector" : "photo", brandCritical: false };
  }
  // 3) ICON — small square SVG / icon-token.
  if ((f.isSvg && minEdge && minEdge < 96) || /\b(icon|glyph|sprite|favicon)\b/.test(tokens) || (minEdge && minEdge < 96 && ratio > 0.8 && ratio < 1.25)) {
    return { assetType: "icon", kindHint: "vector", brandCritical: false };
  }
  // 4) TEAM — people.
  if (/\b(team|about|founder|staff|headshot|portrait|avatar)\b/.test(tokens)) return { assetType: "team", kindHint: "photo", brandCritical: false };
  // 5) MARKETING — wide banner / promo copy.
  if (/\b(banner|promo|campaign|offer|hero-cta)\b/.test(tokens) || (ratio > 2.2 && longEdge >= 800)) return { assetType: "marketing", kindHint: "photo", brandCritical: false };
  // 6) SCREENSHOT — a large raster that a SPECIFIC UI-capture TOKEN identifies as a
  //    captured product UI. Aspect ALONE is not enough (a bare wide image is more
  //    safely a hero photo than a device-framed screenshot), and BROAD words like
  //    app/screen/panel routinely appear on lifestyle/marketing PHOTOS, so only
  //    capture-specific tokens qualify — a photo that merely mentions "app" is a hero.
  if (longEdge >= 400 && ratio >= 1.1 && f.discovery !== "og" && f.discovery !== "twitter"
      && /\b(screenshot|dashboard|ui[-_ ]?screen|console|interface|analytics|editor|admin[-_ ]?panel)\b/.test(tokens)) {
    return { assetType: "screenshot", kindHint: "screenshot", brandCritical: false };
  }
  // 7) PRODUCT — a physical-product / packshot photo token.
  if (longEdge >= 400 && /\b(photo|shot|packshot|product)\b/.test(tokens)) return { assetType: "product", kindHint: "photo", brandCritical: false };
  // 8) HERO — og/twitter share image, or a large wide RASTER (no UI/product token). The
  //    !isSvg guard keeps a wide inline-SVG illustration out of the photos pool (it
  //    falls through to ILLUSTRATION → kindHint vector).
  if (f.discovery === "og" || f.discovery === "twitter" || (!f.isSvg && longEdge >= 600 && ratio >= 1.3)) return { assetType: "hero", kindHint: "photo", brandCritical: false };
  // 9) ILLUSTRATION — non-icon vector or flat alpha art.
  if (f.isSvg || (f.hasAlpha && (f.bytes || 0) < 300 * 1024)) return { assetType: "illustration", kindHint: "vector", brandCritical: false };
  // 10) DECORATIVE — tiny leftovers (usually already dropped by the quality gate).
  if (minEdge && minEdge < 48) return { assetType: "decorative", kindHint: "photo", brandCritical: false };
  return { assetType: "image", kindHint: "photo", brandCritical: false };
}

// Deterministic quality scorer (M3): 0-100 + approved, ffmpeg-only signals already on
// `meta` (from one validateImage pass) — resolution, min-dimension, aspect sanity, file
// weight, transparency-for-marks. Fail-open: unknown-but-decodable → mid score, kept.
// SVGs are resolution-free vectors → auto-pass. No LLM (relevance is the CD's job).
function scoreAssetQuality(f, meta, assetType) {
  const floor = Number.isFinite(config.harvester?.approveFloor) ? config.harvester.approveFloor : 45;
  const minDim = Number.isFinite(config.harvester?.minDim) ? config.harvester.minDim : 64;
  if (f.isSvg) return { qualityScore: 85, approved: true, rejectReason: null };
  const w = (meta && meta.width) || f.width || 0, h = (meta && meta.height) || f.height || 0;
  const longEdge = Math.max(w, h), minEdge = Math.min(w, h);
  const ratio = w && h ? w / h : 0;
  const bytes = f.bytes || 0;
  // LOGO EXEMPTION: a wordmark is legitimately short on its minor edge (a 200x40 PNG
  // logo, a 48x48 mark). Gating a logo on minEdge<64 would DROP it before it can seed
  // brand colour / the CTA lockup — the engine's headline feature. Logos gate only on a
  // very low longEdge floor + a broken-file byte floor; everything else on minDim.
  const isLogoish = assetType === "logo";
  if (isLogoish) {
    if (longEdge && longEdge < 24) return { qualityScore: 20, approved: false, rejectReason: "too-small" };
    if (bytes && bytes < 200) return { qualityScore: 15, approved: false, rejectReason: "tiny-file" };
    return { qualityScore: 80, approved: true, rejectReason: null };
  }
  // Hard gates (non-logo raster).
  if (minEdge && minEdge < minDim) return { qualityScore: 20, approved: false, rejectReason: "too-small" };
  if (bytes && bytes < 2048) return { qualityScore: 15, approved: false, rejectReason: "tiny-file" };
  // Composite score.
  let score = 45;
  score += Math.min(30, Math.round((longEdge / 1920) * 30)); // resolution reward
  if (minEdge >= 200) score += 10;                            // enough bulk for a hero/inset
  if (ratio && (ratio > 6 || ratio < 1 / 6)) score -= 20;     // extreme aspect (banner strips)
  if ((f.hasAlpha === true) && bytes && bytes < 300 * 1024) score += 5; // clean cut-out
  score = Math.max(0, Math.min(100, score));
  return { qualityScore: score, approved: score >= floor, rejectReason: score >= floor ? null : "low-quality" };
}

// Logo strength: SVG > alpha-PNG > raster, JSON-LD strongly boosted, then larger
// min-dimension. Used both to pick the primary logo for colour and to CAP how many
// candidates keep the tier-90 logo tag on an icon-heavy homepage.
function logoStrength(f) {
  return (f.isSvg ? 3 : f.hasAlpha ? 2 : 1) * 10
    + (f.discovery === "jsonld-logo" ? 8 : 0)
    + Math.min(4, Math.floor(Math.min(f.width || 0, f.height || 0) / 64));
}
function pickPrimaryLogo(logos) {
  return logos.slice().sort((a, b) => logoStrength(b) - logoStrength(a))[0] || null;
}

// Build the manifest from harvested files. Blank-gates, dedups (shared deduper),
// classifies, picks the logo, extracts its colours.
//   { records, brandColors, primaryLogo, review }
async function prepareWebsiteAssets({ job, jobDir, harvest, deduper, brandPalette = [] } = {}) {
  const allFiles = (harvest && Array.isArray(harvest.files)) ? harvest.files.filter((f) => f && f.absPath) : [];
  // Harvested VIDEOS bypass the image pipeline below (blank-gate/classify/quality/dedup are
  // all raster-shaped); they were already ffprobe-validated + re-encoded in the harvester.
  const videoFiles = allFiles.filter((f) => f && f.isVideo);
  const files = allFiles.filter((f) => f && !f.isVideo);
  const baseReview = (harvest && harvest.review) || { discovered: 0, downloaded: 0, dropped: [], notes: [] };
  const review = {
    discovered: baseReview.discovered || 0,
    downloaded: baseReview.downloaded || files.length,
    kept: 0,
    dropped: Array.isArray(baseReview.dropped) ? baseReview.dropped.slice() : [],
    logos: 0,
    brandColorsExtracted: [],
    notes: Array.isArray(baseReview.notes) ? baseReview.notes.slice() : [],
  };
  if (!files.length && !videoFiles.length) return { records: [], brandColors: [], primaryLogo: null, review };

  const dd = deduper || makeImageDeduper();
  const kept = [];
  for (const f of files) {
    // 1) blank / low-info gate (SVGs auto-pass in validateImage).
    let ok = true, meta = null;
    try { const v = await validateImage(f.absPath); ok = v.ok; meta = v.meta; } catch { ok = true; meta = null; }
    if (!ok) { review.dropped.push({ url: f.url || path.basename(f.absPath), reason: "blank" }); try { fs.unlinkSync(f.absPath); } catch { /* noop */ } continue; }
    // fill probe dims if the harvester didn't
    if (meta) { if (!f.width && meta.width) f.width = meta.width; if (!f.height && meta.height) f.height = meta.height; if (meta.hasAlpha) f.hasAlpha = true; f.dhash = meta.dhash || null; }
    // 2) CLASSIFY FIRST (so the quality gate can exempt logos from the raster min-dim
    //    floor — a short wordmark must survive to seed brand colour + the CTA lockup).
    f.__cls = classify(f);
    // 3) DETERMINISTIC QUALITY GATE (logo-aware min-dim + resolution + aspect + weight).
    const q = scoreAssetQuality(f, meta, f.__cls.assetType);
    f.qualityScore = q.qualityScore;
    if (!q.approved) { review.dropped.push({ url: f.url || path.basename(f.absPath), reason: q.rejectReason || "low-quality" }); try { fs.unlinkSync(f.absPath); } catch { /* noop */ } continue; }
    // 3) cross-dedup (against screenshots seeded into the shared deduper, and each other).
    let dup = null;
    try { dup = await dd.check(f.absPath, f.dhash || null); } catch { dup = null; }
    if (dup) { review.dropped.push({ url: f.url || path.basename(f.absPath), reason: `duplicate-${dup}` }); try { fs.unlinkSync(f.absPath); } catch { /* noop */ } continue; }
    kept.push(f);
  }

  // LOGO CAP: a real site has 1–2 logos (mark + wordmark, or dark/light variants). An
  // icon-heavy homepage can trip the per-asset logo heuristic on many near-header SVGs
  // (all would become tier-90 website-brand), so keep only the strongest MAX_LOGOS as
  // logos and DEMOTE the rest to icons (tier-70 website-asset). Deterministic, no LLM.
  const MAX_LOGOS = Number.isFinite(config.harvester?.maxLogos) ? config.harvester.maxLogos : 2;
  const logoFiles = kept.filter((f) => (f.__cls || (f.__cls = classify(f))).assetType === "logo");
  const keepAsLogo = new Set(logoFiles.slice().sort((a, b) => logoStrength(b) - logoStrength(a)).slice(0, MAX_LOGOS));
  const overTagged = logoFiles.length - keepAsLogo.size;
  if (overTagged > 0) review.notes.push(`${overTagged} over-tagged logo(s) re-classified as icons (kept the ${keepAsLogo.size} strongest).`);

  const logos = [];
  const records = kept.map((f) => {
    let c = f.__cls || classify(f);
    // Demote an over-tagged logo (not among the strongest MAX_LOGOS) to a plain icon.
    if (c.assetType === "logo" && !keepAsLogo.has(f)) c = { assetType: "icon", kindHint: "vector", brandCritical: false };
    if (c.assetType === "logo") logos.push(f);
    const rel = path.relative(jobDir, f.absPath).split(path.sep).join("/");
    return {
      path: rel, absPath: f.absPath,
      assetType: c.assetType, kindHint: c.kindHint, brandCritical: c.brandCritical,
      logoVariant: c.logoVariant,
      qualityScore: f.qualityScore != null ? f.qualityScore : null,
      role: c.assetType === "logo" ? "logo" : undefined,
      isVector: !!f.isSvg, hasAlpha: !!f.hasAlpha,
      width: f.width || null, height: f.height || null,
      discovery: f.discovery, alt: f.alt || "",
      sourceUrl: f.url || null,
      // brandCritical logos are owner-content tier 90; everything else is tier-70
      // and must earn a prominent slot via the CD (see asset_priority + roadmap M2/M3).
      source: c.brandCritical ? WEBSITE_BRAND_SOURCE : WEBSITE_ASSET_SOURCE,
      license: c.brandCritical ? "owner content" : "site content",
      approved: true,
    };
  });
  // Harvested VIDEOS bypass the raster gate above (already ffprobe-validated + re-encoded
  // in the harvester) — append them as tier-70 video records the CD can place as B-roll.
  for (const f of videoFiles) {
    const rel = path.relative(jobDir, f.absPath).split(path.sep).join("/");
    records.push({
      path: rel, absPath: f.absPath,
      assetType: "video", kindHint: "video", brandCritical: false,
      qualityScore: null, isVector: false, hasAlpha: false,
      width: f.width || null, height: f.height || null,
      discovery: f.discovery, alt: f.alt || "product video", sourceUrl: f.url || null,
      source: WEBSITE_ASSET_SOURCE, license: "site content",
      durationSec: f.durationSec || null, approved: true,
    });
  }
  review.kept = records.length;
  review.logos = logos.length;

  // Highest-lift: extract the logo's palette so intent.logo.brandColors can seed the
  // Art Director's LOGO tier. RASTER logos use dominantColors (ffmpeg pixel quantize);
  // SVG logos use their DECLARED fills (ffmpeg can't rasterize SVG). Try the best
  // colour source first, fall through until one yields colours (fail-open to []).
  let brandColors = [], primaryLogo = null, colorLogo = null;
  const primary = pickPrimaryLogo(logos);           // best logo for the RECORD (SVG preferred — scalable)
  if (primary) primaryLogo = primary;
  const byLogoScore = (a, b) => (b.hasAlpha ? 1 : 0) - (a.hasAlpha ? 1 : 0) || (Math.min(b.width || 0, b.height || 0) - Math.min(a.width || 0, a.height || 0));
  const rasterLogos = logos.filter((l) => !l.isSvg).sort(byLogoScore);
  const svgLogos = logos.filter((l) => l.isSvg).sort(byLogoScore);
  for (const l of [...rasterLogos, ...svgLogos]) {  // raster first (reliable), then SVG
    try {
      if (!l.isSvg) { brandColors = await dominantColors(l.absPath).catch(() => []); }
      else {
        // SVG: declared inline-hex fills first, then the COMPUTED colours captured
        // in-page (recovers currentColor / CSS-styled monochrome marks).
        brandColors = extractSvgColors(fs.readFileSync(l.absPath, "utf8"));
        if (!brandColors.length) brandColors = paletteFromCssList(l.styleColors);
      }
    } catch { brandColors = []; }
    if (Array.isArray(brandColors) && brandColors.length) { colorLogo = l; break; }
  }
  // SITE-ACCENT FALLBACK. A real brand mark is often a MONOCHROME black/white wordmark:
  // its only rendered colour filters out as page chrome, so the mark yields no brand hue
  // (measured 0/3 live on Stripe/Linear/Ghost — all monochrome SVG logos). The brand's
  // true colour then lives in its primary CTA/accent, which resolveBrandSignals already
  // distilled cleanly (cleaner than the hero-screenshot quantize). Fall the logo tier back
  // to that accent so intent.logo.brandColors (the Art Director's high-confidence "logo"
  // tier) AND the logo lockup still carry the brand colour. DISCLOSED as "site-accent" —
  // never claimed as extracted-from-the-mark. Fabricates nothing: with no accent palette
  // the colour stays empty, exactly as before.
  let brandColorsSource = (colorLogo && brandColors.length) ? "mark" : null;
  if ((!brandColors || !brandColors.length) && Array.isArray(brandPalette) && brandPalette.length) {
    brandColors = brandPalette.slice(0, 4);
    brandColorsSource = "site-accent";
  }
  if (brandColors.length) {
    review.brandColorsExtracted = brandColors;
    review.brandColorsSource = brandColorsSource;
    // Attach to the primary logo record (the mark that gave the colour, else the strongest
    // logo) so the CTA lockup / brand chip can be styled on-brand even from a site-accent.
    const target = colorLogo || primaryLogo;
    if (target) { const rec = records.find((r) => r.absPath === target.absPath); if (rec) rec.brandColors = brandColors; }
  }
  // Strip the internal absPath from the persisted manifest (jobDir-relative path stays).
  for (const r of records) delete r.absPath;

  if (review.kept) review.notes.push(`Harvested ${review.kept} brand asset(s)${review.logos ? `, ${review.logos} logo(s)` : ""}${brandColors.length ? `, palette ${brandColors.join(" ")}${brandColorsSource === "site-accent" ? " (site accent — monochrome mark)" : ""}` : ""}.`);
  return { records, brandColors, brandColorsSource, primaryLogo, review };
}

// ---------------------------------------------------------------- M4: brand signals

// Generic CSS font families to ignore as "no real brand font".
const GENERIC_FONT = /^(sans-serif|serif|monospace|system-ui|ui-sans-serif|ui-serif|ui-monospace|inherit|initial|unset|-apple-system|blinkmacsystemfont|segoe ui|roboto|helvetica|helvetica neue|arial|times|times new roman|georgia|courier|courier new|cursive|fantasy|emoji|math)$/i;

// Turn the harvester's raw brand signals (computed colours + font families) into a
// clean palette + a normalized fonts object + a disclosure list of NON-generic font
// names. Fonts are captured by NAME ONLY (R4 — no webfont binaries redistributed).
function resolveBrandSignals(brandSignals) {
  if (!brandSignals) return { palette: [], fonts: null, fontsExtracted: [] };
  // CTA/button backgrounds LEAD (the strongest brand accent), then link/heading colours
  // — so a page with dozens of link-blue links but one brand CTA still surfaces the CTA
  // colour first. Falls back to the flat rawColors for the older signal shape.
  const cta = Array.isArray(brandSignals.ctaColors) ? brandSignals.ctaColors : null;
  const accent = Array.isArray(brandSignals.accentColors) ? brandSignals.accentColors : null;
  const palette = (cta || accent)
    ? [...new Set([...paletteFromCssList(cta || []), ...paletteFromCssList(accent || [])])].slice(0, 4)
    : paletteFromCssList(brandSignals.rawColors || []);
  const fonts = {
    heading: brandSignals.fonts && brandSignals.fonts.heading || null,
    body: brandSignals.fonts && brandSignals.fonts.body || null,
    faces: Array.isArray(brandSignals.fontFaces) ? brandSignals.fontFaces.slice(0, 8) : [],
  };
  const names = new Set();
  if (fonts.heading && fonts.heading.family) names.add(fonts.heading.family);
  if (fonts.body && fonts.body.family) names.add(fonts.body.family);
  for (const f of fonts.faces) names.add(f);
  const fontsExtracted = [...names].filter((n) => n && !GENERIC_FONT.test(String(n).trim())).slice(0, 8);
  const hasFonts = !!(fonts.heading || fonts.body || fonts.faces.length);
  return { palette, fonts: hasFonts ? fonts : null, fontsExtracted };
}

// ---------------------------------------------------------------- M2: pin to scenes

// Showcase scene targeting — the graph's proven rule (mirrors user_assets), incl. the
// short-script fallback (slice(1,-1) is EMPTY on 2-scene scripts).
function showcaseTargets(script) {
  const scenes = Array.isArray(script && script.scenes) ? script.scenes : [];
  const showcase = scenes.filter((s) => ["feature", "proof", "how", "context"].includes(s.purpose));
  const mid = scenes.slice(1, -1);
  return showcase.length ? showcase : (mid.length ? mid : scenes);
}

// The pinned-asset wire record for one harvested manifest entry. Harvested files
// already live under jobDir (ingest/brand_assets/…) — a valid jobDir-relative path,
// like an upload's uploads/…, so NO copy is needed; the record just carries the path.
// source (website-brand / website-asset) drives the tier, kindHint drives presentation
// routing (VLD.classify + scene_kit.partitionAssets) so a bare logo/cutout is never
// forced into a device frame.
function assetFromHarvest(r, scene) {
  const ratio = r.width && r.height ? Math.round((r.width / r.height) * 1000) / 1000 : (r.ratio || undefined);
  const what = r.assetType && !["image", "logo"].includes(r.assetType) ? r.assetType : "brand image";
  return {
    path: r.path, type: r.kindHint === "video" || r.assetType === "video" ? "video" : "image",
    sceneId: scene ? scene.id : null,
    startSec: scene ? scene.start : 0,
    durationSec: scene ? scene.duration : 0,
    style: "inset",
    width: r.width || undefined, height: r.height || undefined, ratio,
    hasAlpha: r.hasAlpha === true ? true : undefined,
    alt: `the brand's OWN ${what} from their website — owner-content ${r.isVector ? "graphic" : "visual"}`,
    license: r.license || "site content", sourceUrl: r.sourceUrl || null,
    source: r.source, kindHint: r.kindHint,
    assetType: r.assetType,   // carried so the Asset Usage Report (M5) can group by kind
    qualityScore: typeof r.qualityScore === "number" ? r.qualityScore : undefined,
    brandColors: Array.isArray(r.brandColors) && r.brandColors.length ? r.brandColors : undefined,
    fromCache: false,
  };
}

// Pin harvested website brand assets to scenes for BOTH orchestrators (mirrors
// pinUserAssets so the two production paths can't drift). Returns:
//   brandPinned  — tier-70 website-asset imagery on showcase scenes the uploads/
//                  screenshots did NOT claim (capped; they compete via tier+CD, not flood).
//   brandLogo    — the harvested logo as a role:"logo" asset (tier-90 website-brand),
//                  ONLY when the user uploaded no logo (an uploaded logo wins the CTA
//                  lockup). It rides the existing key-moment path via asset_priority.isLogo.
//   usedSceneIds — updated with the scenes brand imagery now owns.
// FAIL-OPEN: a missing manifest / swept file / empty harvest → pin nothing, never throw.
async function pinWebsiteAssets({ job, script, jobDir, usedSceneIds = new Set(), hasUploadLogo = false, maxPins = 4 } = {}) {
  const recs = Array.isArray(job && job.website_assets) ? job.website_assets : [];
  const live = recs.filter((r) => {
    if (!r || !r.path) return false;
    try { return fs.existsSync(path.join(jobDir, r.path)); } catch { return false; }
  });
  const used = new Set(usedSceneIds);
  if (!live.length) return { brandPinned: [], brandLogo: null, usedSceneIds: used };

  const logoRec = live.find((r) => r.assetType === "logo") || null;
  const images = live.filter((r) => r.assetType !== "logo").slice(0, Math.max(0, maxPins));
  const scenes = Array.isArray(script && script.scenes) ? script.scenes : [];
  const targets = showcaseTargets(script).filter((s) => !used.has(s.id));

  const brandPinned = images.map((r, i) => assetFromHarvest(r, targets.length ? targets[i % targets.length] : null));
  for (const a of brandPinned) if (a.sceneId) used.add(a.sceneId);

  let brandLogo = null;
  if (logoRec && !hasUploadLogo) {
    const last = scenes[scenes.length - 1] || null;
    brandLogo = {
      ...assetFromHarvest(logoRec, last),
      role: "logo", style: "inset",
      hasAlpha: logoRec.hasAlpha === true ? true : undefined,
      // "logo" in the alt keeps fallback.js's /\b(logo|wordmark|brand)\b/i outro working.
      alt: "the brand's OWN site logo — brand chip and CTA lockup only, never a full-frame image",
    };
  }
  console.log(`[website_assets] pinned ${brandPinned.length} brand asset(s)${brandLogo ? " + logo" : ""} (${live.length} in manifest)`);
  return { brandPinned, brandLogo, usedSceneIds: used };
}

module.exports = { prepareWebsiteAssets, pinWebsiteAssets, assetFromHarvest, resolveBrandSignals, classify, scoreAssetQuality, pickPrimaryLogo, extractSvgColors, paletteFromCssList };
