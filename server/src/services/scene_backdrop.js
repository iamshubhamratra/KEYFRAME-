// SCENE BACKDROPS — the background tier the native packs never had.
//
// THE DEFECT (VIDEO-QUALITY-AUDIT-2026-07-28 §2). Every native pack gates placement on
//
//   isTrustedProminent(a) || a.cdProminence === "hero" || a.cdProminence === "support"
//
// so an asset the Creative Director judged `background` is not demoted — it is DISCARDED.
// The scene-kit has somewhere for those to go (scrimmed B-roll); the ~19 native packs do
// not, so the asset is fetched, scored, assigned a scene, and then silently dropped.
// Measured on job 755o2m8g21: six assets on the wire, four in the composed HTML, and six
// of nine scenes rendering as a bare template panel.
//
// THE FIX, and why it is a post-process rather than 19 layout rewrites. Every pack emits
// its scenes as `<div class="clip …" id="sN" …>` and every pack shares
// `.clip { position:absolute; width:100%; height:100%; overflow:hidden }`. That is a
// reliable, uniform anchor: a first-child backdrop fills exactly the scene, is clipped by
// it, inherits its opacity animation (so it fades with the scene and needs no timeline of
// its own), and paints behind everything that follows it in DOM order.
//
// It is deliberately QUIET — a soft, blurred, desaturated wash at low opacity. This is a
// backdrop for a scene that would otherwise be empty, not a second hero. It works on light
// grounds (cream packs) and dark ones alike because it only tints.
//
// Pure + fail-open: on any surprise it returns the original HTML untouched.

const path = require("node:path");
const { execFileSync } = require("node:child_process");

// Only raster imagery makes a backdrop. SVGs are line art (they read as a smear when
// blurred), videos are a different beast, and the logo is key-moment material.
function backdropCandidate(a) {
  if (!a || !a.path) return false;
  if (String(a.role || "").toLowerCase() === "logo") return false;
  if (a.type === "video" || /\.(mp4|webm|mov)($|\?)/i.test(a.path)) return false;
  if (/\.svg($|\?)/i.test(a.path)) return false;
  return true;
}

// RESOLUTION GUARD — a full-bleed backdrop is `object-fit:cover`, so a small source is
// UPSCALED to fill the frame. Measured on job az6acpxzbz: the harvester's `a9.png` is a
// 256x256 site icon; covering a 720x1280 portrait frame scales it 5x, and the render shows
// exactly that — a giant blurred letterform sitting behind the copy, not a texture. No
// opacity setting rescues a 5x upscale, so the honest test is at selection time.
//
// `role: "logo"` above only catches the asset the pipeline TAGGED as the logo; a site's
// harvested icons arrive as ordinary website assets. Resolution catches them anyway, and
// catches every other too-small image with the same rule.
//
// Fail-open: if ffprobe is unavailable or the file cannot be read, the asset is allowed
// through — this guard may only ever REJECT on evidence, never on a missing measurement.
const MAX_COVER_UPSCALE = 2.0;
const _dimCache = new Map();

function imageDims(absPath) {
  if (_dimCache.has(absPath)) return _dimCache.get(absPath);
  let dims = null;
  try {
    const out = execFileSync("ffprobe", [
      "-v", "error", "-select_streams", "v:0",
      "-show_entries", "stream=width,height", "-of", "csv=p=0", absPath,
    ], { encoding: "utf8", timeout: 5000, windowsHide: true });
    const [w, h] = String(out).trim().split(",").map((n) => parseInt(n, 10));
    if (w > 0 && h > 0) dims = { w, h };
  } catch { dims = null; }
  _dimCache.set(absPath, dims);
  return dims;
}

// How far a source is stretched to COVER the frame: the larger of the two axis ratios.
function coverUpscale(dims, frame) {
  if (!dims || !frame || !(frame.w > 0) || !(frame.h > 0)) return null;
  return Math.max(frame.w / dims.w, frame.h / dims.h);
}

