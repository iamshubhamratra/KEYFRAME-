// STORY-HANDMADE family template — the authored scene grammar for the storybook /
// craft / illustrated / ink packs (daybreak-bakehouse, organic-garden,
// fable-storybook, paper-tales, folk-stitch, claymotion, sketchnote, sumi-kaze,
// care-lavender, care-mint, orrery-brass).
//
// These packs used to render through scene_kit's SHARED archetypes, so a pop-up
// picture book and a sumi-e scroll drew the same feature-card row as a brutalist
// zine. This file gives the whole family its OWN grammar: a paper book. Every
// scene is a PAGE — hand-drawn rules that wobble, torn-paper photos taped down,
// a checklist ticked in ink, a number lassoed by a pen circle, a quote on a torn
// note, a scrapbook of taped snapshots, a stamped sign-off. Nothing here is HUD
// chrome and nothing is poster staging: no hard colour blocks, no slabs, no
// slams — pages settle, ink draws on, paper rocks slightly as it lands.
//
// Each pack keeps its OWN skin: colours, fonts and character come from
// scene_kit.deriveTheme(pack), so paper-tales stays butter-and-rose on cream,
// sumi-kaze stays vermillion ink on washi and orrery-brass stays gold on near
// black (the "page" is derived from the pack ground, so dark packs get a raised
// warm leaf instead of a white sheet). `variant` (hashed from the pack name)
// additionally flips staging per pack so two packs never compose identically.
//
// The render contract (seek-safety, tracks, hard kills, caption node, camera) is
// the engine's — see template_engine.js. This module is design only.

const { deriveTheme } = require("./scene_kit");
const E = require("./template_engine");
// The shared motion vocabulary — see services/motion_presets.js. Physics for
// headlines and cards lives there now, so every template moves alike.
const MOTION = require("./motion_presets");
const { esc, r, rgba, statsOf, breakLines, bullets, fit } = E;

// ---- theme -------------------------------------------------------------------
// Handwriting faces a pack may bundle (paper-tales ships Caveat). When the pack
// has none, "handwritten" text falls back to the pack's display face set italic
// and slightly loose — still personal, never a wrong-font substitution.
const HAND_FACES = [
  "Caveat", "Kalam", "Patrick Hand", "Gloria Hallelujah", "Shadows Into Light",
  "Architects Daughter", "Indie Flower", "Nanum Pen Script", "Just Another Hand",
  "Rock Salt", "Amatic SC", "Sriracha", "Delicious Handrawn",
];

function theme(manifest, brandSkin, { framePack } = {}) {
  const t = deriveTheme(framePack, {}, brandSkin);
  const accents = (t.accents && t.accents.length ? t.accents : ["#C67139", "#7A8A5E"]).slice(0, 4);
  // The PAGE: a sheet lying on the pack's ground. Light packs get a brighter
  // leaf of their own paper; dark packs get a raised warm one (never a white
  // rectangle punched into a night palette).
  const page = t.isDark ? E.mix(t.ground, "#FFFFFF", 0.14) : E.mix(t.ground, "#FFFDF6", 0.72);
  const pageInk = E.inkOn(page, "#20190F", t.ink);
  const packFonts = (t.manifest && Array.isArray(t.manifest.fonts)) ? t.manifest.fonts : [];
  const handFamily = packFonts.find((f) => HAND_FACES.includes(String(f)) && String(t.fontFace || "").includes(String(f))) || null;
  const bodyStack = t.fontStack || "Georgia, 'Times New Roman', serif";
  const displayStack = t.displayStack || bodyStack;
  // PEN colours. A pack's accent list is tuned for fills and emphasis words, so
  // it happily contains a pale butter or a soft mint — drawn at 0.3cqw as a pen
  // line, or set as a handwritten aside, those vanish into the paper. Every
  // INKED mark (rules, ticks, lassos, handwriting, the stamp) uses the pen
  // variant instead: the same hue pulled toward the ink until it reads.
  // Measured, not guessed: a luminance-difference heuristic passed colours that
  // only reached 2.8:1 against the paper (the WCAG audit flagged the kickers and
  // the quote mark on daybreak-bakehouse). Deepen the hue toward the pack's ink
  // in steps — keeping it coloured ink rather than flattening to black — until it
  // genuinely clears AA, and only fall back to the engine's clamp if it can't.
  const readable = (c) => {
    if (E.contrastRatio(c, t.ground) >= 4.5) return c;
    for (let m = 0.25; m <= 1.001; m += 0.25) {
      const mixed = E.mix(c, t.ink, m);
      if (E.contrastRatio(mixed, t.ground) >= 4.5) return mixed;
    }
    return E.readable(t.ground, t.ink, 1, 4.5);
  };
  return {
    ...t,
    accent: accents[0],
    accent2: accents[1] || accents[0],
    accent3: accents[2] || accents[1] || accents[0],
    pen: readable(accents[0]),
    pen2: readable(accents[1] || accents[0]),
    pen3: readable(accents[2] || accents[1] || accents[0]),
    page, pageInk,
    pencil: rgba(pageInk, 0.62),
    softInk: rgba(pageInk, 0.76),
    dimInk: rgba(t.ink, 0.7),
    tapeBlend: t.isDark ? "screen" : "multiply",
    shadowCol: rgba(t.isDark ? "#000000" : "#4A3524", t.isDark ? 0.5 : 0.2),
    displayStack, bodyStack,
    handStack: handFamily ? `'${handFamily}', ${displayStack}` : displayStack,
    handStyle: handFamily ? "font-style:normal;" : "font-style:italic;letter-spacing:0.01em;",
    fontFace: t.fontFace || "",
  };
}

// ---- published vocabulary (Template Director casts onto these) ----------------
const TEMPLATE_SCENES = [
  {
    type: "cover", bestFor: "the opening title page — the film's cover, its intro statement",
    look: "A paper cover sheet settling onto the table, a wobbly hand-drawn double frame inking itself around the title, a written kicker above and a small drawn ornament below.",
    slots: { headline: "1-3 short lines, the title", kicker: "max 26 chars, written above the title", subtext: "one sentence, max 96 chars" },
    media: [],
  },
  {
    type: "spread", bestFor: "a product screen, a photo or an illustrated idea explained beside a paragraph",
    look: "An open book spread: the paragraph set on the left page, a torn-paper photo taped down on the right, rocking slightly as it lands. With no photo the right page becomes a hand-drawn illustration panel.",
    slots: { kicker: "max 24 chars", headline: "max 3 short lines", body: "one or two sentences, max 190 chars" },
    media: ["desktop"], mediaMin: 0,
  },
  {
    type: "chapters", bestFor: "a list of steps, chapters or things included",
    look: "A handwritten checklist: numbered rows, each with a wobbly ink box whose tick draws itself in, and a dotted rule ruled under every line.",
    slots: { kicker: "max 24 chars", headline: "max 2 short lines", items: "2-4 lines, max 44 chars each" },
    media: [],
  },
  {
    type: "circlednum", bestFor: "one number or one word that matters, the proof point",
    look: "The figure written big in the middle of the page and then lassoed by a hand-drawn pen ellipse that draws on, with an arrow and a written note pointing at it.",
    slots: { stats: "1-2 of {v: number, suf: '%'|'X'|'K'|'M'|'', l: label max 24 chars}", headline: "max 40 chars", subtext: "the written aside, max 60 chars" },
    media: [],
  },
  {
    type: "notequote", bestFor: "a testimonial or a quoted line",
    look: "The quote written on a torn note taped to the page, lifting and settling with a soft shadow, signed underneath a wobbly rule.",
    slots: { quote: "max 150 chars, verbatim", author: "person's name", role: "role and/or company" },
    media: [],
  },
  {
    type: "scrapbook", bestFor: "several photos, a showcase, gallery or social proof",
    look: "Snapshots taped onto the page at slight angles with white paper mattes and soft shadows; any tile without a photo becomes a handwritten note card.",
    slots: { kicker: "max 24 chars", headline: "max 2 short lines", items: "up to 3 note lines, max 40 chars each" },
    media: ["photo", "photo"], mediaMin: 0,
  },
  {
    type: "signoff", bestFor: "the closing page and call to action",
    look: "The last page: the closing line under a drawn swoosh, the call to action inside a hand-drawn box, the address written on a ruled line and an ink stamp pressed in the corner, turning slowly.",
    slots: { headline: "max 2 short lines", cta: "button label, max 22 chars", kicker: "max 24 chars" },
    media: [],
  },
];

