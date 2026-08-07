// BLOOM ILLUSTRATED — a warm, illustration-forward SaaS system. Native GSAP + DOM, on om_port_kit.
//
// PROVENANCE. NOT a port: there is no Claude Design reference for this pack. It is written from its
// own manifest, frames/bloom-illustrated/pack.json (and the prose of the same brief that sits beside
// it in frames/bloom-illustrated/FRAME.md, whose `vibe` line the manifest carries verbatim but
// truncated mid-sentence).
//
// WHY IT WAS BUILT. The pack had no composer, so every film that selected bloom-illustrated rendered
// through the GENERIC scene kit wearing its palette: the design existed as a written brief and had
// never existed in code. The brief's own words:
//
//   "A warm, friendly, illustration-forward SaaS system: cream paper grounds, big soft pastel blobs
//    drifting behind everything, and generously rounded cards (28px+). Simple hand-drawn-feel
//    inline-SVG characters and objects — circles and organic paths — carry personality; coral is the
//    single confident accent. Bricolage Grotesque is the smiling display, Inter the calm body.
//    Gentle, bouncy, human."
//
// THE RULES, taken from that brief and enforced in code:
//   1. CREAM IS THE ONLY GROUND, AND IT IS NEVER BARE. Every beat — including the `statement`
//      fallbacks — stands on #FFF7EE lit by two large soft pastel blobs and a bokeh drift. A bare
//      cream rectangle reads as a blank document, not as a Bloom frame. No white ground, no grey,
//      no dark mode, no per-scene ground swap (so the chrome question of law 7 never arises for
//      colour — see rule 5 for why this pack owns its chrome anyway).
//   2. SOFT WITHOUT BLUR. The brief asks for blobs at "blur 60-100px" and pillowy card shadows.
//      `filter: blur()` and `backdrop-filter` are BANNED in this library (a per-scene stack of
//      blurred layers makes a seeked capture come back solid black), so every blob is built from
//      stacked `radial-gradient(ellipse W% H% ...)` stops — edgeless by construction — and the
//      pillow is a large-radius, low-opacity `box-shadow`, which is a shadow, not a filter.
//   3. ROUNDED EVERYTHING, AND ONE CORAL PER BEAT. Cards >= U(44) (~44px, brief floor 28px), pills
//      and buttons fully round. Coral (or the brand accent that replaces it) appears as a real fill
//      exactly ONCE per beat, and the CORAL LEDGER below names where, beat by beat; every other
//      shape is cream/ink with peach/sky/leaf/plum support.
//   4. ALL TEXT IS INK. There is no second text colour — `th.sub` is the same ink at lower alpha,
//      not another hue. Pastels are never type. The one exception is the brief's own
//      `textfx.emphasis: "gradient"`, which clips accent->plum into ONE emphasis word, and that
//      word IS that beat's coral spend.
//   5. ONE HAND-DRAWN SVG PER BEAT, OVERLAPPING SOMETHING. The signature device: `sprig()` draws a
//      sprout / smiling face / check / spark from circles and organic paths with rounded caps, and
//      it is always placed so it crosses a card edge or a blob — never pasted inside a box. It sways
//      and bobs on every beat, which is what makes the film feel hand-made rather than templated.
//      The pack also owns its `chrome:` (a peach wordmark capsule and a leaf progress rail) because
//      the kit's HUD paints a coral badge AND a coral rail from `th.accent` — two extra coral fills
//      per beat, which would break rule 3 on every frame of the film.
//
// THE CORAL LEDGER — one accent fill per beat, decided in one place so no two elements can spend it:
//   cover     the sprout's bloom          feature  the gradient emphasis word (else the sprig)
//   cards     the first card's glyph      stat     the lead figure
//   quote     the avatar's cheek          close    the CTA pill (and its soft halo)
// `statement` is the KIT's pictureless layout and wears `th.accent` for its eyebrow, rule and dots.
// That is three marks rather than one, and it is deliberate: overriding the accent there would hide
// a user's brand colour on exactly the beats that have nothing else to carry it.
//
// FONT SUBSTITUTION: Bricolage Grotesque is bundled and used as specified for all display and label
// type. `Inter` is NOT bundled, so Figtree stands in for the calm body voice — the nearest neutral
// UI grotesque in src/fonts/pack_fonts.js. The pack names NO monospace and its brief bans
// "condensed/technical sans", so `monoStack` is deliberately the display face too: the kit's
// `statement` sets its eyebrow in monoStack, and in this pack that eyebrow must be Bricolage.

const K = require("./om_port_kit");
const { r, esc, rgba } = K;

const STAGE = K.stageOf(1920, 1080);
const { U, VH } = STAGE;

// The manifest's palette, by its own names.
const CREAM = "#FFF7EE", PEACH = "#FFD9C0", CORAL = "#FF7E6B";
const SKY = "#76C7E8", LEAF = "#7CC576", PLUM = "#6B5BD2", INK = "#2B2540";
// Cards are "cream lifted (or pure white)". Lifted cream, not #FFFFFF: the brief forbids pure white
// as a GROUND and a warm card keeps the whole frame in one temperature.
const CARD = "#FFFCF7";
const DISPLAY = "Bricolage Grotesque", BODY = "Figtree", MONO = DISPLAY;

const STRINGS = {
  cover: "Say hello", feature: "What it does", cards: "How it works", stat: "Growing well",
  quote: "Kind words", cta: "Get started", scene: "Frame", of: "of", go: "Start free",
};

function theme(brandSkin) {
  const { accent, resolvedBrand } = K.resolveAccent(brandSkin, { ground: CREAM, isDark: false, packAccent: CORAL });
  return {
    accent, bg: CREAM, cream: CREAM, ink: INK, paper: CARD, panel: CARD,
    // ONE text colour (rule 4): `sub` is ink at lower alpha, not a second hue.
    sub: rgba(INK, 0.72), line: rgba(INK, 0.1),
    peach: PEACH, sky: SKY, leaf: LEAF, plum: PLUM,
    // Sentence-case display, never all-caps (the brief bans caps headlines), so mixed advance.
    adv: K.ADVANCE.mixed,
    capBg: CARD, capInk: INK,
    ...K.fontStacks(DISPLAY, MONO, `'${BODY}', system-ui, sans-serif`, [BODY]),
    bodyStack: `'${BODY}', system-ui, sans-serif`,
    resolvedBrand,
  };
}

