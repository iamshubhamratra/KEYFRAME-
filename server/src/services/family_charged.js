// CHARGED family template — the authored scene grammar for the three
// high-energy dark packs: IGNITION (launch pad at night), KALEIDO (a
// kaleidoscope come alive on violet-black) and VOLTAGE (a high-voltage storm on
// near-black).
//
// These three were held back from the other families on purpose. Each one is a
// pack people pick FOR ITS EFFECT — ignition's countdown, kaleido's six-fold
// mirrored field, voltage's forking lightning — and a generic dark grammar
// erases exactly that. So this family does two things at once:
//
//   1. ONE grammar. Seven authored scenes for launch/hype films: a title that
//      ignites, a HUD-framed product plate, a numbered sequence of stages, a
//      surge metric on a segmented charge gauge, a transmission panel for the
//      quote, a burst grid of proof tiles and a launch CTA. All three packs
//      stage a film the same way, the way poster-loud's thirteen packs do.
//
//   2. THREE signatures. chrome() switches on the pack name and paints a
//      completely different persistent backdrop + HUD readout per pack:
//        ignition -> a 60-tick countdown ring whose arc depletes across the
//                    film, a sweeping hand, a targeting reticle, falling stars
//                    and rising exhaust embers, with live T-minus digits and
//                    telemetry bars in the edge HUD.
//        kaleido  -> a true SIX-FOLD MIRRORED field (dihedral D6: six rotations
//                    x six reflections of one authored wedge) turning slowly
//                    across the whole film, over breathing pulse rings, a
//                    counter-rotating spoke halo and a centre mandala.
//        voltage  -> FORKING LIGHTNING: seeded bolts with branch forks that
//                    strike, flicker and fade on a schedule spanning the film,
//                    a hard flash on each strike, a crackling Tesla arc between
//                    two electrodes, a running oscilloscope trace and rising
//                    spark particles.
//
// Colours, fonts, case and alignment all come from deriveTheme(framePack) — the
// packs re-tint whole (their whole point: one hue drives the feel), so a brand
// skin recolours the countdown, the kaleidoscope and the lightning alike.
//
// The render contract (seek-safety, tracks, hard kills, caption node, camera) is
// the engine's — see template_engine.js. This module is design only.

const { deriveTheme } = require("./scene_kit");
const E = require("./template_engine");
const { esc, r, rgba, mix, lum, inkOn, hashSeed, statsOf, breakLines, bullets, fit, mineStat } = E;

