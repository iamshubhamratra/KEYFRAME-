// KINETIC BOLD — a kinetic-typography poster system. Native GSAP + DOM, built on om_port_kit.
//
// PROVENANCE. NOT a port: there is no Claude Design reference for this pack. Every other composer in
// the library was rebuilt against a readable reference in templete-design/; this one is written from
// its own manifest, frames/kinetic-bold/pack.json, which is the only brief that exists for it.
//
// WHY IT WAS BUILT. The pack shipped with NO `renderer` key, so `composerModuleFor` returned nothing
// and every film that selected kinetic-bold rendered through the GENERIC scene kit wearing its
// palette. Its own vibe describes a pack that did not exist in code:
//
//   "Type IS the visual: enormous Anton words fill the frame, scenes hard-cut between near-black and
//    off-white grounds, and each scene carries exactly one electric accent."
//
// Nothing flagged it. No check asserts that a pack has a composer, and the goldens only cover the
// packs that have one — so it was invisible to the whole suite by construction.
//
// THE THREE RULES, taken from the manifest and applied everywhere:
//   1. TYPE IS THE VISUAL. Display type is sized to FILL its measure, not to sit politely inside it.
//   2. HARD CUT, ALTERNATING GROUND. Even beats are off-white, odd beats near-black. No crossfade,
//      no gradient, no shadow: `surface.flat` is true, so every edge is a hard edge.
//   3. ONE ACCENT PER SCENE, from the manifest's four electric colours, rotating by beat. A scene
//      never shows two of them.
//
// FONT SUBSTITUTION: Anton is bundled and used as specified. `Inter` is NOT bundled, so Manrope
// stands in for the body voice — the nearest neutral grotesque in src/fonts/pack_fonts.js.

const K = require("./om_port_kit");
const { r, esc, rgba } = K;

const STAGE = K.stageOf(1920, 1080);
const { U, VH } = STAGE;

const INK = "#0B0B0B", PAPER = "#FAFAFA";
// The manifest's four electric accents, in its own order. One per beat, rotating.
const ACCENTS = ["#FF3D2E", "#FFE600", "#00E0A4", "#2D7CFF"];
const DISPLAY = "Anton", BODY = "Manrope", MONO = "JetBrains Mono";

const STRINGS = {
  hook: "PULSE", words: "THE POINT", feature: "WHAT IT DOES", how: "HOW IT WORKS",
  proof: "THE NUMBERS", context: "IN CONTEXT", cta: "GET IT",
  scene: "CUT", of: "OF", go: "START NOW", step: "STEP",
};

function theme(brandSkin) {
  // The brand accent REPLACES the first of the four, so a rebranded film opens on the user's colour
  // and still rotates through the pack's own three. Rebranding a pack whose whole identity is "one
  // electric accent per cut" must not flatten it to a single hue.
  const { accent, resolvedBrand } = K.resolveAccent(brandSkin, { ground: PAPER, isDark: false, packAccent: ACCENTS[0] });
  return {
    accent, bg: PAPER, ink: INK, paper: PAPER, panel: PAPER,
    sub: rgba(INK, 0.6), line: rgba(INK, 0.16),
    accents: [accent, ...ACCENTS.slice(1)],
    adv: K.ADVANCE.upper,
    capBg: INK, capInk: PAPER,
    ...K.fontStacks(DISPLAY, MONO, `'${BODY}', system-ui, sans-serif`, [BODY]),
    bodyStack: `'${BODY}', system-ui, sans-serif`,
    resolvedBrand,
  };
}

// ---- the alternating ground --------------------------------------------------
const M = U(110);
const COL = U(1920) - M * 2;