// ---- the system --------------------------------------------------------------
const M = U(110);                       // ~4cqw slide padding, generous air
const COL = U(1920) - M * 2;
const DRIFT = 1.04;                     // manifest motion.drift
const SAFE = K.camSafe(DRIFT);          // the camera scales its own layer; measure inside that
const R_CARD = U(44), R_WELL = U(28), R_PILL = U(999);
// The brief's own cqw ladder, expressed through U() so LAW 3 holds (every length ends in cqw):
// heading-xl 5.0cqw = U(96), heading-lg 3.6 = U(69), heading-md 2.4 = U(46), card-title 1.5 = U(29),
// body 1.46 = U(28) (the brief's legibility floor for load-bearing lines is 1.4cqw), label = U(20).
const T_XL = U(96), T_LG = U(69), T_MD = U(46), T_CARD = U(29), T_BODY = U(28), T_LABEL = U(20);
const LH = 1.08;                        // one display line-height, used to MEASURE and to render

// ---- the cream ground + blob field ------------------------------------------
// THE ATMOSPHERE. Two big pillowy pastels drifting off an edge, plus the manifest's
// `fx.canvas: "bokeh"` as a field of soft pastel dots.
//
// TWO PERCENTAGES AND `ellipse`, ALWAYS. `radial-gradient(circle <pct>%)` is invalid CSS and makes
// the browser drop the ENTIRE comma-joined background — it has silently killed three packs' colour
// in this library. Percentages resolve against the box's own width AND height, so a round blob needs
// its two radii computed separately (px/1920*100 and px/1080*100).
//
// Arrangements alternate by beat so a long film's atmosphere moves; index 0 keeps both blobs to the
// right, which is the one the cover asks for (its copy column must sit on clear cream — the brief
// forbids type over a blob).
const BLOB_SETS = [
  [{ c: "peach", x: 82, y: 14, s: 1240, o: 0.55 }, { c: "sky", x: 88, y: 88, s: 1040, o: 0.3 }],
  [{ c: "sky", x: 12, y: 18, s: 1080, o: 0.3 }, { c: "peach", x: 86, y: 86, s: 1220, o: 0.5 }],
  [{ c: "plum", x: 84, y: 20, s: 1000, o: 0.18 }, { c: "leaf", x: 16, y: 90, s: 1120, o: 0.26 }],
];
// Deterministic bokeh: no RNG, so the same film renders identically every time.
const BOKEH = Array.from({ length: 9 }, (_, i) => {
  const s = i * 97.3;
  return {
    x: 4 + ((s * 1.37) % 92), y: 5 + ((s * 0.79) % 86),
    d: 70 + (i % 4) * 46, o: 0.2 + (i % 3) * 0.07, hue: i % 4, dur: 5 + (i % 5) * 1.4,
  };
});
const PASTELS = ["peach", "sky", "leaf", "plum"];

function blobCss(th, b) {
  const c = th[b.c];
  return `radial-gradient(ellipse ${r((b.s / 1920) * 100)}% ${r((b.s / 1080) * 100)}% at ${r(b.x)}% ${r(b.y)}%, `
    + `${rgba(c, b.o)} 0%, ${rgba(c, b.o * 0.5)} 40%, ${rgba(c, 0)} 74%)`;
}

function ground(id, th, i) {
  const set = BLOB_SETS[((i % BLOB_SETS.length) + BLOB_SETS.length) % BLOB_SETS.length];
  const dot = (b, k) => {
    const c = th[PASTELS[b.hue]];
    return `<div class="${id}-bk" style="position:absolute;left:${r(b.x)}%;top:${r((b.y / 100) * VH)}cqw;width:${r(U(b.d))}cqw;height:${r(U(b.d))}cqw;`
      + `background:radial-gradient(ellipse 100% 100% at 50% 50%, ${rgba(c, b.o)} 0%, ${rgba(c, b.o * 0.4)} 45%, ${rgba(c, 0)} 72%);" data-k="${k}"></div>`;
  };
  return `<div style="position:absolute;inset:0;background:${th.bg};overflow:hidden;">
    <div class="${id}-b1" style="position:absolute;inset:${r(-U(160))}cqw;background:${blobCss(th, set[0])};"></div>
    <div class="${id}-b2" style="position:absolute;inset:${r(-U(140))}cqw;background:${blobCss(th, set[1])};"></div>
    <div style="position:absolute;inset:0;">${BOKEH.map(dot).join("")}</div>
    ${wash(id, th)}
  </div>`;
}

// `motion.cut: "wash"` — the cut is a soft pastel wash crossing the frame, not a wipe or a slam.
function wash(id, th) {
  return `<div class="${id}-wash" style="position:absolute;inset:0;z-index:3;pointer-events:none;opacity:0;`
    + `background:linear-gradient(100deg, ${rgba(PEACH, 0)} 0%, ${rgba(PEACH, 0.7)} 40%, ${rgba(th.sky, 0.34)} 58%, ${rgba(PEACH, 0)} 100%);"></div>`;
}

const groundTweens = (id, ctx) => {
  const a = Math.max(8, ctx.L * 2.4), b = Math.max(7, ctx.L * 2), c = Math.max(6, ctx.L * 1.8);
  return [
    // Blobs drift like balloons — a yoyo whose half-period is the whole travel, so nothing snaps
    // back (LAW 9: continuous sin-driven reference motion becomes a yoyo tween).
    `tl.to(".${id}-b1",{x:"${r(U(70))}cqw",y:"${r(-U(46))}cqw",duration:${r(a)},ease:"sine.inOut",repeat:${K.reps(ctx.L, a)},yoyo:true},${r(ctx.T)});`,
    `tl.to(".${id}-b2",{x:"${r(-U(58))}cqw",y:"${r(U(40))}cqw",duration:${r(b)},ease:"sine.inOut",repeat:${K.reps(ctx.L, b)},yoyo:true},${r(ctx.T)});`,
    `tl.to(".${id}-bk",{y:"${r(-U(42))}cqw",duration:${r(c)},ease:"sine.inOut",repeat:${K.reps(ctx.L, c)},yoyo:true,stagger:${r(0.18)}},${r(ctx.T)});`,
    `tl.fromTo(".${id}-wash",{opacity:0,x:"${r(-U(760))}cqw"},{opacity:1,x:0,duration:${ctx.du(0.2)},ease:"power2.out"},${ctx.at(0)});`,
    `tl.to(".${id}-wash",{opacity:0,x:"${r(U(760))}cqw",duration:${ctx.du(0.3)},ease:"power2.in"},${ctx.at(0.2)});`,
  ];
};

