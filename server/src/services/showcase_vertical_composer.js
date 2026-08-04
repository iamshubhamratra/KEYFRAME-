// SHOWCASE VERTICAL — the portrait sibling of `showcase`. Native GSAP + DOM, on om_port_kit.
//
// PROVENANCE. Ported from the imported OM template "showcaseVertical" (1080x1920,
// SCENE_MAP = Intro/Tour/Detail/Gallery/Stats, transition="cut"). Same theme and vocabulary as
// its landscape sibling; the LAYOUTS are re-authored for the tall frame rather than scaled.
//
// WHY IT IS ITS OWN PACK, NOT A FLAG. The landscape composer stacks copy BESIDE a browser
// window and annotates it with arrows across the width. In 9:16 there is no width to cross:
// the device goes full-bleed, the copy stacks above and below it, and callouts sit ON the
// shot rather than beside it. Sharing a file would mean a per-scene branch in every builder.
//
// PORTRAIT-NATIVE. 1080x1920, so `U(px) = px/1080*100` and the usable height is 177.78cqw.
// FONT SUBSTITUTION: none. Space Grotesk + JetBrains Mono are both bundled.
// ─────────────────────────────────────────────────────────────────────────────────────

const K = require("./om_port_kit");
const { r, esc, rgba } = K;

const STAGE = K.stageOf(1080, 1920);
const { U } = STAGE;

const BG = "#EEF1F7", PANEL = "#FFFFFF", INK = "#131722", SUB = "#5B6472", LINE = "#D9DEE8";
const ACCENT = "#2F6BFF";
const DISPLAY = "Space Grotesk", MONO = "JetBrains Mono";

const STRINGS = {
  tour: "GUIDED TOUR", feature: "FEATURE", how: "HOW IT WORKS", gallery: "EVERY SCREEN",
  numbers: "BY THE NUMBERS", start: "GET STARTED", scene: "SCENE", of: "OF",
};

function theme(brandSkin) {
  const { accent, resolvedBrand } = K.resolveAccent(brandSkin, { ground: BG, isDark: false, packAccent: ACCENT });
  return {
    accent, bg: BG, panel: PANEL, ink: INK, sub: SUB, line: LINE,
    mark: K.spin(accent, 168, 0.12),
    blobs: [accent, K.spin(accent, 42, 0.06), K.spin(accent, 128, 0.04), K.spin(accent, 196, 0.1)],
    adv: K.ADVANCE.mixed,
    capBg: "#FFFFFF", capInk: INK,
    ...K.fontStacks(DISPLAY, MONO),
    resolvedBrand,
  };
}

// ---- furniture ---------------------------------------------------------------
// Four soft blooms as GRADIENTS on two drifting layers, plus the 52px grid. Not blurred divs:
// a per-scene stack of blur filters is what trips the renderer's heavy-overlay lint, which
// cites a field report of such compositions capturing solid black for half the render.
const BLOBS = [
  { x: -12, y: -8, s: 52, o: 0.17, layer: 0 },
  { x: 108, y: 22, s: 46, o: 0.16, layer: 1 },
  { x: -14, y: 62, s: 44, o: 0.15, layer: 0 },
  { x: 104, y: 92, s: 48, o: 0.15, layer: 1 },
];
const blobLayer = (th, layer) => BLOBS.map((b, i) => ({ b, hue: th.blobs[i % th.blobs.length] }))
  .filter(({ b }) => b.layer === layer)
  .map(({ b, hue }) => `radial-gradient(circle ${b.s}% at ${b.x}% ${b.y}%, ${rgba(hue, b.o)} 0%, ${rgba(hue, b.o * 0.5)} 44%, ${rgba(hue, 0)} 72%)`)
  .join(",");

