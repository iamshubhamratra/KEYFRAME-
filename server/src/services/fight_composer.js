// FIGHT — a fight-night promo. Native GSAP + DOM/SVG, built on om_port_kit.
//
// PROVENANCE. A SCENE-FOR-SCENE port of the Claude Design reference
// `old-templete/all-template-handoffs/Fight/src/fight-film.jsx` (1920x1080, 6 scenes,
// MainEvent / Challenger / Champion / Combos / Scorecard / StepInRing, transition="cut").
// Its layout, geometry, type scale, colour and cast are reproduced; none of its copy is.
//
// WHY THIS FILE WAS REBUILT (10 Aug 2026). The previous port scored 52/100 — the worst in the
// library — because it transcribed the ARENA and dropped everything that happens in it. Five of
// the reference's six signature devices were absent:
//
//   · the IMPACT BURST, which fires in five of six scenes at nine fixed coordinates and is the
//     pack's own thumbnail glyph (Fight.dc.html:36). The word "Impact" did not appear in the file.
//   · the SPEED LINES behind every entrance.
//   · the CONTINUOUS SHAKE — the reference's Frame shakes for the whole beat, always; our port
//     had one discrete 9px jolt on two of seven layouts.
//   · the STRUCK FLASH that dresses both edges of every cut.
//   · the SKEW on every plate. The string "skew" appeared nowhere; a ±3deg card rotation had
//     been substituted, which is a snapshot pinned to a board, not an italicised architecture.
//
// Alongside those: the belt gold was hue-rotated off the brand accent (it is a METAL, and the
// reference's own tweak panel proves corner and belt are independent axes), the shared kit HUD
// was inherited complete with the "ROUND 01 OF 06" counter the reference explicitly does not
// have, four display ceilings were transcribed low, the micro-type had been moved onto a third
// family (JetBrains Mono) the reference never loads, and the closer abandoned the arena for a
// flat accent flood — so the one beat where the ring should be most present was the only beat
// with no ropes, no spotlight and no halftone.
//
// WHAT IS DELIBERATELY NOT THE REFERENCE.
//   · No hatched "DROP IMAGE TO REPLACE" placeholder is ever drawn, and no beat is left as its
//     own layout minus its picture: a short beat routes to K.statement (om_port_kit's two laws).
//   · Type is MEASURED with K.fitLines/K.fitOne against real AI copy. The reference's fixed px
//     are transcribed as the CEILING argument, never as a constant.
//   · Continuous motion is re-expressed as repeating yoyo tweens: sine.inOut + yoyo IS a sine
//     wave, so amplitude and period carry over exactly (see fight_furniture.js).
//   · The transition system stays ON. The reference's `transition="cut"` is dressed additively
//     by the frame's own flash and punch rather than by disabling the dealer.
//   · The CORNER ACCENT is correctly brand-derived — the reference exposes it as its primary
//     TweakColor and ships #F97316 in Fight.dc.html. Only the BELT is locked.
//
// FONT SUBSTITUTION: none. Anton (display) and Oswald 400/500/600/700 (all micro-type) are the
// reference's only two families and both are bundled (see src/fonts/pack_fonts.js).
// ─────────────────────────────────────────────────────────────────────────────────────

const K = require("./om_port_kit");
const F = require("./fight_furniture");
const { r, esc, rgba } = K;

const STAGE = K.stageOf(1920, 1080);
const { U } = STAGE;

// The reference ThemeContext, verbatim (fight-film.jsx:7-10).
const BG = "#0B0B10", CANVAS = "#15151F", RING = "#20202C", INK = "#F5EFE6", SUB = "#8A8496";
const ACCENT = "#E23130", GOLD = "#F5C542";
// Anton for display, Oswald for every piece of micro-type — the reference loads exactly these
// two (Fight.dc.html:13) and sets its body copy in Oswald. Oswald takes the kit's `mono` slot
// because this pack has no monospaced type at all; `th.condStack` is the name it is used under.
const DISPLAY = "Anton", COND = "Oswald";
// Mean glyph advance for Anton set uppercase, in em. Measured off renders, not estimated.
const ADV = 0.50;

const STRINGS = {
  main: "MAIN EVENT", challenger: "CHALLENGER", champion: "CHAMPION",
  combos: "THE COMBO", card: "THE SCORECARD", vs: "VS",
  scene: "ROUND", of: "OF", go: "STEP IN", mainCard: "MAIN CARD",
  // The burst labels. They are copy, so they go through STRINGS and can be localized.
  pow: "POW", oof: "OOF", ko: "KO",
};