// ---- chrome ------------------------------------------------------------------
// THIS PACK OWNS ITS CHROME (rule 5). The kit's HUD fills its brand badge AND its progress rail
// from `th.accent`, which in this pack is coral: two extra coral fills on every beat, against a
// brief whose whole discipline is "coral exactly once". Here the wordmark sits in a peach capsule
// and the rail fills in leaf, so the accent stays available to the content.
function hud(ctx) {
  const { id, th, i, total, label, S } = ctx;
  const brand = String(ctx.brand || "").slice(0, 22);
  return `<div class="om-chrome">
    <div style="position:absolute;left:${r(M)}cqw;top:${r(U(44))}cqw;display:flex;align-items:center;gap:${r(U(18))}cqw;">
      <span style="display:inline-flex;align-items:center;gap:${r(U(12))}cqw;padding:${r(U(11))}cqw ${r(U(26))}cqw;border-radius:${r(R_PILL)}cqw;background:${PEACH};">
        <span style="width:${r(U(13))}cqw;height:${r(U(13))}cqw;border-radius:50%;background:${th.leaf};flex:0 0 auto;"></span>
        <span style="font-family:${th.displayStack};font-weight:700;font-size:${r(U(24))}cqw;color:${INK};white-space:nowrap;">${esc(brand)}</span>
      </span>
      ${label ? `<span style="font-family:${th.bodyStack};font-weight:600;font-size:${r(U(19))}cqw;letter-spacing:0.14em;text-transform:uppercase;color:${rgba(INK, 0.55)};white-space:nowrap;">${esc(label)}</span>` : ""}
    </div>
    <div style="position:absolute;right:${r(M)}cqw;top:${r(U(56))}cqw;font-family:${th.bodyStack};font-weight:600;font-size:${r(U(19))}cqw;letter-spacing:0.16em;text-transform:uppercase;color:${rgba(INK, 0.5)};white-space:nowrap;">${esc(String(S.scene || "Frame"))} ${K.pad2(i + 1)} ${esc(String(S.of || "of"))} ${K.pad2(total)}</div>
    <div style="position:absolute;left:${r(M)}cqw;right:${r(M)}cqw;bottom:${r(U(50))}cqw;height:${r(U(9))}cqw;border-radius:${r(R_PILL)}cqw;background:${rgba(INK, 0.08)};overflow:hidden;">
      <div class="${id}-rail" style="width:100%;height:100%;border-radius:${r(R_PILL)}cqw;background:${th.leaf};transform:scaleX(${r(total ? i / total : 0)});transform-origin:left center;"></div>
    </div>
  </div>`;
}
// Our own rail, so our own tween: `open()` renders the kit's `.<id>-prog` only when a builder
// passes no chrome, and the kit correspondingly withholds its progress tween.
const hudTweens = (id, ctx) => [
  `tl.to(".${id}-rail",{scaleX:${r(ctx.total ? (ctx.i + 1) / ctx.total : 1)},duration:${r(ctx.L)},ease:"none"},${r(ctx.T)});`,
];

// ---- furniture ---------------------------------------------------------------
// The universal eyebrow: a soft peach capsule with a tiny leaf dot. It labels, it never shouts.
const pill = (th, t, dot = LEAF, size = T_LABEL) =>
  `<span style="display:inline-flex;align-items:center;gap:${r(U(11))}cqw;padding:${r(U(11))}cqw ${r(U(24))}cqw;border-radius:${r(R_PILL)}cqw;background:${PEACH};font-family:${th.displayStack};font-weight:700;font-size:${r(size)}cqw;letter-spacing:0.14em;text-transform:uppercase;color:${INK};white-space:nowrap;">`
  + `${dot ? `<span style="width:${r(U(11))}cqw;height:${r(U(11))}cqw;border-radius:50%;background:${dot};flex:0 0 auto;"></span>` : ""}${esc(String(t || ""))}</span>`;

// The surface: a friendly rounded pillow floating above the blobs. Radius >= U(44) and ONE soft,
// large-radius, barely-offset shadow — a tight or dark shadow is what makes this look corporate.
function bloomCard(cls, th, { x, y, w, h, inner, pad = 0, radius = R_CARD, bg = CARD }) {
  return `<div class="${cls}" style="position:absolute;left:${r(x)}cqw;top:${r(y)}cqw;width:${r(w)}cqw;height:${r(h)}cqw;background:${bg};border-radius:${r(radius)}cqw;box-shadow:0 ${r(U(18))}cqw ${r(U(50))}cqw ${rgba(INK, 0.1)};overflow:hidden;${pad ? `padding:${r(pad)}cqw;` : ""}box-sizing:border-box;opacity:0;">
    <div style="position:relative;width:100%;height:100%;">${inner}</div>
  </div>`;
}
// `textfx.enter: "spring"` — cards do not fade, they rise and settle with a little overshoot.
const cardTweens = (cls, ctx, at) => [
  `tl.to(".${cls}",{opacity:1,duration:${ctx.du(0.12)},ease:"none"},${ctx.at(at)});`,
  `tl.fromTo(".${cls}",{y:"${r(U(48))}cqw",scale:0.965},{y:0,scale:1,duration:${ctx.du(0.52)},ease:"back.out(1.5)"},${ctx.at(at)});`,
];

// Display type. Sentence case, ink, one line-height — measured with the same LH it renders with.
const heads = (id, th, arr, size, cls = "hl", color = INK, weight = 800) =>
  arr.map((l) => `<span class="${id}-${cls}" style="display:block;font-family:${th.displayStack};font-weight:${weight};font-size:${r(size)}cqw;line-height:${LH};letter-spacing:-0.015em;color:${color};opacity:0;">${esc(l)}</span>`).join("");
const headTweens = (id, ctx, at, cls = "hl") => [
  `tl.fromTo(".${id}-${cls}",{opacity:0,y:"${r(U(42))}cqw",scale:0.975},{opacity:1,y:0,scale:1,duration:${ctx.du(0.5)},ease:"back.out(1.5)",stagger:${ctx.du(0.12)}},${ctx.at(at)});`,
];

// `textfx.emphasis: "gradient"` — the accent CLIPS into one word (accent -> plum). This is the only
// coloured type in the pack, and it is that beat's single coral spend.
const gradWord = (id, th, word, size, cls = "em") =>
  `<span class="${id}-${cls}" style="display:inline-block;font-family:${th.displayStack};font-weight:800;font-size:${r(size)}cqw;line-height:${LH};letter-spacing:-0.015em;`
  + `background-image:linear-gradient(96deg, ${th.accent} 0%, ${PLUM} 100%);-webkit-background-clip:text;background-clip:text;color:transparent;opacity:0;">${esc(String(word || ""))}</span>`;

