// MOMENTUM — a kinetic-velocity film. Native GSAP + DOM, built on om_port_kit.
//
// PROVENANCE. REBUILT 4 Aug 2026 against the readable reference source at
// templete-design/all-template-handoffs/Momentum/src/momentum-film.jsx (1920x1080, 8 scenes,
// ~19.9s, SCENE_MAP = Intro/Statement/Feature/Mobile/Stats/Quote/Gallery/CTA).
//
// WHY A REBUILD AND NOT A PATCH. The first port was derived from the gzip+base64 bundle and
// approximated the design. It dropped TWO scenes outright (Mobile, Quote), replaced the
// reference's locked forward-rail HUD with speed rules, moved the marquee from the top ticker
// into a mid-frame band, set Stats on the dark ground instead of flooding it with accent, and
// turned the centred Intro and CTA compositions into left-aligned ones. Every geometry number
// below is transcribed from the reference and converted with U(px) = px/1920*100.
//
// WHAT IS DELIBERATELY NOT COPIED. The reference is React over its own timeline engine; this
// renders through the HyperFrames contract (ONE paused GSAP timeline the renderer SEEKS per
// frame). So the RUNTIME is re-expressed while the numbers are preserved. Its per-scene camera
// rig (zoom/whip indexed by scene) becomes the kit's camera, and its hard-coded demo copy is
// replaced by the storyboard's own words — none of the reference's copy ships.
//
// THE LOOK. Near-black warm ground, cream ink, one hot vermilion. A dot grid drifts under a
// LOCKED HUD — corner crop marks, a top ticker, a blinking status light and a bottom rail —
// like graphics composited over live footage.
//
// FONT SUBSTITUTION: none — the reference's own Hanken Grotesk + Space Mono are bundled.
// ─────────────────────────────────────────────────────────────────────────────────────

const K = require("./om_port_kit");
const { r, esc, rgba } = K;

const STAGE = K.stageOf(1920, 1080);
const { U } = STAGE;

const GROUND = "#131210", INK = "#F5F2EA", ACCENT = "#FF4B2B";
// FONTS: the reference's own Hanken Grotesk + Space Mono, both bundled.
const DISPLAY = "Hanken Grotesk", MONO = "Space Mono";

const STRINGS = {
  intro: "NOW LAUNCHING", statement: "MANIFESTO", feature: "FEATURE // 01",
  mobile: "FEATURE // 02", stats: "BY THE NUMBERS", quote: "TESTIMONIAL",
  gallery: "SHOWCASE", cta: "GET STARTED",
  scene: "BEAT", of: "OF", go: "START FREE", runtime: "RUNTIME",
};

function theme(brandSkin) {
  const { accent, resolvedBrand } = K.resolveAccent(brandSkin, { ground: GROUND, isDark: true, packAccent: ACCENT });
  return {
    accent, bg: GROUND, panel: "#1C1A17", ink: INK, sub: rgba(INK, 0.56), line: rgba(INK, 0.14),
    trail: K.spin(accent, 28, 0.06),
    adv: K.ADVANCE.mixed,
    capBg: "#1C1A17", capInk: INK,
    ...K.fontStacks(DISPLAY, MONO),
    resolvedBrand,
  };
}

// ---- furniture ---------------------------------------------------------------
const M = U(96);                       // the reference's rail margin
const COL = U(1920) - M * 2;

// The MOVING layer: a drifting dot grid under a vignette. Reference GridBG is a 46px radial-dot
// field at 1.3px drifting 22px/s; Vignette is radial 120%/90% at 50%/42%.
function ground(id, th) {
  return `<div style="position:absolute;inset:0;background:${th.bg};overflow:hidden;">
    <div class="${id}-grid" style="position:absolute;inset:${r(-U(46))}cqw;opacity:0.5;background-image:radial-gradient(${rgba(th.ink, 0.5)} ${r(U(1.3))}cqw, transparent ${r(U(1.3))}cqw);background-size:${r(U(46))}cqw ${r(U(46))}cqw;"></div>
    <div style="position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 42%, transparent 40%, ${rgba(th.bg, 0.85)} 100%);"></div>
  </div>`;
}
const groundTweens = (id, ctx) => [
  `tl.to(".${id}-grid",{x:"${r(-U(46))}cqw",y:"${r(-U(18.4))}cqw",duration:${r(46 / 22)},ease:"none",repeat:${K.reps(ctx.L, 46 / 22)}},${r(ctx.T)});`,
];