// ---- contrast guard -----------------------------------------------------------
// A pack accent is chosen to sit on the pack's own near-black ground, but a
// brand-skin override (matchSiteTheme) can move the ground under it. On these
// grounds a too-close accent reads as dark-on-dark — the one failure mode that
// ships an invisible frame. Lift any accent that misses a hard legibility bar.
function contrast(a, b) {
  const la = lum(a), lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
function legible(color, ground, ink, min) {
  let c = String(color || ink);
  for (let i = 0; i < 8 && contrast(c, ground) < (min || 3.4); i++) c = mix(c, ink, 0.2);
  return c;
}

// ---- which signature this pack owns -------------------------------------------
// Named packs get their own; anything else routed here gets one deterministically
// (a family member must never fall back to "no signature").
function signatureOf(framePack) {
  const p = String(framePack || "").toLowerCase();
  if (p === "ignition") return "countdown";
  if (p === "kaleido") return "mirror";
  if (p === "voltage") return "bolt";
  return ["countdown", "mirror", "bolt"][hashSeed(p || "charged") % 3];
}

// ---- theme -------------------------------------------------------------------
function theme(manifest, brandSkin, { framePack, land } = {}) {
  const t = deriveTheme(framePack, {}, brandSkin);
  const ground = t.ground || "#06070C";
  const ink = t.ink || "#FFFFFF";
  const dark = t.isDark !== false;
  const list = (t.accents && t.accents.length ? t.accents : (dark ? ["#3DE0FF", "#B14DFF"] : ["#1B63FF", "#B14DFF"]));
  const ex = (Array.isArray(t.extras) ? t.extras : []).filter(Boolean);
  const accent = legible(list[0], ground, ink, 3.6);
  const accent2 = legible(list[1] || list[0], ground, ink, 3.3);
  const spark = legible(ex[0] || list[2] || list[1] || list[0], ground, ink, 3.0);
  const alt = legible(ex[1] || list[3] || list[0], ground, ink, 3.0);
  const tf = t.textfx || {};
  return {
    ...t,
    ground, ink, dark, accent, accent2, spark, alt,
    // The family's own legible() targets 3.0-3.6 — right for glows and rules, but
    // SMALL TEXT needs AA (measured failures at 4.12:1 and 1.09:1 across the
    // gallery). Text use goes through these; fills keep the raw accent.
    accentText: E.readable(ground, accent, 1, 4.5),
    accentText2: E.readable(ground, accent2, 1, 4.5),
    sig: signatureOf(framePack),
    // the pack's own typographic voice, straight from its manifest
    upper: tf.case === "upper",
    center: tf.align === "center",
    // hairlines: ~1px at either orientation, in container units
    hairW: land ? 0.09 : 0.15,
    hair: rgba(ink, dark ? 0.2 : 0.16),
    edge: rgba(accent, 0.34),
    well: mix(ground, dark ? "#000000" : "#FFFFFF", 0.42),
    // text tiers — body never dips below 60% of the ink on these grounds
    body: rgba(ink, 0.86),
    soft: rgba(ink, 0.68),
    faint: rgba(ink, 0.42),      // decoration only, never copy
    onAccent: inkOn(accent, "#06070C", "#FFFFFF"),
    displayStack: t.displayStack || t.fontStack || "system-ui, sans-serif",
    bodyStack: t.fontStack || "system-ui, sans-serif",
    monoStack: "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Courier New', monospace",
    fontFace: t.fontFace || "",
  };
}

// ---- published vocabulary (Template Director casts onto these) ----------------
const TEMPLATE_SCENES = [
  {
    type: "ignitetitle", bestFor: "the opening title, the intro line the film launches on",
    look: "The title slams up out of a charged core under a widening glow, rails snap open above and below it and a charge bar fills underneath.",
    slots: { kicker: "max 22 chars", lines: "1-3 lines, max 28 chars each", body: "one sentence, max 110 chars" },
    media: [], mediaMin: 0,
  },
  {
    type: "chargeplate", bestFor: "a product screen or photo shown as the hero",
    look: "The image sits inside a HUD plate with corner brackets and a live scan line sweeping down it, the claim set alongside on a charged rule.",
    slots: { kicker: "max 22 chars", headline: "max 2 short lines", body: "one sentence, max 130 chars" },
    media: ["desktop"], mediaMin: 1,
  },
  {
    type: "sequence", bestFor: "features, steps or a sequence of capabilities",
    look: "Numbered stage rows firing in one after another down a glowing spine, each closed by a power bar that charges across.",
    slots: { kicker: "max 22 chars", headline: "max 2 short lines", items: "2-4 lines, max 44 chars each" },
    media: [], mediaMin: 0,
  },
  {
    type: "surge", bestFor: "one number that carries the proof",
    look: "A huge figure counts up over a charged core while a twelve-segment power gauge lights up beneath it, smaller figures as HUD chips.",
    slots: { headline: "max 44 chars", stats: "1-3 of {v: number, suf: '%'|'X'|'K'|'M'|'', l: label max 24 chars}", emphasis: "a short hero word if there is no number" },
    media: [], mediaMin: 0,
  },
  {
    type: "transmission", bestFor: "a testimonial or customer pull-quote",
    look: "The quote reads as an incoming transmission inside a HUD panel with a live signal trace running under it and the attribution on a charged disc.",
    slots: { quote: "max 150 chars, verbatim", author: "person's name", role: "role and/or company" },
    media: [], mediaMin: 0,
  },
  {
    type: "gridburst", bestFor: "a showcase, gallery, logos or social proof",
    look: "A burst of HUD tiles — images, a highlighted figure and the brand mark — each snapping in on its own beat with an index stamp.",
    slots: { kicker: "max 22 chars", headline: "max 2 short lines", badge: "a rating or number, max 8 chars", badgeLabel: "max 22 chars" },
    media: ["photo", "photo"], mediaMin: 1,
  },
  {
    type: "launchcta", bestFor: "the closing call to action, the last frame",
    look: "The closing line lifts off a burst of rays, a glowing pill button pulses under it and the url sits on a charged rule.",
    slots: { headline: "max 2 short lines", cta: "button label, max 22 chars", kicker: "max 22 chars" },
    media: [], mediaMin: 0,
  },
];

const mediaSlots = { chargeplate: ["desktop"], gridburst: ["photo", "photo"], transmission: ["photo"] };
// True when the PREVIOUS scene already carried imagery — keeps media beats
// alternating now that any spare asset, not just a pinned screenshot, earns one.
const mediaBeatJustPlayed = (ctx) => ((mediaSlots[ctx && ctx.prevType] || []).length > 0);

// ---- deterministic router (used when the director is off / uncast) -----------
function route(scene, i, total, ctx) {
  const k = String(scene.kind || "").toLowerCase();
  const p = String(scene.purpose || "").toLowerCase();
  if (i === 0 || k === "hook" || k === "title") return "ignitetitle";
  if (i === total - 1 || k === "cta" || p === "cta") return "launchcta";
  if (k === "quote" || scene.quote || /testimonial/.test(p)) return "transmission";
  if (k === "stat" || k === "chart" || statsOf(scene, 1).length) return "surge";
  if (/gallery|showcase|portfolio|social|proof|logos/.test(`${k} ${p}`) && ctx.freeCount >= 1 && ctx.prevType !== "gridburst") return "gridburst";
  // MEDIA BEAT — ahead of the text branch, and satisfied by ANY spare asset:
  // `sequence` used to claim every middle scene and the media branch only fired
  // for a pinned shot or a real screenshot, so a pool of stock photos went
  // unshown. A middle scene can now carry imagery even right after another media
  // beat — as long as it is a DIFFERENT media type; the SAME type never repeats
  // back-to-back, so the film still reads as a sequence, not a slideshow.
  // LANDSCAPE ONLY for the tile grid: it lays out 4-up wide but collapses to a
  // 2x2 in portrait, which `check:templates` flags as a side-by-side squeeze.
  // Portrait still gets a media beat — just the full-width single instead.
  if (ctx.land && ctx.freeCount >= 3 && ctx.prevType !== "gridburst") return "gridburst";
  if ((ctx.pinned || ctx.hasShot || ctx.freeCount >= 1) && ctx.prevType !== "chargeplate") return "chargeplate";
  if (bullets(scene, 4).length >= 2) return "sequence";
  return ctx.prevType === "chargeplate" ? "sequence" : "chargeplate";
}
// A media type with no media re-routes here. `chargeplate` is allowed to stand:
// its no-asset state is an authored signal plate, not an empty frame.
const mediaFallback = (scene) => {
  // Keep a quote scene on its testimonial card (monogram fallback) when no photo
  // is free, instead of rerouting the testimonial away and dropping the quote.
  if (scene && (scene.quote || String(scene.kind || "").toLowerCase() === "quote" || /testimonial|review/.test(String(scene.purpose || "").toLowerCase()))) return null;
  if (bullets(scene, 4).length >= 2) return "sequence";
  if (statsOf(scene, 1).length) return "surge";
  return "chargeplate";
};

// ---- shared charged furniture -------------------------------------------------

// Type size that keeps the longest line inside the plate. Portrait runs ~1.5x
// the landscape scale: cqw is a share of WIDTH, so a landscape size set on a
// 9:16 reel reads tiny against a frame that is ~177cqw tall.
const headSize = (lines, land, capL) => {
  const longest = Math.max(...lines.map((l) => String(l).length), 1);
  const cap = land ? capL : r(capL * 1.5);
  return r(Math.min(cap, (land ? 80 : 88) / longest * (land ? 1.5 : 1.7)));
};

// The family surface: a charged HUD plate — dark well, accent hairline, inner
// bloom. Never a flat black box.
const hudCss = (th, land, radius) =>
  `background:linear-gradient(158deg, ${rgba(th.ink, 0.09)} 0%, ${rgba(th.ink, 0.02)} 54%, ${rgba(th.accent, 0.07)} 100%);`
  + `border:${th.hairW}cqw solid ${th.edge};border-radius:${radius}cqw;`
  + `box-shadow:inset 0 0 ${land ? 2.4 : 3.8}cqw ${rgba(th.accent, 0.14)}, 0 ${land ? 1.2 : 2}cqw ${land ? 3.4 : 5.4}cqw ${rgba("#000000", 0.55)};`;

// Corner brackets that lock onto a plate (the HUD tell of this family).
const brackets = (cls, th, land) => {
  const s = land ? 1.7 : 2.8, w = land ? 0.2 : 0.34;
  const spots = [
    ["left:0;top:0;", "border-left", "border-top"],
    ["right:0;top:0;", "border-right", "border-top"],
    ["left:0;bottom:0;", "border-left", "border-bottom"],
    ["right:0;bottom:0;", "border-right", "border-bottom"],
  ];
  return spots.map(([pos, a, b]) =>
    `<span class="${cls}" style="position:absolute;${pos}width:${s}cqw;height:${s}cqw;${a}:${w}cqw solid ${th.accent};${b}:${w}cqw solid ${th.accent};opacity:0;box-shadow:0 0 ${land ? 1 : 1.6}cqw ${rgba(th.accent, 0.5)};pointer-events:none;"></span>`).join("");
};

// The family's headline entrance: each line rides up inside a clipped row,
// stretched and charge-blurred, and cracks flat. Hidden state is opacity:0.
const slamLines = (lines, size, color, cls, th, weight) => lines.map((ln) => `
        <div style="overflow:hidden;padding:${r(size * 0.08)}cqw 0;">
          <div class="${cls}" style="opacity:0;font-family:${th.displayStack};font-weight:${weight || 800};font-size:${r(size)}cqw;line-height:1.04;letter-spacing:${th.upper ? "0.01em" : "-0.015em"};${th.upper ? "text-transform:uppercase;" : ""}color:${color};">${esc(ln)}</div>
        </div>`).join("");
const slamIn = (cls, at, land, stagger) =>
  `tl.fromTo(".${cls}",{opacity:0,yPercent:120,scaleY:1.5,filter:"blur(${land ? 9 : 13}px)"},{opacity:1,yPercent:0,scaleY:1,filter:"blur(0px)",duration:0.62,ease:"expo.out",stagger:${stagger || 0.12}},${r(at)});`;

// Kicker: a live status dot + letterspaced label, always on the (lifted) accent.
const kickerRow = (id, text, th, land, center) => (text ? `
      <div id="${id}-kick" style="opacity:0;display:flex;align-items:center;${center ? "justify-content:center;" : ""}gap:${land ? 0.8 : 1.3}cqw;margin-bottom:${land ? 1.1 : 1.8}cqw;">
        <span style="display:block;width:${land ? 0.5 : 0.82}cqw;height:${land ? 0.5 : 0.82}cqw;border-radius:50%;background:${th.accent};box-shadow:0 0 ${land ? 1.1 : 1.8}cqw ${rgba(th.accent, 0.95)};"></span>
        <span style="font-family:${th.monoStack};font-size:${land ? 1.02 : 1.7}cqw;letter-spacing:0.32em;text-transform:uppercase;color:${th.accentText};">${esc(text)}</span>
      </div>` : "");

// A light sweep that crosses a block of type once, then leaves.
const sweepEl = (id, th) =>
  `<div id="${id}-sweep" style="position:absolute;left:0;top:-14%;bottom:-14%;width:28%;opacity:0;background:linear-gradient(100deg, transparent 0%, ${rgba(th.ink, 0.55)} 48%, transparent 100%);"></div>`;
const sweepIn = (id, at) => [
  `tl.fromTo("#${id}-sweep",{opacity:0,xPercent:-160,skewX:-16},{opacity:1,xPercent:200,skewX:-16,duration:1,ease:"power2.inOut"},${r(at)});`,
  `tl.to("#${id}-sweep",{opacity:0,duration:0.28,ease:"none"},${r(at + 0.82)});`,
];

// A designed plate for a media slot with no asset — a charged signal core with
// concentric rings and the brand mark. Never a black void.
const signalPlate = (id, th, land, brand, url, big) => `
        <div style="position:absolute;inset:0;background:radial-gradient(ellipse 72% 64% at 50% 46%, ${rgba(th.accent, 0.3)} 0%, ${rgba(th.accent2, 0.1)} 44%, transparent 78%), ${th.well};"></div>
        <div style="position:absolute;inset:0;opacity:0.55;background-image:linear-gradient(${rgba(th.ink, 0.07)} ${th.hairW}cqw, transparent ${th.hairW}cqw), linear-gradient(90deg, ${rgba(th.ink, 0.07)} ${th.hairW}cqw, transparent ${th.hairW}cqw);background-size:${land ? 3.4 : 5}cqw ${land ? 3.4 : 5}cqw;"></div>
        <svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible;">
          <circle class="${id}-sr" cx="100" cy="100" r="34" fill="none" stroke="${rgba(th.accent, 0.5)}" stroke-width="1.2"/>
          <circle class="${id}-sr" cx="100" cy="100" r="54" fill="none" stroke="${rgba(th.accent2, 0.36)}" stroke-width="1"/>
          <circle class="${id}-sr" cx="100" cy="100" r="76" fill="none" stroke="${rgba(th.accent, 0.2)}" stroke-width="0.9"/>
        </svg>
        <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${land ? 0.9 : 1.4}cqw;">
          <div style="font-family:${th.displayStack};font-weight:800;font-size:${big ? (land ? 3.2 : 4.8) : (land ? 2 : 2.9)}cqw;letter-spacing:0.05em;text-transform:uppercase;color:${th.ink};text-shadow:0 0 ${land ? 2 : 3}cqw ${rgba(th.accent, 0.6)};">${esc(String(brand).slice(0, 16))}</div>
          <div style="width:${big ? (land ? 9 : 14) : (land ? 5 : 8)}cqw;height:${land ? 0.16 : 0.26}cqw;background:${th.accent};box-shadow:0 0 ${land ? 1.2 : 2}cqw ${rgba(th.accent, 0.95)};"></div>
          ${big ? `<div style="font-family:${th.monoStack};font-size:${land ? 1 : 1.6}cqw;letter-spacing:0.3em;text-transform:uppercase;color:${th.soft};">${esc(url)}</div>` : ""}
        </div>`;

// ---- scenes -------------------------------------------------------------------

// 1. OPENER — the title ignites: rails snap, the line slams up, the bar charges.
function ignitetitle(scene, ctx) {
  const { id, T, L, theme: th, land, brand } = ctx;
  const raw = Array.isArray(scene.lines) && scene.lines.length ? scene.lines : breakLines(scene.headline, scene.subtext);
  const lines = raw.slice(0, 3).map((l) => fit(String(l), 28)).filter(Boolean);
  const kicker = fit(String(scene.kicker || scene.eyebrow || brand || ""), 22).toUpperCase();
  const body = fit(String(scene.body || (scene.headline ? scene.subtext : "") || ""), 110);
  const size = headSize(lines.length ? lines : [String(brand)], land, 7.4);
  const center = th.center;
  const align = center ? "align-items:center;text-align:center;" : "align-items:flex-start;text-align:left;";
  const railW = land ? 30 : 60;
  const html = `
    <div id="${id}-core" style="position:absolute;inset:${land ? "-20% -8%" : "-6% -22%"};opacity:0;background:radial-gradient(ellipse 44% 44% at ${center ? 50 : 34}% 50%, ${rgba(th.accent, 0.34)} 0%, ${rgba(th.accent2, 0.12)} 40%, transparent 72%);"></div>
    <div style="position:absolute;left:${land ? 8 : 7}cqw;right:${land ? 8 : 7}cqw;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;${align}">
      <div class="${id}-rail" style="width:${railW}cqw;height:${land ? 0.16 : 0.26}cqw;background:linear-gradient(90deg, ${th.accent}, ${rgba(th.accent2, 0.05)});box-shadow:0 0 ${land ? 1.3 : 2.1}cqw ${rgba(th.accent, 0.8)};transform-origin:${center ? "center" : "left"} center;margin-bottom:${land ? 1.5 : 2.4}cqw;"></div>
      ${kickerRow(id, kicker, th, land, center)}
      <div style="position:relative;overflow:hidden;padding:${land ? 0.3 : 0.6}cqw 0;">
        ${slamLines(lines, size, th.ink, `${id}-ln`, th, 800)}
        ${sweepEl(id, th)}
      </div>
      <div class="${id}-rail" style="width:${railW}cqw;height:${land ? 0.16 : 0.26}cqw;background:linear-gradient(90deg, ${th.accent2}, ${rgba(th.accent, 0.05)});box-shadow:0 0 ${land ? 1.3 : 2.1}cqw ${rgba(th.accent2, 0.75)};transform-origin:${center ? "center" : "left"} center;margin-top:${land ? 1.5 : 2.4}cqw;"></div>
      ${body ? `<div id="${id}-body" style="opacity:0;margin-top:${land ? 1.7 : 2.7}cqw;max-width:${land ? 48 : 84}cqw;font-family:${th.bodyStack};font-size:${land ? 1.42 : 2.35}cqw;line-height:1.55;color:${th.body};">${esc(body)}</div>` : ""}
      <div id="${id}-chg" style="opacity:0;margin-top:${land ? 2 : 3.2}cqw;width:${land ? 34 : 66}cqw;height:${land ? 0.7 : 1.15}cqw;border-radius:${land ? 0.35 : 0.6}cqw;background:${rgba(th.ink, 0.12)};overflow:hidden;">
        <div id="${id}-chgf" style="width:100%;height:100%;transform-origin:left center;background:linear-gradient(90deg, ${th.accent}, ${th.spark});box-shadow:0 0 ${land ? 1.4 : 2.2}cqw ${rgba(th.accent, 0.7)};"></div>
      </div>
    </div>`;
  const s = [
    `tl.fromTo("#${id}-core",{opacity:0,scale:0.5},{opacity:1,scale:1,duration:0.9,ease:"power3.out"},${T});`,
    `tl.to("#${id}-core",{opacity:0.7,scale:1.07,duration:1.9,ease:"sine.inOut",yoyo:true,repeat:reps(${r(Math.max(0.2, L - 0.9))},1.9)},${r(T + 0.9)});`,
    `tl.fromTo(".${id}-rail",{scaleX:0},{scaleX:1,duration:0.5,ease:"expo.out",stagger:0.1},${r(T + 0.1)});`,
    kicker ? `tl.fromTo("#${id}-kick",{opacity:0,y:${land ? -14 : -20}},{opacity:1,y:0,duration:0.5,ease:"power3.out"},${r(T + 0.25)});` : "",
    slamIn(`${id}-ln`, T + 0.35, land),
    ...sweepIn(id, r(T + 0.85)),
    body ? `tl.fromTo("#${id}-body",{opacity:0,y:${land ? 22 : 30}},{opacity:1,y:0,duration:0.6,ease:"power3.out"},${r(T + 0.95)});` : "",
    `tl.fromTo("#${id}-chg",{opacity:0},{opacity:1,duration:0.4},${r(T + 1)});`,
    `tl.fromTo("#${id}-chgf",{scaleX:0},{scaleX:1,duration:${r(Math.min(2.2, Math.max(0.9, L * 0.55)))},ease:"power1.inOut"},${r(T + 1.05)});`,
  ];
  return { html, s };
}

// 2. The product plate: the shot locked inside a HUD frame with a live scan line.
function chargeplate(scene, ctx, asset) {
  const { id, T, L, theme: th, land, variant, brand, url } = ctx;
  const lines = breakLines(scene.headline, "").slice(0, 2).map((l) => fit(String(l), 30));
  const kicker = fit(String(scene.kicker || scene.eyebrow || ""), 22).toUpperCase();
  const body = fit(String(scene.body || scene.subtext || ""), 130);
  const right = variant % 2 === 0;
  const size = r(Math.min(land ? 4.5 : 6.6, (land ? 40 : 84) / Math.max(...lines.map((l) => l.length), 1) * (land ? 1.5 : 1.7)));
  const radius = land ? 1 : 1.6;
  const plateBox = land
    ? `${right ? "right" : "left"}:6cqw;top:13%;bottom:13%;width:45cqw;`
    : `left:6cqw;right:6cqw;top:11%;height:38%;`;
  const textBox = land
    ? `${right ? "left" : "right"}:6cqw;width:38cqw;top:0;bottom:0;`
    : `left:6cqw;right:6cqw;top:53%;bottom:12%;`;
  const html = `
    <div id="${id}-halo" style="position:absolute;${land ? (right ? "left:32cqw;right:-8cqw;" : "right:32cqw;left:-8cqw;") : "left:-12cqw;right:-12cqw;"}top:${land ? "-16%" : "-2%"};bottom:${land ? "-16%" : "52%"};opacity:0;background:radial-gradient(ellipse 50% 46% at 50% 50%, ${rgba(th.accent, 0.26)} 0%, ${rgba(th.accent2, 0.08)} 44%, transparent 74%);"></div>
    <div id="${id}-plate" style="position:absolute;${plateBox}opacity:0;${hudCss(th, land, radius)}">
      <div style="position:absolute;inset:${land ? 0.8 : 1.3}cqw;border-radius:${r(radius * 0.6)}cqw;overflow:hidden;background:${th.well};border:${th.hairW}cqw solid ${th.hair};">
        ${asset && asset.path
      ? `<img id="${id}-img" src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="width:100%;height:100%;object-fit:cover;object-position:top center;display:block;">`
      : signalPlate(id, th, land, brand, url, true)}
        <div id="${id}-scan" style="position:absolute;left:0;right:0;top:0;height:${land ? 4 : 6}cqw;opacity:0;background:linear-gradient(180deg, transparent 0%, ${rgba(th.accent, 0.32)} 70%, ${rgba(th.accent, 0.9)} 100%);"></div>
      </div>
      ${brackets(`${id}-bk`, th, land)}
      <div style="position:absolute;left:${land ? 1.4 : 2.2}cqw;bottom:${land ? -2.4 : -3.8}cqw;display:flex;align-items:center;gap:${land ? 0.7 : 1.1}cqw;">
        <span id="${id}-tag" style="opacity:0;font-family:${th.monoStack};font-size:${land ? 0.92 : 1.5}cqw;letter-spacing:0.26em;text-transform:uppercase;color:${th.accentText2};">${esc(String(brand).slice(0, 14).toUpperCase())}</span>
      </div>
    </div>
    <div style="position:absolute;${textBox}display:flex;flex-direction:column;justify-content:center;">
      ${kickerRow(id, kicker, th, land, false)}
      <div style="position:relative;overflow:hidden;">${slamLines(lines, size, th.ink, `${id}-ln`, th, 800)}</div>
      ${body ? `<div id="${id}-body" style="opacity:0;margin-top:${land ? 1.4 : 2.2}cqw;font-family:${th.bodyStack};font-size:${land ? 1.38 : 2.3}cqw;line-height:1.6;color:${th.body};">${esc(body)}</div>` : ""}
      <div id="${id}-urule" style="opacity:0;margin-top:${land ? 1.7 : 2.6}cqw;width:${land ? 16 : 28}cqw;height:${land ? 0.14 : 0.24}cqw;background:linear-gradient(90deg, ${th.accent}, ${rgba(th.spark, 0.1)});box-shadow:0 0 ${land ? 1.2 : 2}cqw ${rgba(th.accent, 0.8)};transform-origin:left center;"></div>
    </div>`;
  const s = [
    `tl.fromTo("#${id}-halo",{opacity:0,scale:0.72},{opacity:1,scale:1,duration:1,ease:"power3.out"},${T});`,
    `tl.to("#${id}-halo",{opacity:0.64,duration:2,ease:"sine.inOut",yoyo:true,repeat:reps(${r(Math.max(0.2, L - 1))},2)},${r(T + 1)});`,
    `tl.fromTo("#${id}-plate",{opacity:0,x:${right ? (land ? 50 : 0) : (land ? -50 : 0)},y:${land ? 0 : 34},scale:0.95},{opacity:1,x:0,y:0,scale:1,duration:0.62,ease:"expo.out"},${r(T + 0.12)});`,
    `tl.fromTo(".${id}-bk",{opacity:0,scale:2.1},{opacity:1,scale:1,duration:0.42,ease:"power3.out",stagger:0.06},${r(T + 0.42)});`,
    asset && asset.path
      ? `tl.fromTo("#${id}-img",{scale:1.12,yPercent:2.5},{scale:1,yPercent:0,duration:${r(Math.max(1.2, L - 0.5))},ease:"sine.out"},${r(T + 0.4)});`
      : `tl.fromTo(".${id}-sr",{opacity:0,scale:0.5,svgOrigin:"100 100"},{opacity:1,scale:1,duration:0.7,ease:"power3.out",stagger:0.1},${r(T + 0.4)});`,
    `tl.fromTo("#${id}-scan",{opacity:0,yPercent:-100},{opacity:1,yPercent:${land ? 1300 : 900},duration:${r(Math.min(2.4, Math.max(1.1, L * 0.6)))},ease:"none"},${r(T + 0.6)});`,
    `tl.to("#${id}-scan",{opacity:0,duration:0.3,ease:"none"},${r(T + Math.min(2.4, Math.max(1.1, L * 0.6)) + 0.6)});`,
    `tl.fromTo("#${id}-tag",{opacity:0,x:-18},{opacity:1,x:0,duration:0.45},${r(T + 0.7)});`,
    kicker ? `tl.fromTo("#${id}-kick",{opacity:0,x:-22},{opacity:1,x:0,duration:0.5,ease:"power3.out"},${r(T + 0.3)});` : "",
    slamIn(`${id}-ln`, T + 0.4, land),
    body ? `tl.fromTo("#${id}-body",{opacity:0,y:${land ? 20 : 26}},{opacity:1,y:0,duration:0.6,ease:"power3.out"},${r(T + 0.78)});` : "",
    `tl.fromTo("#${id}-urule",{opacity:0,scaleX:0},{opacity:1,scaleX:1,duration:0.55,ease:"power3.out"},${r(T + 0.95)});`,
  ];
  return { html, s };
}

// 3. The stage list: numbered rows firing down a glowing spine.
function sequence(scene, ctx) {
  const { id, T, theme: th, land } = ctx;
  let items = (Array.isArray(scene.items) && scene.items.length ? scene.items : bullets(scene, 4))
    .map((b) => fit(String(b), 44)).filter(Boolean).slice(0, 4);
  if (!items.length) items = [fit(String(scene.subtext || scene.body || ""), 44)].filter(Boolean);
  const lines = breakLines(scene.headline, "").slice(0, 2).map((l) => fit(String(l), 30));
  const kicker = fit(String(scene.kicker || scene.eyebrow || ""), 22).toUpperCase();
  const n = Math.max(items.length, 1);
  const solo = n === 1;
  const headFs = r(Math.min(land ? 4.2 : 6.3, (land ? 74 : 84) / Math.max(...lines.map((l) => l.length), 1) * (land ? 1.5 : 1.7)));
  const longest = Math.max(...items.map((s2) => s2.length), 1);
  const rowFs = r(solo
    ? Math.min(land ? 3 : 4.4, (land ? 64 : 74) / longest * (land ? 1.7 : 1.9))
    : Math.min(land ? (n >= 4 ? 1.85 : 2.15) : (n >= 4 ? 2.9 : 3.4), (land ? 52 : 64) / longest * (land ? 1.55 : 1.75)));
  const padY = solo ? (land ? 3.2 : 5) : (land ? (n >= 4 ? 1.05 : 1.5) : (n >= 4 ? 1.9 : 2.5));
  const gap = land ? (n >= 4 ? 0.9 : 1.3) : (n >= 4 ? 1.6 : 2.2);
  const rows = items.map((t, i2) => `
      <div class="${id}-row" style="opacity:0;position:relative;display:flex;align-items:center;gap:${land ? 1.5 : 2.3}cqw;padding:${padY}cqw ${land ? 2 : 3}cqw;margin-top:${i2 ? gap : 0}cqw;${hudCss(th, land, land ? 0.6 : 1)}">
        <span style="font-family:${th.monoStack};font-size:${land ? 1.1 : 1.8}cqw;letter-spacing:0.16em;color:${i2 % 2 ? th.accent2 : th.accent};min-width:${land ? 3 : 4.8}cqw;text-shadow:0 0 ${land ? 1 : 1.6}cqw ${rgba(i2 % 2 ? th.accent2 : th.accent, 0.7)};">${String(i2 + 1).padStart(2, "0")}</span>
        <span style="flex:1;font-family:${th.displayStack};font-weight:700;font-size:${rowFs}cqw;line-height:1.28;letter-spacing:${th.upper ? "0.01em" : "-0.01em"};${th.upper ? "text-transform:uppercase;" : ""}color:${th.ink};">${esc(t)}</span>
        <span style="display:block;width:${land ? 4.6 : 7}cqw;height:${land ? 0.3 : 0.5}cqw;border-radius:${land ? 0.15 : 0.25}cqw;background:${rgba(th.ink, 0.12)};overflow:hidden;">
          <span class="${id}-bar" style="display:block;width:100%;height:100%;transform-origin:left center;background:${i2 % 2 ? th.accent2 : th.accent};box-shadow:0 0 ${land ? 0.9 : 1.5}cqw ${rgba(i2 % 2 ? th.accent2 : th.accent, 0.9)};"></span>
        </span>
      </div>`).join("");
  const html = `
    <div id="${id}-wash" style="position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse 58% 52% at ${land ? "18% 34%" : "26% 26%"}, ${rgba(th.accent, 0.22)} 0%, transparent 68%);"></div>
    <div style="position:absolute;left:${land ? 7 : 6}cqw;right:${land ? 7 : 6}cqw;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;">
      ${kickerRow(id, kicker, th, land, false)}
      <div style="position:relative;overflow:hidden;">${slamLines(lines, headFs, th.ink, `${id}-head`, th, 800)}</div>
      <div style="position:relative;margin-top:${land ? 2 : 3.2}cqw;padding-left:${land ? 1.4 : 2.2}cqw;">
        <div id="${id}-spine" style="position:absolute;left:0;top:0;bottom:0;width:${land ? 0.24 : 0.4}cqw;background:linear-gradient(180deg, ${th.accent}, ${th.accent2});box-shadow:0 0 ${land ? 1.2 : 2}cqw ${rgba(th.accent, 0.8)};transform-origin:center top;"></div>
        ${rows}
      </div>
    </div>`;
  const s = [
    `tl.fromTo("#${id}-wash",{opacity:0},{opacity:1,duration:0.9,ease:"power2.out"},${T});`,
    kicker ? `tl.fromTo("#${id}-kick",{opacity:0,x:-22},{opacity:1,x:0,duration:0.5,ease:"power3.out"},${r(T + 0.15)});` : "",
    slamIn(`${id}-head`, T + 0.25, land),
    `tl.fromTo("#${id}-spine",{scaleY:0},{scaleY:1,duration:0.55,ease:"expo.out"},${r(T + 0.5)});`,
    `tl.fromTo(".${id}-row",{opacity:0,x:${land ? -44 : -34}},{opacity:1,x:0,duration:0.5,ease:"expo.out",stagger:0.14},${r(T + 0.6)});`,
    `tl.fromTo(".${id}-bar",{scaleX:0},{scaleX:1,duration:0.6,ease:"power2.out",stagger:0.14},${r(T + 0.82)});`,
  ];
  return { html, s };
}

// 4. The surge metric: a counter over a charged core on a segmented power gauge.
function surge(scene, ctx) {
  const { id, T, L, theme: th, land } = ctx;
  const stats = statsOf(scene, 3);
  const main = stats[0] || null;
  const rest = stats.slice(1, 3);
  const head = fit(String(scene.headline || ""), 44);
  const label = fit(String((main && main.l) || scene.emphasis || ""), 26).toUpperCase();
  const hero = main ? "" : fit(String(scene.emphasis || scene.headline || ""), 14);
  const numChars = main ? String(main.v).length + main.suf.length + main.pre.length : Math.max(hero.length, 1);
  const numFs = main
    ? r(Math.min(land ? 13 : 20, (land ? 22 : 36) / Math.max(numChars, 1) * 4.4))
    : r(Math.min(land ? 6.4 : 9.6, (land ? 22 : 40) / Math.max(hero.length, 1) * 2.4));
  const segs = 12;
  const segRow = new Array(segs).fill(0).map((_, i) => `
        <span class="${id}-seg" style="flex:1;height:100%;border-radius:${land ? 0.12 : 0.2}cqw;background:${i < segs - 3 ? th.accent : th.spark};box-shadow:0 0 ${land ? 0.9 : 1.5}cqw ${rgba(i < segs - 3 ? th.accent : th.spark, 0.8)};transform-origin:center bottom;"></span>`).join("");
  const chip = (st) => `
        <div class="${id}-chip" style="opacity:0;display:flex;align-items:baseline;gap:${land ? 0.6 : 1}cqw;padding:${land ? 0.6 : 1}cqw ${land ? 1.3 : 2.1}cqw;${hudCss(th, land, land ? 0.4 : 0.7)}">
          <span style="font-family:${th.displayStack};font-weight:800;font-size:${land ? 1.65 : 2.7}cqw;color:${th.accentText2};">${esc(st.pre)}${esc(String(st.isFloat ? st.v.toFixed(1) : Math.round(st.v)))}${esc(st.suf)}</span>
          <span style="font-family:${th.monoStack};font-size:${land ? 0.92 : 1.55}cqw;letter-spacing:0.18em;text-transform:uppercase;color:${th.soft};">${esc(fit(st.l, 18))}</span>
        </div>`;
  const html = `
    <div id="${id}-core" style="position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse ${land ? "34% 48%" : "46% 26%"} at 50% 46%, ${rgba(th.accent, 0.34)} 0%, ${rgba(th.accent2, 0.11)} 42%, transparent 72%);"></div>
    <div style="position:absolute;left:6cqw;right:6cqw;top:0;bottom:0;display:flex;flex-direction:column;align-items:center;justify-content:center;">
      ${head ? `<div id="${id}-head" style="opacity:0;margin-bottom:${land ? 1.3 : 2.1}cqw;font-family:${th.monoStack};font-size:${land ? 1.2 : 2}cqw;letter-spacing:0.3em;text-transform:uppercase;color:${th.soft};text-align:center;max-width:74cqw;">${esc(head)}</div>` : ""}
      <div id="${id}-num" style="opacity:0;font-family:${th.displayStack};font-weight:800;font-size:${numFs}cqw;line-height:1;letter-spacing:-0.03em;${th.upper ? "text-transform:uppercase;" : ""}color:${th.ink};text-shadow:0 0 ${land ? 3.2 : 5}cqw ${rgba(th.accent, 0.6)};">${main ? `${esc(main.pre)}0${esc(main.suf)}` : esc(hero)}</div>
      <div id="${id}-gauge" style="opacity:0;margin-top:${land ? 1.5 : 2.4}cqw;width:${land ? 40 : 74}cqw;height:${land ? 1.1 : 1.8}cqw;display:flex;gap:${land ? 0.4 : 0.65}cqw;">${segRow}</div>
      ${label && label !== head.toUpperCase() ? `<div id="${id}-lab" style="opacity:0;margin-top:${land ? 1.3 : 2.1}cqw;font-family:${th.monoStack};font-size:${land ? 1.2 : 2}cqw;letter-spacing:0.28em;text-transform:uppercase;color:${th.body};text-align:center;max-width:72cqw;">${esc(label)}</div>` : ""}
      ${rest.length ? `<div style="margin-top:${land ? 1.8 : 2.8}cqw;display:flex;gap:${land ? 1.1 : 1.7}cqw;flex-wrap:wrap;justify-content:center;">${rest.map(chip).join("")}</div>` : ""}
    </div>`;
  const s = [
    `tl.fromTo("#${id}-core",{opacity:0,scale:0.58},{opacity:1,scale:1,duration:0.95,ease:"power3.out"},${T});`,
    `tl.to("#${id}-core",{opacity:0.7,duration:1.8,ease:"sine.inOut",yoyo:true,repeat:reps(${r(Math.max(0.2, L - 0.95))},1.8)},${r(T + 0.95)});`,
    head ? `tl.fromTo("#${id}-head",{opacity:0,y:${land ? -16 : -22}},{opacity:1,y:0,duration:0.55,ease:"power3.out"},${r(T + 0.25)});` : "",
    `tl.fromTo("#${id}-num",{opacity:0,scaleY:1.6,y:${land ? 34 : 48},filter:"blur(${land ? 10 : 14}px)"},{opacity:1,scaleY:1,y:0,filter:"blur(0px)",duration:0.62,ease:"expo.out"},${r(T + 0.32)});`,
    main ? `countTxt("#${id}-num",${main.v},${r(T + 0.4)},${r(Math.min(1.7, Math.max(0.8, L * 0.5)))},${JSON.stringify(main.pre)},${JSON.stringify(main.suf)},${main.isFloat ? 10 : 1});` : "",
    `tl.fromTo("#${id}-gauge",{opacity:0},{opacity:1,duration:0.3},${r(T + 0.6)});`,
    `tl.fromTo(".${id}-seg",{opacity:0.14,scaleY:0.3},{opacity:1,scaleY:1,duration:0.24,ease:"power2.out",stagger:${r(Math.min(0.085, Math.max(0.035, L * 0.02)))}},${r(T + 0.65)});`,
    label && label !== head.toUpperCase() ? `tl.fromTo("#${id}-lab",{opacity:0,y:${land ? 20 : 26}},{opacity:1,y:0,duration:0.55,ease:"power3.out"},${r(T + 1)});` : "",
    rest.length ? `tl.fromTo(".${id}-chip",{opacity:0,y:${land ? 22 : 30}},{opacity:1,y:0,duration:0.55,ease:"power3.out",stagger:0.13},${r(T + 1.15)});` : "",
  ];
  return { html, s };
}

// 5. The transmission: the quote as an incoming signal on a HUD panel.
function transmission(scene, ctx, asset) {
  const { id, T, theme: th, land, brand } = ctx;
  const quote = fit(String(scene.quote || scene.subtext || scene.headline || ""), 150);
  const words = quote.split(/\s+/).filter(Boolean);
  const author = fit(String(scene.author || scene.emphasis || ""), 30);
  const role = fit(String(scene.role || brand || ""), 34);
  const initial = (author || String(brand || "")).trim().charAt(0).toUpperCase() || "•";
  // The attribution disc carries the speaker's face when a photo is cast to this
  // scene; with no asset it degrades to the charged monogram disc.
  const discSz = land ? 3.2 : 5.2;
  const disc = asset && asset.path
    ? `<span style="display:block;width:${discSz}cqw;height:${discSz}cqw;border-radius:50%;overflow:hidden;background:${th.well};border:${th.hairW}cqw solid ${th.edge};box-shadow:0 0 ${land ? 1.8 : 2.9}cqw ${rgba(th.accent, 0.7)};"><img src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="width:100%;height:100%;object-fit:cover;object-position:top center;display:block;"></span>`
    : `<span style="display:grid;place-items:center;width:${discSz}cqw;height:${discSz}cqw;border-radius:50%;background:${th.accent};color:${th.onAccent};font-family:${th.displayStack};font-weight:800;font-size:${land ? 1.45 : 2.35}cqw;box-shadow:0 0 ${land ? 1.8 : 2.9}cqw ${rgba(th.accent, 0.7)};">${esc(initial)}</span>`;
  const size = r(Math.min(land ? 4.3 : 5.4, (land ? 150 : 152) / Math.max(words.length, 1) + (land ? 1.4 : 1.8)));
  const radius = land ? 1.1 : 1.8;
  const inset = land ? 13 : 6;
  // Deterministic signal trace under the quote.
  const pts = [];
  for (let i = 0; i <= 60; i++) {
    const x = r((i / 60) * 300);
    const k = i / 60;
    const y = r(20 + Math.sin(k * 19) * 11 * (0.35 + 0.65 * Math.sin(k * 5.5)) * (i === 0 || i === 60 ? 0 : 1));
    pts.push(`${i ? "L" : "M"}${x} ${y}`);
  }
  const trace = pts.join(" ");
  const html = `
    <div id="${id}-wash" style="position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse 56% 52% at 32% 46%, ${rgba(th.accent2, 0.24)} 0%, transparent 70%);"></div>
    <div id="${id}-panel" style="position:absolute;left:${inset}cqw;right:${inset}cqw;top:${land ? "17%" : "25%"};bottom:${land ? "17%" : "25%"};opacity:0;${hudCss(th, land, radius)}overflow:hidden;">
      <div id="${id}-edge" style="position:absolute;left:0;top:0;bottom:0;width:${land ? 0.3 : 0.48}cqw;background:linear-gradient(180deg, ${th.accent}, ${th.accent2});box-shadow:0 0 ${land ? 2 : 3.2}cqw ${rgba(th.accent, 0.9)};transform-origin:center top;"></div>
      ${brackets(`${id}-bk`, th, land)}
      <div style="position:absolute;left:${land ? 4.4 : 5.6}cqw;right:${land ? 4.4 : 5.6}cqw;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;">
        <div id="${id}-mark" style="opacity:0;font-family:${th.displayStack};font-weight:800;font-size:${land ? 5.4 : 8.4}cqw;line-height:0.7;color:${th.accentText};text-shadow:0 0 ${land ? 2 : 3}cqw ${rgba(th.accent, 0.6)};">&ldquo;</div>
        <div style="margin-top:${land ? 1.2 : 2}cqw;display:flex;flex-wrap:wrap;">
          ${words.map((w) => `<span class="${id}-w" style="opacity:0;font-family:${th.displayStack};font-weight:600;font-size:${size}cqw;line-height:1.4;letter-spacing:-0.01em;color:${th.ink};margin-right:0.5em;">${esc(w)}</span>`).join("")}
        </div>
        <svg id="${id}-sig" viewBox="0 0 300 40" preserveAspectRatio="none" style="width:100%;height:${land ? 2.6 : 4.2}cqw;margin-top:${land ? 1.4 : 2.2}cqw;opacity:0;overflow:visible;">
          <path d="M0 20 L300 20" stroke="${rgba(th.ink, 0.12)}" stroke-width="0.7" fill="none"/>
          <path id="${id}-trace" d="${trace}" fill="none" stroke="${th.accent2}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100" style="filter:drop-shadow(0 0 3px ${rgba(th.accent2, 0.85)});"/>
        </svg>
        <div id="${id}-att" style="opacity:0;margin-top:${land ? 1.8 : 2.8}cqw;display:flex;align-items:center;gap:${land ? 1.1 : 1.9}cqw;">
          ${disc}
          <span>
            ${author ? `<span style="display:block;font-family:${th.displayStack};font-weight:800;font-size:${land ? 1.45 : 2.35}cqw;color:${th.ink};">${esc(author)}</span>` : ""}
            ${role ? `<span style="display:block;margin-top:0.3cqw;font-family:${th.monoStack};font-size:${land ? 1 : 1.7}cqw;letter-spacing:0.2em;text-transform:uppercase;color:${th.soft};">${esc(role)}</span>` : ""}
          </span>
        </div>
      </div>
    </div>`;
  const s = [
    `tl.fromTo("#${id}-wash",{opacity:0},{opacity:1,duration:0.9,ease:"power2.out"},${T});`,
    `tl.fromTo("#${id}-panel",{opacity:0,y:${land ? 28 : 38},scale:0.97},{opacity:1,y:0,scale:1,duration:0.6,ease:"expo.out"},${r(T + 0.1)});`,
    `tl.fromTo(".${id}-bk",{opacity:0,scale:2},{opacity:1,scale:1,duration:0.4,ease:"power3.out",stagger:0.06},${r(T + 0.35)});`,
    `tl.fromTo("#${id}-edge",{scaleY:0},{scaleY:1,duration:0.6,ease:"expo.out"},${r(T + 0.3)});`,
    `tl.fromTo("#${id}-mark",{opacity:0,y:${land ? 18 : 24}},{opacity:1,y:0,duration:0.45,ease:"power3.out"},${r(T + 0.38)});`,
    `tl.fromTo(".${id}-w",{opacity:0,y:${land ? 14 : 20},scaleX:1.3},{opacity:1,y:0,scaleX:1,duration:0.4,ease:"power2.out",stagger:0.045},${r(T + 0.5)});`,
    `tl.fromTo("#${id}-sig",{opacity:0},{opacity:1,duration:0.3},${r(T + 0.95)});`,
    `tl.fromTo("#${id}-trace",{strokeDashoffset:100},{strokeDashoffset:0,duration:1.1,ease:"power1.inOut"},${r(T + 1)});`,
    `tl.fromTo("#${id}-att",{opacity:0,x:-24},{opacity:1,x:0,duration:0.55,ease:"power3.out"},${r(T + 1.2)});`,
  ];
  return { html, s };
}

// 6. The proof burst: HUD tiles snapping in on their own beats.
function gridburst(scene, ctx, a, b) {
  const { id, T, theme: th, land, brand, url } = ctx;
  const lines = breakLines(scene.headline, "").slice(0, 2).map((l) => fit(String(l), 30));
  const kicker = fit(String(scene.kicker || scene.eyebrow || ""), 22).toUpperCase();
  const st = mineStat(scene.badge) || mineStat(scene.emphasis) || mineStat(scene.subtext) || statsOf(scene, 1)[0] || null;
  const badge = fit(String(scene.badge || (st ? `${st.pre}${st.isFloat ? st.v.toFixed(1) : Math.round(st.v)}${st.suf}` : String(brand).slice(0, 3).toUpperCase())), 8);
  const badgeLabel = fit(String(scene.badgeLabel || (st && st.l) || ""), 22).toUpperCase();
  const headFs = r(Math.min(land ? 3.9 : 5.6, (land ? 72 : 82) / Math.max(...lines.map((l) => l.length), 1) * (land ? 1.5 : 1.7)));
  const radius = land ? 0.7 : 1.1;
  const mediaTile = (asset, cls, n) => `
      <div class="${cls} ${id}-tile" style="opacity:0;position:relative;overflow:hidden;${hudCss(th, land, radius)}">
        ${asset && asset.path
      ? `<img src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="width:100%;height:100%;object-fit:cover;object-position:top center;display:block;">`
      : signalPlate(id, th, land, brand, url, false)}
        <span style="position:absolute;left:${land ? 0.6 : 1}cqw;top:${land ? 0.6 : 1}cqw;font-family:${th.monoStack};font-size:${land ? 0.9 : 1.5}cqw;letter-spacing:0.18em;color:${th.accentText};text-shadow:0 0 ${land ? 0.8 : 1.3}cqw ${rgba(th.accent, 0.8)};">${n}</span>
      </div>`;
  const html = `
    <div id="${id}-wash" style="position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse 62% 54% at 50% ${land ? 76 : 68}%, ${rgba(th.accent, 0.2)} 0%, transparent 70%);"></div>
    <div style="position:absolute;left:${land ? 7 : 6}cqw;right:${land ? 7 : 6}cqw;top:${land ? "13%" : "11%"};">
      ${kickerRow(id, kicker, th, land, false)}
      <div style="position:relative;overflow:hidden;">${slamLines(lines, headFs, th.ink, `${id}-head`, th, 800)}</div>
    </div>
    <div style="position:absolute;left:${land ? 7 : 6}cqw;right:${land ? 7 : 6}cqw;top:${land ? "45%" : "39%"};bottom:${land ? "14%" : "13%"};display:grid;grid-template-columns:${land ? "1fr 1fr 1fr 1fr" : "1fr 1fr"};grid-template-rows:${land ? "1fr" : "1fr 1fr"};gap:${land ? 1.1 : 1.7}cqw;">
      ${mediaTile(a, `${id}-t1`, "01")}
      ${mediaTile(b, `${id}-t2`, "02")}
      <div class="${id}-t3 ${id}-tile" style="opacity:0;position:relative;display:grid;place-items:center;overflow:hidden;${hudCss(th, land, radius)}">
        <div style="position:absolute;inset:0;background:radial-gradient(ellipse 74% 66% at 50% 46%, ${rgba(th.accent, 0.26)} 0%, transparent 72%);"></div>
        <div style="position:relative;text-align:center;padding:${land ? 0.8 : 1.3}cqw;">
          <div style="font-family:${th.displayStack};font-weight:800;font-size:${land ? 3.4 : 5}cqw;line-height:1;color:${th.ink};text-shadow:0 0 ${land ? 2 : 3.2}cqw ${rgba(th.accent, 0.65)};">${esc(badge)}</div>
          ${badgeLabel ? `<div style="margin-top:${land ? 0.5 : 0.9}cqw;font-family:${th.monoStack};font-size:${land ? 0.88 : 1.45}cqw;letter-spacing:0.18em;text-transform:uppercase;color:${th.body};">${esc(badgeLabel)}</div>` : ""}
        </div>
      </div>
      <div class="${id}-t4 ${id}-tile" style="opacity:0;position:relative;display:grid;place-items:center;overflow:hidden;${hudCss(th, land, radius)}">
        <div style="text-align:center;padding:${land ? 0.8 : 1.3}cqw;">
          <div style="font-family:${th.displayStack};font-weight:800;font-size:${land ? 2.1 : 3.1}cqw;letter-spacing:0.03em;text-transform:uppercase;color:${th.ink};">${esc(String(brand).slice(0, 14))}</div>
          <div style="margin:${land ? 0.6 : 1}cqw auto 0;width:${land ? 5 : 8}cqw;height:${land ? 0.14 : 0.22}cqw;background:${th.accent2};box-shadow:0 0 ${land ? 1 : 1.6}cqw ${rgba(th.accent2, 0.95)};"></div>
          <div style="margin-top:${land ? 0.6 : 1}cqw;font-family:${th.monoStack};font-size:${land ? 0.88 : 1.45}cqw;letter-spacing:0.22em;text-transform:uppercase;color:${th.soft};">${esc(url)}</div>
        </div>
      </div>
    </div>`;
  const s = [
    `tl.fromTo("#${id}-wash",{opacity:0},{opacity:1,duration:0.9,ease:"power2.out"},${T});`,
    kicker ? `tl.fromTo("#${id}-kick",{opacity:0,x:-22},{opacity:1,x:0,duration:0.5,ease:"power3.out"},${r(T + 0.15)});` : "",
    slamIn(`${id}-head`, T + 0.25, land),
    `tl.fromTo(".${id}-tile",{opacity:0,y:${land ? 30 : 36},scale:0.88},{opacity:1,y:0,scale:1,duration:0.46,ease:"back.out(1.6)",stagger:0.13},${r(T + 0.6)});`,
  ];
  return { html, s };
}

// 7. CLOSER — liftoff: the closing line off a burst of rays, the pill, the url.
function launchcta(scene, ctx, asset) {
  const { id, T, L, theme: th, land, url } = ctx;
  const lines = breakLines(scene.headline, "").slice(0, 2).map((l) => fit(String(l), 26));
  const cta = fit(String(scene.cta || scene.emphasis || ""), 22);
  const kicker = fit(String(scene.kicker || scene.eyebrow || ""), 22).toUpperCase();
  const size = headSize(lines, land, 7);
  const rayN = 20;
  const rays = new Array(rayN).fill(0).map((_, i) => {
    const ang = (i / rayN) * Math.PI * 2;
    const x1 = r(100 + Math.cos(ang) * 44), y1 = r(100 + Math.sin(ang) * 44);
    const x2 = r(100 + Math.cos(ang) * (i % 3 === 0 ? 96 : 74)), y2 = r(100 + Math.sin(ang) * (i % 3 === 0 ? 96 : 74));
    return `<line class="${id}-ray" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${[th.accent, th.accent2, th.spark][i % 3]}" stroke-width="${i % 2 ? 1.4 : 2.2}" stroke-linecap="round" opacity="0"/>`;
  }).join("");
  const burstW = land ? 42 : 78;
  const html = `
    <div id="${id}-bloom" style="position:absolute;inset:${land ? "-26% -10%" : "-8% -26%"};opacity:0;background:radial-gradient(ellipse 42% 44% at 50% 52%, ${rgba(th.accent, 0.38)} 0%, ${rgba(th.accent2, 0.13)} 40%, transparent 72%);"></div>
    <svg id="${id}-burst" viewBox="0 0 200 200" style="position:absolute;left:50%;top:50%;margin-left:${r(-burstW / 2)}cqw;margin-top:${r(-burstW / 2)}cqw;width:${burstW}cqw;height:${burstW}cqw;overflow:visible;">${rays}</svg>
    <div style="position:absolute;left:${land ? 8 : 7}cqw;right:${land ? 8 : 7}cqw;top:0;bottom:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;">
      ${asset && asset.path ? `<img id="${id}-logo" src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="opacity:0;max-height:${land ? 4 : 6}cqw;max-width:${land ? 26 : 44}cqw;object-fit:contain;margin-bottom:${land ? 1.6 : 2.6}cqw;filter:drop-shadow(0 0 ${land ? 1.4 : 2.2}cqw ${rgba(th.accent, 0.5)});">` : ""}
      ${kicker ? `<div id="${id}-kick" style="opacity:0;margin-bottom:${land ? 1.3 : 2.1}cqw;font-family:${th.monoStack};font-size:${land ? 1.05 : 1.75}cqw;letter-spacing:0.34em;text-transform:uppercase;color:${th.accentText};">${esc(kicker)}</div>` : ""}
      <div style="position:relative;overflow:hidden;padding:${land ? 0.3 : 0.6}cqw 0;">
        ${slamLines(lines, size, th.ink, `${id}-ln`, th, 800)}
        ${sweepEl(id, th)}
      </div>
      ${cta ? `<div id="${id}-cta" style="opacity:0;margin-top:${land ? 2.2 : 3.4}cqw;padding:${land ? "1.1cqw 3.2cqw" : "1.8cqw 4.8cqw"};border-radius:${land ? 5 : 8}cqw;background:${th.accent};color:${th.onAccent};font-family:${th.displayStack};font-weight:800;font-size:${land ? 1.9 : 3}cqw;letter-spacing:0.02em;${th.upper ? "text-transform:uppercase;" : ""}box-shadow:0 0 ${land ? 3 : 4.8}cqw ${rgba(th.accent, 0.6)};">${esc(cta)}</div>` : ""}
      <div id="${id}-rule" style="opacity:0;margin-top:${land ? 2.2 : 3.4}cqw;width:${land ? 46 : 76}cqw;height:${land ? 0.12 : 0.2}cqw;background:linear-gradient(90deg, transparent, ${th.accent2}, transparent);transform-origin:center center;"></div>
      <div id="${id}-url" style="opacity:0;margin-top:${land ? 1.3 : 2.1}cqw;font-family:${th.monoStack};font-size:${land ? 1.2 : 2}cqw;letter-spacing:0.32em;text-transform:uppercase;color:${th.body};">${esc(url)}</div>
    </div>`;
  const s = [
    `tl.fromTo("#${id}-bloom",{opacity:0,scale:0.5},{opacity:1,scale:1,duration:1,ease:"power3.out"},${T});`,
    `tl.to("#${id}-bloom",{opacity:0.76,scale:1.08,duration:2,ease:"sine.inOut",yoyo:true,repeat:reps(${r(Math.max(0.2, L - 1))},2)},${r(T + 1)});`,
    `tl.fromTo(".${id}-ray",{opacity:0,scale:0.2,svgOrigin:"100 100"},{opacity:0.9,scale:1,duration:0.55,ease:"power3.out",stagger:0.025},${r(T + 0.2)});`,
    `tl.to(".${id}-ray",{opacity:0.28,duration:1.3,ease:"sine.inOut",yoyo:true,repeat:reps(${r(Math.max(0.2, L - 0.9))},1.3),stagger:0.02},${r(T + 0.9)});`,
    asset && asset.path ? `tl.fromTo("#${id}-logo",{opacity:0,y:${land ? -16 : -22}},{opacity:1,y:0,duration:0.5,ease:"power3.out"},${r(T + 0.12)});` : "",
    kicker ? `tl.fromTo("#${id}-kick",{opacity:0,y:${land ? -16 : -22}},{opacity:1,y:0,duration:0.5,ease:"power3.out"},${r(T + 0.2)});` : "",
    slamIn(`${id}-ln`, T + 0.3, land),
    ...sweepIn(id, r(T + 0.9)),
    cta ? `tl.fromTo("#${id}-cta",{opacity:0,y:${land ? 24 : 32},scale:0.82},{opacity:1,y:0,scale:1,duration:0.55,ease:"back.out(2)"},${r(T + 0.9)});` : "",
    cta ? `tl.to("#${id}-cta",{boxShadow:"0 0 ${land ? 5.6 : 8.4}cqw ${rgba(th.accent, 0.9)}",duration:1.3,ease:"sine.inOut",yoyo:true,repeat:reps(${r(Math.max(0.2, L - 1.5))},1.3)},${r(T + 1.5)});` : "",
    `tl.fromTo("#${id}-rule",{opacity:0,scaleX:0},{opacity:1,scaleX:1,duration:0.6,ease:"power3.out"},${r(T + 1.1)});`,
    `tl.fromTo("#${id}-url",{opacity:0,y:${land ? 16 : 22}},{opacity:1,y:0,duration:0.55,ease:"power3.out"},${r(T + 1.25)});`,
  ];
  return { html, s };
}

const SCENES = { ignitetitle, chargeplate, sequence, surge, transmission, gridburst, launchcta };

// ================= PER-PACK SIGNATURE BACKDROPS ================================
// Each returns { html, script } for the persistent backdrop layer. Everything is
// painted from the theme (accent / accent2 / spark / alt / ink), every loop is a
// finite repeat or one long linear tween, and every SVG rotation uses svgOrigin.

// --- IGNITION: the countdown ---------------------------------------------------
function sigCountdown(th, { W, H, land, D, seed }) {
  const M = Math.min(W, H);
  const cx = Math.round(W / 2), cy = Math.round(H * 0.5);
  const R = Math.round(M * (land ? 0.4 : 0.3));
  const circ = Math.round(2 * Math.PI * R);
  const g = [];
  // 60 ticks — the countdown dial
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
    const major = i % 5 === 0;
    const r1 = R - Math.round(M * (major ? 0.036 : 0.016));
    g.push(`<line x1="${Math.round(cx + Math.cos(a) * r1)}" y1="${Math.round(cy + Math.sin(a) * r1)}" x2="${Math.round(cx + Math.cos(a) * R)}" y2="${Math.round(cy + Math.sin(a) * R)}" stroke="${rgba(major ? th.accent2 : th.ink, major ? 0.5 : 0.22)}" stroke-width="${major ? 3 : 1.6}"/>`);
  }
  g.push(`<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${rgba(th.ink, 0.1)}" stroke-width="1.4"/>`);
  g.push(`<circle cx="${cx}" cy="${cy}" r="${Math.round(R * 0.72)}" fill="none" stroke="${rgba(th.accent2, 0.14)}" stroke-width="1.2" stroke-dasharray="6 10"/>`);
  // the depleting arc — time running out to launch, across the WHOLE film
  g.push(`<circle id="sig-arc" cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${th.accent}" stroke-width="${Math.max(3, Math.round(M * 0.009))}" stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="0" transform="rotate(-90 ${cx} ${cy})" opacity="0.8" style="filter:drop-shadow(0 0 ${Math.round(M * 0.014)}px ${rgba(th.accent, 0.75)});"/>`);
  // sweep hand
  g.push(`<line id="sig-hand" x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - R + Math.round(M * 0.02)}" stroke="${rgba(th.accent2, 0.6)}" stroke-width="2.4" stroke-linecap="round"/>`);
  // targeting reticle: gapped crosshair segments outside the copy area
  const gapIn = Math.round(R * 1.06), gapOut = Math.round(R * 1.3);
  [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
    g.push(`<line class="sig-cross" x1="${cx + dx * gapIn}" y1="${cy + dy * gapIn}" x2="${cx + dx * gapOut}" y2="${cy + dy * gapOut}" stroke="${rgba(th.accent2, 0.4)}" stroke-width="2"/>`);
  });
  // pad gantry silhouette along the base
  const baseY = H - Math.round(M * 0.02);
  g.push(`<path d="M${Math.round(W * 0.06)} ${baseY} L${Math.round(W * 0.06)} ${Math.round(baseY - M * 0.2)} L${Math.round(W * 0.13)} ${Math.round(baseY - M * 0.2)} M${Math.round(W * 0.09)} ${baseY} L${Math.round(W * 0.09)} ${Math.round(baseY - M * 0.14)} M${Math.round(W * 0.94)} ${baseY} L${Math.round(W * 0.94)} ${Math.round(baseY - M * 0.17)} L${Math.round(W * 0.88)} ${Math.round(baseY - M * 0.17)}" fill="none" stroke="${rgba(th.ink, 0.14)}" stroke-width="${Math.max(2, Math.round(M * 0.005))}"/>`);
  // stars falling (the camera rides the vehicle up) + exhaust embers rising
  const dots = [];
  for (let i = 0; i < 26; i++) {
    const h = hashSeed(`${seed}-star-${i}`);
    const x = (h % 1000) / 10, y = ((h >> 7) % 1000) / 10;
    const sz = 0.1 + ((h >> 13) % 14) / 100;
    dots.push(`<div class="sig-star" style="position:absolute;left:${r(x)}%;top:${r(y)}%;width:${r(sz)}cqw;height:${r(sz)}cqw;border-radius:50%;background:${rgba(th.ink, 0.7)};"></div>`);
  }
  for (let i = 0; i < 16; i++) {
    const h = hashSeed(`${seed}-ember-${i}`);
    const x = 4 + (h % 92);
    const sz = 0.16 + ((h >> 9) % 20) / 100;
    dots.push(`<div class="sig-ember" style="position:absolute;left:${r(x)}%;bottom:${r(-2 - ((h >> 5) % 10))}%;width:${r(sz)}cqw;height:${r(sz)}cqw;border-radius:50%;background:${i % 4 === 0 ? th.spark : th.accent};box-shadow:0 0 ${r(sz * 3)}cqw ${rgba(i % 4 === 0 ? th.spark : th.accent, 0.9)};opacity:0;"></div>`);
  }
  const spanD = Math.max(1, r(D));
  const starDur = r(Math.max(6, spanD * 0.5));
  const emberDur = r(Math.max(3.4, spanD * 0.3));
  return {
    html: `<svg id="sig-svg" viewBox="0 0 ${W} ${H}" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible;">${g.join("")}</svg>${dots.join("")}`,
    script: `
  tl.fromTo("#sig-arc",{strokeDashoffset:0},{strokeDashoffset:${circ},duration:${spanD},ease:"none"},0);
  tl.to("#sig-hand",{rotation:${360 * Math.max(1, Math.round(spanD / 6))},svgOrigin:"${cx} ${cy}",duration:${spanD},ease:"none"},0);
  tl.to(".sig-cross",{opacity:0.95,duration:0.9,ease:"sine.inOut",yoyo:true,repeat:reps(${spanD},0.9)},0);
  tl.fromTo(".sig-star",{y:${-Math.round(H * 0.4)},opacity:0.15},{y:${Math.round(H * 0.7)},opacity:0.7,duration:${starDur},ease:"none",stagger:{each:${r(starDur / 30)},repeat:reps(${spanD},${starDur})}},0);
  tl.fromTo(".sig-ember",{y:0,opacity:0},{y:${-Math.round(H * 0.85)},opacity:0.85,duration:${emberDur},ease:"none",stagger:{each:${r(emberDur / 18)},repeat:reps(${spanD},${emberDur})}},0);`,
  };
}

