// DETERMINISTIC SCENE-KIT — builds a complete, lint-valid, showcase-grade
// HyperFrames composition from a storyboard WITHOUT asking the LLM to freehand
// layout/motion. The kit OWNS structure + motion (guaranteed by code, so the
// budget model can never produce an overlapping/truncated mess); the PACK owns
// STYLE (colors/fonts/atoms, re-skinned per pack — flat packs get NO gradients);
// the AGENTS own CONTENT (copy, archetype choice, asset/screenshot selection,
// carried on the storyboard). This is the codification of the two hand-authored
// reference films (flagship, amazon-premium) into reusable, parameterized scenes.
//
// Entry: buildComposition({ storyboard, dims, framePack, assets, captionCues, seedKey })
//        -> { indexHtml, metaJson }   (the same envelope the LLM composer returns)
//        seedKey (usually the jobId) salts the variety seed so two jobs with the
//        same title still get different layouts/backgrounds.
//
// NOTE: this is the FOUNDATION (helpers + theme + background + hook/stat/cta +
// generic text). Screenshot-hero, split-diagram, asset-grid, terminal, and the
// full per-pack skinning table are filled in from the scenekit-design pass.

const frameRegistry = require("./frame_registry");
const frameManifest = require("./frame_manifest");
const { fontFaceCss, isBundled } = require("../fonts/pack_fonts");
const { themeFromTokens } = require("./enrich");
const { safeArea, heroBox } = require("./responsive");
const { resolveBrand, atmosphericGround } = require("./brand_kit");
const { isTrustedProminent, isLogo, WEBSITE_BRAND_SOURCE, WEBSITE_ASSET_SOURCE } = require("./asset_priority");

// SINGLE-quoted family names — these are embedded in double-quoted style="..."
// attributes, so a double quote here would terminate the attribute early and kill
// every font-size/color after it (CSS accepts single quotes for family names).
const SAFE_FONTS = "Inter, 'Segoe UI', system-ui, Roboto, Helvetica, Arial, sans-serif";

// Fixed English literals rendered into the film. Isolated here so a translation
// pass can override them per-render via buildComposition({ localized }). NEVER
// mutate this object — renders run concurrently; merge into a per-call copy (S).
// The brand name "KEYFRAME" is intentionally NOT here (never translated).
const STRINGS = { live: "Live", livePreview: "Live preview" };

// Packs that are FLAT by design (no gradients / glows — solid color + hard edges).
// The scenekit-design pass produces the authoritative per-pack table; this is a
// safe default so the kit never paints gradients onto a neo-brutalist/print pack.
const FLAT_PACKS = new Set([
  "blockframe", "bauhaus-print", "biennale-yellow", "kinetic-bold", "noir-spotlight",
]);

// LIGHT-CINEMATIC packs: premium packs that sit on their LIGHTEST base (like
// flat packs) but keep the full gradient/glow treatment (unlike them) — the
// keynote/product-studio/storybook look: soft washes on porcelain grounds.
const LIGHT_GRADIENT_PACKS = new Set([
  "summit-keynote", "prism-launch", "fable-storybook",
]);