function sheet(id, th) {
  return `<div style="position:absolute;inset:0;background:linear-gradient(168deg, ${th.bg} 0%, #FFFFFF 54%, ${th.bg} 100%);overflow:hidden;">
    <div class="${id}-b0" style="position:absolute;inset:${r(-U(100))}cqw;background:${blobLayer(th, 0)};"></div>
    <div class="${id}-b1" style="position:absolute;inset:${r(-U(100))}cqw;background:${blobLayer(th, 1)};"></div>
    <div style="position:absolute;inset:0;background-image:linear-gradient(${rgba(th.ink, 0.045)} 1px, transparent 1px),linear-gradient(90deg, ${rgba(th.ink, 0.045)} 1px, transparent 1px);background-size:${r(U(52))}cqw ${r(U(52))}cqw;opacity:0.5;"></div>
  </div>`;
}
const sheetTweens = (id, ctx) => [
  `tl.to(".${id}-b0",{x:"${r(U(24))}cqw",y:"${r(U(20))}cqw",duration:9.4,ease:"sine.inOut",repeat:${K.reps(ctx.L, 9.4)},yoyo:true},${r(ctx.T)});`,
  `tl.to(".${id}-b1",{x:"${r(-U(22))}cqw",y:"${r(-U(18))}cqw",duration:11.6,ease:"sine.inOut",repeat:${K.reps(ctx.L, 11.6)},yoyo:true},${r(ctx.T)});`,
];

const BAR_H = U(46);
// A browser window, sized for the tall frame. Drawn ONLY around a real picture.
function browser(th, { cls, x, y, w, h, url, inner, z = 2 }) {
  return `<div class="${cls}" style="position:absolute;left:${r(x)}cqw;top:${r(y)}cqw;width:${r(w)}cqw;height:${r(h)}cqw;z-index:${z};border-radius:${r(U(18))}cqw;overflow:hidden;background:${th.panel};border:1px solid ${th.line};box-shadow:0 ${r(U(30))}cqw ${r(U(70))}cqw ${rgba(th.ink, 0.16)};display:flex;flex-direction:column;">
    <div style="height:${r(BAR_H)}cqw;flex-shrink:0;background:#F6F8FC;border-bottom:1px solid ${th.line};display:flex;align-items:center;gap:${r(U(9))}cqw;padding:0 ${r(U(18))}cqw;">
      ${["#FF5F57", "#FEBC2E", "#28C840"].map((c) => `<span style="width:${r(U(13))}cqw;height:${r(U(13))}cqw;border-radius:50%;background:${c};flex:0 0 auto;"></span>`).join("")}
      <div style="margin-left:${r(U(14))}cqw;flex:1 1 auto;height:${r(U(28))}cqw;border-radius:${r(U(14))}cqw;background:#EAEEF5;display:flex;align-items:center;padding:0 ${r(U(16))}cqw;font-family:${th.monoStack};font-size:${r(U(15))}cqw;color:${th.sub};overflow:hidden;white-space:nowrap;">${esc(url || "")}</div>
    </div>
    <div style="flex:1 1 auto;min-height:0;position:relative;overflow:hidden;">${inner}</div>
  </div>`;
}
// A phone, which is the NATURAL device for this aspect — it fills the tall frame the way the
// browser window fills the wide one.
function phone(th, { cls, x, y, w, h, inner, z = 2 }) {
  return `<div class="${cls}" style="position:absolute;left:${r(x)}cqw;top:${r(y)}cqw;width:${r(w)}cqw;height:${r(h)}cqw;z-index:${z};border-radius:${r(U(58))}cqw;padding:${r(U(14))}cqw;background:${th.ink};box-shadow:0 ${r(U(34))}cqw ${r(U(80))}cqw ${rgba(th.ink, 0.3)};">
    <div style="position:absolute;top:${r(U(30))}cqw;left:50%;translate:-50% 0;width:${r(U(120))}cqw;height:${r(U(32))}cqw;border-radius:${r(U(32))}cqw;background:${th.ink};z-index:3;"></div>
    <div style="width:100%;height:100%;border-radius:${r(U(46))}cqw;overflow:hidden;background:${th.panel};position:relative;">${inner}</div>
  </div>`;
}
function callout(cls, th, { x, y, num, text }) {
  return `<div class="${cls}" style="position:absolute;left:${r(x)}cqw;top:${r(y)}cqw;display:flex;align-items:center;gap:${r(U(12))}cqw;padding:${r(U(12))}cqw ${r(U(20))}cqw ${r(U(12))}cqw ${r(U(12))}cqw;background:${th.ink};color:#fff;border-radius:${r(U(14))}cqw;box-shadow:0 ${r(U(12))}cqw ${r(U(30))}cqw ${rgba(th.ink, 0.32)};white-space:nowrap;opacity:0;z-index:8;">
    <span style="width:${r(U(32))}cqw;height:${r(U(32))}cqw;border-radius:${r(U(10))}cqw;background:${th.accent};display:grid;place-items:center;font-family:${th.monoStack};font-weight:700;font-size:${r(U(17))}cqw;color:${K.inkOn(th.accent)};flex:0 0 auto;">${esc(num)}</span>
    <span style="font-family:${th.displayStack};font-weight:600;font-size:${r(U(26))}cqw;">${esc(text)}</span>
  </div>`;
}
const eyebrow = (th, t) =>
  `<div style="font-family:${th.monoStack};font-size:${r(U(20))}cqw;letter-spacing:0.22em;color:${th.accent};text-transform:uppercase;margin-bottom:${r(U(16))}cqw;">${esc(t)}</div>`;