// Every beat resolves its own palette from its index: this is rule 2 and rule 3 in one place, so no
// builder can accidentally put a light headline on a light ground or two accents in one frame.
function skin(ctx) {
  const dark = ctx.i % 2 === 1;
  const acc = ctx.th.accents[ctx.i % ctx.th.accents.length];
  return {
    dark, acc,
    bg: dark ? INK : PAPER,
    fg: dark ? PAPER : INK,
    sub: dark ? rgba(PAPER, 0.62) : rgba(INK, 0.6),
    line: dark ? rgba(PAPER, 0.22) : rgba(INK, 0.18),
  };
}

// Flat ground, one hairline rule, and a single accent block that slides in from the edge. No
// gradients and no shadows anywhere in this pack — `surface.flat` is not a suggestion.
function ground(id, sk) {
  return `<div style="position:absolute;inset:0;background:${sk.bg};overflow:hidden;">
    <div class="${id}-blk" style="position:absolute;right:0;top:0;width:${r(U(240))}cqw;height:100%;background:${sk.acc};"></div>
    <div style="position:absolute;left:${r(M)}cqw;right:${r(M)}cqw;top:${r(U(150))}cqw;height:${r(U(3))}cqw;background:${sk.line};"></div>
  </div>`;
}
const groundTweens = (id, ctx) => [
  // The block pushes in on the cut and then drifts, which is the manifest's `motion.cut: "push"`
  // read literally. It travels its own width, so it never reveals a seam.
  `tl.fromTo(".${id}-blk",{x:"${r(U(240))}cqw"},{x:0,duration:${ctx.du(0.34)},ease:"expo.out"},${ctx.at(0)});`,
  `tl.to(".${id}-blk",{x:"${r(-U(26))}cqw",duration:${r(Math.max(3, ctx.L))},ease:"sine.inOut"},${ctx.at(0.4)});`,
];

// THIS PACK MUST OWN ITS CHROME. The kit's chrome paints from the FILM's theme, which has one ink
// and one accent — and this pack inverts its ground on every other beat and rotates its accent on
// every beat. Shot on a dark beat, the kit's wordmark was near-black on near-black: gone, on half
// the film. Its progress rail was red on a yellow beat, which breaks rule 3 outright. Both are
// invisible to the ghost guard, because the element IS revealed — it is revealed in the ground's own
// colour. So every builder returns this instead.
function hud(ctx, sk) {
  const { id, th, i, total, label } = ctx;
  const brand = String(ctx.brand || "").slice(0, 22);
  return `<div class="om-chrome">
    <div style="position:absolute;left:${r(M)}cqw;top:${r(U(46))}cqw;display:flex;align-items:center;gap:${r(U(14))}cqw;">
      <span style="display:inline-grid;place-items:center;width:${r(U(44))}cqw;height:${r(U(44))}cqw;background:${sk.acc};color:${K.inkOn(sk.acc, INK)};font-family:${th.displayStack};font-size:${r(U(26))}cqw;">${esc(brand.slice(0, 1))}</span>
      <span style="font-family:${th.displayStack};font-size:${r(U(30))}cqw;text-transform:uppercase;color:${sk.fg};white-space:nowrap;">${esc(brand)}</span>
      ${label ? `<span style="font-family:${th.bodyStack};font-weight:800;font-size:${r(U(18))}cqw;letter-spacing:0.22em;text-transform:uppercase;color:${sk.sub};white-space:nowrap;">/ ${esc(label)}</span>` : ""}
    </div>
    <div style="position:absolute;right:${r(M)}cqw;top:${r(U(56))}cqw;font-family:${th.bodyStack};font-weight:800;font-size:${r(U(18))}cqw;letter-spacing:0.22em;color:${sk.sub};">${esc(STRINGS.scene)} ${String(i + 1).padStart(2, "0")} ${esc(STRINGS.of)} ${String(total).padStart(2, "0")}</div>
    <div style="position:absolute;left:${r(M)}cqw;right:${r(M)}cqw;bottom:${r(U(46))}cqw;height:${r(U(3))}cqw;background:${sk.line};overflow:hidden;">
      <div class="${id}-rail" style="width:100%;height:100%;background:${sk.acc};transform:scaleX(${r(total ? i / total : 0)});transform-origin:left center;"></div>
    </div>
  </div>`;
}
const hudTweens = (id, ctx) => [
  `tl.to(".${id}-rail",{scaleX:${r(ctx.total ? (ctx.i + 1) / ctx.total : 1)},duration:${r(ctx.L)},ease:"none"},${r(ctx.T)});`,
];

