// POSTER-LOUD family template — the authored scene grammar for the brutalist /
// risograph / kinetic-type poster packs (blockframe, bold-poster, broadside,
// brut-pop, coral, creative-mode, kinetic-bold, riso-press, cobalt-grid,
// bauhaus-print, hype-wave, poster-pop, story-blocks).
//
// These packs used to render through scene_kit's SHARED archetypes, so a riso
// poster and a brutalist zine drew the same feature-card row as every other pack
// in the gallery. This file gives the whole family its own grammar — seven
// authored scenes that only make sense as printed-poster staging — while every
// pack keeps its OWN skin: colours, fonts and text effects come from
// scene_kit.deriveTheme(pack), so kinetic-bold stays acid-on-white and riso-press
// stays ink-on-oatmeal. `variant` (hashed from the pack name) additionally flips
// staging per pack, so two packs in the family never compose identically.
//
// The render contract (seek-safety, tracks, hard kills, caption node, camera) is
// the engine's — see template_engine.js. This module is design only.

const { deriveTheme } = require("./scene_kit");
const E = require("./template_engine");
// The shared motion vocabulary — see services/motion_presets.js. Physics for
// headlines and cards lives there now, so every template moves alike.
const MOTION = require("./motion_presets");
const { esc, r, rgba, statsOf, breakLines, bullets, fit, mineStat } = E;

// ---- theme -------------------------------------------------------------------
// The pack's own resolved identity + the poster family's structural extras.
function theme(manifest, brandSkin, { framePack } = {}) {
  const t = deriveTheme(framePack, {}, brandSkin);
  const accents = (t.accents && t.accents.length ? t.accents : ["#FF3D2E", "#2D7CFF"]).slice(0, 4);
  return {
    ...t,
    accent: accents[0],
    // Accents are tuned for FILLS. As small text they can sit at 2.9:1 on the
    // pack ground (measured across the gallery), so text use goes through a
    // guaranteed-AA variant while fills keep the raw hue.
    accentText: E.readable(t.ground, accents[0], 1, 4.5),
    // A full-width accent BAND sits behind ink-coloured display type. Where the
    // pack ground and accent are close in luminance the headline measured 2.2:1,
    // so the band is pulled toward the ground until the ink clears large-text AA.
    band: (() => { let c = accents[0]; for (let m = 0; m <= 1.001; m += 0.2) { c = E.mix(accents[0], t.ground, m); if (E.contrastRatio(t.ink, c) >= 3.2) break; } return c; })(),
    accentText2: E.readable(t.ground, accents[1] || accents[0], 1, 4.5),
    accent2: accents[1] || accents[0],
    accent3: accents[2] || accents[1] || accents[0],
    rule: t.isDark ? rgba(t.ink, 0.9) : t.ink,
    displayStack: t.displayStack || t.fontStack || "system-ui, sans-serif",
    bodyStack: t.fontStack || "system-ui, sans-serif",
    fontFace: t.fontFace || "",
  };
}

// ---- published vocabulary (Template Director casts onto these) ----------------
const TEMPLATE_SCENES = [
  {
    type: "billboard", bestFor: "opening statement, the loudest line in the film",
    look: "Full-bleed poster: enormous stacked type slamming in word by word over a hard colour block, with an offset ghost repeat behind it.",
    slots: { lines: "1-3 stacked lines, 1-3 words each", kicker: "max 20 chars" },
    media: [],
  },
  {
    type: "blockshot", bestFor: "a product screen or photo shown next to a claim",
    look: "Hard split: a solid colour block carrying the headline on one side, the image on the other in a thick offset frame that snaps into place.",
    slots: { kicker: "max 20 chars", headline: "max 2 short lines", body: "one sentence, max 120 chars" },
    media: ["desktop"],
  },
  {
    type: "manifesto", bestFor: "a list of points, steps or refusals",
    look: "Numbered rows (01/02/03) sliding in from the left against a ruled grid, each with its own rule that wipes across.",
    slots: { kicker: "max 20 chars", headline: "max 2 short lines", items: "2-4 lines, max 34 chars each" },
    media: [],
  },
  {
    type: "bignum", bestFor: "one number that matters",
    look: "A single colossal counter filling the frame, its label stamped underneath, rules crossing the plate.",
    slots: { stats: "1-2 of {v: number, suf: '%'|'X'|'K'|'M'|'', l: label max 24 chars}", headline: "max 1 short line" },
    media: [],
  },
  {
    type: "quoteslab", bestFor: "testimonial, a loud pull-quote",
    look: "The quote reversed out of a solid accent slab, with a rotated attribution tag pinned to the corner.",
    slots: { quote: "max 120 chars, verbatim", author: "person's name", role: "role and/or company" },
    media: [],
  },
  {
    type: "tilewall", bestFor: "several visuals, a showcase, social proof",
    look: "A hard poster grid of image tiles with stamped index numbers, each tile snapping in on a beat.",
    slots: { kicker: "max 20 chars", headline: "max 2 short lines", badge: "a rating or number, max 8 chars", badgeLabel: "max 20 chars" },
    media: ["photo", "photo"], mediaMin: 1,
  },
  {
    type: "stamp", bestFor: "closing call to action",
    look: "One giant word with a rotating stamp badge punched over it, the url set in a hard rule beneath.",
    slots: { headline: "max 2 short lines", cta: "button label, max 20 chars", kicker: "max 20 chars" },
    media: [],
  },
];