const mediaSlots = { spread: ["desktop"], scrapbook: ["photo", "photo"], notequote: ["photo"] };
// True when the PREVIOUS scene already carried imagery — keeps media beats
// alternating now that any spare asset, not just a pinned screenshot, earns one.
const mediaBeatJustPlayed = (ctx) => ((mediaSlots[ctx && ctx.prevType] || []).length > 0);

// ---- deterministic router (used when the director is off / uncast) -----------
function route(scene, i, total, ctx) {
  const k = String(scene.kind || "").toLowerCase();
  const p = String(scene.purpose || "").toLowerCase();
  if (i === 0 || k === "hook" || k === "title") return "cover";
  if (i === total - 1 || k === "cta" || p === "cta") return "signoff";
  if (k === "quote" || scene.quote || /testimonial/.test(p)) return "notequote";
  if (k === "stat" || k === "chart" || statsOf(scene, 1).length) return "circlednum";
  if (/gallery|showcase|portfolio|social|proof|team|moment/.test(`${k} ${p}`) && ctx.freeCount >= 2 && ctx.prevType !== "scrapbook") return "scrapbook";
  // MEDIA BEAT — moved AHEAD of the bullet branches. `chapters` fired on any
  // scene with 3+ bullets, which real storyboards nearly always have, so this
  // family placed literally zero imagery no matter how large the asset pool was.
  // Consecutive media beats are now allowed as long as they are a DIFFERENT type
  // (scrapbook↔spread reads as a turned page, not a slideshow) — the old global
  // "one media beat then a forced text beat" gate is what starved these pages of
  // their assets. A per-type guard just stops the SAME page repeating back-to-back.
  if (ctx.freeCount >= 3 && ctx.prevType !== "scrapbook") return "scrapbook";
  if ((ctx.pinned || ctx.hasShot || ctx.freeCount >= 1) && ctx.prevType !== "spread") return "spread";
  if (bullets(scene, 4).length >= 2) return "chapters";
  return ctx.prevType === "spread" ? "chapters" : "spread";
}
// A spread with no photo still reads (the illustrated panel takes the right
// page), so only a genuine list is worth re-routing.
const mediaFallback = (scene) => {
  // Keep a quote scene on its notequote card (monogram fallback) when no photo is
  // free, instead of rerouting the testimonial away and dropping the quote.
  if (scene && (scene.quote || String(scene.kind || "").toLowerCase() === "quote" || /testimonial|review/.test(String(scene.purpose || "").toLowerCase()))) return null;
  return bullets(scene, 4).length >= 2 ? "chapters" : null;
};

// ---- handmade furniture -------------------------------------------------------

// Deterministic wobble in (-1,1) — every irregular edge/line in the family is a
// pure function of a seed, so re-renders are byte-identical.
function wob(seed, i) {
  const v = (Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453) % 1;
  return isFinite(v) ? v : 0;
}
const HC = (dims) => r(100 * ((dims && dims.height) || 9) / ((dims && dims.width) || 16)); // frame height in cqw

// Type size that keeps the longest line inside its column.
const typeSize = (lines, cap, span) => {
  const longest = Math.max(...lines.map((l) => String(l).length), 1);
  return r(Math.max(cap * 0.32, Math.min(cap, (span / longest) * 1.62)));
};

// The label under a mined figure. statsOf's own `l` is the source line with the
// matched token spliced out — which swallows the space around it ("Tested by 40
// teams" -> "TESTED BYTEAMS") and shouts in caps. This family writes its labels
// by hand, so re-cut the phrase from the source line, keeping the space and the
// sentence case.
function statLabel(scene, st, fallback) {
  const pool = []
    .concat(Array.isArray(scene.bullets) ? scene.bullets : [])
    .concat(Array.isArray(scene.onScreenText) ? scene.onScreenText : [])
    .concat(scene.subtext ? String(scene.subtext).split(/[.;\n]/) : [])
    .concat(scene.emphasis ? [scene.emphasis] : [])
    .map((x) => String(x));
  const num = String(st && st.v != null ? st.v : "");
  const hit = pool.find((x) => x.replace(/,/g, "").includes(num));
  if (hit && num) {
    const esc2 = num.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const clean = hit
      .replace(new RegExp(`[$₹€£]?\\s?${esc2}[\\d,]*\\s?(%|x|k|m|bn?|\\+)?`, "i"), " ")
      .replace(/\s+/g, " ").trim();
    if (clean.length > 1) return clean.charAt(0).toUpperCase() + clean.slice(1);
  }
  const l = String((st && st.l) || "").trim();
  if (l.length > 1) return l.charAt(0) + l.slice(1).toLowerCase();
  return String(fallback || "");
}

// A torn paper edge, as a clip-path polygon. Clockwise: top, right, bottom, left.
function tornPoly(seed, e) {
  const N = 12, A = 1.7;
  const p = [];
  const f = (k, i) => r(Math.abs(wob(seed + k, i)) * A);
  for (let i = 0; i <= N; i++) p.push(`${r(i * 100 / N)}% ${e.top ? f(1, i) : 0}%`);
  for (let i = 1; i <= N; i++) p.push(`${e.right ? r(100 - f(2, i)) : 100}% ${r(i * 100 / N)}%`);
  for (let i = 1; i <= N; i++) p.push(`${r(100 - i * 100 / N)}% ${e.bottom ? r(100 - f(3, i)) : 100}%`);
  for (let i = 1; i < N; i++) p.push(`${e.left ? f(4, i) : 0}% ${r(100 - i * 100 / N)}%`);
  return `polygon(${p.join(",")})`;
}

// A hand-drawn rectangle: four cubic sides whose control points wander, so the
// frame never closes like a CAD box. Units are viewBox units.
function handRect(w, h, pad, seed) {
  const x0 = pad, y0 = pad, x1 = w - pad, y1 = h - pad;
  const amp = Math.min(w, h) * 0.014;
  const j = (k) => r(wob(seed, k) * amp);
  const P = (a, b) => `${r(a)},${r(b)}`;
  return `M${P(x0 + j(1), y0 + j(2))}`
    + ` C${P(x0 + (x1 - x0) * 0.34, y0 + j(3) * 2)} ${P(x0 + (x1 - x0) * 0.68, y0 + j(4) * 2)} ${P(x1 + j(5), y0 + j(6))}`
    + ` C${P(x1 + j(7) * 2, y0 + (y1 - y0) * 0.34)} ${P(x1 + j(8) * 2, y0 + (y1 - y0) * 0.68)} ${P(x1 + j(9), y1 + j(10))}`
    + ` C${P(x0 + (x1 - x0) * 0.68, y1 + j(11) * 2)} ${P(x0 + (x1 - x0) * 0.34, y1 + j(12) * 2)} ${P(x0 + j(13), y1 + j(14))}`
    + ` C${P(x0 + j(15) * 2, y0 + (y1 - y0) * 0.68)} ${P(x0 + j(16) * 2, y0 + (y1 - y0) * 0.34)} ${P(x0 + j(1), y0 + j(2))}Z`;
}

// A ruled line drawn by hand. Width, height and STROKE are all given in cqw and
// converted into viewBox units, so a 74cqw rule and an 16cqw rule end up with
// the same visual pen weight (a fixed viewBox would fatten the long ones).
function handRule(cls, color, wCqw, seed, thickCqw, hCqw) {
  const W = Math.max(1, r(wCqw));
  const H = r(hCqw != null ? hCqw : Math.max(thickCqw * 3.5, W * 0.045));
  const vh = r(Math.max(4, 300 * H / W));
  const sw = r(Math.max(0.6, (thickCqw || 0.25) / W * 300));
  const amp = r(Math.max(1, vh * 0.26));
  const y = (k) => r(vh / 2 + wob(seed, k) * amp);
  const d = `M${r(sw)},${y(1)} C${r(300 * 0.25)},${y(2)} ${r(300 * 0.42)},${y(3)} ${r(300 * 0.55)},${y(4)}`
    + ` S${r(300 * 0.82)},${y(5)} ${r(300 - sw)},${y(6)}`;
  return `<svg viewBox="0 0 300 ${vh}" style="display:block;width:${W}cqw;height:${H}cqw;overflow:visible;">
      <path class="draw ${cls}" pathLength="100" d="${d}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round"/>
    </svg>`;
}