// ---- the signature: hand-drawn inline SVG ------------------------------------
// THE PERSONALITY. Three to six shapes — circles and organic paths, rounded caps, 2-4 flat pastel
// fills, tiny ink detail marks — and at most ONE accent highlight, granted by the coral ledger.
// Every instance is placed to cross a card edge or a blob, so it reads as PLACED IN the scene.
//
// LAW 10. The swaying group carries NO static transform of its own, and its GSAP rotation is given
// an `svgOrigin` in the SVG's own user space. If the group were also translated, that pivot would be
// applied twice and the shape would swing off frame — the fix then is an outer static group and an
// inner animated one, which is why the shapes here are authored in absolute user-space coordinates.
const PIVOT = { sprout: "100 178", face: "100 50", check: "100 104", spark: "100 66" };

function sprigBody(kind, th, sw, hi) {
  if (kind === "face") {
    return `<circle cx="100" cy="112" r="64" fill="${PEACH}"/>
      <circle cx="80" cy="104" r="7" fill="${INK}"/>
      <circle cx="120" cy="104" r="7" fill="${INK}"/>
      <path d="M78 132 C90 148 110 148 122 132" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
      <circle cx="56" cy="126" r="10" fill="${hi}"/>
      <g class="${sw}"><path d="M100 50 C98 32 108 16 126 12 C130 30 118 46 100 50 Z" fill="${th.leaf}"/></g>`;
  }
  if (kind === "check") {
    return `<circle cx="100" cy="104" r="66" fill="${th.sky}"/>
      <circle cx="100" cy="104" r="44" fill="${CREAM}"/>
      <g class="${sw}"><path d="M76 106 L94 124 L128 84" fill="none" stroke="${th.leaf}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/></g>
      <circle cx="152" cy="52" r="12" fill="${hi}"/>`;
  }
  if (kind === "spark") {
    return `<path d="M62 128 C40 122 30 100 40 80 C62 84 74 108 62 128 Z" fill="${th.leaf}"/>
      <path d="M132 96 C154 90 166 68 156 48 C134 52 122 76 132 96 Z" fill="${th.sky}"/>
      <circle cx="98" cy="146" r="16" fill="${PEACH}"/>
      <g class="${sw}"><path d="M100 40 L106 60 L126 66 L106 72 L100 92 L94 72 L74 66 L94 60 Z" fill="${hi}"/></g>`;
  }
  return `<ellipse cx="100" cy="180" rx="66" ry="15" fill="${PEACH}"/>
    <g class="${sw}">
      <path d="M100 178 C97 146 98 124 103 100" fill="none" stroke="${th.leaf}" stroke-width="11" stroke-linecap="round"/>
      <path d="M101 140 C74 138 58 122 60 102 C84 100 102 118 101 140 Z" fill="${th.leaf}"/>
      <path d="M104 152 C130 148 146 130 143 110 C119 110 103 130 104 152 Z" fill="${th.sky}"/>
      <circle cx="104" cy="86" r="26" fill="${PEACH}"/>
      <circle cx="104" cy="86" r="11" fill="${hi}"/>
    </g>`;
}

// `k` indexes the instance: a beat may carry several sprigs of DIFFERENT kinds, and each kind pivots
// somewhere else, so classes and tweens are per-instance rather than shared.
function sprig(id, th, { kind = "sprout", x, y, size, coral = false, k = 0, z = 6 }) {
  // The ledger, in one expression: without the grant the highlight falls back to plum, which is a
  // legal illustration fill. Nothing else in the file may paint the accent.
  const hi = coral ? th.accent : PLUM;
  return `<div class="${id}-ill${k}" style="position:absolute;left:${r(x)}cqw;top:${r(y)}cqw;width:${r(size)}cqw;height:${r(size)}cqw;z-index:${z};opacity:0;">
    <div class="${id}-illb${k}" style="width:100%;height:100%;">
      <svg viewBox="0 0 200 200" style="width:100%;height:100%;display:block;overflow:visible;">${sprigBody(kind, th, `${id}-swy${k}`, hi)}</svg>
    </div>
  </div>`;
}
const sprigTweens = (id, ctx, at, kind = "sprout", k = 0) => {
  const bob = Math.max(3.4, ctx.L * 0.9), sway = Math.max(2.8, ctx.L * 0.75);
  return [
    `tl.to(".${id}-ill${k}",{opacity:1,duration:${ctx.du(0.12)},ease:"none"},${ctx.at(at)});`,
    `tl.fromTo(".${id}-ill${k}",{scale:0.5,y:"${r(U(30))}cqw"},{scale:1,y:0,duration:${ctx.du(0.62)},ease:"back.out(2)"},${ctx.at(at)});`,
    // The bob lives on an INNER wrapper, so it can never fight the pop-in's own y/scale channel.
    `tl.to(".${id}-illb${k}",{y:"${r(-U(14))}cqw",duration:${r(bob)},ease:"sine.inOut",repeat:${K.reps(ctx.L, bob)},yoyo:true},${ctx.at(at + 0.6)});`,
    `tl.to(".${id}-swy${k}",{rotation:6,svgOrigin:"${PIVOT[kind] || PIVOT.sprout}",duration:${r(sway)},ease:"sine.inOut",repeat:${K.reps(ctx.L, sway)},yoyo:true},${ctx.at(at + 0.2)});`,
  ];
};

// A figure counts up from zero. Nothing is invented: `numbersIn` only returns what the script said.
const countTween = (id, ctx, i, st, at) => {
  const num = Number(String(st.v).replace(/,/g, "")) || 0;
  const dp = String(st.v).includes(".") ? 1 : 0;
  return `tl.fromTo(".${id}-n${i}",{innerText:0},{innerText:${num},duration:${ctx.du(0.52)},ease:"power2.out",snap:{innerText:${dp ? 0.1 : 1}},onUpdate:function(){var e=document.querySelector(".${id}-n${i}");if(e)e.textContent=Number(e.textContent).toFixed(${dp});}},${ctx.at(at)});`;
};