// --- KALEIDO: the six-fold mirrored field ---------------------------------------
function sigMirror(th, { W, H, land, D, seed }) {
  const M = Math.min(W, H);
  const cx = Math.round(W / 2), cy = Math.round(H / 2);
  const REACH = Math.round(Math.hypot(W, H) * 0.58);
  const cols = [th.accent, th.accent2, th.spark, th.alt];
  // ONE authored wedge (0..60 degrees) — the whole field is its mirror images.
  const wedge = [];
  for (let i = 0; i < 9; i++) {
    const h = hashSeed(`${seed}-w-${i}`);
    const rad = REACH * (0.13 + ((h % 78) / 100) * 0.82);
    const ang = ((h >> 5) % 52 + 4) * Math.PI / 180;
    const sz = REACH * (0.026 + ((h >> 11) % 11) / 240);
    const x = r(cx + Math.cos(ang) * rad), y = r(cy + Math.sin(ang) * rad);
    // Hue ROTATES through the pack's four colours rather than being hashed —
    // a seeded pick collapsed the whole field onto one hue and the pack reads
    // as prismatic only when every accent is present in the glass.
    const col = cols[i % cols.length];
    const op = 0.2 + ((h >> 19) % 14) / 100;
    const kind = i % 3;
    if (kind === 0) {
      wedge.push(`<circle cx="${x}" cy="${y}" r="${r(sz)}" fill="${rgba(col, op * 0.85)}" stroke="${rgba(col, op + 0.16)}" stroke-width="1.4"/>`);
    } else if (kind === 1) {
      const p = [[0, -sz * 1.35], [sz * 1.1, sz * 0.85], [-sz * 1.1, sz * 0.85]]
        .map(([px, py]) => `${r(x + px)},${r(y + py)}`).join(" ");
      wedge.push(`<polygon points="${p}" fill="${rgba(col, op * 0.7)}" stroke="${rgba(col, op + 0.2)}" stroke-width="1.4"/>`);
    } else {
      wedge.push(`<rect x="${r(x - sz)}" y="${r(y - sz)}" width="${r(sz * 2)}" height="${r(sz * 2)}" fill="${rgba(col, op * 0.6)}" stroke="${rgba(col, op + 0.18)}" stroke-width="1.4" transform="rotate(${(h >> 3) % 90} ${x} ${y})"/>`);
    }
    // a prism shard streaking outward, the kaleidoscope's glass
    wedge.push(`<path d="M${r(cx + Math.cos(ang) * rad * 0.55)} ${r(cy + Math.sin(ang) * rad * 0.55)} L${x} ${y}" stroke="${rgba(col, op * 0.75)}" stroke-width="${r(sz * 0.5)}" stroke-linecap="round" fill="none"/>`);
  }
  const wedgeSvg = wedge.join("");
  // D6: six rotations x their reflections = a TRUE six-fold mirrored field.
  const field = [];
  for (let k = 0; k < 6; k++) {
    field.push(`<g transform="rotate(${k * 60} ${cx} ${cy})">${wedgeSvg}</g>`);
    field.push(`<g transform="rotate(${k * 60} ${cx} ${cy}) translate(${cx} ${cy}) scale(1,-1) translate(${-cx} ${-cy})">${wedgeSvg}</g>`);
  }
  // spoke halo (counter-turning), pulse rings, centre mandala
  const halo = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    halo.push(`<line x1="${Math.round(cx + Math.cos(a) * M * 0.2)}" y1="${Math.round(cy + Math.sin(a) * M * 0.2)}" x2="${Math.round(cx + Math.cos(a) * M * 0.66)}" y2="${Math.round(cy + Math.sin(a) * M * 0.66)}" stroke="${rgba(th.accent, 0.12)}" stroke-width="1.6"/>`);
  }
  const rings = [0, 1, 2].map((i) =>
    `<circle class="sig-pr" cx="${cx}" cy="${cy}" r="${Math.round(M * 0.15)}" fill="none" stroke="${rgba(i === 1 ? th.accent2 : th.accent, 0.42)}" stroke-width="2.2" opacity="0"/>`).join("");
  const mandala = [];
  [[0.2, 8, th.accent, 0.34], [0.31, 12, th.accent2, 0.26], [0.42, 16, th.spark, 0.18]].forEach(([f, n, col, op], ri) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const px = Math.round(cx + Math.cos(a) * M * f), py = Math.round(cy + Math.sin(a) * M * f);
      mandala.push(`<ellipse class="sig-pt${ri}" cx="${px}" cy="${py}" rx="${Math.round(M * 0.018)}" ry="${Math.round(M * 0.045)}" fill="none" stroke="${rgba(col, op)}" stroke-width="1.6" transform="rotate(${r(a * 180 / Math.PI + 90)} ${px} ${py})" opacity="0"/>`);
    }
  });
  const spanD = Math.max(1, r(D));
  const turns = Math.max(1, Math.round(spanD / 22));
  return {
    html: `<svg id="sig-svg" viewBox="0 0 ${W} ${H}" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible;">
      <g id="sig-halo">${halo.join("")}</g>
      <g id="sig-field">${field.join("")}</g>
      <g id="sig-mandala">${mandala.join("")}</g>
      ${rings}
    </svg>`,
    script: `
  tl.to("#sig-field",{rotation:${60 * turns * 2},svgOrigin:"${cx} ${cy}",duration:${spanD},ease:"none"},0);
  tl.to("#sig-halo",{rotation:${-30 * turns * 2},svgOrigin:"${cx} ${cy}",duration:${spanD},ease:"none"},0);
  tl.to("#sig-mandala",{rotation:${24 * turns},svgOrigin:"${cx} ${cy}",duration:${spanD},ease:"none"},0);
  tl.fromTo(".sig-pt0",{opacity:0,scale:0,svgOrigin:"${cx} ${cy}"},{opacity:1,scale:1,duration:0.5,stagger:0.05,ease:"back.out(1.7)"},0.4);
  tl.fromTo(".sig-pt1",{opacity:0,scale:0,svgOrigin:"${cx} ${cy}"},{opacity:1,scale:1,duration:0.5,stagger:0.04,ease:"back.out(1.7)"},0.7);
  tl.fromTo(".sig-pt2",{opacity:0,scale:0,svgOrigin:"${cx} ${cy}"},{opacity:1,scale:1,duration:0.5,stagger:0.03,ease:"back.out(1.7)"},1);
  tl.fromTo(".sig-pr",{opacity:0.55,scale:0.45,svgOrigin:"${cx} ${cy}"},{opacity:0,scale:2.8,duration:2.6,ease:"power1.out",stagger:{each:0.85,repeat:reps(${spanD},2.6)}},0.3);
  tl.fromTo("#sig-field",{opacity:0},{opacity:1,duration:1.2,ease:"power2.out"},0);`,
  };
}