// PACK SKINS — deep per-pack identity for the premium packs: pinned accent
// order (token order from FRAME.md isn't guaranteed), a signature emphasis
// treatment, extra hues for ornaments, and a Three.js signature scene. The
// generic archetypes stay untouched; skins ADD ornament layers on top.
const PACK_SKINS = {
  "summit-keynote": {
    accents: ["#2B5BFF", "#D4A94E"],          // cobalt beam, champagne gold
    extras: ["#10214B", "#5A6B8C"],
    three: "constellation",
  },
  "prism-launch": {
    accents: ["#FF5A3C", "#8B7CF6"],          // ember CTA, iris
    extras: ["#5AD7E6", "#FFA3C0"],           // aqua, blush
    // signature: iridescent gradient clipped onto the emphasis word
    emphasisCss: "background:linear-gradient(100deg,#8B7CF6,#5AD7E6 50%,#FFA3C0);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:#8B7CF6;",
    three: "shards",
  },
  "fable-storybook": {
    accents: ["#D8734B", "#E8B84B"],          // terracotta, honey
    extras: ["#7FA37C", "#7A93B8"],           // sage, dusk
    three: "paper",
  },
  "longshot-cinema": {
    accents: ["#FFB454", "#4D9FFF"],          // tungsten key, beam counter
    extras: ["#F2F5F9", "#8B94A7"],
    emphasisCss: "background:linear-gradient(100deg,#FFB454,#4D9FFF);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:#FFB454;",
  },
};

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
// Deterministic per-video seed (from the jobId + title) — drives layout/motion
// VARIANT choices so two different videos never render the identical template,
// while a single video stays stable (re-renders are identical). FNV-1a.
function hashSeed(s) {
  let h = 2166136261; const str = String(s || "");
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
// NOT WCAG relative luminance: WCAG's coefficients over RAW 0-255 with no gamma
// linearization, so it is ~2x off through the midtones and its output is a 0-255
// scale, not 0-1. Do not read it as a contrast metric and do not swap in
// brand_kit's relLum "because it is the correct one" — the two are not
// interchangeable HERE, for a reason worth knowing:
//
// this function's live callers are a GROUND/BASE test, not a legibility test.
// isDark asks "is the ground dark", and the near-ground accent filter in
// deriveTheme asks "is this token the pack's own near-black/near-white BASE
// colour that leaked into the accent list" — a coarse "is it far from the
// ground" question a raw delta answers fine.
// Re-scoring that filter as a real 3:1 WCAG gate was measured across all 31 packs: it
// rejects the pack's OWN signature accents on 14 light-ground packs (brightlife's
// #06B6D4 reads 2.43:1 on white, mint-launch's #10B981 2.45:1, prism's ember
// #FF5A3C 2.97:1) and backfills them with the generic SAFE_BRIGHT list, so every
// light pack converges on the same #3B5BFF/#E2563C. That is a deliberate
// re-palette of half the catalogue, NOT a bug fix, and IDENTITY = LUMINANCE — so
// it needs its own decision and its own render review, not a silent ride-along
// with the brand plumbing.
//
// BRAND colour is different and does use brand_kit's gamma-correct relLum/ratio:
// a brand hex is an outsider with no claim on the pack's identity, so it must
// EARN its legibility on the real WCAG scale (see the brand merge below).
function lum(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return 128;
  const n = parseInt(m[1], 16);
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
}

// Derive the scene THEME from the chosen pack (authoritative) or, when no pack is
// bound, the storyboard's own palette. Returns the knobs every archetype re-skins.
function deriveTheme(framePack, storyboard, brandSkin) {
  // Pack identity knobs come from the manifest (single source of truth,
  // frames/<pack>/pack.json). The legacy FLAT_PACKS/LIGHT_GRADIENT_PACKS/
  // PACK_SKINS/PACK_MOTION/fxModeFor tables remain ONLY as the fail-soft
  // fallback for a pack that ships no (or an invalid) manifest.
  const manifest = framePack && framePack !== "auto" ? frameManifest.getManifest(framePack) : null;
  const tokens = framePack && framePack !== "auto" ? frameRegistry.getPackTokens(framePack) : null;
  const pal = (storyboard && storyboard.palette) || {};
  let ground, ink, accents, fonts;

  if (tokens) {
    const t = themeFromTokens(tokens);
    const colorVals = Object.values(tokens.colors || {});
    const flat = manifest ? manifest.surface.flat : FLAT_PACKS.has(framePack);
    // Flat packs sit on their lightest/offwhite (or black) ground; cinematic packs
    // on their darkest — except LIGHT-CINEMATIC packs (keynote/studio/storybook),
    // which are light-grounded but keep gradients. Pick ground by pack character.
    const lightGround = manifest ? (manifest.surface.flat || manifest.surface.lightCinematic)
      : (flat || LIGHT_GRADIENT_PACKS.has(framePack));
    // Authored ground (Phase 3) wins — it respects the pack's real color role
    // instead of the luminance heuristic, which mis-grounded light packs (bloom,
    // mono) onto their dark ink token and dark packs (noir) onto their lightest.
    const authoredGround = manifest && manifest.surface.ground;
    ground = authoredGround || (lightGround ? (t.lightBase || "#FFFDF5") : (t.darkBase || "#0B1020"));
    ink = lum(ground) > 140 ? "#15140F" : "#F6F4EE";
    accents = (t.accents && t.accents.length ? t.accents : colorVals).slice(0, 4);
    fonts = (tokens.fonts && tokens.fonts.length) ? tokens.fonts : ["Inter"];
  } else {
    ground = pal.background && /^#/.test(pal.background) ? pal.background : "#0B1020";
    ink = pal.text || (lum(ground) > 140 ? "#15140F" : "#F6F4EE");
    accents = [pal.accent, pal.primary].filter(Boolean);
    if (!accents.length) accents = ["#7CC4FF", "#FF7DB4", "#FFC878"];
    fonts = [(storyboard && storyboard.fontFamily) || "Inter"];
  }
  const isDark = lum(ground) < 140;
  const flat = manifest ? manifest.surface.flat : (framePack && FLAT_PACKS.has(framePack));
  // Drop any "accent" whose luminance sits too close to the ground (packs often
  // include a near-black/near-white base among their tokens) — otherwise an accent
  // word or gradient fades into the background. Backfill with safe brights so we
  // always have ≥2 visible accents.
  const safeBright = isDark ? ["#7CC4FF", "#FF7DB4", "#FFC878", "#8BE0A4"] : ["#3B5BFF", "#E2563C", "#1E9E5A", "#C9A227"];
  accents = accents.filter((a) => Math.abs(lum(a) - lum(ground)) > 55);
  for (const c of safeBright) { if (accents.length >= 2) break; if (!accents.includes(c)) accents.push(c); }
  accents = accents.slice(0, 4);
  // Skinned packs pin their accent ORDER (token order isn't guaranteed) so the
  // beam is always cobalt, the CTA always ember, the underline always honey.
  // From the manifest (skin.* + fx.three), or the legacy PACK_SKINS fallback.
  // Empty manifest accents -> null so the `skin?.accents` check below stays falsy.
  const skin = manifest
    ? { accents: manifest.skin.accents.length ? manifest.skin.accents : null,
        extras: manifest.skin.extras,
        emphasisCss: manifest.skin.emphasisCss,
        three: manifest.fx.three }
    : (framePack ? PACK_SKINS[framePack] : null);
  if (skin?.accents) accents = [...skin.accents, ...accents.filter((a) => !skin.accents.includes(a))].slice(0, 4);
  // BRAND SKIN (Art Director, ACCENT-ONLY): the product's real extracted brand
  // colors LEAD the accent list, so highlighted words / rules / counters / the
  // emphasis gradient read on-brand — while the pack keeps its own ground, fonts,
  // and character. Empty/failed skin → the pack's accents stand unchanged.
  //
  // Brand accents are held to a WCAG contrast floor (contract.contrastFloor, 3:1
  // by default) measured with brand_kit's gamma-correct ratio — a DIFFERENT and
  // stricter bar than the raw-delta base-token test the pack's own accents get
  // above. That asymmetry is deliberate and worth stating, because the
  // comment this replaced claimed the two were "the SAME filter" while actually
  // holding brand colour to a LOOSER bar (>45 raw vs the pack's >55): a pack's
  // accents are its identity and it has already chosen to live with them, while a
  // brand hex arrives from a scraped site with no such claim.
  //
  // resolveBrand NUDGES rather than drops: a muted brand navy on a dark ground is
  // walked up in HSL lightness with its HUE HELD until it clears the floor, so it
  // ships lifted instead of discarded. Only a colour unsalvageable within the
  // hue-drift budget is dropped, and both outcomes are disclosed on brand.adjusted
  // / brand.dropped rather than applied silently.
  //
  // Ground authority stays HERE: isDark is passed explicitly so brand_kit scores
  // against the ground deriveTheme actually picked, and resolveBrand returns no
  // ground/ink/font key to read even if a caller wanted one.
  const brand = resolveBrand(brandSkin, {
    ground, isDark, packAccents: accents, contract: manifest && manifest.brand,
  });
  // Only a brand that actually applied may touch the list — a null/failed skin
  // leaves the pack's own accents byte-identical (fail-open, art_director.js:14).
  if (brand.applied) accents = brand.accents.slice(0, 4);
  // ATMOSPHERE (Problem #7 for scene-kit packs): a mode:"atmosphere" pack lets the
  // brand hue faintly wash its GROUND — the last brand surface beyond accents + the
  // line/panel retint. atmosphericGround is luminance-pinned, so isDark and the forced
  // text contrast below are unchanged. brand.atmosphere is null for accents-mode / no-
  // brand packs, so this is a byte-identical no-op everywhere except a pack that opts
  // in. Ground authority stays HERE — resolveBrand still returns no ground key (the
  // art_director house law); scene_kit owns the tint, brand_kit only supplies the hue.
  if (brand.applied && brand.atmosphere) ground = atmosphericGround(ground, brand.atmosphere);
  // Force maximum text contrast against the ground (the storyboard's text hex is
  // often a mid-tone that reads as muddy).
  ink = isDark ? "#FFFFFF" : "#14130E";
  // BODY stack: fonts the renderer auto-resolves (Inter/system) — the neutral base
  // every scene inherits.
  const RESOLVABLE = new Set(["inter", "roboto", "arial", "helvetica", "georgia", "system-ui"]);
  const lead = fonts.filter((f) => RESOLVABLE.has(String(f).toLowerCase().trim()));
  const fontStack = lead.length ? `${lead.map((f) => `'${f}'`).join(", ")}, ${SAFE_FONTS}` : SAFE_FONTS;

  // DISPLAY face (Phase 3 typography-eraser fix): the pack's real headline font,
  // from the manifest. It's usable if it's a bundled webfont (we inline its
  // @font-face as a base64 data-URI — deterministic, offline, satisfies the lint)
  // OR a safe/system family the renderer already resolves (Inter, Georgia). The
  // pack's display type identity now RENDERS instead of collapsing to the body
  // stack. `fontFaceCss` is injected into the comp <style>; `displayStack` is
  // applied to headline words + stat numbers.
  const displayFamily = (manifest && manifest.typography && manifest.typography.display) || null;
  const displayUsable = displayFamily
    && (isBundled(displayFamily) || RESOLVABLE.has(String(displayFamily).toLowerCase().trim()));
  const displayStack = displayUsable ? `'${displayFamily}', ${fontStack}` : fontStack;
  const fontFace = displayUsable ? fontFaceCss(displayFamily) : "";
  // TEXT-FX (per-pack headline animation + typographic treatment). From the
  // manifest's textfx block; every field falls back to the legacy look so packs
  // with no textfx render byte-identically to before (blur-up / gradient / seed
  // layout). This is the layer that stops every pack sharing one word animation.
  const tf = (manifest && manifest.textfx) || {};
  const textfx = {
    enter: tf.enter || "blur-up",
    emphasis: tf.emphasis || "gradient",
    case: tf.case || "none",
    tracking: typeof tf.tracking === "number" ? tf.tracking : 0,
    weight: tf.weight || null,
    sizeScale: typeof tf.sizeScale === "number" && tf.sizeScale > 0 ? tf.sizeScale : 1,
    align: tf.align || "rotate",
  };
  return {
    ground, ink, accents,
    textfx,
    accent: accents[0],
    accent2: accents[1] || accents[0],
    extras: skin?.extras || [],
    emphasisCss: skin?.emphasisCss || null,
    // The resolved PackSkin (never null — an unapplied one is the pack's own
    // resolution). Carries brand.applied for the emphasis treatment, plus the
    // adjusted/dropped disclosure for whoever wants to log what the brand cost.
    brand,
    packName: framePack || null,
    manifest,   // pack manifest (or null) — read by motionFor/buildCanvasFx/buildThreeFx
    fontStack,
    displayStack,   // headline/stat font stack (display face + body fallback)
    fontFace,       // @font-face CSS to inject (empty for safe/system display faces)
    isDark,
    gradients: !flat,          // flat packs: solid fills + hard borders only
    dim: isDark ? "rgba(255,255,255,0.62)" : "rgba(20,18,12,0.62)",
    // BRAND LAYER 1 — light up the (previously dead) resolveBrand ui bundle: when a brand
    // actually applied, card/chip backgrounds and borders carry a subtle brand tint, so
    // brand color reaches surfaces beyond text (the #7 complaint). Gated on brand.applied →
    // a null/failed skin leaves these byte-identical to the pack's neutral rgba (fail-open,
    // art_director.js:14; keeps the null-skin render magenta-test-clean). Flat packs' HARD
    // borders use theme.ink, not theme.line, so their print identity is untouched.
    line: brand.applied ? brand.ui.border : (isDark ? "rgba(255,255,255,0.14)" : "rgba(20,18,12,0.14)"),
    panel: brand.applied ? brand.ui.chip : (isDark ? "rgba(255,255,255,0.05)" : "rgba(20,18,12,0.04)"),
  };
}

// The GSAP helper functions — emitted ONCE. They mechanically satisfy the five
// most error-prone lint rules (camera, word-stagger, counter, exit-kill, finite
// repeats) so every archetype stays clean with almost no per-scene code.
function emitHelpers(D) {
  return [
    `var tl = gsap.timeline({ paused: true, defaults: { ease: "power3.out" } });`,
    `var D = ${D};`,
    `function reps(c){ return Math.max(0, Math.floor(D/c)-1); }`,
    `function sreps(span,c){ return Math.max(0, Math.floor(span/c)-1); }`,
    `function wordsIn(sel,at,stg){ tl.fromTo(sel,{yPercent:80,opacity:0,filter:"blur(8px)"},{yPercent:0,opacity:1,filter:"blur(0px)",duration:0.62,stagger:stg||0.08,ease:"power3.out"},at); }`,
    // textIn — the pack-selected headline entrance. word-level modes animate the
    // .kfw spans; char-level modes (typewriter/char-pop/glitch) animate .kfc spans
    // (headlineSpans splits into chars only for those). Each mode is a SINGLE
    // fromTo/stagger so it never overlaps sceneMotion's container tweens (which own
    // the clip's scale/xPercent, not .kfw/.kfc) — the overlapping-tween lint stays
    // clean. Char staggers are budget-clamped so long headlines still finish on time.
    `function _cstg(sel,cap,budget){ var n=Math.max(1,gsap.utils.toArray(sel).length); return Math.min(cap, budget/n); }`,
    `function textIn(mode,ws,cs,at,stg){ var s=stg||0.08;`
      + ` if(mode==="typewriter"){ tl.fromTo(cs,{opacity:0},{opacity:1,duration:0.01,ease:"none",stagger:_cstg(cs,0.05,1.0)},at); return; }`
      + ` if(mode==="char-pop"){ tl.fromTo(cs,{opacity:0,scale:0.3,y:12},{opacity:1,scale:1,y:0,duration:0.5,ease:"back.out(2.2)",stagger:_cstg(cs,0.035,0.9)},at); return; }`
      + ` if(mode==="glitch"){ tl.fromTo(cs,{opacity:0,x:-9,skewX:14},{opacity:1,x:0,skewX:0,duration:0.34,ease:"power2.out",stagger:_cstg(cs,0.03,0.8)},at); return; }`
      + ` if(mode==="slide"){ tl.fromTo(ws,{opacity:0,x:-36},{opacity:1,x:0,duration:0.55,ease:"power3.out",stagger:s},at); return; }`
      + ` if(mode==="spring"){ tl.fromTo(ws,{opacity:0,scale:0.62,y:18},{opacity:1,scale:1,y:0,duration:0.7,ease:"back.out(1.9)",stagger:s},at); return; }`
      + ` if(mode==="mask-reveal"){ tl.fromTo(ws,{opacity:0,yPercent:55,clipPath:"inset(0 0 100% 0)"},{opacity:1,yPercent:0,clipPath:"inset(0 0 0% 0)",duration:0.66,ease:"power3.out",stagger:s},at); return; }`
      + ` if(mode==="line-wipe"){ tl.fromTo(ws,{opacity:0,clipPath:"inset(0 100% 0 0)"},{opacity:1,clipPath:"inset(0 0% 0 0)",duration:0.6,ease:"power2.out",stagger:s},at); return; }`
      + ` if(mode==="drift"){ tl.fromTo(ws,{opacity:0,y:26,filter:"blur(5px)"},{opacity:1,y:0,filter:"blur(0px)",duration:0.8,ease:"power2.out",stagger:s*1.4},at); return; }`
      + ` tl.fromTo(ws,{yPercent:80,opacity:0,filter:"blur(8px)"},{yPercent:0,opacity:1,filter:"blur(0px)",duration:0.62,ease:"power3.out",stagger:s},at); }`,
    `function pushIn(sel,at,dur,from,to){ tl.fromTo(sel,{scale:from},{scale:to,duration:dur,ease:"none"},at); }`,
    `function countUp(id,to,at,dur,fmt){ var o={v:0}; tl.to(o,{v:to,duration:dur,ease:"power2.out",snap:{v:1},onUpdate:function(){var el=document.getElementById(id);if(el)el.textContent=fmt(Math.round(o.v));}},at); }`,
    `function exitScene(sel,at,end){ tl.to(sel,{opacity:0,duration:0.3,ease:"power2.in"},at); tl.set(sel,{opacity:0},end); }`,
  ].join("\n");
}

// ---- MOTION GRAMMAR ------------------------------------------------------------
// The anti-slideshow layer. Every pack gets an EDITORIAL CUT (how one scene hands
// off to the next — a whip-pan, a hard graphic wipe, a light flash, a watercolor
// wash…) plus a continuous camera drift on every scene, so no shot ever sits
// still and no scene change is ever a bare fade. The cut overlay lives on its own
// persistent top track and is timed to peak exactly on the boundary, hiding the
// clip swap the way a real edit hides a cut.
const PACK_MOTION = {
  "longshot-cinema":  { cut: "whip",  drift: 1.055 },
  "vapor-chrome":     { cut: "whip",  drift: 1.05 },
  "summit-keynote":   { cut: "panel", drift: 1.04 },
  "midnight-glass":   { cut: "panel", drift: 1.05 },
  "prism-launch":     { cut: "flash", drift: 1.05 },
  "aurora-spectrum":  { cut: "glow",  drift: 1.055 },
  "bloom-illustrated":{ cut: "wash",  drift: 1.04 },
  "fable-storybook":  { cut: "wash",  drift: 1.035 },
  "noir-spotlight":   { cut: "iris",  drift: 1.045 },
  "blockframe":       { cut: "wipe",  drift: 1.02 },
  "bauhaus-print":    { cut: "wipe",  drift: 1.02 },
  "kinetic-bold":     { cut: "push",  drift: 1.025 },
  "biennale-yellow":  { cut: "wipe",  drift: 1.025 },
  "mono-corporate":   { cut: "panel", drift: 1.03 },
};
function motionFor(framePack, theme) {
  if (theme && theme.manifest && theme.manifest.motion && theme.manifest.motion.cut) return theme.manifest.motion;
  return PACK_MOTION[framePack] || (theme.gradients ? { cut: "glow", drift: 1.05 } : { cut: "wipe", drift: 1.02 });
}

// One persistent overlay clip; per-boundary elements + tweens. Everything is
// pointer-less and occlusion-exempt (it covers content ON PURPOSE, mid-cut only).
function buildCutLayer(plan, theme, dims, D, motion, seed, track) {
  const bounds = plan.slice(1).map((p) => p.ctx.T);
  if (!bounds.length) return null;
  const W = dims.width, H = dims.height;
  const els = [], sc = [];
  bounds.forEach((Tb, k) => {
    const A = theme.accents[k % Math.max(1, theme.accents.length)] || theme.accent;
    const id = `kfcut${k}`;
    if (motion.cut === "wipe" || motion.cut === "push") {
      // hard graphic block, alternating direction — the brutalist/print cut.
      // Both halves are fromTo (exempt from the css-transform-conflict rule) so
      // GSAP owns the full transform; the block wipes IN from one edge, then OUT
      // to the other, hiding the clip swap on the boundary.
      const fromLeft = (k + seed) % 2 === 0;
      els.push(`<div id="${id}" style="position:absolute;inset:0;background:${A};transform:scaleX(0);"></div>`);
      sc.push(`tl.fromTo("#${id}",{scaleX:0,transformOrigin:"${fromLeft ? "0%" : "100%"} 50%"},{scaleX:1,duration:0.26,ease:"power4.in"},${r(Tb - 0.26)});`);
      // immediateRender:false — this exit fromTo starts from the VISIBLE state
      // (scaleX:1). With GSAP's default immediateRender:true it forces scaleX:1 at
      // build time, so this full-frame colored wipe stays stretched over the whole
      // frame from t=0 until its tween fires — blanking every scene before the last
      // boundary (the "solid colour for N seconds" bug on wipe/push packs).
      sc.push(`tl.fromTo("#${id}",{scaleX:1,transformOrigin:"${fromLeft ? "100%" : "0%"} 50%"},{scaleX:0,duration:0.3,ease:"power4.out",immediateRender:false},${r(Tb + 0.04)});`);
    } else if (motion.cut === "whip") {
      // motion-blur streak racing across the frame — the one-take whip-pan
      els.push(`<div id="${id}" style="position:absolute;top:-4%;bottom:-4%;left:-45%;width:38%;transform:skewX(-16deg);opacity:0;background:linear-gradient(90deg,transparent,${rgba(theme.ink, 0.10)} 30%,${rgba(A, 0.28)} 50%,${rgba(theme.ink, 0.10)} 70%,transparent);filter:blur(6px);"></div>`);
      sc.push(`tl.fromTo("#${id}",{xPercent:0,opacity:0},{xPercent:60,opacity:1,duration:0.16,ease:"power2.in"},${r(Tb - 0.3)});`);
      sc.push(`tl.to("#${id}",{xPercent:400,opacity:0,duration:0.34,ease:"power3.out"},${r(Tb - 0.14)});`);
    } else if (motion.cut === "flash") {
      // studio strobe + chromatic streak — the product-reveal cut
      els.push(`<div id="${id}" style="position:absolute;inset:0;opacity:0;background:${theme.isDark ? "#FFFFFF" : "#FFFFFF"};"></div>`);
      els.push(`<div id="${id}c" style="position:absolute;top:46%;height:8%;left:-40%;right:auto;width:40%;opacity:0;transform:skewX(-24deg);background:linear-gradient(90deg,transparent,${rgba(theme.accent2, 0.7)},${rgba(A, 0.7)},transparent);filter:blur(10px);"></div>`);
      sc.push(`tl.fromTo("#${id}",{opacity:0},{opacity:0.92,duration:0.14,ease:"power2.in"},${r(Tb - 0.16)});`);
      sc.push(`tl.to("#${id}",{opacity:0,duration:0.36,ease:"power2.out"},${r(Tb)});`);
      sc.push(`tl.fromTo("#${id}c",{xPercent:0,opacity:1},{xPercent:340,opacity:0,duration:0.5,ease:"power3.out",immediateRender:false},${r(Tb - 0.08)});`);
    } else if (motion.cut === "wash") {
      // soft blurred wash sweeping diagonally — watercolor page-turn
      els.push(`<div id="${id}" style="position:absolute;top:-30%;bottom:-30%;left:-70%;width:70%;opacity:0;transform:rotate(-9deg);border-radius:50%;background:${rgba(A, 0.5)};filter:blur(${Math.round(H * 0.06)}px);"></div>`);
      sc.push(`tl.fromTo("#${id}",{xPercent:0,opacity:0},{xPercent:130,opacity:1,duration:0.34,ease:"sine.in"},${r(Tb - 0.34)});`);
      sc.push(`tl.to("#${id}",{xPercent:300,opacity:0,duration:0.44,ease:"sine.out"},${r(Tb)});`);
    } else if (motion.cut === "panel") {
      // near-opaque ground panel with a leading accent edge sweeping vertically —
      // the keynote slide-advance
      const down = (k + seed) % 2 === 0;
      els.push(`<div id="${id}" style="position:absolute;left:0;right:0;top:-110%;height:105%;opacity:0;background:linear-gradient(${down ? "180deg" : "0deg"},${rgba(theme.ground, 0.0)} 0%,${rgba(theme.ground, 0.96)} 22%,${rgba(theme.ground, 0.96)} 88%,${rgba(A, 0.9)} 96%,${rgba(A, 0)} 100%);"></div>`);
      sc.push(`tl.set("#${id}",{opacity:1},${r(Tb - 0.42)});`);
      sc.push(`tl.fromTo("#${id}",{yPercent:${down ? 0 : 210}},{yPercent:${down ? 210 : 0},duration:0.72,ease:"power3.inOut"},${r(Tb - 0.4)});`);
      sc.push(`tl.set("#${id}",{opacity:0},${r(Tb + 0.4)});`);
    } else if (motion.cut === "iris") {
      // circular iris close/open on the boundary — the noir spotlight blink.
      // fromTo on both halves keeps GSAP owning the transform (exempt).
      const dia = Math.ceil(Math.sqrt(W * W + H * H) * 1.05);
      els.push(`<div id="${id}" style="position:absolute;left:50%;top:50%;width:${dia}px;height:${dia}px;margin:-${Math.round(dia / 2)}px 0 0 -${Math.round(dia / 2)}px;border-radius:50%;background:${theme.ground};transform:scale(0);"></div>`);
      sc.push(`tl.fromTo("#${id}",{scale:0},{scale:1,duration:0.3,ease:"power3.in"},${r(Tb - 0.3)});`);
      // immediateRender:false — same fix as the wipe: this full-frame ground-colored
      // iris starts its exit from scale:1 (visible); default immediateRender would
      // stretch it over the whole frame from t=0 (blanks noir-spotlight).
      sc.push(`tl.fromTo("#${id}",{scale:1},{scale:0,duration:0.36,ease:"power3.out",immediateRender:false},${r(Tb + 0.04)});`);
    } else { // glow — luminous pulse riding a motion crossfade
      els.push(`<div id="${id}" style="position:absolute;inset:-10%;opacity:0;background:radial-gradient(52% 52% at 50% 50%,${rgba(A, 0.34)},transparent 72%);filter:blur(10px);"></div>`);
      sc.push(`tl.fromTo("#${id}",{opacity:0,scale:0.8},{opacity:1,scale:1.06,duration:0.3,ease:"sine.in"},${r(Tb - 0.3)});`);
      sc.push(`tl.to("#${id}",{opacity:0,scale:1.2,duration:0.4,ease:"sine.out"},${r(Tb + 0.02)});`);
    }
  });
  const html = `<div class="clip" data-start="0" data-duration="${D}" data-track-index="${track}" data-layout-allow-occlusion style="pointer-events:none;overflow:hidden;">${els.join("")}</div>`;
  return { html, script: sc.join("\n") };
}

// Entrance / exit / drift for one scene clip, matched to the pack's cut. The
// archetype scripts own the CONTENT choreography (words, counters, art); this
// owns the CAMERA: how the shot arrives, how it never sits still, how it leaves.
function sceneMotion(p, motion, seed, total) {
  const { id, T, L } = p.ctx;
  const i = p.i;
  const out = [];
  const cut = motion.cut;
  // -- entrance (scene 0 opens cold; the hook's own choreography carries it)
  if (i > 0) {
    if (cut === "whip") out.push(`tl.fromTo("#${id}",{xPercent:16,filter:"blur(10px)"},{xPercent:0,filter:"blur(0px)",duration:0.5,ease:"power3.out"},${r(T)});`);
    else if (cut === "wipe" || cut === "push") out.push(`tl.fromTo("#${id}",{xPercent:${(i + seed) % 2 === 0 ? 20 : -20}},{xPercent:0,duration:0.45,ease:"power4.out"},${r(T + 0.04)});`);
    else if (cut === "flash") out.push(`tl.fromTo("#${id}",{scale:1.08},{scale:1,duration:0.6,ease:"power3.out"},${r(T)});`);
    else if (cut === "wash") out.push(`tl.fromTo("#${id}",{y:30,filter:"blur(6px)"},{y:0,filter:"blur(0px)",duration:0.55,ease:"power2.out"},${r(T)});`);
    else if (cut === "panel") out.push(`tl.fromTo("#${id}",{yPercent:7},{yPercent:0,duration:0.55,ease:"power3.out"},${r(T + 0.04)});`);
    else if (cut === "iris") out.push(`tl.fromTo("#${id}",{scale:0.94},{scale:1,duration:0.5,ease:"power2.out"},${r(T + 0.04)});`);
    else out.push(`tl.fromTo("#${id}",{scale:0.965,y:12},{scale:1,y:0,duration:0.55,ease:"power3.out"},${r(T)});`);
  }
  // -- exit (last scene holds)
  if (!p.ctx.isLast) {
    if (cut === "whip") out.push(`tl.to("#${id}",{xPercent:-14,filter:"blur(8px)",duration:0.34,ease:"power2.in"},${r(T + L - 0.34)});`);
    else if (cut === "wipe" || cut === "push") out.push(`tl.to("#${id}",{xPercent:${(i + seed) % 2 === 0 ? -12 : 12},duration:0.3,ease:"power2.in"},${r(T + L - 0.3)});`);
    else if (cut === "flash") out.push(`tl.to("#${id}",{scale:1.05,duration:0.3,ease:"power2.in"},${r(T + L - 0.3)});`);
    else if (cut === "wash") out.push(`tl.to("#${id}",{y:-22,filter:"blur(5px)",duration:0.36,ease:"sine.in"},${r(T + L - 0.36)});`);
    else if (cut === "panel") out.push(`tl.to("#${id}",{yPercent:-6,duration:0.36,ease:"power2.in"},${r(T + L - 0.36)});`);
    else if (cut === "iris") out.push(`tl.to("#${id}",{scale:0.96,duration:0.3,ease:"power2.in"},${r(T + L - 0.3)});`);
    else out.push(`tl.to("#${id}",{scale:0.97,y:-10,duration:0.36,ease:"power2.in"},${r(T + L - 0.36)});`);
  }
  // -- drift: the camera never sits still. A slow, continuous push over the
  // SETTLED middle of the scene. It runs strictly BETWEEN the entrance and exit
  // windows (no temporal overlap), so it never double-writes scale/xPercent with
  // the boundary tweens — the linter's overlapping_gsap_tweens is avoided and the
  // motion stays clean. Starts at scale 1 (where the entrance leaves it) for a
  // seamless handoff.
  let ds = r(T + (i > 0 ? 0.62 : 0));       // after the entrance settles
  let de = r(T + L - (p.ctx.isLast ? 0 : 0.4)); // before the exit begins
  if (de - ds < 0.6) { ds = r(T); de = r(T + L); } // pathologically short scene: full span
  const panX = ((i + seed) % 3 - 1) * 0.6;  // -0.6 / 0 / +0.6 %
  const drift = `tl.fromTo("#${id}",{scale:1,xPercent:0},{scale:${motion.drift},xPercent:${panX},duration:${r(de - ds)},ease:"none"},${ds});`;
  return [drift, ...out].join("\n");
}

// Background depth stack — persistent, tracks 0–3, full duration, never exits.
// CANVAS FX — the living backdrop. One HTML5 canvas inside the ground clip,
// painted as a PURE function of the renderer's hf-seek time (deterministic:
// re-rendering the same job is byte-identical; seeking is exact). The CSS
// ground stays behind it as the fail-safe, so a canvas hiccup can never black
// the frame. Effects are art-directed per pack family and colored only with
// theme tokens, kept low-alpha so content always owns the frame.
function fxModeFor(framePack, theme) {
  const p = String(framePack || "");
  if (/vapor/.test(p)) return "grid";        // synthwave horizon grid pulse
  if (/noir/.test(p)) return "rays";         // rotating spotlight wedge + dust
  if (/midnight|aurora/.test(p)) return "flow"; // orbiting gradient blobs
  if (/summit/.test(p)) return "constellation"; // pitch: drifting data network
  if (/prism/.test(p)) return "prism";       // launch: iridescent 3D shards
  if (/fable/.test(p)) return "ribbon";      // storytelling: flowing ribbons
  if (/longshot/.test(p)) return "rays";     // cinema: raking light + dust
  if (!theme.gradients) return "confetti";   // flat packs: hard shapes, no blur
  return "bokeh";                            // bloom/mono/default: soft drift
}

function buildCanvasFx(theme, dims, D, seed, framePack) {
  const W = dims.width, H = dims.height;
  const mode = (theme.manifest && theme.manifest.fx && theme.manifest.fx.canvas) || fxModeFor(framePack, theme);
  const A = rgba(theme.accent, 1).replace(",1)", ",%A%)");
  const B = rgba(theme.accent2 || theme.accent, 1).replace(",1)", ",%A%)");
  const I = rgba(theme.ink, 1).replace(",1)", ",%A%)");
  const col = (tpl, a) => tpl.replace("%A%", a);
  const html = `<canvas id="kffx" width="${W}" height="${H}" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;"></canvas>`;

  // Mode-specific painter body — everything derives from t and the seeded set.
  let init = "", paint = "";
  if (mode === "flow") {
    init = `var BL=[];for(var i=0;i<3;i++)BL.push({ph:rnd()*6.28,sp:.06+rnd()*.05,rx:W*(.22+rnd()*.18),ry:H*(.3+rnd()*.2),r:H*(.45+rnd()*.25)});var BC=[${JSON.stringify(col(A, ".16"))},${JSON.stringify(col(B, ".13"))},${JSON.stringify(col(A, ".09"))}];`;
    paint = `for(var i=0;i<BL.length;i++){var b=BL[i],x=W*.5+Math.cos(t*b.sp+b.ph)*b.rx,y=H*.45+Math.sin(t*b.sp*.8+b.ph)*b.ry;var g=cx.createRadialGradient(x,y,0,x,y,b.r);g.addColorStop(0,BC[i]);g.addColorStop(1,"rgba(0,0,0,0)");cx.fillStyle=g;cx.fillRect(0,0,W,H);}`;
  } else if (mode === "grid") {
    init = `var HZ=H*.62,VP=W*.5,NL=9,NV=13,GA=${JSON.stringify(col(A, ".22"))},GB=${JSON.stringify(col(B, ".30"))};`;
    paint =
      `cx.strokeStyle=GA;cx.lineWidth=1.5;` +
      `for(var v=0;v<=NV;v++){var fx=(v/NV-.5)*W*3;cx.beginPath();cx.moveTo(VP,HZ);cx.lineTo(VP+fx,H);cx.stroke();}` +
      `var sp=(H-HZ)/NL;for(var l=0;l<NL;l++){var off=(t*22)%sp,yy=HZ+l*sp+off;if(yy>H)continue;var k=(yy-HZ)/(H-HZ);cx.globalAlpha=.12+k*.3;cx.beginPath();cx.moveTo(0,yy);cx.lineTo(W,yy);cx.stroke();}cx.globalAlpha=1;` +
      `var hg=cx.createLinearGradient(0,HZ-H*.06,0,HZ+H*.02);hg.addColorStop(0,"rgba(0,0,0,0)");hg.addColorStop(.7,GB);hg.addColorStop(1,"rgba(0,0,0,0)");cx.fillStyle=hg;cx.fillRect(0,HZ-H*.06,W,H*.08);`;
  } else if (mode === "rays") {
    init = `var RA=${JSON.stringify(col(A, ".14"))},DUST=[];for(var i=0;i<26;i++)DUST.push({x:rnd()*W,y:rnd()*H,r:.8+rnd()*2.2,s:.15+rnd()*.5,p:rnd()*6.28});`;
    paint =
      `cx.save();cx.translate(W*.68,-H*.15);cx.rotate(-.5+Math.sin(t*.12)*.22);` +
      `var rg=cx.createLinearGradient(0,0,0,H*1.5);rg.addColorStop(0,RA);rg.addColorStop(1,"rgba(0,0,0,0)");cx.fillStyle=rg;` +
      `cx.beginPath();cx.moveTo(0,0);cx.lineTo(-W*.22,H*1.5);cx.lineTo(W*.22,H*1.5);cx.closePath();cx.fill();cx.restore();` +
      `cx.fillStyle=${JSON.stringify(col(A, ".5"))};for(var i=0;i<DUST.length;i++){var d=DUST[i],y=(d.y-t*9*d.s%H+H)%H,x=d.x+Math.sin(t*d.s+d.p)*14;cx.globalAlpha=.10+.12*Math.abs(Math.sin(t*.8+d.p));cx.beginPath();cx.arc(x,y,d.r,0,6.283);cx.fill();}cx.globalAlpha=1;`;
  } else if (mode === "confetti") {
    init = `var CF=[],CC=[${JSON.stringify(col(A, ".55"))},${JSON.stringify(col(B, ".5"))},${JSON.stringify(col(I, ".35"))}];for(var i=0;i<22;i++)CF.push({x:rnd()*W,y:rnd()*H,s:5+rnd()*9,w:.4+rnd()*.9,sp:12+rnd()*22,p:rnd()*6.28,c:i%3});`;
    paint = `for(var i=0;i<CF.length;i++){var f=CF[i],y=(f.y+t*f.sp)%(H+40)-20,x=f.x+Math.sin(t*.5+f.p)*18;cx.save();cx.translate(x,y);cx.rotate(t*f.w+f.p);cx.fillStyle=CC[f.c];cx.fillRect(-f.s/2,-f.s/2,f.s,f.s);cx.restore();}`;
  } else if (mode === "constellation") {
    // Pitch pack: a slowly drifting data network — nodes with connecting lines
    // that fade with distance. Reads as "the deck's diagram came alive".
    init = `var ND=[],NC=${JSON.stringify(col(A, ".55"))},NL=${JSON.stringify(col(A, ".16"))},NG=${JSON.stringify(col(B, ".6"))};for(var i=0;i<18;i++)ND.push({x:rnd()*W,y:rnd()*H,vx:(rnd()-.5)*14,vy:(rnd()-.5)*10,r:2+rnd()*3.5,g:i%5===0,p:rnd()*6.28});var LMAX=${Math.round(Math.min(W, H) * 0.24)};`;
    paint =
      `var P=[];for(var i=0;i<ND.length;i++){var n=ND[i];P.push({x:(n.x+t*n.vx%W+W)%W,y:(n.y+t*n.vy%H+H)%H,r:n.r,g:n.g,p:n.p});}` +
      `cx.lineWidth=1;for(var i=0;i<P.length;i++){for(var j=i+1;j<P.length;j++){var dx=P[i].x-P[j].x,dy=P[i].y-P[j].y,d=Math.sqrt(dx*dx+dy*dy);if(d<LMAX){cx.globalAlpha=(1-d/LMAX)*.5;cx.strokeStyle=NL;cx.beginPath();cx.moveTo(P[i].x,P[i].y);cx.lineTo(P[j].x,P[j].y);cx.stroke();}}}` +
      `for(var i=0;i<P.length;i++){var q=P[i];cx.globalAlpha=.5+.4*Math.sin(t*1.1+q.p);cx.fillStyle=q.g?NG:NC;cx.beginPath();cx.arc(q.x,q.y,q.r,0,6.283);cx.fill();}cx.globalAlpha=1;`;
  } else if (mode === "prism") {
    // Launch pack: iridescent translucent shards slowly rotating and rising —
    // the product-reveal light refraction, in the pack's pastel gradient hues.
    init = `var SH=[],SA=${JSON.stringify(col(A, ".16"))},SB=${JSON.stringify(col(B, ".14"))},SI=${JSON.stringify(col(I, ".08"))};var SC=[SA,SB,SI];for(var i=0;i<9;i++)SH.push({x:rnd()*W,y:rnd()*H,s:${Math.round(Math.min(W, H) / 14)}+rnd()*${Math.round(Math.min(W, H) / 8)},w:(rnd()-.5)*.5,sp:6+rnd()*14,p:rnd()*6.28,c:i%3});`;
    paint =
      `for(var i=0;i<SH.length;i++){var f=SH[i],y=(f.y-t*f.sp%(H+f.s*2)+H+f.s*2)%(H+f.s*2)-f.s,x=f.x+Math.sin(t*.3+f.p)*30;` +
      `cx.save();cx.translate(x,y);cx.rotate(t*f.w+f.p);` +
      `var g=cx.createLinearGradient(-f.s,0,f.s,0);g.addColorStop(0,SC[f.c]);g.addColorStop(1,SC[(f.c+1)%3]);cx.fillStyle=g;` +
      `cx.beginPath();cx.moveTo(0,-f.s);cx.lineTo(f.s*.87,f.s*.5);cx.lineTo(-f.s*.87,f.s*.5);cx.closePath();cx.fill();cx.restore();}`;
  } else if (mode === "ribbon") {
    // Storytelling pack: flowing sine ribbons sweeping across the frame — the
    // narrative thread, in warm watercolor tones.
    init = `var RB=[[${JSON.stringify(col(A, ".14"))},${(H * 0.30).toFixed(0)},.9,26],[${JSON.stringify(col(B, ".12"))},${(H * 0.55).toFixed(0)},.7,34],[${JSON.stringify(col(I, ".07"))},${(H * 0.76).toFixed(0)},1.15,20]];`;
    paint =
      `for(var i=0;i<RB.length;i++){var rb=RB[i];cx.strokeStyle=rb[0];cx.lineWidth=rb[3];cx.lineCap="round";cx.beginPath();` +
      `for(var x=-20;x<=W+20;x+=16){var y=rb[1]+Math.sin(x*.006+t*rb[2]+i*2.1)*${(H * 0.06).toFixed(0)}+Math.sin(x*.0017+t*.3)*${(H * 0.035).toFixed(0)};if(x<0)cx.moveTo(x,y);else cx.lineTo(x,y);}cx.stroke();}`;
  } else { // bokeh
    init = `var BK=[],KC=[${JSON.stringify(col(A, ".3"))},${JSON.stringify(col(B, ".24"))}];for(var i=0;i<24;i++)BK.push({x:rnd()*W,y:rnd()*H,r:5+rnd()*22,s:.2+rnd()*.7,p:rnd()*6.28,c:i%2});`;
    paint = `for(var i=0;i<BK.length;i++){var b=BK[i],y=(b.y-t*7*b.s%H+H)%H,x=b.x+Math.sin(t*b.s*.7+b.p)*22;var g=cx.createRadialGradient(x,y,0,x,y,b.r);g.addColorStop(0,KC[b.c]);g.addColorStop(1,"rgba(0,0,0,0)");cx.globalAlpha=.5+.5*Math.sin(t*.9+b.p)*.4;cx.fillStyle=g;cx.beginPath();cx.arc(x,y,b.r,0,6.283);cx.fill();}cx.globalAlpha=1;`;
  }

  const script =
    `(function(){var cv=document.getElementById("kffx");if(!cv||!cv.getContext)return;var cx=cv.getContext("2d");if(!cx)return;` +
    `var W=${W},H=${H};var sd=${(seed >>> 0) || 7};function rnd(){sd=(sd*1664525+1013904223)>>>0;return sd/4294967296;}` +
    init +
    `function kffxDraw(t){cx.clearRect(0,0,W,H);${paint}}` +
    `window.addEventListener("hf-seek",function(e){kffxDraw((e.detail&&e.detail.time)||0);});kffxDraw(0);})();`;

  return { html, script, mode };
}

// TRUE THREE.JS SIGNATURE LAYER — for skinned premium packs, a WebGL scene
// rendered under the adapter contract (module import from CDN, renderAt(t)
// driven ONLY by hf-seek, procedural geometry, pixelRatio 1, alpha canvas).
// It sits above the 2D canvas painter inside the ground clip; if the CDN
// import fails, the try/catch leaves the 2D layer as the backdrop.
function buildThreeFx(theme, dims, D, seed, framePack) {
  const three = (theme.manifest && theme.manifest.fx && theme.manifest.fx.three)
    || (PACK_SKINS[framePack] && PACK_SKINS[framePack].three);
  if (!three) return null;
  const W = dims.width, H = dims.height;
  // BUG #1 (WebGL accent collapse): on a 3D stage an un-contrast-corrected accent
  // can collapse into the ground, so a live brand paints resolveBrand's GROUND-CORRECTED
  // 0x ints (theme.brand.three.A/.B — Three.js accepts numeric colors, and the builders'
  // JSON.stringify emits an int as a bare number, a hex as a quoted string; both valid).
  // Off-brand keeps the EXACT pack accent strings so the unbranded WebGL layer is
  // byte-identical to today. three.particle === three.B, so gating B covers the
  // paper/points particle too.
  const brandOn = !!(theme.brand && theme.brand.applied);
  const A = brandOn ? theme.brand.three.A : theme.accent;
  const B = brandOn ? theme.brand.three.B : theme.accent2;
  // X0/X1 stay the pack's own extras decor (out of scope): fall back to the raw accent
  // STRINGS, never the brand-corrected ints, so the brand only touches A/B/particle.
  const X0 = (theme.extras && theme.extras[0]) || theme.accent2, X1 = (theme.extras && theme.extras[1]) || theme.accent;

  let build = "";
  if (three === "constellation") {
    build =
      `var pts=[],gold=[];for(var i=0;i<54;i++){var v=new T.Vector3((rnd()-.5)*9,(rnd()-.5)*5,(rnd()-.5)*4);(i%9===0?gold:pts).push(v);}` +
      `var pg=new T.BufferGeometry().setFromPoints(pts);grp.add(new T.Points(pg,new T.PointsMaterial({color:${JSON.stringify(A)},size:.055,transparent:true,opacity:.55,depthWrite:false})));` +
      `var gg=new T.BufferGeometry().setFromPoints(gold);grp.add(new T.Points(gg,new T.PointsMaterial({color:${JSON.stringify(B)},size:.09,transparent:true,opacity:.8,depthWrite:false})));` +
      `var lv=[];var all=pts.concat(gold);for(var i=0;i<all.length;i++)for(var j=i+1;j<all.length;j++){if(all[i].distanceTo(all[j])<1.5){lv.push(all[i].clone(),all[j].clone());}}` +
      `var lg=new T.BufferGeometry().setFromPoints(lv);grp.add(new T.LineSegments(lg,new T.LineBasicMaterial({color:${JSON.stringify(A)},transparent:true,opacity:.13})));` +
      `function anim(t){grp.rotation.y=t*.05;grp.rotation.x=Math.sin(t*.11)*.06;grp.position.y=Math.sin(t*.23)*.14;}`;
  } else if (three === "shards") {
    build =
      `var cols=[${JSON.stringify(B)},${JSON.stringify(X0)},${JSON.stringify(X1)}],sh=[];` +
      `for(var i=0;i<10;i++){var s=.28+rnd()*.5;var m=new T.Mesh(new T.OctahedronGeometry(s),new T.MeshBasicMaterial({color:cols[i%3],transparent:true,opacity:.15,depthWrite:false}));` +
      `var e=new T.LineSegments(new T.EdgesGeometry(new T.OctahedronGeometry(s)),new T.LineBasicMaterial({color:cols[i%3],transparent:true,opacity:.32}));m.add(e);` +
      `m.position.set((rnd()-.5)*9,(rnd()-.5)*5,(rnd()-.5)*3);m.userData={rx:(rnd()-.5)*.5,ry:(rnd()-.5)*.7,sp:.12+rnd()*.28,y0:m.position.y,p:rnd()*6.28};grp.add(m);sh.push(m);}` +
      `function anim(t){for(var i=0;i<sh.length;i++){var m=sh[i];m.rotation.x=t*m.userData.rx+m.userData.p;m.rotation.y=t*m.userData.ry;m.position.y=m.userData.y0+Math.sin(t*m.userData.sp+m.userData.p)*.6;}grp.rotation.y=t*.03;}`;
  } else { // paper
    build =
      `var planes=[];for(var i=0;i<4;i++){var g=new T.ConeGeometry(.22+rnd()*.12,.75,4);g.rotateZ(Math.PI/2);g.rotateY(.3);` +
      `var m=new T.Mesh(g,new T.MeshBasicMaterial({color:0xFDFAF2,transparent:true,opacity:.9,depthWrite:false}));` +
      `m.add(new T.LineSegments(new T.EdgesGeometry(g),new T.LineBasicMaterial({color:0x33261A,transparent:true,opacity:.35})));` +
      `m.userData={x0:(rnd()-.5)*10,y0:(rnd()-.5)*3.6,sp:.5+rnd()*.5,w:.4+rnd()*.5,p:rnd()*6.28};grp.add(m);planes.push(m);}` +
      `var fp=[];for(var i=0;i<22;i++)fp.push(new T.Vector3((rnd()-.5)*10,(rnd()-.5)*5.4,(rnd()-.5)*3));` +
      `var fg=new T.BufferGeometry().setFromPoints(fp);var fm=new T.PointsMaterial({color:${JSON.stringify(B)},size:.09,transparent:true,opacity:.6,blending:T.AdditiveBlending,depthWrite:false});grp.add(new T.Points(fg,fm));` +
      `function anim(t){for(var i=0;i<planes.length;i++){var m=planes[i],u=m.userData;m.position.x=((u.x0+t*u.sp)%12+12)%12-6;m.position.y=u.y0+Math.sin(t*u.w+u.p)*.5;m.rotation.z=Math.sin(t*u.w+u.p)*.18;m.rotation.x=Math.sin(t*.4+u.p)*.12;}fm.opacity=.4+.25*Math.sin(t*1.7);grp.rotation.y=Math.sin(t*.07)*.1;}`;
  }

  const html = `<canvas id="kf3d" width="${W}" height="${H}" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;"></canvas>`;
  const script =
    `<script type="module">try{` +
    `const T=await import("https://cdn.jsdelivr.net/npm/three@0.181.2/+esm");` +
    `const cv=document.getElementById("kf3d");if(cv){` +
    `const renderer=new T.WebGLRenderer({canvas:cv,alpha:true,antialias:true});renderer.setSize(${W},${H},false);renderer.setPixelRatio(1);` +
    `const scene=new T.Scene();const cam=new T.PerspectiveCamera(35,${W}/${H},.1,60);cam.position.set(0,0,7.5);` +
    `var sd=${((seed >>> 0) % 2147483647) || 7};function rnd(){sd=(sd*1664525+1013904223)>>>0;return sd/4294967296;}` +
    `const grp=new T.Group();scene.add(grp);` +
    build +
    `function renderAt(t){anim(t);cam.position.x=Math.sin(t*.06)*.3;cam.lookAt(0,0,0);renderer.render(scene,cam);}` +
    `window.addEventListener("hf-seek",(e)=>renderAt((e.detail&&e.detail.time)||0));renderAt(window.__hfThreeTime||0);` +
    `}}catch(e){}</` + `script>`;
  return { html, script };
}

// PER-SCENE ORNAMENT CLUSTERS — the pack's design-system furniture, animated
// by the main timeline. Injected as the scene clip's first child so content
// always paints above. Each cluster is authored per pack × archetype kind.
function buildSkinOrnaments(kind, ctx, framePack) {
  if (!framePack) return null;
  const { theme, id, T, L, dims, seed } = ctx;
  const W = dims.width, H = dims.height;
  const A = theme.accent, B = theme.accent2;
  const X0 = (theme.extras && theme.extras[0]) || B, X1 = (theme.extras && theme.extras[1]) || A;
  const pid = `${id}o`;
  const sv = []; // svg inner
  const dv = []; // extra absolute divs
  const sc = []; // gsap lines
  const end = r(T + L);
  const s0 = (n) => r(T + n);

  if (framePack === "summit-keynote") {
    // corner brackets (HUD confidence)
    const bl = Math.round(W * 0.03);
    sv.push(`<path class="${pid}k" d="M${bl * 2} ${bl}H${bl}V${bl * 2}" fill="none" stroke="${A}" stroke-width="3" opacity=".5" stroke-dasharray="200" stroke-dashoffset="200"/>`);
    sv.push(`<path class="${pid}k" d="M${W - bl * 2} ${H - bl}H${W - bl}V${H - bl * 2}" fill="none" stroke="${A}" stroke-width="3" opacity=".5" stroke-dasharray="200" stroke-dashoffset="200"/>`);
    sc.push(`tl.to("#${id} .${pid}k",{strokeDashoffset:0,duration:.7,stagger:.15,ease:"power2.out"},${s0(0.4)});`);
    if (kind === "stat" || kind === "text") {
      // rising bar chart + gold trend line (the pitch's proof, abstracted)
      const bx = Math.round(W * 0.68), bw = Math.round(W * 0.028), gap = Math.round(W * 0.014), byBase = Math.round(H * 0.82);
      const hts = [0.10, 0.16, 0.13, 0.22, 0.3].map((f) => Math.round(H * f));
      const ptsArr = [];
      hts.forEach((h, i) => {
        const x = bx + i * (bw + gap);
        sv.push(`<rect class="${pid}b" x="${x}" y="${byBase - h}" width="${bw}" height="${h}" rx="4" fill="${A}" opacity=".18"/>`);
        ptsArr.push(`${x + bw / 2},${byBase - h - 14}`);
      });
      sv.push(`<polyline class="${pid}t" points="${ptsArr.join(" ")}" fill="none" stroke="${B}" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="600" stroke-dashoffset="600" opacity=".9"/>`);
      sc.push(`tl.fromTo("#${id} .${pid}b",{scaleY:0,transformOrigin:"50% 100%"},{scaleY:1,duration:.7,stagger:.1,ease:"power3.out"},${s0(0.6)});`);
      sc.push(`tl.to("#${id} .${pid}t",{strokeDashoffset:0,duration:1.0,ease:"power2.inOut"},${s0(1.1)});`);
    }
    if (kind === "hook" || kind === "cta") {
      // dotted orbit ring, top-right — the constellation echoed in DOM
      const cxp = Math.round(W * 0.86), cyp = Math.round(H * 0.2), rr = Math.round(H * 0.11);
      sv.push(`<circle class="${pid}r" cx="${cxp}" cy="${cyp}" r="${rr}" fill="none" stroke="${A}" stroke-width="1.5" stroke-dasharray="4 9" opacity=".45"/>`);
      sv.push(`<circle class="${pid}d" cx="${cxp + rr}" cy="${cyp}" r="5" fill="${B}" opacity=".9"/>`);
      sc.push(`tl.to("#${id} .${pid}r",{rotation:360,transformOrigin:"${cxp}px ${cyp}px",duration:14,ease:"none",repeat:reps(14)},0);`);
      sc.push(`tl.fromTo("#${id} .${pid}d",{scale:0,transformOrigin:"50% 50%"},{scale:1,duration:.5,ease:"back.out(2)"},${s0(0.8)});`);
    }
  } else if (framePack === "prism-launch") {
    // refraction streaks sweeping across the studio
    dv.push(`<div class="${pid}s" style="position:absolute;top:${18 + (seed % 12)}%;left:-45%;width:44%;height:3px;transform:rotate(-16deg);background:linear-gradient(90deg,transparent,${rgba(B, 0.55)},${rgba(X0, 0.55)},${rgba(X1, 0.5)},transparent);"></div>`);
    dv.push(`<div class="${pid}s" style="position:absolute;top:${60 + (seed % 14)}%;left:-45%;width:34%;height:2px;transform:rotate(-16deg);background:linear-gradient(90deg,transparent,${rgba(X0, 0.45)},${rgba(X1, 0.45)},transparent);"></div>`);
    sc.push(`tl.fromTo("#${id} .${pid}s",{xPercent:0},{xPercent:340,duration:${Math.min(3.4, L - 0.4)},stagger:.5,ease:"sine.inOut"},${s0(0.3)});`);
    // triangle cluster (the shards, echoed) in a margin corner
    const tx = kind === "cta" ? W * 0.5 : W * 0.84, ty = kind === "cta" ? H * 0.18 : H * 0.76;
    const tricols = [B, X0, X1];
    for (let i = 0; i < 3; i++) {
      const s = 16 + i * 10, ox = Math.round(tx + (i - 1) * 44), oy = Math.round(ty + (i % 2 ? -18 : 12));
      sv.push(`<polygon class="${pid}g" points="${ox},${oy - s} ${ox + s * 0.87},${oy + s / 2} ${ox - s * 0.87},${oy + s / 2}" fill="${tricols[i]}" opacity=".4"/>`);
    }
    sc.push(`tl.fromTo("#${id} .${pid}g",{scale:0,transformOrigin:"50% 50%",rotation:-30},{scale:1,rotation:0,duration:.6,stagger:.12,ease:"back.out(1.8)"},${s0(0.7)});`);
    sc.push(`tl.to("#${id} .${pid}g",{rotation:14,duration:${Math.max(2, L - 1.6)},ease:"sine.inOut"},${s0(1.4)});`);
    if (kind === "stat") {
      const cxp = Math.round(W * 0.5), cyp = Math.round(H * 0.48), rr = Math.round(H * 0.26);
      sv.push(`<circle class="${pid}r" cx="${cxp}" cy="${cyp}" r="${rr}" fill="none" stroke="${X0}" stroke-width="1.5" stroke-dasharray="10 14" opacity=".5"/>`);
      sc.push(`tl.to("#${id} .${pid}r",{rotation:180,transformOrigin:"${cxp}px ${cyp}px",duration:${L},ease:"none"},${T});`);
    }
  } else if (framePack === "fable-storybook") {
    // watercolor blooms (blurred ellipses) + fireflies + hand-drawn accents
    const corner = seed % 2 === 0;
    sv.push(`<defs><filter id="${pid}bl" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="26"/></filter></defs>`);
    sv.push(`<ellipse class="${pid}w" cx="${Math.round(W * (corner ? 0.16 : 0.84))}" cy="${Math.round(H * 0.24)}" rx="${Math.round(W * 0.13)}" ry="${Math.round(H * 0.15)}" fill="${kind === "stat" ? X1 : A}" opacity=".14" filter="url(#${pid}bl)"/>`);
    sv.push(`<ellipse class="${pid}w" cx="${Math.round(W * (corner ? 0.82 : 0.2))}" cy="${Math.round(H * 0.78)}" rx="${Math.round(W * 0.11)}" ry="${Math.round(H * 0.13)}" fill="${X0}" opacity=".13" filter="url(#${pid}bl)"/>`);
    sc.push(`tl.fromTo("#${id} .${pid}w",{scale:.7,opacity:0,transformOrigin:"50% 50%"},{scale:1,opacity:1,duration:1.4,stagger:.3,ease:"sine.out"},${s0(0.2)});`);
    sc.push(`tl.to("#${id} .${pid}w",{x:${corner ? 14 : -14},y:-10,duration:${Math.max(2, L - 1)},ease:"sine.inOut"},${s0(1.2)});`);
    // fireflies
    for (let i = 0; i < 7; i++) {
      const fx = Math.round(W * (0.08 + ((seed >> i) % 85) / 100)), fy = Math.round(H * (0.1 + ((seed >> (i + 3)) % 78) / 100));
      sv.push(`<circle class="${pid}f${i % 3}" cx="${fx}" cy="${fy}" r="${2.5 + (i % 3)}" fill="${B}" opacity="0"/>`);
    }
    for (let g = 0; g < 3; g++) {
      sc.push(`tl.fromTo("#${id} .${pid}f${g}",{opacity:0},{opacity:.8,duration:.9,ease:"sine.inOut",yoyo:true,repeat:Math.max(1,Math.floor(${(L - 0.8).toFixed(1)}/1.8)*2-1)},${s0(0.5 + g * 0.4)});`);
      sc.push(`tl.to("#${id} .${pid}f${g}",{y:-16,duration:${Math.max(1.5, L - 0.6)},ease:"sine.inOut"},${s0(0.5)});`);
    }
    if (kind === "hook" || kind === "cta") {
      // hand-drawn honey flourish beneath the message
      const fx0 = Math.round(W * 0.08), fy0 = Math.round(H * 0.7), fw = Math.round(W * 0.24);
      sv.push(`<path class="${pid}h" d="M${fx0} ${fy0} q ${fw * 0.25} -18 ${fw * 0.5} 0 t ${fw * 0.5} 0" fill="none" stroke="${B}" stroke-width="4" stroke-linecap="round" stroke-dasharray="700" stroke-dashoffset="700" opacity=".85"/>`);
      sc.push(`tl.to("#${id} .${pid}h",{strokeDashoffset:0,duration:.9,ease:"power2.inOut"},${s0(1.0)});`);
    }
  } else if (framePack === "blockframe") {
    // candy-brutalist furniture: hard-bordered tape strips + a sticker burst
    const ik = theme.ink;
    dv.push(`<div class="${pid}t" style="position:absolute;top:${Math.round(H * 0.07)}px;left:-6%;width:22%;height:26px;transform:rotate(-5deg);background:${A};border:3px solid ${ik};box-shadow:5px 5px 0 ${ik};"></div>`);
    dv.push(`<div class="${pid}t" style="position:absolute;bottom:${Math.round(H * 0.09)}px;right:-6%;width:18%;height:26px;transform:rotate(4deg);background:${B};border:3px solid ${ik};box-shadow:5px 5px 0 ${ik};"></div>`);
    sc.push(`tl.fromTo("#${id} .${pid}t",{xPercent:(${seed % 2 === 0} ? -120 : 120)},{xPercent:0,duration:.5,stagger:.12,ease:"power4.out"},${s0(0.25)});`);
    if (kind === "hook" || kind === "cta") {
      const cxp = Math.round(W * 0.86), cyp = Math.round(H * 0.22);
      const spikes = [];
      for (let i = 0; i < 8; i++) { const an = (i / 8) * 6.283; spikes.push(`${Math.round(cxp + Math.cos(an) * 46)},${Math.round(cyp + Math.sin(an) * 46)} ${Math.round(cxp + Math.cos(an + 0.39) * 26)},${Math.round(cyp + Math.sin(an + 0.39) * 26)}`); }
      sv.push(`<polygon class="${pid}b" points="${spikes.join(" ")}" fill="${theme.accents[2] || B}" stroke="${ik}" stroke-width="3"/>`);
      sc.push(`tl.fromTo("#${id} .${pid}b",{scale:0,rotation:-40,transformOrigin:"${cxp}px ${cyp}px"},{scale:1,rotation:0,duration:.6,ease:"back.out(2.2)"},${s0(0.6)});`);
      sc.push(`tl.to("#${id} .${pid}b",{rotation:18,duration:${Math.max(2, L - 1.4)},ease:"sine.inOut"},${s0(1.3)});`);
    }
  } else if (framePack === "kinetic-bold") {
    // speed lines: skewed bars racing through on every scene + a diagonal rule
    for (let i = 0; i < 3; i++) {
      dv.push(`<div class="${pid}s" style="position:absolute;top:${14 + i * 30 + (seed % 8)}%;left:-40%;width:34%;height:${10 - i * 2}px;transform:skewX(-28deg);background:${[A, B, theme.ink][i % 3]};opacity:.85;"></div>`);
    }
    sc.push(`tl.fromTo("#${id} .${pid}s",{xPercent:0},{xPercent:520,duration:.7,stagger:.09,ease:"power3.inOut"},${s0(0.15)});`);
    sv.push(`<line class="${pid}d" x1="${Math.round(W * 0.82)}" y1="${H}" x2="${W}" y2="${Math.round(H * 0.72)}" stroke="${A}" stroke-width="10" stroke-dasharray="500" stroke-dashoffset="500"/>`);
    sc.push(`tl.to("#${id} .${pid}d",{strokeDashoffset:0,duration:.5,ease:"power4.out"},${s0(0.5)});`);
  } else if (framePack === "bauhaus-print") {
    // the primary-form trio: circle / triangle / square, slowly rotating
    const bx = kind === "cta" ? W * 0.5 : W * 0.84, by = kind === "cta" ? H * 0.16 : H * 0.78;
    sv.push(`<circle class="${pid}g" cx="${Math.round(bx - 60)}" cy="${Math.round(by)}" r="26" fill="${A}"/>`);
    sv.push(`<polygon class="${pid}g" points="${Math.round(bx)},${Math.round(by - 28)} ${Math.round(bx + 26)},${Math.round(by + 18)} ${Math.round(bx - 26)},${Math.round(by + 18)}" fill="${B}"/>`);
    sv.push(`<rect class="${pid}g" x="${Math.round(bx + 40)}" y="${Math.round(by - 24)}" width="48" height="48" fill="${theme.accents[2] || theme.ink}"/>`);
    sc.push(`tl.fromTo("#${id} .${pid}g",{scale:0,transformOrigin:"50% 50%"},{scale:1,duration:.55,stagger:.12,ease:"back.out(1.9)"},${s0(0.35)});`);
    sc.push(`tl.to("#${id} .${pid}g",{rotation:90,transformOrigin:"50% 50%",duration:${Math.max(2.4, L - 1.2)},ease:"sine.inOut"},${s0(1.1)});`);
    sv.push(`<line class="${pid}r" x1="${Math.round(W * 0.06)}" y1="${Math.round(H * 0.1)}" x2="${Math.round(W * 0.94)}" y2="${Math.round(H * 0.1)}" stroke="${theme.ink}" stroke-width="3" stroke-dasharray="${W}" stroke-dashoffset="${W}"/>`);
    sc.push(`tl.to("#${id} .${pid}r",{strokeDashoffset:0,duration:.8,ease:"power2.inOut"},${s0(0.2)});`);
  } else if (framePack === "biennale-yellow") {
    // editorial print chrome: double rules + folio diamonds
    const y1 = Math.round(H * 0.08), y2 = Math.round(H * 0.92);
    sv.push(`<line class="${pid}r" x1="${Math.round(W * 0.06)}" y1="${y1}" x2="${Math.round(W * 0.94)}" y2="${y1}" stroke="${theme.ink}" stroke-width="2.5" stroke-dasharray="${W}" stroke-dashoffset="${W}"/>`);
    sv.push(`<line class="${pid}r" x1="${Math.round(W * 0.06)}" y1="${y1 + 7}" x2="${Math.round(W * 0.94)}" y2="${y1 + 7}" stroke="${theme.ink}" stroke-width="1" stroke-dasharray="${W}" stroke-dashoffset="${W}" opacity=".6"/>`);
    sv.push(`<line class="${pid}r" x1="${Math.round(W * 0.06)}" y1="${y2}" x2="${Math.round(W * 0.94)}" y2="${y2}" stroke="${theme.ink}" stroke-width="1.5" stroke-dasharray="${W}" stroke-dashoffset="${W}" opacity=".7"/>`);
    sc.push(`tl.to("#${id} .${pid}r",{strokeDashoffset:0,duration:.9,stagger:.1,ease:"power2.inOut"},${s0(0.2)});`);
    sv.push(`<rect class="${pid}f" x="${Math.round(W * 0.5 - 7)}" y="${y2 - 7}" width="14" height="14" transform="rotate(45 ${Math.round(W * 0.5)} ${y2})" fill="${A}"/>`);
    sc.push(`tl.fromTo("#${id} .${pid}f",{scale:0,transformOrigin:"50% 50%"},{scale:1,duration:.5,ease:"back.out(2)"},${s0(0.9)});`);
    if (kind === "stat" || kind === "text") {
      sv.push(`<circle class="${pid}b" cx="${Math.round(W * 0.85)}" cy="${Math.round(H * 0.26)}" r="${Math.round(H * 0.09)}" fill="${A}" opacity=".85"/>`);
      sc.push(`tl.fromTo("#${id} .${pid}b",{scale:.4,opacity:0,transformOrigin:"50% 50%"},{scale:1,opacity:.85,duration:.8,ease:"power2.out"},${s0(0.5)});`);
      sc.push(`tl.to("#${id} .${pid}b",{y:-14,duration:${Math.max(2, L - 1.2)},ease:"sine.inOut"},${s0(1.3)});`);
    }
  } else if (framePack === "midnight-glass") {
    // frosted chip + neon diagonal streaks gliding through the dark
    dv.push(`<div class="${pid}c" style="position:absolute;top:${Math.round(H * 0.08)}px;right:${Math.round(W * 0.05)}px;width:${Math.round(W * 0.1)}px;height:10px;border-radius:9999px;background:linear-gradient(90deg,${rgba(A, 0.9)},${rgba(B, 0.6)});box-shadow:0 0 18px ${rgba(A, 0.55)};opacity:0;"></div>`);
    sc.push(`tl.fromTo("#${id} .${pid}c",{opacity:0,x:24},{opacity:1,x:0,duration:.6,ease:"power2.out"},${s0(0.35)});`);
    dv.push(`<div class="${pid}s" style="position:absolute;top:${20 + (seed % 18)}%;left:-45%;width:38%;height:2px;transform:rotate(-14deg);background:linear-gradient(90deg,transparent,${rgba(A, 0.5)},transparent);"></div>`);
    dv.push(`<div class="${pid}s" style="position:absolute;top:${58 + (seed % 16)}%;left:-45%;width:30%;height:1.5px;transform:rotate(-14deg);background:linear-gradient(90deg,transparent,${rgba(B, 0.4)},transparent);"></div>`);
    sc.push(`tl.fromTo("#${id} .${pid}s",{xPercent:0},{xPercent:360,duration:${Math.min(3.4, Math.max(1.8, L - 0.5))},stagger:.5,ease:"sine.inOut"},${s0(0.3)});`);
    if (kind === "hook" || kind === "cta") {
      dv.push(`<div class="${pid}p" style="position:absolute;left:${Math.round(W * 0.05)}px;bottom:${Math.round(H * 0.1)}px;width:${Math.round(W * 0.16)}px;height:${Math.round(H * 0.09)}px;border-radius:14px;border:1px solid ${rgba("#ffffff", 0.18)};background:${rgba("#ffffff", 0.05)};opacity:0;"></div>`);
      sc.push(`tl.fromTo("#${id} .${pid}p",{opacity:0,y:18},{opacity:1,y:0,duration:.6,ease:"power2.out"},${s0(0.7)});`);
      sc.push(`tl.to("#${id} .${pid}p",{y:-10,duration:${Math.max(1.8, L - 1.4)},ease:"sine.inOut",yoyo:true,repeat:1},${s0(1.4)});`);
    }
  } else if (framePack === "vapor-chrome") {
    // synthwave sun arcs + chrome strips
    const sx2 = Math.round(W * 0.85), sy2 = Math.round(H * 0.24);
    sv.push(`<circle class="${pid}a" cx="${sx2}" cy="${sy2}" r="${Math.round(H * 0.1)}" fill="none" stroke="${A}" stroke-width="3" stroke-dasharray="10 12" opacity=".6"/>`);
    sv.push(`<circle class="${pid}a" cx="${sx2}" cy="${sy2}" r="${Math.round(H * 0.15)}" fill="none" stroke="${B}" stroke-width="2" stroke-dasharray="4 14" opacity=".45"/>`);
    sc.push(`tl.to("#${id} .${pid}a",{rotation:200,transformOrigin:"${sx2}px ${sy2}px",duration:${r(L)},ease:"none"},${T});`);
    for (let i = 0; i < 3; i++) {
      dv.push(`<div class="${pid}h" style="position:absolute;bottom:${Math.round(H * (0.1 + i * 0.035))}px;left:-30%;width:26%;height:${7 - i * 2}px;background:linear-gradient(90deg,transparent,${rgba([A, B, theme.ink][i % 3], 0.7)},transparent);"></div>`);
    }
    sc.push(`tl.fromTo("#${id} .${pid}h",{xPercent:0},{xPercent:460,duration:${Math.min(3, Math.max(1.6, L - 0.6))},stagger:.3,ease:"sine.inOut"},${s0(0.3)});`);
  } else if (framePack === "noir-spotlight") {
    // the swaying spotlight cone + film-slate corner marks
    dv.push(`<div class="${pid}l" style="position:absolute;top:-30%;left:${kind === "cta" ? 35 : 8 + (seed % 20)}%;width:34%;height:160%;opacity:0;background:radial-gradient(50% 42% at 50% 30%,${rgba(A, 0.16)},transparent 74%);"></div>`);
    sc.push(`tl.fromTo("#${id} .${pid}l",{opacity:0},{opacity:1,duration:.8},${s0(0.2)});`);
    sc.push(`tl.to("#${id} .${pid}l",{x:${Math.round(W * 0.05)},duration:${Math.max(2, L - 1)},ease:"sine.inOut",yoyo:true,repeat:1},${s0(0.6)});`);
    const mk = Math.round(W * 0.02);
    sv.push(`<path class="${pid}m" d="M${mk * 2.5} ${mk}H${mk}V${mk * 2.5}" fill="none" stroke="${rgba(theme.ink, 0.5)}" stroke-width="3" stroke-dasharray="120" stroke-dashoffset="120"/>`);
    sv.push(`<path class="${pid}m" d="M${W - mk * 2.5} ${H - mk}H${W - mk}V${H - mk * 2.5}" fill="none" stroke="${rgba(theme.ink, 0.5)}" stroke-width="3" stroke-dasharray="120" stroke-dashoffset="120"/>`);
    sc.push(`tl.to("#${id} .${pid}m",{strokeDashoffset:0,duration:.5,stagger:.12,ease:"power2.out"},${s0(0.35)});`);
  } else if (framePack === "aurora-spectrum") {
    // drifting aurora orbs + a spectrum thread drawing across
    dv.push(`<div class="${pid}o" style="position:absolute;top:${8 + (seed % 14)}%;left:${6 + (seed % 10)}%;width:${Math.round(W * 0.16)}px;height:${Math.round(W * 0.16)}px;border-radius:50%;background:radial-gradient(circle,${rgba(A, 0.3)},transparent 68%);filter:blur(6px);"></div>`);
    dv.push(`<div class="${pid}o" style="position:absolute;bottom:${10 + (seed % 12)}%;right:${8 + (seed % 8)}%;width:${Math.round(W * 0.12)}px;height:${Math.round(W * 0.12)}px;border-radius:50%;background:radial-gradient(circle,${rgba(B, 0.28)},transparent 68%);filter:blur(6px);"></div>`);
    sc.push(`tl.fromTo("#${id} .${pid}o",{opacity:0,scale:.6},{opacity:1,scale:1,duration:1,stagger:.25,ease:"sine.out"},${s0(0.2)});`);
    sc.push(`tl.to("#${id} .${pid}o",{x:${seed % 2 ? -26 : 26},y:-18,duration:${Math.max(2, L - 1)},ease:"sine.inOut"},${s0(1.0)});`);
    if (kind === "stat" || kind === "text") {
      const ly = Math.round(H * 0.82);
      sv.push(`<path class="${pid}t" d="M${Math.round(W * 0.08)} ${ly} Q ${Math.round(W * 0.3)} ${ly - 40} ${Math.round(W * 0.5)} ${ly} T ${Math.round(W * 0.92)} ${ly}" fill="none" stroke="url(#${pid}sg)" stroke-width="3" stroke-linecap="round" stroke-dasharray="1400" stroke-dashoffset="1400" opacity=".8"/>`);
      sv.push(`<defs><linearGradient id="${pid}sg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${A}"/><stop offset="1" stop-color="${B}"/></linearGradient></defs>`);
      sc.push(`tl.to("#${id} .${pid}t",{strokeDashoffset:0,duration:1.1,ease:"power2.inOut"},${s0(0.6)});`);
    }
  } else if (framePack === "mono-corporate") {
    // ledger chrome: hairlines, a scene index tag, tick marks
    const idx = String((ctx.sceneIndex || 0) + 1).padStart(2, "0");
    const cnt = String(ctx.sceneCount || 1).padStart(2, "0");
    sv.push(`<line class="${pid}r" x1="${Math.round(W * 0.06)}" y1="${Math.round(H * 0.09)}" x2="${Math.round(W * 0.94)}" y2="${Math.round(H * 0.09)}" stroke="${rgba(theme.ink, 0.35)}" stroke-width="1.5" stroke-dasharray="${W}" stroke-dashoffset="${W}"/>`);
    sc.push(`tl.to("#${id} .${pid}r",{strokeDashoffset:0,duration:.8,ease:"power2.inOut"},${s0(0.2)});`);
    dv.push(`<div class="${pid}i" style="position:absolute;top:${Math.round(H * 0.055)}px;right:${Math.round(W * 0.06)}px;opacity:0;font:700 ${Math.round(H * 0.024)}px/1 ${cssFont(theme)};letter-spacing:.3em;color:${rgba(theme.ink, 0.55)};">${idx} / ${cnt}</div>`);
    sc.push(`tl.fromTo("#${id} .${pid}i",{opacity:0,y:-8},{opacity:1,y:0,duration:.5},${s0(0.4)});`);
    const ticks = [];
    for (let i = 0; i < 12; i++) ticks.push(`<line class="${pid}t" x1="${Math.round(W * (0.06 + i * 0.024))}" y1="${Math.round(H * 0.92)}" x2="${Math.round(W * (0.06 + i * 0.024))}" y2="${Math.round(H * 0.905)}" stroke="${rgba(theme.ink, 0.4)}" stroke-width="2"/>`);
    sv.push(ticks.join(""));
    sc.push(`tl.fromTo("#${id} .${pid}t",{opacity:0,scaleY:0,transformOrigin:"50% 100%"},{opacity:1,scaleY:1,duration:.3,stagger:.04,ease:"power2.out"},${s0(0.5)});`);
    if (kind === "stat") {
      sv.push(`<rect class="${pid}x" x="${Math.round(W * 0.7)}" y="${Math.round(H * 0.7)}" width="${Math.round(W * 0.22)}" height="1.5" fill="${rgba(theme.ink, 0.3)}"/>`);
      sv.push(`<rect class="${pid}x" x="${Math.round(W * 0.7)}" y="${Math.round(H * 0.75)}" width="${Math.round(W * 0.22)}" height="1.5" fill="${rgba(theme.ink, 0.3)}"/>`);
      sv.push(`<rect class="${pid}y" x="${Math.round(W * 0.7)}" y="${Math.round(H * 0.725)}" width="${Math.round(W * 0.14)}" height="6" fill="${A}"/>`);
      sc.push(`tl.fromTo("#${id} .${pid}y",{scaleX:0,transformOrigin:"0% 50%"},{scaleX:1,duration:.9,ease:"power2.out"},${s0(0.8)});`);
    }
  } else if (framePack === "bloom-illustrated") {
    // organic blobs breathing + petal dots drifting up
    sv.push(`<ellipse class="${pid}b" cx="${Math.round(W * (seed % 2 ? 0.14 : 0.86))}" cy="${Math.round(H * 0.22)}" rx="${Math.round(W * 0.1)}" ry="${Math.round(H * 0.12)}" fill="${A}" opacity=".14"/>`);
    sv.push(`<ellipse class="${pid}b" cx="${Math.round(W * (seed % 2 ? 0.84 : 0.16))}" cy="${Math.round(H * 0.8)}" rx="${Math.round(W * 0.09)}" ry="${Math.round(H * 0.1)}" fill="${B}" opacity=".13"/>`);
    sc.push(`tl.fromTo("#${id} .${pid}b",{scale:.7,opacity:0,transformOrigin:"50% 50%"},{scale:1,opacity:1,duration:1.2,stagger:.3,ease:"sine.out"},${s0(0.2)});`);
    sc.push(`tl.to("#${id} .${pid}b",{scale:1.12,duration:${Math.max(1.8, (L - 1) / 2)},ease:"sine.inOut",yoyo:true,repeat:1},${s0(1.2)});`);
    for (let i = 0; i < 5; i++) {
      const px = Math.round(W * (0.1 + ((seed >> i) % 80) / 100)), py = Math.round(H * (0.2 + ((seed >> (i + 2)) % 65) / 100));
      sv.push(`<circle class="${pid}p" cx="${px}" cy="${py}" r="${3 + (i % 3) * 2}" fill="${[A, B, theme.accents[2] || A][i % 3]}" opacity=".5"/>`);
    }
    sc.push(`tl.to("#${id} .${pid}p",{y:-22,duration:${Math.max(1.6, L - 0.8)},stagger:.15,ease:"sine.inOut"},${s0(0.4)});`);
  }

  if (framePack === "longshot-cinema") {
    // cinema chrome: letterbox slivers + light sweep + HUD brackets per scene
    const lb = Math.round(H * 0.055);
    dv.push(`<div style="position:absolute;left:0;right:0;top:0;height:${lb}px;background:#06070A;"></div>`);
    dv.push(`<div style="position:absolute;left:0;right:0;bottom:0;height:${lb}px;background:#06070A;"></div>`);
    dv.push(`<div class="${pid}s" style="position:absolute;top:0;bottom:0;left:-30%;width:24%;transform:skewX(-14deg);background:linear-gradient(90deg,transparent,rgba(242,245,249,.06),transparent);"></div>`);
    sc.push(`tl.fromTo("#${id} .${pid}s",{xPercent:0},{xPercent:560,duration:${Math.min(3.2, Math.max(1.6, L - 0.6))},ease:"sine.inOut"},${s0(0.3)});`);
    const bl = Math.round(W * 0.022);
    sv.push(`<path class="${pid}k" d="M${bl * 2} ${lb + bl}H${bl}V${lb + bl * 2}" fill="none" stroke="${rgba("#F2F5F9", 0.4)}" stroke-width="2.5" stroke-dasharray="150" stroke-dashoffset="150"/>`);
    sv.push(`<path class="${pid}k" d="M${W - bl * 2} ${H - lb - bl}H${W - bl}V${H - lb - bl * 2}" fill="none" stroke="${rgba("#F2F5F9", 0.4)}" stroke-width="2.5" stroke-dasharray="150" stroke-dashoffset="150"/>`);
    sc.push(`tl.to("#${id} .${pid}k",{strokeDashoffset:0,duration:.6,stagger:.12,ease:"power2.out"},${s0(0.35)});`);
    if (kind === "stat") {
      const cxp = Math.round(W * 0.5), cyp = Math.round(H * 0.5), rr = Math.round(H * 0.3);
      sv.push(`<circle class="${pid}r" cx="${cxp}" cy="${cyp}" r="${rr}" fill="none" stroke="${A}" stroke-width="2" stroke-dasharray="8 14" opacity=".35"/>`);
      sc.push(`tl.to("#${id} .${pid}r",{rotation:160,transformOrigin:"${cxp}px ${cyp}px",duration:${L},ease:"none"},${T});`);
    }
    if (kind === "cta") {
      const cxp = Math.round(W * 0.5), cyp = Math.round(H * 0.44);
      const CC = [A, B, "#F2F5F9"];
      for (let i = 0; i < 8; i++) {
        const shape = i % 2 === 0
          ? `<rect class="${pid}c" x="${cxp - 6}" y="${cyp - 6}" width="12" height="12" rx="3" fill="${CC[i % 3]}"/>`
          : `<circle class="${pid}c" cx="${cxp}" cy="${cyp}" r="5.5" fill="${CC[i % 3]}"/>`;
        sv.push(shape);
      }
      const dx = [210, -240, 150, -170, 260, -120, 90, -280], dy = [-160, -120, 180, 150, 40, -200, -240, 60];
      sc.push(`var ${pid}dx=${JSON.stringify(dx)},${pid}dy=${JSON.stringify(dy)};`);
      sc.push(`tl.fromTo("#${id} .${pid}c",{x:0,y:0,scale:0,opacity:1},{x:function(i){return ${pid}dx[i];},y:function(i){return ${pid}dy[i];},rotation:function(i){return (i%2?-1:1)*(120+i*20);},scale:1,opacity:.9,duration:1.1,ease:"power3.out",stagger:.03},${s0(Math.max(0.6, L - 2.2))});`);
      sc.push(`tl.to("#${id} .${pid}c",{opacity:0,duration:.5},${r(T + Math.max(1.6, L - 0.6))});`);
    }
  } else {
    // GENERIC ornament fallback (Phase 3) — a pack with a manifest but no bespoke
    // branch above (e.g. a future manifest-only pack) still gets baseline skin
    // depth: theme-colored corner brackets on every scene, plus a drawing accent
    // underline on hook/cta. Tasteful and universal, so "add a pack = 1 folder,
    // 0 code" no longer means a bare, ornament-less pack.
    const bl = Math.round(W * 0.032);
    sv.push(`<path class="${pid}k" d="M${bl * 2} ${bl}H${bl}V${bl * 2}" fill="none" stroke="${A}" stroke-width="3" opacity=".45" stroke-dasharray="220" stroke-dashoffset="220"/>`);
    sv.push(`<path class="${pid}k" d="M${W - bl * 2} ${H - bl}H${W - bl}V${H - bl * 2}" fill="none" stroke="${B}" stroke-width="3" opacity=".45" stroke-dasharray="220" stroke-dashoffset="220"/>`);
    sc.push(`tl.to("#${id} .${pid}k",{strokeDashoffset:0,duration:.7,stagger:.15,ease:"power2.out"},${s0(0.4)});`);
    if (kind === "hook" || kind === "cta") {
      const ux = Math.round(W * 0.07), uy = Math.round(H * 0.66), uw = Math.round(W * 0.14);
      sv.push(`<line class="${pid}u" x1="${ux}" y1="${uy}" x2="${ux + uw}" y2="${uy}" stroke="${A}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${uw}" stroke-dashoffset="${uw}"/>`);
      sc.push(`tl.to("#${id} .${pid}u",{strokeDashoffset:0,duration:.6,ease:"power2.out"},${s0(0.7)});`);
    }
  }

  if (!sv.length && !dv.length) return null;
  const html =
    `<div class="kforn" style="position:absolute;inset:0;pointer-events:none;overflow:hidden;" data-layout-allow-occlusion>` +
    dv.join("") +
    `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0;width:100%;height:100%;">${sv.join("")}</svg>` +
    `</div>`;
  return { html, script: sc.join("\n"), end };
}

// Gradient/glow for cinematic packs; solid ground + an authored particle field +
// (for flat packs) a hard-edged dot or rule motif instead of blurred gradients.
function buildBackground(theme, dims, D, seed = 0, framePack = null) {
  const { ground, accent, accent2, gradients } = theme;
  const W = dims.width, H = dims.height;
  const groundCss = gradients
    ? `background:radial-gradient(120% 95% at 50% -8%, ${mix(ground, "#ffffff", theme.isDark ? 0.10 : 0.04)}, ${ground} 55%, ${mix(ground, "#000000", theme.isDark ? 0.35 : 0.06)});`
    : `background:${ground};`;
  const parts = [];
  // The canvas FX painter lives INSIDE the ground clip: CSS ground behind it is
  // the fail-safe, and no extra track index is consumed. Skinned premium packs
  // ALSO get their Three.js signature canvas layered above the 2D painter.
  const fx = buildCanvasFx(theme, dims, D, seed, framePack);
  const three = buildThreeFx(theme, dims, D, seed, framePack);
  parts.push(`<div class="clip" data-start="0" data-duration="${D}" data-track-index="0" style="${groundCss}">${fx.html}${three ? three.html : ""}</div>`);
  if (three) parts.push(three.script);

  // glow layer — ONLY for gradient packs (flat packs stay flat). Blob positions
  // vary per video (seed) so the depth reads differently each time.
  if (gradients) {
    const gx1 = 14 + (seed % 26), gy1 = 20 + ((seed >> 3) % 24);
    const gx2 = 60 + ((seed >> 6) % 28), gy2 = 56 + ((seed >> 9) % 28);
    parts.push(`<div id="kfbgGlow" class="clip" data-start="0" data-duration="${D}" data-track-index="1" data-layout-allow-occlusion style="background:radial-gradient(38% 46% at ${gx1}% ${gy1}%, ${rgba(accent, 0.20)}, transparent 70%), radial-gradient(34% 42% at ${gx2}% ${gy2}%, ${rgba(accent2, 0.14)}, transparent 72%); filter:blur(8px);"></div>`);
  }

  // ambient particle field (authored — drifts on a finite-repeat tween). The
  // seed offsets the distribution so no two videos share the same star pattern.
  const N = 12;
  const sx = seed % 100, sy = (seed >> 4) % 100;
  const circ = [];
  for (let i = 0; i < N; i++) {
    const cx = Math.round(((i * 97 + 60 + sx) % 100) / 100 * W);
    const cy = Math.round(((i * 53 + 40 + sy) % 100) / 100 * H);
    const r = 2 + (i % 4);
    const col = [accent, accent2, theme.ink][i % 3];
    const op = (0.28 + (i % 5) * 0.05).toFixed(2);
    circ.push(`<circle class="kfp${i}" cx="${cx}" cy="${cy}" r="${r}" fill="${col}" opacity="${op}"/>`);
  }
  parts.push(`<div class="clip" data-start="0" data-duration="${D}" data-track-index="2" data-layout-allow-occlusion><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0;width:100%;height:100%;">${circ.join("")}</svg></div>`);

  // grid / rule motif (masked for gradient packs; faint solid for flat packs)
  const gridCol = rgba(theme.ink, gradients ? 0.04 : 0.06);
  const mask = gradients ? "-webkit-mask-image:radial-gradient(80% 80% at 50% 45%,#000 35%,transparent 90%);mask-image:radial-gradient(80% 80% at 50% 45%,#000 35%,transparent 90%);" : "";
  parts.push(`<div class="clip" data-start="0" data-duration="${D}" data-track-index="3" data-layout-allow-occlusion style="background-image:linear-gradient(${gridCol} 1px,transparent 1px),linear-gradient(90deg,${gridCol} 1px,transparent 1px);background-size:46px 46px;${mask}"></div>`);

  const script = [];
  if (gradients) script.push(`tl.fromTo("#kfbgGlow",{xPercent:-4,yPercent:-3,scale:1},{xPercent:4,yPercent:3,scale:1.07,duration:10,ease:"sine.inOut",yoyo:true,repeat:reps(10)},0);`);
  script.push(`for(var i=0;i<${N};i++){var pd=7+(i%5);tl.to(".kfp"+i,{attr:{cy:"-="+(40+(i%4)*18)},x:(i%2?12:-12),duration:pd,ease:"sine.inOut",yoyo:true,repeat:reps(pd)},0);}`);
  script.push(fx.script);
  return { html: parts.join("\n  "), script: script.join("\n"), fxMode: fx.mode };
}

// ---- color utils -------------------------------------------------------------
function hexToRgb(hex) { const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim()); if (!m) return [124, 124, 124]; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgba(hex, a) { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; }
function mix(hex, with_, t) { const a = hexToRgb(hex), b = hexToRgb(with_); const c = a.map((v, i) => Math.round(v + (b[i] - v) * t)); return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`; }

// ---- archetypes --------------------------------------------------------------
// Each archetype is a pure function: (scene, ctx) -> { html, script } where the
// scene clip(s) live on ctx.track..ctx.track+K and animate within [T, T+L].
// They re-skin from ctx.theme; structure + motion are fixed.

// split a headline into <span class="kfw"> words, marking the emphasis word(s) as
// the single gradient/accent word.
const CHAR_ENTERS = new Set(["typewriter", "char-pop", "glitch"]);

// Split a word into RENDERABLE units for per-character animation. MUST be by GRAPHEME
// CLUSTER, not by code point: `[...w]` iterates Unicode scalars, which for Devanagari/
// Indic/Arabic tears a base consonant apart from its combining matras (base and matra
// land in separate .kfc spans, so the matra shapes alone — detached and mis-ordered).
// A grapheme cluster keeps each aksara (base + its matras/virama) whole, so the shaper
// reorders and forms conjuncts inside one span. Falls back to code points if the
// runtime lacks Intl.Segmenter (Node ≥16 and the headless-Chrome renderer both have it).
function graphemesOf(w) {
  try {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(seg.segment(w), (s) => s.segment);
  } catch { return [...w]; }
}

function headlineSpans(headline, emphasis, theme) {
  const words = String(headline || "").trim().split(/\s+/).filter(Boolean);
  const emph = String(emphasis || "").trim().toLowerCase();
  // Char-level entrances (typewriter/char-pop/glitch) animate per-character .kfc
  // spans; word-level entrances animate the .kfw word span directly. The .kfw
  // wrapper always carries emphasis (.kfacc) and the display font, so emphasis
  // and font identity work identically in both modes.
  const charMode = !!(theme && theme.textfx && CHAR_ENTERS.has(theme.textfx.enter));
  return words.map((w) => {
    const isEmph = emph && emph.split(/\s+/).includes(w.toLowerCase().replace(/[.,!?]/g, ""));
    const cls = isEmph ? "kfw kfacc" : "kfw";
    const inner = charMode
      ? graphemesOf(w).map((ch) => `<span class="kfc">${esc(ch)}</span>`).join("")
      : esc(w);
    return `<span class="${cls}">${inner}</span>`;
  }).join(" ");
}

// Text-scene layout variant (0=left+top-rule, 1=centered, 2=left+side-bar,
// 3=right-mirror). Biased by the pack's textfx.align so alignment is a pack TRAIT
// (a terminal pack reads left, a keynote pack centered) instead of a per-scene
// coin-flip. "rotate" (default) keeps the legacy seed rotation — full variety.
function textVariant(theme, seed, i) {
  const align = (theme.textfx && theme.textfx.align) || "rotate";
  if (align === "center") return 1;
  if (align === "right") return 3;
  if (align === "left") return (seed + i) % 2 === 0 ? 0 : 2;
  return (seed + i * 7) % 4;
}

// Emphasis (.kfacc) treatment for one scene, selected by the pack's
// textfx.emphasis. Returns the INNER of a scoped <style> block (#id .kfacc {...}
// + optional ::before/::after for brackets). Defaults to the legacy gradient/
// emphasisCss clip so packs with no textfx look exactly as before.
function emphasisBlock(theme, id) {
  const a = theme.accent, a2 = theme.accent2;
  const sel = `#${id} .kfacc`;
  const mode = (theme.textfx && theme.textfx.emphasis) || "gradient";
  switch (mode) {
    case "glow":
      return `${sel}{color:${a};text-shadow:0 0 .55em ${rgba(a, 0.55)},0 0 1.4em ${rgba(a, 0.3)};}`;
    case "boxed": {
      const ink = lum(a) > 150 ? "#15140F" : "#FFFFFF";
      return `${sel}{color:${ink};background:${a};padding:0 .16em;border-radius:.1em;-webkit-box-decoration-break:clone;box-decoration-break:clone;}`;
    }
    case "marker":
      return `${sel}{color:${theme.ink};background:linear-gradient(transparent 58%,${rgba(a, 0.45)} 58%);}`;
    case "underline-grow":
      return `${sel}{color:${theme.ink};border-bottom:.09em solid ${a};padding-bottom:.02em;}`;
    case "bracket":
      return `${sel}{color:${a};}${sel}::before{content:"[ ";color:${a2};}${sel}::after{content:" ]";color:${a2};}`;
    case "gradient":
    default: {
      // The pack's pinned emphasisCss is a hand-authored SIGNATURE (prism's
      // three-stop iridescence, longshot's tungsten→beam) and it wins by default.
      // But it is a frozen literal, so on the five packs that ship one it also
      // outranked a real brand colour on the single most brand-visible element in
      // the film — the highlighted headline word stayed pack-coloured while the
      // kicker, rule and counter beside it went brand. An applied brand takes the
      // word; those packs keep their signature whenever no brand is in play.
      //
      // brand.emphasisCss is a gradient VALUE, not a declaration block like the
      // pack's — it is substituted into `background:`, never emitted bare.
      const brandEmph = theme.brand && theme.brand.applied
        ? `background:${theme.brand.emphasisCss};-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:${theme.brand.emphasis[0]};`
        : null;
      return `${sel}{${brandEmph || theme.emphasisCss || `background:linear-gradient(100deg,${a},${a2});-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:${a};`}}`;
    }
  }
}

// TEXT AUTO-FIT (Phase 4) — the renderer has no build-time DOM, so headline size
// is chosen by a deterministic character metric instead of measurement: a
// display line holds ~`maxCh` characters, so a headline of `len` chars needs
// ~len/maxCh lines. Scale the font from `baseBig` so the text stays within
// ~`maxLines` lines AND the single longest word fits one line (prevents a long
// unbroken word from overflowing horizontally). Short headlines are untouched
// (scale caps at 1), so only genuinely-long copy shrinks — killing the class of
// bugs where a long headline overflowed a fixed 14ch/92px box off-frame.
// Per-script RENDER-WIDTH factor for the char-count fit below. Set once at the top of the
// (synchronous) buildComposition from the video-text language, 1 for Latin/English. CJK glyphs
// are ~2x a Latin char but few in number, so plain char count badly UNDER-shrinks them; folding
// charWidth into `len`/`longest` makes the estimate match the rendered width. Module-scoped is
// safe: buildComposition is synchronous (never yields mid-build), so no two runs interleave.
let _langCharWidth = 1;
function fitBig(text, baseBig, maxCh, maxLines = 3, minRatio = 0.52) {
  const s = String(text || "").trim();
  if (!s) return baseBig;
  const len = s.length * _langCharWidth;
  const longest = s.split(/\s+/).reduce((m, w) => Math.max(m, w.length), 1) * _langCharWidth;
  // Text area scales with font²; to fit `len` chars in maxCh×maxLines, font ~
  // sqrt(capacity/len). Also bound so the longest word fits maxCh on one line.
  const capScale = Math.sqrt((maxCh * maxLines) / len);
  const wordScale = maxCh / longest;
  const scale = Math.min(1, capScale, wordScale);
  return Math.max(Math.round(baseBig * minRatio), Math.round(baseBig * scale));
}

// LOGO KEY-MOMENT treatment — the user's own brand mark, and ONLY at the two
// moments a brand mark belongs: a small chip in the opening, a lockup at the CTA.
// Never a persistent watermark (that fights the pack's chrome). Contrast-safe by
// construction: an ALPHA logo sits on a theme.panel pill (its transparent edges
// need a backing that reads on the ground); an OPAQUE logo gets a white card so a
// dark-on-transparent mark doesn't vanish on a dark stage. Pack-styled via theme
// tokens — flat packs inherit the hard border like the screenshot frames do.
function logoMark(logo, ctx, placement) {
  if (!logo || !logo.path) return { html: "", script: "" };
  const { theme, id, dims, T } = ctx;
  const flat = !theme.gradients;
  const alpha = logo.hasAlpha === true;
  // Opening chip is small; the CTA lockup is the hero reveal.
  const maxH = placement === "cta" ? Math.round(dims.height * 0.12) : Math.round(dims.height * 0.055);
  const pad = placement === "cta" ? 14 : 8;
  // Opaque marks always get a light card (readable on any ground); alpha marks
  // ride the pack's own panel token, with a hard border on flat packs.
  const bg = alpha ? theme.panel : "#ffffff";
  const border = flat ? `2px solid ${theme.ink}` : `1px solid ${theme.line}`;
  const shadow = flat ? `box-shadow:5px 5px 0 ${theme.accent};` : `box-shadow:0 18px 44px rgba(0,0,0,0.28);`;
  const eid = `${id}logo${placement}`;
  const html = `<span id="${eid}" style="opacity:0;display:inline-flex;align-items:center;justify-content:center;padding:${pad}px ${pad + 4}px;border-radius:${flat ? 6 : 14}px;background:${bg};border:${border};${placement === "cta" ? shadow : ""}"><img src="${logo.path}" alt="brand logo" style="max-height:${maxH}px;max-width:${placement === "cta" ? Math.round(dims.width * 0.42) : Math.round(dims.width * 0.3)}px;display:block;object-fit:contain;"/></span>`;
  const script = placement === "cta"
    ? `tl.fromTo("#${eid}",{opacity:0,y:24,scale:0.9},{opacity:1,y:0,scale:1,duration:0.7,ease:"expo.out"},${r(T + 0.15)});`
    : `tl.fromTo("#${eid}",{opacity:0,scale:0.8},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.7)"},${r(T + 0.15)});`;
  return { html, script };
}

function archHook(scene, ctx) {
  const { theme, id, T, L, track, dims } = ctx;
  const big = Math.round((dims.width > dims.height ? 92 : 66) * (theme.textfx.sizeScale || 1));
  // The user's logo replaces the text kicker chip when present — a real brand
  // mark beats a text kicker as the opening brand cue.
  const logo = ctx.logo ? logoMark(ctx.logo, ctx, "hook") : null;
  const kickerHtml = logo && logo.html
    ? `<span style="display:inline-block;">${logo.html}</span>`
    : `<span id="${id}k" style="opacity:0;display:inline-flex;align-items:center;gap:10px;padding:8px 16px;border-radius:9999px;background:${theme.panel};border:1px solid ${theme.line};color:${theme.accent};font:700 15px/1 ${cssFont(theme)};letter-spacing:.2em;text-transform:uppercase;"><span style="width:8px;height:8px;border-radius:50%;background:${theme.accent};"></span>${esc(ctx.kicker || "KEYFRAME")}</span>`;
  const html = `<div id="${id}" class="clip" data-start="${T}" data-duration="${L}" data-track-index="${track}" style="opacity:0;">
  <div style="position:absolute;left:7%;right:7%;top:50%;transform:translateY(-50%);">
    ${kickerHtml}
    <h1 style="margin-top:18px;font:800 ${fitBig(scene.headline, big, 14)}px/0.99 ${cssFont(theme)};letter-spacing:-0.02em;color:${theme.ink};max-width:14ch;"><style>${emphasisBlock(theme, id)}</style>${headlineSpans(scene.headline, scene.emphasis, theme)}</h1>
    <div id="${id}u" style="height:5px;width:${Math.round(dims.width * 0.27)}px;max-width:80%;margin-top:22px;border-radius:3px;background:${theme.accent};transform:scaleX(0);transform-origin:left;"></div>
    ${scene.subtext ? `<p id="${id}s" style="opacity:0;margin-top:16px;font:500 ${Math.round(big * 0.3)}px/1.45 ${cssFont(theme)};color:${theme.dim};max-width:42ch;">${esc(scene.subtext)}</p>` : ""}
  </div>
</div>`;
  const s = [
    `tl.set("#${id}",{opacity:1},${T});`,
    // The logo mark animates itself; the text kicker keeps its own tween.
    logo && logo.html ? logo.script : `tl.fromTo("#${id}k",{opacity:0,y:14},{opacity:1,y:0,duration:0.5},${r(T + 0.25)});`,
    `textIn("${theme.textfx.enter}","#${id} .kfw","#${id} .kfc",${r(T + 0.45)},0.09);`,
    scene.subtext ? `tl.fromTo("#${id}s",{opacity:0,y:20},{opacity:1,y:0,duration:0.55},${r(T + 1.05)});` : "",
    `tl.fromTo("#${id}u",{scaleX:0,transformOrigin:"left"},{scaleX:1,duration:0.7,ease:"power2.inOut"},${r(T + 1.1)});`,
    ctx.isLast ? "" : `exitScene("#${id}",${r(T + L - 0.35)},${r(T + L)});`,
  ].filter(Boolean).join("\n");
  return { html, script: s };
}

function archStat(scene, ctx) {
  const { theme, id, T, L, track, dims } = ctx;
  // derive a number from the headline/emphasis, else a default
  const num = pickNumber(scene) || { value: 95, suffix: "%" };
  const big = dims.width > dims.height ? 128 : 92;
  const cardBg = theme.gradients ? `linear-gradient(180deg,${mix(theme.ground, "#ffffff", theme.isDark ? 0.07 : 0.02)},${theme.ground})` : mix(theme.ground, theme.isDark ? "#ffffff" : "#000000", 0.03);
  const html = `<div id="${id}" class="clip" data-start="${T}" data-duration="${L}" data-track-index="${track}" style="opacity:0;display:flex;align-items:center;justify-content:center;">
  <div class="kfstage" style="display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center;padding:0 8%;width:100%;">
    <div id="${id}n" class="kfnum" style="font:800 ${big}px/1 ${cssFont(theme)};letter-spacing:-0.04em;color:${theme.accent};">0${esc(num.suffix || "")}</div>
    <div style="font:700 ${Math.round(big * 0.26)}px/1.15 ${cssFont(theme)};color:${theme.ink};max-width:18ch;"><style>#${id} .kfacc{color:${theme.accent2};}</style>${headlineSpans(scene.headline, scene.emphasis, theme)}</div>
    ${scene.subtext ? `<div id="${id}s" style="opacity:0;font:500 ${Math.round(big * 0.18)}px/1.4 ${cssFont(theme)};color:${theme.dim};max-width:40ch;">${esc(scene.subtext)}</div>` : ""}
  </div>
</div>`;
  const fmt = num.suffix === "%" ? `function(v){return v+"%";}` : (num.prefix ? `function(v){return ${JSON.stringify(num.prefix)}+v.toLocaleString();}` : `function(v){return v.toLocaleString()+${JSON.stringify(num.suffix || "")};}`);
  const s = [
    `tl.set("#${id}",{opacity:1},${T});`,
    `pushIn("#${id} .kfstage",${T},${r(L - 0.4)},1.0,1.04);`,
    `countUp("${id}n",${num.value},${r(T + 0.3)},${r(Math.min(1.6, L - 1))},${fmt});`,
    `textIn("${theme.textfx.enter}","#${id} .kfw","#${id} .kfc",${r(T + 0.45)},0.07);`,
    scene.subtext ? `tl.fromTo("#${id}s",{opacity:0,y:16},{opacity:1,y:0,duration:0.5},${r(T + 0.9)});` : "",
    ctx.isLast ? "" : `exitScene("#${id}",${r(T + L - 0.35)},${r(T + L)});`,
  ].filter(Boolean).join("\n");
  return { html, script: s };
}

function archCta(scene, ctx) {
  const { theme, id, T, L, track, dims } = ctx;
  const big = Math.round((dims.width > dims.height ? 78 : 60) * (theme.textfx.sizeScale || 1));
  const btnBg = theme.gradients ? `linear-gradient(180deg,${theme.accent2 || theme.accent},${theme.accent})` : theme.accent;
  const btnInk = lum(theme.accent) > 150 ? "#15140F" : "#FFFFFF";
  // The logo's hero reveal — a lockup above the headline (the sign-off moment).
  const logo = ctx.logo ? logoMark(ctx.logo, ctx, "cta") : null;
  const html = `<div id="${id}" class="clip" data-start="${T}" data-duration="${L}" data-track-index="${track}" style="opacity:0;">
  ${theme.gradients ? `<div id="${id}g" class="clip" data-layout-allow-occlusion style="position:absolute;left:50%;top:46%;width:46%;height:60%;transform:translate(-50%,-50%);border-radius:50%;filter:blur(54px);background:radial-gradient(circle,${rgba(theme.accent, 0.30)},transparent 66%);"></div>` : ""}
  <div style="position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;align-items:center;gap:24px;text-align:center;padding:0 8%;">
    ${logo && logo.html ? logo.html + "\n    " : ""}<h2 style="font:800 ${fitBig(scene.headline, big, 16)}px/1.02 ${cssFont(theme)};letter-spacing:-0.02em;color:${theme.ink};max-width:16ch;"><style>${emphasisBlock(theme, id)}</style>${headlineSpans(scene.headline, scene.emphasis, theme)}</h2>
    ${scene.subtext ? `<div id="${id}b" style="opacity:0;display:inline-flex;align-items:center;gap:11px;padding:16px 36px;border-radius:9999px;background:${btnBg};color:${btnInk};font:800 ${Math.round(big * 0.34)}px/1 ${cssFont(theme)};">${esc(scene.subtext)} <span style="width:11px;height:11px;border-right:3px solid ${btnInk};border-top:3px solid ${btnInk};transform:rotate(45deg);display:inline-block;"></span></div>` : ""}
  </div>
</div>`;
  const s = [
    `tl.set("#${id}",{opacity:1},${T});`,
    theme.gradients ? `tl.fromTo("#${id}g",{opacity:0,scale:0.85},{opacity:1,scale:1,duration:0.8},${r(T + 0.05)});` : "",
    logo && logo.script ? logo.script : "",
    `textIn("${theme.textfx.enter}","#${id} .kfw","#${id} .kfc",${r(T + 0.25)},0.08);`,
    scene.subtext ? `tl.fromTo("#${id}b",{opacity:0,scale:0.85,y:16},{opacity:1,scale:1,y:0,duration:0.6,ease:"back.out(1.7)"},${r(T + 0.9)});` : "",
    scene.subtext ? `tl.to("#${id}b",{scale:1.04,duration:0.8,ease:"sine.inOut",yoyo:true,repeat:sreps(${r(L - 1)},1.6)},${r(T + 1.5)});` : "",
    // last scene: NO exit (holds to D)
    ctx.isLast ? "" : `exitScene("#${id}",${r(T + L - 0.35)},${r(T + L)});`,
  ].filter(Boolean).join("\n");
  return { html, script: s };
}

// Generic text scene (bullet/quote/caption/shape-motion) — kicker + headline +
// sub, with a side accent rule. A safe, dense default until per-kind archetypes
// (asset-grid, split-diagram, terminal) are added from the design pass.
function archText(scene, ctx) {
  const { theme, id, T, L, track, dims, variant } = ctx;
  const big = Math.round((dims.width > dims.height ? 68 : 52) * (theme.textfx.sizeScale || 1));
  const bullets = Array.isArray(scene.bullets) ? scene.bullets.filter(Boolean).slice(0, 3) : [];
  // Four layout variants so text scenes don't all look identical:
  //   v0 = left-aligned with a short top rule (the original)
  //   v1 = centered with an underline that draws in beneath the headline
  //   v2 = left-aligned with a tall accent bar running down the left edge
  //   v3 = right-aligned mirror with a right accent bar (top rule hugs the right)
  const v = variant || 0;
  const centered = v === 1;
  const right = v === 3;
  const wrap = centered
    ? `position:absolute;left:8%;right:8%;top:50%;transform:translateY(-50%);text-align:center;`
    : right
      ? `position:absolute;left:7%;right:9%;top:50%;transform:translateY(-50%);text-align:right;`
      : `position:absolute;left:${v === 2 ? "9%" : "7%"};right:7%;top:50%;transform:translateY(-50%);`;
  const topRule = v === 0
    ? `<div style="width:54px;height:5px;border-radius:3px;background:${theme.accent};margin-bottom:22px;"></div>`
    : right
      ? `<div style="width:54px;height:5px;border-radius:3px;background:${theme.accent};margin:0 0 22px auto;"></div>`
      : "";
  const sideBar = v === 2
    ? `<div data-layout-allow-occlusion style="position:absolute;left:0;top:22%;bottom:22%;width:8px;border-radius:0 6px 6px 0;background:${theme.accent};"></div>`
    : right
      ? `<div data-layout-allow-occlusion style="position:absolute;right:0;top:22%;bottom:22%;width:8px;border-radius:6px 0 0 6px;background:${theme.accent};"></div>`
      : "";
  const underline = centered ? `<div id="${id}u" style="height:5px;width:120px;margin:18px auto 0;border-radius:3px;background:${theme.accent};transform:scaleX(0);transform-origin:center;"></div>` : "";
  const subCenter = centered ? "margin-left:auto;margin-right:auto;" : right ? "margin-left:auto;" : "";
  const html = `<div id="${id}" class="clip" data-start="${T}" data-duration="${L}" data-track-index="${track}" style="opacity:0;">
  ${sideBar}
  <div style="${wrap}">
    ${topRule}
    <h2 style="font:800 ${fitBig(scene.headline, big, centered ? 22 : 20)}px/1.05 ${cssFont(theme)};letter-spacing:-0.02em;color:${theme.ink};max-width:${centered ? "22ch" : "20ch"};${right ? "margin-left:auto;" : ""}"><style>${emphasisBlock(theme, id)}</style>${headlineSpans(scene.headline, scene.emphasis, theme)}</h2>
    ${underline}
    ${scene.subtext ? `<p id="${id}s" style="opacity:0;margin-top:14px;font:500 ${Math.round(big * 0.36)}px/1.45 ${cssFont(theme)};color:${theme.dim};max-width:44ch;${subCenter}">${esc(scene.subtext)}</p>` : ""}
    ${bullets.length ? `<div id="${id}bl" style="margin-top:20px;display:flex;flex-direction:column;gap:10px;${centered ? "align-items:center;" : right ? "align-items:flex-end;" : ""}">${bullets.map((b) => `<div class="kfbl" style="opacity:0;display:flex;align-items:center;gap:12px;font:600 ${Math.round(big * 0.3)}px/1.2 ${cssFont(theme)};color:${theme.ink};"><span style="width:9px;height:9px;border-radius:2px;background:${theme.accent};"></span>${esc(b)}</div>`).join("")}</div>` : ""}
  </div>
</div>`;
  const s = [
    `tl.set("#${id}",{opacity:1},${T});`,
    `textIn("${theme.textfx.enter}","#${id} .kfw","#${id} .kfc",${r(T + 0.3)},0.07);`,
    underline ? `tl.fromTo("#${id}u",{scaleX:0,transformOrigin:"center"},{scaleX:1,duration:0.6,ease:"power2.inOut"},${r(T + 0.78)});` : "",
    scene.subtext ? `tl.fromTo("#${id}s",{opacity:0,y:18},{opacity:1,y:0,duration:0.5},${r(T + 0.85)});` : "",
    bullets.length ? `tl.fromTo("#${id} .kfbl",{opacity:0,x:${right ? 18 : -18}},{opacity:1,x:0,duration:0.45,stagger:0.12,ease:"power2.out"},${r(T + 1.0)});` : "",
    ctx.isLast ? "" : `exitScene("#${id}",${r(T + L - 0.35)},${r(T + L)});`,
  ].filter(Boolean).join("\n");
  return { html, script: s };
}

// TESTIMONIAL / QUOTE CARD (Phase 4) — a dedicated layout for `kind:"quote"`
// scenes, which used to collapse to the generic text archetype. A pull-quote on
// a panel with a big accent quotation mark, the quote animated word-by-word (in
// the pack display face via .kfw), and an attribution row with an accent chip.
function archQuoteCard(scene, ctx) {
  const { theme, id, T, L, track, dims } = ctx;
  const land = dims.width > dims.height;
  const big = Math.round((land ? 58 : 46) * (theme.textfx.sizeScale || 1));
  const quoteFit = fitBig(scene.headline, big, 26, 4);
  const html = `<div id="${id}" class="clip" data-start="${T}" data-duration="${L}" data-track-index="${track}" style="opacity:0;">
  <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:${land ? "72%" : "86%"};max-width:1180px;padding:${land ? "54px 64px" : "40px 38px"};border-radius:22px;background:${theme.panel};border:1px solid ${theme.line};border-left:6px solid ${theme.accent};">
    <div id="${id}q" style="font:900 ${Math.round(big * 2.0)}px/0.6 ${theme.displayStack};color:${theme.accent};opacity:0;height:${Math.round(big * 0.72)}px;overflow:hidden;">&ldquo;</div>
    <blockquote style="margin:0;font:600 ${quoteFit}px/1.34 ${cssFont(theme)};letter-spacing:-0.01em;color:${theme.ink};max-width:26ch;"><style>#${id} .kfacc{color:${theme.accent};}</style>${headlineSpans(scene.headline, scene.emphasis, theme)}</blockquote>
    ${scene.subtext ? `<div id="${id}a" style="opacity:0;margin-top:24px;display:flex;align-items:center;gap:13px;">
      <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,${theme.accent},${theme.accent2});flex:none;"></div>
      <div style="font:700 ${Math.round(big * 0.4)}px/1.25 ${cssFont(theme)};color:${theme.ink};">${esc(scene.subtext)}</div>
    </div>` : ""}
  </div>
</div>`;
  const s = [
    `tl.set("#${id}",{opacity:1},${T});`,
    `tl.fromTo("#${id}q",{opacity:0,scale:0.5,transformOrigin:"left top"},{opacity:0.9,scale:1,duration:0.5,ease:"back.out(2)"},${r(T + 0.25)});`,
    `textIn("${theme.textfx.enter}","#${id} .kfw","#${id} .kfc",${r(T + 0.5)},0.05);`,
    scene.subtext ? `tl.fromTo("#${id}a",{opacity:0,y:16},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + Math.min(L - 0.5, 1.1))});` : "",
    ctx.isLast ? "" : `exitScene("#${id}",${r(T + L - 0.35)},${r(T + L)});`,
  ].filter(Boolean).join("\n");
  return { html, script: s };
}