const mediaSlots = { blockshot: ["desktop"], tilewall: ["photo", "photo"], quoteslab: ["photo"] };
// True when the PREVIOUS scene already carried imagery — keeps media beats
// alternating now that any spare asset, not just a pinned screenshot, earns one.
const mediaBeatJustPlayed = (ctx) => ((mediaSlots[ctx && ctx.prevType] || []).length > 0);

// ---- deterministic router (used when the director is off / uncast) -----------
function route(scene, i, total, ctx) {
  const k = String(scene.kind || "").toLowerCase();
  const p = String(scene.purpose || "").toLowerCase();
  if (i === 0 || k === "hook" || k === "title") return "billboard";
  if (i === total - 1 || k === "cta" || p === "cta") return "stamp";
  if (k === "quote" || scene.quote || /testimonial/.test(p)) return "quoteslab";
  if (k === "stat" || k === "chart" || statsOf(scene, 1).length) return "bignum";
  // MEDIA BEAT — ahead of the text branch, and satisfied by ANY spare asset:
  // `manifesto` used to claim every middle scene and the media branch only fired
  // for a pinned shot or a real screenshot, so a pool of stock photos went
  // unshown. The old GLOBAL gate (!mediaBeatJustPlayed) forbade ANY two media
  // scenes in a row and capped the family at ~3/8. Per-type guards now let media
  // beats run consecutively as long as they are DIFFERENT types (a tilewall can
  // follow a blockshot and vice-versa) while the SAME type never repeats
  // back-to-back.
  if (ctx.freeCount >= 3 && ctx.prevType !== "tilewall") return "tilewall";
  if ((ctx.pinned || ctx.hasShot || ctx.freeCount >= 1) && ctx.prevType !== "blockshot") return "blockshot";
  if (bullets(scene, 4).length >= 2) return "manifesto";
  if (/gallery|showcase|portfolio|social|proof/.test(`${k} ${p}`) && ctx.freeCount >= 1 && ctx.prevType !== "tilewall") return "tilewall";
  return ctx.prevType === "billboard" ? "manifesto" : "billboard";
}
const mediaFallback = (scene) => {
  // Keep a quote scene on its quoteslab card (monogram fallback) when no photo is
  // free, instead of rerouting the testimonial away and dropping the quote.
  if (scene && (scene.quote || String(scene.kind || "").toLowerCase() === "quote" || /testimonial|review/.test(String(scene.purpose || "").toLowerCase()))) return null;
  return bullets(scene, 3).length >= 2 ? "manifesto" : "billboard";
};

// ---- shared poster furniture --------------------------------------------------
const stackType = (lines, size, color, cls) => lines
  .map((ln, i) => `<div class="${cls}" style="opacity:0;font-family:inherit;font-size:${r(size)}cqw;line-height:0.88;letter-spacing:-0.02em;color:${color};">${esc(ln)}</div>`)
  .join("");

// Type size that keeps the longest line inside the plate.
const typeSize = (lines, land, cap) => {
  const longest = Math.max(...lines.map((l) => String(l).length), 1);
  return Math.min(cap || (land ? 13 : 15), (land ? 92 : 88) / longest * 1.5);
};

function ruleRow(id, color, w = "26cqw") {
  return `<div class="${id}-rule" style="width:${w};height:0.55cqw;background:${color};transform-origin:left center;"></div>`;
}

// Vertical placement for a content block. In PORTRAIT the frame is ~177cqw tall
// (cqw is a share of WIDTH), so a landscape `top:12cqw` pins everything to the
// upper third and leaves two thirds of a 9:16 reel empty — centre it instead.
const blockTop = (land, topLand) => (land ? `top:${topLand}cqw;` : "top:50%;transform:translateY(-50%);");

// ---- scenes -------------------------------------------------------------------