// The LOCKED HUD — crop marks, top ticker, status light, bottom rail. It lives OUTSIDE the
// camera layer, so it stays pin-sharp while the shot moves under it. This is the pack's
// signature and the first port had none of it.
function hud(ctx, label, over) {
  const th = over || ctx.th;
  const { id } = ctx;
  const arm = U(46), thick = U(3), c = rgba(th.ink, 0.5);
  const corner = (v, h) => `<div style="position:absolute;${v}:0;${h}:0;width:${r(arm)}cqw;height:${r(arm)}cqw;">
      <div style="position:absolute;${v}:0;${h}:0;width:${r(arm)}cqw;height:${r(thick)}cqw;background:${c};"></div>
      <div style="position:absolute;${v}:0;${h}:0;width:${r(thick)}cqw;height:${r(arm)}cqw;background:${c};"></div>
    </div>`;
  const strip = new Array(8).fill(`${ctx.brand}  ◆  ${ctx.url}`).join("     ◆     ");
  return `<div class="om-chrome">
    <div style="position:absolute;inset:${r(U(54))}cqw;">${corner("top", "left")}${corner("top", "right")}${corner("bottom", "left")}${corner("bottom", "right")}</div>
    <div style="position:absolute;top:${r(U(24))}cqw;left:0;right:0;height:${r(U(22))}cqw;overflow:hidden;display:flex;align-items:center;">
      <div class="${id}-tick" style="white-space:nowrap;font-family:${th.monoStack};font-size:${r(U(13))}cqw;letter-spacing:0.24em;color:${rgba(th.ink, 0.32)};text-transform:uppercase;">${esc(strip)}   ${esc(strip)}</div>
    </div>
    <div style="position:absolute;left:${r(M)}cqw;top:${r(U(60))}cqw;display:flex;align-items:center;gap:${r(U(10))}cqw;font-family:${th.monoStack};font-size:${r(U(14))}cqw;letter-spacing:0.22em;color:${rgba(th.ink, 0.65)};text-transform:uppercase;white-space:nowrap;">
      <span class="${id}-led" style="width:${r(U(9))}cqw;height:${r(U(9))}cqw;border-radius:50%;background:${th.accent};box-shadow:0 0 ${r(U(10))}cqw ${th.accent};flex:0 0 auto;"></span>${esc(String(label || "").slice(0, 28))}
    </div>
    <div style="position:absolute;left:${r(M)}cqw;bottom:${r(U(90))}cqw;font-family:${th.monoStack};font-size:${r(U(14))}cqw;letter-spacing:0.2em;color:${rgba(th.ink, 0.6)};white-space:nowrap;">${esc(ctx.brand)}</div>
    <div style="position:absolute;right:${r(M)}cqw;bottom:${r(U(90))}cqw;font-family:${th.monoStack};font-size:${r(U(14))}cqw;letter-spacing:0.2em;color:${rgba(th.ink, 0.6)};white-space:nowrap;">${esc(ctx.brand)} <span style="color:${th.accent};">▸</span> ${esc(ctx.S.runtime)}</div>
    <div style="position:absolute;left:${r(M)}cqw;right:${r(M)}cqw;bottom:${r(U(72))}cqw;height:${r(U(2))}cqw;background:${rgba(th.ink, 0.12)};overflow:hidden;">
      <div class="${id}-prog" style="width:100%;height:100%;background:${th.accent};transform:scaleX(0);transform-origin:left center;"></div>
    </div>
  </div>`;
}
const hudTweens = (id, ctx) => [
  // 90px/s ticker scroll; the status light blinks off the clock (reference: sin(t*6) > -0.3).
  `tl.to(".${id}-tick",{x:"${r(-U(1000))}cqw",duration:${r(1000 / 90)},ease:"none",repeat:${K.reps(ctx.L, 1000 / 90)}},${r(ctx.T)});`,
  `tl.to(".${id}-led",{opacity:0.3,duration:0.18,ease:"steps(1)",repeat:${K.reps(ctx.L, 0.52)},yoyo:true},${r(ctx.T)});`,
];

// Pumping chevrons »»» — reference Chevrons.
function chevrons(id, th, { x, y, n = 3, size = U(26), dir = 1 }) {
  return `<div style="position:absolute;left:${r(x)}cqw;top:${r(y)}cqw;display:flex;gap:${r(size * 0.22)}cqw;${dir < 0 ? "scale:-1 1;" : ""}">
    ${Array.from({ length: n }, (_, i) => `<span class="${id}-cv" style="display:block;width:${r(size * 0.5)}cqw;height:${r(size * 0.5)}cqw;border-right:${r(size * 0.16)}cqw solid ${th.accent};border-bottom:${r(size * 0.16)}cqw solid ${th.accent};rotate:-45deg;opacity:${r(0.9 - i * 0.22)};"></span>`).join("")}
  </div>`;
}
const chevronTweens = (id, ctx) =>
  [`tl.to(".${id}-cv",{x:"${r(U(10))}cqw",duration:0.6,ease:"sine.inOut",repeat:${K.reps(ctx.L, 0.6)},yoyo:true,stagger:0.08},${r(ctx.T)});`];

// A chip with a leading accent dot — reference chip: 10/16 padding, 999 radius, MONO 14, 0.1em.
const chip = (th, t) =>
  `<span class="chip" style="display:inline-flex;align-items:center;gap:${r(U(8))}cqw;padding:${r(U(10))}cqw ${r(U(16))}cqw;border-radius:${r(U(999))}cqw;border:1px solid ${rgba(th.accent, 0.5)};background:${rgba(th.ink, 0.05)};font-family:${th.monoStack};font-size:${r(U(14))}cqw;letter-spacing:0.1em;color:${th.ink};white-space:nowrap;opacity:0;">
    <span style="width:${r(U(7))}cqw;height:${r(U(7))}cqw;border-radius:50%;background:${th.accent};flex:0 0 auto;"></span>${esc(t)}</span>`;

const eyebrow = (th, t, size = U(17)) =>
  `<div style="font-family:${th.monoStack};font-size:${r(size)}cqw;letter-spacing:0.24em;color:${th.accent};text-transform:uppercase;">${esc(t)}</div>`;

// Browser chrome — reference BrowserFrame: 16 radius, 46 bar, three lights, url pill.
function browser(th, { cls, x, y, w, h, url, shot }) {
  return `<div class="${cls}" style="position:absolute;left:${r(x)}cqw;top:${r(y)}cqw;width:${r(w)}cqw;height:${r(h)}cqw;border-radius:${r(U(16))}cqw;overflow:hidden;background:#0c0b0a;border:1px solid ${rgba(th.ink, 0.14)};box-shadow:0 ${r(U(40))}cqw ${r(U(90))}cqw ${rgba("#000000", 0.55)};display:flex;flex-direction:column;opacity:0;">
    <div style="height:${r(U(46))}cqw;flex:0 0 auto;background:${rgba(th.ink, 0.06)};display:flex;align-items:center;gap:${r(U(8))}cqw;padding:0 ${r(U(18))}cqw;">
      ${["#FF5F57", "#FEBC2E", "#28C840"].map((c) => `<span style="width:${r(U(12))}cqw;height:${r(U(12))}cqw;border-radius:50%;background:${c};flex:0 0 auto;"></span>`).join("")}
      <div style="margin-left:${r(U(14))}cqw;flex:1 1 auto;max-width:${r(U(380))}cqw;height:${r(U(24))}cqw;border-radius:${r(U(12))}cqw;background:${rgba(th.ink, 0.08)};display:flex;align-items:center;padding:0 ${r(U(14))}cqw;box-sizing:border-box;font-family:${th.monoStack};font-size:${r(U(12))}cqw;color:${rgba(th.ink, 0.5)};letter-spacing:0.06em;overflow:hidden;white-space:nowrap;">${esc(url)}</div>
    </div>
    <div style="flex:1 1 auto;min-height:0;">${K.shotFill(shot, { bg: th.panel })}</div>
  </div>`;
}