// PALETTE AFFINITY (Phase 6) — order an asset pool so the most ON-BRAND images
// (dominant color closest to a pack accent/extra) come first; they then earn the
// prominent foreground placements in Pass 1, while off-palette stock drops to
// scrimmed B-roll or is left over. Assets without a known color (SVG vectors,
// recolored anyway) sort as neutral, preserving their order. dominantColor is
// attached by validateImage (asset_sources/util.imageDominantColor).
function colorDist(a, b) {
  const pa = /^#?([0-9a-f]{6})$/i.exec(String(a || "").trim());
  const pb = /^#?([0-9a-f]{6})$/i.exec(String(b || "").trim());
  if (!pa || !pb) return Infinity;
  const na = parseInt(pa[1], 16), nb = parseInt(pb[1], 16);
  const dr = ((na >> 16) & 255) - ((nb >> 16) & 255), dg = ((na >> 8) & 255) - ((nb >> 8) & 255), db = (na & 255) - (nb & 255);
  return Math.sqrt(dr * dr + dg * dg + db * db);
}
function orderByPaletteAffinity(pool, theme) {
  const brand = [theme.accent, theme.accent2, ...(theme.extras || [])].filter(Boolean);
  if (!brand.length) return pool;
  const aff = (a) => (a && a.dominantColor) ? Math.min(...brand.map((c) => colorDist(a.dominantColor, c))) : 200;
  return pool.map((a, i) => ({ a, i, d: aff(a) })).sort((x, y) => x.d - y.d || x.i - y.i).map((o) => o.a);
}