function billboard(scene, ctx) {
  const { id, T, L, theme: th, land, variant } = ctx;
  const raw = Array.isArray(scene.lines) && scene.lines.length ? scene.lines : breakLines(scene.headline, scene.subtext);
  const lines = raw.map((l) => String(l).toUpperCase()).slice(0, 3);
  const kicker = fit(String(scene.kicker || scene.purpose || ""), 20).toUpperCase();
  const size = typeSize(lines, land);
  const alignLeft = variant % 2 === 0;
  const blockH = land ? 46 : 40;
  const html = `
    <div style="position:absolute;left:0;right:0;top:${land ? 22 : 26}cqw;height:${blockH}cqw;background:${th.band};transform-origin:left center;" id="${id}-block"></div>
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;${alignLeft ? "align-items:flex-start;padding-left:6cqw;" : "align-items:center;text-align:center;"}">
      ${kicker ? `<div id="${id}-kick" style="opacity:0;font-family:${th.bodyStack};font-size:${land ? 1.1 : 2.6}cqw;letter-spacing:0.3em;text-transform:uppercase;color:${th.ink};margin-bottom:1.2cqw;">${esc(kicker)}</div>` : ""}
      <div style="position:relative;font-family:${th.displayStack};font-weight:900;text-transform:uppercase;">
        <div style="position:absolute;left:0.5cqw;top:0.5cqw;opacity:0.28;" id="${id}-ghost">${stackType(lines, size, th.ink, `${id}-gline`)}</div>
        <div style="position:relative;">${stackType(lines, size, th.ink, `${id}-line`)}</div>
      </div>
    </div>`;
  const s = [
    kicker ? `tl.fromTo("#${id}-kick",{opacity:0,x:-30},{opacity:1,x:0,duration:0.4,ease:"power3.out"},${r(T + 0.3)});` : "",
    `tl.fromTo(".${id}-gline",{opacity:0,y:${land ? 90 : 70}},{opacity:0.28,y:0,duration:0.46,ease:"expo.out",stagger:0.11},${r(T + 0.42)});`,
    `tl.to("#${id}-ghost",{x:${land ? 14 : 10},y:${land ? 14 : 10},duration:${r(Math.max(1, L - 0.9))},ease:"sine.inOut"},${r(T + 0.9)});`,
  ];
  return { html, s };
}

