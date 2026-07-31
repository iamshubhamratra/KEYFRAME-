// DARK-PREMIUM family template — the authored scene grammar for the dark
// cinematic tech / fintech / premium-product-reveal packs (midnight-glass,
// ledger-noir, vault-gold, noir-spotlight, nova-launch, neon-premiere,
// abyssal-glow, aurora-spectrum, lantern-night).
//
// These packs used to render through scene_kit's SHARED archetypes, so a gold
// vault reveal and a neon premiere drew the same feature-card row as every other
// pack in the gallery. This file gives the whole family its own grammar — seven
// authored scenes that only make sense as a premium product reveal: deep ground,
// a spotlight that widens out of darkness, glass panels with hairline borders,
// light sweeps across type, arcs that draw, elegant slow rises. Every pack still
// keeps its OWN skin: colours, fonts and text effects come from
// scene_kit.deriveTheme(pack), so vault-gold stays gold-on-black, neon-premiere
// stays neon-on-navy and abyssal-glow stays bioluminescent teal. `variant`
// (hashed from the pack name) additionally flips staging per pack, so two packs
// in the family never compose identically.
//
// The render contract (seek-safety, tracks, hard kills, caption node, camera) is
// the engine's — see template_engine.js. This module is design only.

const { deriveTheme } = require("./scene_kit");
const E = require("./template_engine");
const { esc, r, rgba, mix, lum, inkOn, statsOf, breakLines, bullets, fit, mineStat } = E;

