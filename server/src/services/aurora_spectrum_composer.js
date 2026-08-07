// AURORA SPECTRUM — a living-gradient system. Native GSAP + DOM, built on om_port_kit.
//
// PROVENANCE. NOT a port: no Claude Design reference exists for this pack. Written from its own
// manifest, frames/aurora-spectrum/pack.json — the third of the ten packs that
// scripts/test-pack-composers.js found rendering through the GENERIC scene kit.
//
//   "A Stripe/Linear/Vercel-tier living-gradient system: deep-space indigo grounds lit by large, soft,
//    slowly-drifting multi-stop aurora blobs. Gradient-CLIP headlines, frosted 5%-white micro-cards,
//    soft light everywhere, zero hard shadow."
//
// THE RULES, from that brief:
//   1. THE GROUND IS LIT, NOT PAINTED. Aurora blobs in five hues drift across a deep indigo field.
//      They are the pack's light source and they never stop moving.
//   2. GRADIENT-CLIP HEADLINES. Display type is filled by the spectrum itself (`background-clip:text`),
//      not by a flat colour. `textfx.emphasis: "gradient"` is the headline, not an accent on it.
//   3. ZERO HARD SHADOW. Depth comes from light: frosted 5%-white fills and hairline borders only.
//   4. SOFT EVERYTHING, and no `filter: blur()` anywhere — see the note on `frost()` below.
//
// FONT SUBSTITUTION: `Inter` is not bundled, so Figtree stands in for display and body — the nearest
// neutral grotesque in src/fonts/pack_fonts.js.

const K = require("./om_port_kit");
const { r, esc, rgba } = K;

const STAGE = K.stageOf(1920, 1080);
const { U } = STAGE;

const GROUND = "#0B0B14", GROUND2 = "#11101D", TEXT = "#F5F7FF", MUTED = "#A6ACC8";
const INDIGO = "#6E8BFF", VIOLET = "#B16CFF", MAGENTA = "#FF6FD8", CYAN = "#4ED7FF", MINT = "#57F2C2";
const SPECTRUM = [INDIGO, VIOLET, MAGENTA, CYAN, MINT];
const DISPLAY = "Figtree", MONO = "JetBrains Mono", BODY = "Figtree";

const STRINGS = {
  hook: "INTRODUCING", feature: "CAPABILITY", how: "HOW IT WORKS", proof: "BY THE NUMBERS",
  quote: "WHAT THEY SAY", cta: "GET STARTED", scene: "STEP", of: "OF", go: "START FREE",
};

function theme(brandSkin) {
  const { accent, resolvedBrand } = K.resolveAccent(brandSkin, { ground: GROUND, isDark: true, packAccent: INDIGO });
  return {
    accent, bg: GROUND, ground2: GROUND2, ink: TEXT, paper: TEXT, panel: rgba(TEXT, 0.05),
    sub: MUTED, line: rgba(TEXT, 0.12),
    // The brand colour LEADS the spectrum; the pack's own four follow it, so a rebranded film is
    // still an aurora and not a single-hue wash.
    spectrum: [accent, ...SPECTRUM.slice(1)],
    adv: K.ADVANCE.mixed,
    capBg: rgba(GROUND, 0.72), capInk: TEXT,
    ...K.fontStacks(DISPLAY, MONO, `'${BODY}', system-ui, sans-serif`, [BODY]),
    bodyStack: `'${BODY}', system-ui, sans-serif`,
    resolvedBrand,
  };
}

// ---- the lit ground ----------------------------------------------------------
const M = U(120);
const COL = U(1920) - M * 2;