// ---- type -------------------------------------------------------------------
// A run of display lines, each clipped to its own row so the line can slide up from under it. This
// is `textfx.enter: "slide"` — the pack never fades type in, it pushes it.
function slab(id, sk, th, lines, size, cls = "kb") {
  return lines.map((l) => `<span class="kw" style="display:block;overflow:hidden;"><span class="kwi ${id}-${cls}" style="display:block;font-family:${th.displayStack};font-size:${r(size)}cqw;line-height:0.86;letter-spacing:-0.01em;text-transform:uppercase;color:${sk.fg};">${esc(l)}</span></span>`).join("");
}
const slabTweens = (id, ctx, at, cls = "kb") => [
  `tl.fromTo(".${id}-${cls}",{yPercent:108},{yPercent:0,duration:${ctx.du(0.34)},ease:"expo.out",stagger:${ctx.du(0.1)}},${ctx.at(at)});`,
];

// `textfx.emphasis: "boxed"` — the accent is a block behind the word, not a colour on it.
const boxed = (sk, th, word, size) =>
  `<span style="display:inline-block;background:${sk.acc};color:${K.inkOn(sk.acc, INK)};font-family:${th.displayStack};font-size:${r(size)}cqw;line-height:0.9;padding:0 ${r(U(16))}cqw;text-transform:uppercase;">${esc(word)}</span>`;

const kicker = (sk, th, t) =>
  `<div style="font-family:${th.bodyStack};font-weight:800;font-size:${r(U(24))}cqw;letter-spacing:0.26em;text-transform:uppercase;color:${sk.acc};">${esc(t)}</div>`;

// A media band. The manifest's slots are extreme letterboxes (1728x410, 826x162), so the picture is
// always a STRIP: full measure, hard edges, cropped to the band rather than fitted inside it.
function strip(cls, sk, { y, h, shot, contain = false }) {
  return `<div class="${cls}" style="position:absolute;left:${r(M)}cqw;top:${r(y)}cqw;width:${r(COL - U(260))}cqw;height:${r(h)}cqw;overflow:hidden;background:${sk.dark ? rgba(PAPER, 0.06) : rgba(INK, 0.06)};opacity:0;">
    ${contain && shot && shot.path
      // The kit has ONE media helper, shotFill, and it crops. `how` wants the manifest's
      // objectFit:"contain" for an illustration, so that one case is written out — inset:0 against
      // this strip, which is positioned, so it fills the band without escaping it.
      ? `<img src="${esc(shot.path)}" alt="${esc(shot.alt || "")}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block;">`
      : K.shotFill(shot, { bg: sk.bg })}
  </div>`;
}
const stripTweens = (cls, ctx, at) => [
  `tl.to(".${cls}",{opacity:1,duration:${ctx.du(0.08)},ease:"none"},${ctx.at(at)});`,
  // Strips wipe open from the left on their own beat: a clip, not a fade.
  `tl.fromTo(".${cls}",{clipPath:"inset(0% 100% 0% 0%)"},{clipPath:"inset(0% 0% 0% 0%)",duration:${ctx.du(0.42)},ease:"expo.out"},${ctx.at(at)});`,
];

const numTag = (sk, th, n) =>
  `<span style="display:inline-grid;place-items:center;width:${r(U(64))}cqw;height:${r(U(64))}cqw;background:${sk.acc};color:${K.inkOn(sk.acc, INK)};font-family:${th.displayStack};font-size:${r(U(34))}cqw;">${esc(n)}</span>`;

