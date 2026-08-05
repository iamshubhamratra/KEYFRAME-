// EDITION — a printed broadsheet in motion. Native GSAP + DOM, built on om_port_kit.
//
// PROVENANCE. REBUILT 5 Aug 2026 against the READABLE reference
// `templete-design/all-template-handoffs/Edition/src/edition-film.jsx` (325 lines), replacing a
// port that had been reverse-engineered from the gzip+base64 bundle. Scene coverage was already
// 6/6; what the decompiled port had lost was the FURNITURE — see TEMPLATE-FIDELITY-AUDIT.md §4
// for the line-by-line list this rebuild closes.
//
// Every geometry number below is the reference's own, in its authored 1920x1080 pixel space,
// converted by U(px) = px/1920*100 -> cqw. Where a number differs from the reference it is
// because the copy is AI-authored and variable-length, so the type must MEASURE (fitLines /
// fitOne) where the reference could hard-code against known copy. Those are the only deltas.
//
// THE LOOK. Warm newsprint stock, near-black ink, one editorial red. Anton set enormous and
// tight; a persistent press layer that never stops moving; hairline rules that draw across the
// measure; figure plates with the caption INSIDE the keyline; a masthead and a scrolling
// marquee on every page.
//
// FONT SUBSTITUTION: none. Anton (display), Spectral (body serif), Archivo (labels) are all
// bundled — see src/fonts/pack_fonts.js. The previous port substituted JetBrains Mono for BOTH
// Spectral and Archivo, which is most of why it read as a tidy slide rather than a printed page.

const K = require("./om_port_kit");
const { r, esc, rgba } = K;

const STAGE = K.stageOf(1920, 1080);
const { U } = STAGE;

const PAPER = "#EFE9DA", INK = "#16130D", SUB = "#6A6252", ACCENT = "#DA3A24";
const DISPLAY = "Anton", LABEL = "Archivo", BODY = "Spectral";
const ADV = 0.50;   // uppercase Anton is condensed; deliberately on the safe side

const STRINGS = {
  cover: "COVER", lead: "LEAD", spread: "SPREAD", ledger: "INDEX", quote: "COMMENT",
  scene: "PAGE", of: "OF", read: "READ ON", ed: "EDITION",
  masthead: "The Masthead", leadFeature: "Lead Feature", theSpread: "The Spread",
  numbers: "By the Numbers", marginalia: "Marginalia", colophon: "Colophon",
  firstIssue: "The first issue of", editors: "The Editors", subscribe: "SUBSCRIBE",
  dashboard: "DASHBOARD", overview: "OVERVIEW", mobile: "MOBILE", detail: "DETAIL", logo: "LOGO",
};

function theme(brandSkin) {
  const { accent, resolvedBrand } = K.resolveAccent(brandSkin, { ground: PAPER, isDark: false, packAccent: ACCENT });
  return {
    accent, bg: PAPER, panel: "#FFFFFF", ink: INK, sub: SUB,
    blue: K.spin(accent, 158, -0.14), rule: INK,
    adv: ADV,
    capBg: PAPER, capInk: INK,
    ...K.fontStacks(DISPLAY, LABEL, `'${BODY}', Georgia, serif`, [BODY]),
    bodyStack: `'${BODY}', Georgia, serif`,
    resolvedBrand,
  };
}

// ---- the page ----------------------------------------------------------------
const M = U(64);                                  // reference page margin
const GW = U(1920) - M * 2;                       // the measure
const COLS = 6;
const CW = GW / COLS;
const cx = (i) => M + CW * i;