// Five aurora blobs on ONE layer. GRADIENTS, NOT BLURRED DIVS: a per-scene stack of `filter: blur()`
// is what makes a composition capture come back solid black, and this pack would otherwise want a
// dozen of them. `ellipse` with TWO percentages — `circle <pct>%` is invalid CSS and silently drops
// the whole comma-joined background (it has cost this library three packs; see test-dropped-css).
function aurora(id, th) {
  const blobs = [
    { c: th.spectrum[0], x: 16, y: 22, s: 620, o: 0.5 },
    { c: th.spectrum[1], x: 78, y: 16, s: 560, o: 0.42 },
    { c: th.spectrum[2], x: 88, y: 78, s: 520, o: 0.36 },
    { c: th.spectrum[3], x: 34, y: 86, s: 580, o: 0.34 },
    { c: th.spectrum[4], x: 56, y: 46, s: 460, o: 0.22 },
  ].map((b) => `radial-gradient(ellipse ${r((b.s / 1920) * 100)}% ${r((b.s / 1080) * 100)}% at ${b.x}% ${b.y}%, ${rgba(b.c, b.o)} 0%, ${rgba(b.c, 0)} 70%)`).join(",");
  return `<div style="position:absolute;inset:0;background:linear-gradient(160deg, ${th.bg} 0%, ${th.ground2} 100%);overflow:hidden;">
    <div class="${id}-aur" style="position:absolute;inset:${r(-U(200))}cqw;background:${blobs};"></div>
    <div class="${id}-aur2" style="position:absolute;inset:${r(-U(160))}cqw;background:radial-gradient(ellipse ${r((520 / 1920) * 100)}% ${r((520 / 1080) * 100)}% at 62% 30%, ${rgba(th.spectrum[3], 0.2)} 0%, ${rgba(th.spectrum[3], 0)} 70%);"></div>
    <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 50%, transparent 40%, ${rgba("#000000", 0.42)} 100%);"></div>
  </div>`;
}
const auroraTweens = (id, ctx) => {
  const a = Math.max(9, ctx.L * 2.6), b = Math.max(7, ctx.L * 2.1);
  return [
    `tl.to(".${id}-aur",{x:"${r(U(90))}cqw",y:"${r(-U(60))}cqw",duration:${r(a)},ease:"sine.inOut",repeat:${K.reps(ctx.L, a)},yoyo:true},${r(ctx.T)});`,
    `tl.to(".${id}-aur2",{x:"${r(-U(70))}cqw",y:"${r(U(46))}cqw",duration:${r(b)},ease:"sine.inOut",repeat:${K.reps(ctx.L, b)},yoyo:true},${r(ctx.T)});`,
  ];
};

// `motion.cut: "glow"` — the cut is a bloom of spectrum light across the frame, not a wipe.
function glow(id, th) {
  return `<div class="${id}-glow" style="position:absolute;inset:0;background:linear-gradient(100deg, ${rgba(th.spectrum[0], 0)} 0%, ${rgba(th.spectrum[1], 0.24)} 45%, ${rgba(th.spectrum[3], 0.18)} 60%, ${rgba(th.spectrum[0], 0)} 100%);opacity:0;z-index:30;pointer-events:none;"></div>`;
}
const glowTweens = (id, ctx) => [
  `tl.fromTo(".${id}-glow",{opacity:0,x:"${r(-U(700))}cqw"},{opacity:1,x:0,duration:${ctx.du(0.16)},ease:"power2.out"},${ctx.at(0)});`,
  `tl.to(".${id}-glow",{opacity:0,x:"${r(U(700))}cqw",duration:${ctx.du(0.26)},ease:"power2.in"},${ctx.at(0.16)});`,
];

// ---- type -------------------------------------------------------------------
// GRADIENT-CLIP: the spectrum fills the letterforms. Both the prefixed and unprefixed properties are
// emitted — Chromium accepts both, and `color:transparent` is what reveals the fill.
const gradText = (th, size, weight = 600) =>
  `font-family:${th.displayStack};font-weight:${weight};font-size:${r(size)}cqw;line-height:1.04;letter-spacing:-0.025em;` +
  `background-image:linear-gradient(96deg, ${th.spectrum[0]} 0%, ${th.spectrum[1]} 38%, ${th.spectrum[2]} 62%, ${th.spectrum[3]} 100%);` +
  `-webkit-background-clip:text;background-clip:text;color:transparent;`;