// Phone bezel — reference PhoneFrame: 42 radius, 12 padding, 96x22 notch.
function phone(th, { cls, x, y, w, h, shot }) {
  return `<div class="${cls}" style="position:absolute;left:${r(x)}cqw;top:${r(y)}cqw;width:${r(w)}cqw;height:${r(h)}cqw;border-radius:${r(U(42))}cqw;padding:${r(U(12))}cqw;box-sizing:border-box;background:#0a0908;border:${r(U(2))}cqw solid ${rgba(th.ink, 0.16)};box-shadow:0 ${r(U(40))}cqw ${r(U(90))}cqw ${rgba("#000000", 0.6)};opacity:0;">
    <div style="position:absolute;top:${r(U(22))}cqw;left:50%;translate:-50% 0;width:${r(U(96))}cqw;height:${r(U(22))}cqw;border-radius:${r(U(22))}cqw;background:#0a0908;z-index:2;"></div>
    <div style="width:100%;height:100%;border-radius:${r(U(32))}cqw;overflow:hidden;background:#151311;">${K.shotFill(shot, { bg: th.panel })}</div>
  </div>`;
}

// ---- scenes ------------------------------------------------------------------
// INTRO — the centred lockup: a rotating dashed ring around the logo plate, the brand word at
// 150px and a tracked tagline beneath. Reference Intro.
function sIntro(scene, ctx, _shots, logo) {
  const { id, th, at, du } = ctx;
  const R = U(150);
  // Reference Intro is a BRAND lockup — not the beat emphasis.
  const word = K.clampWords(String(ctx.brand || scene.emphasis || ctx.title || ""), 30);
  const size = K.fitOne(word, COL / K.camSafe(), U(150), th.adv);
  // Word-boundary clamp, not a bare slice: at 46 chars a normal one-line subtitle lost its
  // last word and the poster read "ART-DIRECTED END TO". The tag is one mono line at U(22)
  // with 0.28em tracking — about 19 authored px per character — so the column takes ~80.
  const tag = K.clampWords(String(scene.subtext || scene.kicker || "").trim(), 72);
  const hasMark = !!(logo && logo.path);
  return {
    backdrop: ground(id, th),
    chrome: hud(ctx, scene.kicker || STRINGS.intro),
    html: `
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;">
      <div style="position:relative;display:grid;place-items:center;margin-bottom:${r(U(40))}cqw;">
        <svg class="${id}-ring" width="${r(R * 2 + U(40))}cqw" height="${r(R * 2 + U(40))}cqw" viewBox="0 0 340 340" style="position:absolute;overflow:visible;">
          <circle cx="170" cy="170" r="150" fill="none" stroke="${rgba(th.accent, 0.9)}" stroke-width="2" stroke-linecap="round" stroke-dasharray="150 84"></circle>
        </svg>
        <div class="${id}-plate" style="width:${r(U(210))}cqw;height:${r(U(210))}cqw;border-radius:${r(U(30))}cqw;background:${rgba(th.ink, 0.05)};border:1px solid ${rgba(th.ink, 0.16)};display:grid;place-items:center;overflow:hidden;padding:${r(U(30))}cqw;box-sizing:border-box;opacity:0;">
          ${hasMark ? `<img src="${esc(logo.path)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain;">` : `<span style="font-family:${th.displayStack};font-weight:900;font-size:${r(U(96))}cqw;color:${th.accent};line-height:1;">${esc((ctx.brand || "M").trim().charAt(0).toUpperCase())}</span>`}
        </div>
      </div>
      <div class="${id}-brand" style="font-family:${th.displayStack};font-weight:900;font-size:${r(size)}cqw;letter-spacing:-0.05em;color:${th.ink};text-transform:uppercase;line-height:0.9;opacity:0;white-space:nowrap;">${esc(word)}</div>
      ${tag ? `<div class="${id}-tag" style="margin-top:${r(U(18))}cqw;font-family:${th.monoStack};font-size:${r(U(22))}cqw;letter-spacing:0.28em;color:${th.accent};text-transform:uppercase;opacity:0;">${esc(tag)}</div>` : ""}
    </div>
    ${chevrons(id, th, { x: U(300), y: U(470), n: 3, size: U(30) })}
    ${chevrons(id, th, { x: U(1500), y: U(470), n: 3, size: U(30), dir: -1 })}`,
    s: [
      `tl.fromTo(".${id}-ring",{rotation:0},{rotation:360,duration:12,ease:"none",repeat:${K.reps(ctx.L, 12)},transformOrigin:"50% 50%"},${r(ctx.T)});`,
      `tl.fromTo(".${id}-plate",{opacity:0,scale:0.3},{opacity:1,scale:1,duration:${du(0.42)},ease:"back.out(1.8)"},${at(0.1)});`,
      `tl.fromTo(".${id}-brand",{opacity:0,y:"${r(U(70))}cqw"},{opacity:1,y:0,duration:${du(0.24)},ease:"back.out(1.7)"},${at(0.34)});`,
      tag ? `tl.fromTo(".${id}-tag",{opacity:0,y:"${r(U(40))}cqw"},{opacity:1,y:0,duration:${du(0.22)},ease:"back.out(1.7)"},${at(0.46)});` : "",
      ...chevronTweens(id, ctx),
      ...groundTweens(id, ctx),
      ...hudTweens(id, ctx),
    ].filter(Boolean),
  };
}