// THE PRESS LAYER — reference LiveBG, drawn under EVERY scene and never still. Four pieces,
// each transcribed: a 34px dot grid creeping diagonally, the 12-column measure creeping
// sideways, the alignment discs turning at (1560,300), and four crosshairs pulsing at the
// corners. The decompiled port had none of it; it had one static radial highlight.
const REG_PTS = [[180, 210], [1740, 250], [230, 900], [1700, 880]];
function press(id, th, { dark = false } = {}) {
  const ink = dark ? th.bg : th.ink;
  return `<div style="position:absolute;inset:0;background:${dark ? th.ink : th.bg};overflow:hidden;">
    ${K.dotField(th, { cls: `${id}-pr`, U, color: ink })}
    ${K.columnRules(th, { cls: `${id}-pr`, U, stageW: 1920, cols: 12, color: ink })}
    ${K.dashRings(th, { cls: `${id}-pr`, cx: 1560, cy: 300, opacity: dark ? 0.14 : 0.07, rings: [
      { r: 360, color: th.accent, w: 2, dash: "40 26" },
      { r: 250, color: ink, w: 1.5, dash: "14 20" },
    ] })}
    ${K.regMarks(th, { cls: `${id}-pr`, pts: REG_PTS, color: th.accent })}
  </div>`;
}
const pressTweens = (ctx) => [
  ...K.dotFieldTweens(ctx, { cls: `${ctx.id}-pr`, U }),
  ...K.columnRulesTweens(ctx, { cls: `${ctx.id}-pr`, U }),
  ...K.dashRingTweens(ctx, { cls: `${ctx.id}-pr`, cx: 1560, cy: 300 }),
  ...K.regMarkTweens(ctx, { cls: `${ctx.id}-pr` }),
];

// THE CHROME — masthead at y=40 and the marquee at y=1014 (reference: bottom:40, height 26).
// Reference draws it on every LIGHT scene and suppresses it on the dark PullQuote.
function chrome(ctx, label) {
  const { th } = ctx;
  const brand = String(ctx.brand || STRINGS.ed).toUpperCase();
  return `<div class="om-chrome">
    ${K.masthead(th, { U, y: U(40), pad: M, left: brand, mid: label, right: ctx.url, midStack: th.bodyStack })}
    ${K.marquee(th, { cls: ctx.id, U, text: `${brand} · ${ctx.url}`, y: U(1014) })}
  </div>`;
}
const chromeT = (ctx) => K.marqueeTweens(ctx, { cls: ctx.id, U });

// A drawn rule — the pack's primary punctuation. Reference RuleH / RuleV.
const ruleH = (th, { cls, x, y, w, weight = U(3), color = null }) =>
  `<div class="${cls}" style="position:absolute;left:${r(x)}cqw;top:${r(y)}cqw;width:${r(w)}cqw;height:${r(weight)}cqw;background:${color || th.ink};transform-origin:left center;scale:0 1;"></div>`;
const ruleV = (th, { cls, x, y, h, weight = U(3), color = null }) =>
  `<div class="${cls}" style="position:absolute;left:${r(x)}cqw;top:${r(y)}cqw;width:${r(weight)}cqw;height:${r(h)}cqw;background:${color || th.ink};transform-origin:top center;scale:1 0;"></div>`;
const drawH = (cls, ctx, at, du, d = 0.5) => `tl.fromTo(".${cls}",{scaleX:0},{scaleX:1,duration:${du(d)},ease:"power3.inOut"},${at});`;
const drawV = (cls, ctx, at, du, d = 0.5) => `tl.fromTo(".${cls}",{scaleY:0},{scaleY:1,duration:${du(d)},ease:"power3.inOut"},${at});`;