// `textfx.enter: "mask-reveal"` — each line is uncovered by its own clip, never faded. A clip-path is
// a paint operation, so it stays off the layout path (see scripts/test-motion-safety.js).
function reveal(id, lines, style, cls = "ln") {
  return lines.map((l) => `<span class="${id}-${cls}" style="display:block;${style}clip-path:inset(0 0 100% 0);">${esc(l)}</span>`).join("");
}
const revealTweens = (id, ctx, at, cls = "ln") => [
  `tl.to(".${id}-${cls}",{clipPath:"inset(0 0 0% 0)",duration:${ctx.du(0.3)},ease:"expo.out",stagger:${ctx.du(0.1)}},${ctx.at(at)});`,
];

const eyebrow = (th, t) =>
  `<span style="font-family:${th.monoStack};font-size:${r(U(20))}cqw;letter-spacing:0.24em;text-transform:uppercase;color:${th.sub};white-space:nowrap;">${esc(t)}</span>`;

// A frosted micro-card: 5% white, hairline border, NO backdrop-filter. The brief says "frosted" and
// "zero hard shadow"; a real backdrop blur is the one thing that cannot be used here, because a stack
// of blurred layers is what makes a seeked capture come out black.
function frost(cls, th, { x, y, w, h, inner, pad = 0 }) {
  return `<div class="${cls}" style="position:absolute;left:${r(x)}cqw;top:${r(y)}cqw;width:${r(w)}cqw;height:${r(h)}cqw;background:${rgba(TEXT, 0.05)};border:1px solid ${rgba(TEXT, 0.1)};border-radius:${r(U(18))}cqw;overflow:hidden;${pad ? `padding:${r(pad)}cqw;box-sizing:border-box;` : ""}opacity:0;">
    <div style="position:relative;width:100%;height:100%;">${inner}</div>
  </div>`;
}
const frostTweens = (cls, ctx, at) => [
  `tl.to(".${cls}",{opacity:1,duration:${ctx.du(0.12)},ease:"none"},${ctx.at(at)});`,
  `tl.fromTo(".${cls}",{y:"${r(U(36))}cqw",scale:0.985},{y:0,scale:1,duration:${ctx.du(0.38)},ease:"expo.out"},${ctx.at(at)});`,
];

const pill = (th, t, i) =>
  `<span class="pil" style="display:inline-flex;align-items:center;gap:${r(U(10))}cqw;padding:${r(U(12))}cqw ${r(U(22))}cqw;border-radius:${r(U(100))}cqw;background:${rgba(TEXT, 0.05)};border:1px solid ${rgba(TEXT, 0.1)};font-family:${th.bodyStack};font-weight:500;font-size:${r(U(22))}cqw;color:${th.ink};white-space:nowrap;opacity:0;"><span style="width:${r(U(9))}cqw;height:${r(U(9))}cqw;border-radius:50%;background:${th.spectrum[i % th.spectrum.length]};"></span>${esc(t)}</span>`;