function theme(brandSkin) {
  const { accent, resolvedBrand } = K.resolveAccent(brandSkin, { ground: BG, isDark: true, packAccent: ACCENT });
  const stacks = K.fontStacks(DISPLAY, COND, "system-ui, sans-serif");
  return {
    accent, bg: BG, panel: CANVAS, ring: RING, ink: INK, sub: SUB,
    // THE BELT GOLD IS A METAL, NOT A BRAND HUE. The previous port derived it as
    // `K.spin(accent, 42, …)`, so a blue brand produced a cyan-lavender "belt" and the impact
    // stars, the jumbotron keyline, the phone keyline, the logo diamond and the scorecard plates
    // all followed it. The reference's own tweak panel (fight-film.jsx:292-293) exposes
    // "Corner (accent)" and "Belt (gold)" as SEPARATE axes with separate option sets — you can
    // change the corner and keep the belt. Locked, the same way orbit locks its flame.
    gold: GOLD,
    glow: rgba(accent, 0.5),
    inkOnAccent: K.inkOn(accent),
    adv: ADV,
    capBg: CANVAS, capInk: INK,
    ...stacks,
    // The condensed face under its own name. `monoStack` is the same string, so K.statement's
    // eyebrow (which reads th.monoStack) also sets in Oswald rather than in a fallback.
    condStack: stacks.monoStack,
    bodyStack: stacks.monoStack,
    resolvedBrand,
  };
}

// ---- timing ------------------------------------------------------------------
// The reference pins every cue to a FRACTION OF SCENE PROGRESS, not to a number of seconds.
// ctx.at/ctx.du are second-based (they scale by k = L/refBeat), which is right for an entrance —
// a 0.4s slam is 0.4s on any beat — and wrong for anything the reference expresses as a
// percentage of the beat. These keep the reference's fractions; `pDu` still carries the film
// tempo so a music-led cut quickens the same way everything else does.
const pAt = (ctx, f) => r(ctx.T + f * ctx.L);
const pDu = (ctx, f) => r(Math.max(0.06, f * ctx.L * ((ctx.tempo && ctx.tempo.motion) || 1)));

// ---- the frame ---------------------------------------------------------------
// Every beat wears the same wrapper: the arena inside the reference's shake/punch camera, the
// vignette and the struck flash above it, the reference's own chrome instead of the kit HUD.
// `backdrop: ""` is deliberate — the ground lives INSIDE the shake because the reference shakes
// the ring as well as the copy, and `.om-cam` already paints th.bg beneath everything.
function wrap(built, ctx, { halftone = 0.35, spotlight = false } = {}) {
  const { id, th } = ctx;
  return {
    ...built,
    backdrop: "",
    chrome: F.chrome(id, th, { brand: ctx.brand, label: ctx.label, url: ctx.url }),
    html: F.frame(id, th, { html: built.html, halftone, spotlight }),
    s: [
      ...(built.s || []).filter(Boolean),
      ...F.arenaTweens(id, ctx, { spotlight }),
      ...F.frameTweens(id, ctx),
      ...F.chromeTweens(id, ctx),
    ],
  };
}

// The nine impact coordinates are the reference's own; each scene passes its own list.
const impactsHtml = (id, th, list) => list.map((b, i) => F.impact(`${id}-imp${i}`, th, b)).join("");
const impactsTweens = (id, ctx, list) => list.flatMap((b, i) => F.impactTweens(`${id}-imp${i}`, ctx, { at: b.at }));

// ---- scenes ------------------------------------------------------------------