// STATEMENT — the manifesto: stacked lines at 158px against a giant ghosted index number, with
// one line set in accent behind a solid block. Reference Statement.
function sStatement(scene, ctx) {
  const { id, th, at, du } = ctx;
  const text = String(scene.emphasis || scene.headline || scene.title || "");
  const words = K.wordsOf(text).slice(0, 6);
  if (!words.length) return { ...K.statement(scene, ctx), backdrop: ground(id, th), chrome: hud(ctx, scene.kicker || STRINGS.statement) };
  // The reference stacks four SHORT lines. Pairing the words keeps that stacked rhythm while
  // letting a longer script headline still set big.
  const lines = [];
  for (let i = 0; i < words.length; i += 2) lines.push(words.slice(i, i + 2).join(" "));
  const longest = lines.reduce((a, l) => Math.max(a, l.length), 1);
  const size = Math.min(U(158), (((COL - U(70)) / K.camSafe()) * 0.92) / (longest * K.ADVANCE.upper));
  const accentIdx = Math.min(1, lines.length - 1);
  return {
    backdrop: ground(id, th),
    chrome: hud(ctx, scene.kicker || STRINGS.statement),
    html: `
    <div style="position:absolute;right:${r(U(90))}cqw;top:${r(U(120))}cqw;font-family:${th.displayStack};font-weight:900;font-size:${r(U(340))}cqw;line-height:0.8;color:${rgba(th.ink, 0.05)};letter-spacing:-0.05em;">/${esc(K.pad2(ctx.i + 1))}</div>
    <div style="position:absolute;left:${r(M)}cqw;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;gap:${r(U(4))}cqw;">
      ${lines.map((ln, i) => `<div class="${id}-ln" style="display:flex;align-items:center;opacity:0;">
        ${i === accentIdx ? `<span class="${id}-blk" style="display:inline-block;width:${r(U(44))}cqw;height:${r(U(44))}cqw;background:${th.accent};margin-right:${r(U(24))}cqw;flex:0 0 auto;transform:scaleX(0);transform-origin:left center;"></span>` : ""}
        <span style="font-family:${th.displayStack};font-weight:900;font-size:${r(size)}cqw;line-height:0.92;letter-spacing:-0.05em;text-transform:uppercase;color:${i === accentIdx ? th.accent : th.ink};white-space:nowrap;">${esc(ln)}</span>
      </div>`).join("")}
    </div>`,
    s: [
      `tl.fromTo(".${id}-ln",{opacity:0,y:"${r(U(90))}cqw"},{opacity:1,y:0,duration:${du(0.24)},ease:"back.out(1.7)",stagger:${du(0.09)}},${at(0.06)});`,
      `tl.fromTo(".${id}-blk",{scaleX:0},{scaleX:1,duration:${du(0.24)},ease:"expo.out"},${at(0.16)});`,
      ...groundTweens(id, ctx),
      ...hudTweens(id, ctx),
    ],
  };
}

// FEATURE — copy left, a browser flying in from the right on an overshoot then a Ken-Burns
// push. Reference Feature. Never drawn without a picture.
function sFeature(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const shot = shots[0] || null;
  if (!shot) return { ...K.statement(scene, ctx), backdrop: ground(id, th), chrome: hud(ctx, scene.kicker || STRINGS.feature) };
  const head = K.fitLines(scene.headline || scene.title || "", U(620) / K.camSafe(), U(92), 3, th.adv);
  const body = String(scene.subtext || "").trim().slice(0, 120);
  const chips = K.bullets(scene, 3).map((b) => String(b).slice(0, 22));
  return {
    backdrop: ground(id, th),
    chrome: hud(ctx, scene.kicker || STRINGS.feature),
    html: `
    <div style="position:absolute;left:${r(M)}cqw;top:${r(U(150))}cqw;width:${r(U(620))}cqw;z-index:5;">
      <div class="${id}-head" style="opacity:0;">
        <div style="margin-bottom:${r(U(18))}cqw;">${eyebrow(th, String(scene.kicker || STRINGS.feature).slice(0, 26))}</div>
        <div style="font-family:${th.displayStack};font-weight:900;font-size:${r(head.size)}cqw;line-height:0.94;letter-spacing:-0.04em;text-transform:uppercase;color:${th.ink};">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
      </div>
      ${body ? `<div class="${id}-body" style="margin-top:${r(U(26))}cqw;font-family:${th.monoStack};font-size:${r(U(18))}cqw;line-height:1.6;color:${rgba(th.ink, 0.66)};max-width:${r(U(460))}cqw;opacity:0;">${esc(body)}</div>` : ""}
      ${chips.length ? `<div style="margin-top:${r(U(30))}cqw;display:flex;gap:${r(U(12))}cqw;flex-wrap:wrap;">${chips.map((c) => chip(th, c)).join("")}</div>` : ""}
    </div>
    ${browser(th, { cls: `${id}-shot`, x: U(1920) - M - U(900), y: U(168), w: U(900), h: U(620), url: ctx.url, shot })}
    ${chevrons(id, th, { x: U(710), y: U(470), n: 4, size: U(22) })}`,
    s: [
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(50))}cqw"},{opacity:1,y:0,duration:${du(0.24)},ease:"back.out(1.7)"},${at(0.12)});`,
      body ? `tl.fromTo(".${id}-body",{opacity:0,y:"${r(U(30))}cqw"},{opacity:1,y:0,duration:${du(0.22)},ease:"back.out(1.7)"},${at(0.24)});` : "",
      `tl.to(".${id}-shot",{opacity:1,duration:${du(0.1)},ease:"none"},${at(0.06)});`,
      `tl.fromTo(".${id}-shot",{x:"${r(U(760))}cqw"},{x:0,duration:${du(0.28)},ease:"back.out(1.5)"},${at(0.06)});`,
      `tl.fromTo(".${id}-shot",{scale:1},{scale:1.05,duration:${du(0.6)},ease:"sine.inOut",transformOrigin:"right center"},${at(0.34)});`,
      chips.length ? `tl.fromTo("#${id} .chip",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:${du(0.3)},ease:"back.out(1.8)",stagger:${du(0.08)}},${at(0.4)});` : "",
      ...chevronTweens(id, ctx),
      ...groundTweens(id, ctx),
      ...hudTweens(id, ctx),
    ].filter(Boolean),
  };
}