// Washi tape: a translucent strip that multiplies into the paper (screens on a
// dark ground), with softly torn short edges.
function tape(th, { w, h, left, top, right, bottom, rot, color, cls }) {
  const c = color || th.accent2;
  const pos = [left != null ? `left:${r(left)}cqw;` : "", right != null ? `right:${r(right)}cqw;` : "",
    top != null ? `top:${r(top)}cqw;` : "", bottom != null ? `bottom:${r(bottom)}cqw;` : ""].join("");
  return `<div class="${cls || ""}" style="opacity:0;position:absolute;${pos}width:${r(w)}cqw;height:${r(h)}cqw;background:${rgba(c, 0.5)};mix-blend-mode:${th.tapeBlend};clip-path:${tornPoly(rot + 7, { left: true, right: true })};box-shadow:inset 0 0 0 0.12cqw ${rgba(c, 0.25)};transform:rotate(${r(rot)}deg);"></div>`;
}

// Small drawn ornaments — the illustrated furniture of the family. Every stroke
// carries the .draw class so it inks itself on.
function doodle(kind, color, cls, sizeCqw, weight) {
  const s = `width:${r(sizeCqw)}cqw;height:${r(sizeCqw)}cqw;overflow:visible;display:block;`;
  const st = `fill="none" stroke="${color}" stroke-width="${weight || 5}" stroke-linecap="round" stroke-linejoin="round"`;
  const p = (d) => `<path class="draw ${cls}" pathLength="100" d="${d}" ${st}/>`;
  let inner = "";
  if (kind === "sun") {
    inner = `<circle class="draw ${cls}" pathLength="100" cx="100" cy="100" r="40" ${st}/>`
      + [0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
        const rad = a * Math.PI / 180;
        return p(`M${r(100 + Math.cos(rad) * 56)},${r(100 + Math.sin(rad) * 56)} L${r(100 + Math.cos(rad) * 82)},${r(100 + Math.sin(rad) * 82)}`);
      }).join("");
  } else if (kind === "hills") {
    inner = p("M8,150 C44,86 84,84 116,140 C138,178 168,156 192,124")
      + p("M40,150 C64,116 92,116 116,150")
      + `<circle class="draw ${cls}" pathLength="100" cx="150" cy="58" r="22" ${st}/>`;
  } else if (kind === "spool") {
    inner = p("M100,100 C100,74 132,74 132,102 C132,138 92,140 88,100 C82,48 142,42 150,100 C160,168 78,180 62,102");
  } else if (kind === "star") {
    inner = p("M100,26 L118,80 L176,82 L130,116 L146,172 L100,138 L54,172 L70,116 L24,82 L82,80 Z");
  } else { // sprig
    inner = p("M100,182 C100,132 100,88 98,34")
      + p("M99,132 C68,124 56,92 86,84")
      + p("M100,104 C132,96 144,64 114,56")
      + p("M99,72 C74,64 66,40 92,34");
  }
  return `<svg viewBox="0 0 200 200" style="${s}">${inner}</svg>`;
}
const DOODLES = ["sprig", "sun", "hills", "spool", "star"];

// The illustrated panel a media scene falls back to — hatched paper, a big drawn
// ornament and the film's own brand written under it. Never an empty frame.
function illoPanel(th, ctx, cls, sizeCqw) {
  const kind = DOODLES[ctx.i % DOODLES.length];
  return `<div style="position:absolute;inset:0;background:${th.page};background-image:repeating-linear-gradient(46deg, ${rgba(th.pageInk, 0.085)} 0 0.5cqw, transparent 0.5cqw 1.7cqw);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${ctx.land ? 1.4 : 2.2}cqw;">
      ${doodle(kind, th.pen, cls, sizeCqw, ctx.land ? 6 : 7)}
      <div style="font-family:${th.handStack};${th.handStyle}font-size:${ctx.land ? 1.5 : 2.6}cqw;letter-spacing:0.06em;color:${rgba(th.pageInk, 0.6)};">${esc(String(ctx.brand))}</div>
    </div>`;
}

// A photo mounted the handmade way: white paper matte, torn edge, soft shadow.
function photoCard(th, ctx, asset, seed, cls) {
  const inner = asset && asset.path
    ? `<img id="${cls}-img" src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="width:100%;height:100%;object-fit:cover;object-position:top center;display:block;">`
    : illoPanel(th, ctx, `${cls}-dood`, ctx.land ? 21 : 28);
  return `<div style="position:absolute;inset:0;background:${th.page};padding:${ctx.land ? 0.9 : 1.4}cqw;clip-path:${tornPoly(seed, { bottom: true, right: true })};">
      <div style="position:absolute;inset:${ctx.land ? 0.9 : 1.4}cqw;overflow:hidden;background:${rgba(th.pageInk, 0.06)};clip-path:${tornPoly(seed + 5, { bottom: true, right: true })};">${inner}</div>
    </div>`;
}

// ---- scenes -------------------------------------------------------------------

function cover(scene, ctx) {
  const { id, T, L, theme: th, land, variant, brand, dims } = ctx;
  const H = HC(dims);
  const lines = breakLines(scene.headline, scene.subtext || brand).slice(0, 3);
  const kicker = fit(String(scene.kicker || scene.eyebrow || brand || ""), 26);
  const sub = fit(String(scene.subtext || scene.body || ""), 96);
  const size = typeSize(lines, land ? 8.4 : 11.2, land ? 68 : 74);
  const PW = land ? 84 : 86, PL = r((100 - PW) / 2);
  const PT = r(H * 0.08), PH = r(H * 0.84);
  const rot = variant % 2 === 0 ? -1 : 1;
  const vbW = 900, vbH = r(900 * PH / PW);
  const html = `
    <div id="${id}-page" style="opacity:0;position:absolute;left:${PL}cqw;top:${PT}cqw;width:${PW}cqw;height:${PH}cqw;background:${th.page};border-radius:0.5cqw;box-shadow:0 1.1cqw 2.6cqw ${th.shadowCol};">
      <svg viewBox="0 0 ${vbW} ${vbH}" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible;">
        <path class="draw ${id}-fr" pathLength="100" d="${handRect(vbW, vbH, 34, 3)}" fill="none" stroke="${th.pencil}" stroke-width="3.4" stroke-linecap="round"/>
        <path class="draw ${id}-fr" pathLength="100" d="${handRect(vbW, vbH, 54, 11)}" fill="none" stroke="${rgba(th.pen, 0.8)}" stroke-width="2.2" stroke-linecap="round"/>
      </svg>
      <div style="position:absolute;inset:0;padding:0 ${land ? 8 : 9}cqw;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;">
        ${kicker ? `<div id="${id}-kick" style="opacity:0;font-family:${th.handStack};${th.handStyle}font-size:${land ? 2 : 3.4}cqw;letter-spacing:0.08em;color:${th.pen};margin-bottom:${land ? 1.4 : 2.4}cqw;">${esc(kicker)}</div>` : ""}
        ${lines.map((ln) => `<div class="${id}-ln" style="opacity:0;font-family:${th.displayStack};font-weight:700;font-size:${size}cqw;line-height:1.1;letter-spacing:-0.01em;color:${th.pageInk};">${esc(ln)}</div>`).join("")}
        <div style="margin-top:${land ? 1.6 : 2.6}cqw;">${handRule(`${id}-rl`, th.pen, land ? 26 : 40, 21, 0.42)}</div>
        ${sub ? `<div id="${id}-sub" style="opacity:0;margin-top:${land ? 1.5 : 2.6}cqw;max-width:${land ? 52 : 66}cqw;font-family:${th.bodyStack};font-size:${land ? 1.55 : 2.5}cqw;line-height:1.6;color:${th.softInk};">${esc(sub)}</div>` : ""}
        <div id="${id}-orn" style="opacity:0;margin-top:${land ? 2 : 3.4}cqw;">${doodle(DOODLES[(ctx.i + variant) % DOODLES.length], th.pen2, `${id}-od`, land ? 7 : 11, 8)}</div>
      </div>
    </div>`;
  const s = [
    `tl.fromTo("#${id}-page",{opacity:0,y:${r(H * 0.05)},rotation:${r(rot - 2.2)},scale:0.965},{opacity:1,y:0,rotation:${rot},scale:1,duration:0.9,ease:"power3.out"},${T});`,
    `tl.fromTo(".${id}-fr",{strokeDashoffset:100},{strokeDashoffset:0,duration:1.05,ease:"power2.inOut",stagger:0.18},${r(T + 0.22)});`,
    kicker ? `tl.fromTo("#${id}-kick",{opacity:0,y:-14},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 0.32)});` : "",
    `tl.fromTo(".${id}-rl",{strokeDashoffset:100},{strokeDashoffset:0,duration:0.65,ease:"power2.out"},${r(T + 0.95)});`,
    sub ? `tl.fromTo("#${id}-sub",{opacity:0,y:16},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 1.1)});` : "",
    `tl.fromTo("#${id}-orn",{opacity:0},{opacity:1,duration:0.3},${r(T + 1.4)});`,
    `tl.fromTo(".${id}-od",{strokeDashoffset:100},{strokeDashoffset:0,duration:0.8,ease:"power2.out",stagger:0.07},${r(T + 1.45)});`,
    `tl.to("#${id}-orn",{y:${land ? -5 : -8},duration:1.5,ease:"sine.inOut",yoyo:true,repeat:reps(${r(Math.max(1.6, L - 1.5))},1.5)},${r(T + 1.6)});`,
  ];
  return { html, s };
}