// A leaf progress ring around a figure. THE ARC IS HONEST OR IT IS WHOLE: a percentage fills to its
// own value, anything else draws a complete ring. An arc at 78% beside "8s" would be a quantity the
// script never claimed, which is the fabrication the agent audit closed.
const RING_C = 2 * Math.PI * 42;                       // the arc's own circumference, r=42 of a 100 box
const ringFrac = (f) => Math.max(0.06, Math.min(1, Number(f) || 0));
function ring(id, th, i, { inner }) {
  const len = r(RING_C);
  return `<div style="position:relative;width:100%;height:100%;">
    <svg viewBox="0 0 100 100" style="position:absolute;inset:0;width:100%;height:100%;display:block;">
      <circle cx="50" cy="50" r="42" fill="none" stroke="${rgba(INK, 0.08)}" stroke-width="7"/>
      <circle class="${id}-arc${i}" cx="50" cy="50" r="42" fill="none" stroke="${th.leaf}" stroke-width="7" stroke-linecap="round" transform="rotate(-90 50 50)" style="stroke-dasharray:${len};stroke-dashoffset:${len};"/>
    </svg>
    <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">${inner}</div>
  </div>`;
}
const ringTweens = (id, ctx, i, frac, at) => {
  return [`tl.to(".${id}-arc${i}",{strokeDashoffset:${r(RING_C * (1 - ringFrac(frac)))},duration:${ctx.du(0.6)},ease:"power2.out"},${ctx.at(at)});`];
};

// ---- the pictureless beat ----------------------------------------------------
// LAW 4: a layout that cannot get its picture or its figures NEVER draws a hollow card — it returns
// the kit's `statement`, dressed in this pack's ground and chrome, and spreading THEIR MOTION too. A
// `{...K.statement(), backdrop: x}` that drops the backdrop's tweens is the dead-tween defect jungle
// shipped: the ground is drawn and then never moves.
function fallback(scene, ctx, centred = false) {
  const base = K.statement(scene, ctx, { centred });
  return {
    ...base,
    backdrop: ground(ctx.id, ctx.th, ctx.i),
    chrome: hud(ctx),
    s: [...base.s, ...groundTweens(ctx.id, ctx), ...hudTweens(ctx.id, ctx)],
  };
}

// ---- scenes -----------------------------------------------------------------
// COVER — cream lit from the right, a peach pill eyebrow, a big smiling headline, and the sprout
// growing out of the lower-right blob. No card here: the brief wants ~55% open warmth, and copy on
// clear cream is exactly what it asks for. Blob set 0 keeps both blobs right of the copy column,
// because the brief forbids type sitting on a blob.
function sCover(scene, ctx) {
  const { id, th, at, du } = ctx;
  const colW = U(940);
  const head = K.fitLines(scene.headline || scene.title || ctx.title, colW / SAFE, T_XL, 3, th.adv);
  const body = String(scene.subtext || "").trim().slice(0, 190);
  return {
    backdrop: ground(id, th, 0),
    chrome: hud(ctx),
    html: `
    <div style="position:absolute;left:${r(M)}cqw;top:${r(U(250))}cqw;width:${r(colW)}cqw;z-index:4;">
      <div class="${id}-pill" style="opacity:0;">${pill(th, String(scene.kicker || ctx.S.cover).slice(0, 28))}</div>
      <div style="margin-top:${r(U(34))}cqw;">${heads(id, th, head.lines, head.size)}</div>
      ${body ? `<div class="${id}-body" style="margin-top:${r(U(38))}cqw;max-width:${r(U(820))}cqw;font-family:${th.bodyStack};font-weight:400;font-size:${r(T_BODY)}cqw;line-height:1.6;color:${th.sub};opacity:0;">${esc(body)}</div>` : ""}
    </div>
    ${sprig(id, th, { kind: "sprout", x: U(1240), y: U(300), size: U(560), coral: true, k: 0 })}`,
    s: [
      `tl.fromTo(".${id}-pill",{opacity:0,y:"${r(U(20))}cqw",scale:0.9},{opacity:1,y:0,scale:1,duration:${du(0.34)},ease:"back.out(2)"},${at(0.1)});`,
      ...headTweens(id, ctx, 0.24),
      body ? `tl.fromTo(".${id}-body",{opacity:0,y:"${r(U(24))}cqw"},{opacity:1,y:0,duration:${du(0.36)},ease:"power3.out"},${at(0.62)});` : "",
      ...sprigTweens(id, ctx, 0.34, "sprout", 0),
      ...groundTweens(id, ctx), ...hudTweens(id, ctx),
    ].filter(Boolean),
  };
}

// FEATURE — the manifest's widest slot (1728x410, twice over). Those are extreme letterboxes, so the
// picture is a STRIP: a full-measure rounded card cropped to the band, not a photo sitting in a box.
// The check sprig crosses the first strip's top-right corner so the row is never a bare rectangle.
function sFeature(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const n = Math.min(2, shots.length);
  if (!n) return fallback(scene, ctx);
  const colW = U(1200);
  const head = K.fitLines(scene.headline || scene.title || "", colW / SAFE, U(64), 2, th.adv);
  const key = K.clampWords(String(scene.emphasis || "").trim(), 22);
  const emSize = U(44);
  // MEASURE, DO NOT GUESS. A band at a fixed y suited one line and ran straight under two.
  const top = U(230), gap = U(26), bandEnd = U(940);
  const rawTop = top + U(58) + head.lines.length * head.size * LH + (key ? emSize * LH + U(16) : 0) + U(40);
  // Clamp so a three-line hand can never drive the strips to a negative height.
  const bandTop = Math.min(rawTop, bandEnd - (n === 2 ? U(360) + gap : U(220)));
  const h = n === 2 ? (bandEnd - bandTop - gap) / 2 : bandEnd - bandTop;
  return {
    backdrop: ground(id, th, ctx.i),
    chrome: hud(ctx),
    html: `
    <div style="position:absolute;left:${r(M)}cqw;top:${r(top)}cqw;width:${r(colW)}cqw;z-index:4;">
      <div class="${id}-pill" style="opacity:0;">${pill(th, String(scene.kicker || ctx.S.feature).slice(0, 28))}</div>
      <div style="margin-top:${r(U(30))}cqw;">${heads(id, th, head.lines, head.size)}</div>
      ${key ? `<div style="margin-top:${r(U(16))}cqw;">${gradWord(id, th, key, emSize)}</div>` : ""}
    </div>
    ${Array.from({ length: n }, (_, i) => bloomCard(`${id}-f${i}`, th, {
      x: M, y: bandTop + i * (h + gap), w: COL, h,
      inner: K.shotFill(shots[i], { bg: CARD, w: COL, h }),
    })).join("")}
    ${sprig(id, th, { kind: "check", x: M + COL - U(200), y: bandTop - U(112), size: U(230), coral: !key, k: 0 })}`,
    s: [
      `tl.fromTo(".${id}-pill",{opacity:0,y:"${r(U(18))}cqw",scale:0.9},{opacity:1,y:0,scale:1,duration:${du(0.3)},ease:"back.out(2)"},${at(0.08)});`,
      ...headTweens(id, ctx, 0.2),
      key ? `tl.fromTo(".${id}-em",{opacity:0,y:"${r(U(26))}cqw",scale:0.94},{opacity:1,y:0,scale:1,duration:${du(0.42)},ease:"back.out(1.8)"},${at(0.46)});` : "",
      ...Array.from({ length: n }, (_, i) => cardTweens(`${id}-f${i}`, ctx, 0.44 + i * 0.16)).flat(),
      ...sprigTweens(id, ctx, 0.62, "check", 0),
      ...groundTweens(id, ctx), ...hudTweens(id, ctx),
    ].filter(Boolean),
  };
}