// PROP FILL (fuller scenes) — a deterministic, on-brand, animated "product card"
// vector placed in the EMPTY half of a hook/text scene that has no fetched
// visual, so no scene reads as half-empty. A stylized app/dashboard card (header,
// content lines, a mini bar chart that grows, task rows) in the pack's own
// colors — reads as the product, adds a vector + motion, and never depends on
// stock. `side` = which half is empty ("right" for left-aligned text, "left" for
// right-aligned). Semi-transparent so it supports, not competes with, the copy.
function buildPropFill(ctx, side) {
  const { theme, id, dims, T, L } = ctx;
  const W = dims.width, H = dims.height, land = W > H;
  const pw = Math.round(W * (land ? 0.30 : 0.5)), ph = Math.round(H * (land ? 0.44 : 0.3));
  const px = side === "left" ? Math.round(W * 0.07) : Math.round(W - pw - W * 0.07);
  const py = Math.round((H - ph) / 2);
  const A = theme.accent, B = theme.accent2 || theme.accent, ink = theme.ink, line = theme.line;
  const card = theme.isDark ? "rgba(255,255,255,0.045)" : "rgba(20,18,12,0.035)";
  const pid = `${id}pf`;
  const hh = Math.round(ph * 0.15);      // header height
  const pad = Math.round(pw * 0.07);
  const chartY = Math.round(ph * 0.60), chartH = Math.round(ph * 0.28), bw = Math.round((pw - pad * 2) / 9);
  const hts = [0.42, 0.66, 0.5, 0.82, 1.0, 0.72];
  const bars = hts.map((f, i) =>
    `<rect class="kfbar" x="${pad + i * (bw + Math.round(bw * 0.5))}" y="${chartY + chartH - Math.round(chartH * f)}" width="${bw}" height="${Math.round(chartH * f)}" rx="3" fill="${i === 3 ? A : rgba(B, 0.55)}"/>`).join("");
  const rows = [0, 1].map((i) => {
    const ry = Math.round(ph * 0.28) + i * Math.round(ph * 0.12);
    return `<rect x="${pad}" y="${ry}" width="${Math.round(ph * 0.055)}" height="${Math.round(ph * 0.055)}" rx="3" fill="none" stroke="${A}" stroke-width="2"/>` +
      `<rect x="${pad + Math.round(ph * 0.09)}" y="${ry + Math.round(ph * 0.012)}" width="${Math.round(pw * (i ? 0.42 : 0.55))}" height="${Math.round(ph * 0.03)}" rx="3" fill="${rgba(ink, 0.32)}"/>`;
  }).join("");
  const svg =
    `<svg viewBox="0 0 ${pw} ${ph}" width="100%" height="100%" style="overflow:visible;">` +
    `<rect x="0" y="0" width="${pw}" height="${ph}" rx="${Math.round(pw * 0.05)}" fill="${card}" stroke="${line}" stroke-width="1.5"/>` +
    `<rect x="0" y="0" width="${pw}" height="${hh}" rx="${Math.round(pw * 0.05)}" fill="${rgba(A, 0.10)}"/>` +
    `<rect x="0" y="${Math.round(hh * 0.5)}" width="${pw}" height="${Math.round(hh * 0.5)}" fill="${rgba(A, 0.10)}"/>` +
    `<circle cx="${pad + Math.round(ph * 0.03)}" cy="${Math.round(hh / 2)}" r="${Math.round(ph * 0.022)}" fill="${A}"/>` +
    `<rect x="${pad + Math.round(ph * 0.07)}" y="${Math.round(hh / 2 - ph * 0.014)}" width="${Math.round(pw * 0.4)}" height="${Math.round(ph * 0.028)}" rx="3" fill="${rgba(ink, 0.4)}"/>` +
    rows + bars +
    `</svg>`;
  const html = `<div id="${pid}" style="position:absolute;left:${px}px;top:${py}px;width:${pw}px;height:${ph}px;opacity:0;pointer-events:none;" data-layout-allow-occlusion>${svg}</div>`;
  const s = [
    `tl.fromTo("#${pid}",{opacity:0,y:30,rotationZ:${side === "left" ? 3 : -3}},{opacity:1,y:0,rotationZ:0,duration:0.75,ease:"power3.out"},${r(T + 0.5)});`,
    `tl.fromTo("#${pid} .kfbar",{scaleY:0,transformOrigin:"50% 100%"},{scaleY:1,duration:0.55,stagger:0.07,ease:"power2.out"},${r(T + 0.95)});`,
    `tl.to("#${pid}",{y:"-=12",duration:${r(Math.max(2, L - 1))},ease:"sine.inOut",yoyo:true,repeat:1},${r(T + 0.9)});`,
    ctx.isLast ? "" : `tl.to("#${pid}",{opacity:0,duration:0.3,ease:"power2.in"},${r(T + L - 0.35)});`,
  ].filter(Boolean).join("\n");
  return { html, script: s };
}