// MAIN EVENT (148-165) — the fight poster. A CENTRED block at top 210: a gold eyebrow at
// Oswald 600/34/0.4em, the name slamming in from scale 1.7 at Anton 250 with a 50px accent
// bloom, then an accent-filled skewX(-8) tagline pill. Spotlight + ropes, halftone at 0.4.
// PICTURELESS BY DESIGN — the reference's opener carries no media, and our port's fighter card
// here was spending a picture the Champion and Combos beats need.
function sMainEvent(scene, ctx) {
  const { id, th } = ctx;
  // 250px is the reference CEILING (fight-film.jsx:157), not a constant: fitLines shrinks it for
  // a long AI-authored headline. The old port capped at U(184) — the poster lost 66px.
  const head = K.fitLines(scene.headline || scene.title || ctx.brand, U(1720) / K.camSafe(), U(250), 3, th.adv);
  const eyebrow = K.clampWords(String(scene.kicker || ctx.S.main), 34).toUpperCase();
  const tagline = K.clampWords(String(scene.subtext || scene.emphasis || ""), 64);
  const bursts = [
    { cx: 300, cy: 760, size: 120, at: 0.16 },
    { cx: 1640, cy: 720, size: 150, at: 0.22 },
  ];

  return wrap({
    html: `
    ${F.speedLines(`${id}-sl`, th, th.accent)}
    ${impactsHtml(id, th, bursts)}
    <div style="position:absolute;left:0;right:0;top:${r(U(210))}cqw;text-align:center;z-index:6;padding:0 ${r(U(100))}cqw;">
      <div class="${id}-eb" style="font-family:${th.condStack};font-weight:600;font-size:${r(U(34))}cqw;letter-spacing:0.4em;text-transform:uppercase;color:${th.gold};opacity:0;">${esc(eyebrow)}</div>
      <div class="${id}-hd" style="font-family:${th.displayStack};font-size:${r(head.size)}cqw;line-height:0.84;text-transform:uppercase;color:${th.ink};text-shadow:0 0 ${r(U(50))}cqw ${rgba(th.accent, 0.5)};transform-origin:center center;opacity:0;">
        ${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}
      </div>
      ${tagline ? `<div style="margin-top:${r(U(14))}cqw;">${F.taglinePill(th, `${id}-pill`, tagline)}</div>` : ""}
    </div>`,
    s: [
      // M.rise(0.06, 0.24, 24) — a 24px lift on easeOutCubic.
      `tl.fromTo(".${id}-eb",{opacity:0,y:"${r(U(24))}cqw"},{opacity:1,y:0,duration:${pDu(ctx, 0.24)},ease:"power2.out"},${pAt(ctx, 0.06)});`,
      // M.slam(0.14, 0.32, 1.7) — scale 1.7 -> 1 on easeOutCubic about the centre.
      `tl.fromTo(".${id}-hd",{opacity:0,scale:1.7},{opacity:1,scale:1,duration:${pDu(ctx, 0.32)},ease:"power2.out"},${pAt(ctx, 0.14)});`,
      tagline ? `tl.fromTo(".${id}-pill",{opacity:0,y:"${r(U(26))}cqw"},{opacity:1,y:0,duration:${pDu(ctx, 0.26)},ease:"power2.out"},${pAt(ctx, 0.4)});` : "",
      ...F.speedLineTweens(`${id}-sl`, ctx, { at: 0.12, dur: 0.34 }),
      ...impactsTweens(id, ctx, bursts),
    ],
  }, ctx, { halftone: 0.4, spotlight: true });
}

// CHALLENGER (167-183) — "the old way". A left column at 96,250 under a 460px ghosted VS at
// right 90 / top 120 in accent@0.14, no spotlight, halftone at its default 0.5, and an OOF burst
// at 1500,520. Pictureless in the reference.
function sChallenger(scene, ctx) {
  const { id, th } = ctx;
  const head = K.fitLines(scene.headline || scene.title || "", U(900) / K.camSafe(), U(150), 3, th.adv);
  const body = K.clampWords(String(scene.subtext || "").trim(), 180);
  const bursts = [{ cx: 1500, cy: 520, size: 200, at: 0.2, label: String(ctx.S.oof) }];

  return wrap({
    html: `
    <div style="position:absolute;right:${r(U(90))}cqw;top:${r(U(120))}cqw;font-family:${th.displayStack};font-size:${r(U(460))}cqw;line-height:0.8;color:${rgba(th.accent, 0.14)};pointer-events:none;">${esc(ctx.S.vs)}</div>
    ${F.speedLines(`${id}-sl`, th, th.accent)}
    ${impactsHtml(id, th, bursts)}
    <div style="position:absolute;left:${r(U(96))}cqw;top:${r(U(250))}cqw;width:${r(U(900))}cqw;z-index:6;">
      <div class="${id}-brow" style="font-family:${th.condStack};font-weight:600;font-size:${r(U(30))}cqw;letter-spacing:0.28em;text-transform:uppercase;color:${th.gold};opacity:0;">${esc(K.clampWords(String(scene.kicker || ctx.S.challenger), 26).toUpperCase())}</div>
      <div class="${id}-hd" style="margin-top:${r(U(10))}cqw;font-family:${th.displayStack};font-size:${r(head.size)}cqw;line-height:0.86;text-transform:uppercase;color:${th.ink};transform-origin:left center;opacity:0;">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
      ${body ? `<div class="${id}-body" style="margin-top:${r(U(26))}cqw;font-family:${th.condStack};font-weight:400;font-size:${r(U(30))}cqw;line-height:1.5;color:${rgba(th.ink, 0.8)};max-width:${r(U(720))}cqw;opacity:0;">${esc(body)}</div>` : ""}
    </div>`,
    s: [
      `tl.fromTo(".${id}-brow",{opacity:0,y:"${r(U(22))}cqw"},{opacity:1,y:0,duration:${pDu(ctx, 0.22)},ease:"power2.out"},${pAt(ctx, 0.06)});`,
      `tl.fromTo(".${id}-hd",{opacity:0,scale:1.5},{opacity:1,scale:1,duration:${pDu(ctx, 0.3)},ease:"power2.out"},${pAt(ctx, 0.12)});`,
      body ? `tl.fromTo(".${id}-body",{opacity:0,y:"${r(U(22))}cqw"},{opacity:1,y:0,duration:${pDu(ctx, 0.26)},ease:"power2.out"},${pAt(ctx, 0.4)});` : "",
      ...F.speedLineTweens(`${id}-sl`, ctx, { at: 0.1, dur: 0.32 }),
      ...impactsTweens(id, ctx, bursts),
    ],
  }, ctx, { halftone: 0.5, spotlight: false });
}