// CARDS — the brief's feature row: three rounded pillows, each with a friendly glyph in a pastel
// circle and a title lifted from the script's own bullets. It needs no picture, which is why it can
// always carry a beat; if a picture IS available it lands beneath as one contained illustration band
// (the manifest's `how` slot, 998x367, objectFit "contain"), never as three uneven wells.
function sCards(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const items = K.bullets(scene, 3);
  if (items.length < 2) return fallback(scene, ctx);
  const headText = String(scene.headline || scene.title || ctx.S.cards);
  const headSize = K.fitOne(headText, U(1300) / SAFE, T_MD, th.adv);
  const top = U(230);
  const rowTop = top + U(58) + headSize * LH + U(46);
  const shot = shots[0] || null;
  const bandH = U(190), bandGap = U(30);
  // MEASURE THE CARD'S INTERIOR, DO NOT TRUST THE BOX. `overflow:hidden` gives a rounded card its
  // corners, so a title that does not fit is silently BEHEADED rather than spilling visibly. The
  // interior is glyph circle + gap + title lines, so a row that has given height to the illustration
  // band also has to give up its third title line: U(330) - 2*U(40) of interior holds two, not three.
  const rowH = shot ? U(330) : U(380);
  const titleLines = shot ? 2 : 3;
  const gap = U(30), cw = (COL - gap * (items.length - 1)) / items.length;
  const pad = U(40), dia = U(126);
  // `cards` is the role that needs no picture, so on a picture-poor film it carries several beats in
  // a row. The glyph cast and the circle hues ROTATE BY BEAT INDEX (as the blob arrangement already
  // does), so two consecutive card rows are never the same three faces on the same three pastels.
  const CAST = ["sprout", "check", "face"];
  const kindAt = (j) => CAST[(j + ctx.i) % CAST.length];
  const hueAt = (j) => PASTELS[(j + ctx.i + 1) % PASTELS.length];
  return {
    backdrop: ground(id, th, ctx.i),
    chrome: hud(ctx),
    html: `
    <div style="position:absolute;left:${r(M)}cqw;top:${r(top)}cqw;width:${r(U(1300))}cqw;z-index:4;">
      <div class="${id}-pill" style="opacity:0;">${pill(th, String(scene.kicker || ctx.S.cards).slice(0, 28))}</div>
      <div style="margin-top:${r(U(30))}cqw;">${heads(id, th, [headText], headSize)}</div>
    </div>
    ${items.map((b, i) => {
      const t = K.fitLines(String(b).slice(0, 70), (cw - pad * 2) / SAFE, T_CARD, titleLines, th.adv);
      return bloomCard(`${id}-c${i}`, th, {
        x: M + i * (cw + gap), y: rowTop, w: cw, h: rowH, pad,
        inner: `<div style="position:relative;width:${r(dia)}cqw;height:${r(dia)}cqw;border-radius:50%;background:${rgba(th[hueAt(i)], 0.42)};">
            ${sprig(id, th, { kind: kindAt(i), x: U(14), y: U(10), size: dia - U(24), coral: i === 0, k: i, z: 2 })}
          </div>
          <div style="margin-top:${r(U(30))}cqw;font-family:${th.displayStack};font-weight:700;font-size:${r(t.size)}cqw;line-height:1.24;color:${INK};">${t.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>`,
      });
    }).join("")}
    ${shot ? bloomCard(`${id}-band`, th, {
      x: M, y: rowTop + rowH + bandGap, w: COL, h: bandH, radius: R_WELL, bg: rgba(PEACH, 0.5),
      // K HAS EXACTLY ONE MEDIA HELPER and it crops. The manifest asks `contain` for illustrations,
      // so this one <img> is written out — inset:0 inside the card's own positioned wrapper, so it
      // fills the band without escaping over the furniture around it (LAW 8).
      inner: `<img src="${esc(shot.path)}" alt="${esc(shot.alt || "")}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block;">`,
    }) : ""}`,
    s: [
      `tl.fromTo(".${id}-pill",{opacity:0,y:"${r(U(18))}cqw",scale:0.9},{opacity:1,y:0,scale:1,duration:${du(0.3)},ease:"back.out(2)"},${at(0.08)});`,
      ...headTweens(id, ctx, 0.2),
      ...items.flatMap((_, i) => [
        ...cardTweens(`${id}-c${i}`, ctx, 0.38 + i * 0.14),
        ...sprigTweens(id, ctx, 0.5 + i * 0.14, kindAt(i), i),
      ]),
      ...(shot ? cardTweens(`${id}-band`, ctx, 0.82) : []),
      ...groundTweens(id, ctx), ...hudTweens(id, ctx),
    ],
  };
}

// STAT — the brief's `stat-bloom`: a big figure inside a leaf progress ring on a soft pillow, with an
// ink caption under it. The lead figure is the beat's coral; the others are ink. This is the ONE role
// that prints figures as figures, and `carry` routes every numeric beat here.
function sStat(scene, ctx) {
  const { id, th, at, du } = ctx;
  const stats = K.numbersIn(scene, 3);
  if (stats.length < 2) return fallback(scene, ctx);
  const headText = String(scene.headline || scene.title || ctx.S.stat);
  const headSize = K.fitOne(headText, U(1300) / SAFE, T_MD, th.adv);
  const top = U(230);
  const rowTop = top + U(58) + headSize * LH + U(46);
  const gap = U(30), cw = (COL - gap * (stats.length - 1)) / stats.length;
  const cardH = U(420), pad = U(40), dia = Math.min(U(240), cw - pad * 2);
  return {
    backdrop: ground(id, th, ctx.i),
    chrome: hud(ctx),
    html: `
    <div style="position:absolute;left:${r(M)}cqw;top:${r(top)}cqw;width:${r(U(1300))}cqw;z-index:4;">
      <div class="${id}-pill" style="opacity:0;">${pill(th, String(scene.kicker || ctx.S.stat).slice(0, 28))}</div>
      <div style="margin-top:${r(U(30))}cqw;">${heads(id, th, [headText], headSize)}</div>
    </div>
    ${stats.map((st, i) => {
      const txt = `${st.v}${st.suffix}`;
      const size = K.fitOne(txt, dia - U(70), U(78), th.adv);
      const frac = st.suffix === "%" ? (Number(String(st.v).replace(/,/g, "")) || 0) / 100 : 1;
      return bloomCard(`${id}-p${i}`, th, {
        x: M + i * (cw + gap), y: rowTop, w: cw, h: cardH, pad,
        inner: `<div style="width:${r(dia)}cqw;height:${r(dia)}cqw;margin:0 auto;">
            ${ring(id, th, i, {
              inner: `<span style="font-family:${th.displayStack};font-weight:800;font-size:${r(size)}cqw;line-height:1;letter-spacing:-0.02em;color:${i === 0 ? th.accent : INK};white-space:nowrap;"><span class="${id}-n${i}">0</span>${esc(st.suffix)}</span>`,
            })}
          </div>
          <div style="margin-top:${r(U(26))}cqw;text-align:center;font-family:${th.displayStack};font-weight:700;font-size:${r(T_LABEL)}cqw;letter-spacing:0.14em;text-transform:uppercase;color:${rgba(INK, 0.62)};">${esc(K.statLabel(scene, i))}</div>`,
      });
    }).join("")}
    ${sprig(id, th, { kind: "spark", x: M + COL - U(190), y: rowTop - U(104), size: U(210), k: 0 })}`,
    s: [
      `tl.fromTo(".${id}-pill",{opacity:0,y:"${r(U(18))}cqw",scale:0.9},{opacity:1,y:0,scale:1,duration:${du(0.3)},ease:"back.out(2)"},${at(0.08)});`,
      ...headTweens(id, ctx, 0.2),
      ...stats.flatMap((st, i) => {
        const frac = st.suffix === "%" ? (Number(String(st.v).replace(/,/g, "")) || 0) / 100 : 1;
        return [
          ...cardTweens(`${id}-p${i}`, ctx, 0.36 + i * 0.14),
          ...ringTweens(id, ctx, i, frac, 0.48 + i * 0.14),
          countTween(id, ctx, i, st, 0.48 + i * 0.14),
        ];
      }),
      ...sprigTweens(id, ctx, 0.6, "spark", 0),
      ...groundTweens(id, ctx), ...hudTweens(id, ctx),
    ],
  };
}

// QUOTE — one wide pillow holding the line in ink, with the smiling avatar crossing its lower-left
// corner and a peach pill carrying the attribution. The card's height is MEASURED from the fitted
// quote, so one line and four lines both sit correctly inside it.
// A TESTIMONIAL IS A CLAIM ABOUT WHO SAID IT. This beat only ever runs on a scene the storyboard
// actually marked as a quote (see `quoteish`), because a peach attribution pill wrapped around an
// arbitrary subtext line invents a customer — the same class of fabrication the agent audit closed
// for stat cards. Left loose, it also became the film's catch-all and printed four "Kind words"
// cards in an eight-beat film.
function quoteish(scene) {
  if (String(scene.quote || "").trim()) return true;
  return /quote|testimon|review|customer|voice/i.test(`${scene.kind || ""} ${scene.purpose || ""}`);
}
function sQuote(scene, ctx) {
  const { id, th, at, du } = ctx;
  const q = String(scene.quote || scene.headline || scene.subtext || "").trim().slice(0, 220);
  if (!q || !quoteish(scene)) return fallback(scene, ctx);
  const by = K.clampWords(String(scene.attribution || scene.emphasis || scene.subtext || "").trim(), 46);
  const pad = U(70), inner = COL - pad * 2 - U(150);
  const fit = K.fitLines(q, inner / SAFE, U(58), 4, th.adv);
  const cardH = Math.min(U(640), pad * 2 + U(46) + U(34) + fit.lines.length * fit.size * 1.34 + (by ? U(38) + U(46) : 0));
  const cardTop = U(270);
  return {
    backdrop: ground(id, th, ctx.i),
    chrome: hud(ctx),
    html: `
    ${bloomCard(`${id}-q`, th, {
      x: M, y: cardTop, w: COL, h: cardH, pad,
      inner: `<div class="${id}-pill" style="margin-left:${r(U(150))}cqw;opacity:0;">${pill(th, String(scene.kicker || ctx.S.quote).slice(0, 28))}</div>
        <div style="margin-top:${r(U(34))}cqw;margin-left:${r(U(150))}cqw;">${heads(id, th, fit.lines, fit.size, "hl", INK, 700)}</div>
        ${by ? `<div class="${id}-by" style="margin-top:${r(U(38))}cqw;margin-left:${r(U(150))}cqw;opacity:0;">${pill(th, by, th.sky)}</div>` : ""}`,
    })}
    ${sprig(id, th, { kind: "face", x: M - U(48), y: cardTop + cardH - U(210), size: U(250), coral: true, k: 0 })}`,
    s: [
      ...cardTweens(`${id}-q`, ctx, 0.08),
      `tl.fromTo(".${id}-pill",{opacity:0,y:"${r(U(18))}cqw",scale:0.9},{opacity:1,y:0,scale:1,duration:${du(0.3)},ease:"back.out(2)"},${at(0.26)});`,
      ...headTweens(id, ctx, 0.36),
      by ? `tl.fromTo(".${id}-by",{opacity:0,y:"${r(U(18))}cqw",scale:0.92},{opacity:1,y:0,scale:1,duration:${du(0.34)},ease:"back.out(1.8)"},${at(0.78)});` : "",
      ...sprigTweens(id, ctx, 0.32, "face", 0),
      ...groundTweens(id, ctx), ...hudTweens(id, ctx),
    ].filter(Boolean),
  };
}

// CLOSE — the centred sign-off pillow, the brightest blobs behind it, and the ONE filled-coral
// element of the whole film: a fully-rounded CTA with a soft coral halo. The sprout blooms across
// the card's lower-right corner. The card is vertically centred on its own measured height.
function sClose(scene, ctx, logo) {
  const { id, th, at, du } = ctx;
  const cardW = U(1420), cardX = (U(1920) - cardW) / 2, pad = U(60);
  const head = K.fitLines(scene.headline || scene.emphasis || ctx.title, (cardW - pad * 2 - U(180)) / SAFE, T_LG, 2, th.adv);
  const action = K.clampWords(String(scene.emphasis || "").trim(), 24) || ctx.S.go;
  const hasMark = !!(logo && logo.path);
  const actSize = K.fitOne(action, U(620), U(36), th.adv);
  const cardH = pad * 2 + (hasMark ? U(130) + U(30) : 0) + U(46) + U(34)
    + head.lines.length * head.size * LH + U(46) + (U(30) + actSize * 2) + U(30) + U(34);
  const cardTop = Math.max(U(170), (VH - cardH) / 2);
  const ctaInk = K.inkOn(th.accent, INK, CREAM);
  return {
    backdrop: ground(id, th, 1),
    chrome: hud(ctx),
    html: `
    ${bloomCard(`${id}-cta`, th, {
      x: cardX, y: cardTop, w: cardW, h: cardH, pad,
      inner: `<div style="width:100%;text-align:center;">
        ${hasMark ? `<div class="${id}-logo" style="width:${r(U(130))}cqw;height:${r(U(130))}cqw;margin:0 auto ${r(U(30))}cqw;border-radius:50%;background:${rgba(PEACH, 0.55)};display:flex;align-items:center;justify-content:center;padding:${r(U(24))}cqw;box-sizing:border-box;opacity:0;"><img src="${esc(logo.path)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain;display:block;"></div>` : ""}
        <div class="${id}-pill" style="opacity:0;">${pill(th, String(scene.kicker || ctx.S.cta).slice(0, 28))}</div>
        <div style="margin-top:${r(U(34))}cqw;">${heads(id, th, head.lines, head.size)}</div>
        <!-- The film's ONE filled-accent element, and its halo is a box-shadow of the SAME resolved
             accent — hardcoding coral here would leave a rebranded film with a teal button wearing a
             coral glow. -->
        <div class="${id}-btn" style="margin-top:${r(U(46))}cqw;display:inline-block;background:${th.accent};color:${ctaInk};font-family:${th.displayStack};font-weight:700;font-size:${r(actSize)}cqw;line-height:1.1;padding:${r(U(24))}cqw ${r(U(52))}cqw;border-radius:${r(R_PILL)}cqw;box-shadow:0 ${r(U(12))}cqw ${r(U(34))}cqw ${rgba(th.accent, 0.35)};opacity:0;">${esc(action)}</div>
        <div class="${id}-url" style="margin-top:${r(U(30))}cqw;font-family:${th.bodyStack};font-weight:600;font-size:${r(U(24))}cqw;letter-spacing:0.1em;color:${rgba(INK, 0.6)};opacity:0;">${esc(ctx.url)}</div>
      </div>`,
    })}
    ${sprig(id, th, { kind: "sprout", x: cardX + cardW - U(160), y: cardTop + cardH - U(170), size: U(280), k: 0 })}`,
    s: [
      ...cardTweens(`${id}-cta`, ctx, 0.06),
      hasMark ? `tl.fromTo(".${id}-logo",{opacity:0,scale:0.55},{opacity:1,scale:1,duration:${du(0.4)},ease:"back.out(2.2)"},${at(0.22)});` : "",
      `tl.fromTo(".${id}-pill",{opacity:0,y:"${r(U(18))}cqw",scale:0.9},{opacity:1,y:0,scale:1,duration:${du(0.3)},ease:"back.out(2)"},${at(0.3)});`,
      ...headTweens(id, ctx, 0.4),
      `tl.fromTo(".${id}-btn",{opacity:0,y:"${r(U(24))}cqw",scale:0.86},{opacity:1,y:0,scale:1,duration:${du(0.44)},ease:"back.out(2.4)"},${at(0.72)});`,
      `tl.fromTo(".${id}-url",{opacity:0},{opacity:1,duration:${du(0.24)},ease:"none"},${at(0.9)});`,
      ...sprigTweens(id, ctx, 0.5, "sprout", 0),
      ...groundTweens(id, ctx), ...hudTweens(id, ctx),
    ].filter(Boolean),
  };
}

// ---- spine ------------------------------------------------------------------
const SPEC = {
  first: "cover", last: "close",
  // `feature` leads the rotation so the film's pictures are spent on the layout designed for them;
  // `cards` sits next because it needs nothing but the script's own bullets and can always carry.
  middle: ["feature", "cards", "stat", "quote"],
  shapes: {
    // The manifest's own slot geometry: feature/proof are 1728x410 letterboxes, how is 998x367.
    cover: [], feature: [1728 / 410, 1728 / 410], cards: [998 / 367],
    stat: [], quote: [], close: [], statement: [], "statement-c": [],
  },
  slots: (role, budget) => (role === "feature" ? Math.min(2, Math.max(0, budget))
    : role === "cards" ? Math.min(1, Math.max(0, budget)) : 0),
  needs: (role) => (role === "feature" ? 1 : 0),
  carry: (role, scene, budget) => {
    const isStats = K.numbersIn(scene).length >= 2;
    if (role === "stat") return isStats;
    if (isStats) return false;                       // only `stat` prints figures as figures
    if (role === "feature") return budget >= 1;
    if (role === "cards") return K.bullets(scene, 3).length >= 2;
    // NOT `subtext exists` (the other packs' rule): that made `quote` the catch-all for every
    // bullet-poor beat and attributed a testimonial to whoever the subtext happened to name.
    if (role === "quote") return quoteish(scene) && !!String(scene.quote || scene.headline || scene.subtext || "").trim();
    return true;
  },
};

const BUILDERS = {
  cover: sCover, feature: sFeature, cards: sCards, stat: sStat, quote: sQuote, close: sClose,
  statement: (sc, ctx) => fallback(sc, ctx, false),
  "statement-c": (sc, ctx) => fallback(sc, ctx, true),
};
const LABELS = {
  cover: STRINGS.cover, feature: STRINGS.feature, cards: STRINGS.cards,
  stat: STRINGS.stat, quote: STRINGS.quote, close: STRINGS.cta,
};

const css = (th, stage) => K.baseCss(th, stage, `
  /* Even the caption is a rounded pillow in this pack — nothing here has a sharp corner. */
  #cap-pill { border-radius:${r(R_PILL)}cqw; box-shadow:0 ${r(U(10))}cqw ${r(U(30))}cqw ${rgba(INK, 0.1)}; }
  #cap-text { font-weight:700; }`);

function buildComposition(opts = {}) {
  return K.buildFilm({
    ...opts, stage: STAGE, theme, STRINGS, spec: SPEC, builders: BUILDERS, labels: LABELS,
    css, refBeat: 4.4,
    // `motion.drift: 1.04` from the manifest, and a small push: this film ambles, it never lunges.
    camera: { push: 110, scale: DRIFT },
    signature: "editorial", fallbackBrand: "Sprout",
  });
}

module.exports = { buildComposition, STRINGS };
module.exports.__test = { SPEC, BUILDERS, theme, STAGE };