function blockshot(scene, ctx, asset) {
  const { id, T, L, theme: th, land, variant, brand } = ctx;
  const lines = breakLines(scene.headline, "").map((l) => l.toUpperCase());
  const kicker = fit(String(scene.kicker || scene.purpose || ""), 20).toUpperCase();
  const body = fit(String(scene.body || scene.subtext || ""), 120);
  const right = variant % 2 === 0; // which side the plate lands on
  const size = Math.min(land ? 6.2 : 9.6, (land ? 40 : 78) / Math.max(...lines.map((l) => l.length), 1) * 1.6);
  const plate = `
    <div id="${id}-plate" style="position:absolute;${right ? "right:5cqw;" : "left:5cqw;"}top:${land ? 14 : 46}cqw;width:${land ? 44 : 88}cqw;height:${land ? 52 : 56}cqw;opacity:0;">
      <div style="position:absolute;inset:0;transform:translate(${land ? 1.4 : 1.1}cqw,${land ? 1.4 : 1.1}cqw);background:${th.accent2};"></div>
      <div style="position:absolute;inset:0;overflow:hidden;border:0.5cqw solid ${th.rule};background:${th.panel || th.ground};">
        ${asset && asset.path
          ? `<img id="${id}-img" src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="width:100%;height:100%;object-fit:cover;object-position:top center;display:block;">`
          : `<div style="width:100%;height:100%;display:grid;place-items:center;background:repeating-linear-gradient(45deg, ${rgba(th.ink, 0.08)} 0 12px, transparent 12px 24px);"><div style="font-family:${th.displayStack};font-size:4cqw;color:${th.ink};text-transform:uppercase;">${esc(String(brand).slice(0, 12))}</div></div>`}
      </div>
    </div>`;
  const html = `
    <div style="position:absolute;${right ? "left:0;" : "right:0;"}top:0;bottom:0;width:${land ? 50 : 100}cqw;background:${th.accent};" id="${id}-block"></div>
    <div style="position:absolute;${right ? "left:6cqw;" : "right:6cqw;"}${land ? "top:0;bottom:0;" : "top:14cqw;"}width:${land ? 38 : 88}cqw;display:flex;flex-direction:column;justify-content:center;">
      ${kicker ? `<div id="${id}-kick" style="opacity:0;font-family:${th.bodyStack};font-size:${land ? 1.05 : 2.5}cqw;letter-spacing:0.3em;text-transform:uppercase;color:${E.readable(th.accent, E.inkOn(th.accent, "#141210", th.ink), 1, 4.5)};">${esc(kicker)}</div>` : ""}
      <div style="font-family:${th.displayStack};font-weight:900;text-transform:uppercase;margin-top:1cqw;">
        ${stackType(lines, size, E.inkOn(th.accent, "#141210", th.ink), `${id}-line`)}
      </div>
      ${body ? `<div id="${id}-body" style="opacity:0;margin-top:1.4cqw;font-family:${th.bodyStack};font-size:${land ? 1.15 : 2.7}cqw;line-height:1.5;color:${E.readable(th.accent, E.inkOn(th.accent, "#141210", th.ink), 0.82)};max-width:${land ? 30 : 78}cqw;">${esc(body)}</div>` : ""}
    </div>
    ${plate}`;
  const s = [
    kicker ? `tl.fromTo("#${id}-kick",{opacity:0,x:-24},{opacity:1,x:0,duration:0.4,ease:"power3.out"},${r(T + 0.35)});` : "",
    body ? `tl.fromTo("#${id}-body",{opacity:0,y:22},{opacity:1,y:0,duration:0.4,ease:"power2.out"},${r(T + 0.7)});` : "",
    `tl.fromTo("#${id}-plate",{opacity:0,x:${right ? 90 : -90},rotate:${right ? 3 : -3}},{opacity:1,x:0,rotate:0,duration:0.5,ease:"back.out(1.3)"},${r(T + 0.3)});`,
    asset && asset.path ? `tl.fromTo("#${id}-img",{scale:1.08},{scale:1,duration:${r(Math.max(1, L - 0.8))},ease:"sine.out"},${r(T + 0.6)});` : "",
  ];
  return { html, s };
}

function manifesto(scene, ctx) {
  const { id, T, theme: th, land } = ctx;
  const items = (Array.isArray(scene.items) && scene.items.length ? scene.items : bullets(scene, 4))
    .map((b) => fit(String(b).split(/[:—-]\s/)[0], 34).toUpperCase()).filter(Boolean).slice(0, 4);
  const lines = breakLines(scene.headline, "").map((l) => l.toUpperCase());
  const kicker = fit(String(scene.kicker || scene.purpose || ""), 20).toUpperCase();
  const rowSize = land ? Math.min(4.4, 30 / Math.max(...items.map((s) => s.length), 1) * 1.9) : Math.min(6.2, 44 / Math.max(...items.map((s) => s.length), 1) * 2.2);
  const rows = items.map((t, i) => `
      <div class="${id}-row" style="opacity:0;display:flex;align-items:baseline;gap:1.4cqw;margin-top:${i ? (land ? 1.2 : 1.6) : 0}cqw;">
        <span style="font-family:${th.bodyStack};font-size:${land ? 1.1 : 2.6}cqw;letter-spacing:0.2em;color:${th.accentText};">${String(i + 1).padStart(2, "0")}</span>
        <span style="font-family:${th.displayStack};font-weight:900;font-size:${r(rowSize)}cqw;line-height:1;letter-spacing:-0.01em;color:${th.ink};text-transform:uppercase;">${esc(t)}</span>
      </div>
      <div class="${id}-line" style="height:0.2cqw;background:${rgba(th.ink, 0.35)};transform-origin:left center;margin-top:${land ? 0.7 : 1}cqw;"></div>`).join("");
  const html = `
    <div style="position:absolute;left:0;top:0;bottom:0;width:1.4cqw;background:${th.accent};" id="${id}-spine"></div>
    <div style="position:absolute;left:6cqw;right:6cqw;${blockTop(land, 12)}">
      ${kicker ? `<div id="${id}-kick" style="opacity:0;font-family:${th.bodyStack};font-size:${land ? 1.05 : 2.5}cqw;letter-spacing:0.3em;text-transform:uppercase;color:${th.accentText};margin-bottom:0.9cqw;">${esc(kicker)}</div>` : ""}
      <div style="font-family:${th.displayStack};font-weight:900;text-transform:uppercase;">${stackType(lines, land ? 5.6 : 10, th.ink, `${id}-head`)}</div>
      <div style="margin-top:${land ? 3 : 4}cqw;">${rows}</div>
    </div>`;
  const s = [
    `tl.fromTo("#${id}-spine",{scaleY:0},{scaleY:1,transformOrigin:"top center",duration:0.4,ease:"expo.out"},${T});`,
    kicker ? `tl.fromTo("#${id}-kick",{opacity:0,x:-20},{opacity:1,x:0,duration:0.35},${r(T + 0.25)});` : "",
    `tl.fromTo(".${id}-head",{opacity:0,y:44},{opacity:1,y:0,duration:0.42,ease:"expo.out",stagger:0.08},${r(T + 0.3)});`,
    `tl.fromTo(".${id}-row",{opacity:0,x:-46},{opacity:1,x:0,duration:0.4,ease:"power3.out",stagger:0.14},${r(T + 0.7)});`,
  ];
  return { html, s };
}

function bignum(scene, ctx) {
  const { id, T, L, theme: th, land } = ctx;
  const stats = statsOf(scene, 2);
  const main = stats[0] || { pre: "", v: 100, suf: "%", isFloat: false, l: "" };
  const label = fit(String(main.l || scene.headline || ""), 26).toUpperCase();
  const head = fit(String(scene.headline || ""), 40).toUpperCase();
  const second = stats[1] || null;
  const html = `
    <div style="position:absolute;inset:0;background:${th.accent};" id="${id}-flood"></div>
    <div style="position:absolute;left:0;right:0;top:${land ? 30 : 40}cqw;height:0.3cqw;background:${rgba(E.inkOn(th.accent, "#141210", th.ink), 0.4)};transform-origin:left center;" class="${id}-cross"></div>
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;">
      <div id="${id}-num" style="opacity:0;font-family:${th.displayStack};font-weight:900;font-size:${land ? 22 : 26}cqw;line-height:0.82;letter-spacing:-0.05em;color:${E.readable(th.accent, E.inkOn(th.accent, "#141210", th.ink), 1, 4.5)};">${esc(main.pre)}0${esc(main.suf)}</div>
      ${label ? `<div id="${id}-lab" style="opacity:0;margin-top:1.6cqw;font-family:${th.bodyStack};font-size:${land ? 1.5 : 3.2}cqw;letter-spacing:0.32em;text-transform:uppercase;color:${E.readable(th.accent, E.inkOn(th.accent, "#141210", th.ink), 1, 4.5)};">${esc(label)}</div>` : ""}
      ${head && head !== label ? `<div id="${id}-head" style="opacity:0;margin-top:${land ? 1.6 : 2.2}cqw;font-family:${th.displayStack};font-weight:900;font-size:${land ? 3 : 5.4}cqw;text-transform:uppercase;color:${E.readable(th.accent, E.inkOn(th.accent, "#141210", th.ink), 1, 4.5)};text-align:center;max-width:82%;">${esc(head)}</div>` : ""}
      ${second ? `<div id="${id}-2nd" style="opacity:0;margin-top:1.4cqw;font-family:${th.bodyStack};font-size:${land ? 1.4 : 2.2}cqw;letter-spacing:0.2em;text-transform:uppercase;color:${E.readable(th.accent, E.inkOn(th.accent, "#141210", th.ink), 0.75)};"><span id="${id}-n2">${esc(second.pre)}0${esc(second.suf)}</span> ${esc(fit(second.l, 22))}</div>` : ""}
    </div>`;
  const s = [
    `tl.fromTo(".${id}-cross",{scaleX:0},{scaleX:1,duration:0.5,ease:"expo.out"},${r(T + 0.15)});`,
    `tl.fromTo("#${id}-num",{opacity:0,scale:0.55},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.6)"},${r(T + 0.2)});`,
    `countTxt("#${id}-num",${main.v},${r(T + 0.25)},${r(Math.min(1.5, L * 0.5))},${JSON.stringify(main.pre)},${JSON.stringify(main.suf)},${main.isFloat ? 10 : 1});`,
    label ? `tl.fromTo("#${id}-lab",{opacity:0,y:26},{opacity:1,y:0,duration:0.4,ease:"power2.out"},${r(T + 0.6)});` : "",
    head && head !== label ? `tl.fromTo("#${id}-head",{opacity:0,y:26},{opacity:1,y:0,duration:0.4,ease:"power2.out"},${r(T + 0.8)});` : "",
    second ? `tl.fromTo("#${id}-2nd",{opacity:0,y:20},{opacity:1,y:0,duration:0.4},${r(T + 1)});` : "",
    second ? `countTxt("#${id}-n2",${second.v},${r(T + 1)},${r(Math.min(1.2, L * 0.4))},${JSON.stringify(second.pre)},${JSON.stringify(second.suf)},${second.isFloat ? 10 : 1});` : "",
  ];
  return { html, s };
}