// ---- scenes ------------------------------------------------------------------
// INTRO — copy at the top, the hero window rising from below. In 9:16 the window is WIDE and
// short rather than the landscape hero's near-square, so a desktop capture still fits it.
function sIntro(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const shot = shots[0] || null;
  if (!shot) return { ...K.statement(scene, ctx, { centred: true }), backdrop: sheet(id, th) };
  const head = K.fitLines(scene.headline || scene.title || ctx.title, U(920) / K.camSafe(), U(104), 3, th.adv);
  // The hero was pinned to U(880) whatever the headline did, which on a one-line headline left
  // a quarter of the tall frame empty between the two. It now follows the headline down and
  // takes some of the height it saves — capped, because this window holds a LANDSCAPE
  // screenshot and every extra pixel of height is horizontal crop.
  const headH = U(40) + head.lines.length * head.size * 0.98;
  const heroTop = Math.max(U(660), U(300) + headH + U(90));
  const heroH = Math.max(U(620), Math.min(U(780), U(1500) - heroTop));

  return {
    backdrop: sheet(id, th),
    html: `
    <div class="${id}-head" style="position:absolute;left:${r(U(80))}cqw;top:${r(U(300))}cqw;width:${r(U(920))}cqw;text-align:center;opacity:0;">
      ${eyebrow(th, String(scene.kicker || STRINGS.tour).toUpperCase().slice(0, 30))}
      <div style="font-family:${th.displayStack};font-weight:700;font-size:${r(head.size)}cqw;line-height:0.98;letter-spacing:-0.03em;color:${th.ink};">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
    </div>
    ${browser(th, { cls: `${id}-hero`, x: U(60), y: heroTop, w: U(960), h: heroH, url: ctx.url, inner: K.shotFill(shot, { bg: th.panel }) })}`,
    s: [
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(44))}cqw"},{opacity:1,y:0,duration:${du(0.7)},ease:"back.out(1.5)"},${at(0.25)});`,
      `tl.fromTo(".${id}-hero",{y:"${r(U(600))}cqw",scale:0.94,opacity:0},{y:0,scale:1,opacity:1,duration:${du(1.3)},ease:"back.out(1.2)"},${at(0.65)});`,
      ...sheetTweens(id, ctx),
    ],
  };
}

