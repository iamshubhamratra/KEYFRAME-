// REEL — a social story film. Native GSAP + DOM, built on om_port_kit.
//
// PROVENANCE. Ported from the imported OM template "reel" (1080x1920,
// SCENE_MAP = Hook/Show/Perks/Numbers/Proof, transition="cut"). Its layout, rhythm and
// vocabulary are reproduced; none of its copy is.
//
// THE LOOK. A deep violet ground washed with three saturated blooms and one electric lime
// accent. Archivo set heavy and tight, stacked so each line lands on its own beat. Everything
// is a card with a hard offset shadow — stickers on a story, not panels in a UI. A segmented
// story bar runs across the top of every frame, one segment per scene, filling in real time.
//
// PORTRAIT-NATIVE. 1080x1920, so `U(px) = px/1080*100` and the usable height is 177.78cqw.
// FONT SUBSTITUTION: none — every reference face is now bundled (see src/fonts/pack_fonts.js).

// ─────────────────────────────────────────────────────────────────────────────────────

const K = require("./om_port_kit");
const { r, esc, rgba } = K;

const STAGE = K.stageOf(1080, 1920);
const { U, VH } = STAGE;

const DARK = "#150A2E", INK = "#FFFFFF", CARD = "#FFFFFF", ACCENT = "#D4FF3F";
// FONTS: the reference's Archivo, plus its Baloo 2 for the sticker/body voice.
const DISPLAY = "Archivo", MONO = "JetBrains Mono", BODY = "Baloo 2";

const STRINGS = {
  hook: "WATCH", show: "SEE IT", perks: "WHY", numbers: "THE NUMBERS", proof: "PROOF",
  scene: "SCENE", of: "OF", go: "TAP THE LINK",
};

function theme(brandSkin) {
  const { accent, resolvedBrand } = K.resolveAccent(brandSkin, { ground: DARK, isDark: true, packAccent: ACCENT });
  return {
    accent, bg: DARK, panel: CARD, ink: INK, sub: rgba(INK, 0.66),
    // Three blooms, derived from the accent so a rebranded reel repaints its whole wash.
    c1: K.spin(accent, 150, -0.18, 0.66), c2: K.spin(accent, 214, -0.06, 0.62), c3: K.spin(accent, 100, -0.04, 0.62),
    cardInk: "#150A2E",
    adv: K.ADVANCE.upper,
    capBg: "#150A2E", capInk: INK,
    ...K.fontStacks(DISPLAY, MONO, `'${BODY}', sans-serif`, [BODY]),
    bodyStack: `'${BODY}', sans-serif`,
    resolvedBrand,
  };
}

// ---- furniture ---------------------------------------------------------------
// The wash: three big radial blooms on ONE layer plus a grain-free vignette. Gradients, not
// blurred divs — a per-scene stack of blur filters is what makes a composition capture black.
function wash(id, th) {
  const blooms = [
    { c: th.c1, x: 12, y: 14, s: 62, o: 0.5 },
    { c: th.c2, x: 88, y: 40, s: 55, o: 0.44 },
    { c: th.c3, x: 40, y: 86, s: 58, o: 0.36 },
  ].map((b) => `radial-gradient(circle ${b.s}% at ${b.x}% ${b.y}%, ${rgba(b.c, b.o)} 0%, ${rgba(b.c, 0)} 70%)`).join(",");
  return `<div style="position:absolute;inset:0;background:${th.bg};overflow:hidden;">
    <div class="${id}-wash" style="position:absolute;inset:${r(-U(120))}cqw;background:${blooms};"></div>
    <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 50%, transparent 45%, ${rgba("#000000", 0.5)} 100%);"></div>
  </div>`;
}
const washTweens = (id, ctx) => [
  `tl.to(".${id}-wash",{x:"${r(U(26))}cqw",y:"${r(-U(20))}cqw",duration:${r(Math.max(3, ctx.L * 1.4))},ease:"sine.inOut",repeat:${K.reps(ctx.L, Math.max(3, ctx.L * 1.4))},yoyo:true},${r(ctx.T)});`,
];