function quoteslab(scene, ctx, a) {
  const { id, T, theme: th, land, brand } = ctx;
  const quote = fit(String(scene.quote || scene.subtext || scene.headline || ""), 120);
  const words = quote.split(/\s+/).filter(Boolean);
  const author = fit(String(scene.author || scene.emphasis || ""), 30);
  const role = fit(String(scene.role || scene.purpose || brand), 34).toUpperCase();
  const size = Math.min(land ? 4.6 : 7.2, (land ? 210 : 150) / Math.max(words.length, 1) + 2);
  const ink = E.readable(th.accent2, E.inkOn(th.accent2, "#141210", th.ink), 1, 4.5);
  const html = `
    <!-- The words live INSIDE the slab. Positioned as two independent layers, a
         long quote ran past the slab's bottom edge onto the pack ground, where
         ink picked for the slab measured 1.02:1 — the audit caught it as
         "shipped." hanging below the block. -->
    <div id="${id}-slab" style="position:absolute;left:${land ? 8 : 5}cqw;right:${land ? 8 : 5}cqw;top:${land ? 16 : 46}cqw;background:${th.accent2};transform-origin:left center;padding:${land ? "3cqw 4cqw 3.4cqw" : "5cqw 4cqw"};">
      <div style="font-family:${th.displayStack};font-weight:900;font-size:${land ? 7 : 9}cqw;line-height:0.6;color:${ink};opacity:0;" id="${id}-mark">“</div>
      <div style="margin-top:1cqw;display:flex;flex-wrap:wrap;">
        ${words.map((w) => `<span class="${id}-w" style="opacity:0;font-family:${th.displayStack};font-weight:800;font-size:${r(size)}cqw;line-height:1.16;color:${ink};margin-right:0.9cqw;text-transform:uppercase;">${esc(w)}</span>`).join("")}
      </div>
    </div>
    <div id="${id}-tag" style="opacity:0;position:absolute;${land ? "right:10cqw;bottom:14cqw;" : "left:9cqw;bottom:40cqw;"}transform:rotate(-3deg);background:${th.ink};padding:0.8cqw 1.6cqw;display:flex;align-items:center;gap:${land ? 1 : 1.6}cqw;">
      ${a && a.path
        ? `<div style="flex:0 0 auto;width:${land ? 4.4 : 7}cqw;height:${land ? 4.4 : 7}cqw;border-radius:50%;overflow:hidden;border:0.3cqw solid ${th.ground};"><img src="${esc(a.path)}" alt="${esc(a.alt || "")}" style="width:100%;height:100%;object-fit:cover;display:block;"></div>`
        : ""}
      <div>
        ${author ? `<div style="font-family:${th.displayStack};font-weight:900;font-size:${land ? 1.7 : 2.6}cqw;color:${th.ground};text-transform:uppercase;">${esc(author)}</div>` : ""}
        <div style="font-family:${th.bodyStack};font-size:${land ? 0.95 : 1.6}cqw;letter-spacing:0.22em;color:${E.readable(th.ink, th.ground, 0.8)};">${esc(role)}</div>
      </div>
    </div>`;
  const s = [
    `tl.fromTo("#${id}-slab",{scaleX:0},{scaleX:1,duration:0.45,ease:"expo.out"},${T});`,
    `tl.fromTo("#${id}-mark",{opacity:0,scale:0.4},{opacity:1,scale:1,duration:0.4,ease:"back.out(2)",transformOrigin:"left top"},${r(T + 0.3)});`,
    `tl.fromTo(".${id}-w",{opacity:0,y:18},{opacity:1,y:0,duration:0.3,ease:"power2.out",stagger:0.045},${r(T + 0.45)});`,
    `tl.fromTo("#${id}-tag",{opacity:0,scale:0.7,rotate:-14},{opacity:1,scale:1,rotate:-3,duration:0.42,ease:"back.out(1.8)"},${r(T + 1.1)});`,
  ];
  return { html, s };
}