const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// GROUND-AWARE, and this is not a nicety — the first version was not.
//
// A blurred photo at 0.22 opacity is a reasonable wash on a dark stage and a WRECKING BALL
// on a cream one. Shipped against daybreak-bakehouse (ground #F7EEDD), it drew two fresh QA
// blockers: "the background violates the design system's light ground requirement by using
// a dark, reddish, busy image". The backdrop had filled every empty scene — and broken the
// pack's identity doing it.
//
// So the wash is now built to preserve the ground it lands on. On a LIGHT pack the image
// sits far fainter, is brightened and de-saturated toward paper, and carries a veil in the
// pack's own ground colour on top — the net effect is a whisper of texture in the pack's
// tone rather than a photograph showing through. On a DARK pack the original treatment is
// right and is kept.
function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
// Perceptual luminance (sRGB coefficients) — "is this a light stage or a dark one".
function lumOf(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
}
function isLightGround(hex) {
  const L = lumOf(hex);
  if (L == null) return false;                 // unknown ⇒ treat as dark (the safer wash)
  return L > 0.6;
}

// THE DARK WASH IS A BUDGET, NOT A CONSTANT — and the constant was wrong.
//
// The first dark treatment was a flat `opacity:0.22`, which silently assumes the image is
// about as dark as the stage. It is not, in general. Composited over a ground of luminance
// Lg, an image of luminance Li lands at
//
//     Lout = a*Li + (1-a)*Lg
//
// so a BRIGHT image on a NEAR-BLACK pack moves the ground a long way. Measured on job
// az6acpxzbz (ai-laboratory, ground #05060D, Lg=0.02) with a #C5C2C2 site icon (Li=0.76):
//
//     Lout = 0.22*0.76 + 0.78*0.02 = 0.184        (~#2F2F2F — a grey stage, not near-black)
//
// The render shows precisely that, and QA flagged it: "background ground color is too
// light, violating the dark #05060D specification". My change, my regression.
//
// The fix makes the ground survive BY CONSTRUCTION rather than by hoping the image is dark.
// The image is first clamped with `brightness(k)`, which scales luminance linearly, so the
// composited lift is bounded for EVERY image including white:
//
//     |Lout - Lg| = a*|k - Lg|  ≤  BUDGET     ⇒     a = BUDGET / |k - Lg|
//
// With k=0.30 and Lg=0.02 that yields a=0.16, and the worst case a white image can reach is
//
//     Lout = 0.16*0.30 + 0.84*0.02 = 0.065       (~#101010 — the pack's near-black holds)
//
// No measurement of the image is required, which keeps this function pure and synchronous:
// the bound holds for the brightest image that could possibly arrive.
const WASH_LUM_BUDGET = 0.045;   // how far the wash may move the pack's ground luminance
const DARK_IMG_BRIGHTNESS = 0.30; // every image is knocked down to at most this luminance

function darkWash(groundHex) {
  const Lg = lumOf(groundHex);
  const g = Lg == null ? 0.05 : Lg;                       // unknown ⇒ assume a dark stage
  // Guard the divide: a ground that sits exactly at the clamp has no headroom either way.
  const denom = Math.max(0.05, Math.abs(DARK_IMG_BRIGHTNESS - g));
  const a = Math.max(0.08, Math.min(0.30, WASH_LUM_BUDGET / denom));
  return { opacity: Math.round(a * 100) / 100, brightness: DARK_IMG_BRIGHTNESS };
}
function groundOf(framePack) {
  if (!framePack) return null;
  try {
    const m = require("./frame_manifest").getManifest(framePack);
    return (m && m.surface && m.surface.ground) || null;
  } catch { return null; }
}