// The segmented story bar — one segment per scene, the current one filling in real time.
function storyBar(ctx) {
  const { th, total, i, id } = ctx;
  const w = (U(1080) - U(120) - U(8) * (total - 1)) / total;
  return `<div style="position:absolute;top:${r(U(56))}cqw;left:${r(U(60))}cqw;display:flex;gap:${r(U(8))}cqw;z-index:45;">
    ${Array.from({ length: total }, (_, k) => `<div style="width:${r(w)}cqw;height:${r(U(6))}cqw;border-radius:${r(U(6))}cqw;background:${rgba(th.ink, 0.24)};overflow:hidden;">
      <div ${k === i ? `class="${id}-seg"` : ""} style="width:100%;height:100%;background:${th.accent};transform:scaleX(${k < i ? 1 : 0});transform-origin:left center;"></div>
    </div>`).join("")}
  </div>`;
}

// A sticker card — white, hard offset shadow, slight tilt. Drawn only around real content.
const cardStyle = (th, tilt = 0) =>
  `background:${th.panel};border-radius:${r(U(28))}cqw;box-shadow:${r(U(12))}cqw ${r(U(12))}cqw 0 ${th.accent};rotate:${tilt}deg;`;

// ---- scenes ------------------------------------------------------------------
// HOOK — stacked heavy type, each line on its own beat, over the wash. This is the beat that
// has to stop a thumb, so it is type-first whether or not a picture arrived.
function sHook(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const shot = shots[0] || null;
  const head = K.fitLines(scene.headline || scene.title || ctx.title, U(920) / K.camSafe(), U(150), 4, th.adv);
  const kick = String(scene.kicker || STRINGS.hook).toUpperCase().slice(0, 26);

  return {
    backdrop: wash(id, th),
    chrome: storyBar(ctx),
    html: `
    <div class="${id}-kick" style="position:absolute;left:${r(U(80))}cqw;top:${r(U(300))}cqw;padding:${r(U(12))}cqw ${r(U(26))}cqw;border-radius:${r(U(100))}cqw;background:${th.accent};color:${K.inkOn(th.accent)};font-family:${th.displayStack};font-weight:800;font-size:${r(U(28))}cqw;letter-spacing:0.14em;text-transform:uppercase;display:inline-block;opacity:0;">${esc(kick)}</div>
    <div class="${id}-head" style="position:absolute;left:${r(U(80))}cqw;top:${r(U(400))}cqw;width:${r(U(920))}cqw;font-family:${th.displayStack};font-weight:800;font-size:${r(head.size)}cqw;line-height:0.94;letter-spacing:-0.04em;text-transform:uppercase;color:${th.ink};">
      ${head.lines.map((l) => `<span class="kw" style="display:block;overflow:hidden;"><span class="kwi ${id}-l" style="display:block;">${esc(l)}</span></span>`).join("")}
    </div>
    ${shot ? `<div class="${id}-card" style="position:absolute;left:${r(U(90))}cqw;top:${r(U(1030))}cqw;width:${r(U(900))}cqw;height:${r(U(660))}cqw;${cardStyle(th, -2)}overflow:hidden;opacity:0;">${K.shotFill(shot, { bg: th.panel })}</div>`
    : (scene.subtext ? `<div class="${id}-sub" style="position:absolute;left:${r(U(80))}cqw;top:${r(U(1080))}cqw;width:${r(U(880))}cqw;font-family:${th.displayStack};font-weight:500;font-size:${r(U(40))}cqw;line-height:1.4;color:${th.sub};opacity:0;">${esc(String(scene.subtext).slice(0, 150))}</div>` : "")}`,
    s: [
      `tl.fromTo(".${id}-kick",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:${du(0.4)},ease:"back.out(2.4)"},${at(0.2)});`,
      `tl.fromTo(".${id}-l",{yPercent:112},{yPercent:0,duration:${du(0.44)},ease:"back.out(1.5)",stagger:${du(0.16)}},${at(0.45)});`,
      shot ? `tl.fromTo(".${id}-card",{opacity:0,y:"${r(U(70))}cqw",rotate:-8},{opacity:1,y:0,rotate:-2,duration:${du(0.6)},ease:"back.out(1.4)"},${at(1.1)});` : "",
      !shot && scene.subtext ? `tl.fromTo(".${id}-sub",{opacity:0,y:"${r(U(30))}cqw"},{opacity:1,y:0,duration:${du(0.5)},ease:"power3.out"},${at(1.1)});` : "",
      ...washTweens(id, ctx),
    ].filter(Boolean),
  };
}