// TOUR — the phone beat. The device fills the tall frame, copy sits above it and a callout
// lands ON the screen. Skipped without a picture.
function sTour(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const shot = shots[0] || null;
  if (!shot) return { ...K.statement(scene, ctx), backdrop: sheet(id, th) };
  const head = K.fitLines(scene.headline || scene.title || "", U(920) / K.camSafe(), U(80), 2, th.adv);
  const list = K.bullets(scene, 2);

  return {
    backdrop: sheet(id, th),
    html: `
    <div class="${id}-copy" style="position:absolute;left:${r(U(80))}cqw;top:${r(U(250))}cqw;width:${r(U(920))}cqw;opacity:0;z-index:4;">
      ${eyebrow(th, String(scene.kicker || STRINGS.feature).toUpperCase().slice(0, 30))}
      <div style="font-family:${th.displayStack};font-weight:700;font-size:${r(head.size)}cqw;line-height:0.98;letter-spacing:-0.02em;color:${th.ink};">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
    </div>
    ${phone(th, { cls: `${id}-ph`, x: U(280), y: U(560), w: U(520), h: U(1090), inner: K.shotFill(shot, { focus: "center top", bg: th.panel }) })}
    ${list[0] ? callout(`${id}-co`, th, { x: U(90), y: U(940), num: "1", text: K.wordsOf(list[0]).slice(0, 3).join(" ") }) : ""}
    ${list[1] ? callout(`${id}-co2`, th, { x: U(560), y: U(1330), num: "2", text: K.wordsOf(list[1]).slice(0, 3).join(" ") }) : ""}`,
    s: [
      `tl.fromTo(".${id}-copy",{opacity:0,y:"${r(U(38))}cqw"},{opacity:1,y:0,duration:${du(0.65)},ease:"back.out(1.5)"},${at(0.3)});`,
      `tl.fromTo(".${id}-ph",{y:"${r(U(700))}cqw"},{y:0,duration:${du(1.2)},ease:"back.out(1.1)"},${at(0.35)});`,
      list[0] ? `tl.fromTo(".${id}-co",{opacity:0,scale:0.5},{opacity:1,scale:1,duration:${du(0.4)},ease:"back.out(2.4)"},${at(1.3)});` : "",
      list[1] ? `tl.fromTo(".${id}-co2",{opacity:0,scale:0.5},{opacity:1,scale:1,duration:${du(0.4)},ease:"back.out(2.4)"},${at(1.6)});` : "",
      ...sheetTweens(id, ctx),
    ].filter(Boolean),
  };
}

// GALLERY — a stack of windows. The grid FITS the pictures: three, two, or the beat is handed
// to `statement`. Never a stack with an empty slot in it.
const GAL = {
  2: [{ y: 420, h: 620 }, { y: 1090, h: 620 }],
  3: [{ y: 360, h: 420 }, { y: 820, h: 420 }, { y: 1280, h: 420 }],
};
// DETAIL — the reference's annotated close-up: a centred headline over one tall card, with
// numbered callouts landing ON the capture. RESTORED 4 Aug 2026 — the bundle-derived port
// dropped it, and it is the beat that makes this an ANNOTATED tour rather than a slideshow.
// Reference: head centred at 190 (92px), card 100/100 at top 460 h 1040, two spots.
function sDetail(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const shot = shots[0] || null;
  if (!shot) return { ...K.statement(scene, ctx, { centred: true }), backdrop: sheet(id, th) };
  const head = K.fitLines(scene.headline || scene.title || "", U(960) / K.camSafe(), U(92), 2, th.adv);
  const spots = K.bullets(scene, 2).map((b) => String(b).slice(0, 22));
  // The callouts sit ON the card, inset from its edges so neither can hang off it.
  const CARD_X = U(100), CARD_Y = U(460), CARD_W = U(880), CARD_H = U(1040);
  const at2 = [{ x: CARD_X + U(40), y: CARD_Y + U(260) }, { x: CARD_X + U(180), y: CARD_Y + U(700) }];
  return {
    backdrop: sheet(id, th),
    html: `
    <div class="${id}-head" style="position:absolute;left:${r(U(60))}cqw;right:${r(U(60))}cqw;top:${r(U(190))}cqw;text-align:center;font-family:${th.displayStack};font-weight:700;font-size:${r(head.size)}cqw;letter-spacing:-0.02em;line-height:1.02;color:${th.ink};opacity:0;">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
    <div class="${id}-card" style="position:absolute;left:${r(CARD_X)}cqw;top:${r(CARD_Y)}cqw;width:${r(CARD_W)}cqw;height:${r(CARD_H)}cqw;opacity:0;transform-origin:center top;">
      ${browser(th, { cls: `${id}-bw`, x: 0, y: 0, w: CARD_W, h: CARD_H, url: ctx.url, inner: K.shotFill(shot, { bg: th.panel }) })}
    </div>
    ${spots.map((t, i) => callout(`${id}-co${i}`, th, { x: at2[i].x, y: at2[i].y, num: String(i + 1), text: t })).join("")}`,
    s: [
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(34))}cqw"},{opacity:1,y:0,duration:${du(0.24)},ease:"power3.out"},${at(0.06)});`,
      `tl.fromTo(".${id}-card",{opacity:0,scale:0.7},{opacity:1,scale:1,duration:${du(0.38)},ease:"back.out(1.7)"},${at(0.08)});`,
      ...spots.map((_t, i) => `tl.fromTo(".${id}-co${i}",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:${du(0.28)},ease:"back.out(1.9)"},${at(0.48 + i * 0.16)});`),
      ...sheetTweens(id, ctx),
    ],
  };
}

