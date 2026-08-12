// Art Director agent — the brand-identity authority between Frame Selection and
// Composition. A website ingest already extracts the site's real brand colors
// (brief.brandColors), but nothing consumed them: every video rendered the frame
// pack's stock palette, so an Amazon video was never Amazon-colored. The Art
// Director turns those extracted hexes into a BRAND SKIN — a small, ACCENT-ONLY
// override that leads the composition's accent/emphasis colors while leaving the
// chosen pack's ground and character intact (deriveTheme blends it in).
//
// ACCENT-ONLY by design (the user's pick): the pack keeps its ground, motion, and
// personality; only the accents/emphasis are steered to the brand. This is the
// safe, identity-preserving strength — it reads on-brand without fighting a
// pack's designed look.
//
// FAIL-OPEN by design (mirrors audio_director.js / creative_director.js): disabled,
// no brand colors, or an LLM error all return a deterministic skin (or null) — the
// composition simply uses the pack's own accents. The Art Director can never block
// a render or leave a video worse than the pack default.

const fs = require("node:fs");
const path = require("node:path");
const config = require("../config");
const db = require("../db");
const openrouter = require("./openrouter");
const { extractFirstJsonObject } = require("./json_lenient");
// The pack's own manifest is the authority on what polarity its design needs.
const { getManifest } = require("./frame_manifest");

const SYSTEM = fs.readFileSync(
  path.join(__dirname, "..", "prompts", "system_art_director.md"),
  "utf8"
);

function ard() {
  return config.artDirector || { enabled: true, model: "google/gemini-3.1-flash-lite" };
}