// ---- scenes -----------------------------------------------------------------
// HOOK — the opening poster. Type fills the frame; the last word takes the accent block.
function sHook(scene, ctx) {
  const sk = skin(ctx), { id, th } = ctx;
  const raw = String(scene.headline || scene.title || ctx.title || "").toUpperCase();
  const head = K.fitLines(raw, (COL - U(260)) / K.camSafe(), U(210), 3, th.adv);
  const stamp = K.clampWords(String(scene.emphasis || "").toUpperCase(), 14);
  const body = String(scene.subtext || "").trim().slice(0, 130);
  return {
    backdrop: ground(id, sk),
    chrome: hud(ctx, sk),
    html: `
    <div style="position:absolute;left:${r(M)}cqw;bottom:${r(U(190))}cqw;width:${r(COL - U(260))}cqw;z-index:4;">
      <div class="${id}-kick" style="margin-bottom:${r(U(26))}cqw;opacity:0;">${kicker(sk, th, String(scene.kicker || STRINGS.hook).slice(0, 26))}</div>
      ${slab(id, sk, th, head.lines, head.size)}
      ${stamp ? `<div class="${id}-stamp" style="margin-top:${r(U(28))}cqw;opacity:0;">${boxed(sk, th, stamp, U(76))}</div>` : ""}
      ${body ? `<div class="${id}-body" style="margin-top:${r(U(30))}cqw;max-width:${r(U(760))}cqw;font-family:${th.bodyStack};font-weight:500;font-size:${r(U(30))}cqw;line-height:1.45;color:${sk.sub};opacity:0;">${esc(body)}</div>` : ""}
    </div>`,
    s: [
      `tl.fromTo(".${id}-kick",{opacity:0,x:"${r(-U(30))}cqw"},{opacity:1,x:0,duration:${ctx.du(0.24)},ease:"expo.out"},${ctx.at(0.1)});`,
      ...slabTweens(id, ctx, 0.22),
      stamp ? `tl.fromTo(".${id}-stamp",{opacity:0,scaleX:0.2},{opacity:1,scaleX:1,duration:${ctx.du(0.3)},ease:"expo.out",transformOrigin:"left center"},${ctx.at(0.72)});` : "",
      body ? `tl.fromTo(".${id}-body",{opacity:0,y:"${r(U(26))}cqw"},{opacity:1,y:0,duration:${ctx.du(0.3)},ease:"power3.out"},${ctx.at(0.86)});` : "",
      ...groundTweens(id, ctx),
      ...hudTweens(id, ctx),
    ].filter(Boolean),
  };
}

// WORDS — the pack's signature: nothing but type, one word per beat-fraction, each landing hard.
// This is the beat that needs no picture and no props, which is why it can always carry.
function sWords(scene, ctx) {
  const sk = skin(ctx), { id, th } = ctx;
  const src = String(scene.headline || scene.emphasis || scene.title || ctx.title || "").toUpperCase();
  const words = K.wordsOf(src).slice(0, 4);
  if (!words.length) return { ...K.statement(scene, ctx), backdrop: ground(id, sk) };
  const size = K.fitOne(words.reduce((a, b) => (a.length >= b.length ? a : b), ""), COL - U(260), U(300), th.adv);
  return {
    backdrop: ground(id, sk),
    chrome: hud(ctx, sk),
    html: `
    <div style="position:absolute;left:${r(M)}cqw;bottom:${r(U(150))}cqw;width:${r(COL - U(260))}cqw;z-index:4;">
      ${words.map((w, i) => `<span class="kw" style="display:block;overflow:hidden;"><span class="kwi ${id}-w" style="display:block;font-family:${th.displayStack};font-size:${r(size)}cqw;line-height:0.84;text-transform:uppercase;color:${i === words.length - 1 ? sk.acc : sk.fg};">${esc(w)}</span></span>`).join("")}
    </div>`,
    s: [
      `tl.fromTo(".${id}-w",{yPercent:110},{yPercent:0,duration:${ctx.du(0.26)},ease:"expo.out",stagger:${ctx.du(0.16)}},${ctx.at(0.12)});`,
      ...groundTweens(id, ctx),
      ...hudTweens(id, ctx),
    ],
  };
}