// ---- scenes ------------------------------------------------------------------
// COVER — the masthead page. Reference: ghost issue numeral 620px at 6% ink, an italic serif
// eyebrow, the brand at 260px, a 3px rule at y=664, the tagline, and FIG. I bottom-right.
function sCover(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const shot = shots[0] || null;
  const brand = String(ctx.brand || scene.headline || ctx.title || STRINGS.ed);
  const head = K.fitLines(brand, GW / K.camSafe(), U(260), 2, th.adv);
  const eyebrow = K.clampWords(String(scene.kicker || STRINGS.firstIssue), 34);
  const tagline = K.clampWords(String(scene.subtext || scene.body || ""), 150);

  return {
    backdrop: press(id, th),
    chrome: chrome(ctx, scene.kicker || STRINGS.masthead),
    html: `
    ${K.ghostNum(th, { cls: `${id}-gn`, U, text: K.pad2(ctx.i + 1), right: M, y: U(150), size: U(620) })}
    <div class="${id}-eb" style="position:absolute;left:${r(M)}cqw;top:${r(U(210))}cqw;font-family:${th.bodyStack};font-style:italic;font-size:${r(U(34))}cqw;color:${th.accent};opacity:0;">${esc(eyebrow)}</div>
    ${K.clipHead(th, { cls: `${id}-hd`, U, x: M, y: U(262), w: GW, lines: head.lines, size: head.size, lh: 0.82 })}
    ${ruleH(th, { cls: `${id}-r1`, x: M, y: U(664), w: GW })}
    ${tagline ? `<div class="${id}-tg" style="position:absolute;left:${r(M)}cqw;top:${r(U(690))}cqw;width:${r(U(760))}cqw;font-family:${th.bodyStack};font-size:${r(U(30))}cqw;line-height:1.4;color:${th.ink};opacity:0;">${esc(tagline)}</div>` : ""}
    ${K.figPlate(th, { cls: `${id}-p0`, U, x: U(1920) - M - U(720), y: U(730), w: U(720), h: U(280), shot, fig: "I", label: STRINGS.cover, shotFill: K.shotFill })}`,
    s: [
      ...pressTweens(ctx), ...chromeT(ctx),
      ...K.ghostNumTweens(ctx, { cls: `${id}-gn`, U, amp: 20 }),
      `tl.fromTo(".${id}-eb",{opacity:0,y:"${r(U(26))}cqw"},{opacity:1,y:0,duration:${du(0.3)},ease:"power3.out"},${at(0.1)});`,
      ...K.clipHeadTweens(ctx, { cls: `${id}-hd`, at, du }),
      drawH(`${id}-r1`, ctx, at(0.7), du),
      tagline ? `tl.fromTo(".${id}-tg",{opacity:0,y:"${r(U(22))}cqw"},{opacity:1,y:0,duration:${du(0.35)},ease:"power3.out"},${at(0.85)});` : "",
      ...(shot ? K.figPlateTweens(ctx, { cls: `${id}-p0`, at, du, U, seed: 1 }) : []),
    ].filter(Boolean),
  };
}

// LEAD — reference: accent ghost numeral 300px, a vertical rule at x=64, headline 118px in an
// 780px column at x=96, a serif standfirst, a BORDERED CHIP ROW, and FIG. II 900x780 at right.
// The decompiled port had a numbered list where the chips belong and no ghost numeral.
function sLead(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const shot = shots[0] || null;
  const COL = shot ? U(780) : GW;
  const head = K.fitLines(scene.headline || scene.title || "", COL / K.camSafe(), U(118), 3, th.adv);
  const body = K.clampWords(String(scene.subtext || scene.body || ""), 220);
  const chips = K.bullets(scene, 3).map((b) => K.clampWords(String(b).toUpperCase(), 22));
  const headBot = U(480) + head.lines.length * head.size * 0.9 + U(40);

  return {
    backdrop: press(id, th),
    chrome: chrome(ctx, scene.kicker || STRINGS.leadFeature),
    html: `
    ${K.ghostNum(th, { cls: `${id}-gn`, U, text: K.pad2(ctx.i + 1), x: M, y: U(150), size: U(300), color: th.accent })}
    ${ruleV(th, { cls: `${id}-rv`, x: M, y: U(470), h: U(1080) - U(470) - U(140) })}
    ${K.clipHead(th, { cls: `${id}-hd`, U, x: U(96), y: U(480), w: COL, lines: head.lines, size: head.size, lh: 0.9, measure: false })}
    ${body ? `<div class="${id}-bd" style="position:absolute;left:${r(U(96))}cqw;top:${r(headBot)}cqw;width:${r(Math.min(COL, U(640)))}cqw;font-family:${th.bodyStack};font-size:${r(U(27))}cqw;line-height:1.5;color:${th.ink};opacity:0;">${esc(body)}</div>` : ""}
    ${chips.length ? `<div style="position:absolute;left:${r(U(96))}cqw;top:${r(headBot + U(120))}cqw;width:${r(COL)}cqw;display:flex;flex-wrap:wrap;border-top:${r(U(2))}cqw solid ${th.ink};">
      ${chips.map((c) => `<span class="${id}-ch" style="padding:${r(U(12))}cqw ${r(U(22))}cqw;border-right:${r(U(2))}cqw solid ${th.ink};font-family:${th.monoStack};font-weight:800;font-size:${r(U(15))}cqw;letter-spacing:0.08em;color:${th.ink};opacity:0;">${esc(c)}</span>`).join("")}
    </div>` : ""}
    ${K.figPlate(th, { cls: `${id}-p0`, U, x: U(1920) - M - U(900), y: U(150), w: U(900), h: U(780), shot, fig: "II", label: STRINGS.dashboard, shotFill: K.shotFill })}`,
    s: [
      ...pressTweens(ctx), ...chromeT(ctx),
      ...K.ghostNumTweens(ctx, { cls: `${id}-gn`, U, amp: 10, rot: 2 }),
      drawV(`${id}-rv`, ctx, at(0.2), du),
      ...K.clipHeadTweens(ctx, { cls: `${id}-hd`, at, du, measure: false }),
      body ? `tl.fromTo(".${id}-bd",{opacity:0,y:"${r(U(22))}cqw"},{opacity:1,y:0,duration:${du(0.35)},ease:"power3.out"},${at(0.55)});` : "",
      chips.length ? `tl.fromTo(".${id}-ch",{opacity:0,y:"${r(U(14))}cqw"},{opacity:1,y:0,duration:${du(0.28)},ease:"power3.out",stagger:${du(0.09)}},${at(0.8)});` : "",
      ...(shot ? K.figPlateTweens(ctx, { cls: `${id}-p0`, at, du, U, seed: 2 }) : []),
    ].filter(Boolean),
  };
}