// ---- scenes -----------------------------------------------------------------
function sHook(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const shot = shots[0] || null;
  const colW = shot ? U(820) : U(1400);
  const head = K.fitLines(scene.headline || scene.title || ctx.title, colW / K.camSafe(), U(112), 3, th.adv);
  const body = String(scene.subtext || "").trim().slice(0, 180);
  const tags = K.bullets(scene, 3).map((b) => String(b).slice(0, 24));
  return {
    backdrop: `${aurora(id, th)}${glow(id, th)}`,
    html: `
    <div style="position:absolute;left:${r(M)}cqw;top:${r(U(300))}cqw;width:${r(colW)}cqw;z-index:4;">
      <div class="${id}-eb" style="margin-bottom:${r(U(26))}cqw;opacity:0;">${eyebrow(th, String(scene.kicker || STRINGS.hook).slice(0, 30))}</div>
      ${reveal(id, head.lines, gradText(th, head.size, 700))}
      ${body ? `<div class="${id}-body" style="margin-top:${r(U(30))}cqw;max-width:${r(U(760))}cqw;font-family:${th.bodyStack};font-weight:400;font-size:${r(U(28))}cqw;line-height:1.55;color:${th.sub};opacity:0;">${esc(body)}</div>` : ""}
      ${tags.length ? `<div style="margin-top:${r(U(34))}cqw;display:flex;gap:${r(U(14))}cqw;flex-wrap:wrap;">${tags.map((t, i) => pill(th, t, i)).join("")}</div>` : ""}
    </div>
    ${shot ? frost(`${id}-c`, th, { x: U(1060), y: U(300), w: U(740), h: U(470), inner: K.shotFill(shot, { bg: th.bg }) }) : ""}`,
    s: [
      `tl.fromTo(".${id}-eb",{opacity:0,y:"${r(U(16))}cqw"},{opacity:1,y:0,duration:${du(0.2)},ease:"power3.out"},${at(0.08)});`,
      ...revealTweens(id, ctx, 0.16),
      body ? `tl.fromTo(".${id}-body",{opacity:0,y:"${r(U(22))}cqw"},{opacity:1,y:0,duration:${du(0.3)},ease:"power3.out"},${at(0.5)});` : "",
      tags.length ? `tl.fromTo("#${id} .pil",{opacity:0,y:"${r(U(18))}cqw"},{opacity:1,y:0,duration:${du(0.26)},ease:"expo.out",stagger:${du(0.09)}},${at(0.62)});` : "",
      ...(shot ? frostTweens(`${id}-c`, ctx, 0.3) : []),
      ...auroraTweens(id, ctx), ...glowTweens(id, ctx),
    ].filter(Boolean),
  };
}

function sFeature(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const n = Math.min(2, shots.length);
  if (!n) return { ...K.statement(scene, ctx), backdrop: aurora(id, th) };
  const head = K.fitLines(scene.headline || scene.title || "", U(1300) / K.camSafe(), U(84), 2, th.adv);
  const bandTop = U(280) + U(48) + head.lines.length * head.size * 1.04 + U(44);
  const gap = U(26), bandEnd = U(980);
  const h = n === 2 ? (bandEnd - bandTop - gap) / 2 : bandEnd - bandTop;
  return {
    backdrop: `${aurora(id, th)}${glow(id, th)}`,
    html: `
    <div style="position:absolute;left:${r(M)}cqw;top:${r(U(280))}cqw;width:${r(U(1300))}cqw;z-index:4;">
      <div class="${id}-eb" style="margin-bottom:${r(U(22))}cqw;opacity:0;">${eyebrow(th, String(scene.kicker || STRINGS.feature).slice(0, 30))}</div>
      ${reveal(id, head.lines, gradText(th, head.size))}
    </div>
    ${Array.from({ length: n }, (_, i) => frost(`${id}-f${i}`, th, { x: M, y: bandTop + i * (h + gap), w: COL, h, inner: K.shotFill(shots[i], { bg: th.bg }) })).join("")}`,
    s: [
      `tl.fromTo(".${id}-eb",{opacity:0,y:"${r(U(14))}cqw"},{opacity:1,y:0,duration:${du(0.2)},ease:"power3.out"},${at(0.06)});`,
      ...revealTweens(id, ctx, 0.14),
      ...Array.from({ length: n }, (_, i) => frostTweens(`${id}-f${i}`, ctx, 0.42 + i * 0.16)).flat(),
      ...auroraTweens(id, ctx), ...glowTweens(id, ctx),
    ],
  };
}