// Partition the fetched assets into the kinds the kit places differently:
// website screenshots (device-framed hero), vectors/illustrations (drawn-in side
// art or grids), and photos (scrimmed full-bleed). Paths are relative to jobDir.
function partitionAssets(assets) {
  const screenshots = [], vectors = [], photos = [], videos = [];
  for (const a of (assets || [])) {
    if (!a || !a.path) continue;
    // The user's logo is a ROLE, not product imagery: it never enters the generic
    // pools (no logo as a montage tile or scrim background). It gets its own
    // key-moment treatment — opening brand chip + CTA lockup.
    if (isLogo(a)) continue;
    // Videos go in their own pool — the img-based archetypes would render an mp4
    // as a broken <img>. They're placed as full-bleed <video> backgrounds instead.
    if (a.type === "video" || /\.(mp4|webm|mov)($|\?)/i.test(a.path)) { videos.push(a); continue; }
    // User uploads route by their EXPLICIT kindHint (the alt-sniffing below is for
    // fetched assets whose alt is a search query; an upload's alt is our sentence).
    if (a.source === "upload") { (a.kindHint === "photo" ? photos : screenshots).push(a); continue; }
    // Harvested brand assets route by their explicit kindHint (same as uploads) — a
    // logo/icon/illustration SVG is a vector, a hero/product a photo, never mis-sniffed.
    if (a.source === WEBSITE_BRAND_SOURCE || a.source === WEBSITE_ASSET_SOURCE) {
      (a.kindHint === "vector" ? vectors : a.kindHint === "screenshot" ? screenshots : photos).push(a); continue;
    }
    const s = `${a.source || ""} ${a.style || ""} ${a.alt || ""}`.toLowerCase();
    if (a.source === "website" || /screenshot|webpage|web page|landing|\bsite\b/.test(s)) screenshots.push(a);
    else if (/\.svg($|\?)/i.test(a.path) || /vector|illustration|icon|line.?art|graphic/.test(s)) vectors.push(a);
    else photos.push(a);
  }
  return { screenshots, vectors, photos, videos };
}

