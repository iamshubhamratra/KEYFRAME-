// Art Director agent — the brand-identity authority between Frame Selection and
// Composition. A website ingest already extracts the site's real brand colors, but
// nothing consumed them: every video rendered the frame pack's stock palette, so an
// Amazon video was never Amazon-colored. The Art Director turns a palette into a
// BRAND SKIN — a small, ACCENT-ONLY override that leads the composition's accent/
// emphasis colors while leaving the chosen pack's ground and character intact
// (deriveTheme blends it in).
//
// ACCENT-ONLY by design (the user's pick): the pack keeps its ground, motion, and
// personality; only the accents/emphasis are steered to the brand. This is the
// safe, identity-preserving strength — it reads on-brand without fighting a
// pack's designed look.
//
// PROVENANCE is an input, not a footnote. The caller (graph.artDirectorAgent) decides
// WHICH palette is true — the user's own pick, the site's extracted colors, or the
// brief model's guess — and this module treats them differently: a hand-picked palette
// is a human decision to be honored verbatim, an extracted one is a bag of unlabeled
// quantized buckets that still needs judging. Only "extracted" is worth an LLM call.
//
// FAIL-OPEN by design (mirrors audio_director.js / creative_director.js): no usable
// brand colors or an LLM error return a deterministic skin (or null) — the composition
// simply uses the pack's own accents. The Art Director can never block a render or
// leave a video worse than the pack default.

const fs = require("node:fs");
const path = require("node:path");
const config = require("../config");
const db = require("../db");
const openrouter = require("./openrouter");
const frameManifest = require("./frame_manifest");
const { extractFirstJsonObject } = require("./json_lenient");

const SYSTEM = fs.readFileSync(
  path.join(__dirname, "..", "prompts", "system_art_director.md"),
  "utf8"
);

function ard() {
  return config.artDirector || { enabled: true, model: "google/gemini-3.1-flash-lite" };
}

// ONE pool, two caps. MAX_CANDIDATES is what a palette distills to — the menu the
// model chooses from AND the pool the deterministic skin is cut from. They used to be
// distilled separately (5 for the model, 3 for the fallback), so the model could
// legally pick a color the deterministic path was structurally unable to reach.
// MAX_ACCENTS is the skin contract itself: composers read accents[0..2] and emphasis
// is a 2-stop pair.
const MAX_CANDIDATES = 5;
const MAX_ACCENTS = 3;

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

// A brand color is USABLE as an accent when it is neither near-white nor near-
// black nor a flat gray — those are grounds/ink, not accents (extracted palettes
// are full of #ffffff / #111 / #f5f5f5). Vividness ranks the survivors so the
// most saturated, mid-light brand color leads.
//
// This is a TRIAGE HEURISTIC over HSL, not a legibility measurement: HSL lightness is
// not luminance (#0000ff sits at l=0.50 but its WCAG relative luminance is ~0.07), and
// nothing here knows the ground the accent will land on. That is fine for sorting a
// machine-quantized palette and wrong as a veto over a human's choice — distillAccents
// skips it for an explicit palette. The real WCAG math lives in brand_kit.js, where a
// composer actually has a ground to measure against.
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

// Order + de-dupe a palette into at most `max` distinct, vivid, usable accents. This
// is BOTH the deterministic fallback skin and the candidate list the LLM is asked to
// choose from, so the two paths always argue over the same colors.
//
// An EXPLICIT palette is passed through untouched beyond de-dupe. A human decided its
// MEMBERSHIP (a hand-picked muted sage is not a dull gray to be dropped in favor of
// the pack's stock teal) and its ORDER — primary first is the answer to the very
// question the vividness sort exists to guess.
function distillAccents(brandColors, max = MAX_CANDIDATES, { provenance } = {}) {
  const handPicked = provenance === "explicit";
  const seen = new Set();
  const out = [];
  for (const hex of (brandColors || []).map(normHex).filter(Boolean)) {
    if (seen.has(hex) || (!handPicked && !usableAccent(hex))) continue;
    seen.add(hex);
    out.push(hex);
  }
  if (handPicked) return out.slice(0, max);
  return out.sort((a, b) => vividness(b) - vividness(a)).slice(0, max);
}

// The deterministic ACCENT-ONLY skin, cut from an ALREADY-distilled pool in that
// pool's own order. Taking the pool as input (rather than re-distilling the raw
// colors) is what guarantees the fallback can only ever choose colors the model was
// also offered. Returns null when nothing survived — the pack keeps its own accents.
function skinFrom(candidates, provenance) {
  const accents = (candidates || []).slice(0, MAX_ACCENTS);
  if (!accents.length) return null;
  return {
    accents,
    emphasis: [accents[0], accents[1] || accents[0]],
    source: "default",
    provenance: provenance || null,
  };
}

// Deterministic ACCENT-ONLY skin from a raw palette — distill, then cut. The path an
// explicit palette takes (it must never reach the LLM) and the LLM-less fallback.
function defaultBrandSkin(brandColors, { provenance } = {}) {
  return skinFrom(distillAccents(brandColors, MAX_CANDIDATES, { provenance }), provenance || null);
}