// CHAMPION (185-204) — the payoff: copy left at 96,240, the product on the JUMBOTRON right at
// 96,210 (900x560) slamming in from 1.4, a POW burst at 940,430 and GOLD speed lines. Spotlight
// on, halftone at 0.3.
function sChampion(scene, ctx, shots) {
  const { id, th } = ctx;
  const shot = (shots || [])[0] || null;
  if (!shot) return wrap(K.statement(scene, ctx), ctx, { halftone: 0.3, spotlight: true });
  const head = K.fitLines(scene.headline || scene.title || "", U(640) / K.camSafe(), U(132), 3, th.adv);
  const body = K.clampWords(String(scene.subtext || "").trim(), 150);
  const bursts = [{ cx: 940, cy: 430, size: 140, at: 0.16, label: String(ctx.S.pow) }];

  return wrap({
    html: `
    <div style="position:absolute;left:${r(U(96))}cqw;top:${r(U(240))}cqw;width:${r(U(640))}cqw;z-index:6;">
      <div class="${id}-brow" style="font-family:${th.condStack};font-weight:600;font-size:${r(U(30))}cqw;letter-spacing:0.28em;text-transform:uppercase;color:${th.gold};opacity:0;">${esc(K.clampWords(String(scene.kicker || ctx.S.champion), 26).toUpperCase())}</div>
      <div class="${id}-hd" style="margin-top:${r(U(10))}cqw;font-family:${th.displayStack};font-size:${r(head.size)}cqw;line-height:0.86;text-transform:uppercase;color:${th.ink};transform-origin:left center;opacity:0;">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
      ${body ? `<div class="${id}-body" style="margin-top:${r(U(24))}cqw;font-family:${th.condStack};font-weight:400;font-size:${r(U(28))}cqw;line-height:1.5;color:${rgba(th.ink, 0.82)};max-width:${r(U(560))}cqw;opacity:0;">${esc(body)}</div>` : ""}
    </div>
    <div class="${id}-jt" style="position:absolute;right:${r(U(96))}cqw;top:${r(U(210))}cqw;width:${r(U(900))}cqw;height:${r(U(560))}cqw;transform-origin:center center;opacity:0;z-index:5;">
      ${F.jumbotron(th, K.shotFill(shot, { bg: th.panel, w: 900, h: 560 }))}
    </div>
    ${F.speedLines(`${id}-sl`, th, th.gold)}
    ${impactsHtml(id, th, bursts)}`,
    s: [
      `tl.fromTo(".${id}-brow",{opacity:0,y:"${r(U(22))}cqw"},{opacity:1,y:0,duration:${pDu(ctx, 0.22)},ease:"power2.out"},${pAt(ctx, 0.05)});`,
      `tl.fromTo(".${id}-hd",{opacity:0,scale:1.5},{opacity:1,scale:1,duration:${pDu(ctx, 0.3)},ease:"power2.out"},${pAt(ctx, 0.1)});`,
      body ? `tl.fromTo(".${id}-body",{opacity:0,y:"${r(U(22))}cqw"},{opacity:1,y:0,duration:${pDu(ctx, 0.26)},ease:"power2.out"},${pAt(ctx, 0.4)});` : "",
      // M.slam(0.14, 0.34, 1.4) about the centre.
      `tl.fromTo(".${id}-jt",{opacity:0,scale:1.4},{opacity:1,scale:1,duration:${pDu(ctx, 0.34)},ease:"power2.out"},${pAt(ctx, 0.14)});`,
      ...F.speedLineTweens(`${id}-sl`, ctx, { at: 0.1, dur: 0.3 }),
      ...impactsTweens(id, ctx, bursts),
    ],
  }, ctx, { halftone: 0.3, spotlight: true });
}