// SPREAD — the reference's multi-plate page. Its plate boxes are transcribed EXACTLY now: the
// caption bar lives inside the keyline (K.figPlate), which is why the reference can stack them
// 28px apart. The previous port put captions outside and had to re-space the whole page.
const SPREAD_BOXES = [
  { x: U(720), y: U(300), w: U(620), h: U(340), fig: "III", label: STRINGS.overview },
  { x: U(1370), y: U(210), w: U(300), h: U(520), fig: "IV", label: STRINGS.mobile },
  { x: U(720), y: U(668), w: U(620), h: U(300), fig: "V", label: STRINGS.detail },
];
function sSpread(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  if (!shots.length) return { ...K.statement(scene, ctx), backdrop: press(id, th), chrome: chrome(ctx, STRINGS.theSpread) };
  const head = K.fitLines(scene.headline || scene.title || "", U(600) / K.camSafe(), U(132), 3, th.adv);
  const body = K.clampWords(String(scene.subtext || scene.body || ""), 190);
  // The reference pins the standfirst at y=420 because its headline is two known lines. Ours is
  // AI-authored: "FINANCIAL OPERATING SYSTEM" set three lines deep, ran to 22.15cqw and printed
  // straight through the body pinned at 21.88cqw. A fixed y is only safe against fixed copy, so
  // the standfirst now clears whatever the headline actually measured.
  const headBot = U(140) + head.lines.length * head.size * 0.86 + U(46);
  const bodyTop = Math.max(U(420), headBot);
  const n = Math.min(3, shots.length);
  // A short deck must not leave a keyline standing empty, so fewer pictures re-flow the page
  // rather than drawing an unfilled plate.
  const boxes = n === 1 ? [{ ...SPREAD_BOXES[0], x: U(720), y: U(240), w: U(1130), h: U(600) }]
    : n === 2 ? [SPREAD_BOXES[0], { ...SPREAD_BOXES[1], y: U(290), h: U(500) }]
      : SPREAD_BOXES;

  return {
    backdrop: press(id, th),
    chrome: chrome(ctx, scene.kicker || STRINGS.theSpread),
    html: `
    ${K.clipHead(th, { cls: `${id}-hd`, U, x: M, y: U(140), w: U(600), lines: head.lines, size: head.size, lh: 0.86 })}
    ${body ? `<div class="${id}-bd" style="position:absolute;left:${r(M)}cqw;top:${r(bodyTop)}cqw;width:${r(U(620))}cqw;font-family:${th.bodyStack};font-size:${r(U(26))}cqw;line-height:1.5;color:${th.ink};opacity:0;">${esc(body)}</div>` : ""}
    ${boxes.map((b, i) => K.figPlate(th, { cls: `${id}-p${i}`, U, x: b.x, y: b.y, w: b.w, h: b.h, shot: shots[i], fig: b.fig, label: b.label, shotFill: K.shotFill })).join("")}`,
    s: [
      ...pressTweens(ctx), ...chromeT(ctx),
      ...K.clipHeadTweens(ctx, { cls: `${id}-hd`, at, du }),
      body ? `tl.fromTo(".${id}-bd",{opacity:0,y:"${r(U(18))}cqw"},{opacity:1,y:0,duration:${du(0.3)},ease:"power3.out"},${at(0.3)});` : "",
      ...boxes.flatMap((_b, i) => K.figPlateTweens(ctx, { cls: `${id}-p${i}`, at: (o) => at(0.2 + i * 0.14 + o), du, U, seed: i * 2 })),
    ].filter(Boolean),
  };
}