function sGallery(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const n = Math.min(3, shots.length);
  if (n < 2) return { ...K.statement(scene, ctx), backdrop: sheet(id, th) };
  const rows = GAL[n] || GAL[2];
  const head = K.fitLines(scene.headline || scene.title || "", U(920) / K.camSafe(), U(64), 2, th.adv);

  return {
    backdrop: sheet(id, th),
    html: `
    <div class="${id}-head" style="position:absolute;left:${r(U(80))}cqw;top:${r(U(180))}cqw;width:${r(U(920))}cqw;text-align:center;opacity:0;z-index:6;">
      <div style="font-family:${th.displayStack};font-weight:700;font-size:${r(head.size)}cqw;line-height:1.04;letter-spacing:-0.02em;color:${th.ink};">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
    </div>
    ${rows.map((t, i) => `<div class="${id}-t${i}" style="opacity:0;">${browser(th, { cls: `${id}-w${i}`, x: U(70), y: U(t.y), w: U(940), h: U(t.h), url: ctx.url, inner: K.shotFill(shots[i], { bg: th.panel }), z: 1 })}</div>`).join("")}`,
    s: [
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(30))}cqw"},{opacity:1,y:0,duration:${du(0.5)},ease:"power3.out"},${at(0.2)});`,
      ...rows.map((t, i) => `tl.fromTo(".${id}-t${i}",{opacity:0,x:"${r((i % 2 ? 1 : -1) * U(340))}cqw",scale:0.92},{opacity:1,x:0,scale:1,duration:${du(0.62)},ease:"back.out(1.3)"},${at(0.5 + i * 0.28)});`),
      ...sheetTweens(id, ctx),
    ],
  };
}

