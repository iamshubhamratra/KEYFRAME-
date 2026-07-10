// DETERMINISTIC SCENE-KIT — builds a complete, lint-valid, showcase-grade
// HyperFrames composition from a storyboard WITHOUT asking the LLM to freehand
// layout/motion. The kit OWNS structure + motion (guaranteed by code, so the
// budget model can never produce an overlapping/truncated mess); the PACK owns
// STYLE (colors/fonts/atoms, re-skinned per pack — flat packs get NO gradients);
// the AGENTS own CONTENT (copy, archetype choice, asset/screenshot selection,
// carried on the storyboard). This is the codification of the three hand-authored
// reference films (showcase/flagship, showcase/index "KEYFRAME master",
// showcase/amazon-premium) into reusable, parameterized scenes — the full
// extracted grammar lives in docs/SHOWCASE-DNA.md. Showcase-uplift wave adds:
// per-scene light sources, alternating push/pull camera, emphasis shine sweeps,
// stat progress rings, the multi-stat PROOF ROW, screenshot callout annotations,
// and the strike-list DIFFERENTIATOR scene.
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

// SINGLE-quoted family names — these are embedded in double-quoted style="..."
// attributes, so a double quote here would terminate the attribute early and kill
// every font-size/color after it (CSS accepts single quotes for family names).
const SAFE_FONTS = "Inter, 'Segoe UI', system-ui, Roboto, Helvetica, Arial, sans-serif";

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
function lum(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return 128;
  const n = parseInt(m[1], 16);
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
}

// SAFE TINT for the veil/glow cuts (wash / glow / whip). A pack's accent list
// intentionally carries a near-black ink (e.g. fable's #33261A, bloom's #2B2540)
// so it contrasts a light ground for TEXT emphasis. But the tint cuts cycle
// through that same list at rgba(accent, α); on a light ground a near-black
// accent turns the 70%-wide blurred wash into a full-frame BLACKOUT on every
// boundary that lands on it — the "dark blob" that briefly wipes the scene mid-
// cut. Keep tint cuts a soft veil of the accent's HUE, never a blackout: on a
// light ground, pull only the near-black accents toward the ground (a faint,
// on-brand page-turn shadow). Colored/mid accents and all dark-ground glows are
// left untouched, so this changes nothing except the blackout case.
function cutTint(hex, theme) {
  if (!theme || theme.isDark) return hex;   // bright wash on a dark ground = intended glow
  if (lum(hex) >= 90) return hex;           // light/mid accent → soft colored wash, keep it
  return mix(hex, theme.ground, 0.66);      // near-black ink → pastel it into the ground family
}