// SHOW — the picture beat: a tall sticker card carrying the screenshot, a caption chip over
// its corner. Skipped entirely without a picture (the kit hands the beat to `statement`).
function sShow(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const shot = shots[0] || null;
  if (!shot) return { ...K.statement(scene, ctx), backdrop: wash(id, th), chrome: storyBar(ctx) };
  const head = K.fitLines(scene.headline || scene.title || "", U(920) / K.camSafe(), U(84), 2, th.adv);
  const list = K.bullets(scene, 2);
  // The callouts land ON the screenshot, so they have to finish INSIDE it — pinned to an
  // absolute y they straddled the card's bottom edge and hung into the ground below it.
  const CARD_BOT = U(1580), CHIP_H = U(76), CHIP_STEP = U(110);
  const chipTop = CARD_BOT - U(48) - CHIP_H - Math.max(0, list.length - 1) * CHIP_STEP;

  return {
    backdrop: wash(id, th),
    chrome: storyBar(ctx),
    html: `
    <div class="${id}-head" style="position:absolute;left:${r(U(80))}cqw;top:${r(U(240))}cqw;width:${r(U(920))}cqw;font-family:${th.displayStack};font-weight:800;font-size:${r(head.size)}cqw;line-height:0.98;letter-spacing:-0.03em;text-transform:uppercase;color:${th.ink};opacity:0;">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
    <div class="${id}-card" style="position:absolute;left:${r(U(80))}cqw;top:${r(U(500))}cqw;width:${r(U(920))}cqw;height:${r(U(1080))}cqw;${cardStyle(th, 1.5)}overflow:hidden;opacity:0;">${K.shotFill(shot, { bg: th.panel })}</div>
    ${list.map((b, i) => `<div class="${id}-chip" style="position:absolute;left:${r(U(120) + (i % 2) * U(60))}cqw;top:${r(chipTop + i * CHIP_STEP)}cqw;padding:${r(U(16))}cqw ${r(U(30))}cqw;border-radius:${r(U(100))}cqw;background:${th.accent};color:${K.inkOn(th.accent)};font-family:${th.displayStack};font-weight:800;font-size:${r(U(34))}cqw;letter-spacing:-0.01em;white-space:nowrap;box-shadow:${r(U(6))}cqw ${r(U(6))}cqw 0 ${rgba("#000000", 0.35)};opacity:0;z-index:6;">${esc(String(b).slice(0, 24))}</div>`).join("")}`,
    s: [
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(34))}cqw"},{opacity:1,y:0,duration:${du(0.5)},ease:"power3.out"},${at(0.2)});`,
      `tl.fromTo(".${id}-card",{opacity:0,y:"${r(U(90))}cqw",scale:0.94},{opacity:1,y:0,scale:1,duration:${du(0.65)},ease:"back.out(1.3)"},${at(0.4)});`,
      list.length ? `tl.fromTo(".${id}-chip",{opacity:0,scale:0.4},{opacity:1,scale:1,duration:${du(0.4)},ease:"back.out(2.6)",stagger:${du(0.22)}},${at(1.1)});` : "",
      ...washTweens(id, ctx),
    ].filter(Boolean),
  };
}