// LEDGER — reference: a rolling COUNTER per row, a travelling accent tick on each rule, italic
// serif labels at 40px and Anton values at 130px. The decompiled port printed a plain numbered
// bullet list with no figures at all — the one layout in this pack that sets numbers AS numbers.
function sLedger(scene, ctx) {
  const { id, th, at, du } = ctx;
  const figs = K.numbersIn(scene, 3);
  const list = K.bullets(scene, 3);
  if (figs.length < 2 && list.length < 2) return { ...K.statement(scene, ctx), backdrop: press(id, th), chrome: chrome(ctx, STRINGS.numbers) };
  const head = K.fitLines(scene.headline || scene.title || "", GW / K.camSafe(), U(150), 2, th.adv);
  const rows = (figs.length >= 2 ? figs : list.slice(0, 3).map((b) => ({ v: "", suffix: "", label: b })))
    .map((f, i) => ({ v: f.v || "", suffix: f.suffix || "", label: K.statLabel(scene, i, 26) || String(f.label || "") }));
  const TOP = U(410), ROW = U(170);

  return {
    backdrop: press(id, th),
    chrome: chrome(ctx, scene.kicker || STRINGS.numbers),
    html: `
    ${K.clipHead(th, { cls: `${id}-hd`, U, x: M, y: U(150), w: GW, lines: head.lines, size: head.size, lh: 0.86 })}
    ${rows.map((row, i) => `
    <div style="position:absolute;left:${r(M)}cqw;top:${r(TOP + i * ROW)}cqw;width:${r(GW)}cqw;">
      ${ruleH(th, { cls: `${id}-rr${i}`, x: 0, y: 0, w: GW, weight: U(2) })}
      <div class="${id}-tk${i}" style="position:absolute;top:${r(-U(3))}cqw;left:0;width:${r(U(60))}cqw;height:${r(U(8))}cqw;background:${th.accent};opacity:0.6;"></div>
      <div class="${id}-rw" style="display:flex;align-items:baseline;justify-content:space-between;padding:${r(U(18))}cqw ${r(U(4))}cqw ${r(U(26))}cqw;opacity:0;">
        <span style="display:flex;align-items:baseline;gap:${r(U(30))}cqw;">
          <span style="font-family:${th.monoStack};font-weight:800;font-size:${r(U(22))}cqw;color:${th.accent};">${K.pad2(i + 1)}</span>
          <span style="font-family:${th.bodyStack};font-style:italic;font-size:${r(U(40))}cqw;color:${th.ink};">${esc(row.label)}</span>
        </span>
        ${row.v ? `<span class="${id}-nv${i}" style="font-family:${th.displayStack};font-size:${r(U(130))}cqw;line-height:0.8;color:${th.ink};">0${esc(row.suffix)}</span>` : ""}
      </div>
    </div>`).join("")}`,
    s: [
      ...pressTweens(ctx), ...chromeT(ctx),
      ...K.clipHeadTweens(ctx, { cls: `${id}-hd`, at, du }),
      ...rows.flatMap((row, i) => {
        const dp = String(row.v).includes(".") ? 1 : 0;
        const num = Number(String(row.v).replace(/,/g, "")) || 0;
        const tickDur = 4.2;
        return [
          drawH(`${id}-rr${i}`, ctx, at(0.2 + i * 0.12), du, 0.4),
          `tl.fromTo(".${id}-rw",{opacity:0,y:"${r(U(16))}cqw"},{opacity:1,y:0,duration:${du(0.3)},ease:"power3.out",stagger:${du(0.12)}},${at(0.3)});`,
          `tl.fromTo(".${id}-tk${i}",{x:0},{x:"${r(GW - U(60))}cqw",duration:${r(tickDur)},ease:"none",repeat:${K.reps(ctx.L, tickDur)}},${r(ctx.T + i * 0.5)});`,
          row.v ? `tl.fromTo(".${id}-nv${i}",{innerText:0},{innerText:${num},duration:${du(0.55)},ease:"expo.out",snap:{innerText:${dp ? 0.1 : 1}},onUpdate:function(){var e=document.querySelector(".${id}-nv${i}");if(e)e.textContent=Number(String(e.textContent).replace(/[^0-9.]/g,"")||0).toFixed(${dp})+${JSON.stringify(row.suffix)};}},${at(0.4 + i * 0.12)});` : "",
        ].filter(Boolean);
      }),
      // De-duplicate the shared row tween: it is emitted once per row above but targets them all.
    ].filter((x, i, a) => a.indexOf(x) === i),
  };
}

