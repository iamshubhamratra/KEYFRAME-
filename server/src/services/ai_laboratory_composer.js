// AI LABORATORY composer — a native GSAP + canvas "neural research lab" film.
// The pack `ai-laboratory` (manifest renderer:"ai-laboratory") routes here from
// attemptLlmComposition, exactly like the flagship / kinetic / product-showcase
// / blueprint composers.
//
// Ported from the imported OmniMotion/React template ("AI Laboratory"). The React
// runtime is replaced by KEYFRAME's HyperFrames contract, but the identity is kept:
//   • a PERSISTENT animated LAB LATTICE backdrop — a living network of glowing
//     NODES + CONNECTIONS that pulse and fire signals, a slow HUD scanline, corner
//     HUD brackets and a vignette — painted on ONE <canvas> as a pure function of the
//     renderer's hf-seek time (deterministic; flows continuously across every cut).
//   • a model that BOOTS and ignites, a prompt that TOKENIZES into latent space, a
//     neural NETWORK that builds and fires, frames that SYNTHESIZE from scanlines, a
//     scientific HUD READOUT, holographic screenshot PANELS in the network, and a
//     nodes-converge-to-mark CTA.
//
// EVERYTHING is theme-driven: labTheme(accent) derives the lab tint, the node glow,
// the edges, the panel surface, the gradient type and the CTA — so a brand skin
// recolors the WHOLE film (backgrounds, lattice, glows, nodes, panels, accents),
// not just text.
//
// Engineering contract (identical to the other native composers): one paused GSAP
// timeline on window.__timelines["vid"]; direct-child .clip scenes on unique tracks;
// a boundary opacity:0 hard-kill per scene (the Lab persists behind them); ONE
// seek-safe caption node (#cap-text) driven by a single onUpdate proxy; finite
// repeats; cqw units + container-type:size (portrait-native, 9:16); hidden =
// opacity:0 only. Portrait is detected from dims (W<H); no manifest flag. Deterministic.

const { fontFaceCss, isBundled } = require("../fonts/pack_fonts");
const { varyArchetypes } = require("./motion_planner");
const { isTrustedProminent, isLogo } = require("./asset_priority");
const { logoMark } = require("./logo_render");
const { plateBox } = require("./responsive");
const { charSpans, wordCharSpans } = require("./text_fx");
const { resolveBrand } = require("./brand_kit");
const { GSAP_CDN, r, esc, hexToRgb, relLum, longestWord, bullets, logoAssetOf, grainUri } = require("./composer_kit");

// The template's display face is Sora (a geometric grotesque); Space Grotesk (bundled)
// carries the same clean-scientific spirit; JetBrains Mono is the bundled HUD/mono
// face the template also uses; Inter → system-ui in the CDN-free render.
const DISPLAY = "Space Grotesk";
const MONO = "JetBrains Mono";
const BODY = "Inter";

// The template's default electric-signal accent + near-black lab grounds (no brand).
const DEF_ACCENT = "#00E5C0";
const GROUND = "#05060D";     // deep near-black lab ground
const GROUND_MID = "#0B0E1A"; // panel / surface ground