// --- VOLTAGE: forking lightning -------------------------------------------------
function sigBolt(th, { W, H, land, D, seed }) {
  const M = Math.min(W, H);
  const spanD = Math.max(1, r(D));
  const n = Math.max(4, Math.min(22, Math.ceil(spanD / 1.5)));
  const paths = [];
  const script = [];
  for (let i = 0; i < n; i++) {
    const h = hashSeed(`${seed}-bolt-${i}`);
    const startX = Math.round(W * (0.08 + ((h % 84) / 100)));
    const segs = 8;
    let px = startX;
    let d = `M${px} ${-Math.round(H * 0.05)}`;
    const nodes = [];
    for (let k = 1; k <= segs; k++) {
      const y = Math.round((k / segs) * H * 1.05);
      const nx = Math.round(px + ((k % 2 ? 1 : -1) * W * 0.085) * ((((h >> (k * 3)) % 5) / 4) + 0.4));
      d += ` L${nx} ${y}`;
      nodes.push([nx, y]);
      px = nx;
    }
    // branch forks off the main channel — the "forking" of forking lightning
    let forks = "";
    [1, 3, 5].forEach((k, fi) => {
      const [bx, by] = nodes[k];
      const dir = ((h >> (fi * 5 + 2)) % 2) ? 1 : -1;
      const fx = Math.round(bx + dir * W * 0.1), fy = Math.round(by + H * 0.12);
      const fx2 = Math.round(fx + dir * W * 0.055), fy2 = Math.round(fy + H * 0.09);
      forks += ` M${bx} ${by} L${fx} ${fy} L${fx2} ${fy2}`;
    });
    const len = Math.round(H * 3.2);
    const w = r(Math.max(3, M * (i % 3 === 0 ? 0.011 : 0.0075)));
    const col = i % 4 === 1 ? th.accent2 : th.accent;
    // a wide soft channel behind the hot core — a bolt without its corona reads
    // as a thin scratch, which is what the first cut of this pack looked like
    paths.push(`<path class="sig-bolt${i}" d="${d}${forks}" fill="none" stroke="${rgba(col, 0.32)}" stroke-width="${r(w * 4.5)}" stroke-linejoin="round" stroke-linecap="round" opacity="0" style="filter:blur(${Math.round(M * 0.012)}px);stroke-dasharray:${len};stroke-dashoffset:${len};"/>`);
    paths.push(`<path class="sig-bolt${i}" d="${d}${forks}" fill="none" stroke="${th.ink}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round" opacity="0" style="filter:drop-shadow(0 0 ${Math.round(M * 0.016)}px ${rgba(col, 1)}) drop-shadow(0 0 ${Math.round(M * 0.045)}px ${rgba(col, 0.7)});stroke-dasharray:${len};stroke-dashoffset:${len};"/>`);
    const at = r(0.3 + (i + 0.1) * (spanD / n));
    script.push(`tl.fromTo(".sig-bolt${i}",{opacity:0,strokeDashoffset:${len}},{opacity:1,strokeDashoffset:0,duration:0.14,ease:"none"},${at});`);
    script.push(`tl.to(".sig-bolt${i}",{opacity:0.3,duration:0.07,ease:"steps(1)",yoyo:true,repeat:7},${r(at + 0.15)});`);
    script.push(`tl.to(".sig-bolt${i}",{opacity:0,duration:0.45,ease:"power2.out"},${r(at + 0.72)});`);
    script.push(`tl.fromTo("#sig-flash",{opacity:0},{opacity:0.24,duration:0.05,ease:"none"},${at});`);
    script.push(`tl.to("#sig-flash",{opacity:0,duration:0.36,ease:"power2.out"},${r(at + 0.06)});`);
  }
  // Tesla arc between two electrodes
  const ex = Math.round(W * 0.5), ey = Math.round(H * (land ? 0.84 : 0.88));
  const gap = Math.round(M * 0.26);
  const e1 = ex - Math.round(gap / 2), e2 = ex + Math.round(gap / 2);
  let ad = `M${e1} ${ey}`;
  for (let k = 1; k <= 6; k++) {
    const x = Math.round(e1 + (e2 - e1) * (k / 6));
    const y = Math.round(ey + ((k % 2 ? -1 : 1) * M * 0.035) * ((((seed >> k) % 4) / 3) + 0.4) * (k === 6 ? 0 : 1));
    ad += ` L${x} ${y}`;
  }
  const arcSvg = `<circle cx="${e1}" cy="${ey}" r="${Math.round(M * 0.016)}" fill="${rgba(th.accent, 0.9)}" style="filter:drop-shadow(0 0 ${Math.round(M * 0.012)}px ${rgba(th.accent, 0.9)});"/>`
    + `<circle cx="${e2}" cy="${ey}" r="${Math.round(M * 0.016)}" fill="${rgba(th.accent, 0.9)}" style="filter:drop-shadow(0 0 ${Math.round(M * 0.012)}px ${rgba(th.accent, 0.9)});"/>`
    + `<path id="sig-arcpath" d="${ad}" fill="none" stroke="${th.accent2}" stroke-width="${Math.max(2, r(M * 0.0045))}" stroke-linejoin="round" stroke-linecap="round" opacity="0" style="filter:drop-shadow(0 0 ${Math.round(M * 0.014)}px ${rgba(th.accent2, 0.95)});"/>`;
  // oscilloscope trace along the base
  const wy = Math.round(H * 0.955), amp = Math.round(H * 0.028), step = Math.max(8, Math.round(W / 48));
  let od = `M0 ${wy}`;
  for (let x = step; x <= W; x += step) {
    const k = x / W;
    od += ` L${x} ${Math.round(wy + Math.sin(k * 21 + (seed % 7)) * amp * (0.35 + 0.65 * Math.sin(k * 6)))}`;
  }
  const oLen = Math.round(W * 1.4);
  const osc = `<path id="sig-osc" d="${od}" fill="none" stroke="${rgba(th.accent, 0.85)}" stroke-width="2.2" stroke-linecap="round" style="filter:drop-shadow(0 0 ${Math.round(M * 0.008)}px ${rgba(th.accent, 0.85)});stroke-dasharray:${oLen};stroke-dashoffset:${oLen};"/>`;
  // rising spark particles
  const dots = [];
  for (let i = 0; i < 20; i++) {
    const h = hashSeed(`${seed}-spark-${i}`);
    const x = 3 + (h % 94);
    const sz = 0.14 + ((h >> 9) % 18) / 100;
    dots.push(`<div class="sig-spk" style="position:absolute;left:${r(x)}%;bottom:${r(-3 - ((h >> 5) % 12))}%;width:${r(sz)}cqw;height:${r(sz)}cqw;border-radius:50%;background:${i % 3 === 0 ? th.spark : th.accent};box-shadow:0 0 ${r(sz * 3.2)}cqw ${rgba(i % 3 === 0 ? th.spark : th.accent, 0.95)};opacity:0;"></div>`);
  }
  const spkDur = r(Math.max(3.2, spanD * 0.28));
  const oscDur = r(Math.max(2.6, spanD * 0.35));
  return {
    html: `<svg id="sig-osc-svg" viewBox="0 0 ${W} ${H}" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible;">${osc}</svg>` + dots.join(""),
    // A strike is transient, so it rides ABOVE the legibility scrims: behind
    // them the bolts washed out to faint scratches and the pack lost its tell.
    front: `<svg id="sig-svg" viewBox="0 0 ${W} ${H}" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible;">${paths.join("")}${arcSvg}</svg>`
      + `<div id="sig-flash" style="position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse 80% 70% at 50% 40%, ${rgba(th.ink, 0.9)} 0%, ${rgba(th.accent, 0.45)} 45%, transparent 80%);"></div>`,
    script: `
  ${script.join("\n  ")}
  tl.fromTo("#sig-arcpath",{opacity:0},{opacity:0.95,duration:0.09,ease:"steps(1)",yoyo:true,repeat:${Math.max(1, Math.floor(spanD / 0.3)) * 2}},0.5);
  tl.fromTo("#sig-osc",{strokeDashoffset:${oLen}},{strokeDashoffset:${-oLen},duration:${oscDur},ease:"none",repeat:reps(${spanD},${oscDur})},0.3);
  tl.fromTo(".sig-spk",{y:0,opacity:0},{y:${-Math.round(H * 0.8)},opacity:0.9,duration:${spkDur},ease:"none",stagger:{each:${r(spkDur / 22)},repeat:reps(${spanD},${spkDur})}},0);`,
  };
}