// `data-layout-allow-occlusion` tells the spatial inspector this layer covers content ON
// PURPOSE — the same contract the composers' own decorative layers use.
function backdropHtml(assetPath, { light, ground }) {
  const dw = darkWash(ground);
  const imgStyle = light
    // Lifted toward paper: faint, bright, desaturated. It must read as texture, not as a photo.
    ? "opacity:0.10;filter:blur(5px) saturate(0.35) brightness(1.30) contrast(0.72);"
    : `opacity:${dw.opacity};filter:blur(3px) saturate(0.85) brightness(${dw.brightness});`;
  // On a light pack the ground colour itself is laid back over the image, so whatever the
  // photograph's hue, the scene still reads in the pack's tone.
  const veil = light && ground
    ? `<div style="position:absolute;inset:0;background:${esc(ground)};opacity:0.55;"></div>`
    : "";
  return `<div class="kf-scene-backdrop" data-layout-allow-occlusion aria-hidden="true" `
    + `style="position:absolute;inset:0;z-index:0;overflow:hidden;pointer-events:none;">`
    + `<img src="${esc(assetPath)}" alt="" `
    + `style="width:100%;height:100%;object-fit:cover;object-position:center;${imgStyle}transform:scale(1.06);">`
    + veil
    + `</div>`;
}

/**
 * injectSceneBackdrops({ indexHtml, assets, storyboard, framePack })
 *   → { html, injected: [{ sceneId, path }], reason? }
 *
 * Only scenes that reference NO asset get a backdrop, and only assets the composition
 * did not already place are used — this adds nothing to a scene that is already carrying
 * a visual, and never shows the same asset twice.
 */
function injectSceneBackdrops({ indexHtml, assets = [], storyboard = null, framePack = null, jobDir = null, dims = null } = {}) {
  const ground = groundOf(framePack);
  const tone = { light: isLightGround(ground), ground };
  const html = String(indexHtml || "");
  const injected = [];
  if (!html) return { html, injected, reason: "no html" };

  let pool = (Array.isArray(assets) ? assets : []).filter(backdropCandidate);
  if (!pool.length) return { html, injected, reason: "no raster assets" };

  // Drop anything that would have to be blown up to cover the frame. Only runs when the
  // caller supplied a jobDir to resolve the (jobDir-relative) asset paths against and the
  // frame size to compare with; without either, every candidate stays in the pool.
  const frame = dims && Number(dims.width) > 0 && Number(dims.height) > 0
    ? { w: Number(dims.width), h: Number(dims.height) } : null;
  const rejected = [];
  if (jobDir && frame) {
    pool = pool.filter((a) => {
      const up = coverUpscale(imageDims(path.join(jobDir, a.path)), frame);
      if (up != null && up > MAX_COVER_UPSCALE) {
        rejected.push(`${path.basename(a.path)} (${up.toFixed(1)}x)`);
        return false;
      }
      return true;
    });
    if (rejected.length) console.log(`[backdrop] too small to fill the frame, skipped: ${rejected.join(", ")}`);
    if (!pool.length) return { html, injected, reason: "every spare asset is too small to fill the frame" };
  }

  // Which assets did the composition already place? Compare on the basename too: some
  // composers rewrite paths (./assets/x.png vs assets/x.png).
  const placed = new Set();
  for (const a of pool) {
    const base = path.basename(a.path);
    if (html.includes(a.path) || (base && html.includes(base))) placed.add(a.path);
  }
  const spare = pool.filter((a) => !placed.has(a.path));
  if (!spare.length) return { html, injected, reason: "every asset already placed" };

  // Walk the scene containers in document order. A scene "has a visual" if any asset path
  // appears between its opening tag and the next scene's.
  const openRe = /<div[^>]*\bclass="[^"]*\bclip\b[^"]*"[^>]*\bid="(s\d+)"[^>]*>/g;
  const scenes = [];
  let m;
  while ((m = openRe.exec(html)) !== null) scenes.push({ id: m[1], tagEnd: m.index + m[0].length, tagStart: m.index });
  if (!scenes.length) return { html, injected, reason: "no scene containers found" };

  const sceneOrder = (Array.isArray(storyboard && storyboard.scenes) ? storyboard.scenes : [])
    .map((s, i) => (s && s.id != null ? String(s.id) : `s${i + 1}`));

  // Prefer giving a scene the asset that was ASSIGNED to it; fall back to any spare, so a
  // film never leaves a usable image unused while a scene sits empty.
  const byScene = new Map();
  spare.forEach((a) => {
    if (a.sceneId == null) return;
    const k = String(a.sceneId);
    if (!byScene.has(k)) byScene.set(k, []);
    byScene.get(k).push(a);
  });
  const taken = new Set();
  const takeFor = (clipId, index) => {
    // The container id is positional (s1, s2…); the asset's sceneId is the SCRIPT's id,
    // which may differ. Map through the storyboard order when we can.
    const scriptId = sceneOrder[index] != null ? String(sceneOrder[index]) : clipId;
    for (const key of [scriptId, clipId]) {
      const arr = byScene.get(key) || [];
      const hit = arr.find((a) => !taken.has(a.path));
      if (hit) { taken.add(hit.path); return hit; }
    }
    const any = spare.find((a) => !taken.has(a.path));
    if (any) { taken.add(any.path); return any; }
    return null;
  };

  // Build the output back-to-front so earlier offsets stay valid.
  let out = html;
  for (let i = scenes.length - 1; i >= 0; i--) {
    const sc = scenes[i];
    const bodyEnd = i + 1 < scenes.length ? scenes[i + 1].tagStart : html.length;
    const body = html.slice(sc.tagEnd, bodyEnd);
    const hasVisual = pool.some((a) => body.includes(a.path) || body.includes(path.basename(a.path)));
    if (hasVisual) continue;
    // A SCENE WITH NO PICTURE IS NOT NECESSARILY AN EMPTY SCENE. A designed closing beat —
    // a full-bleed accent field, or a dark ground carrying the wordmark and the address — is
    // deliberately image-free, and pasting a spare stock photo behind it destroys both the
    // composition and the contrast the type was chosen for (a real job shipped a white
    // sign-off over a mid-grey photo). Composers mark such scenes; everything else still gets
    // rescued, which is the whole point of this pass.
    if (/\bdata-no-backdrop\b/.test(html.slice(sc.tagStart, sc.tagEnd))) continue;
    const pick = takeFor(sc.id, i);
    if (!pick) continue;
    out = out.slice(0, sc.tagEnd) + backdropHtml(pick.path, tone) + out.slice(sc.tagEnd);
    injected.unshift({ sceneId: sc.id, path: pick.path });
  }

  return { html: out, injected };
}