// ---- helpers -----------------------------------------------------------------
function seedFrom(str) { let h = 2166136261; const s = String(str || "ailab"); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) || 7; }
// finite yoyo repeat count for a segment of `t` seconds at period `c`.
function reps(t, c) { return Math.max(0, Math.floor((Number(t) || 0) / (c || 1)) - 1); }
// deterministic 0..1 hash for firing-signal selection (matches the template's hash()).
function hashF(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

// ---- theme -------------------------------------------------------------------
// resolveBrand fits the brand accent to the near-black lab ground (isDark:true → lifted
// for contrast) and passes the pack accent through untouched when no skin — so a null
// skin renders the exact default Lab byte-for-byte and resolvedBrand is null (honest
// "unbranded"). Applied → the single accent becomes the brand's and every derived value
// (lattice glow, edges, node fill, panel surface, gradient, CTA) follows, and
// resolvedBrand echoes what was worn.
function labTheme(brandSkin) {
  const fontFace = (isBundled(DISPLAY) ? fontFaceCss(DISPLAY) : "") + (isBundled(MONO) ? fontFaceCss(MONO) : "");
  let accent = DEF_ACCENT, resolvedBrand = null;
  try {
    const brand = resolveBrand(brandSkin, { ground: GROUND, isDark: true, packAccents: [DEF_ACCENT] });
    if (brand.applied) {
      accent = brand.accent || accent;
      resolvedBrand = {
        ...(brandSkin && typeof brandSkin === "object" ? brandSkin : {}),
        accents: [accent], emphasis: brand.emphasis, adjusted: brand.adjusted,
        dropped: brand.dropped, tier: brand.tier, applied: true,
      };
    }
  } catch { accent = DEF_ACCENT; resolvedBrand = null; }
  const onAccent = relLum(accent) > 0.55 ? "#05060D" : "#05060D"; // electric accents read on near-black ink
  return {
    accent, onAccent, ground: GROUND, groundMid: GROUND_MID,
    ink: "#EAF1FF", dim: "rgba(234,241,255,0.58)", faint: "rgba(234,241,255,0.30)",
    panelBg: GROUND_MID,
    panel: `color-mix(in oklab, ${accent} 10%, ${GROUND_MID})`,
    surface: `color-mix(in oklab, ${accent} 13%, ${GROUND_MID})`,
    edge: `color-mix(in oklab, ${accent} 42%, transparent)`,
    edgeFaint: `color-mix(in oklab, ${accent} 16%, transparent)`,
    border: `color-mix(in oklab, ${accent} 42%, transparent)`,
    line: `color-mix(in oklab, ${accent} 20%, transparent)`,
    accentSoft: `color-mix(in oklab, ${accent} 40%, transparent)`,
    gradient: `linear-gradient(120deg, ${accent}, color-mix(in oklab, ${accent} 52%, #ffffff))`,
    displayStack: `'${DISPLAY}', 'Inter', system-ui, sans-serif`,
    monoStack: `'${MONO}', ui-monospace, monospace`,
    bodyStack: `'${BODY}', system-ui, sans-serif`,
    fontFace, resolvedBrand,
  };
}

// ---- fixed copy (localizable — fallback labels only, never demo content) ------
const STRINGS = {
  bootKicker: "Initializing model",
  bootStatus: "[ MODEL ONLINE ]",
  inputKicker: "Input · Tokenize",
  inputEncode: "Encoding → latent space",
  networkKicker: "Inference",
  networkReadout: "Neural network · firing",
  synthesisKicker: "Frame synthesis",
  synthesisStep: "Denoising · rendering",
  readoutKicker: "Telemetry",
  showcaseKicker: "Rendered output",
  ctaKicker: "The lab is open",
  ctaButton: "Start generating",
  ctaTagline: "Neural video synthesis.",
  ctaUrl: "keyframe.ai",
  promptPlaceholder: "Describe your video…",
  syntComplete: "Synthesis complete",
  renderReady: "Render ready",
};

// ---- content extraction (shared shapes) --------------------------------------
function wordsOf(t) { return String(t || "").trim().split(/\s+/).filter(Boolean); }
function pickNumberStr(scene) {
  return [scene.emphasis, ...(Array.isArray(scene.onScreenText) ? scene.onScreenText : []), scene.subtext, scene.headline]
    .map((x) => String(x || "")).find((x) => /\d/.test(x)) || "";
}
function hasNumber(scene) { return /\d/.test(pickNumberStr(scene)); }
// Headline sized so long copy never overflows the portrait column.
// PORTRAIT FILL. The length ladder below keeps long copy from overflowing the column —
// but it is aspect-BLIND, and cqw is a fraction of WIDTH, so a headline occupies the same
// share of the line in 16:9 and 9:16 while a 9:16 frame is 177cqw TALL. Short headlines
// therefore sat as a small line in a very tall empty frame: the "under-illustrated /
// massive empty space" blocker the 9:16 audit kept finding.
//
// In portrait the slack is spent on the headlines that HAVE slack: short copy grows, long
// copy is left exactly where the ladder put it, so nothing that previously fitted starts
// to overflow.  is set once per build (see buildComposition).
let _portrait = false;
function headlineSize(text, base) {
  const str = String(text || "");
  const len = str.length;
  const s = len > 42 ? base * 0.62 : len > 28 ? base * 0.76 : len > 18 ? base * 0.88 : base;
  const p = _portrait ? s * (len > 28 ? 1.0 : len > 18 ? 1.08 : 1.18) : s;
  // THE LADDER IS NOT A FIT. It buckets by total character count, which decides how many
  // LINES the headline needs — not whether it fits the frame. Headlines here are word spans
  // (`display:inline-block`), so they wrap between words and the binding constraint is the
  // LONGEST WORD: that word cannot break, so if it is wider than the column it leaves the
  // frame no matter how many lines are available. Capping on the whole string instead would
  // shrink perfectly good two-line headlines for no reason.
  //
  // Measured: "Integrated Tools" came out of the ladder at 15.34cqw in portrait. Whole-string
  // width is 137cqw — apparently a disaster — but it wraps to "Integrated" / "Tools" and the
  // longest word needs only 86cqw, so it fits and the ladder's size is kept.
  return Math.min(p, fitSize(longestWord(str), Infinity));
}
// FIT, rather than guess. `headlineSize` buckets by character count, which is a proxy for
// width and a poor one at large base sizes: at 11cqw an 18-character line needs ~109cqw on a
// 100cqw-wide stage no matter which bucket it lands in. This solves for the size instead —
// the largest that still fits the given width — and never returns MORE than the art-directed
// base, so short copy keeps the design and only over-long copy is pulled back.
//
// 0.56em is the mean advance of the heavy display face at its -0.02em tracking; it is an
// estimate, so callers pair it with a wrapping container as the safety net.
const MEAN_ADVANCE_EM = 0.56;
function fitSize(text, base, widthCqw = 92) {
  const len = String(text || "").length;
  if (!len) return base;
  return Math.min(base, widthCqw / (len * MEAN_ADVANCE_EM));
}
// Split a headline into word spans for the reveal; the last word carries the accent.
function accentWords(id, text) {
  const ws = wordsOf(text).slice(0, 10);
  return ws.map((w) =>
    `<span class="ai-gword ${id}-gw" style="display:inline-block;opacity:0;margin:0 0.22em 0.08em 0;">${esc(w)}</span>`
  ).join("");
}

// ---- asset gate + holographic PANEL ------------------------------------------
function screenOk(a) {
  if (!a || !a.path) return false;
  if (isLogo(a)) return false; // the logo is CTA / key-moment material, not a lab panel
  if (a.type === "video" || /\.(mp4|webm|mov)($|\?)/i.test(a.path)) return false;
  if (/\.svg($|\?)/i.test(a.path)) return false;
  return isTrustedProminent(a) || a.cdProminence === "hero" || a.cdProminence === "support";
}

// A holographic lab panel holding a real screenshot — or, with no asset, an intentional
// branded placeholder (gradient wash + faint holographic grid + glowing node) so an empty
// slot still reads as designed, never blank. Absolutely filled; the caller sizes it.
function panelFrame(theme, asset, radius) {
  const inner = asset && asset.path
    ? `<img src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;">`
    : `<div style="position:absolute;inset:0;background:${theme.gradient};opacity:0.26;"></div>` +
      `<div style="position:absolute;inset:0;background-image:linear-gradient(${theme.line} 1px,transparent 1px),linear-gradient(90deg,${theme.line} 1px,transparent 1px);background-size:14% 10%;opacity:0.55;"></div>` +
      `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;"><div style="width:15%;aspect-ratio:1;border-radius:50%;background:${theme.gradient};box-shadow:0 0 4cqw ${theme.accent};opacity:0.9;"></div></div>`;
  return `<div class="ai-pf" style="position:absolute;inset:0;border-radius:${radius || "2.4cqw"};overflow:hidden;background:${theme.surface};border:0.16cqw solid ${theme.border};box-shadow:0 0 7cqw -1cqw ${theme.accent}, 0 4cqw 12cqw -6cqw rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05) inset;">
    ${inner}
    <div style="position:absolute;inset:0;background:linear-gradient(120deg, ${theme.accent}33, transparent 44%);mix-blend-mode:screen;pointer-events:none;"></div>
    <div style="position:absolute;left:0;right:0;top:0;height:32%;background:linear-gradient(rgba(255,255,255,0.12),transparent);pointer-events:none;"></div>
    <div style="position:absolute;inset:0;background-image:repeating-linear-gradient(${theme.edgeFaint} 0 1px, transparent 1px 5px);opacity:0.4;pointer-events:none;"></div>
  </div>`;
}
// A holographic panel that floats. GSAP animates the OUTER `.${id}-panel` (opacity/y/scale
// entrance + float); the 3D tilt is static CSS on an inner wrapper GSAP never touches.
function panelBlock(id, theme, { w, hcqw, asset, tilt }) {
  const frame = panelFrame(theme, asset, "3cqw");
  const t = tilt || 0;
  return `<div class="${id}-panel" style="opacity:0;width:${w};perspective:1500px;">
    <div style="position:relative;width:100%;height:${r(hcqw)}cqw;transform:rotateY(${t}deg);transform-style:preserve-3d;">${frame}</div>
    <div aria-hidden="true" style="position:relative;width:100%;height:${r(hcqw)}cqw;transform:scaleY(-1);opacity:0.12;margin-top:0.5cqw;-webkit-mask-image:linear-gradient(transparent 46%,#000);mask-image:linear-gradient(transparent 46%,#000);">${frame}</div>
  </div>`;
}
// Portrait screenshots want a tall frame; wide screenshots a shorter one.
function frameHmul(asset) {
  const ratio = Number(asset && asset.ratio) || (asset && asset.width && asset.height ? asset.width / asset.height : 0);
  if (ratio && ratio < 0.9) return 1.5;   // phone / portrait shot
  if (ratio && ratio > 1.6) return 0.62;  // wide desktop / dashboard
  return 1.0;                             // square-ish default
}

// PORTRAIT PLATE SIZING. `frameHmul` above sets this pack's frame PROPORTIONS; nothing
// was checking the resulting plate against how tall the frame actually is. In a 9:16
// column (177.8cqw tall) the fixed widths below left a plate at ~20-30% of the height
// with the rest empty, and a portrait phone capture overflowed its band. plateBox scales
// the pack's own (width, height) pair uniformly — so these proportions and every
// downstream `parseFloat(pw) * frameHmul(asset)` height stay correct — and is a no-op in
// landscape, where the existing layouts were tuned. See services/responsive.js.
function fitPlateW(ctx, wCqw, asset) {
  const w0 = typeof wCqw === "string" ? parseFloat(wCqw) : Number(wCqw);
  const box = plateBox(ctx && ctx.W, ctx && ctx.H, w0, w0 * frameHmul(asset));
  return `${box.w}cqw`;
}


// ---- scene clip open ---------------------------------------------------------
function open(id, ctx) { return `<div class="clip ai-scene" id="${id}" data-start="${ctx.T}" data-duration="${r(ctx.L)}" data-track-index="${ctx.track}" style="opacity:0;">`; }

// ---- archetype selection -----------------------------------------------------
function archetypeFor(scene, i, total) {
  const k = String(scene.kind || "").toLowerCase();
  const p = String(scene.purpose || "").toLowerCase();
  if (i === 0 || k === "hook" || k === "title" || /hook|intro|open|boot/.test(p)) return "boot";
  if (i === total - 1 || k === "cta" || /cta|close|sign\s*up|subscribe|download|get\s*started/.test(p)) return "cta";
  if (k === "quote" || /quote|testimonial|manifesto|prompt|input/.test(p)) return "input";
  if (k === "stat" || k === "chart" || k === "countdown" || (hasNumber(scene) && /proof|result|metric|stat|number|telemetry/.test(p + k))) return "readout";
  if (/reveal|final|generate|synthes|output|render/.test(p + k)) return "synthesis";
  if (bullets(scene, 2).length >= 2 || /network|inference|model|how|process|step/.test(p + k)) return "network";
  return "showcase";
}

// ---- scene builders ((scene, ctx, assets) -> {html, s}) ----------------------

// SCENE — BOOT: a central model core ignites, the display title rises (last word in
// accent) and a mono status line settles. Opener energy.
function bBoot(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S, portrait } = ctx;
  const asset = (sceneAssets && sceneAssets[0]) || null;
  const bw = parseFloat(fitPlateW(ctx, portrait ? 48 : 32, asset));
  const kick = esc(scene.kicker || S.bootKicker);
  const title = scene.headline || scene.title || "";
  const html = `${open(id, ctx)}<div class="ai-safe" style="justify-content:center;">
    <div class="${id}-core" style="opacity:0;width:14cqw;height:14cqw;border-radius:50%;background:${theme.accent};box-shadow:0 0 8cqw ${theme.accent};margin-bottom:6cqw;"></div>
    <div class="ai-kicker ${id}-kick" style="opacity:0;margin-bottom:3cqw;">${kick}</div>
    <div class="ai-display ${id}-title" style="opacity:0;text-align:center;font-size:${r(headlineSize(title, 13))}cqw;">${accentWords(id, title)}</div>
    <div class="ai-mono ${id}-sub" style="opacity:0;margin-top:3.4cqw;">${esc(scene.subtext ? String(scene.subtext) : S.bootStatus)}</div>${asset ? `<div class="${id}-panel" style="opacity:0;width:${bw}cqw;margin-top:5cqw;perspective:1500px;"><div style="position:relative;width:100%;height:${r(bw * frameHmul(asset))}cqw;transform:rotateY(-6deg);transform-style:preserve-3d;">${panelFrame(theme, asset, "2.6cqw")}</div></div>` : ""}
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.4},${T});`,
    `tl.fromTo(".${id}-core",{opacity:0,scale:0.1},{opacity:1,scale:1,duration:0.55,ease:"back.out(2)"},${r(T + 0.25)});`,
    `tl.to(".${id}-core",{scale:1.12,duration:1.1,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 0.9, 1.1)},overwrite:"auto",transformOrigin:"center center"},${r(T + 0.9)});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-16},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.5)});`,
    `tl.fromTo(".${id}-title",{opacity:0,y:30,scale:0.94},{opacity:1,y:0,scale:1,duration:0.7,ease:"power3.out"},${r(T + 0.7)});`,
    `tl.fromTo(".${id}-gw",{opacity:0,y:22},{opacity:1,y:0,duration:0.5,ease:"back.out(1.6)",stagger:0.06},${r(T + 0.75)});`,
    `tl.fromTo(".${id}-sub",{opacity:0,y:14},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 1.2)});`,
    asset ? `tl.fromTo(".${id}-panel",{opacity:0,y:54,scale:0.88},{opacity:1,y:0,scale:1,duration:0.75,ease:"power3.out"},${r(T + 1.5)});` : "",
    asset ? `tl.to(".${id}-panel",{y:"-=1.4cqw",duration:2,ease:"sine.inOut",yoyo:true,repeat:${reps(Math.max(1, L - 2.3), 2)},overwrite:"auto"},${r(T + 2.3)});` : "",
  ];
  return { html, s };
}