// PERKS — the reasons, as a stack of tilted sticker rows that snap in alternating from each side.
function sPerks(scene, ctx) {
  const { id, th, at, du } = ctx;
  const list = K.bullets(scene, 4);
  if (list.length < 2) return { ...K.statement(scene, ctx), backdrop: wash(id, th), chrome: storyBar(ctx) };
  const head = K.fitLines(scene.headline || scene.title || "", U(920) / K.camSafe(), U(96), 2, th.adv);
  const top = U(620), rowH = Math.min(U(230), (U(1660) - top) / list.length);

  return {
    backdrop: wash(id, th),
    chrome: storyBar(ctx),
    html: `
    <div class="${id}-head" style="position:absolute;left:${r(U(80))}cqw;top:${r(U(280))}cqw;width:${r(U(920))}cqw;font-family:${th.displayStack};font-weight:800;font-size:${r(head.size)}cqw;line-height:0.96;letter-spacing:-0.04em;text-transform:uppercase;color:${th.ink};opacity:0;">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
    ${list.map((b, i) => `<div class="${id}-p${i}" style="position:absolute;left:${r(U(80))}cqw;top:${r(top + i * rowH)}cqw;width:${r(U(900))}cqw;padding:${r(U(30))}cqw ${r(U(36))}cqw;${cardStyle(th, i % 2 ? 1.4 : -1.4)}display:flex;align-items:center;gap:${r(U(24))}cqw;opacity:0;">
      <span style="width:${r(U(56))}cqw;height:${r(U(56))}cqw;border-radius:50%;background:${th.accent};color:${K.inkOn(th.accent)};display:grid;place-items:center;font-family:${th.displayStack};font-weight:800;font-size:${r(U(28))}cqw;flex:0 0 auto;">${K.pad2(i + 1)}</span>
      <span style="font-family:${th.displayStack};font-weight:700;font-size:${r(U(38))}cqw;line-height:1.2;color:${th.cardInk};">${esc(String(b).slice(0, 40))}</span>
    </div>`).join("")}`,
    s: [
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(34))}cqw"},{opacity:1,y:0,duration:${du(0.5)},ease:"power3.out"},${at(0.2)});`,
      ...list.map((b, i) => `tl.fromTo(".${id}-p${i}",{opacity:0,x:"${r((i % 2 ? 1 : -1) * U(220))}cqw"},{opacity:1,x:0,duration:${du(0.45)},ease:"back.out(1.6)"},${at(0.6 + i * 0.26)});`),
      ...washTweens(id, ctx),
    ],
  };
}

// NUMBERS — big figures on sticker cards. Nothing here is invented: the figures come from the
// script, and they land EARLY so most sampled frames show the real value.
// PROOF — the social-proof beat: five stars, the quote set as kinetic caption words, and a row
// of overlapping avatar discs. RESTORED 4 Aug 2026 — the bundle-derived port dropped it, and it
// is the only beat in the film that carries a testimonial.
// Reference geometry: block 80/80 at top 420, stars 90px/0.1em, words 72px, avatars 70px with a
// -22px overlap and a 4px white ring, attribution 32px.
function sProof(scene, ctx) {
  const { id, th, at, du } = ctx;
  const words = K.wordsOf(scene.emphasis || scene.headline || "").slice(0, 16);
  if (words.length < 3) return { ...K.statement(scene, ctx), backdrop: wash(id, th), chrome: storyBar(ctx) };
  const run = words.join(" ");
  const size = Math.min(U(72), ((U(920) / K.camSafe()) * 0.92 * 3) / Math.max(1, run.length * th.adv));
  const by = String(scene.subtext || "").trim().slice(0, 40);
  return {
    backdrop: wash(id, th),
    chrome: storyBar(ctx),
    html: `
    <div style="position:absolute;left:${r(U(80))}cqw;right:${r(U(80))}cqw;top:${r(U(420))}cqw;">
      <div class="${id}-stars" style="font-size:${r(U(90))}cqw;letter-spacing:0.1em;text-align:center;margin-bottom:${r(U(20))}cqw;line-height:1;opacity:0;">★★★★★</div>
      <div style="text-align:center;">
        ${words.map((w) => `<span class="${id}-w" style="display:inline-block;font-family:${th.displayStack};font-weight:800;font-size:${r(size)}cqw;line-height:1.2;color:${th.ink};margin:0 ${r(U(10))}cqw ${r(U(6))}cqw 0;opacity:0;">${esc(w)}</span>`).join("")}
      </div>
      ${by ? `<div class="${id}-by" style="margin-top:${r(U(60))}cqw;display:flex;align-items:center;justify-content:center;gap:${r(U(20))}cqw;opacity:0;">
        <span style="display:flex;">${[th.c1, th.c2, th.c3].map((c, i) => `<span style="width:${r(U(70))}cqw;height:${r(U(70))}cqw;border-radius:50%;background:${c};border:${r(U(4))}cqw solid #fff;box-sizing:border-box;${i ? `margin-left:${r(-U(22))}cqw;` : ""}"></span>`).join("")}</span>
        <span style="font-family:${th.displayStack};font-weight:800;font-size:${r(U(32))}cqw;color:${th.ink};">${esc(by)}</span>
      </div>` : ""}
    </div>`,
    s: [
      `tl.fromTo(".${id}-stars",{opacity:0,scale:0.4},{opacity:1,scale:1,duration:${du(0.4)},ease:"back.out(1.8)"},${at(0.1)});`,
      `tl.fromTo(".${id}-w",{opacity:0,y:"${r(U(26))}cqw"},{opacity:1,y:0,duration:${du(0.2)},ease:"back.out(1.7)",stagger:${du(0.1)}},${at(0.24)});`,
      by ? `tl.fromTo(".${id}-by",{opacity:0,y:"${r(U(30))}cqw"},{opacity:1,y:0,duration:${du(0.3)},ease:"power3.out"},${at(0.72)});` : "",
      ...washTweens(id, ctx),
    ].filter(Boolean),
  };
}