// ---- contrast guard -----------------------------------------------------------
// A pack accent is chosen to sit on the pack's own ground, but a brand-skin
// override (matchSiteTheme) can move the ground under it. On a deep ground a
// too-close accent reads as dark-on-dark — the one failure mode that ships an
// invisible frame. Lift any accent that doesn't clear a hard legibility bar.
function contrast(a, b) {
  const la = lum(a), lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
function legible(color, ground, ink, min) {
  let c = String(color || ink);
  for (let i = 0; i < 8 && contrast(c, ground) < (min || 3.4); i++) c = mix(c, ink, 0.2);
  return c;
}

// ---- theme -------------------------------------------------------------------
// The pack's own resolved identity + the dark-premium family's glass surface.
function theme(manifest, brandSkin, { framePack, land } = {}) {
  const t = deriveTheme(framePack, {}, brandSkin);
  const ground = t.ground || "#07080D";
  const ink = t.ink || "#FFFFFF";
  const dark = t.isDark !== false;
  const list = (t.accents && t.accents.length ? t.accents : (dark ? ["#7CC4FF", "#FF7DB4"] : ["#3B5BFF", "#E2563C"]));
  const accent = legible(list[0], ground, ink, 3.6);
  const accent2 = legible(list[1] || list[0], ground, ink, 3.4);
  const accent3 = legible(list[2] || list[1] || list[0], ground, ink, 3.0);
  const shade = dark ? "#000000" : "#5C6474";
  return {
    ...t,
    ground, ink, dark, accent, accent2, accent3,
    // The family's own legible() targets 3.0-3.6 — right for glows and rules, but
    // SMALL TEXT needs AA (measured failures at 4.12:1 and 1.09:1 across the
    // gallery). Text use goes through these; fills keep the raw accent.
    accentText: E.readable(ground, accent, 1, 4.5),
    accentText2: E.readable(ground, accent2, 1, 4.5),
    // hairlines: ~1px at either orientation, in container units
    hairW: land ? 0.09 : 0.15,
    hair: rgba(ink, dark ? 0.2 : 0.16),
    hair2: rgba(ink, dark ? 0.38 : 0.3),
    // the glass surface: a faint ink wash, a rim highlight, a deep drop
    glass: `linear-gradient(158deg, ${rgba(ink, dark ? 0.11 : 0.07)} 0%, ${rgba(ink, dark ? 0.035 : 0.022)} 52%, ${rgba(ink, dark ? 0.075 : 0.04)} 100%)`,
    lift: `inset 0 ${land ? 0.1 : 0.16}cqw 0 ${rgba(ink, dark ? 0.3 : 0.5)}, 0 ${land ? 1.3 : 2.1}cqw ${land ? 3.4 : 5}cqw ${rgba(shade, dark ? 0.5 : 0.16)}`,
    // text tiers — body never dips below 60% of the ink
    body: rgba(ink, 0.84),
    soft: rgba(ink, 0.66),
    faint: rgba(ink, 0.38),      // decoration only, never copy
    well: mix(ground, dark ? "#000000" : "#FFFFFF", 0.35),
    onAccent: inkOn(accent, "#08090C", "#FFFFFF"),
    displayStack: t.displayStack || t.fontStack || "system-ui, sans-serif",
    bodyStack: t.fontStack || "system-ui, sans-serif",
    fontFace: t.fontFace || "",
  };
}

// ---- published vocabulary (Template Director casts onto these) ----------------
const TEMPLATE_SCENES = [
  {
    type: "revealtitle", bestFor: "the opening title, the line the film opens on",
    look: "The title rises out of darkness as a spotlight widens behind it, a light sweep crosses the letters and a glowing hairline draws underneath.",
    slots: { kicker: "max 22 chars", lines: "1-3 lines, max 26 chars each", body: "one sentence, max 110 chars" },
    media: [], mediaMin: 0,
  },
  {
    type: "glasscard", bestFor: "a product screen or photo presented as the hero",
    look: "A glass card with a hairline border and a soft rim-light holds the image, which drifts in slow parallax while the claim sits beside it.",
    slots: { kicker: "max 22 chars", headline: "max 2 short lines", body: "one sentence, max 130 chars" },
    media: ["desktop"], mediaMin: 1,
  },
  {
    type: "specrows", bestFor: "features, steps or capabilities as a short list",
    look: "Hairline-bordered glass panels stacked in a column, each numbered and closed by a glowing accent tick that draws across.",
    slots: { kicker: "max 22 chars", headline: "max 2 short lines", items: "2-4 lines, max 46 chars each" },
    media: [], mediaMin: 0,
  },
  {
    type: "metricarc", bestFor: "one number that carries the proof",
    look: "A large figure counts up over a faint radial glow while an accent arc draws around it, with the label set beneath and smaller stats as glass chips.",
    slots: { headline: "max 44 chars", stats: "1-3 of {v: number, suf: '%'|'X'|'K'|'M'|'', l: label max 24 chars}", emphasis: "a short hero word if there is no number" },
    media: [], mediaMin: 0,
  },
  {
    type: "glassquote", bestFor: "a testimonial or customer pull-quote",
    look: "The quote set inside a wide glass panel with a glowing accent edge, words fading up in sequence, the attribution on a monogram disc beneath.",
    slots: { quote: "max 150 chars, verbatim", author: "person's name", role: "role and/or company" },
    media: [], mediaMin: 0,
  },
  {
    type: "prooftiles", bestFor: "a showcase, logos, gallery or social proof",
    look: "A row of small glass tiles with index numbers — images, a highlighted figure and the brand mark — each lifting in on its own beat.",
    slots: { kicker: "max 22 chars", headline: "max 2 short lines", badge: "a rating or number, max 8 chars", badgeLabel: "max 22 chars" },
    media: ["photo", "photo"], mediaMin: 1,
  },
  {
    type: "glowcta", bestFor: "the closing call to action",
    look: "The closing line rises out of an accent bloom, a glowing pill button pulses under it and the url is set on a hairline rule that draws across.",
    slots: { headline: "max 2 short lines", cta: "button label, max 22 chars", kicker: "max 22 chars" },
    media: [], mediaMin: 0,
  },
];

const mediaSlots = { glasscard: ["desktop"], prooftiles: ["photo", "photo"], glassquote: ["photo"] };
// True when the PREVIOUS scene already carried imagery — keeps media beats
// alternating now that any spare asset, not just a pinned screenshot, earns one.
const mediaBeatJustPlayed = (ctx) => ((mediaSlots[ctx && ctx.prevType] || []).length > 0);

// ---- deterministic router (used when the director is off / uncast) -----------
function route(scene, i, total, ctx) {
  const k = String(scene.kind || "").toLowerCase();
  const p = String(scene.purpose || "").toLowerCase();
  if (i === 0 || k === "hook" || k === "title") return "revealtitle";
  if (i === total - 1 || k === "cta" || p === "cta") return "glowcta";
  if (k === "quote" || scene.quote || /testimonial/.test(p)) return "glassquote";
  if (k === "stat" || k === "chart" || statsOf(scene, 1).length) return "metricarc";
  if (/gallery|showcase|portfolio|social|proof|logos/.test(`${k} ${p}`) && ctx.freeCount >= 2 && ctx.prevType !== "prooftiles") return "prooftiles";
  // MEDIA BEAT — ahead of the text branch, and satisfied by ANY spare asset:
  // `specrows` used to claim every middle scene and the media branch only fired
  // for a pinned shot or a real screenshot, so a pool of stock photos went
  // unshown. The global "no two media in a row" gate is now PER-TYPE: a media
  // beat may follow another media beat as long as it is a DIFFERENT type, so a
  // glasscard can sit next to a prooftiles wall — the SAME type never repeats
  // back-to-back, which is what read as a slideshow.
  // LANDSCAPE ONLY for the tile grid: it lays out 4-up wide but collapses to a
  // 2x2 in portrait, which `check:templates` flags as a side-by-side squeeze.
  // Portrait still gets a media beat — just the full-width single instead.
  if (ctx.land && ctx.freeCount >= 3 && ctx.prevType !== "prooftiles") return "prooftiles";
  if ((ctx.pinned || ctx.hasShot || ctx.freeCount >= 1) && ctx.prevType !== "glasscard") return "glasscard";
  if (bullets(scene, 4).length >= 2) return "specrows";
  return ctx.prevType === "glasscard" ? "specrows" : "glasscard";
}
// A media type with no media re-routes here. `glasscard` is allowed to stand:
// its no-asset state is an authored brand plate, not an empty frame.
const mediaFallback = (scene) => {
  // Keep a quote scene on its glassquote card (monogram fallback) when no photo
  // is free, instead of rerouting the testimonial away and dropping the quote.
  if (scene && (scene.quote || String(scene.kind || "").toLowerCase() === "quote" || /testimonial|review/.test(String(scene.purpose || "").toLowerCase()))) return null;
  if (bullets(scene, 4).length >= 2) return "specrows";
  if (statsOf(scene, 1).length) return "metricarc";
  return "glasscard";
};

// ---- shared dark-premium furniture -------------------------------------------

// The family's core surface: hairline-bordered glass with a rim highlight.
const glassCss = (th, radius) =>
  `background:${th.glass};border:${th.hairW}cqw solid ${th.hair};border-radius:${radius}cqw;box-shadow:${th.lift};`;

// Type size that keeps the longest line inside the plate.
const headSize = (lines, land, cap) => {
  const longest = Math.max(...lines.map((l) => String(l).length), 1);
  return r(Math.min(cap || (land ? 7.2 : 9), (land ? 78 : 84) / longest * 1.55));
};

// Mask reveal: the line rides up inside a clipped row (hidden state is opacity:0).
const maskLines = (lines, size, color, cls, th, weight) => lines.map((ln) => `
        <div style="overflow:hidden;padding:${r(size * 0.06)}cqw 0;">
          <div class="${cls}" style="opacity:0;font-family:${th.displayStack};font-weight:${weight || 700};font-size:${r(size)}cqw;line-height:1.06;letter-spacing:-0.02em;color:${color};">${esc(ln)}</div>
        </div>`).join("");

// The kicker: an accent tick + letterspaced label. Always on the accent, which
// the theme has already lifted clear of the ground.
const kickerRow = (id, text, th, land) => (text ? `
      <div id="${id}-kick" style="opacity:0;display:flex;align-items:center;gap:${land ? 0.9 : 1.4}cqw;margin-bottom:${land ? 1.2 : 1.8}cqw;">
        <span style="display:block;width:${land ? 2.4 : 3.6}cqw;height:${land ? 0.16 : 0.26}cqw;background:${th.accent};box-shadow:0 0 ${land ? 1 : 1.6}cqw ${rgba(th.accent, 0.9)};"></span>
        <span style="font-family:${th.bodyStack};font-size:${land ? 1.05 : 1.75}cqw;letter-spacing:0.34em;text-transform:uppercase;color:${th.accentText};">${esc(text)}</span>
      </div>` : "");

// A light sweep that crosses a block of type once, then leaves.
const sweepEl = (id, th) =>
  `<div id="${id}-sweep" style="position:absolute;left:0;top:-12%;bottom:-12%;width:30%;opacity:0;background:linear-gradient(100deg, transparent 0%, ${rgba(th.ink, 0.5)} 48%, transparent 100%);"></div>`;
const sweepIn = (id, at) => [
  `tl.fromTo("#${id}-sweep",{opacity:0,xPercent:-150,skewX:-14},{opacity:1,xPercent:190,skewX:-14,duration:1.15,ease:"power2.inOut"},${r(at)});`,
  `tl.to("#${id}-sweep",{opacity:0,duration:0.3,ease:"none"},${r(at + 0.95)});`,
];

// A designed plate for a media slot with no asset — a brand mark on a faint
// accent well with a hairline grid. Never a black void.
const brandPlate = (th, land, brand, url, big) => `
        <div style="position:absolute;inset:0;background:radial-gradient(ellipse 76% 66% at 50% 40%, ${rgba(th.accent, 0.3)} 0%, ${rgba(th.accent2, 0.09)} 44%, transparent 78%), ${th.well};"></div>
        <div style="position:absolute;inset:0;opacity:0.5;background-image:linear-gradient(${th.hair} ${th.hairW}cqw, transparent ${th.hairW}cqw), linear-gradient(90deg, ${th.hair} ${th.hairW}cqw, transparent ${th.hairW}cqw);background-size:${land ? 4 : 6}cqw ${land ? 4 : 6}cqw;"></div>
        <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${land ? 0.9 : 1.4}cqw;">
          <div style="font-family:${th.displayStack};font-weight:700;font-size:${big ? (land ? 3.4 : 5) : (land ? 2.1 : 3)}cqw;letter-spacing:0.06em;color:${th.ink};">${esc(String(brand).slice(0, 16))}</div>
          <div style="width:${big ? (land ? 9 : 14) : (land ? 5 : 8)}cqw;height:${land ? 0.16 : 0.26}cqw;background:${th.accent};box-shadow:0 0 ${land ? 1.2 : 2}cqw ${rgba(th.accent, 0.9)};"></div>
          ${big ? `<div style="font-family:${th.bodyStack};font-size:${land ? 1.05 : 1.7}cqw;letter-spacing:0.3em;text-transform:uppercase;color:${th.soft};">${esc(url)}</div>` : ""}
        </div>`;

// ---- scenes -------------------------------------------------------------------

// 1. OPENER — the title emerges from darkness under a widening spotlight.
function revealtitle(scene, ctx) {
  const { id, T, L, theme: th, land, variant, brand } = ctx;
  const raw = Array.isArray(scene.lines) && scene.lines.length ? scene.lines : breakLines(scene.headline, scene.subtext);
  const lines = raw.slice(0, 3).map((l) => fit(String(l), 30));
  const kicker = fit(String(scene.kicker || scene.eyebrow || brand || ""), 22).toUpperCase();
  const body = fit(String(scene.body || (scene.headline ? scene.subtext : "") || ""), 110);
  const size = headSize(lines, land, land ? 7.4 : 9.2);
  const center = variant % 2 === 0;
  const align = center ? "align-items:center;text-align:center;" : "align-items:flex-start;text-align:left;";
  const html = `
    <div id="${id}-glow" style="position:absolute;inset:${land ? "-18% -8%" : "-6% -22%"};opacity:0;background:radial-gradient(ellipse 44% 42% at 50% 46%, ${rgba(th.accent, 0.34)} 0%, ${rgba(th.accent2, 0.12)} 38%, transparent 70%);"></div>
    <div id="${id}-beam" style="position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse ${land ? 26 : 40}% ${land ? 78 : 46}% at ${center ? 50 : 26}% -6%, ${rgba(th.ink, 0.1)} 0%, ${rgba(th.ink, 0.03)} 42%, transparent 74%);"></div>
    <div style="position:absolute;left:${land ? 8 : 7}cqw;right:${land ? 8 : 7}cqw;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;${align}">
      ${kickerRow(id, kicker, th, land)}
      <div style="position:relative;overflow:hidden;padding:${land ? 0.4 : 0.8}cqw 0;">
        ${maskLines(lines, size, th.ink, `${id}-ln`, th, 700)}
        ${sweepEl(id, th)}
      </div>
      <div id="${id}-rule" style="opacity:0;margin-top:${land ? 1.6 : 2.6}cqw;width:${land ? 22 : 34}cqw;height:${land ? 0.16 : 0.26}cqw;background:linear-gradient(90deg, ${th.accent}, ${rgba(th.accent2, 0.1)});box-shadow:0 0 ${land ? 1.4 : 2.2}cqw ${rgba(th.accent, 0.75)};transform-origin:${center ? "center" : "left"} center;"></div>
      ${body ? `<div id="${id}-body" style="opacity:0;margin-top:${land ? 1.8 : 2.8}cqw;max-width:${land ? 46 : 82}cqw;font-family:${th.bodyStack};font-size:${land ? 1.5 : 2.4}cqw;line-height:1.55;color:${th.body};">${esc(body)}</div>` : ""}
    </div>`;
  const s = [
    `tl.fromTo("#${id}-glow",{opacity:0,scale:0.45},{opacity:1,scale:1,duration:1.25,ease:"power3.out"},${T});`,
    `tl.to("#${id}-glow",{opacity:0.72,scale:1.07,duration:2.3,ease:"sine.inOut",yoyo:true,repeat:reps(${r(Math.max(0.1, L - 1.3))},2.3)},${r(T + 1.25)});`,
    `tl.fromTo("#${id}-beam",{opacity:0},{opacity:1,duration:1.1,ease:"power2.out"},${r(T + 0.15)});`,
    kicker ? `tl.fromTo("#${id}-kick",{opacity:0,y:${land ? -14 : -20}},{opacity:1,y:0,duration:0.6,ease:"power3.out"},${r(T + 0.2)});` : "",
    `tl.fromTo(".${id}-ln",{opacity:0,yPercent:112},{opacity:1,yPercent:0,duration:0.95,ease:"power3.out",stagger:0.15},${r(T + 0.3)});`,
    ...sweepIn(id, r(T + 0.9)),
    `tl.fromTo("#${id}-rule",{opacity:0,scaleX:0},{opacity:1,scaleX:1,duration:0.7,ease:"power3.out"},${r(T + 1.05)});`,
    body ? `tl.fromTo("#${id}-body",{opacity:0,y:${land ? 22 : 30}},{opacity:1,y:0,duration:0.7,ease:"power3.out"},${r(T + 1.2)});` : "",
  ];
  return { html, s };
}

// 2. A glass card holding the product shot, rim-lit, in slow parallax.
function glasscard(scene, ctx, asset) {
  const { id, T, L, theme: th, land, variant, brand, url } = ctx;
  const lines = breakLines(scene.headline, "").slice(0, 2).map((l) => fit(String(l), 30));
  const kicker = fit(String(scene.kicker || scene.eyebrow || ""), 22).toUpperCase();
  const body = fit(String(scene.body || scene.subtext || ""), 130);
  const right = variant % 2 === 0;
  const size = r(Math.min(land ? 4.6 : 6.4, (land ? 40 : 80) / Math.max(...lines.map((l) => l.length), 1) * 1.55));
  const radius = land ? 1.2 : 1.8;
  const cardBox = land
    ? `${right ? "right" : "left"}:${land ? 6 : 6}cqw;top:11%;bottom:11%;width:45cqw;`
    : `left:6cqw;right:6cqw;top:9%;height:34%;`;
  const textBox = land
    ? `${right ? "left" : "right"}:6cqw;width:38cqw;top:0;bottom:0;`
    : `left:6cqw;right:6cqw;top:48%;bottom:8%;`;
  const html = `
    <div id="${id}-halo" style="position:absolute;${land ? (right ? "left:34cqw;right:-6cqw;" : "right:34cqw;left:-6cqw;") : "left:-10cqw;right:-10cqw;"}top:${land ? "-14%" : "0%"};bottom:${land ? "-14%" : "50%"};opacity:0;background:radial-gradient(ellipse 50% 46% at 50% 50%, ${rgba(th.accent, 0.26)} 0%, ${rgba(th.accent2, 0.08)} 44%, transparent 74%);"></div>
    <div id="${id}-card" style="position:absolute;${cardBox}opacity:0;${glassCss(th, radius)}overflow:hidden;">
      <div style="position:absolute;inset:0;border-radius:${radius}cqw;background:linear-gradient(146deg, ${rgba(th.accent, 0.3)} 0%, transparent 38%);"></div>
      <div style="position:absolute;inset:${land ? 0.8 : 1.2}cqw;border-radius:${r(radius * 0.65)}cqw;overflow:hidden;background:${th.well};border:${th.hairW}cqw solid ${th.hair};">
        ${asset && asset.path
      ? `<img id="${id}-img" src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="width:100%;height:100%;object-fit:cover;object-position:top center;display:block;">`
      : brandPlate(th, land, brand, url, true)}
      </div>
      <div id="${id}-shine" style="position:absolute;left:0;top:-20%;bottom:-20%;width:46%;opacity:0;background:linear-gradient(100deg, transparent 0%, ${rgba(th.ink, 0.2)} 50%, transparent 100%);"></div>
    </div>
    <div style="position:absolute;${textBox}display:flex;flex-direction:column;justify-content:center;">
      ${kickerRow(id, kicker, th, land)}
      <div style="position:relative;overflow:hidden;">${maskLines(lines, size, th.ink, `${id}-ln`, th, 700)}</div>
      ${body ? `<div id="${id}-body" style="opacity:0;margin-top:${land ? 1.5 : 2.2}cqw;font-family:${th.bodyStack};font-size:${land ? 1.4 : 2.25}cqw;line-height:1.6;color:${th.body};">${esc(body)}</div>` : ""}
      <div id="${id}-urule" style="opacity:0;margin-top:${land ? 1.8 : 2.6}cqw;width:${land ? 16 : 26}cqw;height:${land ? 0.14 : 0.24}cqw;background:${th.accent};box-shadow:0 0 ${land ? 1.2 : 2}cqw ${rgba(th.accent, 0.8)};transform-origin:left center;"></div>
    </div>`;
  const s = [
    `tl.fromTo("#${id}-halo",{opacity:0,scale:0.7},{opacity:1,scale:1,duration:1.1,ease:"power3.out"},${T});`,
    `tl.to("#${id}-halo",{opacity:0.66,duration:2.1,ease:"sine.inOut",yoyo:true,repeat:reps(${r(Math.max(0.1, L - 1.1))},2.1)},${r(T + 1.1)});`,
    `tl.fromTo("#${id}-card",{opacity:0,x:${right ? (land ? 44 : 0) : (land ? -44 : 0)},y:${land ? 0 : 34},scale:0.955},{opacity:1,x:0,y:0,scale:1,duration:0.9,ease:"power3.out"},${r(T + 0.15)});`,
    asset && asset.path
      ? `tl.fromTo("#${id}-img",{scale:1.12,yPercent:2.5},{scale:1,yPercent:0,duration:${r(Math.max(1.2, L - 0.5))},ease:"sine.out"},${r(T + 0.45)});`
      : "",
    `tl.fromTo("#${id}-shine",{opacity:0,xPercent:-130,skewX:-14},{opacity:1,xPercent:210,skewX:-14,duration:1.5,ease:"power2.inOut"},${r(T + 0.7)});`,
    `tl.to("#${id}-shine",{opacity:0,duration:0.5,ease:"none"},${r(T + 1.7)});`,
    kicker ? `tl.fromTo("#${id}-kick",{opacity:0,x:-22},{opacity:1,x:0,duration:0.55,ease:"power3.out"},${r(T + 0.3)});` : "",
    `tl.fromTo(".${id}-ln",{opacity:0,yPercent:110},{opacity:1,yPercent:0,duration:0.8,ease:"power3.out",stagger:0.13},${r(T + 0.4)});`,
    body ? `tl.fromTo("#${id}-body",{opacity:0,y:${land ? 20 : 26}},{opacity:1,y:0,duration:0.65,ease:"power3.out"},${r(T + 0.75)});` : "",
    `tl.fromTo("#${id}-urule",{opacity:0,scaleX:0},{opacity:1,scaleX:1,duration:0.6,ease:"power3.out"},${r(T + 0.95)});`,
  ];
  return { html, s };
}

// 3. A column of hairline glass panels — the spec sheet.
function specrows(scene, ctx) {
  const { id, T, theme: th, land } = ctx;
  let items = (Array.isArray(scene.items) && scene.items.length ? scene.items : bullets(scene, 4))
    .map((b) => fit(String(b), 46)).filter(Boolean).slice(0, 4);
  if (!items.length) items = [fit(String(scene.subtext || scene.body || ""), 46)].filter(Boolean);
  const lines = breakLines(scene.headline, "").slice(0, 2).map((l) => fit(String(l), 30));
  const kicker = fit(String(scene.kicker || scene.eyebrow || ""), 22).toUpperCase();
  const n = Math.max(items.length, 1);
  // One point is a statement, not a list — give it the whole panel.
  const solo = n === 1;
  const headFs = r(Math.min(land ? 4.4 : 6, (land ? 76 : 82) / Math.max(...lines.map((l) => l.length), 1) * 1.5));
  const longest = Math.max(...items.map((s2) => s2.length), 1);
  const rowFs = r(solo
    ? Math.min(land ? 3.1 : 4.2, (land ? 66 : 74) / longest * 1.7)
    : Math.min(land ? (n >= 4 ? 1.85 : 2.15) : (n >= 4 ? 2.9 : 3.3), (land ? 54 : 66) / longest * 1.55));
  const padY = solo ? (land ? 3.4 : 5.2) : (land ? (n >= 4 ? 1.15 : 1.6) : (n >= 4 ? 2 : 2.6));
  const gap = land ? (n >= 4 ? 1 : 1.5) : (n >= 4 ? 1.8 : 2.4);
  const rows = items.map((t, i2) => `
      <div class="${id}-row" style="opacity:0;display:flex;align-items:center;gap:${land ? 1.6 : 2.4}cqw;padding:${padY}cqw ${land ? (solo ? 3 : 2) : (solo ? 4 : 3)}cqw;margin-top:${i2 ? gap : 0}cqw;${glassCss(th, land ? 0.8 : 1.2)}">
        ${solo
      ? `<span style="display:block;width:${land ? 0.28 : 0.44}cqw;align-self:stretch;background:linear-gradient(180deg, ${th.accent}, ${th.accent2});box-shadow:0 0 ${land ? 1.2 : 2}cqw ${rgba(th.accent, 0.8)};"></span>`
      : `<span style="font-family:${th.bodyStack};font-size:${land ? 1.1 : 1.8}cqw;letter-spacing:0.18em;color:${th.accentText};min-width:${land ? 3 : 4.6}cqw;">${String(i2 + 1).padStart(2, "0")}</span>`}
        <span style="flex:1;font-family:${th.displayStack};font-weight:600;font-size:${rowFs}cqw;line-height:1.3;letter-spacing:-0.01em;color:${th.ink};">${esc(t)}</span>
        <span class="${id}-tick" style="display:block;width:${land ? 3.2 : 5}cqw;height:${land ? 0.14 : 0.22}cqw;background:${i2 % 2 ? th.accent2 : th.accent};box-shadow:0 0 ${land ? 1 : 1.6}cqw ${rgba(i2 % 2 ? th.accent2 : th.accent, 0.9)};transform-origin:right center;"></span>
      </div>`).join("");
  const html = `
    <div id="${id}-wash" style="position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse 60% 52% at ${land ? "16% 30%" : "24% 22%"}, ${rgba(th.accent, 0.2)} 0%, transparent 68%);"></div>
    <div style="position:absolute;left:${land ? 7 : 6}cqw;right:${land ? 7 : 6}cqw;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;">
      ${kickerRow(id, kicker, th, land)}
      <div style="position:relative;overflow:hidden;">${maskLines(lines, headFs, th.ink, `${id}-head`, th, 700)}</div>
      <div style="margin-top:${land ? 2.2 : 3.4}cqw;">${rows}</div>
    </div>`;
  const s = [
    `tl.fromTo("#${id}-wash",{opacity:0},{opacity:1,duration:1,ease:"power2.out"},${T});`,
    kicker ? `tl.fromTo("#${id}-kick",{opacity:0,x:-22},{opacity:1,x:0,duration:0.55,ease:"power3.out"},${r(T + 0.15)});` : "",
    `tl.fromTo(".${id}-head",{opacity:0,yPercent:110},{opacity:1,yPercent:0,duration:0.85,ease:"power3.out",stagger:0.12},${r(T + 0.25)});`,
    `tl.fromTo(".${id}-row",{opacity:0,y:${land ? 26 : 34},scale:0.985},{opacity:1,y:0,scale:1,duration:0.7,ease:"power3.out",stagger:0.16},${r(T + 0.65)});`,
    `tl.fromTo(".${id}-tick",{scaleX:0},{scaleX:1,duration:0.6,ease:"power3.out",stagger:0.16},${r(T + 0.85)});`,
  ];
  return { html, s };
}

// 4. The hero metric: a counter over a radial glow with an arc drawing around it.
function metricarc(scene, ctx) {
  const { id, T, L, theme: th, land } = ctx;
  const stats = statsOf(scene, 3);
  const main = stats[0] || null;
  const rest = stats.slice(1, 3);
  const head = fit(String(scene.headline || ""), 44);
  const label = fit(String((main && main.l) || scene.emphasis || ""), 26).toUpperCase();
  const hero = main ? "" : fit(String(scene.emphasis || scene.headline || ""), 14);
  const ringW = land ? 34 : 62;
  const numFs = main
    ? r(Math.min(land ? 12 : 18, (land ? 20 : 34) / Math.max(String(main.v).length + main.suf.length + main.pre.length, 1) * 4.6))
    : r(Math.min(land ? 6.5 : 9.5, (land ? 22 : 40) / Math.max(hero.length, 1) * 2.4));
  const chip = (st) => `
        <div class="${id}-chip" style="opacity:0;display:flex;align-items:baseline;gap:${land ? 0.7 : 1.1}cqw;padding:${land ? 0.7 : 1.2}cqw ${land ? 1.4 : 2.2}cqw;${glassCss(th, land ? 0.6 : 1)}">
          <span style="font-family:${th.displayStack};font-weight:700;font-size:${land ? 1.7 : 2.7}cqw;color:${th.accentText2};">${esc(st.pre)}${esc(String(st.isFloat ? st.v.toFixed(1) : Math.round(st.v)))}${esc(st.suf)}</span>
          <span style="font-family:${th.bodyStack};font-size:${land ? 0.95 : 1.6}cqw;letter-spacing:0.2em;text-transform:uppercase;color:${th.soft};">${esc(fit(st.l, 18))}</span>
        </div>`;
  const html = `
    <div id="${id}-core" style="position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse ${land ? "34% 46%" : "44% 26%"} at 50% ${head ? 48 : 50}%, ${rgba(th.accent, 0.32)} 0%, ${rgba(th.accent2, 0.1)} 42%, transparent 72%);"></div>
    <svg id="${id}-ring" viewBox="0 0 200 200" style="position:absolute;left:50%;margin-left:${r(-ringW / 2)}cqw;top:50%;margin-top:${r(-ringW / 2)}cqw;width:${ringW}cqw;height:${ringW}cqw;opacity:0;overflow:visible;">
      <circle cx="100" cy="100" r="88" fill="none" stroke="${th.hair2}" stroke-width="0.6"/>
      <circle id="${id}-arc" class="draw" cx="100" cy="100" r="88" pathLength="100" fill="none" stroke="${th.accent}" stroke-width="1.7" stroke-linecap="round" transform="rotate(-90 100 100)"/>
    </svg>
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;">
      ${head ? `<div id="${id}-head" style="opacity:0;margin-bottom:${land ? 1.4 : 2.2}cqw;font-family:${th.bodyStack};font-size:${land ? 1.25 : 2}cqw;letter-spacing:0.32em;text-transform:uppercase;color:${th.soft};text-align:center;max-width:70cqw;">${esc(head)}</div>` : ""}
      <div id="${id}-num" style="opacity:0;font-family:${th.displayStack};font-weight:700;font-size:${numFs}cqw;line-height:1;letter-spacing:-0.03em;color:${th.ink};text-shadow:0 0 ${land ? 3 : 5}cqw ${rgba(th.accent, 0.45)};">${main ? `${esc(main.pre)}0${esc(main.suf)}` : esc(hero)}</div>
      ${label && label !== head.toUpperCase() ? `<div id="${id}-lab" style="opacity:0;margin-top:${land ? 1.3 : 2}cqw;font-family:${th.bodyStack};font-size:${land ? 1.25 : 2}cqw;letter-spacing:0.3em;text-transform:uppercase;color:${th.body};text-align:center;max-width:70cqw;">${esc(label)}</div>` : ""}
    </div>
    ${rest.length ? `<div style="position:absolute;left:6cqw;right:6cqw;bottom:${land ? 8 : 11}%;display:flex;gap:${land ? 1.2 : 1.8}cqw;flex-wrap:wrap;justify-content:center;">${rest.map(chip).join("")}</div>` : ""}`;
  const s = [
    `tl.fromTo("#${id}-core",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:1.1,ease:"power3.out"},${T});`,
    `tl.to("#${id}-core",{opacity:0.7,duration:2,ease:"sine.inOut",yoyo:true,repeat:reps(${r(Math.max(0.1, L - 1.1))},2)},${r(T + 1.1)});`,
    `tl.fromTo("#${id}-ring",{opacity:0,scale:0.82,rotation:-8},{opacity:1,scale:1,rotation:0,duration:0.95,ease:"power3.out"},${r(T + 0.1)});`,
    `tl.fromTo("#${id}-arc",{strokeDashoffset:100},{strokeDashoffset:24,duration:${r(Math.min(1.6, Math.max(0.8, L * 0.45)))},ease:"power2.inOut"},${r(T + 0.35)});`,
    head ? `tl.fromTo("#${id}-head",{opacity:0,y:${land ? -16 : -22}},{opacity:1,y:0,duration:0.6,ease:"power3.out"},${r(T + 0.3)});` : "",
    `tl.fromTo("#${id}-num",{opacity:0,scale:0.72},{opacity:1,scale:1,duration:0.75,ease:"power3.out"},${r(T + 0.35)});`,
    main ? `countTxt("#${id}-num",${main.v},${r(T + 0.4)},${r(Math.min(1.7, Math.max(0.8, L * 0.5)))},${JSON.stringify(main.pre)},${JSON.stringify(main.suf)},${main.isFloat ? 10 : 1});` : "",
    label && label !== head.toUpperCase() ? `tl.fromTo("#${id}-lab",{opacity:0,y:${land ? 20 : 26}},{opacity:1,y:0,duration:0.6,ease:"power3.out"},${r(T + 0.9)});` : "",
    rest.length ? `tl.fromTo(".${id}-chip",{opacity:0,y:${land ? 22 : 30}},{opacity:1,y:0,duration:0.6,ease:"power3.out",stagger:0.14},${r(T + 1.1)});` : "",
  ];
  return { html, s };
}

// 5. The testimonial: a glass panel with a glowing accent edge.
function glassquote(scene, ctx, a) {
  const { id, T, theme: th, land, brand } = ctx;
  const quote = fit(String(scene.quote || scene.subtext || scene.headline || ""), 150);
  const words = quote.split(/\s+/).filter(Boolean);
  const author = fit(String(scene.author || scene.emphasis || ""), 30);
  const role = fit(String(scene.role || brand || ""), 34);
  const initial = (author || String(brand || "")).trim().charAt(0).toUpperCase() || "•";
  const size = r(Math.min(land ? 3.5 : 4.5, (land ? 170 : 140) / Math.max(words.length, 1) + 1.2));
  const radius = land ? 1.4 : 2;
  const html = `
    <div id="${id}-wash" style="position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse 56% 50% at 30% 46%, ${rgba(th.accent2, 0.24)} 0%, transparent 70%);"></div>
    <div id="${id}-panel" style="position:absolute;left:${land ? 9 : 6}cqw;right:${land ? 9 : 6}cqw;top:${land ? "14%" : "22%"};bottom:${land ? "14%" : "22%"};opacity:0;${glassCss(th, radius)}overflow:hidden;">
      <div id="${id}-edge" style="position:absolute;left:0;top:0;bottom:0;width:${land ? 0.32 : 0.5}cqw;background:linear-gradient(180deg, ${th.accent}, ${th.accent2});box-shadow:0 0 ${land ? 2 : 3}cqw ${rgba(th.accent, 0.85)};transform-origin:center top;"></div>
      <div style="position:absolute;left:${land ? 4.5 : 6}cqw;right:${land ? 4.5 : 6}cqw;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;">
        <div id="${id}-mark" style="opacity:0;font-family:${th.displayStack};font-weight:700;font-size:${land ? 6 : 9}cqw;line-height:0.7;color:${th.accentText};">&ldquo;</div>
        <div style="margin-top:${land ? 1.4 : 2.2}cqw;display:flex;flex-wrap:wrap;">
          ${words.map((w) => `<span class="${id}-w" style="opacity:0;font-family:${th.displayStack};font-weight:600;font-size:${size}cqw;line-height:1.4;letter-spacing:-0.01em;color:${th.ink};margin-right:0.55em;">${esc(w)}</span>`).join("")}
        </div>
        <div id="${id}-att" style="opacity:0;margin-top:${land ? 2.4 : 3.6}cqw;display:flex;align-items:center;gap:${land ? 1.2 : 2}cqw;">
          ${a && a.path
      ? `<span style="display:block;width:${land ? 3.4 : 5.4}cqw;height:${land ? 3.4 : 5.4}cqw;border-radius:50%;overflow:hidden;border:${th.hairW}cqw solid ${th.hair2};box-shadow:0 0 ${land ? 1.6 : 2.6}cqw ${rgba(th.accent, 0.6)};"><img src="${esc(a.path)}" alt="${esc(a.alt || author || "")}" style="width:100%;height:100%;object-fit:cover;display:block;"></span>`
      : `<span style="display:grid;place-items:center;width:${land ? 3.4 : 5.4}cqw;height:${land ? 3.4 : 5.4}cqw;border-radius:50%;background:${th.accent};color:${th.onAccent};font-family:${th.displayStack};font-weight:700;font-size:${land ? 1.5 : 2.4}cqw;box-shadow:0 0 ${land ? 1.6 : 2.6}cqw ${rgba(th.accent, 0.6)};">${esc(initial)}</span>`}
          <span>
            ${author ? `<span style="display:block;font-family:${th.displayStack};font-weight:700;font-size:${land ? 1.5 : 2.4}cqw;color:${th.ink};">${esc(author)}</span>` : ""}
            ${role ? `<span style="display:block;margin-top:0.3cqw;font-family:${th.bodyStack};font-size:${land ? 1.05 : 1.75}cqw;letter-spacing:0.22em;text-transform:uppercase;color:${th.soft};">${esc(role)}</span>` : ""}
          </span>
        </div>
      </div>
    </div>`;
  const s = [
    `tl.fromTo("#${id}-wash",{opacity:0},{opacity:1,duration:1,ease:"power2.out"},${T});`,
    `tl.fromTo("#${id}-panel",{opacity:0,y:${land ? 30 : 40},scale:0.975},{opacity:1,y:0,scale:1,duration:0.85,ease:"power3.out"},${r(T + 0.1)});`,
    `tl.fromTo("#${id}-edge",{scaleY:0},{scaleY:1,duration:0.75,ease:"power3.out"},${r(T + 0.35)});`,
    `tl.fromTo("#${id}-mark",{opacity:0,y:${land ? 18 : 24}},{opacity:1,y:0,duration:0.5,ease:"power3.out"},${r(T + 0.4)});`,
    `tl.fromTo(".${id}-w",{opacity:0,y:${land ? 16 : 22}},{opacity:1,y:0,duration:0.45,ease:"power2.out",stagger:0.05},${r(T + 0.55)});`,
    `tl.fromTo("#${id}-att",{opacity:0,x:-24},{opacity:1,x:0,duration:0.6,ease:"power3.out"},${r(T + 1.25)});`,
  ];
  return { html, s };
}

// 6. A row of small glass tiles — the proof wall.
function prooftiles(scene, ctx, a, b) {
  const { id, T, theme: th, land, brand, url } = ctx;
  const lines = breakLines(scene.headline, "").slice(0, 2).map((l) => fit(String(l), 30));
  const kicker = fit(String(scene.kicker || scene.eyebrow || ""), 22).toUpperCase();
  const st = mineStat(scene.badge) || mineStat(scene.emphasis) || mineStat(scene.subtext) || statsOf(scene, 1)[0] || null;
  const badge = fit(String(scene.badge || (st ? `${st.pre}${st.isFloat ? st.v.toFixed(1) : Math.round(st.v)}${st.suf}` : String(brand).slice(0, 3).toUpperCase())), 8);
  const badgeLabel = fit(String(scene.badgeLabel || (st && st.l) || ""), 22).toUpperCase();
  const headFs = r(Math.min(land ? 4 : 5.4, (land ? 74 : 80) / Math.max(...lines.map((l) => l.length), 1) * 1.5));
  const radius = land ? 0.9 : 1.4;
  const mediaTile = (asset, cls, n) => `
      <div class="${cls} ${id}-tile" style="opacity:0;position:relative;overflow:hidden;${glassCss(th, radius)}">
        ${asset && asset.path
      ? `<img src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="width:100%;height:100%;object-fit:cover;object-position:top center;display:block;">`
      : brandPlate(th, land, brand, url, false)}
        <span style="position:absolute;left:${land ? 0.7 : 1.1}cqw;top:${land ? 0.7 : 1.1}cqw;font-family:${th.bodyStack};font-size:${land ? 0.9 : 1.5}cqw;letter-spacing:0.18em;color:${th.accentText};">${n}</span>
      </div>`;
  const html = `
    <div id="${id}-wash" style="position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse 62% 54% at 50% ${land ? 78 : 70}%, ${rgba(th.accent, 0.2)} 0%, transparent 70%);"></div>
    <div style="position:absolute;left:${land ? 7 : 6}cqw;right:${land ? 7 : 6}cqw;top:${land ? "12%" : "10%"};">
      ${kickerRow(id, kicker, th, land)}
      <div style="position:relative;overflow:hidden;">${maskLines(lines, headFs, th.ink, `${id}-head`, th, 700)}</div>
    </div>
    <div style="position:absolute;left:${land ? 7 : 6}cqw;right:${land ? 7 : 6}cqw;top:${land ? "44%" : "38%"};bottom:${land ? "13%" : "12%"};display:grid;grid-template-columns:${land ? "1fr 1fr 1fr 1fr" : "1fr 1fr"};grid-template-rows:${land ? "1fr" : "1fr 1fr"};gap:${land ? 1.2 : 1.8}cqw;">
      ${mediaTile(a, `${id}-t1`, "01")}
      ${mediaTile(b, `${id}-t2`, "02")}
      <div class="${id}-t3 ${id}-tile" style="opacity:0;position:relative;display:grid;place-items:center;overflow:hidden;${glassCss(th, radius)}">
        <div style="position:absolute;inset:0;background:radial-gradient(ellipse 74% 66% at 50% 46%, ${rgba(th.accent, 0.24)} 0%, transparent 72%);"></div>
        <div style="position:relative;text-align:center;padding:${land ? 0.8 : 1.4}cqw;">
          <div style="font-family:${th.displayStack};font-weight:700;font-size:${land ? 3.6 : 5.2}cqw;line-height:1;color:${th.ink};text-shadow:0 0 ${land ? 2 : 3}cqw ${rgba(th.accent, 0.5)};">${esc(badge)}</div>
          ${badgeLabel ? `<div style="margin-top:${land ? 0.6 : 1}cqw;font-family:${th.bodyStack};font-size:${land ? 0.9 : 1.5}cqw;letter-spacing:0.2em;text-transform:uppercase;color:${th.body};">${esc(badgeLabel)}</div>` : ""}
        </div>
      </div>
      <div class="${id}-t4 ${id}-tile" style="opacity:0;position:relative;display:grid;place-items:center;overflow:hidden;${glassCss(th, radius)}">
        <div style="text-align:center;padding:${land ? 0.8 : 1.4}cqw;">
          <div style="font-family:${th.displayStack};font-weight:700;font-size:${land ? 2.2 : 3.2}cqw;letter-spacing:0.04em;color:${th.ink};">${esc(String(brand).slice(0, 14))}</div>
          <div style="margin:${land ? 0.7 : 1.1}cqw auto 0;width:${land ? 5 : 8}cqw;height:${land ? 0.14 : 0.22}cqw;background:${th.accent2};box-shadow:0 0 ${land ? 1 : 1.6}cqw ${rgba(th.accent2, 0.9)};"></div>
          <div style="margin-top:${land ? 0.7 : 1.1}cqw;font-family:${th.bodyStack};font-size:${land ? 0.9 : 1.5}cqw;letter-spacing:0.24em;text-transform:uppercase;color:${th.soft};">${esc(url)}</div>
        </div>
      </div>
    </div>`;
  const s = [
    `tl.fromTo("#${id}-wash",{opacity:0},{opacity:1,duration:1,ease:"power2.out"},${T});`,
    kicker ? `tl.fromTo("#${id}-kick",{opacity:0,x:-22},{opacity:1,x:0,duration:0.55,ease:"power3.out"},${r(T + 0.15)});` : "",
    `tl.fromTo(".${id}-head",{opacity:0,yPercent:110},{opacity:1,yPercent:0,duration:0.8,ease:"power3.out",stagger:0.12},${r(T + 0.25)});`,
    `tl.fromTo(".${id}-tile",{opacity:0,y:${land ? 34 : 40},scale:0.95},{opacity:1,y:0,scale:1,duration:0.7,ease:"power3.out",stagger:0.15},${r(T + 0.6)});`,
  ];
  return { html, s };
}

// 7. CLOSER — the closing line out of an accent bloom, glowing pill, the url.
function glowcta(scene, ctx, a) {
  const { id, T, L, theme: th, land, url } = ctx;
  const lines = breakLines(scene.headline, "").slice(0, 2).map((l) => fit(String(l), 26));
  const cta = fit(String(scene.cta || scene.emphasis || ""), 22);
  const kicker = fit(String(scene.kicker || scene.eyebrow || ""), 22).toUpperCase();
  const size = headSize(lines, land, land ? 7 : 8.6);
  const html = `
    <div id="${id}-bloom" style="position:absolute;inset:${land ? "-24% -10%" : "-8% -26%"};opacity:0;background:radial-gradient(ellipse 42% 44% at 50% 52%, ${rgba(th.accent, 0.38)} 0%, ${rgba(th.accent2, 0.13)} 40%, transparent 72%);"></div>
    <div style="position:absolute;left:${land ? 8 : 7}cqw;right:${land ? 8 : 7}cqw;top:0;bottom:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;">
      ${a && a.path ? `<img id="${id}-logo" src="${esc(a.path)}" alt="${esc(a.alt || "")}" style="opacity:0;max-height:${land ? 4 : 6}cqw;max-width:${land ? 26 : 44}cqw;object-fit:contain;margin-bottom:${land ? 1.6 : 2.4}cqw;">` : ""}
      ${kicker ? `<div id="${id}-kick" style="opacity:0;margin-bottom:${land ? 1.4 : 2.2}cqw;font-family:${th.bodyStack};font-size:${land ? 1.1 : 1.8}cqw;letter-spacing:0.36em;text-transform:uppercase;color:${th.accentText};">${esc(kicker)}</div>` : ""}
      <div style="position:relative;overflow:hidden;padding:${land ? 0.4 : 0.8}cqw 0;">
        ${maskLines(lines, size, th.ink, `${id}-ln`, th, 700)}
        ${sweepEl(id, th)}
      </div>
      ${cta ? `<div id="${id}-cta" style="opacity:0;margin-top:${land ? 2.4 : 3.6}cqw;padding:${land ? "1.1cqw 3.2cqw" : "1.8cqw 4.6cqw"};border-radius:${land ? 5 : 8}cqw;background:${th.accent};color:${th.onAccent};font-family:${th.displayStack};font-weight:700;font-size:${land ? 1.9 : 3}cqw;letter-spacing:0.02em;box-shadow:0 0 ${land ? 3 : 4.6}cqw ${rgba(th.accent, 0.55)};">${esc(cta)}</div>` : ""}
      <div id="${id}-rule" style="opacity:0;margin-top:${land ? 2.4 : 3.6}cqw;width:${land ? 46 : 74}cqw;height:${land ? 0.12 : 0.2}cqw;background:linear-gradient(90deg, transparent, ${th.accent2}, transparent);transform-origin:center center;"></div>
      <div id="${id}-url" style="opacity:0;margin-top:${land ? 1.4 : 2.2}cqw;font-family:${th.bodyStack};font-size:${land ? 1.25 : 2}cqw;letter-spacing:0.34em;text-transform:uppercase;color:${th.body};">${esc(url)}</div>
    </div>`;
  const s = [
    `tl.fromTo("#${id}-bloom",{opacity:0,scale:0.5},{opacity:1,scale:1,duration:1.2,ease:"power3.out"},${T});`,
    `tl.to("#${id}-bloom",{opacity:0.74,scale:1.08,duration:2.2,ease:"sine.inOut",yoyo:true,repeat:reps(${r(Math.max(0.1, L - 1.2))},2.2)},${r(T + 1.2)});`,
    a && a.path ? `tl.fromTo("#${id}-logo",{opacity:0,y:${land ? -14 : -20}},{opacity:1,y:0,duration:0.55,ease:"power3.out"},${r(T + 0.1)});` : "",
    kicker ? `tl.fromTo("#${id}-kick",{opacity:0,y:${land ? -16 : -22}},{opacity:1,y:0,duration:0.55,ease:"power3.out"},${r(T + 0.2)});` : "",
    `tl.fromTo(".${id}-ln",{opacity:0,yPercent:112},{opacity:1,yPercent:0,duration:0.9,ease:"power3.out",stagger:0.14},${r(T + 0.3)});`,
    ...sweepIn(id, r(T + 0.95)),
    cta ? `tl.fromTo("#${id}-cta",{opacity:0,y:${land ? 24 : 32},scale:0.9},{opacity:1,y:0,scale:1,duration:0.7,ease:"power3.out"},${r(T + 0.95)});` : "",
    cta ? `tl.to("#${id}-cta",{boxShadow:"0 0 ${land ? 5.5 : 8}cqw ${rgba(th.accent, 0.85)}",duration:1.5,ease:"sine.inOut",yoyo:true,repeat:reps(${r(Math.max(0.1, L - 1.7))},1.5)},${r(T + 1.65)});` : "",
    `tl.fromTo("#${id}-rule",{opacity:0,scaleX:0},{opacity:1,scaleX:1,duration:0.7,ease:"power3.out"},${r(T + 1.15)});`,
    `tl.fromTo("#${id}-url",{opacity:0,y:${land ? 16 : 22}},{opacity:1,y:0,duration:0.6,ease:"power3.out"},${r(T + 1.3)});`,
  ];
  return { html, s };
}

const SCENES = { revealtitle, glasscard, specrows, metricarc, glassquote, prooftiles, glowcta };

// ---- persistent chrome (the room the reveal happens in) -----------------------
function chrome({ theme: th, D, brand, url, count, land }) {
  const shade = th.dark ? "0,0,0" : "60,68,84";
  const barH = land ? 2.6 : 4.2;
  return {
    html: `
  <div id="backdrop" class="clip" data-start="0" data-duration="__D__" data-track-index="0" data-layout-allow-occlusion style="opacity:0;background:${th.ground};">
    <div id="bd-aura" style="position:absolute;inset:-18%;background:radial-gradient(ellipse 34% 40% at 76% 16%, ${rgba(th.accent, 0.2)} 0%, transparent 66%), radial-gradient(ellipse 40% 44% at 18% 88%, ${rgba(th.accent2, 0.16)} 0%, transparent 68%);"></div>
    <div id="bd-grid" style="position:absolute;inset:0;opacity:0.4;background-image:linear-gradient(${rgba(th.ink, 0.05)} ${th.hairW}cqw, transparent ${th.hairW}cqw), linear-gradient(90deg, ${rgba(th.ink, 0.05)} ${th.hairW}cqw, transparent ${th.hairW}cqw);background-size:${land ? 6 : 9}cqw ${land ? 6 : 9}cqw;"></div>
    <div style="position:absolute;inset:0;background:radial-gradient(ellipse 76% 74% at 50% 46%, transparent 38%, rgba(${shade},${th.dark ? 0.62 : 0.16}) 100%);"></div>
  </div>
  <div id="edge" class="clip" data-start="0" data-duration="__D__" data-track-index="40" data-layout-allow-occlusion style="opacity:0;background:none;">
    <div style="position:absolute;left:0;right:0;top:0;height:${barH}cqw;display:flex;align-items:center;justify-content:space-between;padding:0 ${land ? 3 : 4}cqw;border-bottom:${th.hairW}cqw solid ${rgba(th.ink, 0.1)};">
      <span style="display:flex;align-items:center;gap:${land ? 0.7 : 1.1}cqw;font-family:${th.bodyStack};font-size:${land ? 0.88 : 1.4}cqw;letter-spacing:0.3em;text-transform:uppercase;color:${th.soft};">
        <span id="edge-dot" style="display:block;width:${land ? 0.45 : 0.7}cqw;height:${land ? 0.45 : 0.7}cqw;border-radius:50%;background:${th.accent};box-shadow:0 0 ${land ? 1 : 1.6}cqw ${rgba(th.accent, 0.9)};"></span>
        ${esc(String(brand).toUpperCase())}
      </span>
    </div>
    <div style="position:absolute;left:0;right:0;bottom:0;height:${barH}cqw;display:flex;align-items:center;justify-content:flex-end;padding:0 ${land ? 3 : 4}cqw;">
      <span style="font-family:${th.bodyStack};font-size:${land ? 0.88 : 1.4}cqw;letter-spacing:0.3em;text-transform:uppercase;color:${th.faint};">${esc(url)}</span>
    </div>
    <div id="edge-prog" style="position:absolute;left:0;bottom:0;width:100%;height:${land ? 0.18 : 0.28}cqw;background:linear-gradient(90deg, ${th.accent}, ${th.accent2});box-shadow:0 0 ${land ? 1.2 : 2}cqw ${rgba(th.accent, 0.7)};transform-origin:left center;"></div>
  </div>`,
    script: `
  tl.fromTo("#backdrop",{opacity:0},{opacity:1,duration:0.5},0);
  tl.fromTo("#edge",{opacity:0},{opacity:1,duration:0.6},0.2);
  tl.fromTo("#edge-prog",{scaleX:0},{scaleX:1,duration:${r(Math.max(1, D))},ease:"none"},0);
  tl.to("#bd-aura",{opacity:0.66,duration:3.4,ease:"sine.inOut",yoyo:true,repeat:reps(${r(D)},3.4)},0);
  tl.to("#edge-dot",{opacity:0.35,duration:1.1,ease:"sine.inOut",yoyo:true,repeat:reps(${r(D)},1.1)},0.6);`,
  };
}

// Per-scene: step the reveal counter in the top edge as each plate opens.
// No per-scene chrome — the "01 / 08" scene counter was removed: a slide number
// ticking up is the same slideshow tell as the progress rail.

function styleBlock(th, land) {
  return `${th.fontFace}
  #root { font-family:${th.bodyStack}; -webkit-font-smoothing:antialiased; }
  img { -webkit-user-drag:none; }
  #cap-pill { background:${rgba(th.ground, 0.72)}; border:${th.hairW}cqw solid ${th.hair} !important; border-radius:${land ? 0.7 : 1.1}cqw; box-shadow:${th.lift}; }
  #cap-text { font-family:${th.bodyStack}; color:${th.body}; letter-spacing:0.04em; }`;
}

const family = {
  theme, styleBlock, chrome, SCENES, TEMPLATE_SCENES, route, mediaSlots, mediaFallback,
  // The engine injects the site logo into `a` for the closer WITHOUT touching
  // the demand math (scanCoverage reads data-media-* stamps, not <img> tags).
  wantsLogo: (t) => t === "glowcta",
  fallbackType: "revealtitle",
  variants: 3,
  // Dark-premium never slams: slow pushes, soft focus pulls, no whip cuts.
  camera: { kinds: ["zoom", "zoom", "zoom", "zoom", "zoom", "zoom", "zoom", "zoom"], blur: 16, push: 0.05, zoomIn: 1.13, zoomOut: 1.11 },
};

function buildComposition(opts) { return E.buildFilm(family, opts); }
// This pack's media demand + what filled each slot, WITHOUT rendering. Runs the
// exact routing and slot-filling the renderer runs, so the manifest can never
// drift from the film that ships.
function planMedia(opts) { return E.planMedia(family, opts); }

module.exports = { buildComposition, planMedia, TEMPLATE_SCENES };