// Derive the scene THEME from the chosen pack (authoritative) or, when no pack is
// bound, the storyboard's own palette. Returns the knobs every archetype re-skins.
function deriveTheme(framePack, storyboard) {
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
  // Per-pack LAYOUT switches — let a pack opt OUT of the shared scene furniture so
  // templates aren't all the same skeleton. All default to the legacy look:
  //   kicker   (bool)  hook/text corner chip                 default on
  //   underline(bool)  hook headline rule                    default on
  //   propFill (bool)  the generic product-card mock          default on
  //   stat     "hero"|"headline"  giant number+ring vs plain default "hero"
  const lm = (manifest && manifest.layout) || {};
  const layout = {
    kicker: lm.kicker !== false,
    underline: lm.underline !== false,
    propFill: lm.propFill !== false,
    stat: lm.stat === "headline" ? "headline" : "hero",
  };
  return {
    ground, ink, accents,
    textfx, layout,
    accent: accents[0],
    accent2: accents[1] || accents[0],
    extras: skin?.extras || [],
    emphasisCss: skin?.emphasisCss || null,
    packName: framePack || null,
    manifest,   // pack manifest (or null) — read by motionFor/buildCanvasFx/buildThreeFx
    fontStack,
    displayStack,   // headline/stat font stack (display face + body fallback)
    fontFace,       // @font-face CSS to inject (empty for safe/system display faces)
    isDark,
    gradients: !flat,          // flat packs: solid fills + hard borders only
    dim: isDark ? "rgba(255,255,255,0.62)" : "rgba(20,18,12,0.62)",
    line: isDark ? "rgba(255,255,255,0.14)" : "rgba(20,18,12,0.14)",
    panel: isDark ? "rgba(255,255,255,0.05)" : "rgba(20,18,12,0.04)",
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
      sc.push(`tl.fromTo("#${id}",{scaleX:0,transformOrigin:"${fromLeft ? "0%" : "100%"} 50%"},{scaleX:1,duration:0.24,ease:"power4.in"},${r(Tb - 0.24)});`);
      // immediateRender:false — this exit fromTo starts from the VISIBLE state
      // (scaleX:1). With GSAP's default immediateRender:true it forces scaleX:1 at
      // build time, so this full-frame colored wipe stays stretched over the whole
      // frame from t=0 until its tween fires — blanking every scene before the last
      // boundary (the "solid colour for N seconds" bug on wipe/push packs).
      // The exit now starts the same instant the enter completes (Tb, not Tb+0.04)
      // and exits from the OPPOSITE edge, so the block wipes straight through as a
      // hard swipe with no full-frame solid dwell — the brutalist cut without the
      // jarring full-screen colour FLASH the audit flagged.
      sc.push(`tl.fromTo("#${id}",{scaleX:1,transformOrigin:"${fromLeft ? "100%" : "0%"} 50%"},{scaleX:0,duration:0.28,ease:"power4.out",immediateRender:false},${r(Tb)});`);
    } else if (motion.cut === "whip") {
      // motion-blur streak racing across the frame — the one-take whip-pan
      els.push(`<div id="${id}" style="position:absolute;top:-4%;bottom:-4%;left:-45%;width:38%;transform:skewX(-16deg);opacity:0;background:linear-gradient(90deg,transparent,${rgba(theme.ink, 0.10)} 30%,${rgba(cutTint(A, theme), 0.28)} 50%,${rgba(theme.ink, 0.10)} 70%,transparent);filter:blur(6px);"></div>`);
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
      // soft blurred wash sweeping diagonally — watercolor page-turn. cutTint keeps
      // a near-black pack accent from turning this full-frame veil into a blackout.
      els.push(`<div id="${id}" style="position:absolute;top:-30%;bottom:-30%;left:-70%;width:70%;opacity:0;transform:rotate(-9deg);border-radius:50%;background:${rgba(cutTint(A, theme), 0.44)};filter:blur(${Math.round(H * 0.06)}px);"></div>`);
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
      els.push(`<div id="${id}" style="position:absolute;inset:-10%;opacity:0;background:radial-gradient(52% 52% at 50% 50%,${rgba(cutTint(A, theme), 0.34)},transparent 72%);filter:blur(10px);"></div>`);
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
  // ALTERNATING CAMERA (showcase grammar): even scenes push IN (1 → drift); odd
  // scenes ARRIVE at drift scale and settle back to 1 — the reference master's
  // S3/S7 pull-out arrivals, so consecutive shots never move the same way.
  // Every entrance tween carries the scene's start scale in BOTH keyframes, so
  // scale is written by exactly one tween at a time (lint-clean hand-off into
  // the drift, which then owns scale alone in the settled middle).
  const K = motion.drift;
  const zoomOut = ((i + seed) % 2) === 1;
  const s1 = zoomOut ? K : 1;                 // scale at entrance end == drift start
  const sk = (v) => r(v * s1);
  // -- entrance (scene 0 opens cold; the hook's own choreography carries it)
  if (i > 0) {
    if (cut === "whip") out.push(`tl.fromTo("#${id}",{xPercent:16,filter:"blur(10px)",scale:${s1}},{xPercent:0,filter:"blur(0px)",scale:${s1},duration:0.5,ease:"power3.out"},${r(T)});`);
    else if (cut === "wipe" || cut === "push") out.push(`tl.fromTo("#${id}",{xPercent:${(i + seed) % 2 === 0 ? 20 : -20},scale:${s1}},{xPercent:0,scale:${s1},duration:0.45,ease:"power4.out"},${r(T + 0.04)});`);
    else if (cut === "flash") out.push(`tl.fromTo("#${id}",{scale:${sk(1.08)}},{scale:${s1},duration:0.6,ease:"power3.out"},${r(T)});`);
    else if (cut === "wash") out.push(`tl.fromTo("#${id}",{y:30,filter:"blur(6px)",scale:${s1}},{y:0,filter:"blur(0px)",scale:${s1},duration:0.55,ease:"power2.out"},${r(T)});`);
    else if (cut === "panel") out.push(`tl.fromTo("#${id}",{yPercent:7,scale:${s1}},{yPercent:0,scale:${s1},duration:0.55,ease:"power3.out"},${r(T + 0.04)});`);
    else if (cut === "iris") out.push(`tl.fromTo("#${id}",{scale:${sk(0.94)}},{scale:${s1},duration:0.5,ease:"power2.out"},${r(T + 0.04)});`);
    else out.push(`tl.fromTo("#${id}",{scale:${sk(0.965)},y:12},{scale:${s1},y:0,duration:0.55,ease:"power3.out"},${r(T)});`);
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
  // push-in scenes drift 1 → K; pull-out scenes settle K → 1 (arrival zoomed).
  const drift = zoomOut
    ? `tl.fromTo("#${id}",{scale:${K},xPercent:0},{scale:1,xPercent:${panX},duration:${r(de - ds)},ease:"none"},${ds});`
    : `tl.fromTo("#${id}",{scale:1,xPercent:0},{scale:${K},xPercent:${panX},duration:${r(de - ds)},ease:"none"},${ds});`;
  return [drift, ...out].join("\n");
}

// PER-SCENE LIGHT SOURCE (showcase grammar: every scene owns its own light).
// The reference master gives each scene a `.cam` glow and amazon-premium a
// `.hero-glow` — a seeded blurred radial that fades in WITH the scene and
// drifts slowly opposite the camera pan (parallax depth). Gradient packs only;
// injected as the scene clip's very first child so all content paints above.
function buildSceneLight(ctx) {
  const { theme, id, T, L, dims, seed, sceneIndex } = ctx;
  const W = dims.width, H = dims.height;
  const i = sceneIndex || 0;
  const spots = [[26, 26], [70, 30], [30, 66], [66, 60]];   // seeded anchor slots
  const [lx, ly] = spots[(seed + i) % spots.length];
  const col = (i % 2 === 0) ? theme.accent : (theme.accent2 || theme.accent);
  const gw = Math.round(W * 0.46), gh = Math.round(H * 0.52);
  const dx = ((i + seed) % 3 - 1) * -8;                     // opposite the scene panX
  const pid = `${id}lite`;
  const html = `<div id="${pid}" class="kflight" data-layout-allow-occlusion style="position:absolute;left:${lx}%;top:${ly}%;width:${gw}px;height:${gh}px;margin-left:-${Math.round(gw / 2)}px;margin-top:-${Math.round(gh / 2)}px;border-radius:50%;filter:blur(${Math.round(H * 0.05)}px);background:radial-gradient(circle,${rgba(col, 0.30)},transparent 70%);opacity:0;pointer-events:none;"></div>`;
  const script = [
    `tl.fromTo("#${pid}",{opacity:0,scale:0.82},{opacity:1,scale:1,duration:0.8,ease:"sine.out"},${r(T + 0.05)});`,
    `tl.to("#${pid}",{xPercent:${dx},yPercent:${dx === 0 ? -7 : Math.round(dx * -0.75)},duration:${r(Math.max(1.2, L - 1.0))},ease:"sine.inOut"},${r(T + 0.9)});`,
  ].join("\n");
  return { html, script };
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
  const X0 = rgba((theme.extras && theme.extras[0]) || theme.accent2 || theme.accent, 1).replace(",1)", ",%A%)");
  const X1 = rgba((theme.extras && theme.extras[1]) || theme.accent, 1).replace(",1)", ",%A%)");
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
  } else if (mode === "sprinkle") {
    // Bright explainer backdrop — a field of bold accent shapes (dots, rings,
    // triangles, diamonds, squares) drifting up and rotating on the light ground.
    init = `var SP=[],SC=[${JSON.stringify(col(A, ".8"))},${JSON.stringify(col(B, ".75"))},${JSON.stringify(col(X0, ".75"))},${JSON.stringify(col(X1, ".8"))}];for(var i=0;i<30;i++)SP.push({x:rnd()*W,y:rnd()*H,s:8+rnd()*18,w:(rnd()-.5)*.8,sp:8+rnd()*15,p:rnd()*6.28,t:i%5,c:i%4});`;
    paint =
      `for(var i=0;i<SP.length;i++){var f=SP[i],y=((f.y-t*f.sp)%(H+60)+H+60)%(H+60)-30,x=f.x+Math.sin(t*.4+f.p)*20;` +
      `cx.save();cx.translate(x,y);cx.rotate(t*f.w+f.p);cx.fillStyle=SC[f.c];cx.strokeStyle=SC[f.c];cx.lineWidth=Math.max(2.5,f.s*.16);var s=f.s;` +
      `if(f.t===0){cx.beginPath();cx.arc(0,0,s*.5,0,6.283);cx.fill();}` +
      `else if(f.t===1){cx.beginPath();cx.arc(0,0,s*.5,0,6.283);cx.stroke();}` +
      `else if(f.t===2){cx.beginPath();cx.moveTo(0,-s*.55);cx.lineTo(s*.5,s*.42);cx.lineTo(-s*.5,s*.42);cx.closePath();cx.fill();}` +
      `else if(f.t===3){cx.beginPath();cx.moveTo(0,-s*.55);cx.lineTo(s*.5,0);cx.lineTo(0,s*.55);cx.lineTo(-s*.5,0);cx.closePath();cx.fill();}` +
      `else{cx.fillRect(-s*.4,-s*.4,s*.8,s*.8);}` +
      `cx.restore();}`;
  } else if (mode === "halftone") {
    // Print halftone — a grid of two-ink dots whose radius pulses on a slow
    // diagonal wave. The risograph/poster texture, on the paper ground.
    init = `var HG=${Math.round(Math.max(W, H) / 30)},HC=[${JSON.stringify(col(A, ".32"))},${JSON.stringify(col(B, ".28"))}];`;
    paint = `for(var gy=HG*0.5;gy<H;gy+=HG){for(var gx=HG*0.5;gx<W;gx+=HG){var wv=Math.sin((gx*0.9+gy)*0.0038-t*0.5);var rr=(HG*0.14)*(0.45+0.55*wv);if(rr<0.5)continue;cx.fillStyle=((((gx/HG)|0)+((gy/HG)|0))%2)?HC[0]:HC[1];cx.beginPath();cx.arc(gx,gy,rr,0,6.283);cx.fill();}}`;
  } else if (mode === "paper") {
    // Notebook page — static ruled lines + a red double margin line, plus small
    // hand-drawn pen marks (x / o / + / squiggle) drifting up and wobbling like
    // idle doodles. The sketchnote ground.
    init =
      `var RG=${Math.round(H / 16)},MX=${Math.round(W * 0.062)},RC=${JSON.stringify(col(X0, ".13"))},MC=${JSON.stringify(col(A, ".25"))},` +
      `PM=[],PC=[${JSON.stringify(col(A, ".38"))},${JSON.stringify(col(X0, ".38"))},${JSON.stringify(col(X1, ".4"))},${JSON.stringify(col(I, ".28"))}];` +
      `for(var i=0;i<16;i++)PM.push({x:rnd()*W,y:rnd()*H,s:6+rnd()*8,sp:5+rnd()*9,w:(rnd()-.5)*.7,p:rnd()*6.28,t:i%4,c:i%4});`;
    paint =
      `cx.strokeStyle=RC;cx.lineWidth=1.5;for(var ry=RG;ry<H;ry+=RG){cx.beginPath();cx.moveTo(0,ry);cx.lineTo(W,ry);cx.stroke();}` +
      `cx.strokeStyle=MC;cx.lineWidth=2;cx.beginPath();cx.moveTo(MX,0);cx.lineTo(MX,H);cx.stroke();cx.beginPath();cx.moveTo(MX+7,0);cx.lineTo(MX+7,H);cx.stroke();` +
      `cx.lineWidth=2.5;cx.lineCap="round";` +
      `for(var i=0;i<PM.length;i++){var m=PM[i],my=((m.y-t*m.sp)%(H+40)+H+40)%(H+40)-20,mx=m.x+Math.sin(t*.4+m.p)*10;` +
      `cx.save();cx.translate(mx,my);cx.rotate(Math.sin(t*m.w*3+m.p)*.25);cx.strokeStyle=PC[m.c];var s=m.s;cx.beginPath();` +
      `if(m.t===0){cx.moveTo(-s,-s);cx.lineTo(s,s);cx.moveTo(s,-s);cx.lineTo(-s,s);}` +
      `else if(m.t===1){cx.arc(0,0,s,0,6.283);}` +
      `else if(m.t===2){cx.moveTo(-s,0);cx.lineTo(s,0);cx.moveTo(0,-s);cx.lineTo(0,s);}` +
      `else{cx.moveTo(-s,0);cx.quadraticCurveTo(-s*.5,-s,0,0);cx.quadraticCurveTo(s*.5,s,s,0);}` +
      `cx.stroke();cx.restore();}`;
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
  const A = theme.accent, B = theme.accent2;
  const X0 = (theme.extras && theme.extras[0]) || B, X1 = (theme.extras && theme.extras[1]) || A;

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
  } else if (framePack === "liquid-glass") {
    // LIQUID GLASS — frosted translucent panels with a hairline specular edge and
    // a light sweep crossing the glass; small glass orbs drift in the margins.
    // backdrop-filter blurs the bokeh backlight THROUGH the panel (the actual
    // glass read); the sweep is a child span so overflow stays inside the panel.
    const panels = kind === "hook" || kind === "cta"
      ? [[70, 8, 21, 24, -6], [7, 66, 15, 19, 5]]        // corners — text owns center
      : [[62, 12, 22, 25, -5], [10, 70, 16, 18, 6]];
    panels.forEach(([left, top, w, h, rot]) => {
      dv.push(`<div class="${pid}p" data-rot="${rot}" style="position:absolute;left:${left}%;top:${top}%;width:${w}%;height:${h}%;border-radius:${Math.round(H * 0.024)}px;background:linear-gradient(135deg,${rgba("#FFFFFF", 0.38)},${rgba("#FFFFFF", 0.08)});border:1px solid ${rgba("#FFFFFF", 0.6)};box-shadow:0 ${Math.round(H * 0.02)}px ${Math.round(H * 0.05)}px ${rgba(A, 0.12)},inset 0 1px 0 ${rgba("#FFFFFF", 0.7)};backdrop-filter:blur(13px);-webkit-backdrop-filter:blur(13px);overflow:hidden;opacity:0;"><span class="${pid}sw" style="position:absolute;top:-45%;bottom:-45%;left:-34%;width:26%;transform:rotate(16deg);background:linear-gradient(90deg,transparent,${rgba("#FFFFFF", 0.55)},transparent);"></span></div>`);
    });
    sc.push(`tl.fromTo("#${id} .${pid}p",{opacity:0,y:26,rotation:function(i,el){return +el.getAttribute("data-rot");},scale:0.94},{opacity:1,y:0,rotation:function(i,el){return +el.getAttribute("data-rot");},scale:1,duration:.8,stagger:.18,ease:"power3.out"},${s0(0.35)});`);
    sc.push(`tl.to("#${id} .${pid}p",{y:"-=10",duration:2.2,ease:"sine.inOut",yoyo:true,repeat:${Math.max(0, Math.floor((L - 1.4) / 2.2) - 1)},stagger:.3},${s0(1.2)});`);
    // the specular sweep — light crossing the glass, repeating gently
    sc.push(`tl.fromTo("#${id} .${pid}sw",{xPercent:0},{xPercent:560,duration:1.5,ease:"power2.inOut",stagger:.4,repeat:${Math.max(0, Math.floor((L - 2) / 2.6))},repeatDelay:1.1},${s0(0.9)});`);
    // glass orbs — tiny highlighted spheres drifting in the margins
    const orbs = [[0.13, 0.2, 11], [0.88, 0.72, 8], [0.2, 0.82, 6]];
    orbs.forEach(([fx2, fy, rr], i) => {
      const col = [A, B, X0][i % 3];
      sv.push(`<circle class="${pid}o" cx="${Math.round(W * fx2)}" cy="${Math.round(H * fy)}" r="${rr}" fill="${rgba(col, 0.3)}" stroke="${rgba("#FFFFFF", 0.85)}" stroke-width="1.5"/>`);
      sv.push(`<circle class="${pid}o" cx="${Math.round(W * fx2 - rr * 0.3)}" cy="${Math.round(H * fy - rr * 0.35)}" r="${Math.max(1.5, rr * 0.22)}" fill="${rgba("#FFFFFF", 0.9)}"/>`);
    });
    sc.push(`tl.fromTo("#${id} .${pid}o",{opacity:0,scale:0},{opacity:1,scale:1,duration:.5,stagger:.08,ease:"back.out(2)"},${s0(0.6)});`);
    sc.push(`tl.to("#${id} .${pid}o",{y:-14,duration:2.6,ease:"sine.inOut",yoyo:true,repeat:${Math.max(0, Math.floor((L - 1.2) / 2.6) - 1)}},${s0(1.1)});`);
    if (kind === "stat") {
      // a glass ring around the figure: white hairline + a rotating iridescent dash
      const cxp = Math.round(W * 0.5), cyp = Math.round(H * 0.46), rr = Math.round(H * 0.27);
      sv.push(`<circle cx="${cxp}" cy="${cyp}" r="${rr}" fill="none" stroke="${rgba("#FFFFFF", 0.55)}" stroke-width="1"/>`);
      sv.push(`<circle class="${pid}r" cx="${cxp}" cy="${cyp}" r="${rr}" fill="none" stroke="${rgba(B, 0.6)}" stroke-width="2" stroke-dasharray="12 30" stroke-linecap="round"/>`);
      sc.push(`tl.to("#${id} .${pid}r",{rotation:160,transformOrigin:"${cxp}px ${cyp}px",duration:${L},ease:"none"},${T});`);
    }
  } else if (framePack === "nova-launch") {
    // NOVA LAUNCH — a live product-reveal HUD on every scene: drawing corner
    // brackets, a glowing laser scan sweep, a rotating telemetry ring with an
    // orbiting node, and a small DOM data-constellation (dots + connectors). On
    // proof beats it adds real animated data-viz — a climbing bar chart, a drawing
    // trend line, a sweeping radial gauge — and the CTA closes a 100% ring with a
    // particle burst. Dense motion-graphics furniture, all margin-placed so it
    // orbits the headline instead of fighting it.
    const bl = Math.round(W * 0.026);
    const corners = [
      `M${bl * 2} ${bl}H${bl}V${bl * 2}`,
      `M${W - bl * 2} ${bl}H${W - bl}V${bl * 2}`,
      `M${bl * 2} ${H - bl}H${bl}V${H - bl * 2}`,
      `M${W - bl * 2} ${H - bl}H${W - bl}V${H - bl * 2}`,
    ];
    corners.forEach((d, i) => sv.push(`<path class="${pid}k" d="${d}" fill="none" stroke="${i % 2 ? B : A}" stroke-width="2.5" opacity=".55" stroke-dasharray="170" stroke-dashoffset="170"/>`));
    sc.push(`tl.to("#${id} .${pid}k",{strokeDashoffset:0,duration:.6,stagger:.08,ease:"power2.out"},${s0(0.3)});`);
    // glowing laser scan sweep — a thin vertical line crossing the frame once
    dv.push(`<div class="${pid}sw" style="position:absolute;top:0;bottom:0;left:0;width:2px;background:linear-gradient(180deg,transparent,${rgba(A, 0.9)},transparent);box-shadow:0 0 16px ${rgba(A, 0.85)};transform:translateX(-30px);"></div>`);
    sc.push(`tl.fromTo("#${id} .${pid}sw",{x:-30},{x:${W + 30},duration:${Math.min(2.8, Math.max(1.4, L - 0.5))},ease:"sine.inOut"},${s0(0.5)});`);
    // rotating dashed telemetry ring + orbiting node, top-margin corner
    const rcx = Math.round(W * (seed % 2 ? 0.12 : 0.88)), rcy = Math.round(H * 0.2), rr0 = Math.round(H * 0.09);
    sv.push(`<circle class="${pid}o" cx="${rcx}" cy="${rcy}" r="${rr0}" fill="none" stroke="${rgba(X0, 0.5)}" stroke-width="1.5" stroke-dasharray="3 8"/>`);
    sv.push(`<circle class="${pid}od" cx="${rcx + rr0}" cy="${rcy}" r="4" fill="${X1}"/>`);
    sc.push(`tl.to("#${id} .${pid}o",{rotation:360,transformOrigin:"${rcx}px ${rcy}px",duration:16,ease:"none",repeat:reps(16)},0);`);
    sc.push(`tl.fromTo("#${id} .${pid}od",{scale:0,transformOrigin:"50% 50%"},{scale:1,duration:.5,ease:"back.out(2)"},${s0(0.7)});`);
    // DOM data-constellation echo — dots joined by thin connectors, bottom corner
    const dcx = Math.round(W * (seed % 2 ? 0.9 : 0.1) - W * 0.05), dcy = Math.round(H * 0.78);
    sv.push(`<path class="${pid}n" d="M${dcx} ${dcy} L${dcx + 44} ${dcy - 28} L${dcx + 76} ${dcy + 16} M${dcx + 44} ${dcy - 28} L${dcx + 26} ${dcy + 46}" fill="none" stroke="${rgba(X0, 0.45)}" stroke-width="1.5" stroke-dasharray="240" stroke-dashoffset="240"/>`);
    const nodes = [[0, 0], [44, -28], [76, 16], [26, 46]];
    nodes.forEach(([nx, ny], i) => sv.push(`<circle class="${pid}nd" cx="${dcx + nx}" cy="${dcy + ny}" r="${i === 0 ? 4 : 2.5}" fill="${[A, B, X1, X0][i]}"/>`));
    sc.push(`tl.to("#${id} .${pid}n",{strokeDashoffset:0,duration:.8,ease:"power2.out"},${s0(0.5)});`);
    sc.push(`tl.fromTo("#${id} .${pid}nd",{scale:0,transformOrigin:"50% 50%"},{scale:1,duration:.4,stagger:.06,ease:"back.out(2)"},${s0(0.6)});`);

    if (kind === "stat" || kind === "text") {
      // climbing bar chart + drawing trend line (the launch's proof, abstracted)
      const nb = 6, bw = Math.round(W * 0.026), gap = Math.round(W * 0.016);
      const chartX = Math.round(W * 0.63), base = Math.round(H * 0.8);
      const frac = [0.30, 0.46, 0.38, 0.64, 0.80, 1.0];
      const tops = [];
      frac.forEach((f, i) => {
        const h = Math.round(H * 0.26 * f), x = chartX + i * (bw + gap), y = base - h;
        sv.push(`<rect class="${pid}b" x="${x}" y="${y}" width="${bw}" height="${h}" rx="3" fill="${rgba(i === nb - 1 ? A : B, i === nb - 1 ? 0.9 : 0.5)}"/>`);
        tops.push(`${x + Math.round(bw / 2)},${y - 10}`);
      });
      sv.push(`<line x1="${chartX - 8}" y1="${base}" x2="${chartX + nb * (bw + gap)}" y2="${base}" stroke="${rgba(theme.ink, 0.25)}" stroke-width="1.5"/>`);
      sv.push(`<polyline class="${pid}t" points="${tops.join(" ")}" fill="none" stroke="${X1}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="760" stroke-dashoffset="760"/>`);
      sc.push(`tl.fromTo("#${id} .${pid}b",{scaleY:0,transformOrigin:"50% 100%"},{scaleY:1,duration:.6,stagger:.08,ease:"power3.out"},${s0(0.6)});`);
      sc.push(`tl.to("#${id} .${pid}t",{strokeDashoffset:0,duration:1.0,ease:"power2.inOut"},${s0(1.0)});`);
    }
    if (kind === "hook") {
      // radial gauge sweeping to ~75% — a "loading the launch" HUD read
      const gx = Math.round(W * 0.85), gy = Math.round(H * 0.74), gr = Math.round(H * 0.1);
      const circ = Math.round(2 * Math.PI * gr);
      sv.push(`<circle cx="${gx}" cy="${gy}" r="${gr}" fill="none" stroke="${rgba(theme.ink, 0.16)}" stroke-width="6"/>`);
      sv.push(`<circle class="${pid}g" cx="${gx}" cy="${gy}" r="${gr}" fill="none" stroke="${A}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${circ}" transform="rotate(-90 ${gx} ${gy})"/>`);
      sc.push(`tl.to("#${id} .${pid}g",{strokeDashoffset:${Math.round(circ * 0.25)},duration:1.2,ease:"power2.out"},${s0(0.6)});`);
    }
    if (kind === "cta") {
      // completion ring closing to 100% + a compact particle burst
      const gx = Math.round(W * 0.5), gy = Math.round(H * 0.44), gr = Math.round(H * 0.16);
      const circ = Math.round(2 * Math.PI * gr);
      sv.push(`<circle class="${pid}g" cx="${gx}" cy="${gy}" r="${gr}" fill="none" stroke="${A}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${circ}" transform="rotate(-90 ${gx} ${gy})" opacity=".7"/>`);
      sc.push(`tl.to("#${id} .${pid}g",{strokeDashoffset:0,duration:1.1,ease:"power2.inOut"},${s0(0.5)});`);
      const CC = [A, B, X0, X1];
      for (let i = 0; i < 10; i++) sv.push(`<circle class="${pid}p" cx="${gx}" cy="${gy}" r="${4 + (i % 3)}" fill="${CC[i % 4]}"/>`);
      const dx = [190, -210, 140, -160, 230, -110, 80, -250, 170, -190], dy = [-150, -110, 170, 140, 30, -190, -230, 50, 120, -70];
      sc.push(`var ${pid}dx=${JSON.stringify(dx)},${pid}dy=${JSON.stringify(dy)};`);
      sc.push(`tl.fromTo("#${id} .${pid}p",{x:0,y:0,scale:0,opacity:1},{x:function(i){return ${pid}dx[i];},y:function(i){return ${pid}dy[i];},scale:1,opacity:.9,duration:1.0,ease:"power3.out",stagger:.03},${s0(Math.max(0.6, L - 1.8))});`);
      sc.push(`tl.to("#${id} .${pid}p",{opacity:0,duration:.5},${r(T + Math.max(1.4, L - 0.5))});`);
    }
  } else if (framePack === "lumen-motion") {
    // LUMEN MOTION — a bright animated explainer. Every scene fills the frame with
    // hand-drawn animated vectors that narrate the story: a floating shape field on
    // all scenes, then a launching ROCKET (hook), a line GRAPH whose points pop in
    // and connect (stat), turning GEARS + drawing CHECKMARKS (feature), and a
    // clicking CURSOR + CONFETTI burst (cta). Bold filled accent shapes on paper;
    // all margin/lower-band placed so the centered headline stays the hero.
    const INK = theme.ink;
    const COLZ = [A, B, X0, X1];
    const pt = (x, y) => `${Math.round(x)},${Math.round(y)}`;

    // -- shape-confetti field (all scenes): bold shapes popped in then floating ----
    const field = [
      [7, 12, 34, 0, 0], [16, 27, 22, 3, 1], [6, 45, 26, 2, 2], [11, 64, 30, 1, 3],
      [5, 83, 24, 4, 0], [20, 90, 20, 0, 2], [90, 11, 30, 2, 1], [94, 29, 22, 3, 3],
      [88, 49, 26, 1, 0], [93, 70, 32, 0, 2], [85, 87, 22, 4, 1], [79, 17, 18, 3, 2],
      [50, 7, 20, 0, 3], [50, 93, 24, 1, 1],
    ];
    field.forEach(([fx, fy, s, ty, ci]) => {
      const x = Math.round(W * fx / 100), y = Math.round(H * fy / 100), c = COLZ[ci];
      if (ty === 0) sv.push(`<circle class="${pid}f" cx="${x}" cy="${y}" r="${Math.round(s / 2)}" fill="${c}"/>`);
      else if (ty === 1) sv.push(`<circle class="${pid}f" cx="${x}" cy="${y}" r="${Math.round(s / 2)}" fill="none" stroke="${c}" stroke-width="${Math.max(3, Math.round(s * 0.16))}"/>`);
      else if (ty === 2) sv.push(`<polygon class="${pid}f" points="${pt(x, y - s * 0.55)} ${pt(x + s * 0.5, y + s * 0.42)} ${pt(x - s * 0.5, y + s * 0.42)}" fill="${c}"/>`);
      else if (ty === 3) sv.push(`<polygon class="${pid}f" points="${pt(x, y - s * 0.5)} ${pt(x + s * 0.5, y)} ${pt(x, y + s * 0.5)} ${pt(x - s * 0.5, y)}" fill="${c}"/>`);
      else sv.push(`<rect class="${pid}f" x="${Math.round(x - s * 0.4)}" y="${Math.round(y - s * 0.4)}" width="${Math.round(s * 0.8)}" height="${Math.round(s * 0.8)}" rx="${Math.round(s * 0.14)}" fill="${c}"/>`);
    });
    sc.push(`tl.fromTo("#${id} .${pid}f",{scale:0,transformOrigin:"50% 50%"},{scale:1,duration:.5,stagger:.04,ease:"back.out(2.4)"},${s0(0.15)});`);
    sc.push(`tl.to("#${id} .${pid}f",{y:"-=14",rotation:"+=16",duration:2.4,ease:"sine.inOut",yoyo:true,repeat:${Math.max(1, Math.floor((L - 0.6) / 2.4))},stagger:.08},${s0(0.8)});`);

    if (kind === "hook") {
      // ROCKET lifting off in the lower-centre — clear of the left-anchored hook
      // headline and any right-side product-card prop-fill.
      const rx = Math.round(W * 0.42), ry = Math.round(H * 0.72);
      const bw = Math.round(W * 0.05), bh = Math.round(H * 0.2);
      const g = [];
      g.push(`<rect x="${Math.round(rx - bw / 2)}" y="${Math.round(ry - bh / 2)}" width="${bw}" height="${bh}" rx="${Math.round(bw / 2)}" fill="${A}"/>`);
      g.push(`<path d="M${Math.round(rx - bw / 2)} ${Math.round(ry - bh / 2 + 4)} Q ${rx} ${Math.round(ry - bh / 2 - bh * 0.34)} ${Math.round(rx + bw / 2)} ${Math.round(ry - bh / 2 + 4)} Z" fill="${B}"/>`);
      g.push(`<circle cx="${rx}" cy="${Math.round(ry - bh * 0.18)}" r="${Math.round(bw * 0.26)}" fill="${theme.ground}" stroke="${B}" stroke-width="5"/>`);
      g.push(`<path d="M${Math.round(rx - bw / 2)} ${Math.round(ry + bh * 0.2)} L${Math.round(rx - bw)} ${Math.round(ry + bh / 2 + bh * 0.06)} L${Math.round(rx - bw / 2)} ${Math.round(ry + bh / 2)} Z" fill="${X1}"/>`);
      g.push(`<path d="M${Math.round(rx + bw / 2)} ${Math.round(ry + bh * 0.2)} L${Math.round(rx + bw)} ${Math.round(ry + bh / 2 + bh * 0.06)} L${Math.round(rx + bw / 2)} ${Math.round(ry + bh / 2)} Z" fill="${X1}"/>`);
      sv.push(`<g class="${pid}rk">${g.join("")}</g>`);
      sv.push(`<path class="${pid}fl" d="M${Math.round(rx - bw * 0.28)} ${Math.round(ry + bh / 2)} Q ${rx} ${Math.round(ry + bh / 2 + bh * 0.5)} ${Math.round(rx + bw * 0.28)} ${Math.round(ry + bh / 2)} Z" fill="${X0}"/>`);
      for (let i = 0; i < 8; i++) sv.push(`<circle class="${pid}bs" cx="${rx}" cy="${Math.round(ry + bh * 0.2)}" r="${6 + (i % 3) * 2}" fill="${COLZ[i % 4]}"/>`);
      for (let i = 0; i < 3; i++) sv.push(`<line class="${pid}sl" x1="${Math.round(rx - bw * 0.6 + i * bw * 0.6)}" y1="${Math.round(ry + bh)}" x2="${Math.round(rx - bw * 0.6 + i * bw * 0.6)}" y2="${Math.round(ry + bh + 46)}" stroke="${rgba(INK, 0.28)}" stroke-width="4" stroke-linecap="round"/>`);
      sc.push(`tl.fromTo("#${id} .${pid}rk",{y:220,opacity:0},{y:0,opacity:1,duration:1.1,ease:"back.out(1.4)"},${s0(0.3)});`);
      sc.push(`tl.to("#${id} .${pid}rk",{y:-16,rotation:2.5,transformOrigin:"50% 100%",duration:1.6,ease:"sine.inOut",yoyo:true,repeat:${Math.max(1, Math.floor((L - 1.4) / 1.6))}},${s0(1.4)});`);
      sc.push(`tl.fromTo("#${id} .${pid}fl",{scaleY:0,opacity:0,transformOrigin:"50% 0%"},{scaleY:1,opacity:1,duration:.4,ease:"power2.out"},${s0(1.1)});`);
      sc.push(`tl.to("#${id} .${pid}fl",{scaleY:1.4,transformOrigin:"50% 0%",duration:.16,ease:"sine.inOut",yoyo:true,repeat:${Math.min(30, Math.max(4, Math.floor(L / 0.16)))}},${s0(1.4)});`);
      sc.push(`tl.fromTo("#${id} .${pid}bs",{scale:0,opacity:1,transformOrigin:"50% 50%"},{scale:1,x:function(i){return Math.cos(i/8*6.283)*64;},y:function(i){return Math.sin(i/8*6.283)*64+44;},opacity:0,duration:.9,stagger:.02,ease:"power2.out"},${s0(1.0)});`);
      sc.push(`tl.fromTo("#${id} .${pid}sl",{scaleY:0,opacity:.6,transformOrigin:"50% 0%"},{scaleY:1,opacity:0,duration:.5,stagger:.06,ease:"power1.out",repeat:${Math.min(20, Math.max(3, Math.floor(L / 0.5)))}},${s0(1.4)});`);
    }
    if (kind === "stat") {
      // LINE GRAPH THAT JOINS POINTS — nodes pop in, then the line draws to connect
      const gx0 = Math.round(W * 0.12), gx1 = Math.round(W * 0.88), gyB = Math.round(H * 0.9), gTop = Math.round(H * 0.62);
      const n = 6, fr = [0.15, 0.4, 0.3, 0.62, 0.78, 1.0];
      const P2 = fr.map((f, i) => ({ x: Math.round(gx0 + (gx1 - gx0) * i / (n - 1)), y: Math.round(gyB - (gyB - gTop) * f) }));
      sv.push(`<line x1="${gx0 - 20}" y1="${gyB}" x2="${gx1 + 20}" y2="${gyB}" stroke="${rgba(INK, 0.25)}" stroke-width="3" stroke-linecap="round"/>`);
      sv.push(`<line x1="${gx0 - 20}" y1="${gyB}" x2="${gx0 - 20}" y2="${gTop - 20}" stroke="${rgba(INK, 0.18)}" stroke-width="3" stroke-linecap="round"/>`);
      P2.forEach((p, i) => sv.push(`<rect class="${pid}bar" x="${p.x - 10}" y="${p.y}" width="20" height="${gyB - p.y}" rx="5" fill="${rgba(COLZ[i % 4], 0.18)}"/>`));
      const areaPts = `${pt(P2[0].x, gyB)} ` + P2.map((p) => pt(p.x, p.y)).join(" ") + ` ${pt(P2[n - 1].x, gyB)}`;
      sv.push(`<polygon class="${pid}area" points="${areaPts}" fill="${rgba(B, 0.16)}" opacity="0"/>`);
      sv.push(`<polyline class="${pid}line" points="${P2.map((p) => pt(p.x, p.y)).join(" ")}" fill="none" stroke="${B}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="2800" stroke-dashoffset="2800"/>`);
      P2.forEach((p) => sv.push(`<circle class="${pid}nd" cx="${p.x}" cy="${p.y}" r="10" fill="${theme.ground}" stroke="${A}" stroke-width="5"/>`));
      sc.push(`tl.fromTo("#${id} .${pid}bar",{scaleY:0,transformOrigin:"50% 100%"},{scaleY:1,duration:.5,stagger:.07,ease:"power3.out"},${s0(0.5)});`);
      sc.push(`tl.fromTo("#${id} .${pid}nd",{scale:0,transformOrigin:"50% 50%"},{scale:1,duration:.4,stagger:.12,ease:"back.out(2.6)"},${s0(0.7)});`);
      sc.push(`tl.to("#${id} .${pid}line",{strokeDashoffset:0,duration:1.3,ease:"power1.inOut"},${s0(1.1)});`);
      sc.push(`tl.to("#${id} .${pid}area",{opacity:1,duration:.8,ease:"power2.out"},${s0(1.9)});`);
      sc.push(`tl.to("#${id} .${pid}nd",{scale:1.25,transformOrigin:"50% 50%",duration:.9,ease:"sine.inOut",yoyo:true,repeat:${Math.max(1, Math.floor((L - 2.2) / 0.9))},stagger:.1},${s0(2.3)});`);
    }
    if (kind === "text") {
      // GEARS (left) turning + CHECKLIST (right) drawing + a flow line between them
      const gearPoly = (gx, gy, rO, teeth) => {
        const rI = rO * 0.82, out = [], steps = teeth * 2;
        for (let i = 0; i < steps; i++) { const ang = (i / steps) * Math.PI * 2, rr = i % 2 === 0 ? rO : rI; out.push(pt(gx + Math.cos(ang) * rr, gy + Math.sin(ang) * rr)); }
        return out.join(" ");
      };
      // lower-left cluster, clear of the centred headline; interlocking
      const g1x = Math.round(W * 0.15), g1y = Math.round(H * 0.66), gr = Math.round(H * 0.1);
      const g2x = Math.round(g1x + gr * 1.7), g2y = Math.round(g1y - gr * 0.85), gr2 = Math.round(gr * 0.72);
      sv.push(`<g class="${pid}g1"><polygon points="${gearPoly(g1x, g1y, gr, 12)}" fill="${A}"/><circle cx="${g1x}" cy="${g1y}" r="${Math.round(gr * 0.34)}" fill="${theme.ground}"/></g>`);
      sv.push(`<g class="${pid}g2"><polygon points="${gearPoly(g2x, g2y, gr2, 9)}" fill="${B}"/><circle cx="${g2x}" cy="${g2y}" r="${Math.round(gr2 * 0.34)}" fill="${theme.ground}"/></g>`);
      // svgOrigin (user-space) so each gear rotates IN PLACE — px transformOrigin is
      // bbox-relative for a <g> and would swing the gear out of position.
      sc.push(`tl.fromTo("#${id} .${pid}g1",{scale:0},{scale:1,svgOrigin:"${g1x} ${g1y}",duration:.6,ease:"back.out(2)"},${s0(0.4)});`);
      sc.push(`tl.fromTo("#${id} .${pid}g2",{scale:0},{scale:1,svgOrigin:"${g2x} ${g2y}",duration:.6,ease:"back.out(2)"},${s0(0.55)});`);
      sc.push(`tl.to("#${id} .${pid}g1",{rotation:360,svgOrigin:"${g1x} ${g1y}",duration:9,ease:"none",repeat:reps(9)},${s0(1.0)});`);
      sc.push(`tl.to("#${id} .${pid}g2",{rotation:-360,svgOrigin:"${g2x} ${g2y}",duration:7,ease:"none",repeat:reps(7)},${s0(1.0)});`);
      const cxr = Math.round(W * 0.64), cw = Math.round(W * 0.26), rh = Math.round(H * 0.1), cy0 = Math.round(H * 0.32);
      for (let i = 0; i < 3; i++) {
        const ry2 = cy0 + i * (rh + Math.round(H * 0.03));
        sv.push(`<rect class="${pid}row" x="${cxr}" y="${ry2}" width="${cw}" height="${rh}" rx="${Math.round(rh * 0.28)}" fill="${rgba(INK, 0.05)}" stroke="${rgba(INK, 0.1)}" stroke-width="2"/>`);
        const chx = Math.round(cxr + rh * 0.55), chy = Math.round(ry2 + rh * 0.5), cr = Math.round(rh * 0.3);
        sv.push(`<circle class="${pid}row" cx="${chx}" cy="${chy}" r="${cr}" fill="${COLZ[i % 4]}"/>`);
        sv.push(`<path class="${pid}chk" d="M${Math.round(chx - cr * 0.5)} ${chy} l${Math.round(cr * 0.35)} ${Math.round(cr * 0.4)} l${Math.round(cr * 0.7)} -${Math.round(cr * 0.85)}" fill="none" stroke="${theme.ground}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="60" stroke-dashoffset="60"/>`);
        sv.push(`<rect class="${pid}row" x="${Math.round(chx + cr + rh * 0.3)}" y="${chy - 6}" width="${Math.round(cw * 0.58)}" height="12" rx="6" fill="${rgba(INK, 0.22)}"/>`);
      }
      sc.push(`tl.fromTo("#${id} .${pid}row",{x:40,opacity:0},{x:0,opacity:1,duration:.5,stagger:.1,ease:"power3.out"},${s0(0.6)});`);
      sc.push(`tl.to("#${id} .${pid}chk",{strokeDashoffset:0,duration:.4,stagger:.18,ease:"power2.out"},${s0(1.2)});`);
      // flow line from the gear cluster up to the checklist, with a travelling dot
      const fSX = g2x + gr2, fSY = g2y, fEX = cxr - 20, fEY = Math.round(H * 0.5);
      sv.push(`<line x1="${fSX}" y1="${fSY}" x2="${fEX}" y2="${fEY}" stroke="${rgba(INK, 0.25)}" stroke-width="3" stroke-dasharray="6 10"/>`);
      sv.push(`<circle class="${pid}dot" cx="${fSX}" cy="${fSY}" r="8" fill="${X0}"/>`);
      sc.push(`tl.fromTo("#${id} .${pid}dot",{x:0,y:0},{x:${fEX - fSX},y:${fEY - fSY},duration:1.4,ease:"power1.inOut",repeat:${Math.max(1, Math.floor((L - 1) / 1.4))}},${s0(1.0)});`);
    }
    if (kind === "cta") {
      // CONFETTI burst + a CURSOR that clicks + an arrow pointing to the CTA
      const cx = Math.round(W * 0.5), cy = Math.round(H * 0.5), CN = 14;
      for (let i = 0; i < CN; i++) {
        const c = COLZ[i % 4], ty = i % 3;
        if (ty === 0) sv.push(`<circle class="${pid}cf" cx="${cx}" cy="${cy}" r="7" fill="${c}"/>`);
        else if (ty === 1) sv.push(`<rect class="${pid}cf" x="${cx - 6}" y="${cy - 6}" width="12" height="12" rx="3" fill="${c}"/>`);
        else sv.push(`<polygon class="${pid}cf" points="${pt(cx, cy - 8)} ${pt(cx + 7, cy + 5)} ${pt(cx - 7, cy + 5)}" fill="${c}"/>`);
      }
      const dxs = [], dys = [];
      for (let i = 0; i < CN; i++) { const a = (i / CN) * Math.PI * 2; dxs.push(Math.round(Math.cos(a) * (210 + (i % 4) * 40))); dys.push(Math.round(Math.sin(a) * (150 + (i % 3) * 40))); }
      sc.push(`var ${pid}dx=${JSON.stringify(dxs)},${pid}dy=${JSON.stringify(dys)};`);
      sc.push(`tl.fromTo("#${id} .${pid}cf",{x:0,y:0,scale:0,opacity:1,transformOrigin:"50% 50%"},{x:function(i){return ${pid}dx[i];},y:function(i){return ${pid}dy[i];},scale:1,rotation:function(i){return (i%2?1:-1)*180;},opacity:.95,duration:1.0,ease:"power3.out",stagger:.02},${s0(Math.max(0.6, L - 2.0))});`);
      sc.push(`tl.to("#${id} .${pid}cf",{y:"+=70",opacity:0,duration:.8,ease:"power1.in"},${s0(Math.max(1.4, L - 1.0))});`);
      const curx = Math.round(W * 0.6), cury = Math.round(H * 0.64);
      sv.push(`<g class="${pid}cur"><path d="M2 2 L2 50 L15 39 L23 55 L31 51 L23 36 L39 34 Z" fill="${INK}" stroke="${theme.ground}" stroke-width="2"/></g>`);
      sc.push(`tl.set("#${id} .${pid}cur",{x:${curx + 140},y:${cury + 140},opacity:0});`);
      sc.push(`tl.to("#${id} .${pid}cur",{x:${curx},y:${cury},opacity:1,duration:.8,ease:"power2.out"},${s0(0.4)});`);
      sc.push(`tl.to("#${id} .${pid}cur",{scale:0.82,transformOrigin:"0% 0%",duration:.12,ease:"power2.in",yoyo:true,repeat:1},${s0(1.3)});`);
      const ax0 = Math.round(W * 0.33), ay0 = Math.round(H * 0.72), ax1 = Math.round(W * 0.44), ay1 = Math.round(H * 0.57);
      sv.push(`<path class="${pid}arr" d="M${ax0} ${ay0} Q ${ax0 - 30} ${ay1} ${ax1} ${ay1}" fill="none" stroke="${A}" stroke-width="5" stroke-linecap="round" stroke-dasharray="320" stroke-dashoffset="320"/>`);
      sv.push(`<path class="${pid}arr" d="M${ax1} ${ay1} l-16 -3 M${ax1} ${ay1} l-9 13" fill="none" stroke="${A}" stroke-width="5" stroke-linecap="round" stroke-dasharray="44" stroke-dashoffset="44"/>`);
      sc.push(`tl.to("#${id} .${pid}arr",{strokeDashoffset:0,duration:.8,ease:"power2.out"},${s0(0.7)});`);
    }
  } else if (framePack === "riso-press") {
    // RISO PRESS — flat screen-print poster furniture: registration marks, big
    // OVERPRINTING spot-ink circles (multiply blend), hard starbursts, block arrows
    // and a solid block bar chart on proof beats. No gradients, no soft shadows.
    const INK = theme.ink;
    const pt = (x, y) => `${Math.round(x)},${Math.round(y)}`;
    const star = (cx, cy, rO, rI, n) => { const o = []; for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? rI : rO; o.push(pt(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)); } return o.join(" "); };
    const fatArrow = (cx, cy, len, th, hh) => `${pt(cx - len / 2, cy - th / 2)} ${pt(cx + len / 2 - hh, cy - th / 2)} ${pt(cx + len / 2 - hh, cy - th)} ${pt(cx + len / 2, cy)} ${pt(cx + len / 2 - hh, cy + th)} ${pt(cx + len / 2 - hh, cy + th / 2)} ${pt(cx - len / 2, cy + th / 2)}`;
    [[6, 9], [94, 9], [6, 91], [94, 91]].forEach(([px, py]) => {
      const x = Math.round(W * px / 100), y = Math.round(H * py / 100);
      sv.push(`<g class="${pid}rg"><circle cx="${x}" cy="${y}" r="13" fill="none" stroke="${rgba(INK, 0.5)}" stroke-width="1.5"/><line x1="${x - 22}" y1="${y}" x2="${x + 22}" y2="${y}" stroke="${rgba(INK, 0.5)}" stroke-width="1.5"/><line x1="${x}" y1="${y - 22}" x2="${x}" y2="${y + 22}" stroke="${rgba(INK, 0.5)}" stroke-width="1.5"/></g>`);
    });
    sc.push(`tl.fromTo("#${id} .${pid}rg",{opacity:0},{opacity:1,duration:.4,stagger:.05},${s0(0.2)});`);
    const stx = Math.round(W * (kind === "cta" ? 0.5 : 0.9)), sty = Math.round(H * (kind === "cta" ? 0.44 : 0.15)), stR = Math.round(H * 0.09);
    sv.push(`<polygon class="${pid}st" points="${star(stx, sty, stR, stR * 0.5, 12)}" fill="${X0}" stroke="${INK}" stroke-width="3"/>`);
    sc.push(`tl.fromTo("#${id} .${pid}st",{scale:0,transformOrigin:"50% 50%"},{scale:1,duration:.6,ease:"back.out(2)"},${s0(0.6)});`);
    sc.push(`tl.to("#${id} .${pid}st",{rotation:360,svgOrigin:"${stx} ${sty}",duration:22,ease:"none",repeat:reps(22)},${s0(1.2)});`);
    if (kind === "stat" || kind === "text") {
      // solid block bar chart (thick outlined bars, alternating spot inks)
      const bx0 = Math.round(W * 0.58), by = Math.round(H * 0.86), bw = Math.round(W * 0.045), bg = Math.round(W * 0.022);
      const hts = [0.4, 0.72, 0.55, 1.0, 0.82], cols = [A, B, X0, A, B];
      hts.forEach((f, i) => { const x = bx0 + i * (bw + bg), h = Math.round(H * 0.34 * f); sv.push(`<rect class="${pid}bar" x="${x}" y="${by - h}" width="${bw}" height="${h}" fill="${cols[i]}" stroke="${INK}" stroke-width="3"/>`); });
      sv.push(`<line x1="${bx0 - 10}" y1="${by}" x2="${bx0 + 5 * (bw + bg)}" y2="${by}" stroke="${INK}" stroke-width="3"/>`);
      sc.push(`tl.fromTo("#${id} .${pid}bar",{scaleY:0,transformOrigin:"50% 100%"},{scaleY:1,duration:.5,stagger:.09,ease:"power3.out"},${s0(0.8)});`);
    } else {
      // big overprinting spot-ink circles (multiply) on the right — text sits left
      const ocx = Math.round(W * 0.76), ocy = Math.round(H * 0.5), oR = Math.round(H * 0.27);
      sv.push(`<circle class="${pid}oc" cx="${Math.round(ocx - oR * 0.34)}" cy="${Math.round(ocy - oR * 0.18)}" r="${oR}" fill="${A}" opacity="0.9" style="mix-blend-mode:multiply"/>`);
      sv.push(`<circle class="${pid}oc" cx="${Math.round(ocx + oR * 0.34)}" cy="${Math.round(ocy + oR * 0.18)}" r="${oR}" fill="${B}" opacity="0.9" style="mix-blend-mode:multiply"/>`);
      sc.push(`tl.fromTo("#${id} .${pid}oc",{scale:0,transformOrigin:"50% 50%"},{scale:1,duration:.7,stagger:.12,ease:"back.out(1.4)"},${s0(0.3)});`);
    }
    // block arrow, lower-left, pointing right
    sv.push(`<polygon class="${pid}ar" points="${fatArrow(Math.round(W * 0.17), Math.round(H * 0.8), Math.round(W * 0.14), Math.round(H * 0.028), Math.round(H * 0.05))}" fill="${B}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`);
    sc.push(`tl.fromTo("#${id} .${pid}ar",{x:-40,opacity:0},{x:0,opacity:1,duration:.5,ease:"power3.out"},${s0(0.8)});`);
  } else if (framePack === "atelier") {
    // ATELIER — elegant line-art: ONE continuous gold contour that draws itself, a
    // thin drawn frame, a fine turning ring, a serif quotation ornament, and (proof)
    // a single thin line chart. Minimal, hairline, lots of negative space.
    const INK = theme.ink;
    const cy0 = Math.round(H * 0.74);
    const cpath = `M${Math.round(W * 0.06)} ${cy0} C ${Math.round(W * 0.28)} ${Math.round(cy0 - H * 0.14)}, ${Math.round(W * 0.42)} ${Math.round(cy0 + H * 0.12)}, ${Math.round(W * 0.6)} ${Math.round(cy0 - H * 0.02)} S ${Math.round(W * 0.86)} ${Math.round(cy0 - H * 0.16)}, ${Math.round(W * 0.94)} ${Math.round(cy0 - H * 0.05)}`;
    sv.push(`<path class="${pid}ct" d="${cpath}" fill="none" stroke="${A}" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="3200" stroke-dashoffset="3200"/>`);
    sc.push(`tl.to("#${id} .${pid}ct",{strokeDashoffset:0,duration:2.4,ease:"power1.inOut"},${s0(0.3)});`);
    const fm = Math.round(W * 0.05), fT = Math.round(H * 0.09), peri = 2 * ((W - 2 * fm) + (H - 2 * fT));
    sv.push(`<rect class="${pid}fr" x="${fm}" y="${fT}" width="${W - 2 * fm}" height="${H - 2 * fT}" fill="none" stroke="${rgba(INK, 0.26)}" stroke-width="1.5" stroke-dasharray="${peri}" stroke-dashoffset="${peri}"/>`);
    sc.push(`tl.to("#${id} .${pid}fr",{strokeDashoffset:0,duration:2.0,ease:"power2.inOut"},${s0(0.4)});`);
    const rcx = Math.round(W * 0.88), rcy = Math.round(H * 0.19), rr = Math.round(H * 0.08);
    sv.push(`<circle class="${pid}ri" cx="${rcx}" cy="${rcy}" r="${rr}" fill="none" stroke="${rgba(A, 0.7)}" stroke-width="1.2" stroke-dasharray="4 10"/>`);
    sc.push(`tl.fromTo("#${id} .${pid}ri",{scale:0,transformOrigin:"50% 50%"},{scale:1,duration:.8,ease:"power2.out"},${s0(0.6)});`);
    sc.push(`tl.to("#${id} .${pid}ri",{rotation:360,svgOrigin:"${rcx} ${rcy}",duration:24,ease:"none",repeat:reps(24)},${s0(0.9)});`);
    sv.push(`<text class="${pid}or" x="${Math.round(W * 0.09)}" y="${Math.round(H * 0.27)}" font-family="Georgia, serif" font-size="${Math.round(H * 0.17)}" fill="${rgba(B, 0.5)}">&#8220;</text>`);
    sc.push(`tl.fromTo("#${id} .${pid}or",{opacity:0,y:12},{opacity:1,y:0,duration:.8,ease:"power2.out"},${s0(0.7)});`);
    if (kind === "stat" || kind === "text") {
      const gx0 = Math.round(W * 0.22), gx1 = Math.round(W * 0.78), gy = Math.round(H * 0.82), amp = Math.round(H * 0.22);
      const fr2 = [0.15, 0.5, 0.32, 0.72, 0.95], n2 = 5;
      const P3 = fr2.map((f, i) => ({ x: Math.round(gx0 + (gx1 - gx0) * i / (n2 - 1)), y: Math.round(gy - amp * f) }));
      sv.push(`<polyline class="${pid}ln" points="${P3.map((p) => `${p.x},${p.y}`).join(" ")}" fill="none" stroke="${B}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="1800" stroke-dashoffset="1800"/>`);
      P3.forEach((p) => sv.push(`<circle class="${pid}nd" cx="${p.x}" cy="${p.y}" r="4" fill="${theme.ground}" stroke="${A}" stroke-width="2"/>`));
      sc.push(`tl.to("#${id} .${pid}ln",{strokeDashoffset:0,duration:1.6,ease:"power1.inOut"},${s0(0.9)});`);
      sc.push(`tl.fromTo("#${id} .${pid}nd",{scale:0,transformOrigin:"50% 50%"},{scale:1,duration:.4,stagger:.14,ease:"power2.out"},${s0(1.1)});`);
    }
  } else if (framePack === "brut-pop") {
    // BRUT POP — neubrutalist stickers: every shape has a thick BLACK outline and a
    // HARD offset shadow (a black copy offset behind it), rotated a few degrees,
    // snapping in with overshoot then wobbling. Bordered bar chart on proof beats.
    const INK = theme.ink;
    const pt = (x, y) => `${Math.round(x)},${Math.round(y)}`;
    const star = (cx, cy, rO, rI, n) => { const o = []; for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? rI : rO; o.push(pt(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)); } return o.join(" "); };
    const OFF = Math.round(H * 0.012);
    // shape generators: return the inner path/shape string at (x,y) with a fill
    const shapes = {
      star: (x, y, f) => `<polygon points="${star(x, y, H * 0.06, H * 0.03, 10)}" fill="%F" stroke="%S" stroke-width="4"/>`.replace("%F", f).replace("%S", INK),
      bolt: (x, y, f) => `<polygon points="${pt(x - 10, y - 34)} ${pt(x + 14, y - 34)} ${pt(x - 2, y - 4)} ${pt(x + 12, y - 4)} ${pt(x - 14, y + 36)} ${pt(x - 4, y - 2)} ${pt(x - 18, y - 2)}" fill="${f}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`,
      circ: (x, y, f) => `<circle cx="${x}" cy="${y}" r="${Math.round(H * 0.05)}" fill="${f}" stroke="${INK}" stroke-width="4"/>`,
      bubble: (x, y, f) => `<path d="M${x - 44} ${y - 30} h88 a10 10 0 0 1 10 10 v30 a10 10 0 0 1 -10 10 h-58 l-18 20 v-20 h-12 a10 10 0 0 1 -10 -10 v-30 a10 10 0 0 1 10 -10 z" fill="${f}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`,
      tag: (x, y, f) => `<rect x="${x - 40}" y="${y - 20}" width="80" height="40" rx="8" fill="${f}" stroke="${INK}" stroke-width="4"/>`,
    };
    const COLS = [A, B, X0, X1];
    // placements per kind (margins, avoiding centred headline band 30-70% x, 38-62% y)
    const layoutMap = {
      // hook headline is left-anchored, so keep the left flank to the far corners
      // only and fill the empty right half with stickers.
      hook: [["star", 10, 16, 0, -8], ["circ", 9, 84, 1, 6], ["bolt", 68, 22, 2, 10], ["star", 90, 42, 3, 9], ["bubble", 82, 66, 0, -4], ["tag", 64, 82, 1, -7]],
      stat: [["star", 9, 22, 0, -8], ["bolt", 91, 20, 1, 8], ["circ", 90, 76, 2, -6], ["star", 8, 78, 3, 7]],
      text: [["bolt", 10, 24, 1, -9], ["star", 90, 22, 0, 8], ["tag", 88, 74, 2, -6], ["bubble", 12, 72, 3, 5]],
      cta: [["star", 12, 22, 0, -10], ["bolt", 88, 22, 1, 10], ["circ", 14, 74, 2, 8], ["star", 86, 74, 3, -8], ["bubble", 50, 16, 0, 4], ["tag", 50, 86, 1, -4]],
      asset: [["star", 9, 20, 0, -8], ["bolt", 91, 22, 1, 9]],
    };
    const items = layoutMap[kind] || layoutMap.asset;
    items.forEach(([shp, px, py, ci, rot]) => {
      const x = Math.round(W * px / 100), y = Math.round(H * py / 100), f = COLS[ci % 4];
      const inner = shapes[shp](x, y, f);
      // shadow = a black copy of the same shape, translated by OFF
      const shadow = shapes[shp](x, y, INK).replace(/stroke-width="4"/, 'stroke-width="0"');
      sv.push(`<g class="${pid}sk" data-rot="${rot}"><g transform="translate(${OFF},${OFF})">${shadow}</g>${inner}</g>`);
    });
    sc.push(`tl.fromTo("#${id} .${pid}sk",{scale:0,rotation:function(i,el){return +el.getAttribute("data-rot");},transformOrigin:"50% 50%"},{scale:1,rotation:function(i,el){return +el.getAttribute("data-rot");},duration:.5,stagger:.08,ease:"back.out(2.4)"},${s0(0.3)});`);
    sc.push(`tl.to("#${id} .${pid}sk",{rotation:"+=5",duration:1.3,ease:"sine.inOut",yoyo:true,repeat:${Math.max(1, Math.floor((L - 0.8) / 1.3))},stagger:.09},${s0(1.1)});`);
    if (kind === "stat" || kind === "text") {
      // bordered bar chart with hard offset shadows
      const bx0 = Math.round(W * 0.6), by = Math.round(H * 0.82), bw = Math.round(W * 0.05), bg = Math.round(W * 0.02);
      const hts = [0.45, 0.72, 0.58, 1.0], cols = [A, B, X0, X1];
      hts.forEach((f, i) => {
        const x = bx0 + i * (bw + bg), h = Math.round(H * 0.3 * f);
        sv.push(`<rect x="${x + OFF}" y="${by - h + OFF}" width="${bw}" height="${h}" fill="${INK}"/>`);
        sv.push(`<rect class="${pid}bar" x="${x}" y="${by - h}" width="${bw}" height="${h}" fill="${cols[i]}" stroke="${INK}" stroke-width="4"/>`);
      });
      sc.push(`tl.fromTo("#${id} .${pid}bar",{scaleY:0,transformOrigin:"50% 100%"},{scaleY:1,duration:.5,stagger:.1,ease:"back.out(1.6)"},${s0(0.8)});`);
    }
  } else if (framePack === "sketchnote") {
    // SKETCHNOTE — hand-drawn doodle journal, in its own module (same pattern as
    // the terminal packs): washi tape, sparkle stars, spiral, ink splats, margin
    // ticks on every scene; lightbulb + paper plane (hook), wobbly hand graph +
    // bullseye (stat), checklist + coffee steam (text), bunting + pen-circle +
    // curly arrows (cta). All hand-authored, all animated.
    const { buildSketchnoteOrnaments } = require("./scene_kit_sketchnote_ornaments");
    const t = buildSketchnoteOrnaments({ kind, id, pid, T, L, seed, theme, dims, s0, rgba });
    sv.push(...t.sv); dv.push(...t.dv); sc.push(...t.sc);
  } else if (framePack === "terminal-amber" || framePack === "terminal-green") {
    // RETRO TERMINAL — built in its own module (scene_kit_terminal_ornaments.js)
    // to avoid growing this already-large file further; see that file for the
    // full design notes (typed CLI session, activity ring, joining-the-dots
    // chart, CRT boot flicker).
    const { buildRetroTerminalOrnaments } = require("./scene_kit_terminal_ornaments");
    const t = buildRetroTerminalOrnaments({ kind, id, pid, T, L, seed, theme, dims, s0, rgba, esc });
    sv.push(...t.sv); dv.push(...t.dv); sc.push(...t.sc);
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
    parts.push(`<div id="kfbgGlow" class="clip" data-start="0" data-duration="${D}" data-track-index="1" data-layout-allow-occlusion style="background:radial-gradient(38% 46% at ${gx1}% ${gy1}%, ${rgba(accent, 0.24)}, transparent 70%), radial-gradient(34% 42% at ${gx2}% ${gy2}%, ${rgba(accent2, 0.17)}, transparent 72%); filter:blur(8px);"></div>`);
  }

  // ambient particle field (authored — drifts on a finite-repeat tween). The
  // seed offsets the distribution so no two videos share the same star pattern.
  const N = 18;
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
  const gridCol = rgba(theme.ink, gradients ? 0.055 : 0.075);
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
      ? [...w].map((ch) => `<span class="kfc">${esc(ch)}</span>`).join("")
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
    case "scribble": {
      // sketchnote: a yellow highlighter swipe THROUGH the word + a red-pen wavy
      // underline beneath it. NOT text-decoration — the typewriter entrance splits
      // words into inline-block char spans, and text-decoration doesn't propagate
      // into atomic inlines (the underline silently vanishes). A repeating SVG
      // squiggle on ::after renders regardless of the span structure.
      const wave = `<svg xmlns='http://www.w3.org/2000/svg' width='12' height='7' viewBox='0 0 12 7'><path d='M0 4.5 Q 3 1 6 4.5 T 12 4.5' fill='none' stroke='${a}' stroke-width='2.4' stroke-linecap='round'/></svg>`;
      return `${sel}{color:${theme.ink};background:linear-gradient(transparent 52%,${rgba(a2, 0.55)} 52%,${rgba(a2, 0.55)} 92%,transparent 92%);}` +
        `${sel}::after{content:"";display:block;height:.15em;margin-top:.06em;background-image:url("data:image/svg+xml,${encodeURIComponent(wave)}");background-repeat:repeat-x;background-size:auto 100%;}`;
    }
    case "gradient":
    default: {
      const base = theme.emphasisCss || `background:linear-gradient(100deg,${a},${a2});-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:${a};`;
      // SHINE HEADROOM (master S2's move): oversize the clipped gradient so the
      // one-shot shine sweep (backgroundPosition 120%→0%, added in Pass 3) has
      // room to travel across the emphasis word.
      const withRoom = /gradient\(/.test(base)
        ? `${base}${base.trim().endsWith(";") ? "" : ";"}background-size:220% 100%;`
        : base;
      return `${sel}{${withRoom}}`;
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
function fitBig(text, baseBig, maxCh, maxLines = 3, minRatio = 0.52) {
  const s = String(text || "").trim();
  if (!s) return baseBig;
  const len = s.length;
  const longest = s.split(/\s+/).reduce((m, w) => Math.max(m, w.length), 1);
  // Text area scales with font²; to fit `len` chars in maxCh×maxLines, font ~
  // sqrt(capacity/len). Also bound so the longest word fits maxCh on one line.
  const capScale = Math.sqrt((maxCh * maxLines) / len);
  const wordScale = maxCh / longest;
  const scale = Math.min(1, capScale, wordScale);
  return Math.max(Math.round(baseBig * minRatio), Math.round(baseBig * scale));
}

function archHook(scene, ctx) {
  const { theme, id, T, L, track, dims } = ctx;
  const accentText = theme.emphasisCss || (theme.gradients
    ? `background:linear-gradient(100deg,${theme.accent},${theme.accent2});-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:${theme.accent};`
    : `color:${theme.accent};`);
  const big = Math.round((dims.width >= dims.height ? 92 : 66) * (theme.textfx.sizeScale || 1));
  const showKicker = theme.layout.kicker, showUnderline = theme.layout.underline;
  const html = `<div id="${id}" class="clip" data-start="${T}" data-duration="${L}" data-track-index="${track}" style="opacity:0;">
  <div style="position:absolute;left:7%;right:7%;top:50%;transform:translateY(-50%);">
    ${showKicker ? `<span id="${id}k" class="kicker" style="opacity:0;display:inline-flex;align-items:center;gap:10px;padding:8px 16px;border-radius:9999px;background:${rgba(theme.ground, 0.86)};border:1px solid ${rgba(theme.accent, 0.35)};color:${theme.accent};font:700 15px/1 ${cssFont(theme)};letter-spacing:.2em;text-transform:uppercase;"><span style="width:8px;height:8px;border-radius:50%;background:${theme.accent};"></span>${esc(ctx.kicker || "KEYFRAME")}</span>` : ""}
    <h1 style="margin-top:18px;font:800 ${fitBig(scene.headline, big, 14)}px/0.99 ${cssFont(theme)};letter-spacing:-0.02em;color:${theme.ink};max-width:14ch;"><style>${emphasisBlock(theme, id)}</style>${headlineSpans(scene.headline, scene.emphasis, theme)}</h1>
    ${showUnderline ? `<div id="${id}u" style="height:5px;width:${Math.round(dims.width * 0.27)}px;max-width:80%;margin-top:22px;border-radius:3px;background:${theme.accent};transform:scaleX(0);transform-origin:left;"></div>` : ""}
    ${scene.subtext ? `<p id="${id}s" style="opacity:0;margin-top:16px;font:500 ${Math.round(big * 0.3)}px/1.45 ${cssFont(theme)};color:${theme.dim};max-width:42ch;">${esc(scene.subtext)}</p>` : ""}
  </div>
</div>`;
  const s = [
    `tl.set("#${id}",{opacity:1},${T});`,
    showKicker ? `tl.fromTo("#${id}k",{opacity:0,y:14},{opacity:1,y:0,duration:0.5},${r(T + 0.25)});` : "",
    `textIn("${theme.textfx.enter}","#${id} .kfw","#${id} .kfc",${r(T + 0.45)},0.09);`,
    scene.subtext ? `tl.fromTo("#${id}s",{opacity:0,y:20},{opacity:1,y:0,duration:0.55},${r(T + 1.05)});` : "",
    showUnderline ? `tl.fromTo("#${id}u",{scaleX:0,transformOrigin:"left"},{scaleX:1,duration:0.7,ease:"power2.inOut"},${r(T + 1.1)});` : "",
    ctx.isLast ? "" : `exitScene("#${id}",${r(T + L - 0.35)},${r(T + L)});`,
  ].filter(Boolean).join("\n");
  return { html, script: s };
}

function archStat(scene, ctx) {
  const { theme, id, T, L, track, dims } = ctx;
  // Packs can opt out of the giant-number + progress-ring treatment (it read as
  // "the same number thing" across every template). Then a proof scene renders as
  // a clean centered display headline and the pack's own ornaments carry any viz.
  if (theme.layout.stat === "headline") {
    const bigH = Math.round((dims.width >= dims.height ? 84 : 62) * (theme.textfx.sizeScale || 1));
    const html = `<div id="${id}" class="clip" data-start="${T}" data-duration="${L}" data-track-index="${track}" style="opacity:0;">
  <div style="position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;align-items:center;gap:20px;text-align:center;padding:0 9%;">
    <h2 style="font:800 ${fitBig(scene.headline, bigH, 15)}px/1.0 ${cssFont(theme)};letter-spacing:-0.02em;color:${theme.ink};max-width:15ch;margin:0;"><style>${emphasisBlock(theme, id)}</style>${headlineSpans(scene.headline, scene.emphasis, theme)}</h2>
    ${scene.subtext ? `<div id="${id}s" style="opacity:0;font:500 ${Math.round(bigH * 0.32)}px/1.4 ${cssFont(theme)};color:${theme.dim};max-width:40ch;">${esc(scene.subtext)}</div>` : ""}
  </div>
</div>`;
    const s = [
      `tl.set("#${id}",{opacity:1},${T});`,
      `textIn("${theme.textfx.enter}","#${id} .kfw","#${id} .kfc",${r(T + 0.35)},0.07);`,
      scene.subtext ? `tl.fromTo("#${id}s",{opacity:0,y:16},{opacity:1,y:0,duration:0.5},${r(T + 0.95)});` : "",
      ctx.isLast ? "" : `exitScene("#${id}",${r(T + L - 0.35)},${r(T + L)});`,
    ].filter(Boolean).join("\n");
    return { html, script: s };
  }
  // derive a number from the headline/emphasis, else a default
  const num = pickNumber(scene) || { value: 95, suffix: "%" };
  const big = dims.width >= dims.height ? 128 : 92;
  const cardBg = theme.gradients ? `linear-gradient(180deg,${mix(theme.ground, "#ffffff", theme.isDark ? 0.07 : 0.02)},${theme.ground})` : mix(theme.ground, theme.isDark ? "#ffffff" : "#000000", 0.03);
  // PROGRESS RING (amazon-premium's arc, full-frame): a track circle + an accent
  // arc that draws to a REAL fill while the counter runs — the number resolves
  // on two channels at once. % metrics fill to their own value; others to ~72%.
  const rr = Math.round(Math.min(dims.width, dims.height) * 0.285);
  const rcx = Math.round(dims.width / 2), rcy = Math.round(dims.height * 0.44);
  const circ = Math.round(2 * Math.PI * rr);
  const frac = num.suffix === "%" ? clamp(num.value, 8, 100) / 100 : 0.72;
  const ringStroke = theme.gradients ? `url(#${id}rg)` : theme.accent;
  const ring = `<svg viewBox="0 0 ${dims.width} ${dims.height}" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;" data-layout-allow-occlusion>`
    + (theme.gradients ? `<defs><linearGradient id="${id}rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${theme.accent}"/><stop offset="1" stop-color="${theme.accent2 || theme.accent}"/></linearGradient></defs>` : "")
    + `<circle cx="${rcx}" cy="${rcy}" r="${rr}" fill="none" stroke="${rgba(theme.ink, 0.13)}" stroke-width="${theme.gradients ? 4 : 6}"/>`
    + `<circle id="${id}ring" cx="${rcx}" cy="${rcy}" r="${rr}" fill="none" stroke="${ringStroke}" stroke-width="${theme.gradients ? 5 : 6}" stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${circ}" transform="rotate(-90 ${rcx} ${rcy})"/>`
    + `</svg>`;
  const html = `<div id="${id}" class="clip" data-start="${T}" data-duration="${L}" data-track-index="${track}" style="opacity:0;display:flex;align-items:center;justify-content:center;">
  ${ring}
  <div class="kfstage" style="display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center;padding:0 8%;width:100%;">
    <div id="${id}n" class="kfnum" style="font:800 ${big}px/1 ${cssFont(theme)};letter-spacing:-0.04em;color:${theme.accent};">0${esc(num.suffix || "")}</div>
    <h2 style="font:700 ${Math.round(big * 0.26)}px/1.15 ${cssFont(theme)};color:${theme.ink};max-width:18ch;margin:0;"><style>#${id} .kfacc{color:${theme.accent2};}</style>${headlineSpans(scene.headline, scene.emphasis, theme)}</h2>
    ${scene.subtext ? `<div id="${id}s" style="opacity:0;font:500 ${Math.round(big * 0.18)}px/1.4 ${cssFont(theme)};color:${theme.dim};max-width:40ch;">${esc(scene.subtext)}</div>` : ""}
  </div>
</div>`;
  const fmt = num.suffix === "%" ? `function(v){return v+"%";}` : (num.prefix ? `function(v){return ${JSON.stringify(num.prefix)}+v.toLocaleString();}` : `function(v){return v.toLocaleString()+${JSON.stringify(num.suffix || "")};}`);
  const s = [
    `tl.set("#${id}",{opacity:1},${T});`,
    `pushIn("#${id} .kfstage",${T},${r(L - 0.4)},1.0,1.04);`,
    `countUp("${id}n",${num.value},${r(T + 0.3)},${r(Math.min(1.6, L - 1))},${fmt});`,
    `tl.to("#${id}ring",{strokeDashoffset:${Math.round(circ * (1 - frac))},duration:${r(Math.min(1.6, L - 1))},ease:"power2.out"},${r(T + 0.3)});`,
    `textIn("${theme.textfx.enter}","#${id} .kfw","#${id} .kfc",${r(T + 0.45)},0.07);`,
    scene.subtext ? `tl.fromTo("#${id}s",{opacity:0,y:16},{opacity:1,y:0,duration:0.5},${r(T + 0.9)});` : "",
    ctx.isLast ? "" : `exitScene("#${id}",${r(T + L - 0.35)},${r(T + L)});`,
  ].filter(Boolean).join("\n");
  return { html, script: s };
}

function archCta(scene, ctx) {
  const { theme, id, T, L, track, dims } = ctx;
  const big = Math.round((dims.width >= dims.height ? 78 : 60) * (theme.textfx.sizeScale || 1));
  const btnBg = theme.gradients ? `linear-gradient(180deg,${theme.accent2 || theme.accent},${theme.accent})` : theme.accent;
  const btnInk = lum(theme.accent) > 150 ? "#15140F" : "#FFFFFF";
  const accentText = theme.emphasisCss || (theme.gradients ? `background:linear-gradient(100deg,${theme.accent},${theme.accent2});-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:${theme.accent};` : `color:${theme.accent};`);
  const html = `<div id="${id}" class="clip" data-start="${T}" data-duration="${L}" data-track-index="${track}" style="opacity:0;">
  ${theme.gradients ? `<div id="${id}g" class="clip" data-layout-allow-occlusion style="position:absolute;left:50%;top:46%;width:46%;height:60%;transform:translate(-50%,-50%);border-radius:50%;filter:blur(54px);background:radial-gradient(circle,${rgba(theme.accent, 0.30)},transparent 66%);"></div>` : ""}
  <div style="position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;align-items:center;gap:24px;text-align:center;padding:0 8%;">
    <h2 style="font:800 ${fitBig(scene.headline, big, 16)}px/1.02 ${cssFont(theme)};letter-spacing:-0.02em;color:${theme.ink};max-width:16ch;"><style>${emphasisBlock(theme, id)}</style>${headlineSpans(scene.headline, scene.emphasis, theme)}</h2>
    ${scene.subtext ? `<div id="${id}b" class="pill" style="opacity:0;display:inline-flex;align-items:center;gap:11px;padding:16px 36px;border-radius:9999px;background:${btnBg};color:${btnInk};font:800 ${Math.round(big * 0.34)}px/1 ${cssFont(theme)};">${esc(scene.subtext)} <span style="width:11px;height:11px;border-right:3px solid ${btnInk};border-top:3px solid ${btnInk};transform:rotate(45deg);display:inline-block;"></span></div>` : ""}
  </div>
</div>`;
  const s = [
    `tl.set("#${id}",{opacity:1},${T});`,
    theme.gradients ? `tl.fromTo("#${id}g",{opacity:0,scale:0.85},{opacity:1,scale:1,duration:0.8},${r(T + 0.05)});` : "",
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
  const big = Math.round((dims.width >= dims.height ? 68 : 52) * (theme.textfx.sizeScale || 1));
  const accentText = theme.emphasisCss || (theme.gradients ? `background:linear-gradient(100deg,${theme.accent},${theme.accent2});-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:${theme.accent};` : `color:${theme.accent};`);
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

// ── PREMIUM COMPONENT SYSTEM ────────────────────────────────────────────────
// Per-pack CARD CHROME — the single most important premium primitive. Gives the
// feature grid / stat cluster a designed surface instead of a boxy div, keyed to
// the pack's character:
//   • flat packs      → hard border + offset SOLID shadow (neo-brutal card)
//   • dark gradient    → dark translucent GLASS (blur + hairline + deep shadow)
//   • light gradient   → bright FROSTED GLASS (specular edge, Apple-grade)
function cardChrome(theme) {
  if (!theme.gradients) {
    const bg = theme.isDark ? mix(theme.ground, "#ffffff", 0.07) : "#FFFFFF";
    return { css: `background:${bg};border:3px solid ${theme.ink};box-shadow:7px 7px 0 ${theme.accent};border-radius:9px;`, glass: false };
  }
  if (theme.isDark) {
    return { css: `background:${rgba("#ffffff", 0.055)};border:1px solid ${rgba("#ffffff", 0.14)};box-shadow:0 24px 54px ${rgba("#000000", 0.42)},inset 0 1px 0 ${rgba("#ffffff", 0.13)};backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-radius:16px;`, glass: true };
  }
  return { css: `background:linear-gradient(150deg,${rgba("#ffffff", 0.6)},${rgba("#ffffff", 0.16)});border:1px solid ${rgba("#ffffff", 0.72)};box-shadow:0 22px 52px ${rgba(theme.accent, 0.16)},inset 0 1px 0 ${rgba("#ffffff", 0.85)};backdrop-filter:blur(15px);-webkit-backdrop-filter:blur(15px);border-radius:18px;`, glass: true };
}

// Duotone line glyphs for feature cards (stroke = accent). Cycled per card.
const FEAT_GLYPHS = [
  `<path d="M13 2 4 14h6l-1 8 9-12h-6z"/>`,                                              // bolt
  `<path d="M12 3 3 8l9 5 9-5z"/><path d="M3 13l9 5 9-5" opacity=".5"/>`,                // layers
  `<path d="M20 6 9 17l-5-5"/>`,                                                          // check
  `<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3" opacity=".55"/>`,      // orbit
  `<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 12h6M12 9v6" opacity=".6"/>`, // add
  `<path d="M3 12h4l3 8 4-16 3 8h4"/>`,                                                   // pulse
];
// Split "Title — description" / "Title: description" into [title, desc].
function splitCardText(s) {
  const m = String(s || "").trim().match(/^(.{2,42}?)\s*[—–:]\s+(.+)$/);
  return m ? [m[1].trim(), m[2].trim()] : [String(s || "").trim(), ""];
}

// FEATURE GRID — 2–3 component cards (icon chip + index + title + optional desc)
// in a flex row with per-pack chrome. The rich "Feature-Spotlight" scene the LLM
// composer builds, now deterministic and on-brand for EVERY pack — a bullet scene
// becomes a designed card grid (aurora's step cards, blockframe's feature cards)
// instead of a flat list. Siblings live in a flex container with gap (occlusion-
// safe). Cards pop in on a stagger, then breathe.
function archFeatureGrid(scene, ctx) {
  const { theme, id, T, L, track, dims } = ctx;
  const land = dims.width >= dims.height;
  const big = Math.round((land ? 50 : 42) * (theme.textfx.sizeScale || 1));
  const items = (Array.isArray(scene.bullets) ? scene.bullets.filter(Boolean) : []).slice(0, 3);
  const ch = cardChrome(theme);
  const gap = land ? 26 : 15;
  const pad = land ? 30 : 22;
  const iconSz = land ? 54 : 46;
  const accs = [theme.accent, theme.accent2, theme.extras[0] || theme.accent];
  const cards = items.map((b, i) => {
    const [title, desc] = splitCardText(b);
    const accer = accs[i % accs.length];
    const glyph = FEAT_GLYPHS[(i + (scene.headline || "").length) % FEAT_GLYPHS.length];
    return `<div class="kffc" style="opacity:0;flex:1;min-width:0;${ch.css}padding:${pad}px;display:flex;flex-direction:column;gap:${land ? 13 : 8}px;position:relative;overflow:hidden;">`
      + `<span style="position:absolute;top:${pad}px;right:${pad}px;font:700 ${Math.round(big * 0.26)}px/1 ${theme.displayStack};letter-spacing:.08em;color:${rgba(accer, 0.42)};">0${i + 1}</span>`
      + `<div style="width:${iconSz}px;height:${iconSz}px;border-radius:${Math.round(iconSz * 0.28)}px;background:${rgba(accer, 0.16)};border:1px solid ${rgba(accer, 0.42)};display:grid;place-items:center;flex:none;"><svg viewBox="0 0 24 24" width="${Math.round(iconSz * 0.5)}" height="${Math.round(iconSz * 0.5)}" fill="none" stroke="${accer}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${glyph}</svg></div>`
      + `<div style="font:700 ${Math.round(big * 0.46)}px/1.15 ${theme.displayStack};letter-spacing:-0.01em;color:${theme.ink};margin-top:${land ? 6 : 3}px;">${esc(title)}</div>`
      + (desc ? `<div style="font:500 ${Math.round(big * 0.3)}px/1.45 ${cssFont(theme)};color:${theme.dim};">${esc(desc)}</div>` : "")
      + `</div>`;
  }).join("");
  const html = `<div id="${id}" class="clip" data-start="${T}" data-duration="${L}" data-track-index="${track}" style="opacity:0;">
  <div style="position:absolute;left:6%;right:6%;top:50%;transform:translateY(-50%);">
    <div style="width:54px;height:5px;border-radius:3px;background:${theme.accent};margin-bottom:16px;"></div>
    <h2 style="font:800 ${fitBig(scene.headline, big, 24)}px/1.05 ${cssFont(theme)};letter-spacing:-0.02em;color:${theme.ink};max-width:24ch;margin-bottom:${land ? 26 : 16}px;"><style>${emphasisBlock(theme, id)}</style>${headlineSpans(scene.headline, scene.emphasis, theme)}</h2>
    <div id="${id}g" style="display:flex;flex-direction:${land ? "row" : "column"};gap:${gap}px;align-items:stretch;">${cards}</div>
  </div>
</div>`;
  const s = [
    `tl.set("#${id}",{opacity:1},${T});`,
    `textIn("${theme.textfx.enter}","#${id} .kfw","#${id} .kfc",${r(T + 0.25)},0.06);`,
    `tl.fromTo("#${id} .kffc",{opacity:0,y:36,scale:0.93},{opacity:1,y:0,scale:1,duration:0.62,stagger:0.14,ease:"back.out(1.5)"},${r(T + 0.6)});`,
    `tl.to("#${id} .kffc",{y:"-=8",duration:2.0,ease:"sine.inOut",yoyo:true,stagger:0.16,repeat:sreps(${r(L - 1.4)},2.0)},${r(T + 1.6)});`,
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
  const land = dims.width >= dims.height;
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

// PROOF ROW (showcase master S7 / amazon-premium S3) — 2–3 chromed stat cards,
// each with its own count-up and a corner progress arc, entering on a 3D
// rotationY stagger and breathing while they hold. Triggered when ≥2 bullets
// carry strong metrics — the multi-metric proof beat the single-stat archetype
// can't stage. Cards live in a flex row with gap (occlusion-safe by layout).
function archProofStats(scene, ctx) {
  const { theme, id, T, L, track, dims } = ctx;
  const land = dims.width >= dims.height;
  const big = Math.round((land ? 50 : 42) * (theme.textfx.sizeScale || 1));
  const ch = cardChrome(theme);
  const accs = [theme.accent, theme.accent2, theme.extras[0] || theme.accent];
  const items = (Array.isArray(scene.bullets) ? scene.bullets.filter(Boolean) : [])
    .map((b) => ({ b: String(b), num: pickNumber({ headline: String(b) }) }))
    .filter((x) => x.num).slice(0, 3)
    .map((x, k) => ({
      ...x,
      // label = the bullet with its metric token removed (falls back to the bullet)
      label: x.b.replace(/[₹$€£]?\s?\d[\d,]*\s?(?:%|x|\+|M|K|B|hrs?|hours?|days?)?/i, "").replace(/^[\s,—–:.-]+|[\s,—–:.-]+$/g, "") || x.b,
      frac: x.num.suffix === "%" ? clamp(x.num.value, 8, 100) / 100 : 0.58 + k * 0.14,
    }));
  const numSize = Math.round((land ? 74 : 54) * (theme.textfx.sizeScale || 1));
  const arcR = land ? 44 : 36;
  const arcC = Math.round(2 * Math.PI * arcR);
  const cards = items.map((x, k) => {
    const A = accs[k % accs.length];
    return `<div class="kfpc stat" style="opacity:0;flex:1;min-width:0;position:relative;overflow:hidden;${ch.css}padding:${land ? 30 : 20}px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${land ? 12 : 8}px;text-align:center;">`
      + `<svg width="${arcR * 2 + 12}" height="${arcR * 2 + 12}" viewBox="0 0 ${arcR * 2 + 12} ${arcR * 2 + 12}" style="position:absolute;top:-${Math.round(arcR * 0.6)}px;right:-${Math.round(arcR * 0.6)}px;opacity:.5;">`
      + `<circle cx="${arcR + 6}" cy="${arcR + 6}" r="${arcR}" fill="none" stroke="${rgba(theme.ink, 0.12)}" stroke-width="6"/>`
      + `<circle id="${id}a${k}" cx="${arcR + 6}" cy="${arcR + 6}" r="${arcR}" fill="none" stroke="${A}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${arcC}" stroke-dashoffset="${arcC}" transform="rotate(-90 ${arcR + 6} ${arcR + 6})"/></svg>`
      + `<div id="${id}n${k}" class="kfnum" style="font:800 ${numSize}px/1 ${theme.displayStack};letter-spacing:-0.03em;color:${A};">0${esc(x.num.suffix || "")}</div>`
      + `<div style="font:600 ${Math.round(big * 0.34)}px/1.3 ${cssFont(theme)};color:${theme.dim};max-width:92%;">${esc(x.label)}</div>`
      + `</div>`;
  }).join("");
  const html = `<div id="${id}" class="clip" data-start="${T}" data-duration="${L}" data-track-index="${track}" style="opacity:0;">
  <div style="position:absolute;left:6%;right:6%;top:50%;transform:translateY(-50%);">
    <div style="width:54px;height:5px;border-radius:3px;background:${theme.accent};margin-bottom:16px;"></div>
    <h2 style="font:800 ${fitBig(scene.headline, big, 24)}px/1.05 ${cssFont(theme)};letter-spacing:-0.02em;color:${theme.ink};max-width:24ch;"><style>${emphasisBlock(theme, id)}</style>${headlineSpans(scene.headline, scene.emphasis, theme)}</h2>
    <div id="${id}g" style="display:flex;flex-direction:${land ? "row" : "column"};gap:${land ? 26 : 14}px;align-items:stretch;margin-top:${land ? 28 : 16}px;">${cards}</div>
  </div>
</div>`;
  const fmtFor = (n) => n.suffix === "%" ? `function(v){return v+"%";}` : (n.prefix ? `function(v){return ${JSON.stringify(n.prefix)}+v.toLocaleString();}` : `function(v){return v.toLocaleString()+${JSON.stringify(n.suffix || "")};}`);
  const cdur = r(Math.min(1.3, Math.max(0.5, L - 1.4)));
  const s = [
    `tl.set("#${id}",{opacity:1},${T});`,
    `textIn("${theme.textfx.enter}","#${id} .kfw","#${id} .kfc",${r(T + 0.25)},0.06);`,
    `tl.fromTo("#${id} .kfpc",{opacity:0,y:56,rotationY:26,transformPerspective:1400},{opacity:1,y:0,rotationY:0,duration:0.7,stagger:0.16,ease:"expo.out"},${r(T + 0.55)});`,
    ...items.map((x, k) => `countUp("${id}n${k}",${x.num.value},${r(T + 0.85 + k * 0.16)},${cdur},${fmtFor(x.num)});`),
    ...items.map((x, k) => `tl.to("#${id}a${k}",{strokeDashoffset:${Math.round(arcC * (1 - x.frac))},duration:${cdur},ease:"power2.out"},${r(T + 0.9 + k * 0.16)});`),
    L >= 3.4 ? `tl.to("#${id} .kfpc",{y:-10,duration:1.4,ease:"sine.inOut",yoyo:true,stagger:0.12,repeat:sreps(${r(Math.max(1.4, L - 2.2))},1.4)},${r(T + 2.1)});` : "",
    ctx.isLast ? "" : `exitScene("#${id}",${r(T + L - 0.35)},${r(T + L)});`,
  ].filter(Boolean).join("\n");
  return { html, script: s };
}

// DIFFERENTIATOR STRIKE-LIST (showcase master S8) — the "No editor. No
// timeline. Just words." beat: each negation bullet slides in as display type,
// gets struck through by a drawing accent bar, the struck stack dims, and the
// headline ANSWER pops with a hand-drawn underline. Triggered only when every
// bullet opens with a negation word, so it can never eat a feature list.
function archStrikeList(scene, ctx) {
  const { theme, id, T, L, track, dims } = ctx;
  const land = dims.width >= dims.height;
  const rows = (Array.isArray(scene.bullets) ? scene.bullets.filter(Boolean) : []).slice(0, 3).map(String);
  const longest = rows.reduce((m, b) => Math.max(m, b.length), 8);
  const big = Math.round((land ? 64 : 48) * (theme.textfx.sizeScale || 1));
  const rowFs = fitBig("x".repeat(longest), big, 18, 1);
  const ansFs = fitBig(scene.headline, Math.round(big * 1.08), 16, 2);
  const kk = Math.min(1, (L - 0.9) / 3.4);          // beat compression for short scenes
  const bt = (f) => r(T + f * kk);
  const uw = Math.round(dims.width * (land ? 0.3 : 0.5));
  const strikeH = Math.max(4, Math.round(rowFs * 0.09));
  const rowHtml = rows.map((b, i2) =>
    // width:fit-content — the strike bar spans ITS row's text (the master's
    // shrink-wrapped .strike), not the whole content column.
    `<div style="position:relative;width:fit-content;max-width:100%;margin-top:${i2 ? Math.round(rowFs * 0.18) : 0}px;">`
    + `<div class="${id}r" style="opacity:0;font:800 ${rowFs}px/1.06 ${theme.displayStack};letter-spacing:-0.02em;color:${theme.ink};">${esc(b)}</div>`
    + `<div class="${id}st" data-layout-allow-occlusion style="position:absolute;left:0;top:50%;margin-top:-${Math.round(strikeH / 2)}px;height:${strikeH}px;width:100%;border-radius:999px;background:${theme.accent2 || theme.accent};transform:scaleX(0);${theme.gradients ? `box-shadow:0 0 ${Math.round(rowFs * 0.2)}px ${rgba(theme.accent2 || theme.accent, 0.6)};` : ""}"></div>`
    + `</div>`).join("");
  const html = `<div id="${id}" class="clip" data-start="${T}" data-duration="${L}" data-track-index="${track}" style="opacity:0;">
  <div style="position:absolute;left:8%;right:8%;top:50%;transform:translateY(-50%);">
    ${rowHtml}
    <div id="${id}ans" style="opacity:0;position:relative;margin-top:${Math.round(rowFs * 0.42)}px;">
      <h2 style="font:800 ${ansFs}px/1.04 ${cssFont(theme)};letter-spacing:-0.02em;color:${theme.ink};max-width:18ch;"><style>${emphasisBlock(theme, id)}</style>${headlineSpans(scene.headline, scene.emphasis, theme)}</h2>
      <svg width="${uw}" height="20" viewBox="0 0 460 20" preserveAspectRatio="none" style="display:block;margin-top:8px;overflow:visible;">
        ${theme.gradients ? `<defs><linearGradient id="${id}ug" x1="0" x2="1"><stop offset="0" stop-color="${theme.accent}"/><stop offset="1" stop-color="${theme.accent2 || theme.accent}"/></linearGradient></defs>` : ""}
        <path id="${id}u" d="M6 12 C 130 4, 330 4, 454 12" fill="none" stroke="${theme.gradients ? `url(#${id}ug)` : theme.accent}" stroke-width="6" stroke-linecap="round" stroke-dasharray="600" stroke-dashoffset="600"/>
      </svg>
      ${scene.subtext ? `<p id="${id}s" style="opacity:0;margin-top:12px;font:500 ${Math.round(ansFs * 0.36)}px/1.45 ${cssFont(theme)};color:${theme.dim};max-width:44ch;">${esc(scene.subtext)}</p>` : ""}
    </div>
  </div>
</div>`;
  const afterRows = 0.55 + 0.5 * rows.length;
  const s = [
    `tl.set("#${id}",{opacity:1},${T});`,
    `tl.fromTo("#${id} .${id}r",{opacity:0,x:-40},{opacity:1,x:0,duration:0.45,ease:"power3.out",stagger:${r(0.5 * kk)}},${bt(0.2)});`,
    `tl.fromTo("#${id} .${id}st",{scaleX:0,transformOrigin:"left center"},{scaleX:1,duration:0.35,ease:"power3.inOut",stagger:${r(0.5 * kk)}},${bt(0.55)});`,
    `tl.to(["#${id} .${id}r","#${id} .${id}st"],{opacity:0.26,duration:0.4,ease:"power2.out"},${bt(afterRows)});`,
    `tl.fromTo("#${id}ans",{opacity:0,y:24,scale:0.9},{opacity:1,y:0,scale:1,duration:0.55,ease:"back.out(1.5)"},${bt(afterRows + 0.15)});`,
    `textIn("${theme.textfx.enter}","#${id}ans .kfw","#${id}ans .kfc",${bt(afterRows + 0.25)},0.07);`,
    `tl.to("#${id}u",{strokeDashoffset:0,duration:0.55,ease:"power2.out"},${bt(afterRows + 0.7)});`,
    scene.subtext ? `tl.fromTo("#${id}s",{opacity:0,y:14},{opacity:1,y:0,duration:0.5},${bt(afterRows + 0.9)});` : "",
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
  const W = dims.width, H = dims.height, land = W >= H;
  // Larger footprint so the "empty half" actually reads as filled.
  const pw = Math.round(W * (land ? 0.34 : 0.52)), ph = Math.round(H * (land ? 0.50 : 0.32));
  const px = side === "left" ? Math.round(W * 0.07) : Math.round(W - pw - W * 0.07);
  const py = Math.round((H - ph) / 2);
  const A = theme.accent, B = theme.accent2 || theme.accent, ink = theme.ink, line = theme.line;
  // A real, visible surface (was 0.045 — a ghost). Depth comes from the shadow below.
  const card = theme.isDark ? "rgba(255,255,255,0.075)" : "rgba(20,18,12,0.05)";
  const pid = `${id}pf`;
  const pad = Math.round(pw * 0.07);

  // TWO prop variants, rotated by seed+scene, so repeated text scenes don't all
  // show the identical card — v0 = task board + bar chart, v1 = KPI tiles + area
  // sparkline. Both read as "the product", in the pack's own colors.
  const variant = (((ctx.seed || 0) >> 2) + (ctx.sceneIndex || 0)) % 2;
  let inner, animLine;
  if (variant === 1) {
    const tileW = Math.round((pw - pad * 2 - pad) / 3), tileH = Math.round(ph * 0.28), tileY = Math.round(ph * 0.15);
    const tiles = [0, 1, 2].map((i) => {
      const tx = pad + i * (tileW + Math.round(pad * 0.5)), c = i === 1 ? A : rgba(B, 0.7);
      return `<rect x="${tx}" y="${tileY}" width="${tileW}" height="${tileH}" rx="${Math.round(tileW * 0.12)}" fill="${rgba(ink, 0.045)}" stroke="${line}" stroke-width="1"/>` +
        `<rect x="${tx + Math.round(tileW * 0.14)}" y="${tileY + Math.round(tileH * 0.22)}" width="${Math.round(tileW * 0.52)}" height="${Math.round(tileH * 0.24)}" rx="3" fill="${c}"/>` +
        `<rect x="${tx + Math.round(tileW * 0.14)}" y="${tileY + Math.round(tileH * 0.60)}" width="${Math.round(tileW * 0.7)}" height="${Math.round(tileH * 0.12)}" rx="2" fill="${rgba(ink, 0.28)}"/>`;
    }).join("");
    const spY = Math.round(ph * 0.56), spH = Math.round(ph * 0.34), spW = pw - pad * 2;
    const pts = [0.18, 0.42, 0.32, 0.6, 0.48, 0.78, 0.66, 1.0];
    const co = pts.map((f, i) => [pad + Math.round(spW * (i / (pts.length - 1))), spY + spH - Math.round(spH * f)]);
    const poly = co.map((c, i) => `${i ? "L" : "M"}${c[0]} ${c[1]}`).join(" ");
    const area = `M${pad} ${spY + spH} ` + co.map((c) => `L${c[0]} ${c[1]}`).join(" ") + ` L${pad + spW} ${spY + spH} Z`;
    inner = `<path d="${area}" fill="${rgba(A, 0.14)}"/><path class="kfspark" d="${poly}" fill="none" stroke="${A}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` +
      tiles + co.map((c) => `<circle cx="${c[0]}" cy="${c[1]}" r="3" fill="${A}"/>`).join("");
    animLine = `tl.fromTo("#${pid} .kfspark",{strokeDasharray:${pw * 2},strokeDashoffset:${pw * 2}},{strokeDashoffset:0,duration:1.0,ease:"power2.out"},${r(T + 0.95)});`;
  } else {
    const hh = Math.round(ph * 0.15);
    const chartY = Math.round(ph * 0.60), chartH = Math.round(ph * 0.30), bw = Math.round((pw - pad * 2) / 9);
    const hts = [0.42, 0.66, 0.5, 0.82, 1.0, 0.72];
    const bars = hts.map((f, i) =>
      `<rect class="kfbar" x="${pad + i * (bw + Math.round(bw * 0.5))}" y="${chartY + chartH - Math.round(chartH * f)}" width="${bw}" height="${Math.round(chartH * f)}" rx="3" fill="${i === 3 ? A : rgba(B, 0.55)}"/>`).join("");
    const rows = [0, 1].map((i) => {
      const ry = Math.round(ph * 0.28) + i * Math.round(ph * 0.13);
      return `<rect x="${pad}" y="${ry}" width="${Math.round(ph * 0.06)}" height="${Math.round(ph * 0.06)}" rx="3" fill="none" stroke="${A}" stroke-width="2"/>` +
        `<rect x="${pad + Math.round(ph * 0.10)}" y="${ry + Math.round(ph * 0.014)}" width="${Math.round(pw * (i ? 0.42 : 0.55))}" height="${Math.round(ph * 0.032)}" rx="3" fill="${rgba(ink, 0.34)}"/>`;
    }).join("");
    inner = `<rect x="0" y="0" width="${pw}" height="${hh}" rx="${Math.round(pw * 0.05)}" fill="${rgba(A, 0.18)}"/>` +
      `<rect x="0" y="${Math.round(hh * 0.5)}" width="${pw}" height="${Math.round(hh * 0.5)}" fill="${rgba(A, 0.18)}"/>` +
      `<circle cx="${pad + Math.round(ph * 0.03)}" cy="${Math.round(hh / 2)}" r="${Math.round(ph * 0.024)}" fill="${A}"/>` +
      `<rect x="${pad + Math.round(ph * 0.08)}" y="${Math.round(hh / 2 - ph * 0.014)}" width="${Math.round(pw * 0.4)}" height="${Math.round(ph * 0.03)}" rx="3" fill="${rgba(ink, 0.44)}"/>` +
      rows + bars;
    animLine = `tl.fromTo("#${pid} .kfbar",{scaleY:0,transformOrigin:"50% 100%"},{scaleY:1,duration:0.55,stagger:0.07,ease:"power2.out"},${r(T + 0.95)});`;
  }

  const svg =
    `<svg viewBox="0 0 ${pw} ${ph}" width="100%" height="100%" style="overflow:visible;">` +
    `<rect x="0" y="0" width="${pw}" height="${ph}" rx="${Math.round(pw * 0.05)}" fill="${card}" stroke="${line}" stroke-width="1.5"/>` +
    inner +
    `</svg>`;
  // Drop shadow + accent glow give the panel depth so it reads as a real product
  // surface, not a faint ghost — the core fix for "the empty half looks empty".
  const shadow = theme.isDark
    ? `filter:drop-shadow(0 24px 60px rgba(0,0,0,0.55)) drop-shadow(0 0 42px ${rgba(A, 0.18)});`
    : `filter:drop-shadow(0 24px 50px rgba(0,0,0,0.14));`;
  const html = `<div id="${pid}" style="position:absolute;left:${px}px;top:${py}px;width:${pw}px;height:${ph}px;opacity:0;pointer-events:none;${shadow}" data-layout-allow-occlusion>${svg}</div>`;
  const s = [
    `tl.fromTo("#${pid}",{opacity:0,y:30,rotationZ:${side === "left" ? 3 : -3}},{opacity:1,y:0,rotationZ:0,duration:0.75,ease:"power3.out"},${r(T + 0.5)});`,
    animLine,
    `tl.to("#${pid}",{y:"-=12",duration:${r(Math.max(2, L - 1))},ease:"sine.inOut",yoyo:true,repeat:1},${r(T + 0.9)});`,
    // exitScene (not a bare tl.to) so the fade is followed by a hard-kill
    // tl.set(opacity:0) at the clip boundary — a non-linear seek landing after the
    // fade must not leave this prop card stuck visible (hyperframes stale-visibility
    // lint error the bare fade tripped).
    ctx.isLast ? "" : `exitScene("#${pid}",${r(T + L - 0.35)},${r(T + L)});`,
  ].filter(Boolean).join("\n");
  return { html, script: s };
}

// Classify ONE asset into how the kit must FIT it: "vector" (line-art/icon/logo —
// contain, never crop), "shot" (a website screenshot — fill from the top so a tall
// full-page grab shows its hero), or "photo" (fill/cover + palette grade). Used by
// both partitionAssets (which pool it lands in) and archAssetMontage (how the tile
// crops), so the two never disagree. The asset-director agent may set a.kind to
// force a class; otherwise it's inferred from source + svg extension + alt/style.
function classifyAsset(a) {
  if (!a) return "photo";
  if (a.kind === "vector" || a.kind === "shot" || a.kind === "photo") return a.kind;
  const src = String(a.source || "");
  const s = `${src} ${a.style || ""} ${a.alt || ""}`.toLowerCase();
  if (src === "website" || /screenshot|webpage|web page|landing|\bsite\b|dashboard|app ui|\bui\b/.test(s)) return "shot";
  if (/\.svg($|\?)/i.test(a.path) || src === "iconify" || src.startsWith("library:")
      || /vector|illustration|icon|line.?art|graphic|logo|diagram|chart|glyph|drawing|doodle/.test(s)) return "vector";
  return "photo";
}

// Per-asset ENTRANCE tween — the asset-director agent tags each asset with an
// `effect` (pop / rise / blur-in / zoom / draw / float); this maps that tag to a
// GSAP fromTo entrance for one element `sel` at time `at`. Falls back to `def`
// (each archetype's natural entrance) when the agent set nothing. Every branch
// writes opacity+transform in ONE fromTo so it hands off cleanly to any following
// float/drift (no overlapping-tween lint).
const EFFECTS_OK = new Set(["pop", "rise", "blur-in", "zoom", "draw", "float"]);
function assetEntrance(effect, sel, at, dur, def) {
  const e = EFFECTS_OK.has(effect) ? effect : (def || "pop");
  const d = r(dur || 0.6), t = r(at);
  switch (e) {
    case "rise":    return `tl.fromTo("${sel}",{opacity:0,y:46},{opacity:1,y:0,duration:${d},ease:"power3.out"},${t});`;
    case "blur-in": return `tl.fromTo("${sel}",{opacity:0,filter:"blur(14px)",scale:1.05},{opacity:1,filter:"blur(0px)",scale:1,duration:${d},ease:"power2.out"},${t});`;
    case "zoom":    return `tl.fromTo("${sel}",{opacity:0,scale:1.18},{opacity:1,scale:1,duration:${d},ease:"power3.out"},${t});`;
    case "draw":    return `tl.fromTo("${sel}",{opacity:0,scale:0.55,rotation:-5,transformOrigin:"50% 50%"},{opacity:1,scale:1,rotation:0,duration:${d},ease:"back.out(2)"},${t});`;
    case "float":   return `tl.fromTo("${sel}",{opacity:0,y:-34},{opacity:1,y:0,duration:${d},ease:"power2.out"},${t});`;
    case "pop":
    default:        return `tl.fromTo("${sel}",{opacity:0,scale:0.82,y:22},{opacity:1,scale:1,y:0,duration:${d},ease:"back.out(1.6)"},${t});`;
  }
}

// Partition the fetched assets into the kinds the kit places differently:
// website screenshots (device-framed hero), vectors/illustrations (drawn-in side
// art or grids), and photos (scrimmed full-bleed). Paths are relative to jobDir.
function partitionAssets(assets) {
  const screenshots = [], vectors = [], photos = [], videos = [];
  for (const a of (assets || [])) {
    if (!a || !a.path) continue;
    // Videos go in their own pool — the img-based archetypes would render an mp4
    // as a broken <img>. They're placed as full-bleed <video> backgrounds instead.
    if (a.type === "video" || /\.(mp4|webm|mov)($|\?)/i.test(a.path)) { videos.push(a); continue; }
    const cls = classifyAsset(a);
    if (cls === "shot") screenshots.push(a);
    else if (cls === "vector") vectors.push(a);
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
  const land = dims.width >= dims.height;
  const flat = !theme.gradients;
  const chrome = flat
    ? `background:${theme.ground};border:3px solid ${theme.ink};border-radius:14px;box-shadow:10px 10px 0 ${theme.accent};`
    : `background:${mix(theme.ground, "#ffffff", 0.06)};border:1px solid ${theme.line};border-radius:16px;box-shadow:0 40px 90px rgba(0,0,0,0.5);`;
  const barBg = flat ? mix(theme.ground, theme.ink, 0.06) : rgba("#ffffff", 0.05);
  const big = land ? 56 : 46;
  const accentText = theme.emphasisCss || (theme.gradients ? `background:linear-gradient(100deg,${theme.accent},${theme.accent2});-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:${theme.accent};` : `color:${theme.accent};`);
  const dots = ["#FF5F57", "#FEBC2E", "#28C840"].map((c) => `<span style="width:11px;height:11px;border-radius:50%;background:${flat ? theme.ink : c};display:inline-block;"></span>`).join("");
  const frameW = land ? "52%" : "84%";
  // The OUTER wrapper owns positioning/centering; the INNER #fr owns the GSAP
  // entrance (opacity/yPercent/rotationX). They MUST be separate elements: GSAP
  // rewrites the whole `transform` of whatever it animates, so animating yPercent
  // on an element that also carries `translateY(-50%)` clobbers the -50% and drops
  // the frame into the lower half (bottom gets clipped). Keep centering off #fr.
  // Center with a FULL-HEIGHT flex box (top:0;bottom:0;justify-content:center)
  // instead of translateY(-50%): flex centering is layout-based, so the GSAP
  // entrance transform on the inner #fr can't clobber it and drop the frame low
  // (the old bug where the screenshot's bottom clipped off the canvas).
  const frameOuter = land
    ? `position:absolute;left:5%;top:0;bottom:0;width:${frameW};display:flex;flex-direction:column;justify-content:center;`
    : `position:absolute;left:8%;right:8%;top:0;bottom:0;width:84%;display:flex;flex-direction:column;justify-content:center;`;
  const copyWrap = land
    ? `position:absolute;right:5%;top:0;bottom:0;width:34%;display:flex;flex-direction:column;justify-content:center;`
    : `position:absolute;left:8%;right:8%;top:0;bottom:0;width:84%;display:flex;flex-direction:column;justify-content:flex-end;padding-bottom:8%;text-align:center;`;
  // CALLOUT ANNOTATIONS (amazon-premium's money shot): when the scene carries
  // bullets, up to two become chips pinned OVER the shot, each introduced by a
  // drawing connector into a target ring that pops on the feature. All layers
  // live inside the frame (they inherit its entrance) and are decorative
  // overlays (allow-occlusion), so layout stays inspect-clean.
  const bodyH = land ? Math.round(dims.height * 0.52) : Math.round(dims.height * 0.40);
  const fw = Math.round(dims.width * (land ? 0.52 : 0.84));
  const fh = 42 + bodyH;
  const notes = (Array.isArray(scene.bullets) ? scene.bullets.filter(Boolean) : [])
    .slice(0, L >= 4 ? 2 : 1).map((b) => String(b).slice(0, 34));
  const slots = [
    { chip: [6, 13], anchor: [0.24, 0.26], tgt: [0.42, 0.44] },
    { chip: [38, 76], anchor: [0.56, 0.78], tgt: [0.64, 0.6] },
  ];
  const chipCss = theme.gradients
    ? `background:${mix(theme.ground, "#ffffff", 0.10)};border:1px solid ${theme.line};box-shadow:0 12px 28px rgba(0,0,0,0.4);border-radius:11px;`
    : `background:${theme.ground};border:2px solid ${theme.ink};box-shadow:4px 4px 0 ${theme.accent};border-radius:8px;`;
  const chipFs = Math.max(13, Math.round(dims.height * 0.024));
  const annEls = [], annLines = [], annScript = [];
  notes.forEach((txt, k) => {
    const sl = slots[k % slots.length];
    const A = k % 2 === 0 ? theme.accent : (theme.accent2 || theme.accent);
    const x1 = Math.round(fw * sl.anchor[0]), y1 = Math.round(fh * sl.anchor[1]);
    const x2 = Math.round(fw * sl.tgt[0]), y2 = Math.round(fh * sl.tgt[1]);
    const len = Math.max(20, Math.round(Math.hypot(x2 - x1, y2 - y1)));
    annEls.push(`<div class="kfchip" id="${id}ch${k}" data-layout-allow-occlusion style="position:absolute;left:${sl.chip[0]}%;top:${sl.chip[1]}%;opacity:0;display:inline-flex;align-items:center;gap:8px;padding:8px 14px;${chipCss}font:700 ${chipFs}px/1.2 ${cssFont(theme)};color:${theme.ink};white-space:nowrap;max-width:58%;overflow:hidden;text-overflow:ellipsis;"><span style="width:${Math.round(chipFs * 0.85)}px;height:${Math.round(chipFs * 0.85)}px;border-radius:5px;background:${rgba(A, 0.22)};border:1px solid ${rgba(A, 0.5)};flex:none;"></span>${esc(txt)}</div>`);
    annLines.push(`<line id="${id}cl${k}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${A}" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="${len}" stroke-dashoffset="${len}" opacity="0.85"/>`);
    annLines.push(`<circle id="${id}ct${k}" cx="${x2}" cy="${y2}" r="9" fill="none" stroke="${A}" stroke-width="2.5" opacity="0"/>`);
    const at = 1.2 + k * 0.95;
    annScript.push(`tl.fromTo("#${id}cl${k}",{strokeDashoffset:${len}},{strokeDashoffset:0,duration:0.4,ease:"power2.out"},${r(T + at)});`);
    annScript.push(`tl.fromTo("#${id}ct${k}",{opacity:0,scale:0.4,transformOrigin:"50% 50%"},{opacity:0.9,scale:1,duration:0.4,ease:"back.out(2)"},${r(T + at + 0.12)});`);
    annScript.push(`tl.fromTo("#${id}ch${k}",{opacity:0,scale:0.8},{opacity:1,scale:1,duration:0.45,ease:"back.out(1.7)"},${r(T + at + 0.22)});`);
  });
  const annSvg = notes.length
    ? `<svg viewBox="0 0 ${fw} ${fh}" preserveAspectRatio="none" data-layout-allow-occlusion style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;">${annLines.join("")}</svg>`
    : "";
  const html = `<div id="${id}" class="clip" data-start="${T}" data-duration="${L}" data-track-index="${track}" style="opacity:0;">
  <div style="${frameOuter}">
  <div id="${id}fr" class="kfstage browser" style="${chrome}overflow:hidden;width:100%;position:relative;">
    <div class="browser-bar" style="height:42px;display:flex;align-items:center;gap:9px;padding:0 16px;background:${barBg};border-bottom:1px solid ${theme.line};">${dots}<span style="margin-left:12px;flex:1;max-width:340px;height:22px;border-radius:9999px;background:${rgba(theme.ink, 0.08)};"></span></div>
    <div style="position:relative;width:100%;height:${bodyH}px;overflow:hidden;"><img id="${id}img" src="${esc(asset.path)}" alt="${esc(asset.alt || "screenshot")}" style="position:absolute;top:0;left:0;width:100%;height:auto;min-height:100%;object-fit:cover;object-position:top center;"></div>
    ${annSvg}${annEls.join("")}
  </div>
  </div>
  <div style="${copyWrap}">
    <span id="${id}k" class="kicker" style="opacity:0;display:inline-flex;align-items:center;gap:9px;padding:7px 15px;border-radius:9999px;background:${rgba(theme.ground, 0.86)};border:1px solid ${rgba(theme.accent, 0.35)};color:${theme.accent};font:700 13px/1 ${cssFont(theme)};letter-spacing:.2em;text-transform:uppercase;"><span style="width:7px;height:7px;border-radius:50%;background:${theme.accent};"></span>${esc(ctx.kicker || "Live")}</span>
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
    ...annScript,
    ctx.isLast ? "" : `exitScene("#${id}",${r(T + L - 0.35)},${r(T + L)});`,
  ].filter(Boolean).join("\n");
  return { html, script: s };
}

// SPLIT-VECTOR — headline on one side, a vector/illustration on the other that
// floats/draws in. The reactive beat is the art's entrance + a gentle float.
function archSplitVector(scene, ctx) {
  const { theme, id, T, L, track, dims, asset } = ctx;
  const land = dims.width >= dims.height;
  const big = land ? 64 : 50;
  const accentText = theme.emphasisCss || (theme.gradients ? `background:linear-gradient(100deg,${theme.accent},${theme.accent2});-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:${theme.accent};` : `color:${theme.accent};`);
  const dir = land ? "row" : "column";
  // Photos get the same gentle palette pull as montage tiles (a raw stock photo
  // beside pack-colored copy reads off-brand); vectors stay untouched. One
  // combined filter declaration — two `filter:`s would override each other.
  const artIsVec = classifyAsset(asset) === "vector";
  const artTone = artIsVec ? "" : "saturate(0.82) contrast(1.03) ";
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
    // agent-chosen entrance (default: a vector draws in, else pop) then a gentle float
    assetEntrance(asset.effect, `#${id}art`, r(T + 0.4), 0.7, artIsVec ? "draw" : "pop"),
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
  const land = dims.width >= dims.height;
  const cols = n <= 1 ? 1 : n <= 4 ? 2 : 3;
  const big = land ? 54 : 44;
  const flat = !theme.gradients;
  const accentText = theme.emphasisCss || (theme.gradients
    ? `background:linear-gradient(100deg,${theme.accent},${theme.accent2});-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:${theme.accent};`
    : `color:${theme.accent};`);
  const tileChrome = flat
    ? `border:3px solid ${theme.ink};box-shadow:6px 6px 0 ${theme.accent};`
    : `border:1px solid ${theme.line};box-shadow:0 22px 50px rgba(0,0,0,0.45);`;
  const tileH = Math.round(dims.height * (land ? 0.2 : 0.15));
  const tileFx = [];                              // per-tile entrance effect (agent or by-kind)
  const tiles = items.map((a, k) => {
    const cls = classifyAsset(a);                 // "vector" | "shot" | "photo"
    const isVec = cls === "vector", isShot = cls === "shot";
    // per-tile entrance: the agent's choice, else one that suits the kind (an icon
    // pops, a screenshot rises, a photo resolves from blur) so a grid of mixed
    // assets animates with intent instead of one uniform pop.
    tileFx.push(a.effect || (isVec ? "pop" : isShot ? "rise" : "blur-in"));
    // FIT — vectors/line-art must never crop (contain + padded tinted plate);
    // website screenshots fill but are pinned to the TOP so a tall full-page grab
    // shows its branded hero, never its blank scrolled-out middle (the "screenshot
    // doesn't fit the box" bug); photos fill (cover). The asset-director agent may
    // override fit/focus per asset (a.fit / a.focus) — its call wins over this
    // heuristic. Also: a landscape screenshot that already matches the tile ratio
    // is let to `cover` normally; the top-pin only matters for tall grabs.
    const fit = (a.fit === "contain" || a.fit === "cover") ? a.fit : (isVec ? "contain" : "cover");
    const focus = a.focus || (isShot ? "top" : "center");
    const objPos = `object-position:${focus === "top" ? "top" : focus === "bottom" ? "bottom" : "center"} center;`;
    const pad = isVec ? `background:${rgba(theme.ink, theme.isDark ? 0.06 : 0.04)};padding:14px;` : "";
    // COLOR HARMONY — raw stock photos arrive in arbitrary palettes (a saturated
    // red product shot shatters a navy/cyan frame). Photos get pulled toward the
    // pack: gentle desaturation on the img + a ground-tinted wash over the tile,
    // so every tile reads as one graded set. Vectors/screenshots skip it (vectors
    // are already pack-recolored; a product screenshot must stay true).
    const tone = (isVec || isShot) ? "" : "filter:saturate(0.76) contrast(1.04);";
    const wash = (isVec || isShot) ? "" : `<span style="position:absolute;inset:0;background:linear-gradient(180deg,${rgba(theme.ground, 0.12)},${rgba(theme.ground, 0.32)});pointer-events:none;"></span>`;
    return `<div id="${id}t${k}" class="kftile" style="opacity:0;position:relative;overflow:hidden;border-radius:${flat ? 8 : 14}px;${tileChrome}${pad}height:${tileH}px;display:flex;align-items:center;justify-content:center;"><img src="${esc(a.path)}" alt="${esc(a.alt || "")}" style="width:100%;height:100%;object-fit:${fit};${objPos}display:block;${tone}">${wash}</div>`;
  }).join("");
  const html = `<div id="${id}" class="clip" data-start="${T}" data-duration="${L}" data-track-index="${track}" style="opacity:0;">
  <div style="position:absolute;left:6%;right:6%;top:50%;transform:translateY(-50%);">
    <div style="width:54px;height:5px;border-radius:3px;background:${theme.accent};margin-bottom:18px;"></div>
    <h2 style="font:800 ${fitBig(scene.headline, big, 22)}px/1.05 ${cssFont(theme)};letter-spacing:-0.02em;color:${theme.ink};max-width:22ch;"><style>${emphasisBlock(theme, id)}</style>${headlineSpans(scene.headline, scene.emphasis, theme)}</h2>
    <div id="${id}g" style="margin-top:22px;display:grid;grid-template-columns:repeat(${cols},1fr);gap:${land ? 18 : 12}px;">${tiles}</div>
  </div>
</div>`;
  // The shared float must begin strictly AFTER the last tile's entrance ends, or it
  // double-writes `y` on that tile (overlapping_gsap_tweens lint). lastEnd = last
  // stagger start + its duration.
  const floatAt = r(T + 0.55 + (n - 1) * 0.1 + 0.55 + 0.05);
  const s = [
    `tl.set("#${id}",{opacity:1},${T});`,
    `textIn("${theme.textfx.enter}","#${id} .kfw","#${id} .kfc",${r(T + 0.25)},0.06);`,
    // per-tile entrance (agent/by-kind), staggered 0.1s apart
    ...tileFx.map((fx, k) => assetEntrance(fx, `#${id}t${k}`, r(T + 0.55 + k * 0.1), 0.55, "pop")),
    // shared gentle float once EVERY tile is in (starts after the last entrance)
    floatAt < T + L - 0.5 ? `tl.to("#${id} .kftile",{y:"-=8",duration:1.8,ease:"sine.inOut",yoyo:true,stagger:0.12,repeat:sreps(${r(T + L - floatAt - 0.3)},1.8)},${floatAt});` : "",
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
  ].join("\n");
  return { html, script: s };
}

// Pull up to `max` assets for a montage, round-robin across kinds for variety.
// VECTORS lead the round-robin: screenshots read best as a full HERO (they already
// get first pick of the hero slot upstream), while clean icons/line-art are exactly
// what a tiled grid is for — so a montage surfaces MORE vector content and the film
// leans on its design-system art instead of a couple of shrunk screenshots.
function takeMontage(pools, max) {
  const out = [];
  const order = [pools.vectors, pools.screenshots, pools.photos];
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
  // Longer unit words BEFORE the M|K|B magnitudes — alternation is ordered, so
  // a leading M|K|B would steal the "m" of "min"/"minutes" (misread as millions).
  const m = /([₹$€£]?)\s?(\d[\d,]*)\s?([%x+]|hours?|hrs?|days?|min(?:ute)?s?|sec(?:ond)?s?|M|K|B)?/i.exec(cleaned);
  if (!m) return null;
  const value = clamp(parseInt(m[2].replace(/,/g, ""), 10) || 0, 0, 9_999_999);
  if (!value) return null;
  // Time units render compact ("Brewed in 90 seconds" -> big "90s") so the
  // counter stays TRUTHFUL to the copy — before this, a seconds/minutes metric
  // wasn't recognized and archStat showed its fabricated 95% default (caught in
  // the grok test video).
  const prefix = m[1] || "", suffix = (m[3] || "")
    .replace(/hours?|hrs?/i, "h")
    .replace(/min(?:ute)?s?/i, "min")
    .replace(/sec(?:ond)?s?/i, "s");
  // A BARE number (no currency prefix, no unit) is a weak "metric" — a count,
  // year, step, or list index — and reads oddly as a full-screen counter. Only a
  // number with a $/₹/€/£ prefix or a %/x/M/K/B/day unit earns archStat; bare
  // numbers fall through to archText, where they live in the headline naturally.
  if (!prefix && !suffix) return null;
  return { value, prefix, suffix };
}

// Map a storyboard scene.kind to an archetype builder.
function archetypeFor(scene, idx, total) {
  const k = (scene.kind || "").toLowerCase();
  if (idx === 0 || k === "hook" || k === "title") return archHook;
  if (idx === total - 1 || k === "cta") return archCta;
  if (k === "quote") return archQuoteCard;        // testimonial card (before the number check)
  const bl = Array.isArray(scene.bullets) ? scene.bullets.filter(Boolean) : [];
  // DIFFERENTIATOR (master S8): every bullet opens with a negation → the
  // strike-list scene (bullets struck + dimmed, headline answer underlined).
  if (bl.length >= 2 && bl.length <= 3 && scene.headline
      && bl.every((b) => /^(no|without|stop|forget|skip|zero|never)\b/i.test(String(b).trim()))) return archStrikeList;
  // PROOF ROW (master S7 / amazon S3): ≥2 bullets carrying strong metrics →
  // multi-stat cards with per-card count-ups + arcs.
  if (bl.length >= 2 && bl.filter((b) => pickNumber({ headline: String(b) })).length >= 2) return archProofStats;
  // chart/countdown WITHOUT a parseable metric falls to archText — archStat's
  // 95% default is a FABRICATED stat and must never ship (grok test finding).
  if (k === "chart" || k === "countdown") return pickNumber(scene) ? archStat : archText;
  if (pickNumber(scene)) return archStat;        // any scene with a strong number
  // A feature/bullet scene carrying ≥2 points renders as a premium CARD GRID
  // (icon + title + desc per pack chrome) instead of a flat bulleted list.
  if (bl.length >= 2) return archFeatureGrid;
  return archText;                                // single-point / caption / shape-motion
}

// Seek-safe caption track (one node, recomputed each frame — never one clip/line).
function buildCaptions(captionCues, dims, D, theme, track) {
  const cues = Array.isArray(captionCues) ? captionCues.filter((c) => c && c.text) : [];
  if (!cues.length) return null;
  const data = JSON.stringify(cues.map((c) => [r(c.start || 0), r(c.end || (c.start || 0) + 2), String(c.text)]));
  const html = `<div class="clip" data-start="0" data-duration="${D}" data-track-index="${track}"><div id="kfcap" style="position:absolute;left:50%;bottom:5%;transform:translateX(-50%);max-width:76%;text-align:center;padding:11px 22px;border-radius:12px;background:${rgba(theme.isDark ? "#080c12" : "#0c0c0c", 0.72)};border:1px solid ${rgba("#ffffff", 0.10)};color:#F4F7FA;font:600 ${Math.round(dims.height * 0.034)}px/1.3 ${cssFont(theme)};opacity:0;"></div></div>`;
  const script = `var kfcd=${data};var kfcp={t:0};tl.to(kfcp,{t:${D},duration:${D},ease:"none",onUpdate:function(){var el=document.getElementById("kfcap");if(!el)return;var n=kfcp.t,a=null;for(var k=0;k<kfcd.length;k++){if(n>=kfcd[k][0]&&n<kfcd[k][1]){a=kfcd[k];break;}}if(a){if(el.textContent!==a[2])el.textContent=a[2];el.style.opacity="1";}else el.style.opacity="0";}},0);`;
  return { html, script };
}

// MAIN ENTRY — assemble the full composition.
function buildComposition({ storyboard, dims, framePack, assets, captionCues, seedKey, dressing } = {}) {
  const sb = storyboard || {};
  const scenes = Array.isArray(sb.scenes) && sb.scenes.length ? sb.scenes : [{ id: "s1", start: 0, duration: dims.fps ? 4 : 4, kind: "hook", headline: sb.title || "KEYFRAME" }];
  const D = r(sb.durationSec || scenes.reduce((a, s) => a + (s.duration || 0), 0) || 12);
  const theme = deriveTheme(framePack, sb);
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
  // iconify glyphs are recolored to the pack AND concrete-noun matched upstream
  // (not visualDirection leakage), so they're trusted for prominent slots like a
  // curated pick. The audited off-topic tiles (tooth/toothpaste/camera/diamond)
  // were all raw WEB STOCK (pixabay/openverse) — those still require `visionOk`.
  // …and the asset-director's QUALITY call: an asset it flagged `low` (blurry,
  // pixelated, watermarked, amateur, blank) is never allowed into a prominent slot —
  // a weak hero/tile cheapens the whole film. Low photos fall to scrim B-roll; low
  // vectors/screenshots simply drop (there is no gentle background use for them).
  const prominentOk = (a) => !!a && !a.lowQuality && (a.source === "website"
    || a.source === "iconify"
    || String(a.source || "").startsWith("library:")
    || a.visionOk === true);
  const bgOnlyPhotos = pools.photos.filter((a) => !prominentOk(a));
  pools.photos = pools.photos.filter(prominentOk);
  pools.vectors = pools.vectors.filter(prominentOk);
  pools.screenshots = pools.screenshots.filter(prominentOk);
  if (bgOnlyPhotos.length) console.log(`[scene-kit] ${bgOnlyPhotos.length} unverified asset(s) demoted to scrim-background only`);
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
      kicker: i === 0 ? (sb.title || "KEYFRAME") : "",
      asset: null, assets: null, bgAsset: null,
      seed, sceneIndex: i, sceneCount: scenes.length,
      variant: dress?.variant != null ? dress.variant : textVariant(theme, seed, i), // 0-3 layout variant
      decorSvg: dress?.decorSvg || null,
    };
    return { scene, i, ctx, isContent: i > 0 && i < scenes.length - 1, build: archetypeFor(scene, i, scenes.length) };
  });

  const leftover = () => pools.screenshots.length + pools.vectors.length + pools.photos.length;
  let usedShot = false, montageDone = false;

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
  // FEATURE-BULLET scenes are ALSO screenshot-eligible (amazon S2's grammar):
  // the hero renders their bullets as callout chips + connectors over the shot,
  // so converting a feature grid loses no content — it gains the annotation
  // beat. Proof/strike/quote/stat scenes stay excluded (their staging is the
  // content).
  const shotWeavable = plan.filter((p) => p.isContent && (p.build === archText || p.build === archFeatureGrid));
  if (pools.screenshots.length && shotWeavable.length) {
    const target = shotWeavable
      .map((p) => ({ p, s: assetAffinity(p.scene, "screenshot") + (p.build === archFeatureGrid ? 0.25 : 0) }))
      .sort((a, b) => b.s - a.s || a.p.i - b.p.i)[0].p;
    target.ctx.asset = pools.screenshots.shift(); target.build = archScreenshotHero; usedShot = true;
    target.ctx.kicker = target.scene.emphasis || "Live preview";
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
      p.ctx.assets = takeMontage(pools, 6); p.build = archAssetMontage; montageDone = true;
    } else if (pools[splitPools[0]].length || pools[splitPools[1]].length) {
      const pool = pools[splitPools[0]].length ? splitPools[0] : splitPools[1];
      p.ctx.asset = pools[pool].shift(); p.build = archSplitVector;
    } else if (pools.screenshots.length) {
      p.ctx.asset = pools.screenshots.shift(); p.build = archScreenshotHero;
      p.ctx.kicker = p.scene.emphasis || "Live preview";
    }
  }

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
      : (p.build === archStat || p.build === archProofStats) ? "stat"
      : (p.build === archText || p.build === archQuoteCard || p.build === archStrikeList) ? "text" : "asset";
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
    // retro-terminal packs already fill their empty side with bespoke ornaments
    // (activity ring / joining-the-dots chart + the terminal window) — the
    // generic prop card would land in the SAME right-margin footprint and
    // visually collide with them.
    const isRetroTerminal = framePack === "terminal-amber" || framePack === "terminal-green";
    // Packs can opt out of the generic product-card entirely (theme.layout.propFill:
    // false) — it's the single most-repeated element across templates, so bespoke
    // packs suppress it and fill the frame with their own ornaments instead.
    const propEligible = noVisual && !isRetroTerminal && theme.layout.propFill
      && (p.build === archHook || (p.build === archText && p.ctx.variant !== 1));
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
    // PER-SCENE LIGHT (showcase grammar): every gradient-pack scene owns a light
    // source. Skipped when a photo/video backdrop already carries the depth, and
    // on the CTA (its archetype ships its own centered aura). Injected LAST so
    // it lands as the clip's FIRST child — everything else paints above it.
    if (theme.gradients && p.build !== archCta && !p.ctx.bgAsset && !p.ctx.bgVideo) {
      const light = buildSceneLight(p.ctx);
      const lit = out.html.replace(new RegExp(`(<div id="${p.ctx.id}"[^>]*>)`), `$1${light.html}`);
      if (lit !== out.html) { out.html = lit; out.script += `\n${light.script}`; }
    }
    // EMPHASIS SHINE (master S2): one gradient sweep across the accent word
    // after the headline lands — only when this scene actually renders a
    // gradient-clipped emphasis (the oversized background from emphasisBlock).
    if (theme.gradients && (theme.textfx.emphasis || "gradient") === "gradient"
        && new RegExp(`#${p.ctx.id} \\.kfacc\\{[^}]*gradient\\(`).test(out.html)) {
      const at = r(p.ctx.T + Math.min(1.9, Math.max(1.1, p.ctx.L - 0.9)));
      out.script += `\ntl.fromTo("#${p.ctx.id} .kfacc",{backgroundPosition:"120% 0%"},{backgroundPosition:"0% 0%",duration:0.8,ease:"power2.out"},${at});`;
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
  return { indexHtml, metaJson };
}

function scriptStart(scenes, i) { let s = 0; for (let k = 0; k < i; k++) s += scenes[k].duration || 0; return s; }

module.exports = { buildComposition, deriveTheme, FLAT_PACKS };