// SCENE — INPUT: a mono input panel types the headline behind a "> " prompt with a
// blinking caret; token chips stream down into a latent-space node. For quotes / prompts.
function bInput(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S, portrait } = ctx;
  const asset = (sceneAssets && sceneAssets[0]) || null;
  const iw = portrait ? 44 : 30;
  const ih = r(iw * frameHmul(asset));
  const kick = esc(scene.kicker || S.inputKicker);
  const prompt = String(scene.headline || scene.title || scene.subtext || S.promptPlaceholder).slice(0, 96);
  // TOKENS ARE WORDS. The scene's whole conceit is a prompt being tokenized, and each chip
  // is `white-space:nowrap`, absolutely positioned and centred on its own x — so its width
  // is whatever its text needs, and a chip centred near the edge of the 16%..84% band runs
  // straight off the frame. That stayed hidden while onScreenText held bare two-word titles.
  // Once every scene carries a supporting line (services/script.js content floor), the same
  // code was handed "Built for scientific discovery" and clipped it at the frame edge.
  //
  // Feeding it WORDS is both the correct reading of the scene (a tokenizer emits tokens, not
  // sentences) and a hard bound on chip width: at 2.4cqw mono a 14-character token is ~24cqw
  // wide including padding, so even centred at the edge of the tightened band it stays on
  // screen. Long words are dropped rather than cut — a token is a sample, not a caption.
  const MAX_TOK_CHARS = 14;
  const copy = Array.isArray(scene.onScreenText) ? scene.onScreenText.filter(Boolean).map(String) : [];
  let toks = wordsOf(copy.length ? copy.join(" ") : prompt).filter((w) => w.length <= MAX_TOK_CHARS);
  if (!toks.length) toks = wordsOf(prompt).map((w) => w.slice(0, MAX_TOK_CHARS));
  toks = toks.slice(0, 6);
  const tokHtml = toks.map((tk, i) => {
    const lx = 24 + (i / Math.max(1, toks.length - 1)) * 52; // 24%..76% — keeps a wide chip inside the frame
    return `<div class="${id}-tok" data-i="${i}" style="position:absolute;left:${r(lx)}%;top:44%;transform:translate(-50%,-50%);opacity:0;font-family:${theme.monoStack};font-size:2.4cqw;color:${theme.accent};border:0.14cqw solid ${theme.edge};padding:0.8cqw 2cqw;background:${theme.ground};white-space:nowrap;border-radius:1cqw;">${esc(tk)}</div>`;
  }).join("");
  const html = `${open(id, ctx)}<div class="clip" style="position:absolute;inset:0;">
    <div class="ai-kicker ${id}-kick" style="position:absolute;left:8%;top:20%;opacity:0;">${kick}</div>
    <div class="${id}-bar" style="position:absolute;left:8%;right:8%;top:24%;opacity:0;">
      <div class="ai-promptbar">
        <span style="font-family:${theme.monoStack};font-size:3.4cqw;color:${theme.accent};">&gt;_</span>
        <div class="ai-prompttext"><span id="${id}-typed"></span><span class="${id}-caret" style="color:${theme.accent};">▋</span></div>
      </div>
    </div>
    ${tokHtml}
    ${asset ? `<div class="${id}-panel" style="position:absolute;left:50%;top:64%;transform:translate(-50%,-50%);width:${iw}cqw;opacity:0;"><div style="position:relative;width:100%;height:${ih}cqw;">${panelFrame(theme, asset, "2.4cqw")}</div></div>` : `<div class="${id}-node" style="position:absolute;left:50%;top:72%;transform:translate(-50%,-50%);width:9cqw;height:9cqw;border-radius:50%;background:${theme.accent};box-shadow:0 0 6cqw ${theme.accent};opacity:0;"></div>`}
    <div class="${id}-enc" style="position:absolute;left:0;right:0;top:80%;text-align:center;opacity:0;font-family:${theme.monoStack};font-size:2.4cqw;letter-spacing:0.16em;color:${theme.dim};text-transform:uppercase;">${esc(S.inputEncode)}</div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.4},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-16},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.2)});`,
    `tl.fromTo(".${id}-bar",{opacity:0,y:26,scaleY:0.7},{opacity:1,y:0,scaleY:1,duration:0.55,ease:"power3.out",transformOrigin:"top"},${r(T + 0.35)});`,
    `type("#${id}-typed",${JSON.stringify(prompt)},${r(T + 0.7)},${r(Math.max(0.8, L * 0.5))});`,
    `tl.to(".${id}-caret",{opacity:0,duration:0.42,ease:"steps(1)",yoyo:true,repeat:${reps(L * 0.7, 0.42)}},${r(T + 0.7)});`,
    toks.length ? `tl.fromTo(".${id}-tok",{opacity:0,scale:0.6},{opacity:0.95,scale:1,duration:0.4,ease:"back.out(1.5)",stagger:0.06},${r(T + 0.9)});` : "",
    toks.length ? `tl.to(".${id}-tok",{top:"72%",left:"50%",opacity:0,duration:0.7,ease:"power2.in",stagger:0.06},${r(T + L * 0.58)});` : "",
    asset ? `tl.fromTo(".${id}-panel",{opacity:0,y:44,scale:0.86},{opacity:1,y:0,scale:1,duration:0.7,ease:"power3.out"},${r(T + 0.55)});` : `tl.fromTo(".${id}-node",{opacity:0,scale:0.3},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.8)"},${r(T + L * 0.6)});`,
    asset ? `tl.to(".${id}-panel",{y:"-=1.4cqw",duration:2,ease:"sine.inOut",yoyo:true,repeat:${reps(Math.max(1, L - 1.6), 2)},overwrite:"auto"},${r(T + 1.5)});` : `tl.to(".${id}-node",{scale:1.16,duration:0.9,ease:"sine.inOut",yoyo:true,repeat:${reps(L * 0.3, 0.9)},overwrite:"auto",transformOrigin:"center center"},${r(T + L * 0.66)});`,
    `tl.fromTo(".${id}-enc",{opacity:0,y:12},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + L * 0.64)});`,
  ].filter(Boolean);
  return { html, s };
}