// MOBILE — the reference's SECOND feature beat, mirrored: copy right and right-aligned, a phone
// rising 720px from below on the left. Missing from the first port entirely.
function sMobile(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const shot = shots[0] || null;
  if (!shot) return { ...K.statement(scene, ctx, { centred: true }), backdrop: ground(id, th), chrome: hud(ctx, scene.kicker || STRINGS.mobile) };
  const head = K.fitLines(scene.headline || scene.title || "", U(640) / K.camSafe(), U(96), 3, th.adv);
  const chips = K.bullets(scene, 3).map((b) => String(b).slice(0, 22));
  return {
    backdrop: ground(id, th),
    chrome: hud(ctx, scene.kicker || STRINGS.mobile),
    html: `
    <div style="position:absolute;right:${r(U(120))}cqw;top:${r(U(130))}cqw;width:${r(U(640))}cqw;z-index:5;">
      <div class="${id}-head" style="text-align:right;opacity:0;">
        <div style="margin-bottom:${r(U(18))}cqw;">${eyebrow(th, String(scene.kicker || STRINGS.mobile).slice(0, 26))}</div>
        <div style="font-family:${th.displayStack};font-weight:900;font-size:${r(head.size)}cqw;line-height:0.94;letter-spacing:-0.04em;text-transform:uppercase;color:${th.ink};">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
      </div>
      ${chips.length ? `<div style="margin-top:${r(U(30))}cqw;display:flex;gap:${r(U(12))}cqw;flex-wrap:wrap;justify-content:flex-end;">${chips.map((c) => chip(th, c)).join("")}</div>` : ""}
    </div>
    ${phone(th, { cls: `${id}-shot`, x: U(210), y: U(120), w: U(356), h: U(760), shot })}
    ${chevrons(id, th, { x: U(600), y: U(520), n: 4, size: U(22) })}`,
    s: [
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(50))}cqw"},{opacity:1,y:0,duration:${du(0.24)},ease:"back.out(1.7)"},${at(0.16)});`,
      `tl.to(".${id}-shot",{opacity:1,duration:${du(0.1)},ease:"none"},${at(0.06)});`,
      `tl.fromTo(".${id}-shot",{y:"${r(U(720))}cqw"},{y:0,duration:${du(0.3)},ease:"back.out(1.4)"},${at(0.06)});`,
      `tl.fromTo(".${id}-shot",{scale:1},{scale:1.03,duration:${du(0.6)},ease:"sine.inOut",transformOrigin:"center bottom"},${at(0.36)});`,
      chips.length ? `tl.fromTo("#${id} .chip",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:${du(0.3)},ease:"back.out(1.8)",stagger:${du(0.08)}},${at(0.42)});` : "",
      ...chevronTweens(id, ctx),
      ...groundTweens(id, ctx),
      ...hudTweens(id, ctx),
    ].filter(Boolean),
  };
}

// STATS — the reference FLOODS the ground with accent for this beat and reads dark-on-accent,
// with a seven-bar chart at the right. The first port set it on the dark ground as three plain
// columns, which lost the loudest colour moment in the film.
function sStats(scene, ctx) {
  const { id, th, at, du } = ctx;
  const stats = K.numbersIn(scene, 3);
  if (stats.length < 2) return { ...K.statement(scene, ctx, { centred: true }), backdrop: ground(id, th), chrome: hud(ctx, scene.kicker || STRINGS.stats) };
  const ink = K.inkOn(th.accent, "#141210", th.ink);
  const dim = rgba(ink, 0.62);
  const head = K.fitLines(scene.headline || scene.title || "", U(900) / K.camSafe(), U(104), 2, th.adv);
  const BARS = [0.45, 0.7, 0.55, 0.88, 1.0, 0.75, 0.92];
  return {
    // Flat accent — the reference draws no grid and no vignette on this beat.
    backdrop: `<div style="position:absolute;inset:0;background:${th.accent};"></div>`,
    chrome: hud(ctx, scene.kicker || STRINGS.stats, { ...th, ink, accent: ink }),
    capTint: ink,
    html: `
    <div style="position:absolute;right:${r(U(90))}cqw;bottom:${r(U(210))}cqw;display:flex;align-items:flex-end;gap:${r(U(18))}cqw;height:${r(U(420))}cqw;">
      ${BARS.map((h, i) => `<div class="${id}-bar" style="width:${r(U(46))}cqw;height:${r(U(420) * h)}cqw;background:${i === 4 ? ink : rgba(ink, 0.22)};transform:scaleY(0);transform-origin:bottom center;"></div>`).join("")}
    </div>
    <div style="position:absolute;left:${r(M)}cqw;top:${r(U(150))}cqw;">
      <div class="${id}-kick" style="font-family:${th.monoStack};font-size:${r(U(18))}cqw;letter-spacing:0.26em;color:${ink};text-transform:uppercase;opacity:0;">${esc(String(scene.kicker || STRINGS.stats).slice(0, 26))}</div>
      <div class="${id}-head" style="margin-top:${r(U(14))}cqw;max-width:${r(U(900))}cqw;font-family:${th.displayStack};font-weight:900;font-size:${r(head.size)}cqw;line-height:0.92;letter-spacing:-0.04em;text-transform:uppercase;color:${ink};opacity:0;">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
    </div>
    <div style="position:absolute;left:${r(M)}cqw;bottom:${r(U(190))}cqw;display:flex;gap:${r(U(90))}cqw;">
      ${stats.map((st, i) => `<div class="${id}-c${i}" style="opacity:0;">
        <div style="font-family:${th.displayStack};font-weight:900;font-size:${r(U(128))}cqw;line-height:1;letter-spacing:-0.05em;color:${ink};white-space:nowrap;"><span class="${id}-n${i}">0</span>${esc(st.suffix)}</div>
        <div style="font-family:${th.monoStack};font-size:${r(U(16))}cqw;letter-spacing:0.16em;color:${dim};margin-top:${r(U(8))}cqw;white-space:nowrap;overflow:hidden;text-transform:uppercase;">${esc(K.statLabel(scene, i))}</div>
        <div class="${id}-r${i}" style="width:${r(U(120))}cqw;height:${r(U(4))}cqw;background:${ink};margin-top:${r(U(14))}cqw;transform:scaleX(0);transform-origin:left center;"></div>
      </div>`).join("")}
    </div>`,
    s: [
      `tl.fromTo(".${id}-bar",{scaleY:0},{scaleY:1,duration:${du(0.4)},ease:"power3.out",stagger:${du(0.05)}},${at(0.1)});`,
      `tl.fromTo(".${id}-kick",{opacity:0,y:"${r(U(40))}cqw"},{opacity:1,y:0,duration:${du(0.22)},ease:"back.out(1.7)"},${at(0.06)});`,
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(60))}cqw"},{opacity:1,y:0,duration:${du(0.24)},ease:"back.out(1.7)"},${at(0.12)});`,
      ...stats.flatMap((st, i) => {
        const num = Number(String(st.v).replace(/,/g, "")) || 0;
        const dp = String(st.v).includes(".") ? 1 : 0;
        return [
          `tl.fromTo(".${id}-c${i}",{opacity:0,y:"${r(U(40))}cqw"},{opacity:1,y:0,duration:${du(0.22)},ease:"back.out(1.7)"},${at(0.34 + i * 0.1)});`,
          `tl.fromTo(".${id}-n${i}",{innerText:0},{innerText:${num},duration:${du(0.5)},ease:"power2.out",snap:{innerText:${dp ? 0.1 : 1}},onUpdate:function(){var e=document.querySelector(".${id}-n${i}");if(e)e.textContent=Number(e.textContent).toFixed(${dp});}},${at(0.34 + i * 0.1)});`,
          `tl.fromTo(".${id}-r${i}",{scaleX:0},{scaleX:1,duration:${du(0.3)},ease:"power3.out"},${at(0.4 + i * 0.1)});`,
        ];
      }),
      ...hudTweens(id, ctx),
    ],
  };
}