function tilewall(scene, ctx, a, b) {
  const { id, T, theme: th, land, brand } = ctx;
  const lines = breakLines(scene.headline, "").map((l) => l.toUpperCase());
  const kicker = fit(String(scene.kicker || scene.purpose || ""), 20).toUpperCase();
  const st = mineStat(scene.emphasis) || mineStat(scene.subtext);
  const badge = fit(String(scene.badge || (st ? `${st.pre}${st.v}${st.suf}` : brand)), 8).toUpperCase();
  const badgeLabel = fit(String(scene.badgeLabel || (st && st.l) || scene.purpose || "SHOWCASE"), 20).toUpperCase();
  const tile = (asset, cls, n, extra) => `
      <div class="${cls}" style="opacity:0;position:relative;overflow:hidden;border:0.4cqw solid ${th.rule};background:${th.panel || th.ground};${extra || ""}">
        ${asset && asset.path
          ? `<img src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="width:100%;height:100%;object-fit:cover;object-position:top center;display:block;">`
          : `<div style="width:100%;height:100%;background:repeating-linear-gradient(45deg, ${rgba(th.ink, 0.08)} 0 10px, transparent 10px 20px);"></div>`}
        <div style="position:absolute;left:0;top:0;background:${th.accent};color:${E.readable(th.accent, E.inkOn(th.accent, "#141210", th.ink), 1, 4.5)};font-family:${th.bodyStack};font-size:${land ? 0.95 : 1.5}cqw;letter-spacing:0.14em;padding:0.35cqw 0.8cqw;">${n}</div>
      </div>`;
  const html = `
    <div style="position:absolute;left:6cqw;right:6cqw;${land ? "top:9cqw;" : "top:14cqw;"}">
      ${kicker ? `<div id="${id}-kick" style="opacity:0;font-family:${th.bodyStack};font-size:${land ? 1.05 : 2.5}cqw;letter-spacing:0.3em;text-transform:uppercase;color:${th.accentText};margin-bottom:0.8cqw;">${esc(kicker)}</div>` : ""}
      <div style="font-family:${th.displayStack};font-weight:900;text-transform:uppercase;">${stackType(lines, land ? 5 : 8.6, th.ink, `${id}-head`)}</div>
    </div>
    <div style="position:absolute;left:6cqw;right:6cqw;${land
      ? "top:30cqw;height:52cqw;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;"
      // PORTRAIT stacks. Two columns across a 9:16 frame squeeze every plate under
      // half the frame width — a screenshot in that space is unreadable (QA blocked
      // exactly this). Full-width rows instead: hero, second plate, badge band.
      : "top:40cqw;height:112cqw;display:grid;grid-template-columns:1fr;grid-template-rows:1.35fr 1fr 0.5fr;"}gap:1.2cqw;">
      ${tile(a, `${id}-t1`, "01", land ? "grid-row:span 2;" : "")}
      ${tile(b, `${id}-t2`, "02", "")}
      <div class="${id}-t3" style="opacity:0;display:grid;place-items:center;background:${th.accent};">
        <div style="text-align:center;padding:1cqw;">
          <div style="font-family:${th.displayStack};font-weight:900;font-size:${land ? 4.6 : 5.4}cqw;line-height:1;color:${E.readable(th.accent, E.inkOn(th.accent, "#141210", th.ink), 1, 4.5)};">${esc(badge)}</div>
          <div style="font-family:${th.bodyStack};font-size:${land ? 0.9 : 1.5}cqw;letter-spacing:0.2em;margin-top:0.4cqw;color:${E.readable(th.accent, E.inkOn(th.accent, "#141210", th.ink), 0.8)};">${esc(badgeLabel)}</div>
        </div>
      </div>
    </div>`;
  const s = [
    kicker ? `tl.fromTo("#${id}-kick",{opacity:0,x:-20},{opacity:1,x:0,duration:0.35},${r(T + 0.2)});` : "",
    `tl.fromTo(".${id}-head",{opacity:0,y:40},{opacity:1,y:0,duration:0.4,ease:"expo.out",stagger:0.08},${r(T + 0.25)});`,
    `tl.fromTo(".${id}-t1",{opacity:0,x:-60,y:24},{opacity:1,x:0,y:0,duration:0.42,ease:"back.out(1.3)"},${r(T + 0.55)});`,
    `tl.fromTo(".${id}-t2",{opacity:0,x:60,y:24},{opacity:1,x:0,y:0,duration:0.42,ease:"back.out(1.3)"},${r(T + 0.72)});`,
    `tl.fromTo(".${id}-t3",{opacity:0,scale:0.7},{opacity:1,scale:1,duration:0.42,ease:"back.out(1.7)"},${r(T + 0.9)});`,
  ];
  return { html, s };
}