// DELIBERATE DEVIATION: the reference carries no picture on this beat. It takes one here — a
// heavily-scrimmed band behind the cards — for a structural reason. The stats rule makes every
// OTHER role decline a figures beat, so on a five-scene deck the figures beat occupies a slot a
// picture beat would have had, and a collected asset is stranded (the portrait guard fails).
// The scrim is heavy enough that the beat still reads as the pack's violet wash.
function sNumbers(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const stats = K.numbersIn(scene, 3);
  if (stats.length < 2) return { ...K.statement(scene, ctx, { centred: true }), backdrop: wash(id, th), chrome: storyBar(ctx) };
  const bg = (shots || [])[0] || null;
  const head = K.fitLines(scene.headline || scene.title || "", U(920) / K.camSafe(), U(92), 2, th.adv);
  const top = U(620), rowH = Math.min(U(320), (U(1680) - top) / stats.length);
  const ground = bg
    ? `<div style="position:absolute;inset:0;background:${th.bg};overflow:hidden;">
        <div class="${id}-nb" style="position:absolute;inset:0;">${K.shotFill(bg, { bg: th.bg })}</div>
        <div style="position:absolute;inset:0;background:${rgba(th.bg, 0.88)};"></div>
      </div>`
    : wash(id, th);

  return {
    backdrop: ground,
    chrome: storyBar(ctx),
    html: `
    <div class="${id}-head" style="position:absolute;left:${r(U(80))}cqw;top:${r(U(300))}cqw;width:${r(U(920))}cqw;font-family:${th.displayStack};font-weight:800;font-size:${r(head.size)}cqw;line-height:0.96;letter-spacing:-0.04em;text-transform:uppercase;color:${th.ink};opacity:0;">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
    ${stats.map((st, i) => `<div class="${id}-c${i}" style="position:absolute;left:${r(U(80))}cqw;top:${r(top + i * rowH)}cqw;width:${r(U(900))}cqw;height:${r(rowH - U(30))}cqw;${cardStyle(th, i % 2 ? -1.2 : 1.2)}display:flex;align-items:center;justify-content:space-between;padding:0 ${r(U(46))}cqw;opacity:0;">
      <span style="font-family:${th.displayStack};font-weight:800;font-size:${r(U(112))}cqw;line-height:1;letter-spacing:-0.05em;color:${th.cardInk};white-space:nowrap;"><span class="${id}-n${i}">0</span>${esc(st.suffix)}</span>
      <span style="font-family:${th.monoStack};font-size:${r(U(24))}cqw;letter-spacing:0.16em;color:${rgba(th.cardInk, 0.6)};text-align:right;white-space:nowrap;">${esc(K.statLabel(scene, i))}</span>
    </div>`).join("")}`,
    s: [
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(34))}cqw"},{opacity:1,y:0,duration:${du(0.5)},ease:"power3.out"},${at(0.2)});`,
      ...stats.flatMap((st, i) => {
        const num = Number(String(st.v).replace(/,/g, "")) || 0;
        const dp = String(st.v).includes(".") ? 1 : 0;
        return [
          `tl.fromTo(".${id}-c${i}",{opacity:0,scale:0.7},{opacity:1,scale:1,duration:${du(0.42)},ease:"back.out(2.2)"},${at(0.6 + i * 0.26)});`,
          `tl.fromTo(".${id}-n${i}",{innerText:0},{innerText:${num},duration:${du(0.66)},ease:"power2.out",snap:{innerText:${dp ? 0.1 : 1}},onUpdate:function(){var e=document.querySelector(".${id}-n${i}");if(e)e.textContent=Number(e.textContent).toFixed(${dp});}},${at(0.72 + i * 0.26)});`,
        ];
      }),
      ...washTweens(id, ctx),
    ],
  };
}