// FEATURE — the manifest's widest slot (1728x410). Headline over a letterbox strip, or two.
function sFeature(scene, ctx, shots) {
  const sk = skin(ctx), { id, th } = ctx;
  const n = Math.min(2, shots.length);
  if (!n) return { ...K.statement(scene, ctx), backdrop: ground(id, sk) };
  const head = K.fitLines(String(scene.headline || scene.title || "").toUpperCase(), (COL - U(260)) / K.camSafe(), U(120), 2, th.adv);
  // MEASURE THE HEADLINE, DO NOT GUESS PAST IT. A fixed band at 470 was fine for one line and ran
  // straight under a two-line headline, so the type sat on top of the first screenshot. The band
  // starts below whatever the headline actually occupies, and STOPS at 980 — the rail lives at 1030
  // and a strip that reaches the frame edge covers it.
  const gap = U(28), bandTop = U(230) + U(49) + head.lines.length * head.size * 0.86 + U(46), bandEnd = U(980);
  const bandY = bandTop;
  const h = n === 2 ? (bandEnd - bandY - gap) / 2 : bandEnd - bandY;
  return {
    backdrop: ground(id, sk),
    chrome: hud(ctx, sk),
    html: `
    <div style="position:absolute;left:${r(M)}cqw;top:${r(U(230))}cqw;width:${r(COL - U(260))}cqw;z-index:4;">
      <div class="${id}-kick" style="margin-bottom:${r(U(20))}cqw;opacity:0;">${kicker(sk, th, String(scene.kicker || STRINGS.feature).slice(0, 26))}</div>
      ${slab(id, sk, th, head.lines, head.size)}
    </div>
    ${Array.from({ length: n }, (_, i) => strip(`${id}-st${i}`, sk, { y: bandY + i * (h + gap), h, shot: shots[i] })).join("")}`,
    s: [
      `tl.fromTo(".${id}-kick",{opacity:0,x:"${r(-U(30))}cqw"},{opacity:1,x:0,duration:${ctx.du(0.22)},ease:"expo.out"},${ctx.at(0.08)});`,
      ...slabTweens(id, ctx, 0.18),
      ...Array.from({ length: n }, (_, i) => stripTweens(`${id}-st${i}`, ctx, 0.5 + i * 0.18)).flat(),
      ...groundTweens(id, ctx),
      ...hudTweens(id, ctx),
    ],
  };
}

// HOW — numbered steps. Illustrations are `contain` in the manifest, so they sit ON the ground
// rather than filling a band, and the number block carries the accent.
function sHow(scene, ctx, shots) {
  const sk = skin(ctx), { id, th } = ctx;
  const steps = K.bullets(scene, 3).map((b) => String(b).toUpperCase().slice(0, 34));
  if (steps.length < 2) return { ...K.statement(scene, ctx), backdrop: ground(id, sk) };
  const head = K.fitOne(String(scene.headline || STRINGS.how).toUpperCase(), COL - U(300), U(110), th.adv);
  const rowY = U(430), rowH = Math.min(U(180), (U(1000) - rowY) / steps.length);
  return {
    backdrop: ground(id, sk),
    chrome: hud(ctx, sk),
    html: `
    <div style="position:absolute;left:${r(M)}cqw;top:${r(U(240))}cqw;width:${r(COL - U(260))}cqw;z-index:4;">
      ${slab(id, sk, th, [String(scene.headline || STRINGS.how).toUpperCase()], head)}
    </div>
    ${steps.map((s, i) => `<div class="${id}-row" style="position:absolute;left:${r(M)}cqw;top:${r(rowY + i * rowH)}cqw;width:${r(COL - U(260))}cqw;display:flex;align-items:center;gap:${r(U(26))}cqw;opacity:0;">
      ${numTag(sk, th, String(i + 1).padStart(2, "0"))}
      <span style="font-family:${th.displayStack};font-size:${r(U(58))}cqw;line-height:1;text-transform:uppercase;color:${sk.fg};">${esc(s)}</span>
    </div>`).join("")}
    ${shots[0] ? strip(`${id}-ill`, sk, { y: U(1000), h: U(150), shot: shots[0], contain: true }) : ""}`,
    s: [
      ...slabTweens(id, ctx, 0.12),
      `tl.fromTo(".${id}-row",{opacity:0,x:"${r(-U(40))}cqw"},{opacity:1,x:0,duration:${ctx.du(0.26)},ease:"expo.out",stagger:${ctx.du(0.14)}},${ctx.at(0.4)});`,
      ...(shots[0] ? stripTweens(`${id}-ill`, ctx, 0.8) : []),
      ...groundTweens(id, ctx),
      ...hudTweens(id, ctx),
    ],
  };
}