// SCENE — NETWORK: a fig-labelled headline over a layered neural NET (nodes + edges)
// that builds and fires signal dots along its connections, plus a mono readout. The
// signature "the model" moment. Text-only (screenshots redistribute to showcase).
function bNetwork(scene, ctx) {
  const { id, T, L, theme, S, portrait } = ctx;
  const kick = esc(scene.kicker || S.networkKicker);
  const layers = portrait ? [3, 5, 5, 3] : [3, 6, 6, 4];
  const rows = layers.length;
  const box = portrait ? { x: 12, y: 50, w: 76, h: 92 } : { x: 26, y: 26, w: 48, h: 46 };
  const nodes = layers.map((n, li) => {
    const y = box.y + (rows === 1 ? 0.5 : li / (rows - 1)) * box.h;
    return Array.from({ length: n }, (_, ni) => ({ x: box.x + (n === 1 ? 0.5 : ni / (n - 1)) * box.w, y }));
  });
  const edges = [];
  for (let li = 0; li < rows - 1; li++)
    for (let a = 0; a < layers[li]; a++)
      for (let b = 0; b < layers[li + 1]; b++)
        edges.push({ from: nodes[li][a], to: nodes[li + 1][b], layer: li });

  const edgeHtml = edges.map((e) => {
    const dx = e.to.x - e.from.x, dy = e.to.y - e.from.y;
    const len = Math.hypot(dx, dy), ang = Math.atan2(dy, dx) * 180 / Math.PI;
    // Rotation is STATIC on the wrapper; GSAP only ever touches the inner line's scaleX.
    return `<div style="position:absolute;left:${r(e.from.x)}cqw;top:${r(e.from.y)}cqw;transform:rotate(${r(ang)}deg);transform-origin:0 50%;"><div class="${id}-edge" style="width:${r(len)}cqw;height:0.26cqw;background:${theme.edgeFaint};transform-origin:0 50%;transform:scaleX(0);"></div></div>`;
  }).join("");
  const nodeHtml = nodes.map((layer, li) => layer.map((nd) => {
    const sz = 1.8 + (li === 0 || li === rows - 1 ? 0.8 : 0);
    return `<div class="${id}-node" style="position:absolute;left:${r(nd.x)}cqw;top:${r(nd.y)}cqw;width:${sz}cqw;height:${sz}cqw;margin-left:${r(-sz / 2)}cqw;margin-top:${r(-sz / 2)}cqw;border-radius:50%;background:${theme.accent};box-shadow:0 0 ${r(sz * 1.6)}cqw ${theme.accent};opacity:0;"></div>`;
  }).join("")).join("");
  // firing signals travel along a deterministic subset of edges.
  const sigEdges = edges.filter((_, i) => hashF(i) < 0.24).slice(0, 12);
  const sigHtml = sigEdges.map((e, si) =>
    `<div class="${id}-sig${si}" style="position:absolute;left:${r(e.from.x)}cqw;top:${r(e.from.y)}cqw;width:1.3cqw;height:1.3cqw;margin-left:-0.65cqw;margin-top:-0.65cqw;border-radius:50%;background:${theme.accent};box-shadow:0 0 2cqw ${theme.accent};opacity:0;"></div>`
  ).join("");
  const readout = esc(bullets(scene, 1)[0] || S.networkReadout);

  const html = `${open(id, ctx)}<div class="clip" style="position:absolute;inset:0;">
    <div style="position:absolute;left:8%;top:12%;opacity:0;" class="${id}-head">
      <div class="ai-kicker">${kick}</div>
      <div class="ai-h1" style="text-align:left;font-size:${r(headlineSize(scene.headline, 8))}cqw;margin-top:1.6cqw;">${esc(scene.headline || scene.title || "")}</div>
    </div>
    ${edgeHtml}
    ${nodeHtml}
    ${sigHtml}
    <div class="${id}-read" style="position:absolute;left:0;right:0;bottom:12%;text-align:center;opacity:0;font-family:${theme.monoStack};font-size:2.4cqw;letter-spacing:0.16em;color:${theme.dim};text-transform:uppercase;">${readout}</div>
  </div></div>`;

  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
    `tl.fromTo(".${id}-head",{opacity:0,y:-16},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.2)});`,
    `tl.fromTo(".${id}-edge",{scaleX:0},{scaleX:1,duration:0.5,ease:"power2.inOut",stagger:0.012},${r(T + 0.4)});`,
    `tl.fromTo(".${id}-node",{opacity:0,scale:0.2},{opacity:1,scale:1,duration:0.45,ease:"back.out(1.7)",stagger:0.02},${r(T + 0.7)});`,
    `tl.to(".${id}-node",{opacity:0.6,duration:0.5,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.4, 0.5)},stagger:{each:0.03,from:"random"},overwrite:"auto"},${r(T + 1.4)});`,
    `tl.fromTo(".${id}-read",{opacity:0,y:12},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 1.1)});`,
  ];
  sigEdges.forEach((e, si) => {
    const start = r(T + 1.0 + si * 0.04);
    const period = 1.1;
    s.push(`tl.fromTo(".${id}-sig${si}",{opacity:1,left:"${r(e.from.x)}cqw",top:"${r(e.from.y)}cqw"},{opacity:1,left:"${r(e.to.x)}cqw",top:"${r(e.to.y)}cqw",duration:${period},ease:"none",repeat:${reps(Math.max(1.1, L - 1.4 - si * 0.04), period)}},${start});`);
  });
  return { html, s };
}

// SCENE — SYNTHESIS: radiating rays fan out, a burst blooms and a holographic panel
// RENDERS in as a scanline mask retracts downward, then a big gradient tagline lands
// with a flash. The dramatic generation peak. Holds one screenshot.
function bSynthesis(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S, portrait } = ctx;
  const asset = (sceneAssets && sceneAssets[0]) || null;
  const hmul = frameHmul(asset);
  const kick = esc(scene.kicker || S.synthesisKicker);
  const rays = Array.from({ length: 24 }).map((_, i) => {
    const ang = (i / 24) * 360;
    return `<div style="position:absolute;left:50%;top:40%;transform:rotate(${ang}deg);transform-origin:0 0;"><div class="${id}-ray" style="position:absolute;left:6cqw;top:-0.2cqw;width:40cqw;height:0.4cqw;transform-origin:0 50%;opacity:0;background:linear-gradient(90deg,${theme.accent},transparent);"></div></div>`;
  }).join("");
  const pw = fitPlateW(ctx, portrait ? 56 : 34, asset);
  const ph = r(parseFloat(pw) * hmul);
  const html = `${open(id, ctx)}<div class="clip" style="position:absolute;inset:0;">
    ${rays}
    <div class="${id}-burst" style="position:absolute;left:50%;top:40%;width:60cqw;height:60cqw;margin-left:-30cqw;margin-top:-30cqw;border-radius:50%;opacity:0;background:radial-gradient(circle,#fff,${theme.accent} 34%,transparent 68%);mix-blend-mode:screen;"></div>
    <div class="ai-kicker ${id}-kick" style="position:absolute;left:0;right:0;top:14%;justify-content:center;opacity:0;">${kick}</div>
    <div class="${id}-panel" style="position:absolute;left:50%;top:40%;transform:translate(-50%,-50%);width:${pw};opacity:0;">
      <div style="position:relative;width:100%;height:${ph}cqw;overflow:hidden;border-radius:3cqw;">
        ${panelFrame(theme, asset, "3cqw")}
        <div class="${id}-mask" style="position:absolute;left:0;right:0;top:0;bottom:0;background:${theme.ground};background-image:repeating-linear-gradient(${theme.edgeFaint} 0 1px, transparent 1px 5px);transform-origin:bottom;"></div>
        <div class="${id}-scan" style="position:absolute;left:0;right:0;top:0;height:0.4cqw;background:${theme.accent};box-shadow:0 0 2cqw ${theme.accent};opacity:0;"></div>
      </div>
    </div>
    <div class="ai-display kf-grad ${id}-tag" style="position:absolute;left:0;right:0;top:76%;text-align:center;padding:0 8%;opacity:0;font-size:${r(headlineSize(scene.headline, 9))}cqw;">${accentWords(id, scene.headline || scene.title || S.syntComplete)}</div>
    <div class="${id}-flash" style="position:absolute;inset:0;pointer-events:none;background:#fff;opacity:0;mix-blend-mode:screen;"></div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-14},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.2)});`,
    `tl.fromTo(".${id}-ray",{opacity:0,scaleX:0.15},{opacity:0.5,scaleX:1,duration:0.6,ease:"power2.out",stagger:0.008},${r(T + 0.3)});`,
    `tl.to(".${id}-ray",{opacity:0.22,duration:${r(Math.max(1, L - 2))},ease:"sine.inOut",yoyo:true,repeat:1},${r(T + 1)});`,
    `tl.fromTo(".${id}-burst",{opacity:0,scale:0.4},{opacity:0.7,scale:1,duration:0.7,ease:"power2.out"},${r(T + 0.35)});`,
    `tl.to(".${id}-burst",{opacity:0.3,duration:${r(Math.max(1, L - 2))},ease:"sine.inOut",yoyo:true,repeat:1},${r(T + 1.1)});`,
    `tl.fromTo(".${id}-panel",{opacity:0,y:50,scale:0.86},{opacity:1,y:0,scale:1,duration:0.7,ease:"power3.out"},${r(T + 0.5)});`,
    `tl.fromTo(".${id}-mask",{scaleY:1},{scaleY:0,duration:${r(Math.max(0.8, L * 0.45))},ease:"power1.inOut"},${r(T + 0.7)});`,
    `tl.fromTo(".${id}-scan",{opacity:0,top:"0%"},{opacity:1,top:"100%",duration:${r(Math.max(0.8, L * 0.45))},ease:"power1.inOut"},${r(T + 0.7)});`,
    `tl.to(".${id}-scan",{opacity:0,duration:0.3},${r(T + 0.7 + Math.max(0.8, L * 0.45))});`,
    `tl.to(".${id}-panel",{y:"-=1.2cqw",duration:2,ease:"sine.inOut",yoyo:true,repeat:${reps(Math.max(1, L - 2.5), 2)},overwrite:"auto"},${r(T + L * 0.55)});`,
    `tl.fromTo(".${id}-flash",{opacity:0},{opacity:0.65,duration:0.12,yoyo:true,repeat:1,ease:"power2.out"},${r(T + 0.42)});`,
    `tl.fromTo(".${id}-tag",{opacity:0,y:22},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + L * 0.6)});`,
    `tl.fromTo(".${id}-gw",{opacity:0,y:22,scale:0.8},{opacity:1,y:0,scale:1,duration:0.5,ease:"back.out(1.7)",stagger:0.07},${r(T + L * 0.62)});`,
  ];
  return { html, s };
}