// Coerce the model's reply into a clean ACCENT-ONLY skin. The model may only pick
// FROM the extracted brand colors (it cannot invent off-brand hues); anything it
// returns is validated against `allowed` and dropped otherwise. `skip:true` (or an
// empty result) means "the brand colors are too dull/similar — keep the pack's
// accents", which we honor by returning null.
function sanitizeSkin(raw, allowedAccents, provenance) {
  if (!raw || raw.skip === true) return null;
  const allowed = new Set(allowedAccents.map(normHex).filter(Boolean));
  const pick = (arr) => (Array.isArray(arr) ? arr : [])
    .map(normHex)
    .filter((h) => h && allowed.has(h));
  const accents = [...new Set(pick(raw.accents))].slice(0, MAX_ACCENTS);
  if (!accents.length) return null;
  const emph = pick(raw.emphasis);
  const emphasis = [emph[0] || accents[0], emph[1] || accents[1] || accents[0]];
  return {
    accents,
    emphasis,
    reason: String(raw.reason || "").slice(0, 160),
    source: "llm",
    provenance: provenance || null,
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

async function buildSkin({ subject, framePack, packVibe, candidates, provenance, tracker, signal }) {
  const user = buildUser({ subject, framePack, packVibe, candidates });
  const { text, tokensIn, tokensOut } = await openrouter.chat({
    system: SYSTEM, user, jsonMode: true, stage: "art_director",
    model: ard().model, temperature: 0.2, signal,
  });
  if (tracker) tracker.addLlm({ inputTokens: tokensIn, outputTokens: tokensOut, stage: "art_director" });
  return sanitizeSkin(extractFirstJsonObject(text), candidates, provenance);
}

// ---- persistence (the honesty gate) -----------------------------------------
// A brand review is a CLAIM about the finished video — the UI's Brand panel shows the
// user the colors "their" film wears. It may therefore only be written when the pack's
// renderer actually CONSUMES the skin. Phase 1 wires the scene-kit (any pack with no
// dedicated renderer) and the flagship; the remaining dedicated composers still drop
// the skin, and a panel promising an accent the film never shows is worse than an
// empty panel. Show nothing rather than something false.
//
// Mirrors pipeline.rendererFor instead of importing it: pipeline.js drags in every
// composer, and this is a one-word question for the manifest.
const SKIN_AWARE_RENDERERS = new Set(["three-flagship"]);
function rendererWearsSkin(framePack) {
  let renderer = null;
  try { const m = frameManifest.getManifest(framePack); renderer = (m && m.renderer) || null; }
  catch { return false; }
  // No dedicated renderer → the deterministic scene-kit composes it, and the kit
  // reads the skin (it is the one composer that always did).
  return renderer === null || SKIN_AWARE_RENDERERS.has(renderer);
}

// Best-effort + gated. Never throws (THE LAW: nothing here may block a render) and
// never records a skin the renderer will silently drop.
function persistBrandReview(jobId, skin, framePack) {
  if (!jobId || !skin || !rendererWearsSkin(framePack)) return false;
  try { db.setBrandReview(jobId, skin); return true; } catch { return false; }
}

// ---------------------------------------------------------------- main
// Thin fail-open wrapper (mirrors directAudio): run, persist, and ALWAYS return either
// a usable brand skin or null (pack keeps its own accents).
//
// `provenance` is a real input, not a label: it decides whether the palette may be
// filtered/reordered at all, and whether a terse model reply may be overridden. It
// defaults to "extracted" because that is the only palette worth this call — a
// hand-picked palette has already answered the question the model is asked (callers
// use defaultBrandSkin), and an inferred one is the brief model's own invention, which
// nobody should pay a second model to art-direct.
async function directBrand({ jobId, brandColors, provenance = "extracted", subject, brief, framePack, packVibe, tracker, signal }) {
  const colors = Array.isArray(brandColors) ? brandColors : ((brief && brief.brandColors) || []);
  const candidates = distillAccents(colors, MAX_CANDIDATES, { provenance });
  const subj = String(subject || (brief && brief.subject) || "").trim();

  // Nothing usable in the palette → let the pack own its accents.
  if (!candidates.length) return null;

  try {
    let skin = await buildSkin({ subject: subj, framePack, packVibe, candidates, provenance, tracker, signal });
    // The model chose to keep the pack's accents (skip) — honor it, but fall back to
    // the deterministic skin ONLY if a strongly-vivid MACHINE-QUANTIZED palette is on
    // the table (extracted off a website hero OR a logo) — so a clearly-branded product
    // still gets its color even on a terse model reply. Never against a palette a human
    // handed us (explicit): the skip-veto is the model's judgment of unlabeled buckets,
    // and overriding it on a deliberate pick would outvote the person whose brand it is.
    if (!skin && (provenance === "extracted" || provenance === "logo") && vividness(candidates[0]) >= 0.45) {
      skin = skinFrom(candidates, provenance);
    }
    persistBrandReview(jobId, skin, framePack);
    console.log(`[art_director] job ${jobId || "?"}: brand skin = ${skin ? `${skin.accents.join(", ")} (${skin.source}/${provenance})` : "none (pack accents kept)"}`);
    return skin;
  } catch (e) {
    // Fail open, but not silently: this path still SKINS the video, so the skin must
    // still reach the job. Returning it without persisting left brand_review null on a
    // visibly-branded film, and the Brand panel rendered nothing at all.
    console.warn(`[art_director] failed (${String((e && e.message) || e).slice(0, 140)}) — deterministic brand skin`);
    const skin = skinFrom(candidates, provenance);
    persistBrandReview(jobId, skin, framePack);
    return skin;
  }
}

module.exports = { directBrand, defaultBrandSkin, distillAccents, persistBrandReview };