// QUOTE — the testimonial: a 360px quote mark, the words fading in one at a time, a ruled
// attribution. Missing from the first port entirely.
function sQuote(scene, ctx) {
  const { id, th, at, du } = ctx;
  const text = String(scene.emphasis || scene.headline || scene.title || "").trim();
  const words = K.wordsOf(text).slice(0, 22);
  if (words.length < 3) return { ...K.statement(scene, ctx), backdrop: ground(id, th), chrome: hud(ctx, scene.kicker || STRINGS.quote) };
  const run = words.join(" ");
  // Two-and-a-bit lines across the reference's 150/150 measure at its 76px setting.
  const size = Math.min(U(76), ((U(1620) / K.camSafe()) * 0.92 * 2.4) / Math.max(1, run.length * th.adv));
  const who = String(scene.subtext || "").trim().slice(0, 60);
  const author = who.includes(",") ? who.split(",")[0].trim() : who;
  const role = who.includes(",") ? who.split(",").slice(1).join(",").trim() : "";
  return {
    backdrop: ground(id, th),
    chrome: hud(ctx, scene.kicker || STRINGS.quote),
    html: `
    <div class="${id}-mark" style="position:absolute;left:${r(U(150))}cqw;top:${r(U(140))}cqw;font-family:${th.displayStack};font-weight:900;font-size:${r(U(360))}cqw;line-height:0.7;color:${rgba(th.accent, 0.9)};opacity:0;transform-origin:left top;">“</div>
    <div style="position:absolute;left:${r(U(150))}cqw;right:${r(U(150))}cqw;top:${r(U(340))}cqw;display:flex;flex-wrap:wrap;">
      ${words.map((w) => `<span class="${id}-w" style="font-family:${th.displayStack};font-weight:800;font-size:${r(size)}cqw;line-height:1.15;letter-spacing:-0.03em;color:${th.ink};margin-right:${r(U(22))}cqw;opacity:0;">${esc(w)}</span>`).join("")}
    </div>
    ${author ? `<div class="${id}-att" style="position:absolute;left:${r(U(152))}cqw;bottom:${r(U(210))}cqw;display:flex;align-items:center;gap:${r(U(20))}cqw;opacity:0;">
      <span class="${id}-rule" style="width:${r(U(64))}cqw;height:${r(U(5))}cqw;background:${th.accent};transform:scaleX(0);transform-origin:left center;flex:0 0 auto;"></span>
      <span>
        <span style="display:block;font-family:${th.displayStack};font-weight:800;font-size:${r(U(30))}cqw;color:${th.ink};letter-spacing:-0.01em;">${esc(author)}</span>
        ${role ? `<span style="display:block;font-family:${th.monoStack};font-size:${r(U(16))}cqw;letter-spacing:0.14em;color:${rgba(th.ink, 0.55)};margin-top:${r(U(4))}cqw;text-transform:uppercase;">${esc(role)}</span>` : ""}
      </span>
    </div>` : ""}`,
    s: [
      `tl.fromTo(".${id}-mark",{opacity:0,scale:0.4},{opacity:1,scale:1,duration:${du(0.4)},ease:"back.out(1.8)"},${at(0.06)});`,
      `tl.fromTo(".${id}-w",{opacity:0,y:"${r(U(22))}cqw"},{opacity:1,y:0,duration:${du(0.14)},ease:"power2.out",stagger:${du(0.028)}},${at(0.18)});`,
      author ? `tl.fromTo(".${id}-att",{opacity:0,y:"${r(U(40))}cqw"},{opacity:1,y:0,duration:${du(0.24)},ease:"back.out(1.7)"},${at(0.62)});` : "",
      author ? `tl.fromTo(".${id}-rule",{scaleX:0},{scaleX:1,duration:${du(0.24)},ease:"expo.out"},${at(0.62)});` : "",
      ...groundTweens(id, ctx),
      ...hudTweens(id, ctx),
    ].filter(Boolean),
  };
}