// SCENE — READOUT: a scientific HUD dashboard — a fig-labelled headline, a hero stat
// number, and a metric grid drawn from the scene's bullets. The telemetry moment.
function bReadout(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S } = ctx;
  const asset = (sceneAssets && sceneAssets[0]) || null;
  const kick = esc(scene.kicker || S.readoutKicker);
  const hero = esc(pickNumberStr(scene) || scene.emphasis || scene.headline || "");
  const metrics = bullets(scene, 4);
  const grid = metrics.length
    ? `<div style="position:absolute;left:8%;right:8%;top:58%;display:grid;grid-template-columns:1fr 1fr;gap:3cqw;">${metrics.map((m, i) => {
        const parts = String(m).split(/[:–—\-]|\s{2,}/).map((x) => x.trim()).filter(Boolean);
        const lab = parts.length > 1 ? parts[0] : "";
        const val = parts.length > 1 ? parts.slice(1).join(" ") : parts[0];
        return `<div class="${id}-mtr" style="opacity:0;border:0.16cqw solid ${theme.edge};background:${theme.panel};padding:3cqw 3.2cqw;border-radius:1.6cqw;">
          ${lab ? `<div style="font-family:${theme.monoStack};font-size:2.1cqw;letter-spacing:0.14em;color:${theme.dim};text-transform:uppercase;">${esc(lab)}</div>` : ""}
          <div style="font-family:${theme.displayStack};font-weight:700;font-size:${lab ? "5cqw" : "3.6cqw"};color:${theme.ink};margin-top:${lab ? "1cqw" : "0"};line-height:1.1;">${esc(val)}</div>
        </div>`;
      }).join("")}</div>`
    : "";
  const html = `${open(id, ctx)}<div class="clip" style="position:absolute;inset:0;">
    <div class="${id}-head" style="position:absolute;left:8%;top:12%;opacity:0;">
      <div class="ai-kicker">${kick}</div>
      <div class="ai-h1" style="text-align:left;font-size:${r(headlineSize(scene.headline, 8))}cqw;margin-top:1.6cqw;">${esc(scene.headline || scene.title || "")}</div>
    </div>
    <div class="${id}-panel" style="position:absolute;left:8%;right:8%;top:30%;height:22%;border:0.16cqw solid ${theme.edge};background:${theme.panel};border-radius:2cqw;overflow:hidden;opacity:0;">${asset ? panelFrame(theme, asset, "2cqw") : ""}
      <div class="${id}-wave" style="position:absolute;inset:0;${asset ? "mix-blend-mode:screen;" : ""}opacity:0;background:
        repeating-linear-gradient(90deg, ${theme.edgeFaint} 0 1px, transparent 1px 8%),
        repeating-linear-gradient(${theme.edgeFaint} 0 1px, transparent 1px 26%);"></div>
      <div class="${id}-pulse" style="position:absolute;left:0;top:50%;width:100%;height:0.4cqw;background:${theme.accent};box-shadow:0 0 3cqw ${theme.accent};transform-origin:left;transform:scaleX(0);"></div>
      <div style="position:absolute;left:2.4cqw;top:2cqw;font-family:${theme.monoStack};font-size:2cqw;letter-spacing:0.12em;color:${theme.dim};">${esc(S.networkReadout)}</div>
    </div>
    ${hero ? `<div class="${id}-hero" style="position:absolute;left:8%;top:${metrics.length ? "44%" : "50%"};opacity:0;">
      <div style="font-family:${theme.monoStack};font-size:2.2cqw;letter-spacing:0.16em;color:${theme.dim};text-transform:uppercase;">${esc(S.readoutKicker)}</div>
      <div class="ai-display kf-grad" style="font-size:${r(headlineSize(hero, 13))}cqw;line-height:1;">${esc(hero)}</div>
    </div>` : ""}
    ${grid}
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
    `tl.fromTo(".${id}-head",{opacity:0,y:-16},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.2)});`,
    `tl.fromTo(".${id}-panel",{opacity:0,y:24},{opacity:1,y:0,duration:0.55,ease:"power3.out"},${r(T + 0.4)});`,
    `tl.fromTo(".${id}-wave",{opacity:0},{opacity:1,duration:0.5},${r(T + 0.6)});`,
    `tl.fromTo(".${id}-pulse",{scaleX:0},{scaleX:1,duration:${r(Math.max(0.6, L * 0.4))},ease:"power1.inOut"},${r(T + 0.6)});`,
    hero ? `tl.fromTo(".${id}-hero",{opacity:0,y:20,scale:0.9},{opacity:1,y:0,scale:1,duration:0.6,ease:"back.out(1.5)"},${r(T + 0.9)});` : "",
    metrics.length ? `tl.fromTo(".${id}-mtr",{opacity:0,y:22},{opacity:1,y:0,duration:0.5,ease:"power2.out",stagger:0.12},${r(T + 1.1)});` : "",
  ].filter(Boolean);
  return { html, s };
}

// SCENE — SHOWCASE: holographic screenshot PANELS floating in the lab network under a
// headline, with optional feature labels. The product/output moment (1–3 shots).
function bShowcase(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S, portrait } = ctx;
  const kick = esc(scene.kicker || S.showcaseKicker);
  const shots = (sceneAssets || []).slice(0, 3);
  const feats = bullets(scene, 3);
  const single = shots.length <= 1;
  if (single) {
    const asset = shots[0] || null;
    const hmul = frameHmul(asset) * (portrait ? 1 : 0.9);
    const pw = fitPlateW(ctx, portrait ? 58 : 34, asset);
    const featHtml = feats.length
      ? `<div style="display:flex;flex-direction:column;gap:1.6cqw;align-items:center;margin-top:4.4cqw;">${feats.map((f) => `<div class="ai-chip ${id}-fi" style="opacity:0;">${esc(f)}</div>`).join("")}</div>`
      : "";
    const html = `${open(id, ctx)}<div class="ai-safe" style="justify-content:center;">
      <div class="ai-kicker ${id}-kick" style="opacity:0;margin-bottom:2.4cqw;">${kick}</div>
      ${scene.headline ? `<div class="ai-h1 ${id}-head" style="opacity:0;text-align:center;font-size:${r(headlineSize(scene.headline, 7))}cqw;margin-bottom:4.4cqw;">${esc(scene.headline)}</div>` : ""}
      ${panelBlock(id, theme, { w: pw, hcqw: parseFloat(pw) * hmul, asset, tilt: -6 })}
      ${featHtml}
    </div></div>`;
    const s = [
      `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
      `tl.fromTo(".${id}-kick",{opacity:0,y:-14},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.2)});`,
      scene.headline ? `tl.fromTo(".${id}-head",{opacity:0,y:20},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 0.35)});` : "",
      `tl.fromTo(".${id}-panel",{opacity:0,y:80,scale:0.88,rotationX:8},{opacity:1,y:0,scale:1,rotationX:0,duration:0.8,ease:"power3.out"},${r(T + 0.5)});`,
      `tl.to(".${id}-panel",{y:"-=1.6cqw",duration:2,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.4, 2)},overwrite:"auto"},${r(T + 1.5)});`,
      feats.length ? `tl.fromTo(".${id}-fi",{opacity:0,x:-18},{opacity:1,x:0,duration:0.45,ease:"back.out(1.6)",stagger:0.14},${r(T + 1.2)});` : "",
    ].filter(Boolean);
    return { html, s };
  }
  const tilts = shots.length === 3 ? [-14, 0, 14] : [-10, 10];
  const pw = shots.length >= 3 ? "26cqw" : "34cqw";
  const row = `<div style="display:flex;gap:3cqw;justify-content:center;align-items:center;width:100%;perspective:1500px;">${shots.map((a, i) => {
    const hmul = frameHmul(a) * 1.2;
    const lab = (Array.isArray(scene.onScreenText) && scene.onScreenText[i]) || "";
    return `<div style="width:${pw};text-align:center;"><div class="${id}p${i}-panel" style="opacity:0;width:100%;"><div style="transform:rotateY(${tilts[i]}deg);transform-style:preserve-3d;position:relative;width:100%;height:${r(parseFloat(pw) * hmul)}cqw;">${panelFrame(theme, a, "2.4cqw")}</div></div>${lab ? `<div style="font-family:${theme.monoStack};font-size:2cqw;color:${theme.dim};margin-top:2.4cqw;letter-spacing:0.14em;text-transform:uppercase;">${esc(lab)}</div>` : ""}</div>`;
  }).join("")}</div>`;
  const html = `${open(id, ctx)}<div class="ai-safe">
    <div class="ai-kicker ${id}-kick" style="opacity:0;margin-bottom:2.4cqw;">${kick}</div>
    <div class="ai-h1 ${id}-head" style="opacity:0;text-align:center;font-size:${r(headlineSize(scene.headline, 7))}cqw;margin-bottom:5cqw;">${esc(scene.headline || scene.title || "")}</div>
    ${row}
  </div></div>`;
  const targets = shots.map((_, i) => `.${id}p${i}-panel`).join(",");
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-16},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.2)});`,
    `tl.fromTo(".${id}-head",{opacity:0,y:22},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 0.35)});`,
    `tl.fromTo("${targets}",{opacity:0,y:70,scale:0.86},{opacity:1,y:0,scale:1,duration:0.7,ease:"power3.out",stagger:0.14},${r(T + 0.6)});`,
    `tl.to("${targets}",{y:"-=1.4cqw",duration:1.9,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.5, 1.9)},stagger:0.1,overwrite:"auto"},${r(T + 1.5)});`,
  ];
  return { html, s };
}

// SCENE — CTA: incoming nodes converge into a hex mark (the user's logo when uploaded,
// else a built hex-ring + play glyph), the wordmark types in char-by-char, a button
// pulses and a url settles.
function bCta(scene, ctx, logo) {
  const { id, T, L, theme, S } = ctx;
  const word = String(scene.headline || scene.title || "KEYFRAME").slice(0, 20);
  const btn = esc(String(scene.emphasis || S.ctaButton).slice(0, 24));
  const tagline = esc(String(scene.subtext || S.ctaTagline).slice(0, 60));
  const url = esc(String(S.ctaUrl).toUpperCase());
  // converging nodes trail into the mark.
  const N = 16;
  const conv = Array.from({ length: N }).map((_, i) => {
    const ang = (i / N) * 360;
    const d = 34 + hashF(i) * 12; // cqw radius
    const cx = r(50 + Math.cos(ang * Math.PI / 180) * d * 0.62);
    const cy = r(38 + Math.sin(ang * Math.PI / 180) * d * 0.62);
    return `<div class="${id}-conv" style="position:absolute;left:${cx}%;top:${cy}%;width:1.6cqw;height:1.6cqw;margin-left:-0.8cqw;margin-top:-0.8cqw;border-radius:50%;background:${theme.accent};box-shadow:0 0 2cqw ${theme.accent};opacity:0;"></div>`;
  }).join("");
  const mark = logo && logo.path
    ? logoMark(logo, { sizeCqw: 24, ground: theme.ground, glow: theme.accent, escape: esc })
    : `<div style="position:relative;width:24cqw;height:24cqw;clip-path:polygon(50% 0,93% 25%,93% 75%,50% 100%,7% 75%,7% 25%);border:0.5cqw solid ${theme.accent};box-shadow:0 0 6cqw ${theme.accent};display:flex;align-items:center;justify-content:center;">
        <div style="width:0;height:0;border-top:4cqw solid transparent;border-bottom:4cqw solid transparent;border-left:6.4cqw solid ${theme.accent};margin-left:1.4cqw;filter:drop-shadow(0 0 2cqw ${theme.accent});"></div>
      </div>`;
  const chars = wordCharSpans(word, `${id}-ch`);
  const html = `${open(id, ctx)}<div class="ai-safe" style="justify-content:center;">
    ${conv}
    <div class="ai-kicker ${id}-kick" style="opacity:0;margin-bottom:2.4cqw;">${esc(scene.kicker || S.ctaKicker)}</div>
    <div class="${id}-mark" style="opacity:0;">${mark}</div>
    <div class="ai-glow ${id}-glow" style="opacity:0;position:absolute;left:50%;top:38%;width:64cqw;height:64cqw;margin-left:-32cqw;margin-top:-32cqw;border-radius:50%;background:radial-gradient(circle,${theme.accent},transparent 62%);mix-blend-mode:screen;pointer-events:none;"></div>
    <div class="ai-wordmark" style="margin-top:3.4cqw;font-size:${r(fitSize(word, 11))}cqw;">${chars}</div>
    <div class="ai-body ${id}-tag" style="opacity:0;margin-top:1.8cqw;">${tagline}</div>
    <div class="ai-btn ${id}-btn" style="opacity:0;margin-top:3.6cqw;color:${theme.onAccent};">${btn} →</div>
    <div class="${id}-url" style="opacity:0;font-family:${theme.monoStack};letter-spacing:0.24em;font-size:2.4cqw;color:${theme.faint};margin-top:2.4cqw;">${url}</div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.4},${T});`,
    `tl.fromTo(".${id}-conv",{opacity:0.9,scale:0.6},{opacity:0,scale:1,left:"50%",top:"38%",duration:0.7,ease:"power2.in",stagger:0.02},${r(T + 0.25)});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-14},{opacity:1,y:0,duration:0.45,ease:"power2.out"},${r(T + 0.2)});`,
    `tl.fromTo(".${id}-mark",{opacity:0,scale:0.6,y:20},{opacity:1,scale:1,y:0,duration:0.6,ease:"back.out(1.7)"},${r(T + 0.55)});`,
    `tl.fromTo(".${id}-glow",{opacity:0,scale:0.4},{opacity:0.5,scale:1,duration:0.6,ease:"power2.out"},${r(T + 0.6)});`,
    `tl.to(".${id}-glow",{opacity:0.28,duration:1.4,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.4, 1.4)},overwrite:"auto"},${r(T + 1.2)});`,
    `tl.fromTo(".${id}-ch",{opacity:0,y:50},{opacity:1,y:0,duration:0.5,ease:"power3.out",stagger:0.04},${r(T + 0.9)});`,
    `tl.fromTo(".${id}-tag",{opacity:0,y:14},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 1.3)});`,
    `tl.fromTo(".${id}-btn",{opacity:0,scale:0.8},{opacity:1,scale:1,duration:0.5,ease:"back.out(2)"},${r(T + 1.55)});`,
    `tl.to(".${id}-btn",{scale:1.04,duration:0.7,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 2.15, 0.7)},overwrite:"auto"},${r(T + 2.15)});`,
    `tl.fromTo(".${id}-url",{opacity:0},{opacity:1,duration:0.5},${r(T + 1.8)});`,
  ];
  return { html, s };
}

const BUILDERS = { boot: bBoot, input: bInput, network: bNetwork, synthesis: bSynthesis, readout: bReadout, showcase: bShowcase, cta: bCta };

// ---- persistent LAB LATTICE canvas (hf-seek) ---------------------------------
// One canvas painted purely from the renderer's hf-seek time: a top accent wash, a
// living lattice of glowing nodes + connecting edges that pulse, firing signal dots
// travelling along the edges, a slow HUD scanline, corner HUD brackets and a vignette.
// Colored ONLY with theme.accent (+ the near-black grounds), so a brand skin recolors
// the whole lab. Live preview drives it off the timeline; render is hf-seek only.
function labClip(theme, dims, D, seed) {
  const W = dims.width, H = dims.height;
  const [ar, ag, ab] = hexToRgb(theme.accent);
  const [gr, gg, gb] = hexToRgb(theme.ground);
  const html = `<div id="ai-lab-clip" class="clip" data-start="0" data-duration="${D}" data-track-index="0" data-layout-allow-occlusion style="background:${theme.ground};">
    <canvas id="ai-lab" width="${W}" height="${H}" style="position:absolute;inset:0;width:100%;height:100%;"></canvas>
  </div>`;
  const script = `(function(){
  var cv=document.getElementById("ai-lab");if(!cv||!cv.getContext)return;var cx=cv.getContext("2d");if(!cx)return;
  var W=${W},H=${H};
  function A2(a){return "rgba(${ar},${ag},${ab},"+a+")";}
  var GD="rgba(${gr},${gg},${gb},";
  var sd=${seed >>> 0};function rnd(){sd=(sd*1664525+1013904223)>>>0;return sd/4294967296;}
  var N=Math.round(20*(W*H)/(1080*1920)),ND=[];
  for(var i=0;i<N;i++){ND.push({x:rnd(),y:rnd(),r:2+rnd()*4,ph:rnd()*6.28,sp:0.6+rnd()*0.8});}
  // edges: connect nodes within a distance threshold (deterministic)
  var EG=[],TH=0.34;
  for(var a=0;a<N;a++)for(var b=a+1;b<N;b++){var dx=ND[a].x-ND[b].x,dy=ND[a].y-ND[b].y;var dd=Math.sqrt(dx*dx+dy*dy);if(dd<TH)EG.push({a:a,b:b,ph:rnd()*6.28});}
  var inset=W*0.05;
  function draw(t){
    cx.clearRect(0,0,W,H);
    // ground fill
    cx.fillStyle=GD+"1)";cx.fillRect(0,0,W,H);
    // top accent wash
    var wg=cx.createRadialGradient(W*0.5,H*0.36,0,W*0.5,H*0.36,W*0.9);wg.addColorStop(0,A2(0.12));wg.addColorStop(0.55,A2(0));cx.fillStyle=wg;cx.fillRect(0,0,W,H);
    // edges
    cx.lineWidth=1.2;
    for(var e=0;e<EG.length;e++){var na=ND[EG[e].a],nb=ND[EG[e].b];var op=0.06+0.06*(0.5+0.5*Math.sin(t*0.8+EG[e].ph));cx.strokeStyle=A2(op);cx.beginPath();cx.moveTo(na.x*W,na.y*H);cx.lineTo(nb.x*W,nb.y*H);cx.stroke();}
    // firing signals travelling along a subset of edges
    for(var f=0;f<EG.length;f++){if((f%3)!==0)continue;var ea=ND[EG[f].a],eb=ND[EG[f].b];var u=(t*0.5+EG[f].ph/6.28)%1;var sx=ea.x*W+(eb.x-ea.x)*W*u,sy=ea.y*H+(eb.y-ea.y)*H*u;cx.globalAlpha=0.85;cx.fillStyle=A2(1);cx.shadowColor=A2(1);cx.shadowBlur=8;cx.beginPath();cx.arc(sx,sy,4,0,6.283);cx.fill();}
    cx.shadowBlur=0;cx.globalAlpha=1;
    // nodes pulsing
    for(var i=0;i<ND.length;i++){var nd=ND[i];var op=0.18+0.14*(0.5+0.5*Math.sin(t*1.2*nd.sp+nd.ph));var rr=nd.r*(0.85+0.25*Math.sin(t*nd.sp+nd.ph));cx.globalAlpha=op;cx.fillStyle=A2(1);cx.shadowColor=A2(1);cx.shadowBlur=rr*3;cx.beginPath();cx.arc(nd.x*W,nd.y*H,rr,0,6.283);cx.fill();}
    cx.shadowBlur=0;cx.globalAlpha=1;
    // HUD scanline (slow vertical sweep)
    var scanY=(t*H*0.06)%H;cx.fillStyle=A2(0.16);cx.fillRect(inset,scanY,W-inset*2,2);
    // corner HUD brackets
    var L=W*0.04;cx.strokeStyle=A2(0.5);cx.lineWidth=2;
    var C=[[inset,inset,1,1],[W-inset,inset,-1,1],[inset,H-inset,1,-1],[W-inset,H-inset,-1,-1]];
    for(var c=0;c<4;c++){var p=C[c];cx.beginPath();cx.moveTo(p[0]+L*p[2],p[1]);cx.lineTo(p[0],p[1]);cx.lineTo(p[0],p[1]+L*p[3]);cx.stroke();}
    // vignette
    var vg=cx.createRadialGradient(W*0.5,H*0.42,Math.min(W,H)*0.2,W*0.5,H*0.42,Math.max(W,H)*0.78);vg.addColorStop(0,GD+"0)");vg.addColorStop(1,GD+"0.94)");cx.fillStyle=vg;cx.fillRect(0,0,W,H);
  }
  // Painted ONLY from the renderer's hf-seek time — deterministic, seek-exact, capture-safe.
  window.KF_AILAB=draw;window.addEventListener("hf-seek",function(e){draw((e.detail&&e.detail.time)||0);});draw(0);
})();`;
  return { html, script };
}

// ---- grain overlay (top layer) -----------------------------------------------
const GRAIN_URI = grainUri(0.9);
function grainClip(D) {
  return `<div id="ai-grain" class="clip" data-start="0" data-duration="${D}" data-track-index="40" data-layout-allow-occlusion style="pointer-events:none;background-image:url('${GRAIN_URI}');background-size:260px 260px;opacity:0.045;mix-blend-mode:overlay;"></div>`;
}

// ---- style -------------------------------------------------------------------
function styleBlock(theme, portrait) {
  const safePad = portrait ? "12% 7% 14%" : "8% 8% 10%";
  return `${theme.fontFace}
  * { box-sizing:border-box; margin:0; padding:0; }
  html, body { width:100%; height:100%; overflow:hidden; background:#000; }
  #root { position:relative; overflow:hidden; isolation:isolate; background:${theme.ground}; container-type:size; color:${theme.ink}; font-family:${theme.bodyStack}; }
  .clip { position:absolute; top:0; left:0; width:100%; height:100%; overflow:hidden; }
  .ai-safe { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:${safePad}; text-align:center; }
  .ai-display { font-family:${theme.displayStack}; font-weight:800; line-height:0.96; letter-spacing:-0.02em; color:${theme.ink}; }
  .ai-h1 { font-family:${theme.displayStack}; font-weight:700; line-height:1.04; letter-spacing:-0.01em; color:${theme.ink}; }
  .kf-grad { color:transparent; }
  .kf-grad .ai-gword:last-child { background:${theme.gradient}; -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; color:transparent; }
  .ai-display.kf-grad:not(:has(.ai-gword)) { background:${theme.gradient}; -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; color:transparent; }
  .ai-display .ai-gword:last-child { color:${theme.accent}; }
  .ai-kicker { display:inline-flex; align-items:center; gap:0.9cqw; font-family:${theme.monoStack}; font-weight:600; font-size:2cqw; letter-spacing:0.32em; text-transform:uppercase; color:${theme.dim}; }
  .ai-mono { font-family:${theme.monoStack}; font-weight:500; font-size:2.6cqw; letter-spacing:0.2em; text-transform:uppercase; color:${theme.dim}; }
  .ai-body { font-family:${theme.bodyStack}; font-weight:500; font-size:2.7cqw; line-height:1.42; color:${theme.dim}; }
  /* The CTA word is one flex item PER CHARACTER (the stagger needs them), and a flex row
     does not wrap unless told to — so a long headline ran off both edges of the frame
     ("Serving humanity's", 18 chars at 11cqw ≈ 109cqw wide on a 100cqw stage). flex-wrap
     lets it fall to a second line; the caller sizes it to fit. Portrait text-safety CSS
     could not rescue this: overflow-wrap has no effect on flex items. */
  .ai-wordmark { display:flex; flex-wrap:wrap; justify-content:center; text-align:center; gap:0 0.26em; max-width:92%; font-family:${theme.displayStack}; font-weight:800; font-size:11cqw; line-height:1.02; letter-spacing:-0.02em; color:${theme.ink}; }
  .ai-gword { will-change:transform,opacity; }
  .ai-chip { display:inline-flex; align-items:center; gap:1.4cqw; padding:1.6cqw 3cqw; border-radius:999px; background:rgba(255,255,255,0.04); border:1px solid ${theme.border}; backdrop-filter:blur(6px); font-family:${theme.monoStack}; font-weight:600; font-size:2.6cqw; letter-spacing:0.06em; color:${theme.ink}; white-space:nowrap; box-shadow:0 1.4cqw 5cqw -2cqw ${theme.accent}; will-change:transform,opacity; }
  .ai-btn { display:inline-flex; align-items:center; gap:1cqw; padding:2.8cqw 6.4cqw; border-radius:999px; background:${theme.accent}; font-family:${theme.monoStack}; font-weight:700; font-size:3.4cqw; letter-spacing:0.08em; text-transform:uppercase; box-shadow:0 2cqw 6cqw -1.5cqw ${theme.accent}; will-change:transform,opacity; }
  .ai-promptbar { display:flex; align-items:center; gap:2cqw; padding:3.4cqw 3.6cqw; border-radius:2.4cqw; background:${theme.surface}; border:0.16cqw solid ${theme.border}; box-shadow:0 4cqw 12cqw -4cqw ${theme.accent}, 0 0 0 1px rgba(255,255,255,0.05) inset; }
  .ai-prompttext { flex:1; text-align:left; font-family:${theme.monoStack}; font-size:3cqw; line-height:1.4; color:${theme.ink}; min-height:3cqw; }
  .ai-pf, .ai-panel { will-change:transform,opacity; }
  #caps { position:absolute; inset:0; display:flex; justify-content:center; align-items:flex-end; padding-bottom:${portrait ? "16%" : "7%"}; z-index:60; pointer-events:none; }
  #cap-pill { max-width:82%; height:fit-content; flex:0 0 auto; text-align:center; padding:1.4cqw 3cqw; opacity:0; border-radius:2cqw; background:rgba(5,6,13,0.72); border:1px solid ${theme.border}; backdrop-filter:blur(8px); }
  #cap-text { font-family:${theme.bodyStack}; font-weight:600; font-size:2.6cqw; line-height:1.35; color:${theme.ink}; }`;
}