// SCREENSHOT-HERO — the user's real website screenshot in a per-pack device frame
// (rounded glass chrome for cinematic packs; a hard-bordered card with an offset
// solid shadow for flat packs), with side copy and a slow Ken-Burns scroll inside
// the frame (the reactive beat). Landscape = side-by-side; portrait = stacked.
function archScreenshotHero(scene, ctx) {
  const { theme, id, T, L, track, dims, asset } = ctx;
  const land = dims.width > dims.height;
  const flat = !theme.gradients;
  // PHONE MOCKUP — a portrait (mobile) screenshot renders in a device body (rounded
  // bezel + notch, no browser chrome) instead of a browser frame. Chosen by the
  // Visual Layout Director (asset.container==="phone") or, on non-VLD paths, a
  // portrait aspect. Same ids/entrance/Ken-Burns, so the scene script + weaving are
  // unchanged.
  if (asset && (asset.container === "phone" || (Number(asset.ratio) > 0 && Number(asset.ratio) < 0.85))) {
    return archPhoneHero(scene, ctx);
  }
  const chrome = flat
    ? `background:${theme.ground};border:3px solid ${theme.ink};border-radius:14px;box-shadow:10px 10px 0 ${theme.accent};`
    : `background:${mix(theme.ground, "#ffffff", 0.06)};border:1px solid ${theme.line};border-radius:16px;box-shadow:0 40px 90px rgba(0,0,0,0.5);`;
  const barBg = flat ? mix(theme.ground, theme.ink, 0.06) : rgba("#ffffff", 0.05);
  const big = land ? 56 : 46;
  const dots = ["#FF5F57", "#FEBC2E", "#28C840"].map((c) => `<span style="width:11px;height:11px;border-radius:50%;background:${flat ? theme.ink : c};display:inline-block;"></span>`).join("");
  // Visual Layout Director may enlarge the hero (readability): honor ctx.heroScale
  // as the landscape width fraction; portrait stays full-width. Null → kit default.
  const frameW = (ctx.heroScale && land) ? `${Math.round(ctx.heroScale * 100)}%` : (land ? "52%" : "84%");
  // The OUTER wrapper owns positioning/centering; the INNER #fr owns the GSAP
  // entrance (opacity/yPercent/rotationX). They MUST be separate elements: GSAP
  // rewrites the whole `transform` of whatever it animates, so animating yPercent
  // on an element that also carries `translateY(-50%)` clobbers the -50% and drops
  // the frame into the lower half (bottom gets clipped). Keep centering off #fr.
  // Center with a FULL-HEIGHT flex box (top:0;bottom:0;justify-content:center)
  // instead of translateY(-50%): flex centering is layout-based, so the GSAP
  // entrance transform on the inner #fr can't clobber it and drop the frame low
  // (the old bug where the screenshot's bottom clipped off the canvas).
  // Screenshot band height: landscape fills the mid-band; portrait is a fixed
  // top band so the copy stacks directly beneath it (a true vertical stack, no
  // dead space up top and no overlap — mirrors archPhoneHero's portrait flow).
  const bandH = land ? Math.round(dims.height * 0.52) : Math.round(dims.height * 0.38);
  // Portrait hero side inset from the shared source of truth (responsive.heroBox: a 0.90
  // width fraction → a 5% inset). Replaces the hardcoded 6% so the portrait hero width is
  // governed in ONE place — this wires the previously-unused heroBox export.
  const pIn = land ? 6 : Math.round((1 - heroBox(dims.width, dims.height).wFrac) / 2 * 100);
  const frameOuter = land
    ? `position:absolute;left:5%;top:0;bottom:0;width:${frameW};display:flex;flex-direction:column;justify-content:center;`
    : `position:absolute;left:${pIn}%;right:${pIn}%;top:9%;display:flex;flex-direction:column;align-items:center;`;
  const copyWrap = land
    ? `position:absolute;right:5%;top:0;bottom:0;width:34%;display:flex;flex-direction:column;justify-content:center;`
    : `position:absolute;left:${pIn}%;right:${pIn}%;top:calc(9% + ${bandH + 42 + 22}px);bottom:8%;display:flex;flex-direction:column;justify-content:flex-start;text-align:center;`;
  const html = `<div id="${id}" class="clip" data-start="${T}" data-duration="${L}" data-track-index="${track}" style="opacity:0;">
  <div style="${frameOuter}">
  <div id="${id}fr" class="kfstage" style="${chrome}overflow:hidden;width:100%;">
    <div style="height:42px;display:flex;align-items:center;gap:9px;padding:0 16px;background:${barBg};border-bottom:1px solid ${theme.line};">${dots}<span style="margin-left:12px;flex:1;max-width:340px;height:22px;border-radius:9999px;background:${rgba(theme.ink, 0.08)};"></span></div>
    <div style="position:relative;width:100%;height:${bandH}px;overflow:hidden;"><img id="${id}img" src="${esc(asset.path)}" alt="${esc(asset.alt || "screenshot")}" style="position:absolute;top:0;left:0;width:100%;height:auto;min-height:100%;object-fit:cover;object-position:${asset.cropFocus || "top center"};"></div>
  </div>
  </div>
  <div style="${copyWrap}">
    <span id="${id}k" style="opacity:0;display:inline-flex;align-items:center;gap:9px;padding:7px 15px;border-radius:9999px;background:${theme.panel};border:1px solid ${theme.line};color:${theme.accent};font:700 13px/1 ${cssFont(theme)};letter-spacing:.2em;text-transform:uppercase;"><span style="width:7px;height:7px;border-radius:50%;background:${theme.accent};"></span>${esc(ctx.kicker || ctx.S.live)}</span>
    <h2 style="margin-top:14px;font:800 ${fitBig(scene.headline, big, 20)}px/1.05 ${cssFont(theme)};letter-spacing:-0.02em;color:${theme.ink};"><style>${emphasisBlock(theme, id)}</style>${headlineSpans(scene.headline, scene.emphasis, theme)}</h2>
    ${scene.subtext ? `<p id="${id}s" style="opacity:0;margin-top:13px;font:500 ${Math.round(big * 0.42)}px/1.45 ${cssFont(theme)};color:${theme.dim};">${esc(scene.subtext)}</p>` : ""}
  </div>
</div>`;
  const s = [
    `tl.set("#${id}",{opacity:1},${T});`,
    `tl.fromTo("#${id}fr",{opacity:0,yPercent:6,rotationX:12,transformPerspective:1200,transformOrigin:"50% 100%"},{opacity:1,yPercent:0,rotationX:0,duration:0.85,ease:"expo.out"},${r(T + 0.1)});`,
    `tl.fromTo("#${id}img",{y:0},{y:function(i,el){var h=el.scrollHeight-el.clientHeight;return -(h>0?Math.min(h,el.clientHeight*0.5):0);},duration:${r(L - 0.6)},ease:"sine.inOut"},${r(T + 0.4)});`,
    `tl.fromTo("#${id}k",{opacity:0,y:12},{opacity:1,y:0,duration:0.5},${r(T + 0.5)});`,
    `textIn("${theme.textfx.enter}","#${id} .kfw","#${id} .kfc",${r(T + 0.65)},0.08);`,
    scene.subtext ? `tl.fromTo("#${id}s",{opacity:0,y:14},{opacity:1,y:0,duration:0.5},${r(T + 1.1)});` : "",
    ctx.isLast ? "" : `exitScene("#${id}",${r(T + L - 0.35)},${r(T + L)});`,
  ].filter(Boolean).join("\n");
  return { html, script: s };
}