// COMBOS (206-224) — the combination being thrown: a left column at 96,180 with the headline at
// Anton 128 and a stack of skewX(-8) TAG CHIPS slamming in from 1.5 one at a time, the PHONE at
// right 200 / top 150 (360x760, the film's only portrait mount) slamming from 1.5 about its
// bottom edge, and a size-70 burst punctuating each chip.
//
// Our port replaced the chip stack with the kit's full-width ruled rows and dropped the phone
// entirely — the beat read as an agenda slide. The picture is required here: without it the
// right half is empty, and "the reference layout minus its picture" is exactly what the second
// law forbids, so a short beat routes to K.statement instead.
function sCombos(scene, ctx, shots) {
  const { id, th } = ctx;
  const shot = (shots || [])[0] || null;
  const chips = K.bullets(scene, 3);
  if (!shot || chips.length < 2) return wrap(K.statement(scene, ctx), ctx, { halftone: 0.35, spotlight: false });
  const head = K.fitLines(scene.headline || scene.title || "", U(900) / K.camSafe(), U(128), 3, th.adv);
  const bursts = chips.map((c, i) => ({ cx: 760, cy: 340 + i * 150, size: 70, at: 0.36 + i * 0.12 }));

  return wrap({
    html: `
    ${impactsHtml(id, th, bursts)}
    <div style="position:absolute;left:${r(U(96))}cqw;top:${r(U(180))}cqw;width:${r(U(900))}cqw;z-index:6;">
      <div class="${id}-hd" style="font-family:${th.displayStack};font-size:${r(head.size)}cqw;line-height:0.86;text-transform:uppercase;color:${th.ink};transform-origin:left center;opacity:0;">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
      <div style="margin-top:${r(U(34))}cqw;display:flex;flex-direction:column;align-items:flex-start;gap:${r(U(20))}cqw;">
        ${chips.map((c, i) => F.tagChip(th, `${id}-tag${i}`, { n: K.pad2(i + 1), text: K.clampWords(String(c), 34).toUpperCase() })).join("")}
      </div>
    </div>
    <div class="${id}-ph" style="position:absolute;right:${r(U(200))}cqw;top:${r(U(150))}cqw;width:${r(U(360))}cqw;height:${r(U(760))}cqw;transform-origin:center bottom;opacity:0;z-index:5;">
      ${F.phone(th, K.shotFill(shot, { bg: th.panel, w: 360, h: 760 }))}
    </div>`,
    s: [
      `tl.fromTo(".${id}-hd",{opacity:0,scale:1.5},{opacity:1,scale:1,duration:${pDu(ctx, 0.3)},ease:"power2.out"},${pAt(ctx, 0.06)});`,
      `tl.fromTo(".${id}-ph",{opacity:0,scale:1.5},{opacity:1,scale:1,duration:${pDu(ctx, 0.34)},ease:"power2.out"},${pAt(ctx, 0.16)});`,
      // M.slam(0.34 + i*0.12, 0.26, 1.5) — each chip thrown as its own strike.
      ...chips.map((c, i) => `tl.fromTo(".${id}-tag${i}",{opacity:0,scale:1.5},{opacity:1,scale:1,duration:${pDu(ctx, 0.26)},ease:"power2.out"},${pAt(ctx, 0.34 + i * 0.12)});`),
      ...impactsTweens(id, ctx, bursts),
    ],
  }, ctx, { halftone: 0.35, spotlight: false });
}