function spread(scene, ctx, asset) {
  const { id, T, L, theme: th, land, variant, dims } = ctx;
  const H = HC(dims);
  const lines = breakLines(scene.headline, "").slice(0, 3);
  const kicker = fit(String(scene.kicker || scene.purpose || ""), 24);
  const body = fit(String(scene.body || scene.subtext || ""), 190);
  const right = variant % 2 === 0;
  const card = land
    ? { l: right ? 53 : 5, w: 42, t: r(H * 0.13), h: r(H * 0.72) }
    : { l: 8, w: 84, t: r(H * 0.09), h: r(H * 0.36) };
  const col = land
    ? { l: right ? 6 : 52, w: 41, t: r(H * 0.16), h: r(H * 0.68) }
    : { l: 8, w: 84, t: r(H * 0.5), h: r(H * 0.4) };
  const hSize = typeSize(lines, land ? 5 : 6.6, land ? 38 : 74);
  const rot = right ? -1.5 : 1.5;
  const html = `
    <div id="${id}-shadow" style="opacity:0;position:absolute;left:${card.l}cqw;top:${card.t}cqw;width:${card.w}cqw;height:${card.h}cqw;filter:drop-shadow(0 1cqw 2cqw ${th.shadowCol});">
      ${photoCard(th, ctx, asset, 13 + ctx.i, `${id}-ph`)}
    </div>
    ${tape(th, { w: land ? 9 : 14, h: land ? 2.6 : 4, left: r(card.l + card.w * 0.1), top: r(card.t - (land ? 1.1 : 1.7)), rot: -9, cls: `${id}-tp`, color: th.accent2 })}
    ${tape(th, { w: land ? 8 : 13, h: land ? 2.4 : 3.6, left: r(card.l + card.w * 0.66), top: r(card.t - (land ? 0.9 : 1.4)), rot: 7, cls: `${id}-tp`, color: th.accent3 })}
    <div style="position:absolute;left:${col.l}cqw;top:${col.t}cqw;width:${col.w}cqw;height:${col.h}cqw;display:flex;flex-direction:column;justify-content:center;">
      ${kicker ? `<div id="${id}-kick" style="opacity:0;font-family:${th.handStack};${th.handStyle}font-size:${land ? 1.9 : 3.1}cqw;letter-spacing:0.07em;color:${th.pen};margin-bottom:${land ? 0.9 : 1.6}cqw;">${esc(kicker)}</div>` : ""}
      ${lines.map((ln) => `<div class="${id}-ln" style="opacity:0;font-family:${th.displayStack};font-weight:700;font-size:${hSize}cqw;line-height:1.14;color:${th.ink};">${esc(ln)}</div>`).join("")}
      <div style="margin-top:${land ? 1.1 : 1.8}cqw;">${handRule(`${id}-rl`, th.pen, land ? 18 : 30, 31, 0.36)}</div>
      ${body ? `<div id="${id}-body" style="opacity:0;margin-top:${land ? 1.4 : 2.2}cqw;font-family:${th.bodyStack};font-size:${land ? 1.5 : 2.4}cqw;line-height:1.65;color:${th.dimInk};">${esc(body)}</div>` : ""}
    </div>`;
  const s = [
    `tl.fromTo("#${id}-shadow",{opacity:0,x:${right ? 24 : -24},y:${land ? 20 : 26},rotation:${r(rot * 2.6)}},{opacity:1,x:0,y:0,rotation:${rot},duration:0.9,ease:"power3.out"},${r(T + 0.2)});`,
    `tl.fromTo(".${id}-tp",{opacity:0,scale:0.5},{opacity:1,scale:1,duration:0.45,ease:"back.out(1.7)",stagger:0.1},${r(T + 0.75)});`,
    asset && asset.path ? `tl.fromTo("#${id}-ph-img",{scale:1.07},{scale:1,duration:${r(Math.max(1.2, L - 0.8))},ease:"sine.out"},${r(T + 0.6)});`
      : `tl.fromTo(".${id}-ph-dood",{strokeDashoffset:100},{strokeDashoffset:0,duration:0.85,ease:"power2.out",stagger:0.07},${r(T + 0.7)});`,
    kicker ? `tl.fromTo("#${id}-kick",{opacity:0,x:-16},{opacity:1,x:0,duration:0.5,ease:"power2.out"},${r(T + 0.35)});` : "",
    `tl.fromTo(".${id}-rl",{strokeDashoffset:100},{strokeDashoffset:0,duration:0.6,ease:"power2.out"},${r(T + 0.8)});`,
    body ? `tl.fromTo("#${id}-body",{opacity:0,y:14},{opacity:1,y:0,duration:0.6,ease:"power2.out"},${r(T + 0.95)});` : "",
    `tl.to("#${id}-shadow",{rotation:${r(rot * 0.35)},duration:${r(Math.max(1.4, L - 1))},ease:"sine.inOut"},${r(T + 1.1)});`,
  ];
  return { html, s };
}