// PHONE-MOCKUP hero — a portrait mobile screenshot in a device body (rounded bezel +
// notch, no browser chrome). Reuses archScreenshotHero's ids (#fr entrance, #img
// Ken-Burns, #k/#s copy) so the scene script + weaving need no changes. Landscape
// canvas: phone left, copy right (the phone is narrow → copy gets the room). Portrait
// canvas: phone up top, copy below. The notch is centered with margin (no baked
// transform on a static node — stays lint-clean).
function archPhoneHero(scene, ctx) {
  const { theme, id, T, L, track, dims, asset } = ctx;
  const land = dims.width > dims.height;
  const flat = !theme.gradients;
  const big = land ? 54 : 44;
  const phoneH = Math.round(dims.height * (land ? 0.82 : 0.62));
  const phoneW = Math.round(phoneH * 0.475);
  const rad = Math.round(phoneW * 0.15);
  const bezel = flat ? theme.ink : "#0a0b12";
  const bezelBorder = flat ? `3px solid ${theme.ink}` : `2px solid ${rgba("#ffffff", 0.10)}`;
  const bodyShadow = flat ? `10px 10px 0 ${theme.accent}` : `0 36px 80px rgba(0,0,0,0.55)`;
  const pad = Math.round(phoneW * 0.035);
  const notchW = Math.round(phoneW * 0.34), notchH = Math.round(phoneW * 0.075);
  const frameOuter = land
    ? `position:absolute;left:8%;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;`
    : `position:absolute;left:0;right:0;top:8%;bottom:auto;display:flex;flex-direction:column;align-items:center;`;
  const copyWrap = land
    ? `position:absolute;right:6%;top:0;bottom:0;width:46%;display:flex;flex-direction:column;justify-content:center;`
    : `position:absolute;left:8%;right:8%;bottom:9%;display:flex;flex-direction:column;text-align:center;`;
  const html = `<div id="${id}" class="clip" data-start="${T}" data-duration="${L}" data-track-index="${track}" style="opacity:0;">
  <div style="${frameOuter}">
  <div id="${id}fr" class="kfstage" style="position:relative;width:${phoneW}px;height:${phoneH}px;border-radius:${rad}px;background:${bezel};border:${bezelBorder};box-shadow:${bodyShadow};padding:${pad}px;">
    <div style="position:relative;width:100%;height:100%;border-radius:${Math.round(rad * 0.72)}px;overflow:hidden;background:${theme.ground};"><img id="${id}img" src="${esc(asset.path)}" alt="${esc(asset.alt || "screenshot")}" style="position:absolute;top:0;left:0;width:100%;height:auto;min-height:100%;object-fit:cover;object-position:${asset.cropFocus || "top center"};"></div>
    <div style="position:absolute;top:${Math.round(phoneW * 0.05)}px;left:50%;margin-left:-${Math.round(notchW / 2)}px;width:${notchW}px;height:${notchH}px;border-radius:9999px;background:#04050a;"></div>
  </div>
  </div>
  <div style="${copyWrap}">
    <span id="${id}k" style="opacity:0;display:inline-flex;align-items:center;gap:9px;padding:7px 15px;border-radius:9999px;background:${theme.panel};border:1px solid ${theme.line};color:${theme.accent};font:700 13px/1 ${cssFont(theme)};letter-spacing:.2em;text-transform:uppercase;"><span style="width:7px;height:7px;border-radius:50%;background:${theme.accent};"></span>${esc(ctx.kicker || ctx.S.live)}</span>
    <h2 style="margin-top:14px;font:800 ${fitBig(scene.headline, big, 20)}px/1.05 ${cssFont(theme)};letter-spacing:-0.02em;color:${theme.ink};"><style>${emphasisBlock(theme, id)}</style>${headlineSpans(scene.headline, scene.emphasis, theme)}</h2>
    ${scene.subtext ? `<p id="${id}s" style="opacity:0;margin-top:13px;font:500 ${Math.round(big * 0.42)}px/1.45 ${cssFont(theme)};color:${theme.dim};">${esc(scene.subtext)}</p>` : ""}
  </div>
</div>`;
  const s = [
    `tl.set("#${id}",{opacity:1},${T});`,
    `tl.fromTo("#${id}fr",{opacity:0,yPercent:8,rotationX:10,transformPerspective:1200,transformOrigin:"50% 100%"},{opacity:1,yPercent:0,rotationX:0,duration:0.85,ease:"expo.out"},${r(T + 0.1)});`,
    `tl.fromTo("#${id}img",{y:0},{y:function(i,el){var h=el.scrollHeight-el.clientHeight;return -(h>0?Math.min(h,el.clientHeight*0.5):0);},duration:${r(L - 0.6)},ease:"sine.inOut"},${r(T + 0.4)});`,
    `tl.fromTo("#${id}k",{opacity:0,y:12},{opacity:1,y:0,duration:0.5},${r(T + 0.5)});`,
    `textIn("${theme.textfx.enter}","#${id} .kfw","#${id} .kfc",${r(T + 0.65)},0.08);`,
    scene.subtext ? `tl.fromTo("#${id}s",{opacity:0,y:14},{opacity:1,y:0,duration:0.5},${r(T + 1.1)});` : "",
    ctx.isLast ? "" : `exitScene("#${id}",${r(T + L - 0.35)},${r(T + L)});`,
  ].filter(Boolean).join("\n");
  return { html, script: s };
}

// SPLIT-VECTOR — headline on one side, a vector/illustration on the other that
// floats/draws in. The reactive beat is the art's entrance + a gentle float.
// Pack-aware photo grade (filter FUNCTIONS, no `filter:` wrapper). Flat/editorial
// packs want crisp, punchy stock; cinematic (gradient) packs want a slightly
// richer, moodier grade. Applied to EVERY raw stock photo so a set of unrelated
// images reads as ONE graded set in the template's key. Vectors/screenshots skip.
function photoToneFns(theme) {
  return theme.gradients
    ? "saturate(0.92) contrast(1.06) brightness(0.98) "
    : "saturate(0.86) contrast(1.1) ";
}

function archSplitVector(scene, ctx) {
  const { theme, id, T, L, track, dims, asset } = ctx;
  const land = dims.width > dims.height;
  const big = land ? 64 : 50;
  const dir = land ? "row" : "column";
  // Photos get the same gentle palette pull as montage tiles (a raw stock photo
  // beside pack-colored copy reads off-brand); vectors stay untouched. One
  // combined filter declaration — two `filter:`s would override each other.
  const artMeta = `${asset.source || ""} ${asset.style || ""} ${asset.alt || ""}`.toLowerCase();
  const artIsVec = /\.svg($|\?)/i.test(asset.path) || /vector|illustration|icon|line.?art|graphic/.test(artMeta);
  const artTone = artIsVec ? "" : photoToneFns(theme);
  const artGlow = (artTone || theme.gradients)
    ? `filter:${artTone}${theme.gradients ? `drop-shadow(0 18px 40px ${rgba(theme.accent, 0.35)})` : ""};`
    : "";
  const html = `<div id="${id}" class="clip" data-start="${T}" data-duration="${L}" data-track-index="${track}" style="opacity:0;display:flex;align-items:center;justify-content:center;">
  <div class="kfstage" style="display:flex;flex-direction:${dir};align-items:center;gap:${land ? 56 : 28}px;width:100%;padding:0 7%;">
    <div style="flex:1;">
      <div style="width:54px;height:5px;border-radius:3px;background:${theme.accent};margin-bottom:20px;"></div>
      <h2 style="font:800 ${fitBig(scene.headline, big, 16)}px/1.05 ${cssFont(theme)};letter-spacing:-0.02em;color:${theme.ink};"><style>${emphasisBlock(theme, id)}</style>${headlineSpans(scene.headline, scene.emphasis, theme)}</h2>
      ${scene.subtext ? `<p id="${id}s" style="opacity:0;margin-top:14px;font:500 ${Math.round(big * 0.4)}px/1.45 ${cssFont(theme)};color:${theme.dim};">${esc(scene.subtext)}</p>` : ""}
    </div>
    <div style="flex:1;display:flex;align-items:center;justify-content:center;"><img id="${id}art" src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="width:100%;max-width:${land ? "44%" : "60%"};height:auto;max-height:${Math.round(dims.height * (land ? 0.6 : 0.34))}px;object-fit:contain;${artGlow}"></div>
  </div>
</div>`;
  const s = [
    `tl.set("#${id}",{opacity:1},${T});`,
    `tl.from("#${id} .h1, #${id} h2",{x:-36,opacity:0,duration:0.6,ease:"expo.out"},${r(T + 0.15)});`,
    `textIn("${theme.textfx.enter}","#${id} .kfw","#${id} .kfc",${r(T + 0.25)},0.07);`,
    scene.subtext ? `tl.fromTo("#${id}s",{opacity:0,y:16},{opacity:1,y:0,duration:0.5},${r(T + 0.8)});` : "",
    `tl.fromTo("#${id}art",{opacity:0,scale:0.82,y:24},{opacity:1,scale:1,y:0,duration:0.7,ease:"back.out(1.5)"},${r(T + 0.4)});`,
    `tl.to("#${id}art",{y:"-=14",duration:1.6,ease:"sine.inOut",yoyo:true,repeat:sreps(${r(L - 0.8)},1.6)},${r(T + 1.1)});`,
    ctx.isLast ? "" : `exitScene("#${id}",${r(T + L - 0.35)},${r(T + L)});`,
  ].filter(Boolean).join("\n");
  return { html, script: s };
}

// ASSET MONTAGE — a tiled grid of 3–6 real assets (extra screenshots, curated
// vectors, photos) that pop in on a stagger under a headline. This is the
// work-horse that surfaces the bulk of the fetched pool the single-feature
// archetypes (hero / split) leave unused.
function archAssetMontage(scene, ctx) {
  const { theme, id, T, L, track, dims } = ctx;
  const items = (ctx.assets || []).slice(0, 6);
  const n = items.length || 1;
  const land = dims.width > dims.height;
  // Column count is aspect-aware: a 3-wide grid crams tiles in a narrow portrait
  // frame, so cap at 2 columns (1 for ≤2 tiles) off the landscape path.
  const cols = land ? (n <= 1 ? 1 : n <= 4 ? 2 : 3) : (n <= 2 ? 1 : 2);
  const big = land ? 54 : 44;
  const flat = !theme.gradients;
  const tileChrome = flat
    ? `border:3px solid ${theme.ink};box-shadow:6px 6px 0 ${theme.accent};`
    : `border:1px solid ${theme.line};box-shadow:0 22px 50px rgba(0,0,0,0.45);`;
  const tileH = Math.round(dims.height * (land ? 0.2 : 0.15));
  const tiles = items.map((a) => {
    const meta = `${a.source || ""} ${a.style || ""} ${a.alt || ""}`.toLowerCase();
    const isVec = /\.svg($|\?)/i.test(a.path) || /vector|illustration|icon|line.?art|graphic/.test(meta);
    const fit = isVec ? "contain" : "cover";
    const pad = isVec ? `background:${rgba(theme.ink, theme.isDark ? 0.06 : 0.04)};padding:14px;` : "";
    // COLOR HARMONY — raw stock photos arrive in arbitrary palettes (a saturated
    // red product shot shatters a navy/cyan frame). Photos get pulled toward the
    // pack: gentle desaturation on the img + a ground-tinted wash over the tile,
    // so every tile reads as one graded set. Vectors/screenshots skip it (vectors
    // are already pack-recolored; a product screenshot must stay true).
    const isShot = a.source === "website" || /screenshot|webpage|web page|landing|\bsite\b/.test(meta);
    const tone = (isVec || isShot) ? "" : `filter:${photoToneFns(theme)};`;
    const wash = (isVec || isShot) ? "" : `<span style="position:absolute;inset:0;background:linear-gradient(180deg,${rgba(theme.ground, 0.12)},${rgba(theme.ground, 0.32)});pointer-events:none;"></span>`;
    return `<div class="kftile" style="opacity:0;position:relative;overflow:hidden;border-radius:${flat ? 8 : 14}px;${tileChrome}${pad}height:${tileH}px;display:flex;align-items:center;justify-content:center;"><img src="${esc(a.path)}" alt="${esc(a.alt || "")}" style="width:100%;height:100%;object-fit:${fit};object-position:${a.cropFocus || "center"};display:block;${tone}">${wash}</div>`;
  }).join("");
  const html = `<div id="${id}" class="clip" data-start="${T}" data-duration="${L}" data-track-index="${track}" style="opacity:0;">
  <div style="position:absolute;left:6%;right:6%;top:50%;transform:translateY(-50%);">
    <div style="width:54px;height:5px;border-radius:3px;background:${theme.accent};margin-bottom:18px;"></div>
    <h2 style="font:800 ${fitBig(scene.headline, big, 22)}px/1.05 ${cssFont(theme)};letter-spacing:-0.02em;color:${theme.ink};max-width:22ch;"><style>${emphasisBlock(theme, id)}</style>${headlineSpans(scene.headline, scene.emphasis, theme)}</h2>
    <div id="${id}g" style="margin-top:22px;display:grid;grid-template-columns:repeat(${cols},1fr);gap:${land ? 18 : 12}px;">${tiles}</div>
  </div>
</div>`;
  const s = [
    `tl.set("#${id}",{opacity:1},${T});`,
    `textIn("${theme.textfx.enter}","#${id} .kfw","#${id} .kfc",${r(T + 0.25)},0.06);`,
    `tl.fromTo("#${id} .kftile",{opacity:0,scale:0.82,y:26},{opacity:1,scale:1,y:0,duration:0.55,stagger:0.1,ease:"back.out(1.5)"},${r(T + 0.55)});`,
    `tl.to("#${id} .kftile",{y:"-=8",duration:1.8,ease:"sine.inOut",yoyo:true,stagger:0.12,repeat:sreps(${r(L - 1.2)},1.8)},${r(T + 1.5)});`,
    ctx.isLast ? "" : `exitScene("#${id}",${r(T + L - 0.35)},${r(T + L)});`,
  ].filter(Boolean).join("\n");
  return { html, script: s };
}

// SCRIM B-ROLL — a leftover photo as a full-bleed, darkened, slowly-scaling
// background behind a scene that carries no foreground asset. The scrim gradient
// guarantees text contrast; data-layout-allow-occlusion keeps occlusion lint
// calm (the scene's text clip is meant to sit over it). Cinematic packs only.
function scrimBg(asset, ctx) {
  const { theme, id, T, L } = ctx;
  if (!asset) return null;
  const g = theme.ground;
  const scrim = `linear-gradient(180deg, ${rgba(g, 0.55)} 0%, ${rgba(g, 0.74)} 55%, ${rgba(g, 0.9)} 100%)`;
  const html = `<div id="${id}bg" class="clip" data-start="${T}" data-duration="${L}" data-track-index="${ctx.bgTrack}" data-layout-allow-occlusion style="opacity:0;overflow:hidden;"><img id="${id}bgi" src="${esc(asset.path)}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;"><div style="position:absolute;inset:0;background:${scrim};"></div></div>`;
  const s = [
    `tl.fromTo("#${id}bg",{opacity:0},{opacity:1,duration:0.6},${r(T)});`,
    `tl.fromTo("#${id}bgi",{scale:1.09},{scale:1.0,duration:${r(L)},ease:"none"},${r(T)});`,
    ctx.isLast ? "" : `tl.to("#${id}bg",{opacity:0,duration:0.3},${r(T + L - 0.3)});`,
    // Boundary hard-kill: non-linear seeking can land after the fade, so pin the
    // bg hidden at the next scene's start (matches exitScene's fade+set pattern).
    ctx.isLast ? "" : `tl.set("#${id}bg",{opacity:0},${r(T + L)});`,
  ].join("\n");
  return { html, script: s };
}

// VIDEO B-ROLL — a stock clip as a full-bleed, scrimmed background behind a text
// scene. HyperFrames seeks <video> deterministically per captured frame (stock
// clips are re-encoded keyframe-dense upstream), so the clip plays through the
// scene; the ground-colored scrim guarantees text contrast on any pack.
function videoBg(asset, ctx) {
  const { theme, id, T, L } = ctx;
  if (!asset) return null;
  const g = theme.ground;
  const scrim = `linear-gradient(180deg, ${rgba(g, 0.5)} 0%, ${rgba(g, 0.72)} 55%, ${rgba(g, 0.9)} 100%)`;
  const html = `<div id="${id}bg" class="clip" data-start="${T}" data-duration="${L}" data-track-index="${ctx.bgTrack}" data-layout-allow-occlusion style="opacity:0;overflow:hidden;"><video id="${id}vid" src="${esc(asset.path)}" muted playsinline preload="auto" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;"></video><div style="position:absolute;inset:0;background:${scrim};"></div></div>`;
  const s = [
    `tl.fromTo("#${id}bg",{opacity:0},{opacity:1,duration:0.6},${r(T)});`,
    // Drive the clip's playhead off the (paused, frame-seeked) timeline so it plays.
    `tl.to({},{duration:${r(L)},ease:"none",onUpdate:function(){var v=document.getElementById("${id}vid");if(v&&isFinite(v.duration)&&v.duration>0){var lt=tl.time()-${r(T)};v.currentTime=Math.max(0,Math.min(v.duration,lt));}}},${r(T)});`,
    ctx.isLast ? "" : `tl.to("#${id}bg",{opacity:0,duration:0.3},${r(T + L - 0.3)});`,
    // Boundary hard-kill (see scrimBg): pin the bg hidden at the next scene start.
    ctx.isLast ? "" : `tl.set("#${id}bg",{opacity:0},${r(T + L)});`,
  ].join("\n");
  return { html, script: s };
}

// Pull up to `max` assets for a montage, round-robin across kinds for variety.
function takeMontage(pools, max) {
  const out = [];
  const order = [pools.screenshots, pools.vectors, pools.photos];
  let progressed = true;
  while (out.length < max && progressed) {
    progressed = false;
    for (const arr of order) {
      if (out.length < max && arr.length) { out.push(arr.shift()); progressed = true; }
    }
  }
  return out;
}

function cssFont(theme) { return theme.fontStack; }
function r(n) { return Math.round(n * 100) / 100; }

// INTENT AFFINITY (Phase 4) — how strongly a scene "wants" a given asset role,
// scored from its storyboard signals (kind + purpose + visualDirection + copy).
// Drives WHICH scene the screenshot / split-art lands on, so the product view
// goes to the demo/proof scene rather than merely the first content scene.
function assetAffinity(scene, role) {
  const txt = `${scene.headline || ""} ${scene.subtext || ""} ${scene.visualDirection || ""} ${scene.purpose || ""} ${scene.emphasis || ""}`.toLowerCase();
  const k = String(scene.kind || "").toLowerCase();
  const has = (re) => re.test(txt);
  let s = 0;
  if (role === "screenshot") {
    if (has(/\b(demo|preview|dashboard|screen|interface|ui|ux|app|product|in action|live|see it|walkthrough|workflow|console|editor|tool|platform|software)\b/)) s += 3;
    if (has(/\b(solution|how it works|works|feature|capabilit)/)) s += 1;
    if (has(/\b(proof|result|before|after|faster|save)\b/)) s += 1;
    if (k === "caption" || k === "bullet") s += 0.5; // content scene with room for a full visual
  } else if (role === "vector") {
    if (has(/\b(concept|benefit|why|value|idea|principle|process|step|flow|secure|scale|simple|smart|connect|integrat)/)) s += 2;
    if (k === "bullet") s += 0.5;
  } else if (role === "photo") {
    if (has(/\b(story|team|people|customer|journey|world|life|human|real|community|founder)\b/)) s += 2;
  }
  return s;
}

function pickNumber(scene) {
  const hay = `${scene.headline || ""} ${scene.emphasis || ""} ${scene.subtext || ""}`;
  // Neutralize number patterns that are NOT metrics, so they never render as a
  // giant full-screen counter: ratios/times ("24/7", "3:00"), ranges ("9-5"),
  // versions ("v2.0"), ordinals ("2nd"). This is what turned "24/7 support" into
  // a huge "24".
  const cleaned = hay
    .replace(/\bv\d+(?:\.\d+)*\b/gi, " ")     // versions: v2, v2.0
    .replace(/\d+\s*[/:]\s*\d+/g, " ")        // ratios / times: 24/7, 3:00, 1/2
    .replace(/\d+\s*-\s*\d+/g, " ")           // ranges: 9-5
    .replace(/\b\d+(?:st|nd|rd|th)\b/gi, " "); // ordinals: 1st, 2nd
  const m = /([₹$€£]?)\s?(\d[\d,]*)\s?([%x+]|M|K|B|hrs?|hours?|days?)?/i.exec(cleaned);
  if (!m) return null;
  const value = clamp(parseInt(m[2].replace(/,/g, ""), 10) || 0, 0, 9_999_999);
  if (!value) return null;
  const prefix = m[1] || "", suffix = (m[3] || "").replace(/hours?|hrs?/i, "");
  // A BARE number (no currency prefix, no unit) is a weak "metric" — a count,
  // year, step, or list index — and reads oddly as a full-screen counter. Only a
  // number with a $/₹/€/£ prefix or a %/x/M/K/B/day unit earns archStat; bare
  // numbers fall through to archText, where they live in the headline naturally.
  if (!prefix && !suffix) return null;
  return { value, prefix, suffix };
}

// Map a storyboard scene.kind to an archetype builder.
// `hint` (optional) is the Layout Planner's per-scene archetype name — a
// content-aware typing (e.g. a testimonial written as a plain bullet → quote, a
// metric with no chart kind → stat). It only ever names an ASSET-FREE archetype
// (hook/stat/quote/text/cta); the asset archetypes stay owned by the weaving. The
// hint is honored when present and valid, otherwise the legacy kind-based logic
// runs unchanged — so a missing/failed plan is a pure no-op.
const HINT_ARCH = { hook: () => archHook, cta: () => archCta, quote: () => archQuoteCard, stat: () => archStat, text: () => archText };
function archetypeFor(scene, idx, total, hint) {
  if (hint && HINT_ARCH[hint]) return HINT_ARCH[hint]();
  const k = (scene.kind || "").toLowerCase();
  if (idx === 0 || k === "hook" || k === "title") return archHook;
  if (idx === total - 1 || k === "cta") return archCta;
  if (k === "quote") return archQuoteCard;        // testimonial card (before the number check)
  if (k === "chart" || k === "countdown") return archStat;
  if (pickNumber(scene)) return archStat;        // any scene with a strong number
  return archText;                                // bullet / caption / shape-motion
}