// ---- MAIN --------------------------------------------------------------------
function buildComposition({ storyboard, dims, framePack, captionCues, assets, brandSkin = null, localized = null } = {}) {
  // Portrait drives the headline fill ladder (see headlineSize).
  _portrait = (dims && dims.height > dims.width) || false;
  const theme = labTheme(brandSkin);
  const S = localized ? { ...STRINGS, ...localized } : STRINGS;
  const sb = storyboard || {};
  const W = (dims && dims.width) || 1080, H = (dims && dims.height) || 1920;
  const portrait = W < H;
  const scenes = Array.isArray(sb.scenes) && sb.scenes.length
    ? sb.scenes.slice(0, 12)
    : [{ id: "s1", start: 0, duration: 5, kind: "hook", headline: sb.title || "KEYFRAME" }];
  const D = r(sb.durationSec || scenes.reduce((a, s) => Math.max(a, (Number(s.start) || 0) + (Number(s.duration) || 0)), 0) || 12);
  const seed = seedFrom(sb.title || (scenes[0] && scenes[0].headline) || "ailab");

  // ---- Assets: distribute real screenshots across DISPLAY-CAPABLE scenes -------
  // A screenshot must NEVER be stranded on a scene that can't show it (boot / input /
  // readout / cta). The Creative Director's per-asset `sceneId` is a HINT: honored when
  // that scene can display an image, else the shot is redistributed to the least-loaded
  // display scene — so every usable screenshot actually appears. The logo is reserved
  // for the CTA mark.
  const logo = logoAssetOf(assets);
  const shots = (Array.isArray(assets) ? assets : []).filter(screenOk)
    .sort((a, b) => (Number(b.cdScore) || 0) - (Number(a.cdScore) || 0));
  const baseArch = scenes.map((scene, i) => archetypeFor(scene, i, scenes.length));
  // ANTI-REPETITION (services/motion_planner). archetypeFor above ends in a single
  // fallthrough, so every middle scene of a text-led film lands on the same type and the
  // film reads as one backdrop with rotating copy. This breaks adjacent duplicates using
  // ONLY this pack's own generic scene types — data-shaped ones (stats/chart/gallery)
  // keep their type, because their builders have preconditions a swap would violate.
  const { archetypes: __varied } = varyArchetypes(baseArch, {
    pool: Object.keys(BUILDERS),
    seedKey: scenes.map((s) => s && s.id).join("|"),
  });
  for (let __i = 0; __i < baseArch.length; __i++) baseArch[__i] = __varied[__i];
  // Every content archetype is display-capable — only the pure CTA scene (logo lockup)
  // is excluded — so the Creative Director's per-asset sceneId hint lands on the very
  // stat / quote / hook scene it targets instead of being redistributed away, and
  // stat/quote/hook builders host their assigned screenshot in the lab's glass panel.
  const canShow = (a) => a !== "cta";
  const displayIdx = scenes.map((_, i) => i).filter((i) => canShow(baseArch[i]));
  // Belt-and-suspenders: if nothing is display-capable but shots exist, force a middle
  // (non-cta) scene into a holographic showcase so a usable screenshot is never dropped.
  if (!displayIdx.length && shots.length) {
    const mid = scenes.findIndex((s, i) => i > 0 && i < scenes.length - 1);
    const idx = mid >= 0 ? mid : 0;
    baseArch[idx] = "showcase";
    displayIdx.push(idx);
  }
  const sceneIdOf = (i) => (scenes[i].id != null ? String(scenes[i].id) : `s${i + 1}`);
  const sceneShots = scenes.map(() => []);
  if (displayIdx.length && shots.length) {
    const leftovers = [];
    for (const a of shots) {
      const sid = a.sceneId != null ? String(a.sceneId) : null;
      const target = sid != null ? displayIdx.find((i) => sceneIdOf(i) === sid) : undefined;
      if (target != null) sceneShots[target].push(a); else leftovers.push(a);
    }
    for (const a of leftovers) {
      let best = displayIdx[0];
      for (const i of displayIdx) if (sceneShots[i].length < sceneShots[best].length) best = i;
      sceneShots[best].push(a);
    }
    for (const i of displayIdx) sceneShots[i] = sceneShots[i].slice(0, 3);
  }

  const scriptStart = (i) => scenes.slice(0, i).reduce((a, s) => a + (Number(s.duration) || 0), 0);
  const bodyParts = [], sceneScripts = [];

  scenes.forEach((scene, i) => {
    const T = r(scene.start != null ? scene.start : scriptStart(i));
    const L = r(scene.duration || 5);
    let arch = baseArch[i];
    let sceneAssets = sceneShots[i];
    // A display-capable scene that received screenshots shows them: 3+ → a holographic
    // panel row (showcase); network with shots → a focused showcase panel; synthesis
    // keeps one generating panel; else a focused showcase. Scenes with none keep base.
    if (canShow(arch) && sceneAssets.length) {
      // stat / quote / hook scenes KEEP their identity and host ONE supporting shot in
      // the composer's own holographic panel (the number / quote / title stays), so the
      // proof scene shows the dashboard AND the metric. Everything else resolves to the
      // panel row (3+) or a focused showcase panel.
      if (arch === "readout" || arch === "input" || arch === "boot") { sceneAssets = sceneAssets.slice(0, 1); }
      else if (sceneAssets.length >= 3) { arch = "showcase"; sceneAssets = sceneAssets.slice(0, 3); }
      else if (arch === "synthesis") { sceneAssets = sceneAssets.slice(0, 1); }
      else { arch = "showcase"; sceneAssets = sceneAssets.slice(0, portrait ? 2 : 3); }
    }
    const ctx = { id: `s${i + 1}`, T, L, E: r(T + L), i, isLast: i === scenes.length - 1, track: 2 + i, theme, S, W, H, portrait };
    const built = (BUILDERS[arch] || bShowcase)(scene, ctx, arch === "cta" ? logo : sceneAssets);
    bodyParts.push(built.html);
    sceneScripts.push(built.s.filter(Boolean).join("\n  "));
    if (!ctx.isLast) sceneScripts.push(`kill("#${ctx.id}",${r(T + L)});`);
  });

  const cues = (Array.isArray(captionCues) ? captionCues : [])
    .filter((c) => c && c.text != null)
    .map((c) => [r(c.start != null ? c.start : c.startSec || 0), r(c.end != null ? c.end : (c.start || 0) + 2), String(c.text)]);

  const lab = labClip(theme, { width: W, height: H }, D, seed);
  const caps = `<div id="caps" class="clip" data-start="0" data-duration="${D}" data-track-index="50"><div id="cap-pill"><div id="cap-text"></div></div></div>`;

  const script = `(function(){
  var D=${D};
  var tl=gsap.timeline({paused:true});
  var $=function(s){return document.querySelector(s);};
  function kill(id,t){tl.set(id,{opacity:0},t);}
  function type(sel,full,at,dur){var o={n:0};tl.to(o,{n:full.length,duration:dur,ease:"none",snap:{n:1},onUpdate:function(){var e=$(sel);if(e){var s=full.slice(0,Math.round(o.n));if(e.textContent!==s)e.textContent=s;}}},at);}

  ${sceneScripts.join("\n  ")}

  var cues=${JSON.stringify(cues)};
  tl.to({},{duration:D,ease:"none",onUpdate:function(){
    var now=tl.time();
    if(window.KF_AILAB)window.KF_AILAB(now);
    var cap=$("#cap-pill"),txt=$("#cap-text");
    if(cap&&txt){var a=null;for(var k=0;k<cues.length;k++){if(now>=cues[k][0]&&now<cues[k][1]){a=cues[k];break;}}if(a){if(txt.textContent!==a[2])txt.textContent=a[2];cap.style.opacity="1";}else cap.style.opacity="0";}
  }},0);

  window.__timelines=window.__timelines||{};
  window.__timelines["vid"]=tl;
  if(typeof navigator==="undefined"||!navigator.webdriver){tl.play(0);tl.eventCallback("onComplete",function(){tl.restart();});}
})();`;

  const indexHtml = [
    `<!DOCTYPE html>`, `<html lang="en">`, `<head>`, `<meta charset="utf-8">`, `<title>vid</title>`,
    `<script src="${GSAP_CDN}"></script>`,
    `<style>`, styleBlock(theme, portrait), `</style>`, `</head>`, `<body>`,
    `<div id="root" class="composition" data-composition-id="vid" data-width="${W}" data-height="${H}" data-start="0" data-duration="${D}" style="width:${W}px;height:${H}px;">`,
    lab.html,
    bodyParts.join("\n"),
    grainClip(D),
    caps,
    `</div>`,
    `<script>`, lab.script, `</script>`,
    `<script>`, script, `</script>`,
    `</body>`, `</html>`,
  ].join("\n");

  const metaJson = JSON.stringify({ compositionId: "vid", width: W, height: H, fps: (dims && dims.fps) || 30, duration: D });
  return { indexHtml, metaJson, resolvedBrand: theme.resolvedBrand };
}

module.exports = { buildComposition, STRINGS };