// STATS — figures on stacked panel cards. From the script only, landing early.
function sStats(scene, ctx) {
  const { id, th, at, du } = ctx;
  const stats = K.numbersIn(scene, 3);
  if (stats.length < 2) return { ...K.statement(scene, ctx, { centred: true }), backdrop: sheet(id, th) };
  const head = K.fitLines(scene.headline || scene.title || "", U(920) / K.camSafe(), U(84), 2, th.adv);
  const top = U(600), rowH = Math.min(U(330), (U(1660) - top) / stats.length);

  return {
    backdrop: sheet(id, th),
    html: `
    <div class="${id}-head" style="position:absolute;left:${r(U(80))}cqw;top:${r(U(300))}cqw;width:${r(U(920))}cqw;text-align:center;opacity:0;">
      ${eyebrow(th, String(scene.kicker || STRINGS.numbers).toUpperCase().slice(0, 30))}
      <div style="font-family:${th.displayStack};font-weight:700;font-size:${r(head.size)}cqw;line-height:1.04;letter-spacing:-0.02em;color:${th.ink};">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
    </div>
    ${stats.map((st, i) => `<div class="${id}-c${i}" style="position:absolute;left:${r(U(80))}cqw;top:${r(top + i * rowH)}cqw;width:${r(U(920))}cqw;height:${r(rowH - U(30))}cqw;background:${th.panel};border:1px solid ${th.line};border-radius:${r(U(28))}cqw;box-shadow:0 ${r(U(18))}cqw ${r(U(46))}cqw ${rgba(th.ink, 0.1)};display:flex;align-items:center;justify-content:space-between;padding:0 ${r(U(48))}cqw;opacity:0;">
      <span style="font-family:${th.displayStack};font-weight:700;font-size:${r(U(104))}cqw;line-height:1;letter-spacing:-0.04em;color:${th.accent};white-space:nowrap;"><span class="${id}-n${i}">0</span>${esc(st.suffix)}</span>
      <span style="font-family:${th.monoStack};font-size:${r(U(22))}cqw;letter-spacing:0.16em;color:${th.sub};text-align:right;white-space:nowrap;">${esc(K.statLabel(scene, i))}</span>
    </div>`).join("")}`,
    s: [
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(32))}cqw"},{opacity:1,y:0,duration:${du(0.55)},ease:"power3.out"},${at(0.2)});`,
      ...stats.flatMap((st, i) => {
        const num = Number(String(st.v).replace(/,/g, "")) || 0;
        const dp = String(st.v).includes(".") ? 1 : 0;
        return [
          `tl.fromTo(".${id}-c${i}",{opacity:0,scale:0.8},{opacity:1,scale:1,duration:${du(0.45)},ease:"back.out(2.2)"},${at(0.6 + i * 0.26)});`,
          `tl.fromTo(".${id}-n${i}",{innerText:0},{innerText:${num},duration:${du(0.68)},ease:"power2.out",snap:{innerText:${dp ? 0.1 : 1}},onUpdate:function(){var e=document.querySelector(".${id}-n${i}");if(e)e.textContent=Number(e.textContent).toFixed(${dp});}},${at(0.72 + i * 0.26)});`,
        ];
      }),
      ...sheetTweens(id, ctx),
    ],
  };
}