// SCORECARD (226-248) — the judges' card, and the beat the port cut in half: three 280px
// skewX(-6) stat plates on the LEFT at 96,430 AND three skewX(-12) HEALTH BARS on the right at
// 110,430 (width 620). Our port drew a centred banner and one centred row of plates, so half the
// frame was empty and the headline had to shrink to span a measure the reference never asked it
// to span.
//
// WHERE THE METER FRACTIONS COME FROM. The reference hardcodes `bars` (0.94 / 0.86 / 0.99), and
// a KEYFRAME storyboard has no equivalent field — printing an invented percentage beside a
// label would be the proof-card defect the agent audit closed. So each meter is driven by the
// SAME figure its plate prints: the fill is that figure's magnitude on a log scale relative to
// the largest of the three, and the number at the right of the bar is the figure's own literal
// value. Nothing is claimed that the script does not already say; the bars rank the film's own
// numbers rather than scoring them.
const MAG = { k: 1e3, m: 1e6, b: 1e9 };
function magnitudeOf(st) {
  const n = Number(String(st.v).replace(/,/g, "")) || 0;
  const suf = String(st.suffix || "").toLowerCase().replace("+", "");
  return Math.max(0, n * (MAG[suf] || 1));
}
function meterFracs(stats) {
  const w = stats.map((st) => Math.log10(1 + magnitudeOf(st)));
  const max = Math.max(1e-6, ...w);
  // A 0.42 floor so the smallest figure still reads as a meter rather than as a stub.
  return w.map((x) => 0.42 + 0.58 * (x / max));
}

function sScorecard(scene, ctx) {
  const { id, th } = ctx;
  const stats = K.numbersIn(scene, 3);
  if (stats.length < 2) return wrap(K.statement(scene, ctx), ctx, { halftone: 0.3, spotlight: false });
  // The measure is the LEFT REGION, not the frame: the meter column starts at right:110, so the
  // headline has 96 -> 1190 to live in. Measuring against the full 1560 is what forced the old
  // port's centred single line down to U(86) against a reference ceiling of 120.
  const head = K.fitLines(scene.headline || scene.title || "", U(1090) / K.camSafe(), U(120), 2, th.adv);
  const fracs = meterFracs(stats);
  // The reference's own cue windows overrun the beat for the second and third card
  // (0.34+0.1i for 0.5, and 0.4+0.1i for 0.6, both ending past progress 1.0), which leaves the
  // last meter frozen part-filled at the cut — a judges' meter that never reaches its mark reads
  // as a stalled render rather than as a verdict. Each window is clamped to land by 0.98.
  const fit = (start, want) => Math.max(0.14, Math.min(want, 0.98 - start));

  return wrap({
    html: `
    <div class="${id}-hd" style="position:absolute;left:${r(U(96))}cqw;top:${r(U(170))}cqw;width:${r(U(1090))}cqw;font-family:${th.displayStack};font-size:${r(head.size)}cqw;line-height:0.86;text-transform:uppercase;color:${th.ink};transform-origin:left center;opacity:0;z-index:6;">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
    <div style="position:absolute;left:${r(U(96))}cqw;top:${r(U(430))}cqw;display:flex;gap:${r(U(26))}cqw;z-index:6;">
      ${stats.map((st, i) => F.statPlate(th, `${id}-c${i}`, { nCls: `${id}-n${i}`, suffix: st.suffix, label: K.statLabel(scene, i) })).join("")}
    </div>
    <div style="position:absolute;right:${r(U(110))}cqw;top:${r(U(430))}cqw;width:${r(U(620))}cqw;z-index:6;">
      ${stats.map((st, i) => F.healthBar(th, `${id}-b${i}`, { label: K.statLabel(scene, i), value: `${st.v}${st.suffix}`, frac: fracs[i] })).join("")}
    </div>`,
    s: [
      `tl.fromTo(".${id}-hd",{opacity:0,scale:1.5},{opacity:1,scale:1,duration:${pDu(ctx, 0.3)},ease:"power2.out"},${pAt(ctx, 0.06)});`,
      ...stats.flatMap((st, i) => {
        const num = Number(String(st.v).replace(/,/g, "")) || 0;
        const dp = String(st.v).includes(".") ? 1 : 0;
        return [
          // M.pop(0.3 + i*0.1, 0.34, 0.5)
          `tl.fromTo(".${id}-c${i}",{opacity:0,scale:0.5},{opacity:1,scale:1,duration:${pDu(ctx, 0.34)},ease:"back.out(1.7)"},${pAt(ctx, 0.3 + i * 0.1)});`,
          // The figure lands EARLY — every frame before it does prints a number the script never
          // claimed, and this film is frame-sampled by review. Counter ease is the reference's
          // easeOutExpo.
          `tl.fromTo(".${id}-n${i}",{innerText:0},{innerText:${num},duration:${pDu(ctx, fit(0.34 + i * 0.1, 0.5))},ease:"expo.out",snap:{innerText:${dp ? 0.1 : 1}},onUpdate:function(){var e=document.querySelector(".${id}-n${i}");if(e)e.textContent=Number(e.textContent).toFixed(${dp});}},${pAt(ctx, 0.34 + i * 0.1)});`,
          // M.draw(0.4 + i*0.1, 0.6, easeInOutCubic) — the meter filling under the judges' hand.
          `tl.fromTo(".${id}-b${i}",{opacity:0,y:"${r(U(16))}cqw"},{opacity:1,y:0,duration:${pDu(ctx, 0.24)},ease:"power2.out"},${pAt(ctx, 0.36 + i * 0.1)});`,
          `tl.fromTo(".${id}-b${i}-f",{scaleX:0},{scaleX:1,duration:${pDu(ctx, fit(0.4 + i * 0.1, 0.6))},ease:"power2.inOut"},${pAt(ctx, 0.4 + i * 0.1)});`,
        ];
      }),
    ],
  }, ctx, { halftone: 0.3, spotlight: false });
}