// Seek-safe caption track (one node, recomputed each frame — never one clip/line).
function buildCaptions(captionCues, dims, D, theme, track) {
  const cues = Array.isArray(captionCues) ? captionCues.filter((c) => c && c.text) : [];
  if (!cues.length) return null;
  const data = JSON.stringify(cues.map((c) => [r(c.start || 0), r(c.end || (c.start || 0) + 2), String(c.text)]));
  // Safe-area bottom inset — portrait/square captions must clear the Reels/TikTok
  // UI band (progress bar, actions), so they ride higher than in landscape.
  const capBottom = `${Math.round(safeArea(dims.width, dims.height).bottom * 100)}%`;
  const html = `<div class="clip" data-start="0" data-duration="${D}" data-track-index="${track}"><div id="kfcap" style="position:absolute;left:50%;bottom:${capBottom};transform:translateX(-50%);max-width:76%;text-align:center;padding:11px 22px;border-radius:12px;background:${rgba(theme.isDark ? "#080c12" : "#0c0c0c", 0.72)};border:1px solid ${rgba("#ffffff", 0.10)};color:#F4F7FA;font:600 ${Math.round(dims.height * 0.034)}px/1.3 ${cssFont(theme)};opacity:0;"></div></div>`;
  const script = `var kfcd=${data};var kfcp={t:0};tl.to(kfcp,{t:${D},duration:${D},ease:"none",onUpdate:function(){var el=document.getElementById("kfcap");if(!el)return;var n=kfcp.t,a=null;for(var k=0;k<kfcd.length;k++){if(n>=kfcd[k][0]&&n<kfcd[k][1]){a=kfcd[k];break;}}if(a){if(el.textContent!==a[2])el.textContent=a[2];el.style.opacity="1";}else el.style.opacity="0";}},0);`;
  return { html, script };
}

// MAIN ENTRY — assemble the full composition.
function buildComposition({ storyboard, dims, framePack, assets, captionCues, seedKey, dressing, brandSkin, layoutPlan, localized, captionStyle } = {}) {
  // Non-Latin (video-text) scripts render wider per character; feed that factor into fitBig so
  // headlines shrink to fit instead of overflowing (esp. CJK). 1 for Latin/English (no-op).
  _langCharWidth = (captionStyle && captionStyle.text && captionStyle.text.charWidth) || 1;
  // Per-call localized strings: merge any overrides onto the English defaults so
  // a missing key falls back to English. When `localized` is undefined, S is the
  // STRINGS object itself → behavior is byte-identical to the untranslated path.
  const S = localized ? { ...STRINGS, ...localized } : STRINGS;
  const sb = storyboard || {};
  const scenes = Array.isArray(sb.scenes) && sb.scenes.length ? sb.scenes : [{ id: "s1", start: 0, duration: dims.fps ? 4 : 4, kind: "hook", headline: sb.title || "KEYFRAME" }];
  const D = r(sb.durationSec || scenes.reduce((a, s) => a + (s.duration || 0), 0) || 12);
  const theme = deriveTheme(framePack, sb, brandSkin);
  // Visual Layout Director globals (reserved `__` keys on layoutPlan): the target
  // hero size (width fraction) + montage tile budget. Absent/out-of-range → the
  // kit's own defaults, so a null plan is a pure no-op.
  const heroScale = layoutPlan && Number(layoutPlan.__heroScale) > 0
    ? Math.max(0.4, Math.min(0.7, Number(layoutPlan.__heroScale))) : null;
  const montageMax = layoutPlan && Number(layoutPlan.__montageMax) > 0
    ? Math.max(2, Math.min(6, Math.round(Number(layoutPlan.__montageMax)))) : 6;
  const W = dims.width, H = dims.height;
  // seedKey (jobId) first: two jobs with the same title must not be twins.
  const seed = hashSeed(`${seedKey || ""}|${sb.title || ""}|${scenes.length}`);

  const bg = buildBackground(theme, dims, D, seed, framePack);
  const motion = motionFor(framePack, theme);
  const bodyHtml = [bg.html];
  const scriptLines = [emitHelpers(D), bg.script];

  // ---- ASSET WEAVING ---------------------------------------------------------
  // The agents fetch a POOL of candidate assets (often 8–15); the single-feature
  // archetypes alone consume only 1–2 and the rest are dropped. To actually
  // surface the pool we weave in three tiers, ordered by credibility:
  //   • real screenshots + curated vectors  -> PROMINENT foreground (hero/split)
  //   • leftover assets (≥3)                 -> a MONTAGE grid scene (3–6 at once)
  //   • leftover photos                      -> scrimmed B-roll BACKGROUNDS behind
  //                                             text scenes (cinematic packs only;
  //                                             the scrim guarantees text contrast)
  // The agents still "think" (they picked these assets); the kit places them,
  // guaranteed clean. Each scene owns a 3-track block [bg, content, spare] so a
  // background never collides with (or covers) another scene's content.
  // The user's LOGO is pulled out BEFORE partitioning (it never enters a pool) —
  // it rides ctx.logo on the opening + closing scenes for its key-moment treatment.
  const logoAsset = (assets || []).find((a) => isLogo(a)) || null;
  const pools = partitionAssets(assets);
  // PROMINENT-SLOT RELEVANCE GATE — montage tiles, split art and screenshot
  // heroes are the frames a viewer actually reads, so they only take assets
  // whose relevance is ESTABLISHED: the user's own website shots, curated
  // library picks (hand-tagged, pack-recolored), or web stock the vision gate
  // explicitly approved (visionOk, annotated by pipeline/graph). Unverified
  // stock (gate skipped or failed-open) and keyword-matched icon fills can no
  // longer surface a tooth/camera/diamond tile in a montage about a dev tool.
  // Unverified PHOTOS stay usable as heavily-scrimmed B-roll texture, so a
  // gate outage still can't starve the film of backgrounds.
  // `__layoutDemoted` (Visual Layout Director): the presentation budget kept only the
  // best-scored few prominent per type and demoted the overflow — INCLUDING trusted
  // website/curated shots, which the source/visionOk checks would otherwise keep
  // prominent. Honoring the flag here is what makes "show the best 3 big, not 12
  // tiny" real. Demoted trusted assets are not discarded — they fall to scrim B-roll.
  // Trust itself lives in asset_priority.isTrustedProminent (uploads + website +
  // curated + vision-approved) — demotion stays a LAYOUT decision layered on top.
  const prominentOk = (a) => !!a && !a.__layoutDemoted && isTrustedProminent(a);
  const bgOnlyPhotos = pools.photos.filter((a) => !prominentOk(a));
  // Demoted screenshots/vectors (dropped from prominent by the budget) also survive
  // as B-roll texture rather than vanishing.
  const demotedBroll = [...pools.screenshots, ...pools.vectors].filter((a) => a && a.__layoutDemoted);
  pools.photos = pools.photos.filter(prominentOk);
  pools.vectors = pools.vectors.filter(prominentOk);
  pools.screenshots = pools.screenshots.filter(prominentOk);
  for (const a of demotedBroll) if (!bgOnlyPhotos.includes(a)) bgOnlyPhotos.push(a);
  if (bgOnlyPhotos.length) console.log(`[scene-kit] ${bgOnlyPhotos.length} unverified/demoted asset(s) demoted to scrim-background only`);
  // On-brand images first: prominent foreground slots get the most palette-fit
  // stock, off-palette stock falls to scrimmed B-roll. (Screenshots keep source
  // order — a real product shot is placed by intent, not recolored for palette.)
  pools.photos = orderByPaletteAffinity(pools.photos, theme);
  pools.vectors = orderByPaletteAffinity(pools.vectors, theme);
  const plan = scenes.map((scene, i) => {
    const T = r(scene.start != null ? scene.start : scriptStart(scenes, i));
    const L = r(scene.duration || 4);
    const base = 4 + i * 3;                  // [bg=base, content=base+1] — unique, no overlap
    // LLM set-dressing (premium hybrid): the dresser may pick this scene's
    // layout variant, the accent word, and a sanitized decorative SVG cluster.
    const dress = dressing && dressing[scene.id] ? dressing[scene.id] : null;
    if (dress?.emphasis && !scene.emphasis) scene = { ...scene, emphasis: dress.emphasis };
    const ctx = {
      theme, dims, id: `s${i + 1}`, T, L,
      track: base + 1, bgTrack: base,
      isLast: i === scenes.length - 1,
      S, // per-call localized strings (see STRINGS); read at literal sites as ctx.S.*
      kicker: i === 0 ? (sb.title || "KEYFRAME") : "",
      asset: null, assets: null, bgAsset: null,
      seed, sceneIndex: i, sceneCount: scenes.length,
      variant: dress?.variant != null ? dress.variant : textVariant(theme, seed, i), // 0-3 layout variant
      decorSvg: dress?.decorSvg || null,
      heroScale, // Visual Layout Director: target hero width fraction (null → default)
      // The logo appears at the OPEN (scene 0) and the CTA (last scene) only.
      logo: logoAsset && (i === 0 || i === scenes.length - 1) ? logoAsset : null,
    };
    const hint = layoutPlan && layoutPlan[scene.id] ? layoutPlan[scene.id].archetype : null;
    return { scene, i, ctx, isContent: i > 0 && i < scenes.length - 1, build: archetypeFor(scene, i, scenes.length, hint) };
  });

  const leftover = () => pools.screenshots.length + pools.vectors.length + pools.photos.length;
  let usedShot = false, montageDone = false;
  // Creative Director scene assignment: every curated asset carries the scene the CD
  // chose for it (a.sceneId). sameScene lets the weave PREFER that scene over pool
  // order, so assets land where the narration wants them (the #5 "random assets" fix).
  // A null sceneId — today's default and the CD-disabled/legacy path — is a no-op, so
  // this never regresses a job the CD didn't assign. Native composers already honor
  // sceneId; this brings the default scene-kit in line with them.
  const sameScene = (a, scene) => !!a && a.sceneId != null && String(a.sceneId) === String(scene.id);
  let cdPlaced = 0;

  // Pass 1 — FOREGROUND features on every CONTENT scene. The old guard only wove
  // assets into `archText` scenes, so a video whose middle scenes were stat/number
  // scenes dropped the ENTIRE fetched pool (0 images/screenshots on screen). Now
  // any content scene takes an asset: screenshots get hero treatment, a deep pool
  // spends one scene on a montage, the rest become split-art.
  // Only GENERIC text scenes are "weavable". Hook/CTA/quote/stat carry content
  // that an asset layout must not replace — turning a testimonial (archQuoteCard)
  // or a metric (archStat) into an asset montage would DELETE that content. So we
  // weave assets into archText scenes only (the design's flexible slots), and
  // leave content-critical archetypes intact; their assets fall to Pass 2's
  // scrimmed background B-roll instead.
  const weavable = plan.filter((p) => p.isContent && p.build === archText);

  // The screenshot is the highest-credibility asset — place it on the weavable
  // scene whose INTENT most calls for a product view (best assetAffinity), not
  // just the first one. Ties (and the no-signal case) fall to the earliest scene,
  // so a storyboard with no explicit demo cue behaves exactly as before.
  if (pools.screenshots.length && weavable.length) {
    // Honor the CD's assignment first: if a screenshot was assigned to a WEAVABLE scene,
    // give it that scene's hero; else fall back to the best product-intent affinity
    // (ties to the earliest scene) — the null-sceneId path, identical to before.
    let target, shot;
    const assigned = weavable.find((p) => pools.screenshots.some((a) => sameScene(a, p.scene)));
    if (assigned) {
      const si = pools.screenshots.findIndex((a) => sameScene(a, assigned.scene));
      shot = pools.screenshots.splice(si, 1)[0]; target = assigned; cdPlaced++;
    } else {
      target = weavable
        .map((p) => ({ p, s: assetAffinity(p.scene, "screenshot") }))
        .sort((a, b) => b.s - a.s || a.p.i - b.p.i)[0].p;
      shot = pools.screenshots.shift();
    }
    target.ctx.asset = shot; target.build = archScreenshotHero; usedShot = true;
    target.ctx.kicker = target.scene.emphasis || S.livePreview;
  }

  // Split-art media order is pack-driven (Phase 6 assets.prefer): a photo-forward
  // pack leads with photos, an illustration/vector-forward pack (the default)
  // leads with vectors. First-listed preference wins.
  const prefer = (theme.manifest && theme.manifest.assets && theme.manifest.assets.prefer) || [];
  const iPhoto = prefer.indexOf("photo");
  const iVec = Math.min(...["illustration", "vector"].map((t) => { const i = prefer.indexOf(t); return i < 0 ? 99 : i; }));
  const photoFirst = iPhoto > -1 && iPhoto < iVec;
  const splitPools = photoFirst ? ["photos", "vectors"] : ["vectors", "photos"];

  // Remaining weavable scenes, in order: one montage for a deep pool, then
  // split-art (per the pack's media preference), then any leftover screenshot.
  for (const p of weavable) {
    if (p.ctx.asset || p.ctx.assets) continue;
    if (!leftover()) break;
    if (!montageDone && leftover() >= 3) {
      p.ctx.assets = takeMontage(pools, montageMax); p.build = archAssetMontage; montageDone = true;
    } else if (pools[splitPools[0]].length || pools[splitPools[1]].length) {
      // Prefer an asset the CD assigned to THIS scene (sceneId), from either pool in the
      // pack's media-preference order; else the front of the preferred pool (unchanged).
      const takeAssigned = (name) => { const j = pools[name].findIndex((a) => sameScene(a, p.scene)); return j >= 0 ? (cdPlaced++, pools[name].splice(j, 1)[0]) : null; };
      const pref = pools[splitPools[0]].length ? splitPools[0] : splitPools[1];
      p.ctx.asset = takeAssigned(splitPools[0]) || takeAssigned(splitPools[1]) || pools[pref].shift();
      p.build = archSplitVector;
    } else if (pools.screenshots.length) {
      p.ctx.asset = pools.screenshots.shift(); p.build = archScreenshotHero;
      p.ctx.kicker = p.scene.emphasis || S.livePreview;
    }
  }

  if (cdPlaced) console.log(`[scene-kit] placed ${cdPlaced} prominent asset(s) on the Creative Director's assigned scene(s)`);

  // Pass 2 — BACKGROUND B-roll behind any scene still without a foreground asset,
  // on ALL packs now (flat packs used to be skipped, which is why blockframe videos
  // showed nothing). A leftover VIDEO becomes a moving background; otherwise a
  // scrimmed photo/screenshot/vector. Never the branded hook (i===0).
  for (const p of plan) {
    if (p.i === 0 || p.ctx.asset || p.ctx.assets) continue;
    if (pools.videos.length) {
      p.ctx.bgVideo = pools.videos.shift();
    } else {
      // Verified pool first; unverified photos LAST and only here — behind the
      // scrim they read as darkened texture, never as a statement about the film.
      const a = pools.photos.shift() || pools.screenshots.shift() || pools.vectors.shift() || bgOnlyPhotos.shift();
      if (a) p.ctx.bgAsset = a;
    }
  }

  // Pass 3 — emit each scene (its scrim background first, so it sits under the
  // content clip), in storyboard order.
  for (const p of plan) {
    const bg = p.ctx.bgVideo ? videoBg(p.ctx.bgVideo, p.ctx)
             : p.ctx.bgAsset ? scrimBg(p.ctx.bgAsset, p.ctx) : null;
    const out = p.build(p.scene, p.ctx);
    // Pack-skin ornaments: the design system's animated furniture (bar charts,
    // refraction streaks, watercolor blooms…) as the scene's first child.
    const kindC = p.build === archHook ? "hook" : p.build === archCta ? "cta"
      : p.build === archStat ? "stat" : (p.build === archText || p.build === archQuoteCard) ? "text" : "asset";
    const orn = buildSkinOrnaments(kindC, p.ctx, framePack);
    if (orn) {
      const withOrn = out.html.replace(new RegExp(`(<div id="${p.ctx.id}"[^>]*>)`), `$1${orn.html}`);
      if (withOrn !== out.html) { out.html = withOrn; out.script += `\n${orn.script}`; }
    }
    // Prop fill (fuller scenes): a hook or LEFT/RIGHT-aligned text scene with no
    // fetched visual gets an on-brand product-card vector in its empty half, so no
    // scene reads as half-empty. Centered text (variant 1) has no empty side; stat/
    // cta/quote/asset scenes are already full, so they're skipped.
    const noVisual = !p.ctx.asset && !p.ctx.assets && !p.ctx.bgAsset && !p.ctx.bgVideo;
    // Prop-fill lives in the EMPTY half of a side-aligned scene. Portrait/square
    // copy is full-width and centered, so a floating half-width card would sit
    // behind the text — skip it off the landscape path (the copy fills the frame).
    const propEligible = noVisual && W > H && (p.build === archHook || (p.build === archText && p.ctx.variant !== 1));
    if (propEligible) {
      const side = (p.build === archText && p.ctx.variant === 3) ? "left" : "right";
      const prop = buildPropFill(p.ctx, side);
      const withProp = out.html.replace(new RegExp(`(<div id="${p.ctx.id}"[^>]*>)`), `$1${prop.html}`);
      if (withProp !== out.html) { out.html = withProp; out.script += `\n${prop.script}`; }
    }
    // Set-dressing decor: a sanitized SVG cluster injected as the scene clip's
    // FIRST child (absolute, pointer-less, behind content), revealed gently.
    if (p.ctx.decorSvg) {
      const decorHtml = `<svg class="kfdress" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:0;" data-layout-allow-occlusion>${p.ctx.decorSvg}</svg>`;
      const opened = out.html.replace(new RegExp(`(<div id="${p.ctx.id}"[^>]*>)`), `$1${decorHtml}`);
      if (opened !== out.html) {
        out.html = opened;
        out.script += `\ntl.fromTo("#${p.ctx.id} .kfdress",{opacity:0,scale:1.04},{opacity:0.85,scale:1,duration:0.9,ease:"power2.out"},${r(p.ctx.T + 0.35)});`;
      }
    }
    const tag = p.ctx.assets ? " +montage" : p.ctx.asset ? " +asset" : p.ctx.bgVideo ? " +video" : p.ctx.bgAsset ? " +bg" : "";
    bodyHtml.push(`<!-- s${p.i + 1} ${p.scene.kind || ""}${tag} [${p.ctx.T}–${r(p.ctx.T + p.ctx.L)}] -->`);
    if (bg) bodyHtml.push(bg.html);
    bodyHtml.push(out.html);
    scriptLines.push(`// s${p.i + 1}`);
    if (bg) scriptLines.push(bg.script);
    scriptLines.push(out.script);
    scriptLines.push(sceneMotion(p, motion, seed, plan.length));
  }

  // Track order for the top overlays: cuts sit ABOVE every scene's content
  // clip (so the cut actually covers the swap) and captions sit above the cuts
  // (so text stays readable). Compute from the highest scene track instead of
  // hardcoding, so a long, many-scene video can never paint a scene OVER a cut.
  const maxSceneTrack = plan.reduce((m, p) => Math.max(m, p.ctx.track, p.ctx.bgTrack), 3);
  const cutTrack = maxSceneTrack + 2;
  const capTrack = maxSceneTrack + 4;

  // Editorial cut overlay — peaks exactly on each scene boundary so the clip
  // swap reads as a cut, not a fade. Sits above scenes, below captions.
  const cuts = buildCutLayer(plan, theme, dims, D, motion, seed, cutTrack);
  if (cuts) { bodyHtml.push(cuts.html); scriptLines.push("// cuts", cuts.script); }

  const cap = buildCaptions(captionCues, dims, D, theme, capTrack);
  if (cap) { bodyHtml.push(cap.html); scriptLines.push("// captions", cap.script); }

  scriptLines.push(`window.__timelines = window.__timelines || {};`, `window.__timelines["vid"] = tl;`);

  const indexHtml = [
    `<!DOCTYPE html>`, `<html>`, `<head>`, `<meta charset="utf-8">`, `<title>vid</title>`,
    `<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>`,
    `<style>`,
    theme.fontFace || "",
    `* { margin:0; padding:0; box-sizing:border-box; }`,
    `body { font-family:${theme.fontStack}; }`,
    // Headline words + stat numbers render in the pack's DISPLAY face; body/sub
    // text stays on the neutral stack. One rule skins every archetype's headline.
    `#root .kfw, #root .kfnum { font-family:${theme.displayStack}; }`,
    // Word/char spans must be inline-block for per-word transforms + clip-path
    // (mask-reveal / line-wipe / char-pop) to take effect.
    `#root .kfw, #root .kfc { display:inline-block; }`,
    // Per-pack typographic treatment (textfx): display case / tracking / weight.
    // Scoped to headline spans so body/labels are unaffected; empty when default.
    (theme.textfx.case === "upper" ? `#root .kfw { text-transform:uppercase; }` : ""),
    (theme.textfx.tracking ? `#root .kfw { letter-spacing:${theme.textfx.tracking}em; }` : ""),
    (theme.textfx.weight ? `#root .kfw { font-weight:${theme.textfx.weight}; }` : ""),
    `#root { position:relative; overflow:hidden; background:${theme.ground}; }`,
    `.clip { position:absolute; inset:0; }`,
    `</style>`, `</head>`, `<body>`,
    `<div id="root" data-composition-id="vid" data-start="0" data-width="${W}" data-height="${H}" data-duration="${D}">`,
    bodyHtml.join("\n"),
    `</div>`,
    `<script>`,
    scriptLines.join("\n"),
    `</script>`, `</body>`, `</html>`,
  ].join("\n");

  const metaJson = JSON.stringify({ compositionId: "vid", width: W, height: H, fps: dims.fps || 30, duration: D });
  // The skin the film actually WORE, for the caller to persist. resolveBrand nudges
  // and drops against THIS pack's ground, so the color a user picked and the color
  // the frames show are routinely different ones; a brand panel fed the pre-resolution
  // skin promises the first and the film paints the second.
  //
  // Null unless a brand applied: an unapplied theme.brand is the PACK's own accents
  // wearing a PackSkin's shape, and persisting that would report a brand review for a
  // film with no brand in it. The v1 disclosure fields (reason/source/provenance) are
  // the INPUT skin's and stay the persist site's to merge — a composer can testify to
  // what it painted, never to why those colors were chosen.
  // What the film actually WOVE — the asset-coverage engine reads this instead of
  // re-scanning the HTML (the kit knows exactly which asset landed in which slot).
  // via: hero (screenshot/split feature), montage (grid tile), broll (scrimmed
  // background), logo (key-moment mark).
  const usedAssets = [];
  const noteUse = (a, via) => { if (a && a.path) usedAssets.push({ path: a.path, via, uploadId: a.uploadId || null, source: a.source || null }); };
  for (const p of plan) {
    if (p.ctx.asset) noteUse(p.ctx.asset, p.build === archScreenshotHero ? "hero" : "hero");
    if (Array.isArray(p.ctx.assets)) for (const a of p.ctx.assets) noteUse(a, "montage");
    if (p.ctx.bgAsset) noteUse(p.ctx.bgAsset, "broll");
  }
  if (logoAsset) usedAssets.push({ path: logoAsset.path, via: "logo", uploadId: logoAsset.uploadId || null, source: logoAsset.source || null });

  return {
    indexHtml, metaJson,
    resolvedBrand: theme.brand && theme.brand.applied ? theme.brand : null,
    usedAssets,
    logoPlacements: logoAsset ? ["opening", "cta"] : [],
  };
}

function scriptStart(scenes, i) { let s = 0; for (let k = 0; k < i; k++) s += scenes[k].duration || 0; return s; }

module.exports = { buildComposition, deriveTheme, FLAT_PACKS, STRINGS };