// PROOF — figures set as posters. The number takes the whole measure; the label sits under it.
function sProof(scene, ctx) {
  const sk = skin(ctx), { id, th } = ctx;
  const stats = K.numbersIn(scene, 3);
  if (stats.length < 2) return { ...K.statement(scene, ctx), backdrop: ground(id, sk) };
  const w = (COL - U(260) - U(40) * (stats.length - 1)) / stats.length;
  return {
    backdrop: ground(id, sk),
    chrome: hud(ctx, sk),
    html: `
    <div style="position:absolute;left:${r(M)}cqw;top:${r(U(230))}cqw;z-index:4;">
      <div class="${id}-kick" style="opacity:0;">${kicker(sk, th, String(scene.kicker || STRINGS.proof).slice(0, 26))}</div>
    </div>
    <div style="position:absolute;left:${r(M)}cqw;top:${r(U(360))}cqw;width:${r(COL - U(260))}cqw;display:flex;gap:${r(U(40))}cqw;z-index:4;">
      ${stats.map((st, i) => `<div class="${id}-fig" style="width:${r(w)}cqw;opacity:0;">
        <div style="font-family:${th.displayStack};font-size:${r(K.fitOne(`${st.v}${st.suffix}`, w, U(230), th.adv))}cqw;line-height:0.9;color:${i === 0 ? sk.acc : sk.fg};white-space:nowrap;"><span class="${id}-n${i}">0</span>${esc(st.suffix)}</div>
        <div style="margin-top:${r(U(18))}cqw;font-family:${th.bodyStack};font-weight:800;font-size:${r(U(24))}cqw;letter-spacing:0.18em;text-transform:uppercase;color:${sk.sub};">${esc(K.statLabel(scene, i))}</div>
      </div>`).join("")}
    </div>`,
    s: [
      `tl.fromTo(".${id}-kick",{opacity:0,x:"${r(-U(30))}cqw"},{opacity:1,x:0,duration:${ctx.du(0.22)},ease:"expo.out"},${ctx.at(0.08)});`,
      `tl.fromTo(".${id}-fig",{opacity:0,y:"${r(U(60))}cqw"},{opacity:1,y:0,duration:${ctx.du(0.3)},ease:"expo.out",stagger:${ctx.du(0.14)}},${ctx.at(0.24)});`,
      ...stats.flatMap((st, i) => {
        const num = Number(String(st.v).replace(/,/g, "")) || 0;
        const dp = String(st.v).includes(".") ? 1 : 0;
        return [`tl.fromTo(".${id}-n${i}",{innerText:0},{innerText:${num},duration:${ctx.du(0.5)},ease:"power2.out",snap:{innerText:${dp ? 0.1 : 1}},onUpdate:function(){var e=document.querySelector(".${id}-n${i}");if(e)e.textContent=Number(e.textContent).toFixed(${dp});}},${ctx.at(0.34 + i * 0.14)});`];
      }),
      ...groundTweens(id, ctx),
      ...hudTweens(id, ctx),
    ],
  };
}