// STEP IN THE RING (250-271) — the close, and it stays IN THE ARENA: spotlight, halftone and
// ropes over the near-black ground, a centred 45deg gold-keylined logo DIAMOND, the headline at
// Anton 190 with a 50px accent bloom, and a pill row of an accent-filled skewX(-8) Anton 36 CTA
// beside the url in gold Oswald 600/24/0.14em. A KO burst at 360,620 and gold speed lines.
//
// Our port flooded the frame with flat accent and inverted the pill — the KEYFRAME house CTA
// pattern — so the film ended outside the ring it had spent seventeen seconds building.
function sStepIn(scene, ctx, logo) {
  const { id, th } = ctx;
  // 190px is the reference ceiling (fight-film.jsx:261); the measure is the frame less the
  // column's own 120px gutters.
  const head = K.fitLines(scene.headline || scene.emphasis || ctx.title, U(1680) / K.camSafe(), U(190), 3, th.adv);
  const action = K.clampWords(String(scene.emphasis || ""), 20) || String(ctx.S.go);
  const hasMark = !!(logo && logo.path);
  const bursts = [{ cx: 360, cy: 620, size: 150, at: 0.14, label: String(ctx.S.ko) }];

  return wrap({
    html: `
    ${F.speedLines(`${id}-sl`, th, th.gold)}
    ${impactsHtml(id, th, bursts)}
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 ${r(U(120))}cqw;z-index:6;">
      ${hasMark ? F.logoDiamond(th, `${id}-logo`, logo.path) : ""}
      <div class="${id}-hd" style="width:100%;text-align:center;font-family:${th.displayStack};font-size:${r(head.size)}cqw;line-height:0.84;text-transform:uppercase;color:${th.ink};text-shadow:0 0 ${r(U(50))}cqw ${rgba(th.accent, 0.5)};transform-origin:center center;opacity:0;">
        ${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}
      </div>
      <div class="${id}-pill" style="margin-top:${r(U(44))}cqw;display:flex;align-items:center;gap:${r(U(24))}cqw;opacity:0;">
        <span style="display:inline-flex;align-items:center;padding:${r(U(20))}cqw ${r(U(46))}cqw;background:${th.accent};color:${th.inkOnAccent};transform:skewX(-8deg);box-shadow:0 0 ${r(U(50))}cqw ${rgba(th.accent, 0.5)};font-family:${th.displayStack};font-size:${r(K.fitOne(action, U(440), U(36), th.adv))}cqw;text-transform:uppercase;white-space:nowrap;">
          <span style="display:inline-block;transform:skewX(8deg);">${esc(action)} &#9733;</span>
        </span>
        <span style="font-family:${th.condStack};font-weight:600;font-size:${r(U(24))}cqw;letter-spacing:0.14em;text-transform:uppercase;color:${th.gold};white-space:nowrap;">${esc(ctx.url)}</span>
      </div>
    </div>`,
    s: [
      // M.pop(0.22, 0.4, 0.4) on the diamond, M.slam(0.12, 0.32, 1.6) on the headline,
      // M.pop(0.42, 0.36, 0.5) on the pill row.
      hasMark ? `tl.fromTo(".${id}-logo",{opacity:0,scale:0.4},{opacity:1,scale:1,duration:${pDu(ctx, 0.4)},ease:"back.out(1.7)"},${pAt(ctx, 0.22)});` : "",
      `tl.fromTo(".${id}-hd",{opacity:0,scale:1.6},{opacity:1,scale:1,duration:${pDu(ctx, 0.32)},ease:"power2.out"},${pAt(ctx, 0.12)});`,
      `tl.fromTo(".${id}-pill",{opacity:0,scale:0.5},{opacity:1,scale:1,duration:${pDu(ctx, 0.36)},ease:"back.out(1.7)"},${pAt(ctx, 0.42)});`,
      ...F.speedLineTweens(`${id}-sl`, ctx, { at: 0.1, dur: 0.32 }),
      ...impactsTweens(id, ctx, bursts),
    ],
  }, ctx, { halftone: 0.35, spotlight: true });
}