// ---------------------------------------------------------------- portrait text safety
//
// The other half of the 9:16 defect list: copy CLIPPED at the frame edge — "Meet Claud…"
// running off the right, a headline overlapped by a panel. In a 720-wide column a long
// unbroken word (a product name, a URL, a compound) has nowhere to go, and the packs style
// headlines with explicit sizes rather than a wrapping contract, so the glyphs simply
// leave the frame.
//
// This is a stylesheet, not a layout rewrite: it makes text WRAP rather than overflow, and
// it does so generically — it targets the scene container every pack shares, so no pack
// needs editing and no pack's design decisions are overridden. It cannot move an element
// or change a size; the worst it can do is break a long word onto a second line, which is
// strictly better than that word leaving the canvas.
//
// Portrait only: in landscape there is room and the packs were authored against it.
const PORTRAIT_TEXT_CSS = `
/* KEYFRAME portrait text safety — see services/scene_backdrop.js */
.clip, .clip * { min-width: 0; }
.clip h1, .clip h2, .clip h3, .clip p, .clip span, .clip div {
  overflow-wrap: anywhere; word-break: normal; hyphens: auto;
}
.clip { overflow: hidden; }
`.trim();

/**
 * injectPortraitTextSafety({ indexHtml, dims }) → { html, applied }
 * No-op outside portrait, and on any document that already carries it.
 */
function injectPortraitTextSafety({ indexHtml, dims } = {}) {
  const html = String(indexHtml || "");
  const W = dims && Number(dims.width), H = dims && Number(dims.height);
  if (!html || !(H > W)) return { html, applied: false };
  if (html.includes("KEYFRAME portrait text safety")) return { html, applied: false };
  const at = html.lastIndexOf("</style>");
  if (at < 0) return { html, applied: false };   // no stylesheet to extend — leave it alone
  return { html: html.slice(0, at) + "\n" + PORTRAIT_TEXT_CSS + "\n" + html.slice(at), applied: true };
}

module.exports = { injectSceneBackdrops, backdropCandidate, injectPortraitTextSafety, darkWash, lumOf, coverUpscale };