// CTA — the closing poster: the accent takes the WHOLE ground, and the manifest's canvas effect
// (`fx.canvas: "confetti"`) fires once the word has landed.
const CHIPS = Array.from({ length: 26 }, (_, i) => {
  const seed = i * 61.7;
  return { x: seed % 96, top: -8 + ((seed * 0.13) % 1) * 116, dur: 1.7 * (1 - ((seed * 0.13) % 1)) + 0.4, hue: i % 3 };
});
function sCta(scene, ctx, logo) {
  const sk = skin(ctx), { id, th } = ctx;
  const acc = sk.acc;
  const fg = K.inkOn(acc, INK);
  const head = K.fitLines(String(scene.headline || scene.emphasis || ctx.title || "").toUpperCase(), COL / K.camSafe(), U(240), 2, th.adv);
  const action = K.clampWords(String(scene.emphasis || "").toUpperCase(), 22) || STRINGS.go;
  const hasMark = !!(logo && logo.path);
  const cols = [fg, sk.dark ? PAPER : INK, PAPER];
  return {
    // The accent IS the ground on the closing beat — the only place this pack lets it off its block.
    backdrop: `<div style="position:absolute;inset:0;background:${acc};overflow:hidden;">
      <div class="${id}-conf" style="position:absolute;inset:0;overflow:hidden;opacity:0;">
        ${CHIPS.map((c, i) => `<div class="${id}-ch${i}" style="position:absolute;left:${r(c.x)}%;top:${r((c.top / 100) * VH)}cqw;width:${r(U(16))}cqw;height:${r(U(26))}cqw;background:${cols[c.hue]};opacity:0.9;"></div>`).join("")}
      </div>
    </div>`,
    // On the closing beat the ACCENT is the ground, so the hud reads against it: its own ink becomes
    // the foreground and the accent tile inverts. Passing the film skin here would print near-black
    // chrome on a red field.
    chrome: hud(ctx, { dark: !sk.dark, acc: fg, bg: acc, fg, sub: rgba(fg, 0.72), line: rgba(fg, 0.3) }),
    html: `
    <div style="position:absolute;left:${r(M)}cqw;right:${r(M)}cqw;top:${r(U(300))}cqw;z-index:5;">
      ${hasMark ? `<div class="${id}-logo" style="width:${r(U(120))}cqw;height:${r(U(120))}cqw;margin-bottom:${r(U(34))}cqw;background:${fg};display:flex;align-items:center;justify-content:center;padding:${r(U(16))}cqw;box-sizing:border-box;opacity:0;"><img src="${esc(logo.path)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain;"></div>` : ""}
      ${head.lines.map((l) => `<span class="kw" style="display:block;overflow:hidden;"><span class="kwi ${id}-c" style="display:block;font-family:${th.displayStack};font-size:${r(head.size)}cqw;line-height:0.86;text-transform:uppercase;color:${fg};">${esc(l)}</span></span>`).join("")}
      <div class="${id}-act" style="margin-top:${r(U(40))}cqw;display:inline-block;background:${fg};color:${acc};font-family:${th.displayStack};font-size:${r(K.fitOne(action, U(760), U(64), th.adv))}cqw;padding:${r(U(16))}cqw ${r(U(34))}cqw;text-transform:uppercase;opacity:0;">${esc(action)}</div>
      <div class="${id}-url" style="margin-top:${r(U(26))}cqw;font-family:${th.bodyStack};font-weight:800;font-size:${r(U(26))}cqw;letter-spacing:0.2em;text-transform:uppercase;color:${rgba(fg, 0.72)};opacity:0;">${esc(ctx.url)}</div>
    </div>`,
    s: [
      hasMark ? `tl.fromTo(".${id}-logo",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:${ctx.du(0.26)},ease:"expo.out"},${ctx.at(0.1)});` : "",
      `tl.fromTo(".${id}-c",{yPercent:110},{yPercent:0,duration:${ctx.du(0.3)},ease:"expo.out",stagger:${ctx.du(0.12)}},${ctx.at(0.2)});`,
      `tl.fromTo(".${id}-act",{opacity:0,scaleX:0.3},{opacity:1,scaleX:1,duration:${ctx.du(0.26)},ease:"expo.out",transformOrigin:"left center"},${ctx.at(0.62)});`,
      `tl.fromTo(".${id}-url",{opacity:0},{opacity:1,duration:${ctx.du(0.2)},ease:"none"},${ctx.at(0.78)});`,
      `tl.to(".${id}-conf",{opacity:1,duration:${ctx.du(0.1)},ease:"none"},${ctx.at(0.5)});`,
      ...hudTweens(id, ctx),
      ...CHIPS.flatMap((c, i) => [
        `tl.to(".${id}-ch${i}",{y:"${r((116 / 100) * VH)}cqw",rotation:${r(200 * c.dur)},duration:${r(c.dur)},ease:"none",repeat:${K.reps(ctx.L, c.dur)}},${ctx.at(0.5)});`,
      ]),
    ].filter(Boolean),
  };
}