function sHow(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const steps = K.bullets(scene, 3);
  if (steps.length < 2) return { ...K.statement(scene, ctx), backdrop: aurora(id, th) };
  const head = K.fitOne(String(scene.headline || STRINGS.how), U(1300), U(84), th.adv);
  const cw = (COL - U(30) * (steps.length - 1)) / steps.length;
  const shot = shots[0] || null;
  return {
    backdrop: `${aurora(id, th)}${glow(id, th)}`,
    html: `
    <div style="position:absolute;left:${r(M)}cqw;top:${r(U(270))}cqw;width:${r(U(1300))}cqw;z-index:4;">
      <div class="${id}-eb" style="margin-bottom:${r(U(22))}cqw;opacity:0;">${eyebrow(th, String(scene.kicker || STRINGS.how).slice(0, 30))}</div>
      ${reveal(id, [String(scene.headline || STRINGS.how)], gradText(th, head))}
    </div>
    ${steps.map((s, i) => frost(`${id}-s${i}`, th, {
      x: M + i * (cw + U(30)), y: U(500), w: cw, h: U(300), pad: U(34),
      inner: `<div style="font-family:${th.monoStack};font-size:${r(U(20))}cqw;letter-spacing:0.2em;color:${th.spectrum[i % th.spectrum.length]};">${String(i + 1).padStart(2, "0")}</div>
        <div style="margin-top:${r(U(20))}cqw;font-family:${th.displayStack};font-weight:600;font-size:${r(U(34))}cqw;line-height:1.28;color:${th.ink};">${esc(String(s).slice(0, 76))}</div>`,
    })).join("")}
    ${shot ? frost(`${id}-ill`, th, { x: M, y: U(840), w: COL, h: U(160), inner: `<img src="${esc(shot.path)}" alt="${esc(shot.alt || "")}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block;">` }) : ""}`,
    s: [
      `tl.fromTo(".${id}-eb",{opacity:0,y:"${r(U(14))}cqw"},{opacity:1,y:0,duration:${du(0.2)},ease:"power3.out"},${at(0.06)});`,
      ...revealTweens(id, ctx, 0.14),
      ...steps.flatMap((_, i) => frostTweens(`${id}-s${i}`, ctx, 0.38 + i * 0.12)),
      ...(shot ? frostTweens(`${id}-ill`, ctx, 0.74) : []),
      ...auroraTweens(id, ctx), ...glowTweens(id, ctx),
    ],
  };
}

function sProof(scene, ctx) {
  const { id, th, at, du } = ctx;
  const stats = K.numbersIn(scene, 3);
  if (stats.length < 2) return { ...K.statement(scene, ctx), backdrop: aurora(id, th) };
  const cw = (COL - U(30) * (stats.length - 1)) / stats.length;
  return {
    backdrop: `${aurora(id, th)}${glow(id, th)}`,
    html: `
    <div style="position:absolute;left:${r(M)}cqw;top:${r(U(290))}cqw;width:${r(U(1300))}cqw;z-index:4;">
      <div class="${id}-eb" style="margin-bottom:${r(U(22))}cqw;opacity:0;">${eyebrow(th, String(scene.kicker || STRINGS.proof).slice(0, 30))}</div>
      ${reveal(id, [String(scene.headline || scene.title || "").slice(0, 46)], gradText(th, K.fitOne(String(scene.headline || scene.title || "").slice(0, 46), U(1300), U(84), th.adv)))}
    </div>
    ${stats.map((st, i) => frost(`${id}-p${i}`, th, {
      x: M + i * (cw + U(30)), y: U(520), w: cw, h: U(300), pad: U(38),
      inner: `<div style="${gradText(th, K.fitOne(`${st.v}${st.suffix}`, cw - U(80), U(110), th.adv), 700)}white-space:nowrap;"><span class="${id}-n${i}">0</span>${esc(st.suffix)}</div>
        <div style="margin-top:${r(U(22))}cqw;font-family:${th.monoStack};font-size:${r(U(19))}cqw;letter-spacing:0.18em;text-transform:uppercase;color:${th.sub};">${esc(K.statLabel(scene, i))}</div>`,
    })).join("")}`,
    s: [
      `tl.fromTo(".${id}-eb",{opacity:0,y:"${r(U(14))}cqw"},{opacity:1,y:0,duration:${du(0.2)},ease:"power3.out"},${at(0.06)});`,
      ...revealTweens(id, ctx, 0.14),
      ...stats.flatMap((st, i) => {
        const num = Number(String(st.v).replace(/,/g, "")) || 0;
        const dp = String(st.v).includes(".") ? 1 : 0;
        return [
          ...frostTweens(`${id}-p${i}`, ctx, 0.36 + i * 0.12),
          `tl.fromTo(".${id}-n${i}",{innerText:0},{innerText:${num},duration:${du(0.46)},ease:"power2.out",snap:{innerText:${dp ? 0.1 : 1}},onUpdate:function(){var e=document.querySelector(".${id}-n${i}");if(e)e.textContent=Number(e.textContent).toFixed(${dp});}},${at(0.46 + i * 0.12)});`,
        ];
      }),
      ...auroraTweens(id, ctx), ...glowTweens(id, ctx),
    ],
  };
}