function stamp(scene, ctx, a) {
  const { id, T, L, theme: th, land, url } = ctx;
  const lines = breakLines(scene.headline, "").map((l) => l.toUpperCase());
  const cta = fit(String(scene.cta || scene.emphasis || ""), 20).toUpperCase();
  const kicker = fit(String(scene.kicker || ""), 20).toUpperCase();
  const size = typeSize(lines, land, land ? 11 : 13);
  const ringR = land ? 12 : 20;
  const html = `
    <!-- The stamp is anchored to the FRAME, not to the headline box: parented to
         the type it overlapped the last letters of a long line ("START TODAY"
         rendered as "START TODA"), and headline width varies per film. -->
    <svg id="${id}-stamp" viewBox="0 0 200 200" style="position:absolute;right:${land ? 7 : 6}cqw;top:${land ? 9 : 16}cqw;width:${ringR}cqw;height:${ringR}cqw;opacity:0;">
      <circle cx="100" cy="100" r="92" fill="none" stroke="${th.accent}" stroke-width="7" stroke-dasharray="18 12"/>
      <circle cx="100" cy="100" r="72" fill="${th.accent}"/>
    </svg>
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;">
      ${a && a.path ? `<img id="${id}-logo" src="${esc(a.path)}" alt="${esc(a.alt || "")}" style="opacity:0;max-height:${land ? 4 : 6}cqw;max-width:${land ? 30 : 60}cqw;object-fit:contain;margin-bottom:${land ? 1.6 : 2.4}cqw;display:block;">` : ""}
      ${kicker ? `<div id="${id}-kick" style="opacity:0;font-family:${th.bodyStack};font-size:${land ? 1.1 : 2}cqw;letter-spacing:0.34em;text-transform:uppercase;color:${th.accentText};margin-bottom:1.2cqw;">${esc(kicker)}</div>` : ""}
      <div style="position:relative;font-family:${th.displayStack};font-weight:900;text-transform:uppercase;text-align:center;">
        ${stackType(lines, size, th.ink, `${id}-line`)}
      </div>
      ${cta ? `<div id="${id}-cta" style="opacity:0;margin-top:${land ? 2.4 : 3}cqw;font-family:${th.displayStack};font-weight:900;font-size:${land ? 2.2 : 3.2}cqw;letter-spacing:0.04em;text-transform:uppercase;background:${th.ink};color:${th.ground};padding:${land ? "1cqw 2.4cqw" : "1.6cqw 3.2cqw"};">${esc(cta)}</div>` : ""}
      <div id="${id}-url" style="opacity:0;margin-top:1.4cqw;font-family:${th.bodyStack};font-size:${land ? 1.15 : 1.9}cqw;letter-spacing:0.24em;text-transform:uppercase;color:${rgba(th.ink, 0.72)};">${esc(url)}</div>
    </div>`;
  const s = [
    a && a.path ? `tl.fromTo("#${id}-logo",{opacity:0,y:-24},{opacity:1,y:0,duration:0.4,ease:"power2.out"},${r(T + 0.1)});` : "",
    kicker ? `tl.fromTo("#${id}-kick",{opacity:0,y:-20},{opacity:1,y:0,duration:0.4},${r(T + 0.2)});` : "",
    `tl.fromTo("#${id}-stamp",{opacity:0,scale:2.2,rotation:-30},{opacity:1,scale:1,rotation:0,duration:0.44,ease:"back.out(1.6)",transformOrigin:"center center"},${r(T + 0.7)});`,
    `tl.to("#${id}-stamp",{rotation:${r(40 * Math.max(1, L))},duration:${r(Math.max(1, L - 0.9))},ease:"none",transformOrigin:"center center"},${r(T + 1.1)});`,
    cta ? `tl.fromTo("#${id}-cta",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:0.4,ease:"back.out(1.9)"},${r(T + 1)});` : "",
    `tl.fromTo("#${id}-url",{opacity:0,y:16},{opacity:1,y:0,duration:0.4},${r(T + 1.2)});`,
  ];
  return { html, s };
}