// ---- spine ------------------------------------------------------------------
const SPEC = {
  first: "hook", last: "cta",
  // `words` sits first among the middles on purpose: it is the only role that needs nothing at all,
  // so on a three-beat film the pack still shows its signature instead of degrading to the kit.
  middle: ["words", "feature", "how", "proof"],
  shapes: {
    // The manifest's own slot geometry: feature/proof are 1728x410 letterboxes, how is 998x367.
    hook: [], words: [], feature: [1728 / 410, 1728 / 410], how: [998 / 367],
    proof: [], cta: [], statement: [], "statement-c": [],
  },
  slots: (role, budget) => (role === "feature" ? Math.min(2, Math.max(0, budget)) : role === "how" ? Math.min(1, Math.max(0, budget)) : 0),
  needs: (role) => (role === "feature" ? 1 : 0),
  carry: (role, scene, budget) => {
    const isStats = K.numbersIn(scene).length >= 2;
    if (role === "proof") return isStats;
    if (isStats) return false;                       // only `proof` prints figures as figures
    if (role === "feature") return budget >= 1;
    if (role === "how") return K.bullets(scene, 3).length >= 2;
    return true;
  },
};
const BUILDERS = {
  hook: sHook, words: sWords, feature: sFeature, how: sHow, proof: sProof, cta: sCta,
  statement: (sc, ctx) => ({ ...K.statement(sc, ctx), backdrop: ground(ctx.id, skin(ctx)), chrome: hud(ctx, skin(ctx)) }),
  "statement-c": (sc, ctx) => ({ ...K.statement(sc, ctx, { centred: true }), backdrop: ground(ctx.id, skin(ctx)), chrome: hud(ctx, skin(ctx)) }),
};
const LABELS = {
  hook: STRINGS.hook, words: STRINGS.words, feature: STRINGS.feature,
  how: STRINGS.how, proof: STRINGS.proof, cta: STRINGS.cta,
};

const css = (th, stage) => K.baseCss(th, stage, `
  #cap-pill { border-radius:0; }`);

function buildComposition(opts = {}) {
  return K.buildFilm({
    ...opts, stage: STAGE, theme, STRINGS, spec: SPEC, builders: BUILDERS, labels: LABELS,
    css, refBeat: 3.6,
    // `motion.drift: 1.025` from the manifest, and a push rather than a settle.
    camera: { push: 150, scale: 1.025 },
    signature: "kinetic", fallbackBrand: "PULSE",
  });
}

module.exports = { buildComposition, STRINGS };
module.exports.__test = { SPEC, BUILDERS, theme, STAGE };