// CTA — the close, centred in the tall frame.
function sCta(scene, ctx, logo) {
  const { id, th, at, du } = ctx;
  const head = K.fitLines(scene.headline || scene.emphasis || ctx.title, U(920) / K.camSafe(), U(122), 3, th.adv);
  const action = K.clampWords(String(scene.emphasis || ""), 20) || STRINGS.start;
  const hasMark = !!(logo && logo.path);

  return {
    backdrop: sheet(id, th),
    html: `
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 ${r(U(80))}cqw;">
      ${hasMark ? `<div class="${id}-logo" style="width:${r(U(168))}cqw;height:${r(U(168))}cqw;border-radius:${r(U(40))}cqw;background:${th.panel};border:1px solid ${th.line};box-shadow:0 ${r(U(20))}cqw ${r(U(50))}cqw ${rgba(th.ink, 0.12)};padding:${r(U(24))}cqw;margin-bottom:${r(U(44))}cqw;display:flex;align-items:center;justify-content:center;opacity:0;"><img src="${esc(logo.path)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain;"></div>` : ""}
      <div class="${id}-head" style="width:100%;text-align:center;font-family:${th.displayStack};font-weight:700;font-size:${r(head.size)}cqw;line-height:0.98;letter-spacing:-0.03em;color:${th.ink};opacity:0;">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
      <div class="${id}-pill" style="margin-top:${r(U(56))}cqw;display:flex;flex-direction:column;align-items:center;gap:${r(U(26))}cqw;opacity:0;">
        <span style="padding:${r(U(26))}cqw ${r(U(52))}cqw;border-radius:${r(U(18))}cqw;background:${th.accent};color:${K.inkOn(th.accent)};font-family:${th.displayStack};font-weight:600;font-size:${r(K.fitOne(action, U(700), U(38), th.adv))}cqw;text-transform:uppercase;white-space:nowrap;box-shadow:0 ${r(U(16))}cqw ${r(U(38))}cqw ${rgba(th.accent, 0.4)};">${esc(action)} →</span>
        <span style="font-family:${th.monoStack};font-size:${r(U(26))}cqw;letter-spacing:0.12em;color:${th.sub};">${esc(ctx.url)}</span>
      </div>
    </div>`,
    s: [
      hasMark ? `tl.fromTo(".${id}-logo",{opacity:0,scale:0.5},{opacity:1,scale:1,duration:${du(0.55)},ease:"back.out(2)"},${at(0.3)});` : "",
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(44))}cqw"},{opacity:1,y:0,duration:${du(0.7)},ease:"back.out(1.5)"},${at(0.55)});`,
      `tl.fromTo(".${id}-pill",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:${du(0.5)},ease:"back.out(2.2)"},${at(1.25)});`,
      ...sheetTweens(id, ctx),
    ].filter(Boolean),
  };
}

// ---- spine -------------------------------------------------------------------
const SPEC = {
  first: "intro", last: "cta",
  middle: ["tour", "detail", "gallery", "stats"],
  shapes: {
    intro: [960 / (660 - 46)], tour: [492 / 1062], detail: [880 / 980], gallery: [940 / 574, 940 / 574, 940 / 374],
    stats: [], cta: [], statement: [], "statement-c": [],
  },
  slots: (role, budget) => (role === "intro" || role === "tour" || role === "detail" ? 1 : role === "gallery" ? Math.min(3, Math.max(0, budget)) : 0),
  needs: (role) => (role === "tour" || role === "detail" ? 1 : role === "gallery" ? 2 : 0),
  carry: (role, scene, budget) => {
    // Roles are picked by a ROTATING cursor, not by priority. `stats` is the only layout that
    // prints figures AS figures, so every other role declines a beat carrying two or more.
    const isStats = K.numbersIn(scene).length >= 2;
    if (role === "stats") return isStats;
    if (isStats) return false;
    if (role === "tour" || role === "detail") return budget >= 1;
    if (role === "gallery") return budget >= 2;
    return true;
  },
};
const BUILDERS = {
  intro: sIntro, tour: sTour, detail: sDetail, gallery: sGallery, stats: sStats, cta: sCta,
  statement: (sc, ctx) => ({ ...K.statement(sc, ctx), backdrop: sheet(ctx.id, ctx.th) }),
  "statement-c": (sc, ctx) => ({ ...K.statement(sc, ctx, { centred: true }), backdrop: sheet(ctx.id, ctx.th) }),
};
const LABELS = {
  intro: STRINGS.tour, tour: STRINGS.feature, gallery: STRINGS.gallery,
  stats: STRINGS.numbers, cta: STRINGS.start,
};

const css = (th, stage) => K.baseCss(th, stage, `
  #cap-pill { box-shadow:0 ${r(U(8))}cqw ${r(U(24))}cqw ${rgba(th.ink, 0.12)}; }`);

function buildComposition(opts = {}) {
  return K.buildFilm({
    ...opts, stage: STAGE, theme, STRINGS, spec: SPEC, builders: BUILDERS, labels: LABELS,
    css, refBeat: 4.4, camera: { push: 120, scale: 1.03 }, fallbackBrand: "SHOWCASE",
  });
}

module.exports = { buildComposition, STRINGS };
module.exports.__test = { SPEC, BUILDERS, theme, STAGE };