function chapters(scene, ctx) {
  const { id, T, theme: th, land, dims } = ctx;
  const H = HC(dims);
  const items = (Array.isArray(scene.items) && scene.items.length ? scene.items : bullets(scene, 4))
    .map((b) => fit(String(b), 44)).filter(Boolean).slice(0, 4);
  const lines = breakLines(scene.headline, "").slice(0, 2);
  const kicker = fit(String(scene.kicker || scene.purpose || ""), 24);
  const longest = Math.max(...items.map((x) => x.length), 1);
  const rowSize = r(Math.min(land ? 3.1 : 5.4, (land ? 56 : 66) / longest * 1.6));
  const box = land ? 3.2 : 6.4;
  const rows = items.map((t, k) => `
      <div class="${id}-row" style="opacity:0;display:flex;align-items:center;gap:${land ? 1.5 : 2.4}cqw;margin-top:${k ? (land ? 1.6 : 5) : 0}cqw;">
        <svg viewBox="0 0 100 100" style="flex:0 0 auto;width:${box}cqw;height:${box}cqw;overflow:visible;">
          <path class="draw ${id}-bx" pathLength="100" d="${handRect(100, 100, 9, 40 + k * 3)}" fill="none" stroke="${th.pencil}" stroke-width="6" stroke-linecap="round"/>
          <path class="draw ${id}-tk" pathLength="100" d="M22,52 L44,74 L82,20" fill="none" stroke="${th.pen}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span style="font-family:${th.handStack};${th.handStyle}font-size:${land ? 2.4 : 4.6}cqw;color:${rgba(th.ink, 0.62)};flex:0 0 auto;">${String(k + 1).padStart(2, "0")}</span>
        <span style="font-family:${th.displayStack};font-weight:600;font-size:${rowSize}cqw;line-height:1.2;color:${th.ink};">${esc(t)}</span>
      </div>
      <div class="${id}-rw" style="margin-top:${land ? 0.7 : 1.4}cqw;">${handRule(`${id}-rl`, rgba(th.ink, 0.26), land ? 74 : 82, 60 + k * 4, 0.16, land ? 1.1 : 1.9)}</div>`).join("");
  const html = `
    <div style="position:absolute;left:${land ? 11 : 8}cqw;top:${r(H * 0.08)}cqw;width:${land ? 78 : 84}cqw;height:${r(H * 0.84)}cqw;display:flex;flex-direction:column;justify-content:center;">
      ${kicker ? `<div id="${id}-kick" style="opacity:0;font-family:${th.handStack};${th.handStyle}font-size:${land ? 1.9 : 3.2}cqw;letter-spacing:0.07em;color:${th.pen};margin-bottom:${land ? 0.7 : 1.2}cqw;">${esc(kicker)}</div>` : ""}
      ${lines.map((ln) => `<div class="${id}-hd" style="opacity:0;font-family:${th.displayStack};font-weight:700;font-size:${typeSize(lines, land ? 4.8 : 8, land ? 72 : 76)}cqw;line-height:1.14;color:${th.ink};">${esc(ln)}</div>`).join("")}
      <div style="margin-top:${land ? 1.8 : 3.4}cqw;">${rows}</div>
    </div>`;
  const s = [
    kicker ? `tl.fromTo("#${id}-kick",{opacity:0,x:-16},{opacity:1,x:0,duration:0.5,ease:"power2.out"},${r(T + 0.2)});` : "",
    `tl.fromTo(".${id}-hd",{opacity:0,y:20},{opacity:1,y:0,duration:0.62,ease:"power3.out",stagger:0.1},${r(T + 0.3)});`,
    items.length ? `tl.fromTo(".${id}-row",{opacity:0,x:-24,y:8},{opacity:1,x:0,y:0,duration:0.55,ease:"power3.out",stagger:0.22},${r(T + 0.6)});` : "",
    items.length ? `tl.fromTo(".${id}-tk",{strokeDashoffset:100},{strokeDashoffset:0,duration:0.34,ease:"power2.out",stagger:0.22},${r(T + 1)});` : "",
    items.length ? `tl.fromTo(".${id}-rl",{strokeDashoffset:100},{strokeDashoffset:0,duration:0.55,ease:"power1.out",stagger:0.22},${r(T + 0.85)});` : "",
  ];
  return { html, s };
}

function circlednum(scene, ctx) {
  const { id, T, L, theme: th, land, dims, brand } = ctx;
  const H = HC(dims);
  const stats = statsOf(scene, 2);
  const st = stats[0] || null;
  const second = stats[1] || null;
  const word = st ? "" : fit(String(scene.emphasis || breakLines(scene.headline, brand)[0] || brand), 14);
  const label = fit(st ? statLabel(scene, st, scene.headline) : String(scene.headline || ""), 34);
  const aside = fit(String(scene.subtext || scene.body || (st ? scene.headline : "") || ""), 60);
  const bigLen = Math.max((st ? `${st.pre}${Math.round(st.v)}${st.suf}` : word).length, 1);
  const big = r(Math.min(land ? 15 : 20, (land ? 34 : 44) / bigLen * 1.7));
  const loopW = land ? 46 : 66, loopH = r(loopW * 0.48);
  const midY = r(H * (land ? 0.44 : 0.52));
  const loop = "M60,120 C40,42 162,16 250,22 C362,28 432,60 424,118 C416,178 298,208 198,200 C98,192 42,168 44,120 C46,78 92,48 152,34";
  const html = `
    <div style="position:absolute;left:0;right:0;top:${r(midY - loopH * 0.5)}cqw;height:${loopH}cqw;display:flex;align-items:center;justify-content:center;">
      <div style="position:relative;display:flex;align-items:center;justify-content:center;width:${loopW}cqw;height:${loopH}cqw;">
        <svg viewBox="0 0 460 220" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible;">
          <path class="draw ${id}-loop" pathLength="100" d="${loop}" fill="none" stroke="${th.pen}" stroke-width="6" stroke-linecap="round"/>
        </svg>
        <div id="${id}-big" style="opacity:0;position:relative;font-family:${th.displayStack};font-weight:700;font-size:${big}cqw;line-height:1;letter-spacing:-0.02em;color:${th.ink};white-space:nowrap;">${st ? `${esc(st.pre)}0${esc(st.suf)}` : esc(word)}</div>
      </div>
    </div>
    ${label ? `<div id="${id}-lab" style="opacity:0;position:absolute;left:8cqw;right:8cqw;top:${r(midY + loopH * 0.56)}cqw;text-align:center;font-family:${th.displayStack};font-weight:600;font-size:${land ? 2.4 : 3.6}cqw;line-height:1.25;color:${th.ink};">${esc(label)}</div>` : ""}
    ${second ? `<div id="${id}-2nd" style="opacity:0;position:absolute;left:8cqw;right:8cqw;top:${r(midY + loopH * 0.56 + (land ? 4.2 : 6.4))}cqw;text-align:center;font-family:${th.bodyStack};font-size:${land ? 1.5 : 2.4}cqw;letter-spacing:0.04em;color:${th.dimInk};"><span id="${id}-n2">${esc(second.pre)}0${esc(second.suf)}</span> ${esc(fit(statLabel(scene, second, ""), 26))}</div>` : ""}
    ${aside ? `<div id="${id}-aside" style="opacity:0;position:absolute;${land ? `right:6cqw;top:${r(H * 0.12)}cqw;width:26cqw;text-align:right;` : `left:8cqw;top:${r(H * 0.12)}cqw;width:60cqw;`}font-family:${th.handStack};${th.handStyle}font-size:${land ? 2 : 3.1}cqw;line-height:1.35;color:${rgba(th.ink, 0.8)};">${esc(aside)}</div>
    <svg viewBox="0 0 200 160" style="position:absolute;${land ? `right:12cqw;top:${r(H * 0.24)}cqw;width:14cqw;height:11.2cqw;` : `left:16cqw;top:${r(H * 0.2)}cqw;width:22cqw;height:17.6cqw;`}overflow:visible;">
      <path class="draw ${id}-arw" pathLength="100" d="M180,16 C114,26 68,62 50,124" fill="none" stroke="${rgba(th.pen2, 0.95)}" stroke-width="7" stroke-linecap="round"/>
      <path class="draw ${id}-arw" pathLength="100" d="M76,106 L48,130 L44,94" fill="none" stroke="${rgba(th.pen2, 0.95)}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>` : ""}`;
  const s = [
    `tl.fromTo("#${id}-big",{opacity:0,scale:0.72,y:14},{opacity:1,scale:1,y:0,duration:0.7,ease:"back.out(1.5)"},${r(T + 0.25)});`,
    st ? `countTxt("#${id}-big",${r(st.v)},${r(T + 0.3)},${r(Math.min(1.6, Math.max(0.6, L * 0.45)))},${JSON.stringify(st.pre)},${JSON.stringify(st.suf)},${st.isFloat ? 10 : 1});` : "",
    `tl.fromTo(".${id}-loop",{strokeDashoffset:100},{strokeDashoffset:0,duration:1.05,ease:"power2.inOut"},${r(T + 0.75)});`,
    label ? `tl.fromTo("#${id}-lab",{opacity:0,y:16},{opacity:1,y:0,duration:0.6,ease:"power2.out"},${r(T + 1.05)});` : "",
    second ? `tl.fromTo("#${id}-2nd",{opacity:0,y:12},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 1.3)});` : "",
    second ? `countTxt("#${id}-n2",${r(second.v)},${r(T + 1.3)},${r(Math.min(1.2, Math.max(0.5, L * 0.32)))},${JSON.stringify(second.pre)},${JSON.stringify(second.suf)},${second.isFloat ? 10 : 1});` : "",
    aside ? `tl.fromTo("#${id}-aside",{opacity:0,y:-12,rotation:-2},{opacity:1,y:0,rotation:0,duration:0.6,ease:"power2.out"},${r(T + 1.15)});` : "",
    aside ? `tl.fromTo(".${id}-arw",{strokeDashoffset:100},{strokeDashoffset:0,duration:0.55,ease:"power2.out",stagger:0.12},${r(T + 1.35)});` : "",
    `tl.to("#${id}-big",{y:${land ? -4 : -6},duration:1.7,ease:"sine.inOut",yoyo:true,repeat:reps(${r(Math.max(1.8, L - 1.6))},1.7)},${r(T + 1.6)});`,
  ];
  return { html, s };
}