// ---- spine -------------------------------------------------------------------
// THE REFERENCE'S SIX ROLES AND NO OTHERS. The previous spine carried a seventh, `tape` — two
// ±3deg fighter cards flanking a struck VS — which the reference does not contain: its VS is a
// 460px GHOST behind the Challenger's copy, a background texture and never a foreground graphic.
// It sat in the middle rotation competing for beats with the two layouts it was collapsed from.
//
// MEDIA LIVES WHERE THE REFERENCE PUTS IT: the jumbotron on `champion` (900x560), the phone on
// `combos` (360x760 — the film's only portrait target, and the reason a portrait capture in the
// asset pool now has a slot whose ratio it can win), and the mark on the close. `main`,
// `challenger` and `card` are pictureless BY DESIGN — they carry the poster, the ghost VS and
// the scorecard instead, so none of them is a bare frame.
const SPEC = {
  first: "main", last: "stepin",
  middle: ["challenger", "champion", "combos", "card"],
  shapes: {
    main: [], challenger: [], champion: [900 / 560], combos: [360 / 760],
    card: [], stepin: [], statement: [], "statement-c": [],
  },
  slots: (role) => (role === "champion" || role === "combos" ? 1 : 0),
  needs: (role) => (role === "champion" || role === "combos" ? 1 : 0),
  carry: (role, scene, budget) => {
    // Roles are picked by a ROTATING cursor, not by priority. `card` is the only layout that
    // prints figures AS figures, so every other role declines a beat carrying two or more.
    const isStats = K.numbersIn(scene).length >= 2;
    if (role === "card") return isStats;
    if (isStats) return false;
    if (role === "champion") return budget >= 1;
    if (role === "combos") return budget >= 1 && K.bullets(scene, 3).length >= 2;
    if (role === "challenger") return K.wordsOf(scene.emphasis || scene.headline || "").length >= 2;
    return true;
  },
};
const BUILDERS = {
  main: sMainEvent, challenger: sChallenger, champion: sChampion,
  combos: sCombos, card: sScorecard, stepin: sStepIn,
  // The pictureless fallbacks keep the arena, the frame camera and the chrome — dropping them
  // would leave a beat with no ground, no shake and the kit HUD.
  statement: (sc, ctx) => wrap(K.statement(sc, ctx), ctx, { halftone: 0.5, spotlight: false }),
  "statement-c": (sc, ctx) => wrap(K.statement(sc, ctx, { centred: true }), ctx, { halftone: 0.35, spotlight: true }),
};
// The reference's own chrome labels (fight-film.jsx:152, 171, 190, 212, 232, 257) — a beat
// label, never a scene number.
const LABELS = {
  main: STRINGS.main, challenger: STRINGS.challenger, champion: STRINGS.champion,
  combos: STRINGS.combos, card: STRINGS.card, stepin: STRINGS.mainCard,
  statement: STRINGS.mainCard, "statement-c": STRINGS.mainCard,
};

const css = (th) => K.baseCss(th, STAGE, `
  #cap-pill { border:1px solid ${rgba(th.gold, 0.4)}; }`);

function buildComposition(opts = {}) {
  return K.buildFilm({
    ...opts, stage: STAGE, theme, STRINGS, spec: SPEC, builders: BUILDERS, labels: LABELS,
    css,
    // The reference is six beats totalling 19.3s — a 3.2s mean, with the opener the SHORTEST of
    // the six. A fight card is paced short and hard, so `refBeat` is that mean: at 4.2 every
    // entrance ran at k=0.76 of its authored speed on a storyboard cut to the reference's own
    // durations.
    refBeat: 3.2,
    // The frame carries its own punch (fight_furniture.frameTweens); the shared drift stays at
    // the kit's default 1.03 so K.camSafe() — the divisor every measured line uses — is honest.
    camera: { push: 200, scale: 1.03 },
    signature: "kinetic", fallbackBrand: "MAIN EVENT",
  });
}

module.exports = { buildComposition, STRINGS };
module.exports.__test = { SPEC, BUILDERS, theme, STAGE, meterFracs };