function sQuote(scene, ctx) {
  const { id, th, at, du } = ctx;
  const q = String(scene.quote || scene.headline || scene.subtext || "").trim().slice(0, 220);
  if (!q) return { ...K.statement(scene, ctx), backdrop: aurora(id, th) };
  const by = String(scene.attribution || scene.emphasis || "").trim().slice(0, 60);
  const fit = K.fitLines(q, U(1360) / K.camSafe(), U(62), 4, th.adv);
  return {
    backdrop: `${aurora(id, th)}${glow(id, th)}`,
    html: `
    ${frost(`${id}-q`, th, {
      x: M, y: U(320), w: COL, h: U(440), pad: U(60),
      inner: `<div class="${id}-eb" style="opacity:0;">${eyebrow(th, String(scene.kicker || STRINGS.quote).slice(0, 30))}</div>
        <div style="margin-top:${r(U(26))}cqw;">${reveal(id, fit.lines, `font-family:${th.displayStack};font-weight:500;font-size:${r(fit.size)}cqw;line-height:1.34;letter-spacing:-0.012em;color:${th.ink};`)}</div>
        ${by ? `<div class="${id}-by" style="margin-top:${r(U(30))}cqw;opacity:0;">${eyebrow(th, by)}</div>` : ""}`,
    })}`,
    s: [
      ...frostTweens(`${id}-q`, ctx, 0.06),
      `tl.fromTo(".${id}-eb",{opacity:0},{opacity:1,duration:${du(0.2)},ease:"none"},${at(0.2)});`,
      ...revealTweens(id, ctx, 0.28),
      by ? `tl.fromTo(".${id}-by",{opacity:0},{opacity:1,duration:${du(0.2)},ease:"none"},${at(0.62)});` : "",
      ...auroraTweens(id, ctx), ...glowTweens(id, ctx),
    ].filter(Boolean),
  };
}