function notequote(scene, ctx, a) {
  const { id, T, L, theme: th, land, dims, brand, variant } = ctx;
  const H = HC(dims);
  const quote = fit(String(scene.quote || scene.subtext || scene.headline || ""), 150);
  const words = quote.split(/\s+/).filter(Boolean);
  const author = fit(String(scene.author || scene.emphasis || ""), 30);
  const role = fit(String(scene.role || scene.purpose || brand), 34);
  const initial = String(author || brand || "•").trim().charAt(0).toUpperCase() || "•";
  const avaSz = land ? 4.4 : 6.8;
  // A real portrait reads far warmer than initials — the byline disc is a
  // pre-sized, text-isolated slot, so drop the testimonial's photo in when one
  // was cast (mediaSlots.notequote=["photo"]); fall back to a hand-inked monogram
  // so a quote with no portrait still signs off cleanly (never an empty frame).
  const ava = (a && a.path)
    ? `<span id="${id}-ava" style="opacity:0;width:${avaSz}cqw;height:${avaSz}cqw;border-radius:50%;flex:0 0 auto;overflow:hidden;display:block;background:${rgba(th.pageInk, 0.08)};box-shadow:0 0.4cqw 1cqw ${th.shadowCol};"><img src="${esc(a.path)}" alt="${esc(a.alt || author || "portrait")}" style="width:100%;height:100%;object-fit:cover;display:block;"></span>`
    : `<span id="${id}-ava" style="opacity:0;width:${avaSz}cqw;height:${avaSz}cqw;border-radius:50%;flex:0 0 auto;display:flex;align-items:center;justify-content:center;border:0.3cqw solid ${th.pen};background:${rgba(th.pen, 0.08)};font-family:${th.handStack};${th.handStyle}font-size:${land ? 2 : 3.2}cqw;color:${th.pen};">${esc(initial)}</span>`;
  const qSize = r(Math.min(land ? 4.6 : 6, (land ? 210 : 160) / Math.max(words.length, 1) + 1.6));
  // The note is CUT TO THE QUOTE. A fixed sheet either strands a six-word line
  // in half a page of blank paper or crops the signature off a long one, so the
  // paper is sized from the wrapped line count instead.
  const nw = land ? 74 : 86, pad = land ? 12 : 16;
  const cpl = Math.max(8, (nw - pad) / (qSize * 0.52));
  const qLines = Math.max(1, Math.ceil(quote.length / cpl));
  const contentH = (land ? 4.6 : 6.3) + (land ? 1.2 : 2) + qLines * qSize * 1.46
    + (land ? 1.6 : 2.6) + (land ? 1.1 : 1.8) + (land ? 0.9 : 1.6)
    + (author ? (land ? 3.1 : 4.8) : 0) + (land ? 2.1 : 3.4);
  const nh = Math.max(0.3, Math.min(0.84, (contentH + (land ? 5 : 9)) / H));
  const note = { l: r((100 - nw) / 2), w: nw, t: r(H * (0.5 - nh / 2)), h: r(H * nh) };
  const rot = variant % 2 === 0 ? -1.6 : 1.6;
  const html = `
    <div id="${id}-note" style="opacity:0;position:absolute;left:${note.l}cqw;top:${note.t}cqw;width:${note.w}cqw;height:${note.h}cqw;filter:drop-shadow(0 1.1cqw 2.2cqw ${th.shadowCol});">
      <div style="position:absolute;inset:0;background:${th.page};clip-path:${tornPoly(7 + ctx.i, { top: true, bottom: true })};"></div>
      <div style="position:absolute;left:${land ? 6 : 8}cqw;right:${land ? 6 : 8}cqw;top:0;bottom:0;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;">
        <div id="${id}-mark" style="opacity:0;font-family:${th.displayStack};font-weight:700;font-size:${land ? 6.5 : 9}cqw;line-height:0.7;color:${E.readable(th.page || th.ground, th.pen, 0.85, 3)};">&ldquo;</div>
        <div style="margin-top:${land ? 1.2 : 2}cqw;display:flex;flex-wrap:wrap;">
          ${words.map((w) => `<span class="${id}-w" style="opacity:0;font-family:${th.displayStack};font-weight:600;font-size:${qSize}cqw;line-height:1.42;color:${th.pageInk};margin-right:0.7cqw;">${esc(w)}</span>`).join("")}
        </div>
        <div style="margin-top:${land ? 1.6 : 2.6}cqw;">${handRule(`${id}-rl`, th.pen2, land ? 16 : 26, 71, 0.3)}</div>
        <div id="${id}-by" style="margin-top:${land ? 0.9 : 1.6}cqw;display:flex;align-items:center;gap:${land ? 1.2 : 1.9}cqw;">
          ${ava}
          <div style="min-width:0;">
            ${author ? `<div id="${id}-au" style="opacity:0;font-family:${th.handStack};${th.handStyle}font-size:${land ? 2.5 : 3.9}cqw;color:${th.pen};">${esc(author)}</div>` : ""}
            <div id="${id}-ro" style="opacity:0;margin-top:${land ? 0.4 : 0.8}cqw;font-family:${th.bodyStack};font-size:${land ? 1.3 : 2.1}cqw;letter-spacing:0.1em;text-transform:uppercase;color:${rgba(th.pageInk, 0.62)};">${esc(role)}</div>
          </div>
        </div>
      </div>
    </div>
    ${tape(th, { w: land ? 12 : 18, h: land ? 3 : 4.6, left: r(note.l + note.w * 0.42), top: r(note.t - (land ? 1.3 : 2)), rot: -4, cls: `${id}-tp`, color: th.accent })}`;
  const s = [
    `tl.fromTo("#${id}-note",{opacity:0,y:${land ? 26 : 34},rotation:${r(rot * 2.4)},scale:0.97},{opacity:1,y:0,rotation:${rot},scale:1,duration:0.85,ease:"power3.out"},${T});`,
    `tl.fromTo(".${id}-tp",{opacity:0,scale:0.5,rotation:-16},{opacity:1,scale:1,rotation:-4,duration:0.45,ease:"back.out(1.7)"},${r(T + 0.6)});`,
    `tl.fromTo("#${id}-mark",{opacity:0,scale:0.5},{opacity:1,scale:1,duration:0.5,ease:"back.out(2)",transformOrigin:"left top"},${r(T + 0.28)});`,
    words.length ? `tl.fromTo(".${id}-w",{opacity:0,y:12},{opacity:1,y:0,duration:0.42,ease:"power2.out",stagger:${r(Math.min(0.07, 1.1 / Math.max(words.length, 1)))}},${r(T + 0.42)});` : "",
    `tl.fromTo(".${id}-rl",{strokeDashoffset:100},{strokeDashoffset:0,duration:0.6,ease:"power2.out"},${r(T + 1.25)});`,
    author ? `tl.fromTo("#${id}-au",{opacity:0,x:-14},{opacity:1,x:0,duration:0.55,ease:"power2.out"},${r(T + 1.4)});` : "",
    `tl.fromTo("#${id}-ava",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.7)"},${r(T + 1.38)});`,
    `tl.fromTo("#${id}-ro",{opacity:0,x:-10},{opacity:1,x:0,duration:0.5,ease:"power2.out"},${r(T + 1.55)});`,
    `tl.to("#${id}-note",{rotation:${r(rot * 0.3)},duration:${r(Math.max(1.5, L - 1.1))},ease:"sine.inOut"},${r(T + 1.1)});`,
  ];
  return { html, s };
}