// PULLQUOTE — reference: a DARK page with no chrome, a 300px accent quote mark, the quote set
// per-word in SPECTRAL ITALIC at 92px, two drifting accent blocks, and a ruled attribution.
// The decompiled port set it on the cream sheet in uppercase Anton with no quote mark at all —
// the single largest single-scene deviation in the pack.
function sPullQuote(scene, ctx) {
  const { id, th, at, du } = ctx;
  const quote = String(scene.emphasis || scene.headline || scene.title || "");
  const words = K.wordsOf(quote).slice(0, 22);
  const who = K.clampWords(String(scene.subtext || "") || STRINGS.editors, 40);
  // The reference hard-codes 92px against known copy. Ours measures: a long AI headline at a
  // fixed 92 would overflow the 1660px measure and break mid-word.
  const size = K.fitOne(words.join(" "), (U(1660) * 2.6) / K.camSafe(), U(92), K.ADVANCE.mixed);

  return {
    backdrop: press(id, th, { dark: true }),
    chrome: "",                                   // reference suppresses chrome on the dark page
    capTint: th.bg,
    html: `
    <div class="${id}-b0" style="position:absolute;left:${r(U(1560))}cqw;top:${r(U(120))}cqw;width:${r(U(300))}cqw;height:${r(U(120))}cqw;background:${rgba(th.accent, 0.9)};"></div>
    <div class="${id}-b1" style="position:absolute;left:${r(U(120))}cqw;top:${r(U(820))}cqw;width:${r(U(200))}cqw;height:${r(U(90))}cqw;background:${rgba(th.accent, 0.9)};"></div>
    <div class="${id}-qm" style="position:absolute;left:${r(M)}cqw;top:${r(U(120))}cqw;font-family:${th.displayStack};font-size:${r(U(300))}cqw;line-height:0.7;color:${th.accent};transform-origin:left top;">&ldquo;</div>
    <div style="position:absolute;left:${r(U(120))}cqw;right:${r(U(140))}cqw;top:${r(U(330))}cqw;display:flex;flex-wrap:wrap;">
      ${words.map((w) => `<span class="${id}-w" style="font-family:${th.bodyStack};font-style:italic;font-weight:500;font-size:${r(size)}cqw;line-height:1.12;color:${th.bg};margin-right:${r(U(24))}cqw;opacity:0;">${esc(w)}</span>`).join("")}
    </div>
    <div class="${id}-at" style="position:absolute;left:${r(U(122))}cqw;top:${r(U(900))}cqw;display:flex;align-items:center;gap:${r(U(20))}cqw;opacity:0;">
      <span class="${id}-ar" style="width:${r(U(80))}cqw;height:${r(U(3))}cqw;background:${th.accent};transform-origin:left center;"></span>
      <span style="font-family:${th.monoStack};font-weight:800;font-size:${r(U(22))}cqw;letter-spacing:0.08em;color:${th.bg};text-transform:uppercase;">${esc(who)}</span>
    </div>`,
    s: [
      ...pressTweens(ctx),
      `tl.to(".${id}-b0",{x:"${r(U(60))}cqw",duration:5.2,ease:"sine.inOut",repeat:${K.reps(ctx.L, 5.2)},yoyo:true},${r(ctx.T)});`,
      `tl.to(".${id}-b1",{y:"${r(U(40))}cqw",duration:6.3,ease:"sine.inOut",repeat:${K.reps(ctx.L, 6.3)},yoyo:true},${r(ctx.T)});`,
      `tl.fromTo(".${id}-qm",{scale:0.97},{scale:1.03,duration:2.1,ease:"sine.inOut",repeat:${K.reps(ctx.L, 2.1)},yoyo:true},${r(ctx.T)});`,
      `tl.fromTo(".${id}-w",{opacity:0,y:"${r(U(16))}cqw"},{opacity:1,y:0,duration:${du(0.26)},ease:"power2.out",stagger:${du(0.05)}},${at(0.15)});`,
      `tl.fromTo(".${id}-at",{opacity:0},{opacity:1,duration:${du(0.3)},ease:"none"},${at(1.05)});`,
      `tl.fromTo(".${id}-ar",{scaleX:0},{scaleX:1,duration:${du(0.4)},ease:"power3.inOut"},${at(1.1)});`,
    ],
  };
}