const SCENES = { billboard, blockshot, manifesto, bignum, quoteslab, tilewall, stamp };

// ---- persistent chrome (printed-poster edge) ---------------------------------
function chrome({ theme: th, D, brand, url, count, land }) {
  const strip = new Array(10).fill(`${String(brand).toUpperCase()}  ★  ${String(url).toUpperCase()}`).join("   ///   ");
  return {
    html: `
  <div id="backdrop" class="clip" data-start="0" data-duration="__D__" data-track-index="0" data-layout-allow-occlusion style="opacity:0;background:${th.ground};">
    <div id="bd-grain" style="position:absolute;inset:-2cqw;opacity:0.5;background-image:radial-gradient(${rgba(th.ink, 0.28)} 0.9px, transparent 0.9px);background-size:0.5cqw 0.5cqw;"></div>
  </div>
  <div id="edge" class="clip" data-start="0" data-duration="__D__" data-track-index="40" data-layout-allow-occlusion style="opacity:0;background:none;">
    <div style="position:absolute;left:0;right:0;top:0;height:${land ? 2.2 : 3}cqw;overflow:hidden;display:flex;align-items:center;background:${th.ink};">
      <div id="strip" style="white-space:nowrap;font-family:${th.bodyStack};font-size:${land ? 0.85 : 1.4}cqw;letter-spacing:0.28em;color:${th.ground};">${esc(strip)}   ${esc(strip)}</div>
    </div>
    <div style="position:absolute;left:0;right:0;bottom:0;height:${land ? 2.2 : 3}cqw;display:flex;align-items:center;justify-content:space-between;padding:0 2cqw;background:${th.accent};">
      <span style="font-family:${th.bodyStack};font-size:${land ? 0.85 : 1.4}cqw;letter-spacing:0.26em;color:${E.readable(th.accent, E.inkOn(th.accent, "#141210", th.ink), 1, 4.5)};">${esc(String(brand).toUpperCase())}</span>
    </div>
  </div>`,
    script: `
  tl.fromTo("#backdrop",{opacity:0},{opacity:1,duration:0.4},0);
  tl.fromTo("#edge",{opacity:0},{opacity:1,duration:0.4},0.15);
  tl.fromTo("#strip",{xPercent:0},{xPercent:-50,duration:${r(Math.max(10, D))},ease:"none"},0);
  tl.to("#bd-grain",{opacity:0.28,duration:1.6,ease:"sine.inOut",yoyo:true,repeat:reps(${D},1.6)},0);`,
  };
}

// Per-scene: stamp the sheet number in the bottom edge as each scene opens.
// No per-scene chrome — the "SHEET 01/08" counter was removed: a sheet number
// ticking up is the same slideshow tell as the progress rail.

function styleBlock(th) {
  return `${th.fontFace}
  #root { font-family:${th.bodyStack}; }
  #cap-pill { background:${th.ink}; border:0 !important; border-radius:0; }
  #cap-text { font-family:${th.bodyStack}; color:${th.ground}; letter-spacing:0.06em; }`;
}

const family = {
  theme, styleBlock, chrome, SCENES, TEMPLATE_SCENES, route, mediaSlots, mediaFallback,
  wantsLogo: (t) => t === "stamp",
  fallbackType: "billboard",
  variants: 2,
  // Poster packs cut hard and flat — no soft cinematic drift, minimal blur.
  camera: { enabled: false, kinds: ["zoom", "whip", "zoom", "whip", "whip", "zoom", "whip", "zoom"], blur: 8, push: 0.03, zoomIn: 1.12, zoomOut: 1.1 },

  // ---- SHARED MOTION SYSTEM (services/motion_presets.js) ----------------------
  // This family publishes WHERE its headline, card and camera live; the engine
  // drives them from the one preset library. Its own entrance tweens for those
  // elements were removed in the same change — two timelines on one property
  // fight, and the loser is whichever the browser applies second.
  motion: {
    heroType: "billboard",
    text: (id) => `.${id}-line`,
    card: (id) => `#${id}-block, .${id}-block`,
    camera: (id) => `#${id}-cami`,
    // The film's two hero moments carry the signature type treatments; the
    // middle stays on the house word stagger so the signatures stay signatures.
    tokens: (type, i, ctx, { hasCard } = {}) => ({
      text: type === "billboard" ? "outlineFillReveal"
        : type === "stamp" ? "characterReveal" : "wordStaggerBlur",
      enter: hasCard ? "cardRise3D" : "none",
      idle: hasCard ? "floatSoft" : "none",
      camera: MOTION.CAMERA_MOVES[i % MOTION.CAMERA_MOVES.length],
      transition: MOTION.TRANSITIONS[i % MOTION.TRANSITIONS.length],
    }),
  },
};

function buildComposition(opts) { return E.buildFilm(family, opts); }
// This pack's media demand + what filled each slot, WITHOUT rendering. Runs the
// exact routing and slot-filling the renderer runs, so the manifest can never
// drift from the film that ships.
function planMedia(opts) { return E.planMedia(family, opts); }

module.exports = { buildComposition, planMedia, TEMPLATE_SCENES };