// ---- persistent chrome (the signature backdrop + the family HUD) --------------
function chrome(ctx) {
  const { theme: th, D, brand, url, count, land, dims, framePack } = ctx;
  const W = (dims && dims.width) || 1920, H = (dims && dims.height) || 1080;
  const seed = hashSeed(String(framePack || "charged"));
  const args = { W, H, land, D: r(D), seed };
  const sig = th.sig === "countdown" ? sigCountdown(th, args)
    : th.sig === "mirror" ? sigMirror(th, args)
      : sigBolt(th, args);
  // How hard the centre is scrimmed back so copy stays legible over the
  // signature. The mirrored field is a dense all-over pattern and needs the
  // most; the countdown dial and the storm are open enough to need less.
  const scrim = th.sig === "mirror" ? 0.9 : th.sig === "countdown" ? 0.76 : 0.7;

  const barH = land ? 2.6 : 4.2;
  const fs = land ? 0.9 : 1.45;
  const mono = (col, tr) => `font-family:${th.monoStack};font-size:${fs}cqw;letter-spacing:${tr}em;text-transform:uppercase;color:${col};white-space:nowrap;font-variant-numeric:tabular-nums;`;

  // The HUD readout in the top bar is pack-specific too — the signature, small.
  let readoutHtml = "", readoutScript = "";
  if (th.sig === "countdown") {
    const bars = [0, 1, 2].map((i) => `<span style="display:block;width:${land ? 2.6 : 4.2}cqw;height:${land ? 0.28 : 0.45}cqw;border-radius:${land ? 0.14 : 0.22}cqw;background:${rgba(th.ink, 0.14)};overflow:hidden;"><span class="hud-tb" style="display:block;width:100%;height:100%;transform-origin:left center;background:${[th.accent2, th.accent2, th.spark][i]};box-shadow:0 0 ${land ? 0.7 : 1.1}cqw ${rgba([th.accent2, th.accent2, th.spark][i], 0.8)};"></span></span>`).join("");
    readoutHtml = `<span style="display:flex;align-items:center;gap:${land ? 1 : 1.6}cqw;">
        <span id="hud-tm" style="${mono(th.accent, 0.22)}">T-00:00</span>
        ${bars}
      </span>`;
    const steps = [];
    const total = Math.max(1, Math.ceil(D));
    for (let k = 0; k <= total; k++) {
      const left = Math.max(0, total - k);
      steps.push(`tl.set("#hud-tm",{textContent:"T-${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}"},${r(Math.min(D, k))});`);
    }
    readoutScript = `
  tl.fromTo(".hud-tb",{scaleX:0.15},{scaleX:1,duration:1.4,ease:"power2.out",stagger:0.18},0.4);
  tl.to(".hud-tb",{scaleX:0.55,duration:1.7,ease:"sine.inOut",yoyo:true,repeat:reps(${r(D)},1.7),stagger:0.12},2);
  ${steps.join("\n  ")}`;
  } else if (th.sig === "mirror") {
    const spokes = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      spokes.push(`<line x1="${r(20 + Math.cos(a) * 5)}" y1="${r(20 + Math.sin(a) * 5)}" x2="${r(20 + Math.cos(a) * 17)}" y2="${r(20 + Math.sin(a) * 17)}" stroke="${th.accent}" stroke-width="2.4" stroke-linecap="round"/>`);
    }
    readoutHtml = `<span style="display:flex;align-items:center;gap:${land ? 0.9 : 1.4}cqw;">
        <svg id="hud-glyph" viewBox="0 0 40 40" style="width:${land ? 1.7 : 2.8}cqw;height:${land ? 1.7 : 2.8}cqw;overflow:visible;"><circle cx="20" cy="20" r="17" fill="none" stroke="${rgba(th.accent2, 0.45)}" stroke-width="1.4"/>${spokes.join("")}</svg>
        <span style="${mono(rgba(th.ink, 0.6), 0.3)}">SIX-FOLD</span>
      </span>`;
    readoutScript = `
  tl.to("#hud-glyph",{rotation:${360 * Math.max(1, Math.round(D / 8))},svgOrigin:"20 20",duration:${r(Math.max(1, D))},ease:"none"},0);`;
  } else {
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const k = i / 24;
      pts.push(`${i ? "L" : "M"}${r(k * 80)} ${r(20 + Math.sin(k * 17) * 11 * (0.4 + 0.6 * Math.sin(k * 5)))}`);
    }
    readoutHtml = `<span style="display:flex;align-items:center;gap:${land ? 0.9 : 1.4}cqw;">
        <span id="hud-bolt" style="display:block;width:${land ? 0.5 : 0.8}cqw;height:${land ? 0.5 : 0.8}cqw;border-radius:50%;background:${th.spark};box-shadow:0 0 ${land ? 1 : 1.6}cqw ${rgba(th.spark, 0.95)};"></span>
        <svg viewBox="0 0 80 40" preserveAspectRatio="none" style="width:${land ? 7 : 11}cqw;height:${land ? 1.4 : 2.3}cqw;overflow:visible;"><path id="hud-osc" d="${pts.join(" ")}" fill="none" stroke="${th.accent}" stroke-width="2" stroke-linecap="round" pathLength="100" stroke-dasharray="26 100" stroke-dashoffset="0"/></svg>
      </span>`;
    readoutScript = `
  tl.to("#hud-osc",{strokeDashoffset:-126,duration:1.8,ease:"none",repeat:reps(${r(D)},1.8)},0);
  tl.to("#hud-bolt",{opacity:0.2,duration:0.42,ease:"steps(1)",yoyo:true,repeat:reps(${r(D)},0.42)},0.3);`;
  }

  return {
    html: `
  <div id="backdrop" class="clip" data-start="0" data-duration="__D__" data-track-index="0" data-layout-allow-occlusion style="opacity:0;background:${th.ground};">
    <div id="bd-aura" style="position:absolute;inset:-16%;background:radial-gradient(ellipse 36% 42% at 78% 14%, ${rgba(th.accent, 0.22)} 0%, transparent 66%), radial-gradient(ellipse 42% 46% at 16% 90%, ${rgba(th.accent2, 0.18)} 0%, transparent 68%);"></div>
    ${sig.html}
    <div style="position:absolute;inset:0;background:radial-gradient(ellipse ${land ? "52% 60%" : "62% 40%"} at 50% 50%, ${rgba(th.ground, scrim)} 0%, ${rgba(th.ground, r(scrim * 0.54))} 46%, transparent 76%);"></div>
    <div style="position:absolute;inset:0;background:radial-gradient(ellipse 78% 76% at 50% 48%, transparent 36%, ${rgba("#000000", 0.62)} 100%);"></div>
    ${sig.front || ""}
    <div id="bd-grain" style="position:absolute;inset:-2cqw;opacity:0.3;background-image:radial-gradient(${rgba(th.ink, 0.24)} 0.7px, transparent 0.7px);background-size:0.38cqw 0.38cqw;"></div>
  </div>
  <div id="edge" class="clip" data-start="0" data-duration="__D__" data-track-index="40" data-layout-allow-occlusion style="opacity:0;background:none;">
    <div style="position:absolute;left:0;right:0;top:0;height:${barH}cqw;display:flex;align-items:center;justify-content:space-between;padding:0 ${land ? 3 : 4}cqw;border-bottom:${th.hairW}cqw solid ${rgba(th.ink, 0.1)};background:linear-gradient(180deg, ${rgba(th.ground, 0.85)}, transparent);">
      <span style="display:flex;align-items:center;gap:${land ? 0.7 : 1.1}cqw;${mono(th.soft, 0.3)}">
        <span id="edge-dot" style="display:block;width:${land ? 0.45 : 0.72}cqw;height:${land ? 0.45 : 0.72}cqw;border-radius:50%;background:${th.accent};box-shadow:0 0 ${land ? 1 : 1.6}cqw ${rgba(th.accent, 0.95)};"></span>
        ${esc(String(brand).toUpperCase())}
      </span>
      ${readoutHtml}
    </div>
    <div style="position:absolute;left:0;right:0;bottom:0;height:${barH}cqw;display:flex;align-items:center;justify-content:space-between;padding:0 ${land ? 3 : 4}cqw;background:linear-gradient(0deg, ${rgba(th.ground, 0.85)}, transparent);">
      <span style="${mono(th.faint, 0.3)}">${esc(String(th.sig === "countdown" ? "LAUNCH" : th.sig === "mirror" ? "REFRACT" : "CHARGE"))}</span>
      <span style="${mono(th.faint, 0.3)}">${esc(url)}</span>
    </div>
    <div id="edge-prog" style="position:absolute;left:0;bottom:0;width:100%;height:${land ? 0.18 : 0.3}cqw;background:linear-gradient(90deg, ${th.accent}, ${th.spark});box-shadow:0 0 ${land ? 1.2 : 2}cqw ${rgba(th.accent, 0.8)};transform-origin:left center;"></div>
  </div>`,
    script: `
  tl.fromTo("#backdrop",{opacity:0},{opacity:1,duration:0.4},0);
  tl.fromTo("#edge",{opacity:0},{opacity:1,duration:0.5},0.15);
  tl.fromTo("#edge-prog",{scaleX:0},{scaleX:1,duration:${r(Math.max(1, D))},ease:"none"},0);
  tl.to("#bd-aura",{opacity:0.62,duration:3,ease:"sine.inOut",yoyo:true,repeat:reps(${r(D)},3)},0);
  tl.to("#bd-grain",{opacity:0.16,duration:0.7,ease:"sine.inOut",yoyo:true,repeat:reps(${r(D)},0.7)},0);
  tl.to("#edge-dot",{opacity:0.3,duration:0.9,ease:"sine.inOut",yoyo:true,repeat:reps(${r(D)},0.9)},0.5);
  ${sig.script}
  ${readoutScript}`,
  };
}