// GALLERY — the reference's 1.5fr/1fr two-row grid: a tall picture tile, a second picture, and
// an accent-tinted badge tile carrying a figure from the script. Fits what it has; the badge
// only draws when the script actually supplies a number.
function sGallery(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  if (!shots.length) return { ...K.statement(scene, ctx), backdrop: ground(id, th), chrome: hud(ctx, scene.kicker || STRINGS.gallery) };
  const n = Math.min(2, shots.length);
  const head = K.fitLines(scene.headline || scene.title || "", U(1000) / K.camSafe(), U(88), 2, th.adv);
  const stat = K.numbersIn(scene, 1)[0] || null;
  const GY = U(350), GH = U(560), GAP = U(22);
  const colA = (COL - GAP) * 0.6, colB = COL - GAP - colA, rowH = (GH - GAP) / 2;
  const tile = (cls, x, y, w, h, inner, border) =>
    `<div class="${cls}" style="position:absolute;left:${r(x)}cqw;top:${r(y)}cqw;width:${r(w)}cqw;height:${r(h)}cqw;border-radius:${r(U(16))}cqw;overflow:hidden;border:1px solid ${border};opacity:0;">${inner}</div>`;
  // With one picture and no figure the grid would leave a hole, so the single tile takes the
  // full width — never a drawn container standing empty.
  const soloWide = n === 1 && !stat;
  return {
    backdrop: ground(id, th),
    chrome: hud(ctx, scene.kicker || STRINGS.gallery),
    html: `
    <div class="${id}-head" style="position:absolute;left:${r(M)}cqw;top:${r(U(122))}cqw;opacity:0;">
      <div style="margin-bottom:${r(U(14))}cqw;">${eyebrow(th, String(scene.kicker || STRINGS.gallery).slice(0, 26))}</div>
      <div style="max-width:${r(U(1000))}cqw;font-family:${th.displayStack};font-weight:900;font-size:${r(head.size)}cqw;line-height:0.92;letter-spacing:-0.04em;text-transform:uppercase;color:${th.ink};">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
    </div>
    ${tile(`${id}-t0`, M, GY, soloWide ? COL : colA, GH, K.shotFill(shots[0], { bg: th.panel }), rgba(th.ink, 0.14))}
    ${n > 1 ? tile(`${id}-t1`, M + colA + GAP, GY, colB, stat ? rowH : GH, K.shotFill(shots[1], { bg: th.panel }), rgba(th.ink, 0.14)) : ""}
    ${stat ? tile(`${id}-t2`, M + colA + GAP, GY + (n > 1 ? rowH + GAP : 0), colB, n > 1 ? rowH : GH,
      `<div style="width:100%;height:100%;background:${rgba(th.accent, 0.1)};display:grid;place-items:center;text-align:center;padding:${r(U(24))}cqw;box-sizing:border-box;">
        <div>
          <div style="font-family:${th.displayStack};font-weight:900;font-size:${r(U(84))}cqw;line-height:1;color:${th.accent};letter-spacing:-0.04em;white-space:nowrap;">${esc(String(stat.v) + stat.suffix)}</div>
          <div style="font-family:${th.monoStack};font-size:${r(U(15))}cqw;letter-spacing:0.16em;color:${rgba(th.ink, 0.6)};margin-top:${r(U(8))}cqw;text-transform:uppercase;">${esc(K.statLabel(scene, 0))}</div>
        </div>
      </div>`, rgba(th.accent, 0.5)) : ""}`,
    s: [
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(50))}cqw"},{opacity:1,y:0,duration:${du(0.22)},ease:"back.out(1.7)"},${at(0.08)});`,
      `tl.fromTo(".${id}-t0",{opacity:0,x:"${r(-U(120))}cqw",y:"${r(U(40))}cqw"},{opacity:1,x:0,y:0,duration:${du(0.3)},ease:"back.out(1.6)"},${at(0.24)});`,
      n > 1 ? `tl.fromTo(".${id}-t1",{opacity:0,x:"${r(U(120))}cqw",y:"${r(U(40))}cqw"},{opacity:1,x:0,y:0,duration:${du(0.3)},ease:"back.out(1.6)"},${at(0.34)});` : "",
      stat ? `tl.fromTo(".${id}-t2",{opacity:0,x:"${r(U(120))}cqw",y:"${r(U(40))}cqw"},{opacity:1,x:0,y:0,duration:${du(0.3)},ease:"back.out(1.6)"},${at(0.44)});` : "",
      ...groundTweens(id, ctx),
      ...hudTweens(id, ctx),
    ].filter(Boolean),
  };
}