// CTA — the close. The mark, the call on a lime pill, the handle.
function sCta(scene, ctx, logo) {
  const { id, th, at, du } = ctx;
  const head = K.fitLines(scene.headline || scene.emphasis || ctx.title, U(920) / K.camSafe(), U(140), 3, th.adv);
  const action = K.clampWords(String(scene.emphasis || ""), 20) || STRINGS.go;
  const hasMark = !!(logo && logo.path);

  return {
    backdrop: wash(id, th),
    chrome: storyBar(ctx),
    html: `
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 ${r(U(80))}cqw;">
      ${hasMark ? `<div class="${id}-logo" style="width:${r(U(160))}cqw;height:${r(U(160))}cqw;border-radius:${r(U(36))}cqw;${cardStyle(th, -3)}padding:${r(U(24))}cqw;margin-bottom:${r(U(50))}cqw;display:flex;align-items:center;justify-content:center;opacity:0;"><img src="${esc(logo.path)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain;"></div>` : ""}
      <div class="${id}-head" style="width:100%;text-align:center;font-family:${th.displayStack};font-weight:800;font-size:${r(head.size)}cqw;line-height:0.94;letter-spacing:-0.04em;text-transform:uppercase;color:${th.ink};">
        ${head.lines.map((l) => `<span class="kw" style="display:block;overflow:hidden;"><span class="kwi ${id}-l" style="display:block;">${esc(l)}</span></span>`).join("")}
      </div>
      <div class="${id}-pill" style="margin-top:${r(U(60))}cqw;padding:${r(U(28))}cqw ${r(U(56))}cqw;border-radius:${r(U(100))}cqw;background:${th.accent};color:${K.inkOn(th.accent)};font-family:${th.displayStack};font-weight:800;font-size:${r(K.fitOne(action, U(700), U(46), th.adv))}cqw;letter-spacing:-0.01em;text-transform:uppercase;white-space:nowrap;box-shadow:${r(U(10))}cqw ${r(U(10))}cqw 0 ${rgba("#000000", 0.4)};opacity:0;">${esc(action)}</div>
      <div class="${id}-url" style="margin-top:${r(U(34))}cqw;font-family:${th.monoStack};font-size:${r(U(28))}cqw;letter-spacing:0.14em;color:${th.sub};opacity:0;">${esc(ctx.url)}</div>
    </div>`,
    s: [
      hasMark ? `tl.fromTo(".${id}-logo",{opacity:0,scale:0.5,rotate:-14},{opacity:1,scale:1,rotate:-3,duration:${du(0.5)},ease:"back.out(2)"},${at(0.25)});` : "",
      `tl.fromTo(".${id}-l",{yPercent:112},{yPercent:0,duration:${du(0.44)},ease:"back.out(1.5)",stagger:${du(0.15)}},${at(0.5)});`,
      `tl.fromTo(".${id}-pill",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:${du(0.5)},ease:"back.out(2.4)"},${at(1.2)});`,
      `tl.fromTo(".${id}-url",{opacity:0},{opacity:1,duration:${du(0.35)},ease:"none"},${at(1.45)});`,
      ...washTweens(id, ctx),
    ].filter(Boolean),
  };
}