function sCta(scene, ctx, logo) {
  const { id, th, at, du } = ctx;
  const head = K.fitLines(scene.headline || scene.emphasis || ctx.title, U(1400) / K.camSafe(), U(128), 2, th.adv);
  const action = K.clampWords(String(scene.emphasis || ""), 24) || STRINGS.go;
  const hasMark = !!(logo && logo.path);
  return {
    backdrop: `${aurora(id, th)}${glow(id, th)}`,
    html: `
    <div style="position:absolute;left:0;right:0;top:${r(U(320))}cqw;text-align:center;z-index:4;">
      ${hasMark ? `<div class="${id}-logo" style="width:${r(U(96))}cqw;height:${r(U(96))}cqw;margin:0 auto ${r(U(36))}cqw;background:${rgba(TEXT, 0.05)};border:1px solid ${rgba(TEXT, 0.1)};border-radius:${r(U(22))}cqw;display:flex;align-items:center;justify-content:center;padding:${r(U(16))}cqw;box-sizing:border-box;opacity:0;"><img src="${esc(logo.path)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain;"></div>` : ""}
      <div class="${id}-eb" style="margin-bottom:${r(U(24))}cqw;opacity:0;">${eyebrow(th, String(scene.kicker || STRINGS.cta).slice(0, 30))}</div>
      <div style="display:inline-block;text-align:center;">${reveal(id, head.lines, gradText(th, head.size, 700))}</div>
      <div class="${id}-btn" style="margin-top:${r(U(46))}cqw;display:inline-block;background:linear-gradient(96deg, ${th.spectrum[0]} 0%, ${th.spectrum[1]} 55%, ${th.spectrum[2]} 100%);color:${GROUND};font-family:${th.displayStack};font-weight:600;font-size:${r(K.fitOne(action, U(620), U(34), th.adv))}cqw;padding:${r(U(22))}cqw ${r(U(46))}cqw;border-radius:${r(U(100))}cqw;opacity:0;">${esc(action)}</div>
      <div class="${id}-url" style="margin-top:${r(U(30))}cqw;opacity:0;">${eyebrow(th, ctx.url)}</div>
    </div>`,
    s: [
      hasMark ? `tl.fromTo(".${id}-logo",{opacity:0,y:"${r(U(20))}cqw"},{opacity:1,y:0,duration:${du(0.24)},ease:"expo.out"},${at(0.08)});` : "",
      `tl.fromTo(".${id}-eb",{opacity:0},{opacity:1,duration:${du(0.2)},ease:"none"},${at(0.18)});`,
      ...revealTweens(id, ctx, 0.26),
      `tl.fromTo(".${id}-btn",{opacity:0,y:"${r(U(20))}cqw"},{opacity:1,y:0,duration:${du(0.28)},ease:"expo.out"},${at(0.56)});`,
      `tl.fromTo(".${id}-url",{opacity:0},{opacity:1,duration:${du(0.2)},ease:"none"},${at(0.72)});`,
      ...auroraTweens(id, ctx), ...glowTweens(id, ctx),
    ].filter(Boolean),
  };
}

// ---- spine ------------------------------------------------------------------
const SPEC = {
  first: "hook", last: "cta",
  middle: ["feature", "proof", "how", "quote"],
  shapes: {
    hook: [740 / 470], feature: [1728 / 410, 1728 / 410], how: [998 / 367],
    proof: [], quote: [], cta: [], statement: [], "statement-c": [],
  },
  slots: (role, budget) => (role === "feature" ? Math.min(2, Math.max(0, budget))
    : role === "hook" || role === "how" ? Math.min(1, Math.max(0, budget)) : 0),
  needs: (role) => (role === "feature" ? 1 : 0),
  carry: (role, scene, budget) => {
    const isStats = K.numbersIn(scene).length >= 2;
    if (role === "proof") return isStats;
    if (isStats) return false;
    if (role === "feature") return budget >= 1;
    if (role === "how") return K.bullets(scene, 3).length >= 2;
    if (role === "quote") return !!String(scene.quote || scene.subtext || "").trim();
    return true;
  },
};
const BUILDERS = {
  hook: sHook, feature: sFeature, how: sHow, proof: sProof, quote: sQuote, cta: sCta,
  statement: (sc, ctx) => ({ ...K.statement(sc, ctx), backdrop: aurora(ctx.id, ctx.th) }),
  "statement-c": (sc, ctx) => ({ ...K.statement(sc, ctx, { centred: true }), backdrop: aurora(ctx.id, ctx.th) }),
};
const LABELS = {
  hook: STRINGS.hook, feature: STRINGS.feature, how: STRINGS.how,
  proof: STRINGS.proof, quote: STRINGS.quote, cta: STRINGS.cta,
};

const css = (th, stage) => K.baseCss(th, stage, `
  #cap-pill { border:1px solid ${rgba(TEXT, 0.12)}; }`);

function buildComposition(opts = {}) {
  return K.buildFilm({
    ...opts, stage: STAGE, theme, STRINGS, spec: SPEC, builders: BUILDERS, labels: LABELS,
    css, refBeat: 4.4,
    // `motion.drift: 1.055` — the largest drift in the library, and the reason the ground reads alive.
    camera: { push: 120, scale: 1.055 },
    signature: "editorial", fallbackBrand: "AURORA",
  });
}

module.exports = { buildComposition, STRINGS };
module.exports.__test = { SPEC, BUILDERS, theme, STAGE };