// ---- color helpers (self-contained; no dep on scene_kit) ---------------------
const HEX = /^#?([0-9a-fA-F]{6})$/;
function normHex(v) {
  const m = HEX.exec(String(v || "").trim());
  return m ? `#${m[1].toLowerCase()}` : null;
}
function hexToRgb(hex) {
  const h = normHex(hex);
  if (!h) return null;
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h = 0, s = 0; const l = (mx + mn) / 2; const d = mx - mn;
  if (d) {
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    switch (mx) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return [h * 360, s, l];
}
// WCAG relative luminance (0..1) — used to reject accents that would vanish
// against a dark OR light ground before deriveTheme even sees them.
function relLum([r, g, b]) {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

// A brand color is USABLE as an accent when it is neither near-white nor near-
// black nor a flat gray — those are grounds/ink, not accents (extracted palettes
// are full of #ffffff / #111 / #f5f5f5). Vividness ranks the survivors so the
// most saturated, mid-light brand color leads.
function usableAccent(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return false;
  const [, s, l] = rgbToHsl(rgb);
  return s >= 0.18 && l >= 0.16 && l <= 0.88;
}
function vividness(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return -1;
  const [, s, l] = rgbToHsl(rgb);
  // saturation dominates; penalize distance from a punchy mid-light (~0.52).
  return s * (1 - Math.abs(l - 0.52) * 0.9);
}

// Order + de-dupe the raw extracted hexes into at most `max` distinct, vivid,
// usable accents. This is BOTH the deterministic fallback skin and the candidate
// list the LLM is asked to choose from.
function distillAccents(brandColors, max = 3) {
  const seen = new Set();
  const out = [];
  for (const hex of (brandColors || []).map(normHex).filter(Boolean)) {
    if (seen.has(hex) || !usableAccent(hex)) continue;
    seen.add(hex);
    out.push(hex);
  }
  return out.sort((a, b) => vividness(b) - vividness(a)).slice(0, max);
}

// Deterministic ACCENT-ONLY skin from the extracted palette alone. Returns null
// when no brand color is accent-worthy — the pack then keeps its own accents.
function defaultBrandSkin(brandColors) {
  const accents = distillAccents(brandColors, 3);
  if (!accents.length) return null;
  return {
    accents,
    emphasis: [accents[0], accents[1] || accents[0]],
    source: "default",
  };
}

// Coerce the model's reply into a clean ACCENT-ONLY skin. The model may only pick
// FROM the extracted brand colors (it cannot invent off-brand hues); anything it
// returns is validated against `allowed` and dropped otherwise. `skip:true` (or an
// empty result) means "the brand colors are too dull/similar — keep the pack's
// accents", which we honor by returning null.
function sanitizeSkin(raw, allowedAccents) {
  if (!raw || raw.skip === true) return null;
  const allowed = new Set(allowedAccents.map(normHex).filter(Boolean));
  const pick = (arr) => (Array.isArray(arr) ? arr : [])
    .map(normHex)
    .filter((h) => h && allowed.has(h));
  const accents = [...new Set(pick(raw.accents))].slice(0, 3);
  if (!accents.length) return null;
  const emph = pick(raw.emphasis);
  const emphasis = [emph[0] || accents[0], emph[1] || accents[1] || accents[0]];
  return {
    accents,
    emphasis,
    reason: String(raw.reason || "").slice(0, 160),
    source: "llm",
  };
}

function buildUser({ subject, framePack, packVibe, candidates }) {
  return [
    `FILM SUBJECT: "${subject || "(unspecified)"}".`,
    `FRAME PACK (design template being used): "${framePack || "auto"}"${packVibe ? ` — ${packVibe}` : ""}.`,
    "",
    `EXTRACTED BRAND COLORS (the product's real palette, ranked by vividness). You may ONLY choose from these — do not invent colors:`,
    JSON.stringify(candidates),
    "",
    `Choose 1-3 of these as the video's ACCENT colors (the ones highlighted words, rules, and the emphasis gradient use), most important first, plus a 2-stop emphasis gradient pair. Keep the pack's ground/character — you are steering ONLY the accents to the brand. If none of the brand colors are vivid/legible enough to improve on a generic accent, return {"skip":true}. JSON only.`,
  ].join("\n");
}

async function buildSkin({ subject, framePack, packVibe, candidates, tracker, signal }) {
  const user = buildUser({ subject, framePack, packVibe, candidates });
  const { text, tokensIn, tokensOut, costUsd } = await openrouter.chat({
    system: SYSTEM, user, jsonMode: true, stage: "art_director",
    model: ard().model, temperature: 0.2, signal,
  });
  if (tracker) tracker.addLlm({ inputTokens: tokensIn, outputTokens: tokensOut, stage: "art_director", costUsd: costUsd });
  return sanitizeSkin(extractFirstJsonObject(text), candidates);
}

// ---------------------------------------------------------------- main
// Thin fail-open wrapper (mirrors directAudio): flag-gate, run, persist, and
// ALWAYS return either a usable brand skin or null (pack keeps its own accents).
async function directBrand({ jobId, brandColors, subject, brief, framePack, packVibe, tracker, signal, siteBg, matchTheme }) {
  const colors = Array.isArray(brandColors) ? brandColors : ((brief && brief.brandColors) || []);
  const candidates = distillAccents(colors, 5);
  const subj = String(subject || (brief && brief.subject) || "").trim();

  // GROUND MATCH (opt-in): when the source is a website and the user asked to match
  // its theme, the film adopts the SITE's own ground color (light/dark), applied in
  // scene_kit.deriveTheme. Attach it to the accent skin — or to a ground-only skin
  // when the brand palette is too dull for accents, so the theme still matches.
  //
  // …but ONLY when the sampled colour is decisively light or decisively dark.
  //
  // Ingest samples one background colour off the page, and on a busy commercial
  // site that sample is an average, not a design decision: Flipkart — a white site
  // with a blue header — came back as #656565, a flat mid grey, additionally
  // misclassified as `dark: true` because it sits a hair under the midpoint. The
  // film then adopted mid grey as its ground, overriding hype-wave's design-system
  // light ground (#fdf8ec), and QA reported GROUND LIGHTNESS FAILURE. Mid grey is
  // the worst possible ground: nothing reads well on it, light ink or dark.
  //
  // A ground is only worth taking from the site when it is unambiguous. Anything in
  // the mushy middle means the sample failed, and the pack's own designed ground —
  // which a designer chose and the pack's ink was picked against — is better.
  const groundLuma = (hex) => {
    const h = String(hex).replace("#", "");
    const n = parseInt(h.slice(0, 6), 16);
    if (!Number.isFinite(n)) return null;
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const groundUsable = (hex) => {
    const L = groundLuma(hex);
    if (L == null) return false;
    // Decisively dark (< 0.06) or decisively light (> 0.55). Everything between is
    // a failed sample, not a brand colour.
    return L < 0.06 || L > 0.55;
  };
  let groundHex = (matchTheme && typeof siteBg === "string" && /^#[0-9a-f]{6}$/i.test(siteBg)) ? siteBg.toUpperCase() : null;
  if (groundHex && !groundUsable(groundHex)) {
    console.log(`[art_director] site ground ${groundHex} is a mid-tone (luma ${groundLuma(groundHex).toFixed(3)}) — keeping the pack's own designed ground instead of matching it`);
    groundHex = null;
  }
  // …AND MATCHING A THEME NEVER MEANS INVERTING A DESIGN. The check above only
  // rejects a mushy sample; a decisively WHITE site was still allowed to repaint
  // a pack built dark. Measured on a Notion film rendered with `abyssal-glow`
  // (a deep-sea pack, designed ground #041318, glows and gradients drawn for
  // black): the ground came back #FFFFFF, QA reported "GROUND COLOR FAILURE —
  // light/white gradient instead of the required dark ground", and two beats
  // read as blank pale frames because the pack's own light-on-dark artwork had
  // nothing to sit on. The pack's ink, glow, scrim and artwork were all chosen
  // against its own polarity, so a site may tune the ground WITHIN that polarity
  // and never across it.
  if (groundHex && framePack) {
    try {
      const packGround = (getManifest(framePack) || {}).surface?.ground;
      if (typeof packGround === "string" && /^#[0-9a-f]{6}$/i.test(packGround)) {
        const packDark = groundLuma(packGround) < 0.3;
        const siteDark = groundLuma(groundHex) < 0.3;
        if (packDark !== siteDark) {
          console.log(`[art_director] site ground ${groundHex} is ${siteDark ? "dark" : "light"} but "${framePack}" is designed ${packDark ? "dark" : "light"} (${packGround}) — keeping the pack's ground; matching it would invert the design`);
          groundHex = null;
        }
      }
    } catch { /* no manifest — fall through and match as before */ }
  }
  const withGround = (skin) => {
    if (!groundHex) return skin;
    return { ...(skin || { source: "site-theme" }), ground: groundHex };
  };

  // Nothing usable in the extracted palette → keep the pack's accents (but still
  // apply the ground match if requested).
  if (!candidates.length) return withGround(null);
  // Disabled → deterministic skin (still an improvement over ignoring brand color).
  if (!ard().enabled) {
    const skin = withGround(defaultBrandSkin(colors));
    if (jobId && skin) { try { db.setBrandReview(jobId, skin); } catch { /* best effort */ } }
    return skin;
  }

  try {
    let skin = await buildSkin({ subject: subj, framePack, packVibe, candidates, tracker, signal });
    // The model chose to keep the pack's accents (skip) — honor it, but fall back
    // to the deterministic skin ONLY if the brand palette is strongly vivid (so a
    // clearly-branded product still gets its color even on a terse model reply).
    if (!skin && vividness(candidates[0]) >= 0.45) skin = defaultBrandSkin(colors);
    skin = withGround(skin);
    if (jobId && skin) { try { db.setBrandReview(jobId, skin); } catch { /* best effort */ } }
    console.log(`[art_director] job ${jobId || "?"}: brand skin = ${skin ? `${(skin.accents || []).join(", ") || "(pack accents kept)"}${skin.ground ? ` · ground ${skin.ground}` : ""} (${skin.source})` : "none (pack accents kept)"}`);
    return skin;
  } catch (e) {
    console.warn(`[art_director] failed (${String((e && e.message) || e).slice(0, 140)}) — deterministic brand skin`);
    return withGround(defaultBrandSkin(colors));
  }
}

module.exports = { directBrand, defaultBrandSkin, distillAccents };