// COLOPHON — reference: the PAPER back page with a FIG. VI logo plate, the sign-off at 210px, a
// vertical rule at x=1080, serif body, an ACCENT CTA BUTTON and the url. The decompiled port
// made the whole page full-bleed accent with no plate, no rule and no button.
function sColophon(scene, ctx, shots, logo) {
  const { id, th, at, du } = ctx;
  const head = K.fitLines(scene.headline || scene.emphasis || ctx.title, U(960) / K.camSafe(), U(210), 2, th.adv);
  const body = K.clampWords(String(scene.subtext || scene.body || ""), 180);
  // THE BUTTON IS NOT THE HEADLINE. Sourcing it from `emphasis` — the same field the headline
  // falls back to — printed "POWER YOUR" under a headline reading "POWER YOUR BUSINESS": a
  // chopped fragment of the sign-off masquerading as a call to action. Take a real CTA field if
  // the storyboard supplies one, use `emphasis` only when it is genuinely different copy, and
  // fall back to the generic label rather than ever printing a truncation.
  const headText = String(scene.headline || scene.emphasis || ctx.title || "").trim();
  const ctaSrc = String(scene.cta || scene.ctaText || "").trim()
    || (String(scene.emphasis || "").trim() && String(scene.emphasis).trim() !== headText ? String(scene.emphasis).trim() : "")
    || STRINGS.subscribe;
  const ctaFull = ctaSrc.toUpperCase();
  const ctaClamped = K.clampWords(ctaFull, 22);
  const cta = ctaClamped === ctaFull ? ctaFull : STRINGS.subscribe;
  const mark = logo && logo.path ? logo : null;

  return {
    backdrop: press(id, th),
    chrome: chrome(ctx, scene.kicker || STRINGS.colophon),
    html: `
    ${K.figPlate(th, { cls: `${id}-p0`, U, x: M, y: U(200), w: U(260), h: U(260), shot: mark, fig: "VI", label: STRINGS.logo, shotFill: (a, o) => `<img src="${esc(a.path)}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;padding:${r(U(22))}cqw;box-sizing:border-box;background:${o.bg};">` })}
    ${K.clipHead(th, { cls: `${id}-hd`, U, x: M, y: U(500), w: U(960), lines: head.lines, size: head.size, lh: 0.84, measure: false })}
    ${ruleV(th, { cls: `${id}-rv`, x: U(1080), y: U(200), h: U(680) })}
    <div style="position:absolute;left:${r(U(1140))}cqw;top:${r(U(210))}cqw;width:${r(U(700))}cqw;">
      ${body ? `<div class="${id}-bd" style="font-family:${th.bodyStack};font-size:${r(U(30))}cqw;line-height:1.5;color:${th.ink};opacity:0;">${esc(body)}</div>` : ""}
      <div class="${id}-ct" style="margin-top:${r(U(40))}cqw;display:inline-flex;align-items:center;gap:${r(U(16))}cqw;background:${th.accent};color:${K.inkOn(th.accent)};padding:${r(U(20))}cqw ${r(U(40))}cqw;font-family:${th.displayStack};font-size:${r(U(34))}cqw;letter-spacing:0.02em;text-transform:uppercase;opacity:0;">${esc(cta)} <span>&rarr;</span></div>
      <div class="${id}-ur" style="margin-top:${r(U(26))}cqw;font-family:${th.monoStack};font-weight:800;font-size:${r(U(20))}cqw;letter-spacing:0.12em;text-transform:uppercase;color:${th.ink};opacity:0;">${esc(ctx.url)}</div>
    </div>`,
    s: [
      ...pressTweens(ctx), ...chromeT(ctx),
      ...(mark ? K.figPlateTweens(ctx, { cls: `${id}-p0`, at, du, U, seed: 3, sheen: false }) : []),
      ...K.clipHeadTweens(ctx, { cls: `${id}-hd`, at, du, measure: false }),
      drawV(`${id}-rv`, ctx, at(0.4), du),
      body ? `tl.fromTo(".${id}-bd",{opacity:0,y:"${r(U(22))}cqw"},{opacity:1,y:0,duration:${du(0.34)},ease:"power3.out"},${at(0.6)});` : "",
      `tl.fromTo(".${id}-ct",{opacity:0,y:"${r(U(18))}cqw"},{opacity:1,y:0,duration:${du(0.34)},ease:"back.out(1.6)"},${at(0.9)});`,
      `tl.fromTo(".${id}-ur",{opacity:0},{opacity:1,duration:${du(0.3)},ease:"none"},${at(1.1)});`,
    ].filter(Boolean),
  };
}