function scrapbook(scene, ctx, a, b) {
  const { id, T, theme: th, land, dims, brand } = ctx;
  const H = HC(dims);
  const lines = breakLines(scene.headline, "").slice(0, 2);
  const kicker = fit(String(scene.kicker || scene.purpose || ""), 24);
  const notes = (Array.isArray(scene.items) && scene.items.length ? scene.items : bullets(scene, 3))
    .map((x) => fit(String(x), 40)).filter(Boolean);
  const slots = land
    ? [{ l: 5.5, w: 28, t: r(H * 0.33), h: r(H * 0.5), rot: -3 },
       { l: 36, w: 29, t: r(H * 0.31), h: r(H * 0.56), rot: 2.2 },
       { l: 66.5, w: 28, t: r(H * 0.34), h: r(H * 0.48), rot: -1.4 }]
    : [{ l: 6, w: 42, t: r(H * 0.24), h: r(H * 0.26), rot: -3 },
       { l: 52, w: 42, t: r(H * 0.27), h: r(H * 0.24), rot: 2.4 },
       { l: 17, w: 48, t: r(H * 0.58), h: r(H * 0.27), rot: -1.6 }];
  const media = [a, b].filter((x) => x && x.path);
  const tile = (k) => {
    const g = slots[k];
    const asset = media[k] || null;
    const noteTxt = asset ? "" : (notes[Math.max(0, k - media.length)] || "");
    const inner = asset
      ? photoCard(th, ctx, asset, 17 + k * 3, `${id}-t${k}`)
      : `<div style="position:absolute;inset:0;background:${th.page};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${land ? 1.2 : 1.8}cqw;padding:${land ? 1.6 : 2.4}cqw;text-align:center;background-image:repeating-linear-gradient(0deg, transparent 0 ${land ? 2.4 : 3.4}cqw, ${rgba(th.pageInk, 0.09)} ${land ? 2.4 : 3.4}cqw ${land ? 2.5 : 3.5}cqw);">
          ${noteTxt
            ? `<div style="font-family:${th.handStack};${th.handStyle}font-size:${land ? 2.1 : 3}cqw;line-height:1.45;color:${th.pageInk};">${esc(noteTxt)}</div>`
            : doodle(DOODLES[(ctx.i + k) % DOODLES.length], th.pen, `${id}-d${k}`, land ? 12 : 15, 7)}
          ${noteTxt ? "" : `<div style="font-family:${th.handStack};${th.handStyle}font-size:${land ? 1.4 : 2.1}cqw;color:${rgba(th.pageInk, 0.55)};">${esc(String(brand))}</div>`}
        </div>`;
    return `<div class="${id}-tile" style="opacity:0;position:absolute;left:${g.l}cqw;top:${g.t}cqw;width:${g.w}cqw;height:${g.h}cqw;filter:drop-shadow(0 0.8cqw 1.6cqw ${th.shadowCol});">${inner}</div>
      ${tape(th, { w: land ? 7.5 : 11, h: land ? 2.2 : 3.2, left: r(g.l + g.w * 0.34), top: r(g.t - (land ? 0.9 : 1.3)), rot: k % 2 ? 6 : -7, cls: `${id}-tp`, color: k % 2 ? th.accent2 : th.accent3 })}`;
  };
  const html = `
    <div style="position:absolute;left:${land ? 6 : 7}cqw;top:${r(H * 0.06)}cqw;width:${land ? 56 : 84}cqw;">
      ${kicker ? `<div id="${id}-kick" style="opacity:0;font-family:${th.handStack};${th.handStyle}font-size:${land ? 1.9 : 3.1}cqw;letter-spacing:0.07em;color:${th.pen};margin-bottom:${land ? 0.6 : 1}cqw;">${esc(kicker)}</div>` : ""}
      ${lines.map((ln) => `<div class="${id}-hd" style="opacity:0;font-family:${th.displayStack};font-weight:700;font-size:${typeSize(lines, land ? 4.6 : 6, land ? 76 : 78)}cqw;line-height:1.14;color:${th.ink};">${esc(ln)}</div>`).join("")}
    </div>
    ${[0, 1, 2].map(tile).join("")}`;
  const s = [
    kicker ? `tl.fromTo("#${id}-kick",{opacity:0,x:-16},{opacity:1,x:0,duration:0.5,ease:"power2.out"},${r(T + 0.2)});` : "",
    `tl.fromTo(".${id}-hd",{opacity:0,y:18},{opacity:1,y:0,duration:0.6,ease:"power3.out",stagger:0.1},${r(T + 0.3)});`,
    `tl.fromTo(".${id}-tp",{opacity:0,scale:0.5},{opacity:1,scale:1,duration:0.4,ease:"back.out(1.7)",stagger:0.18},${r(T + 0.85)});`,
    media.length < 3 ? `tl.fromTo(".${id}-d0,.${id}-d1,.${id}-d2",{strokeDashoffset:100},{strokeDashoffset:0,duration:0.8,ease:"power2.out",stagger:0.06},${r(T + 1)});` : "",
  ];
  return { html, s };
}