// CTA — the close: a sweeping ring, the headline at 168px centred, and the pill.
function sCTA(scene, ctx) {
  const { id, th, at, du } = ctx;
  const head = K.fitLines(scene.headline || scene.emphasis || ctx.title, U(1300) / K.camSafe(), U(168), 3, th.adv);
  const action = K.clampWords(String(scene.emphasis || ""), 22) || STRINGS.go;
  const brow = String(scene.kicker || STRINGS.cta).slice(0, 30);
  const R = U(300);
  return {
    backdrop: ground(id, th),
    chrome: hud(ctx, brow),
    html: `
    <svg class="${id}-ring" width="${r(R * 2)}cqw" height="${r(R * 2)}cqw" viewBox="0 0 600 600" style="position:absolute;left:50%;top:46%;translate:-50% -50%;overflow:visible;">
      <circle class="${id}-arc" cx="300" cy="300" r="280" fill="none" stroke="${rgba(th.accent, 0.28)}" stroke-width="2" stroke-linecap="round" stroke-dasharray="1759" stroke-dashoffset="1759" transform="rotate(-90 300 300)"></circle>
    </svg>
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;">
      <div class="${id}-brow" style="font-family:${th.monoStack};font-size:${r(U(20))}cqw;letter-spacing:0.3em;color:${th.accent};text-transform:uppercase;margin-bottom:${r(U(18))}cqw;opacity:0;">${esc(brow)}</div>
      <div class="${id}-head" style="max-width:${r(U(1300))}cqw;font-family:${th.displayStack};font-weight:900;font-size:${r(head.size)}cqw;line-height:0.88;letter-spacing:-0.05em;text-transform:uppercase;color:${th.ink};text-align:center;opacity:0;">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
      <div class="${id}-pill" style="margin-top:${r(U(44))}cqw;display:flex;align-items:center;gap:${r(U(16))}cqw;opacity:0;">
        <span style="display:inline-flex;align-items:center;gap:${r(U(14))}cqw;padding:${r(U(20))}cqw ${r(U(40))}cqw;border-radius:${r(U(999))}cqw;background:${th.accent};color:${K.inkOn(th.accent, "#141210", th.ink)};font-family:${th.displayStack};font-weight:800;font-size:${r(K.fitOne(action, U(560), U(28), th.adv))}cqw;letter-spacing:0.02em;box-shadow:0 0 ${r(U(60))}cqw ${rgba(th.accent, 0.5)};white-space:nowrap;">${esc(action)} <span style="font-size:${r(U(30))}cqw;">→</span></span>
        <span style="font-family:${th.monoStack};font-size:${r(U(20))}cqw;letter-spacing:0.14em;color:${rgba(th.ink, 0.7)};white-space:nowrap;">${esc(ctx.url)}</span>
      </div>
    </div>
    ${chevrons(id, th, { x: U(480), y: U(540), n: 4, size: U(26) })}
    ${chevrons(id, th, { x: U(1300), y: U(540), n: 4, size: U(26), dir: -1 })}`,
    s: [
      `tl.fromTo(".${id}-arc",{strokeDashoffset:1759},{strokeDashoffset:0,duration:${du(0.7)},ease:"power2.inOut"},${at(0.15)});`,
      `tl.fromTo(".${id}-brow",{opacity:0,y:"${r(U(30))}cqw"},{opacity:1,y:0,duration:${du(0.22)},ease:"back.out(1.7)"},${at(0.06)});`,
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(80))}cqw"},{opacity:1,y:0,duration:${du(0.26)},ease:"back.out(1.7)"},${at(0.1)});`,
      `tl.fromTo(".${id}-pill",{opacity:0,scale:0.5},{opacity:1,scale:1,duration:${du(0.4)},ease:"back.out(1.8)"},${at(0.4)});`,
      ...chevronTweens(id, ctx),
      ...groundTweens(id, ctx),
      ...hudTweens(id, ctx),
    ],
  };
}

// ---- spine -------------------------------------------------------------------
// Reference order: Intro · Statement · Feature · Mobile · Stats · Quote · Gallery · CTA.
const SPEC = {
  first: "intro", last: "cta",
  // DELIBERATE DEVIATION from the reference order (statement leads there). `intro` and `cta`
  // are both lockups that take no picture, so on a SHORT film the single middle slot is the
  // only chance this pack has to show one. Roles are picked by a rotating cursor, so whatever
  // sits first here wins that slot — and with `statement` first, a three-scene film placed
  // every image and drew none of them (FAIL_TEXT_ONLY: assets collected, nothing on screen).
  // Leading with `feature` costs one swap against the reference on a full eight-beat film and
  // guarantees a picture on every film shorter than that.
  middle: ["feature", "statement", "mobile", "stats", "quote", "gallery"],
  shapes: {
    intro: [], statement: [], feature: [900 / 574], mobile: [356 / 736],
    stats: [], quote: [], gallery: [1.55, 0.86], cta: [], "statement-c": [],
  },
  slots: (role, budget) => (role === "feature" || role === "mobile" ? 1 : role === "gallery" ? Math.min(2, Math.max(0, budget)) : 0),
  needs: (role) => (role === "feature" || role === "mobile" || role === "gallery" ? 1 : 0),
  // Roles are picked by a ROTATING cursor, not by priority. `stats` is the only layout that
  // prints figures AS figures, so every other role declines a beat carrying two or more
  // numbers — otherwise whichever role the cursor happens to sit on claims them.
  carry: (role, scene, budget) => {
    const isStats = K.numbersIn(scene).length >= 2;
    if (role === "stats") return isStats;
    if (isStats) return false;
    if (role === "feature" || role === "mobile" || role === "gallery") return budget >= 1;
    if (role === "quote") return K.wordsOf(scene.emphasis || scene.headline || "").length >= 3;
    if (role === "statement") return K.wordsOf(scene.emphasis || scene.headline || "").length >= 2;
    return true;
  },
};
const BUILDERS = {
  intro: sIntro, statement: sStatement, feature: sFeature, mobile: sMobile,
  stats: sStats, quote: sQuote, gallery: sGallery, cta: sCTA,
  "statement-c": (sc, ctx) => ({ ...K.statement(sc, ctx, { centred: true }), backdrop: ground(ctx.id, ctx.th), chrome: hud(ctx, ctx.label) }),
};
const LABELS = {
  intro: STRINGS.intro, statement: STRINGS.statement, feature: STRINGS.feature,
  mobile: STRINGS.mobile, stats: STRINGS.stats, quote: STRINGS.quote,
  gallery: STRINGS.gallery, cta: STRINGS.cta,
};

function buildComposition(input) {
  return K.buildFilm({
    ...input, stage: STAGE, theme, STRINGS, spec: SPEC, builders: BUILDERS, labels: LABELS,
    refBeat: 2.5,                       // the reference runs 8 scenes in ~19.9s
    camera: { push: 0.035, drift: 0.012 },
    signature: "kinetic",
    fallbackBrand: "MOMENTUM",
  });
}

module.exports = { buildComposition };