// ---- spine -------------------------------------------------------------------
const SPEC = {
  first: "cover", last: "colophon",
  middle: ["lead", "spread", "ledger", "quote"],
  shapes: {
    cover: [720 / 280], lead: [900 / 780],
    spread: [620 / 340, 300 / 520, 620 / 300],
    ledger: [], quote: [], colophon: [], statement: [], "statement-c": [],
  },
  slots: (role, budget) => (role === "spread" ? Math.min(3, Math.max(0, budget)) : role === "cover" || role === "lead" ? 1 : 0),
  // SPREAD is the one beat that exists FOR its pictures. Cover and Lead print one but are
  // complete without it — the measure simply widens, and neither draws an empty keyline.
  needs: (role) => (role === "spread" ? 1 : 0),
  // Roles are picked by a ROTATING cursor, not by priority, so `ledger` — the only layout that
  // sets figures AS figures — must claim a beat carrying numbers before another role takes it.
  carry: (role, scene, budget) => {
    const isStats = K.numbersIn(scene).length >= 2;
    if (role === "ledger") return isStats || K.bullets(scene, 3).length >= 2;
    if (isStats) return false;
    if (role === "spread") return budget >= 1;
    if (role === "lead") return budget >= 1 || K.bullets(scene, 3).length >= 2;
    if (role === "quote") return K.wordsOf(scene.emphasis || scene.headline || "").length >= 3;
    return true;
  },
};
const BUILDERS = {
  cover: sCover, lead: sLead, spread: sSpread, ledger: sLedger, quote: sPullQuote, colophon: sColophon,
  statement: (sc, ctx) => ({ ...K.statement(sc, ctx), backdrop: press(ctx.id, ctx.th), chrome: chrome(ctx, ctx.label), s: [...(K.statement(sc, ctx).s || []), ...pressTweens(ctx), ...chromeT(ctx)] }),
  "statement-c": (sc, ctx) => ({ ...K.statement(sc, ctx, { centred: true }), backdrop: press(ctx.id, ctx.th), chrome: chrome(ctx, ctx.label), s: [...(K.statement(sc, ctx, { centred: true }).s || []), ...pressTweens(ctx), ...chromeT(ctx)] }),
};
const LABELS = {
  cover: STRINGS.cover, lead: STRINGS.lead, spread: STRINGS.spread,
  ledger: STRINGS.ledger, quote: STRINGS.quote, colophon: STRINGS.ed,
};

const css = (th, stage) => K.baseCss(th, stage, `
  #cap-pill { border:1px solid ${rgba(th.ink, 0.3)}; }`);

function buildComposition(opts = {}) {
  return K.buildFilm({
    ...opts, stage: STAGE, theme, STRINGS, spec: SPEC, builders: BUILDERS, labels: LABELS,
    css, refBeat: 4.4, camera: { push: 90, scale: 1.025 },
    signature: "editorial", fallbackBrand: "EDITION",
  });
}

module.exports = { buildComposition, STRINGS };
module.exports.__test = { SPEC, BUILDERS, theme, STAGE };