// ---- spine -------------------------------------------------------------------
const SPEC = {
  first: "hook", last: "cta",
  middle: ["show", "perks", "numbers", "proof"],
  shapes: { hook: [900 / 660], show: [920 / 1080], perks: [], proof: [], numbers: [1080 / 1920], cta: [], statement: [], "statement-c": [] },
  slots: (role, budget) => (role === "hook" || role === "show" ? 1 : role === "numbers" ? Math.min(1, Math.max(0, budget)) : 0),
  needs: (role) => (role === "show" ? 1 : 0),
  carry: (role, scene, budget) => {
    // Roles are picked by a ROTATING cursor, not by priority. `numbers` is the only layout that
    // prints figures AS figures, so every other role declines a beat carrying two or more.
    const isStats = K.numbersIn(scene).length >= 2;
    if (role === "numbers") return isStats;
    if (isStats) return false;
    if (role === "show") return budget >= 1;
    if (role === "perks") return K.bullets(scene, 4).length >= 2;
    if (role === "proof") return K.wordsOf(scene.emphasis || scene.headline || "").length >= 3;
    return true;
  },
};
// THE STORY BAR IS THIS PACK'S PROGRESS CHROME, and it does not fill the way the kit's rule
// does: the kit drives ONE rule across the whole film (scaleX = elapsed/total), whereas a story
// bar fills the CURRENT segment 0->1 across its own beat and leaves the earlier segments full.
// Rather than repeat that tween in six builders, every builder is wrapped with it here.
const segTween = (ctx) =>
  // The story bar tracks the BEAT the viewer is watching, not the clip's technical lifetime —
  // the clip now runs the cut's xfade longer, which would leave the segment still filling while
  // the next scene is already on screen.
  `tl.fromTo(".${ctx.id}-seg",{scaleX:0},{scaleX:1,duration:${r(ctx.L)},ease:"none"},${r(ctx.T)});`;

const RAW = {
  hook: sHook, show: sShow, perks: sPerks, proof: sProof, numbers: sNumbers, cta: sCta,
  statement: (sc, ctx) => ({ ...K.statement(sc, ctx), backdrop: wash(ctx.id, ctx.th), chrome: storyBar(ctx) }),
  "statement-c": (sc, ctx) => ({ ...K.statement(sc, ctx, { centred: true }), backdrop: wash(ctx.id, ctx.th), chrome: storyBar(ctx) }),
};
const BUILDERS = Object.fromEntries(Object.entries(RAW).map(([k, fn]) => [k, (sc, ctx, sh) => {
  const built = fn(sc, ctx, sh);
  return { ...built, s: [...built.s, segTween(ctx)] };
}]));
const LABELS = { hook: STRINGS.hook, show: STRINGS.show, perks: STRINGS.perks, proof: STRINGS.proof, numbers: STRINGS.numbers, cta: STRINGS.go };

const css = (th, stage) => K.baseCss(th, stage, `
  .kw { display:block; overflow:hidden; }
  .kwi { display:block; will-change:transform; }
  #cap-pill { background:${rgba("#150A2E", 0.9)}; border:1px solid ${rgba(th.accent, 0.4)}; }
  #cap-text { color:${th.ink}; }`);

// The story bar is this pack's chrome, so it must be driven per scene like the kit's own
// progress rule — the segment for the CURRENT beat fills across that beat's clip.
function buildComposition(opts = {}) {
  const out = K.buildFilm({
    ...opts, stage: STAGE, theme, STRINGS, spec: SPEC, builders: BUILDERS, labels: LABELS,
    css, refBeat: 4.0, camera: { push: 90, scale: 1.03 },
    signature: "kinetic", fallbackBrand: "REEL",
  });
  return out;
}

module.exports = { buildComposition, STRINGS };
module.exports.__test = { SPEC, BUILDERS, theme, STAGE, VH };