function signoff(scene, ctx, a) {
  const { id, T, L, theme: th, land, dims, url, brand } = ctx;
  const H = HC(dims);
  const lines = breakLines(scene.headline, brand).slice(0, 2);
  const cta = fit(String(scene.cta || scene.emphasis || ""), 22);
  const kicker = fit(String(scene.kicker || ""), 24);
  const size = typeSize(lines, land ? 7 : 9, land ? 62 : 70);
  const boxW = land ? Math.max(18, cta.length * 1.5 + 6) : Math.max(30, cta.length * 2.5 + 10);
  const boxH = land ? 6.4 : 10;
  const html = `
    <div style="position:absolute;left:8cqw;right:8cqw;top:${r(H * 0.14)}cqw;height:${r(H * 0.68)}cqw;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;">
      ${a && a.path ? `<img id="${id}-logo" src="${esc(a.path)}" alt="${esc(a.alt || brand || "logo")}" style="opacity:0;max-height:${land ? 4 : 6}cqw;max-width:${land ? 24 : 44}cqw;object-fit:contain;margin-bottom:${land ? 1.6 : 2.4}cqw;">` : ""}
      ${kicker ? `<div id="${id}-kick" style="opacity:0;font-family:${th.handStack};${th.handStyle}font-size:${land ? 2 : 3.2}cqw;letter-spacing:0.07em;color:${th.pen};margin-bottom:${land ? 1.2 : 2}cqw;">${esc(kicker)}</div>` : ""}
      ${lines.map((ln) => `<div class="${id}-ln" style="opacity:0;font-family:${th.displayStack};font-weight:700;font-size:${size}cqw;line-height:1.12;color:${th.ink};">${esc(ln)}</div>`).join("")}
      <div style="margin-top:${land ? 1.2 : 2}cqw;">${handRule(`${id}-rl`, th.pen, land ? 30 : 46, 91, 0.5)}</div>
      ${cta ? `<div id="${id}-cta" style="opacity:0;position:relative;margin-top:${land ? 2.4 : 3.6}cqw;width:${r(boxW)}cqw;height:${boxH}cqw;display:flex;align-items:center;justify-content:center;">
        <svg viewBox="0 0 ${r(boxW * 10)} ${r(boxH * 10)}" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible;">
          <path class="draw ${id}-bx" pathLength="100" d="${handRect(r(boxW * 10), r(boxH * 10), 8, 55)}" fill="none" stroke="${th.pen}" stroke-width="4" stroke-linecap="round"/>
        </svg>
        <span style="position:relative;font-family:${th.displayStack};font-weight:700;font-size:${land ? 2.4 : 3.6}cqw;color:${th.ink};">${esc(cta)}</span>
      </div>` : ""}
      <div id="${id}-url" style="opacity:0;margin-top:${land ? 1.8 : 2.8}cqw;font-family:${th.bodyStack};font-size:${land ? 1.4 : 2.2}cqw;letter-spacing:0.18em;text-transform:uppercase;color:${th.dimInk};">${esc(url)}</div>
    </div>
    <svg id="${id}-stamp" viewBox="0 0 200 200" style="opacity:0;position:absolute;${land ? `right:8cqw;bottom:${r(H * 0.12)}cqw;width:15cqw;height:15cqw;` : `right:9cqw;bottom:${r(H * 0.13)}cqw;width:26cqw;height:26cqw;`}overflow:visible;">
      <g id="${id}-stampg">
        <circle cx="100" cy="100" r="88" fill="none" stroke="${rgba(th.pen2, 0.9)}" stroke-width="6" stroke-dasharray="14 11"/>
        <circle cx="100" cy="100" r="66" fill="none" stroke="${rgba(th.pen2, 0.6)}" stroke-width="3"/>
        ${doodle("star", rgba(th.pen2, 0.95), `${id}-sd`, 0, 7).replace(/<svg[^>]*>|<\/svg>/g, "").replace(/pathLength="100"/g, 'pathLength="100" transform="translate(48,48) scale(0.52)"')}
      </g>
    </svg>`;
  const s = [
    a && a.path ? `tl.fromTo("#${id}-logo",{opacity:0,y:-14},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 0.1)});` : "",
    kicker ? `tl.fromTo("#${id}-kick",{opacity:0,y:-14},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 0.2)});` : "",
    `tl.fromTo(".${id}-rl",{strokeDashoffset:100},{strokeDashoffset:0,duration:0.7,ease:"power2.out"},${r(T + 0.75)});`,
    cta ? `tl.fromTo("#${id}-cta",{opacity:0,y:16},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 0.9)});` : "",
    `tl.fromTo("#${id}-url",{opacity:0,y:12},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 1.25)});`,
    `tl.fromTo("#${id}-stamp",{opacity:0,scale:1.5},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.6)",transformOrigin:"center center"},${r(T + 1.15)});`,
    `tl.fromTo(".${id}-sd",{strokeDashoffset:100},{strokeDashoffset:0,duration:0.6,ease:"power2.out"},${r(T + 1.3)});`,
    // SVG group rotation: the origin MUST be svgOrigin (viewBox units), never a
    // px transform-origin — a px origin lands outside the scaled box.
    `tl.fromTo("#${id}-stampg",{rotation:-8},{rotation:${r(6 + Math.max(1, L) * 2)},duration:${r(Math.max(1.4, L - 1.2))},ease:"sine.inOut",svgOrigin:"100 100"},${r(T + 1.35)});`,
  ];
  return { html, s };
}

const SCENES = { cover, spread, chapters, circlednum, notequote, scrapbook, signoff };

// ---- persistent chrome (the paper the whole book is printed on) ---------------
function chrome({ theme: th, D, brand, count, land }) {
  return {
    html: `
  <div id="backdrop" class="clip" data-start="0" data-duration="__D__" data-track-index="0" data-layout-allow-occlusion style="opacity:0;background:${th.ground};">
    <div id="bd-fibre" style="position:absolute;inset:-2cqw;opacity:0.55;background-image:radial-gradient(${rgba(th.ink, 0.16)} 0.7px, transparent 0.8px),repeating-linear-gradient(97deg, transparent 0 1.4cqw, ${rgba(th.ink, 0.022)} 1.4cqw 2.9cqw);background-size:0.42cqw 0.42cqw, auto;"></div>
    <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 44%, transparent 52%, ${rgba(th.isDark ? "#000000" : "#5A4630", 0.16)} 100%);"></div>
  </div>
  <div id="edge" class="clip" data-start="0" data-duration="__D__" data-track-index="40" data-layout-allow-occlusion style="opacity:0;background:none;">
    <div style="position:absolute;left:${land ? 5 : 6}cqw;top:${land ? 3.4 : 4}cqw;font-family:${th.bodyStack};font-size:${land ? 1 : 1.7}cqw;letter-spacing:0.3em;text-transform:uppercase;color:${rgba(th.ink, 0.42)};">${esc(String(brand))}</div>
  </div>`,
    script: `
  tl.fromTo("#backdrop",{opacity:0},{opacity:1,duration:0.5},0);
  tl.fromTo("#edge",{opacity:0},{opacity:1,duration:0.6},0.25);
  tl.to("#bd-fibre",{opacity:0.34,duration:2.2,ease:"sine.inOut",yoyo:true,repeat:reps(${r(Math.max(2.4, D))},2.2)},0);`,
  };
}

// Per-scene: pencil the page number into the bottom margin as each page opens.
// No per-scene chrome — the "— 01 —" page mark was removed: a page number
// ticking up is the same slideshow tell as the progress rail.

function styleBlock(th) {
  return `${th.fontFace}
  #root { font-family:${th.bodyStack}; }
  .draw { stroke-dasharray:100; stroke-dashoffset:100; }
  #cap-pill { background:${th.page} !important; border:0 !important; border-radius:0.5cqw; box-shadow:0 0.5cqw 1.2cqw ${th.shadowCol}; padding:0.9cqw 2.2cqw; }
  #cap-text { font-family:${th.bodyStack}; color:${th.pageInk}; letter-spacing:0.01em; }`;
}

const family = {
  // ---- SCENE FILL (services/template_engine.js sceneFill) ---------------------
  // Measured 2026-08-04: scenes carried ~11 words over ~14% of the frame, so the
  // script's spare copy (supporting points, a figure, a subtext) never reached the
  // screen. It is drawn here as a chip row + broadcast ticker in the lower band.
  // Skipped on the closer, the pull-quote and the type whose own design owns that
  // band — furniture under a CTA or a quote costs more than the density gains.
  fill: (type, ctx, scene) => {
    if (["signoff","notequote","scrapbook"].includes(type)) return null;
    const land = ctx.land;
    return {
      left: land ? 7 : 6, right: land ? 7 : 6, bottom: land ? 8 : 11,
      font: land ? 1.12 : 1.95, max: 3,
      plate: ctx.theme.ground, ink: ctx.theme.ink, accent: ctx.theme.accent,
      used: bullets(scene || {}, 3),
    };
  },
  theme, styleBlock, chrome, SCENES, TEMPLATE_SCENES, route, mediaSlots, mediaFallback,
  wantsLogo: (t) => t === "signoff",
  fallbackType: "cover",
  variants: 2,
  // Storybook camera: pages breathe and occasionally slide over like a turned
  // leaf — soft blur, almost no push, never a slam.
  camera: { enabled: false,
    kinds: ["zoom", "zoom", "whip", "zoom", "zoom", "whip", "zoom", "zoom"],
    blur: 12, push: 0.022, zoomIn: 1.09, zoomOut: 1.07,
  },

  // ---- SHARED MOTION SYSTEM (services/motion_presets.js) ----------------------
  // This family publishes WHERE its headline, card and camera live; the engine
  // drives them from the one preset library. Its own entrance tweens for those
  // elements were removed in the same change — two timelines on one property
  // fight, and the loser is whichever the browser applies second.
  motion: {
    heroType: "cover",
    text: (id) => `.${id}-ln`,
    card: (id) => `#${id}-bx, .${id}-bx, #${id}-tile, .${id}-tile`,
    camera: (id) => `#${id}-cami`,
    // The film's two hero moments carry the signature type treatments; the
    // middle stays on the house word stagger so the signatures stay signatures.
    tokens: (type, i, ctx, { hasCard } = {}) => ({
      text: type === "cover" ? "outlineFillReveal"
        : type === "signoff" ? "characterReveal" : "wordStaggerBlur",
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