// Per-scene: step the mission counter in the top edge as each plate opens.
// No per-scene chrome — the "01 / 08" scene counter was removed: a slide number
// ticking up is the same slideshow tell as the progress rail.

function styleBlock(th, land) {
  return `${th.fontFace}
  #root { font-family:${th.bodyStack}; -webkit-font-smoothing:antialiased; }
  img { -webkit-user-drag:none; }
  #cap-pill { background:${rgba(th.ground, 0.78)}; border:${th.hairW}cqw solid ${th.edge} !important; border-radius:${land ? 0.5 : 0.8}cqw; box-shadow:0 0 ${land ? 1.6 : 2.6}cqw ${rgba(th.accent, 0.2)}; }
  #cap-text { font-family:${th.bodyStack}; color:${th.body}; letter-spacing:0.03em; }`;
}

const family = {
  theme, styleBlock, chrome, SCENES, TEMPLATE_SCENES, route, mediaSlots, mediaFallback,
  // Inject the site logo into slot `a` of the closer — no demand-math change; the
  // engine only stamps data-media-* on real demand, so coverage never drifts.
  wantsLogo: (t) => t === "launchcta",
  fallbackType: "ignitetitle",
  variants: 3,
  // Charged cuts hard: whips and fast pushes, heavy motion blur on the boundary.
  camera: { kinds: ["zoom", "whip", "zoom", "whip", "whip", "zoom", "whip", "zoom"], blur: 22, push: 0.05, zoomIn: 1.2, zoomOut: 1.18 },
};

function buildComposition(opts) { return E.buildFilm(family, opts); }
// This pack's media demand + what filled each slot, WITHOUT rendering. Runs the
// exact routing and slot-filling the renderer runs, so the manifest can never
// drift from the film that ships.
function planMedia(opts) { return E.planMedia(family, opts); }

module.exports = { buildComposition, planMedia, TEMPLATE_SCENES };
