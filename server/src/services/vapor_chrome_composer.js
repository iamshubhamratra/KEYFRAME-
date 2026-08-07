// VAPOR CHROME — a tasteful Y2K / retro-future system. Native GSAP + DOM, built on om_port_kit.
//
// PROVENANCE. NOT a port: there is no Claude Design reference for this pack. It is written from its
// own manifest, frames/vapor-chrome/pack.json + FRAME.md, which is the only brief that exists for it.
// The pack shipped with no composer, so every film that selected vapor-chrome rendered through the
// GENERIC scene kit wearing its palette. Its own words describe a frame that did not exist in code:
//
//   "Tasteful Y2K / retro-future for Nova, a creator monetization platform. A deep indigo synthwave
//    night with a scrolling perspective-grid horizon, a single glowing sun-orb, chrome/gradient-clipped
//    Space Grotesk headlines with a light sweep, and neon magenta/teal glow edges. Bold and energetic —
//    but composed, never garish."
//
//   "Recipe per frame: night gradient · ONE horizon-grid (lower half) · ONE sun-orb on the line ·
//    open sky above for content · ONE chrome or neon focal device · teal/magenta chrome."
//
// THE FIVE RULES, taken from that brief and enforced in code:
//
//   1. THE HORIZON IS THE PACK. Every beat — including both statement fallbacks — is built by
//      `shell()`, which supplies the night gradient, EXACTLY ONE CSS-3D perspective grid in the
//      lower band, EXACTLY ONE sun-orb half-sunk on the horizon line, and the pack's own chrome.
//      No builder can forget the signature, and no builder can draw two of it.
//   2. CONTENT LIVES IN THE OPEN SKY. The horizon sits at 62% of the frame (FRAME.md's night-ground),
//      so every layout is measured against a 670px ceiling — HZ, below — and the grid + sun own the
//      band beneath it. That is why `feature` lays the manifest's two 1728×410 letterboxes SIDE BY
//      SIDE rather than stacking them: stacked, at their own aspect, they are 844px tall and there
//      is no such room above the horizon.
//   3. ONE CHROME MOMENT PER FRAME. The gradient-clip + light sweep is reserved for a single hero
//      headline (cover / feature / closing); `proof` spends its one clip on the FIGURES instead, and
//      `quote` + `how` stay solid chrome, per the brief's own frame treatments. All other display is
//      solid `chrome`; neon is never paragraph or multi-line text.
//   4. ONE NEON LEADS PER FRAME, the other supports, violet only bridges, warm only lives in the sun.
//      `neon(ctx)` resolves that from the beat index, so a frame can never run two competing neons in
//      one focal area — and the brand accent leads every other beat, so a rebranded film is still a
//      synthwave night rather than a single-hue wash.
//   5. DEPTH IS GLOW AND PERSPECTIVE, NEVER SHADOW. Zero offset shadows, zero glass blur, zero
//      bevels. Glow is a ZERO-OFFSET box-shadow, a radial-gradient bloom, or a text-shadow on solid
//      type — see the note on `filter: blur()` at `blob()`.
//
// FONT SUBSTITUTION: `Inter` is NOT bundled (src/fonts/pack_fonts.js `isBundled("Inter") === false`),
// so Figtree stands in for the body voice — the nearest neutral UI grotesque that is bundled.
// `Space Grotesk` — the display AND label face — IS bundled and is used exactly as specified. The
// pack names no mono family and the brief BANS mono outright, so the kit's `monoStack` is pointed at
// Space Grotesk as well: K.statement's eyebrow and the caption node both read it, and neither may
// fall back to a monospace face in this pack.

const K = require("./om_port_kit");
const { r, esc, rgba } = K;

const STAGE = K.stageOf(1920, 1080);
const { U, VH } = STAGE;

// The manifest's palette, verbatim. warm is the sun core ONLY; violet bridges and never headlines.
const VOID = "#0D0A2B", GROUND = "#15103F", MAGENTA = "#FF2EA6", TEAL = "#2EF2E0",
  VIOLET = "#8A5CFF", WARM = "#FF7A45", CHROME = "#EAF0FF";
const DISPLAY = "Space Grotesk", BODY = "Figtree", MONO = "Space Grotesk";

const STRINGS = {
  cover: "NOW LIVE", feature: "WHAT IT DOES", how: "HOW IT RUNS", proof: "BY THE NUMBERS",
  quote: "WORD OF MOUTH", closing: "GET IN", scene: "TRACK", of: "OF", go: "START FREE",
};

function theme(brandSkin) {
  const { accent, resolvedBrand } = K.resolveAccent(brandSkin, { ground: VOID, isDark: true, packAccent: MAGENTA });
  return {
    // `accent` IS the leading neon (magenta by default, the brand's colour when there is one).
    accent, teal: TEAL, violet: VIOLET, warm: WARM,
    bg: VOID, ground2: GROUND, ink: CHROME, paper: CHROME,
    panel: rgba(VOID, 0.78), sub: rgba(CHROME, 0.66), line: rgba(TEAL, 0.28),
    // Display is mixed-case Space Grotesk (only the labels are caps), so the mixed advance is right.
    adv: K.ADVANCE.mixed,
    capBg: VOID, capInk: CHROME,
    ...K.fontStacks(DISPLAY, MONO, `'${BODY}', system-ui, sans-serif`, [BODY]),
    bodyStack: `'${BODY}', system-ui, sans-serif`,
    resolvedBrand,
  };
}

// ---- the frame ---------------------------------------------------------------
// The brief's slide-pad is 3.5cqw (67px). The content column is inset a little further than that:
// every neon element in this pack carries a zero-offset glow that bleeds ~U(20) past its own box,
// and at 67px that bleed clips against the frame edge instead of falling off into the night.
const M = U(92);
const COL = U(1920) - M * 2;            // 1736 — which is the manifest's own 1728 measure, near enough
const HZ = U(670);                      // THE HORIZON LINE: 62% of 1080 (FRAME.md night-ground)
const SKY = HZ - U(10);                 // the ceiling every layout is measured against (rule 2)
const TOPBAR = U(150);                  // below the chrome

// THE PERSPECTIVE FLOOR, in authored px. Derived, not guessed: with the plane's origin at its NEAR
// edge and rotateX(68deg), a row `d` px up the plane lands `d·cos68·P/(P + d·sin68)` px above the
// band's foot. At d = PLANE that evaluates to 411 — the exact height of the band — so the far edge
// of the floor lands ON the horizon line and its width converges to 15% of its own. Origin at the
// NEAR edge is the whole trick: with the origin at the far edge, z is 0 there, nothing converges,
// and the "perspective grid" renders as a flat ladder.
const PLANE = U(7200), PERSP = U(1200), CELL = U(400), COLS = 33, ROWS = 19;
const BAND_PX = 1080 - 670;             // the grid band's own height, for its own gradient maths

// LAW: `radial-gradient(ellipse A% B% at x% y%)` — NEVER `circle <pct>%`, which is invalid CSS and
// makes the browser drop the ENTIRE comma-joined background (it has cost this library three packs).
// The two radii are percentages of the BOX'S OWN width and height, so they must be computed
// separately AND against the box the gradient is painted in — the grid band is 1920×410, not 1920×1080.
//
// This is also how every "glow", "bloom" and "haze" in this pack is expressed. There is NO
// `filter: blur()` and NO `backdrop-filter` anywhere in this file: a per-scene stack of blurred
// layers makes a seeked capture come back SOLID BLACK, and a synthwave pack would otherwise want a
// dozen of them.
const blob = (px, py, boxW, boxH, x, y, stops) =>
  `radial-gradient(ellipse ${r((px / boxW) * 100)}% ${r((py / boxH) * 100)}% at ${r(x)}% ${r(y)}%, ${stops})`;
// A square box: 50%/50% radii ARE a circle, and both are explicit. `circle 50%` is the invalid form.
const disc = (stops) => `radial-gradient(ellipse 50% 50% at 50% 50%, ${stops})`;

// THE ACCENT LAW, in one place: one neon leads per beat and the other supports. Violet is the
// bridge, warm is the sun. No builder chooses its own hues.
const neon = (ctx) => (ctx.i % 2 === 0
  ? { lead: ctx.th.accent, sup: ctx.th.teal }
  : { lead: ctx.th.teal, sup: ctx.th.accent });

// ---- the signature: night ground + horizon grid + sun-orb ---------------------
// ONE grid, ONE sun, lower band only. `gridA` dims the floor for the beats the brief wants quiet
// (the quote) and brightens it for the closer; `sunX`/`sun` move and size the single orb.
//
// `core` DIMS THE ORB WITHOUT REMOVING IT. Three beats put copy within reach of the horizon —
// `how`'s step rows, `proof`'s stat labels and the centred `quote`, which the brief actually asks to
// sit in front of the sun "as a halo". Rendered at full strength the warm core came up behind that
// copy: chrome type on a lit magenta field, which is the readability failure FRAME.md's text law
// exists to prevent. Shrinking the orb was the wrong fix (below ~360 it stops reading as the sun and
// the beat loses the signature); dimming its stops keeps ONE orb on the line and hands the frame back
// to the type. Found by rendering the beats, not by reading the code.
function horizon(id, th, o = {}) {
  const sunX = o.sunX != null ? o.sunX : 560;          // authored px ≈ 30%, per FRAME.md's sun glow
  const size = U(o.sun || 520);
  const halo = size * 1.9;
  const gA = o.gridA != null ? o.gridA : 0.6;
  const core = o.core != null ? o.core : 1;
  const lit = 0.55 + 0.45 * core;

  // The rows: one full-width neon line per grid cell, magenta (left) → violet → teal (right). The
  // ramp is packed into the middle half because the plane is 200% wide — the outer half only ever
  // enters frame at the near edge, and fading it there is what keeps the floor from ending in a
  // hard vertical seam. k runs from -1 so a fresh row is always waiting beyond the horizon.
  const rows = [];
  for (let k = -1; k <= ROWS; k++) {
    rows.push(`<div style="position:absolute;left:0;right:0;top:${r(k * CELL)}cqw;height:${r(U(4))}cqw;background:linear-gradient(90deg, ${rgba(th.accent, 0)} 0%, ${rgba(th.accent, gA)} 25%, ${rgba(th.violet, gA * 0.85)} 50%, ${rgba(th.teal, gA)} 75%, ${rgba(th.teal, 0)} 100%);"></div>`);
  }
  // The columns: each ONE line, its own colour lerped magenta → teal across the visible middle half,
  // fading to nothing at the far end. Discrete divs rather than a repeating gradient, because a
  // repeating-linear-gradient cannot vary its stripe colour along the axis it repeats on — and
  // "1px magenta (left) → teal (right)" is the brief's own description of the floor.
  const cols = [];
  for (let j = 0; j < COLS; j++) {
    const u = j / (COLS - 1);
    const t = K.clamp01((u - 0.25) * 2);
    const c = K.mixHex(th.accent, th.teal, t);
    const side = u < 0.25 || u > 0.75 ? 0.45 : 1;
    cols.push(`<div style="position:absolute;top:0;height:${r(PLANE)}cqw;left:${r(u * 100)}%;width:${r(U(4))}cqw;background:linear-gradient(to bottom, ${rgba(c, 0)} 0%, ${rgba(c, gA * 0.5 * side)} 34%, ${rgba(c, gA * side)} 100%);"></div>`);
  }

  return `<div style="position:absolute;inset:0;background:linear-gradient(to bottom, ${th.bg} 0%, ${th.bg} 32%, ${th.ground2} ${r((HZ / VH) * 100)}%, ${th.ground2} 100%);overflow:hidden;">
    <div style="position:absolute;inset:0;background:${blob(1600, 980, 1920, 1080, (sunX / 1920) * 100, (HZ / VH) * 100, `${rgba(th.violet, 0.22)} 0%, ${rgba(th.violet, 0)} 70%`)};"></div>
    <div style="position:absolute;left:0;right:0;top:0;height:${r(HZ)}cqw;overflow:hidden;">
      <div class="${id}-sunh" style="position:absolute;left:${r(U(sunX) - halo / 2)}cqw;top:${r(HZ - halo / 2)}cqw;width:${r(halo)}cqw;height:${r(halo)}cqw;border-radius:50%;background:${disc(`${rgba(th.accent, r(0.3 * lit))} 0%, ${rgba(th.accent, r(0.1 * lit))} 42%, ${rgba(th.accent, 0)} 70%`)};"></div>
      <div class="${id}-sun" style="position:absolute;left:${r(U(sunX) - size / 2)}cqw;top:${r(HZ - size / 2)}cqw;width:${r(size)}cqw;height:${r(size)}cqw;border-radius:50%;background:${disc(`${rgba(th.warm, r(core))} 0%, ${rgba(th.warm, r(0.92 * core))} 20%, ${rgba(th.accent, r(core))} 48%, ${rgba(th.accent, r(0.35 * core))} 62%, ${rgba(th.accent, 0)} 72%`)};"></div>
    </div>
    <div style="position:absolute;left:0;right:0;top:${r(HZ)}cqw;height:${r(VH - HZ)}cqw;overflow:hidden;">
      <div style="position:absolute;left:-50%;width:200%;bottom:0;height:${r(PLANE)}cqw;transform-origin:50% 100%;transform:perspective(${r(PERSP)}cqw) rotateX(68deg);">
        <div class="${id}-gsw" style="position:absolute;inset:0;">${rows.join("")}</div>
        ${cols.join("")}
      </div>
      <div style="position:absolute;inset:0;background:linear-gradient(to bottom, ${th.bg} 0%, ${rgba(th.bg, 0.72)} 15%, ${rgba(th.bg, 0)} 48%);"></div>
      <div style="position:absolute;inset:0;background:${blob(1200, 320, 1920, BAND_PX, (sunX / 1920) * 100, 0, `${rgba(th.accent, r(0.26 * lit))} 0%, ${rgba(th.accent, 0)} 70%`)};"></div>
    </div>
    <div style="position:absolute;inset:0;background:${blob(1920, 1080, 1920, 1080, 50, 50, `transparent 42%, ${rgba("#000000", 0.4)} 100%`)};"></div>
  </div>`;
}

// The floor SCROLLS — "animate downward, FINITE (the scroll never loops forever)". One tween that
// travels a whole number of cells over a span that outlasts the beat: seamless (a cell's translate
// is indistinguishable from none) and it never freezes mid-beat, which a `repeat` count of 0 or 1
// visibly does. The sun breathes on a yoyo whose half-period matches its own sine.
function horizonTweens(id, ctx) {
  const period = 1.7;
  const n = Math.max(1, Math.ceil((ctx.L + 0.5) / period));
  const half = Math.max(2.4, ctx.L * 0.7);
  return [
    `tl.fromTo(".${id}-gsw",{y:0},{y:"${r(CELL * n)}cqw",duration:${r(period * n)},ease:"none"},${r(ctx.T)});`,
    `tl.to(".${id}-sunh",{scale:1.07,duration:${r(half)},ease:"sine.inOut",repeat:${K.reps(ctx.L, half)},yoyo:true},${r(ctx.T)});`,
    `tl.fromTo(".${id}-sun",{scale:0.94},{scale:1,duration:${ctx.du(0.9)},ease:"expo.out"},${ctx.at(0)});`,
  ];
}

// `motion.cut: "whip"` — the cut is a WHIP, so every beat opens with a light streak ripping across
// the frame at speed. Not a wash (a hold over the whole frame), not an iris (a hole opening), not a
// panel (an edge sliding in): a fast, narrow, over-driven smear that is gone before it registers.
// It sits in the CONTENT layer at z-index 30 so it rakes across the copy, not behind it.
const whip = (id, th, lead) =>
  `<div class="${id}-whip" style="position:absolute;inset:0;z-index:30;pointer-events:none;opacity:0;background:linear-gradient(102deg, ${rgba(lead, 0)} 38%, ${rgba(CHROME, 0.5)} 48%, ${rgba(lead, 0.6)} 51%, ${rgba(th.violet, 0.3)} 55%, ${rgba(th.violet, 0)} 62%);"></div>`;
const whipTweens = (id, ctx) => [
  `tl.fromTo(".${id}-whip",{opacity:0},{opacity:1,duration:${ctx.du(0.06)},ease:"none"},${ctx.at(0)});`,
  // scaleX is in BOTH vars objects on purpose: a property that appears only in `from` is animated
  // from that value back to whatever the element currently has, which is not what a constant means.
  `tl.fromTo(".${id}-whip",{x:"${r(-U(1700))}cqw",scaleX:1.5},{x:"${r(U(1700))}cqw",scaleX:1.5,duration:${ctx.du(0.42)},ease:"power2.inOut"},${ctx.at(0)});`,
  `tl.to(".${id}-whip",{opacity:0,duration:${ctx.du(0.14)},ease:"none"},${ctx.at(0.34)});`,
];

// ---- chrome ------------------------------------------------------------------
// THIS PACK OWNS ITS CHROME. The kit's chrome paints from the FILM theme's single accent, but the
// leading neon here alternates per beat (rule 4) and the pack's mark is a gradient tile, not a flat
// accent square. Returning this from every builder also stops the kit emitting its now-orphaned
// progress tween (om_port_kit.buildFilm keys that off `chrome == null`), so the rail below carries
// the film-wide fill instead.
function hud(ctx, lead) {
  const { id, th, i, total, label } = ctx;
  const brand = String(ctx.brand || "NOVA").slice(0, 22);
  return `<div class="om-chrome">
    <div style="position:absolute;left:${r(M)}cqw;top:${r(U(44))}cqw;display:flex;align-items:center;gap:${r(U(16))}cqw;">
      <span style="display:inline-grid;place-items:center;width:${r(U(42))}cqw;height:${r(U(42))}cqw;border-radius:${r(U(12))}cqw;background:linear-gradient(140deg, ${lead} 0%, ${th.violet} 100%);color:${th.bg};font-family:${th.displayStack};font-weight:700;font-size:${r(U(24))}cqw;box-shadow:0 0 ${r(U(20))}cqw ${rgba(lead, 0.4)};flex:0 0 auto;">${esc(brand.slice(0, 1).toUpperCase())}</span>
      <span style="font-family:${th.displayStack};font-weight:700;font-size:${r(U(26))}cqw;letter-spacing:-0.01em;color:${th.ink};white-space:nowrap;">${esc(brand)}</span>
      ${label ? `<span style="font-family:${th.displayStack};font-weight:600;font-size:${r(U(17))}cqw;letter-spacing:0.22em;text-transform:uppercase;color:${rgba(lead, 0.92)};white-space:nowrap;">／ ${esc(label)}</span>` : ""}
    </div>
    <div style="position:absolute;right:${r(M)}cqw;top:${r(U(52))}cqw;font-family:${th.displayStack};font-weight:600;font-size:${r(U(17))}cqw;letter-spacing:0.22em;color:${th.sub};white-space:nowrap;">${esc(ctx.S.scene || STRINGS.scene)} ${K.pad2(i + 1)} ${esc(ctx.S.of || STRINGS.of)} ${K.pad2(total)}</div>
    <div style="position:absolute;left:${r(M)}cqw;right:${r(M)}cqw;bottom:${r(U(44))}cqw;height:${r(U(3))}cqw;background:${rgba(th.ink, 0.14)};overflow:hidden;">
      <div class="${id}-rail" style="width:100%;height:100%;background:linear-gradient(90deg, ${th.accent} 0%, ${th.violet} 55%, ${th.teal} 100%);transform:scaleX(${r(total ? i / total : 0)});transform-origin:left center;"></div>
    </div>
  </div>`;
}
const hudTweens = (id, ctx) => [
  `tl.to(".${id}-rail",{scaleX:${r(ctx.total ? (ctx.i + 1) / ctx.total : 1)},duration:${r(ctx.L)},ease:"none"},${r(ctx.T)});`,
];

// EVERY BEAT GOES THROUGH HERE. This is what makes the signature unforgettable-by-construction:
// a builder returns only its own copy and furniture, and the ground, the single grid, the single
// sun, the whip and the chrome are attached for it — statement fallbacks included.
function shell(built, ctx, o = {}) {
  const { id, th } = ctx;
  const { lead } = neon(ctx);
  return {
    ...built,
    backdrop: horizon(id, th, o),
    chrome: hud(ctx, lead),
    html: `${whip(id, th, lead)}${built.html}`,
    s: [...(built.s || []), ...whipTweens(id, ctx), ...horizonTweens(id, ctx), ...hudTweens(id, ctx)],
  };
}
// The pictureless layout is kit-owned, and its list rows divide the stage all the way to 84% of the
// frame — below the horizon and straight across the orb. It is the one layout this pack cannot
// measure, so the fallback gets a QUIET floor AND a banked sun: the copy stays readable over the band
// instead of competing with a full-strength grid and a lit core.
const fallback = (scene, ctx, centred = false) =>
  shell(K.statement(scene, ctx, { centred }), ctx, { gridA: 0.28, sun: 440, core: 0.45 });

// ---- type --------------------------------------------------------------------
// Shared metrics, so a glitch ghost is set in exactly the same face, size and tracking as the line
// it is a ghost OF. Getting that wrong is how an RGB-split reads as two different headlines.
const metrics = (th, size, weight = 700, lh = 1.02, track = "-0.02em") =>
  `font-family:${th.displayStack};font-weight:${weight};font-size:${r(size)}cqw;line-height:${lh};letter-spacing:${track};`;

// THE ONE CHROME MOMENT: the pack's chrome → teal → violet gradient clipped onto the letterforms,
// 2.4× the width of the text so a brighter band can be SWEPT through it. The highlight sits at the
// image's exact midpoint, which is what lets it travel the full width of the word (below).
const chromeFill = (th) =>
  `background-image:linear-gradient(104deg, ${th.ink} 0%, ${th.violet} 16%, ${th.teal} 32%, #FFFFFF 50%, ${th.teal} 68%, ${th.violet} 84%, ${th.ink} 100%);` +
  `background-size:240% 100%;background-position:100% 0;background-repeat:no-repeat;` +
  `-webkit-background-clip:text;background-clip:text;color:transparent;`;
// The sweep moves the clipped background, not the type. It is the one non-transform tween in the
// pack: `background-position` is paint-only (no reflow, and not on the motion-safety LAYOUT list),
// and there is no transform that can slide a fill THROUGH stationary glyphs.
//
// 100% → 0% AND NO FURTHER. A percentage background-position resolves as P·(boxW − imgW), so with a
// 240% image, P outside [0,100] slides the image clear of part of its own box — and a gradient-clipped
// box with no background paints TRANSPARENT TEXT. The first cut swept to -40%, which left the first
// 56% of every headline box empty: the opening line of the film's hero simply was not there, in a
// frame that otherwise looked finished. Verified by rendering the beat, not by reading the code.
const sweepTween = (id, ctx, at, cls = "hl") =>
  `tl.fromTo(".${id}-${cls}",{backgroundPosition:"100% 0"},{backgroundPosition:"0% 0",duration:${ctx.du(1)},ease:"power2.inOut"},${ctx.at(at)});`;

// The stat-plate fill: cooler and flatter than the hero's, so a proof beat still reads as ONE
// gradient-clip device and not as a second chrome headline.
const figFill = (th) =>
  `background-image:linear-gradient(162deg, ${th.teal} 0%, ${th.ink} 62%, ${rgba(th.ink, 0.9)} 100%);` +
  `-webkit-background-clip:text;background-clip:text;color:transparent;`;

// `textfx.enter: "glitch"` — an RGB-split. Two offset ghost copies snap back into the line while the
// line itself is uncovered in hard STEPS, never a fade. Transforms, clip-path and opacity only.
//
// `width:fit-content` on the real line is load-bearing, not tidiness: a gradient-clipped background
// is measured against the ELEMENT'S box, so a full-column block would spread the seven-stop chrome
// ramp across 1500px and each word would sample ~8% of it — a flat wash where the brief asks for
// "the 3D-looking hero word". Shrink-wrapped, every line carries the whole ramp. It stays a BLOCK
// (rather than inline-block) so it has no baseline strut to offset it from the ghosts, which are
// absolute at top:0; `margin:auto` is what centres it when the beat is centred.
function glitch(id, lines, { style, cls = "hl", ghostA, ghostB, met, centred = false }) {
  const mid = centred ? "margin-left:auto;margin-right:auto;" : "";
  return lines.map((l) => `<span style="position:relative;display:block;">
      <span class="${id}-g1" aria-hidden="true" style="position:absolute;left:0;top:0;width:100%;white-space:pre;${met}color:${ghostA};opacity:0;">${esc(l)}</span>
      <span class="${id}-g2" aria-hidden="true" style="position:absolute;left:0;top:0;width:100%;white-space:pre;${met}color:${ghostB};opacity:0;">${esc(l)}</span>
      <span class="${id}-${cls}" style="position:relative;display:block;width:fit-content;${mid}white-space:pre;${style}opacity:0;">${esc(l)}</span>
    </span>`).join("");
}
const glitchTweens = (id, ctx, at, cls = "hl") => [
  `tl.fromTo(".${id}-${cls}",{opacity:0,clipPath:"inset(44% 0% 44% 0%)"},{opacity:1,clipPath:"inset(0% 0% 0% 0%)",duration:${ctx.du(0.34)},ease:"steps(5)",stagger:${ctx.du(0.08)}},${ctx.at(at)});`,
  // `set` rather than a fade: a glitch ghost APPEARS, it does not arrive politely.
  `tl.set(".${id}-g1,.${id}-g2",{opacity:0.5},${ctx.at(at)});`,
  `tl.fromTo(".${id}-g1",{x:"${r(-U(30))}cqw"},{x:0,duration:${ctx.du(0.3)},ease:"steps(4)",stagger:${ctx.du(0.08)}},${ctx.at(at)});`,
  `tl.fromTo(".${id}-g2",{x:"${r(U(30))}cqw"},{x:0,duration:${ctx.du(0.3)},ease:"steps(4)",stagger:${ctx.du(0.08)}},${ctx.at(at)});`,
  `tl.to(".${id}-g1,.${id}-g2",{opacity:0,duration:${ctx.du(0.14)},ease:"none"},${ctx.at(at + 0.4)});`,
];

// `neon-chip` — the eyebrow/badge. A glowing wide-tracked caps pill; it opens a region and is never
// plain text. The brief sets the label at 12px, which at 1920 is unreadable through video
// compression; U(20) is the smallest size that survives a render, and the brief's own 1.4cqw
// legibility floor governs load-bearing LINES, which a chip is not.
const chip = (th, t, color, cls = "") =>
  `<span${cls ? ` class="${cls}"` : ""} style="display:inline-flex;align-items:center;gap:${r(U(10))}cqw;padding:${r(U(10))}cqw ${r(U(20))}cqw;border-radius:${r(U(999))}cqw;border:${r(U(2))}cqw solid ${rgba(color, 0.7)};box-shadow:0 0 ${r(U(18))}cqw ${rgba(color, 0.3)};background:${rgba(VOID, 0.55)};font-family:${th.displayStack};font-weight:600;font-size:${r(U(20))}cqw;letter-spacing:0.22em;text-transform:uppercase;color:${color};white-space:nowrap;">
    <span style="width:${r(U(8))}cqw;height:${r(U(8))}cqw;border-radius:50%;background:${color};box-shadow:0 0 ${r(U(10))}cqw ${color};flex:0 0 auto;"></span>${esc(t)}</span>`;

// `textfx.emphasis: "glow"` — the emphasised run keeps the chrome text colour and gains a neon halo.
// It is applied ONLY to SOLID display type. A text-shadow on gradient-clipped text paints on top of
// the clipped fill (a shadow renders above the background but below the glyph, and the glyph here is
// transparent), which would mud the one chrome moment. The hero's emphasis is the light sweep.
function glowRun(th, line, word, color) {
  const s = String(line || ""), w = String(word || "").trim();
  if (!w || w.length < 2) return esc(s);
  const i = s.toLowerCase().indexOf(w.toLowerCase());
  if (i < 0) return esc(s);
  return `${esc(s.slice(0, i))}<span style="text-shadow:0 0 ${r(U(26))}cqw ${rgba(color, 0.8)};">${esc(s.slice(i, i + w.length))}</span>${esc(s.slice(i + w.length))}`;
}

// "8" + "seconds" is ONE figure and ONE unit, not one word. A word-like unit gets a space; a symbol
// (%, x, k, m, ★) never does — `numbersIn` returns both kinds and printing them the same way is how
// a stat plate ends up reading "8seconds".
const unit = (s) => (/^[a-z]{3,}$/i.test(String(s || "")) ? ` ${s}` : String(s || ""));

// MEASURE, DO NOT GUESS. Body copy is FITTED to its column — the camera scales the content layer, so
// the measure it is fitted against is the narrowed one, and the number of lines is known before the
// beat decides what else it has room for.
const bodyFit = (text, w, size, maxLines, adv) =>
  K.fitLines(String(text || "").trim(), w / K.camSafe(), size, maxLines, adv);
const bodyHtml = (id, th, f, { x, y, w, cls = "bl", align = "left" }) => (f.lines.length
  ? `<div class="${id}-${cls}" style="position:absolute;left:${r(x)}cqw;top:${r(y)}cqw;width:${r(w)}cqw;text-align:${align};font-family:${th.bodyStack};font-weight:400;font-size:${r(f.size)}cqw;line-height:1.5;color:${th.ink};opacity:0;">${f.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>`
  : "");

// A NEON WINDOW — the pack's only picture container. Never drawn empty: it returns "" without an
// asset, and every caller gates on the same condition. No opaque panel, no bevel: one hairline neon
// edge, one zero-offset glow, and a CRT scanline veil that also buys the caption band its contrast.
function neonWindow(cls, th, { x, y, w, h, shot, color, contain = false, band = "", radius = U(16), z = 4 }) {
  if (!shot || !shot.path) return "";
  // A CONTAINED PICTURE MAKES THE WINDOW ITS OWN SIZE. `object-fit:contain` inside a box wider than
  // the asset letterboxes it, so the neon edge framed empty ground on both sides while the picture
  // floated in the middle — the window has to hug what it contains. Cropping is not an option here:
  // the manifest asks contain for these product shots. So the WINDOW narrows to the asset's ratio
  // (never wider than the slot) and re-centres on the space it was given.
  if (contain && shot.ratio > 0.2) {
    const fitW = Math.min(w, h * shot.ratio);
    x += (w - fitW) / 2;
    w = fitW;
  }
  return `<div class="${cls}" style="position:absolute;left:${r(x)}cqw;top:${r(y)}cqw;width:${r(w)}cqw;height:${r(h)}cqw;z-index:${z};border-radius:${r(radius)}cqw;overflow:hidden;border:${r(U(2))}cqw solid ${rgba(color, 0.62)};box-shadow:0 0 ${r(U(34))}cqw ${rgba(color, 0.26)};background:${th.ground2};opacity:0;">
    ${contain
      // K has exactly ONE media helper, shotFill, and it CROPS. The manifest asks objectFit:"contain"
      // for the product images, so that one case writes its own <img> — inset:0 inside this
      // POSITIONED box, so the picture fills the window without escaping over the furniture.
      ? `<img src="${esc(shot.path)}" alt="${esc(shot.alt || "")}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block;">`
      : K.shotFill(shot, { bg: th.ground2, w, h })}
    <div style="position:absolute;inset:0;background:repeating-linear-gradient(to bottom, ${rgba(VOID, 0.24)} 0 ${r(U(2))}cqw, ${rgba(VOID, 0)} ${r(U(2))}cqw ${r(U(6))}cqw);"></div>
    ${band
      // TEXT OVER AN IMAGE SITS ON A DARK SCRIM, never raw on a busy picture (the brief's text law).
      ? `<div style="position:absolute;left:0;right:0;bottom:0;padding:${r(U(20))}cqw ${r(U(24))}cqw;background:linear-gradient(to top, ${rgba(VOID, 0.95)} 0%, ${rgba(VOID, 0.72)} 58%, ${rgba(VOID, 0)} 100%);">${band}</div>`
      : ""}
  </div>`;
}
// How many characters of caption a window's band can hold on ONE line — its own width, less the
// padding and the chip beside it, divided by the mean advance. Measured, so a wider strip gets a
// longer caption instead of every band being clipped to the same guessed number.
const bandChars = (w, size, taken) => Math.max(14, Math.floor((w - U(48) - taken) / (size * K.ADVANCE.mixed)));
// K.clampWords cuts on a word boundary, which is right — but it can still land on a dangling
// article ("…recurring income without a"), which reads as clipped text even though it is not.
const trimTail = (s) => String(s).replace(/[\s,;:]+(?:a|an|and|or|the|of|to|in|on|for|with|without|by|at|from|that|this)$/i, "").replace(/[,;:]$/, "");

const windowTweens = (cls, ctx, at) => [
  `tl.to(".${cls}",{opacity:1,duration:${ctx.du(0.08)},ease:"none"},${ctx.at(at)});`,
  // The window RIPS open left to right — the whip cut, at the scale of one object.
  `tl.fromTo(".${cls}",{clipPath:"inset(0% 100% 0% 0%)"},{clipPath:"inset(0% 0% 0% 0%)",duration:${ctx.du(0.44)},ease:"expo.out"},${ctx.at(at)});`,
];

// ---- scenes ------------------------------------------------------------------
// COVER — the brief's frame 1: deep night, the grid receding, the sun on the line, a neon-chip
// eyebrow over the chrome headline in the open sky. ~55% open.
//
// The optional picture is the manifest's `context` shape (826×162 — a 5.1:1 STRIP, not a card), used
// here as a widescreen slit hovering just above the horizon with the beat's own subtext in its band:
// a "now showing" window over the floor. It is drawn ONLY if the measured headline leaves room for
// it above the horizon; otherwise the subtext becomes body copy and no container is drawn at all.
function sCover(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const { lead, sup } = neon(ctx);
  const shot = (shots || [])[0] || null;
  const ribW = U(1020);
  const headTop = U(224);
  const head = K.fitLines(String(scene.headline || scene.title || ctx.title || ""),
    U(1500) / K.camSafe(), shot ? U(92) : U(104), shot ? 2 : 3, th.adv);
  const headBot = headTop + head.lines.length * head.size * 1.02;
  const ribY = headBot + U(48);
  // The strip takes the room the measured headline LEAVES, up to 280. A one-line hook gives it the
  // full depth; a two-line hook shortens it; anything below 170 is a slit rather than a window, so
  // the beat drops it and prints the subtext as body copy instead — never a container for its own sake.
  const ribH = Math.min(U(280), HZ + U(14) - ribY);
  const useRib = !!shot && ribH >= U(170);
  const cap = K.clampWords(String(scene.subtext || scene.body || "").trim(), 116);
  const body = !useRib && cap ? bodyFit(cap, U(1040), U(28), 2, th.adv) : { lines: [], size: U(28) };
  const stamp = K.clampWords(String(scene.emphasis || "").trim(), 22);

  return shell({
    html: `
    <div class="${id}-glow" style="position:absolute;left:${r(M - U(60))}cqw;top:${r(headTop - U(80))}cqw;width:${r(U(1300))}cqw;height:${r(head.lines.length * head.size * 1.02 + U(200))}cqw;background:${disc(`${rgba(th.violet, 0.26)} 0%, ${rgba(th.violet, 0)} 68%`)};z-index:2;opacity:0;"></div>
    <div class="${id}-chip" style="position:absolute;left:${r(M)}cqw;top:${r(U(168))}cqw;display:flex;align-items:center;gap:${r(U(14))}cqw;z-index:5;opacity:0;">
      ${chip(th, String(scene.kicker || ctx.label || STRINGS.cover).slice(0, 26), lead)}
      ${/* The emphasis rides the eyebrow ROW rather than a line of its own: on the strip layout there
            is no vertical room left below the headline, and dropping it there lost a line of authored
            copy on exactly the beat that has the least of it. */ ""}
      ${stamp ? chip(th, stamp, sup) : ""}
    </div>
    <div style="position:absolute;left:${r(M)}cqw;top:${r(headTop)}cqw;width:${r(U(1500))}cqw;z-index:5;">
      ${glitch(id, head.lines, {
        met: metrics(th, head.size, 700, 1.02, "-0.03em"),
        style: `${metrics(th, head.size, 700, 1.02, "-0.03em")}${chromeFill(th)}`,
        ghostA: rgba(th.accent, 0.9), ghostB: rgba(th.teal, 0.9),
      })}
    </div>
    ${useRib ? neonWindow(`${id}-rib`, th, {
      x: M, y: ribY, w: ribW, h: ribH, shot, color: sup,
      // ONE line, cut on a WORD. The band's scrim already spends 40% of a 5:1 strip; a caption that
      // wraps to a second line eats the picture, and a bare slice() cut it mid-word ("…or a de").
      band: cap ? `<div style="display:flex;align-items:center;gap:${r(U(18))}cqw;">${chip(th, String(ctx.brand || "").slice(0, 14) || STRINGS.cover, lead)}<span style="font-family:${th.bodyStack};font-weight:400;font-size:${r(U(24))}cqw;line-height:1.35;color:${th.ink};white-space:nowrap;">${esc(trimTail(K.clampWords(cap, bandChars(ribW, U(24), U(230)))))}</span></div>` : "",
    }) : bodyHtml(id, th, body, { x: M, y: headBot + U(40), w: U(1040) })}`,
    s: [
      `tl.fromTo(".${id}-chip",{opacity:0,x:"${r(-U(30))}cqw"},{opacity:1,x:0,duration:${du(0.24)},ease:"expo.out"},${at(0.08)});`,
      `tl.to(".${id}-glow",{opacity:1,duration:${du(0.5)},ease:"none"},${at(0.14)});`,
      ...glitchTweens(id, ctx, 0.18),
      sweepTween(id, ctx, 0.5),
      useRib ? windowTweens(`${id}-rib`, ctx, 0.72).join("\n  ") : "",
      !useRib && body.lines.length ? `tl.fromTo(".${id}-bl",{opacity:0,y:"${r(U(22))}cqw"},{opacity:1,y:0,duration:${du(0.32)},ease:"power3.out"},${at(0.7)});` : "",
    ].filter(Boolean),
  }, ctx, { sunX: 1360, sun: 520 });
}

// FEATURE — the manifest's widest slot, 1728×410. Two of them SIDE BY SIDE, because the sky above
// the horizon is 670px tall and two stacked letterboxes at their own aspect are 844px. Each window
// carries its own neon chip and one line of the beat's copy inside a void scrim band, which is both
// the brief's Feature ("2–3 neon-chip + heading + body groups") and its text-over-image law.
function sFeature(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const { lead, sup } = neon(ctx);
  const pics = (shots || []).filter((s) => s && s.path).slice(0, 2);
  if (!pics.length) return fallback(scene, ctx);
  const n = pics.length;
  const head = K.fitLines(String(scene.headline || scene.title || ""), U(1400) / K.camSafe(), U(76), 2, th.adv);
  const headTop = TOPBAR + U(56);
  const headBot = headTop + head.lines.length * head.size * 1.06;
  const gap = U(28);
  // A SINGLE picture does NOT get the full measure. At 1736 wide the manifest's 4.2:1 letterbox
  // becomes a 6.9:1 slit and a 16:9 capture is cropped to a band with nothing legible left in it.
  // One strip takes 1180 and leaves the rest as open sky (the brief asks for ~50% breathing); two
  // split the measure and each keeps the manifest's own aspect exactly.
  const w = n === 2 ? (COL - gap) / 2 : U(1180);
  // Measured, then clamped to the sky: the band starts under whatever the headline actually occupies
  // and gives back HEIGHT rather than crossing the horizon when a second line pushes it down.
  const y = headBot + U(40);
  const h = Math.max(U(150), Math.min(w / (1728 / 410), SKY - y));
  const notes = K.bullets(scene, n).map((b) => String(b));
  return shell({
    html: `
    <div class="${id}-chip" style="position:absolute;left:${r(M)}cqw;top:${r(TOPBAR)}cqw;z-index:5;opacity:0;">${chip(th, String(scene.kicker || ctx.label || STRINGS.feature).slice(0, 26), lead)}</div>
    <div style="position:absolute;left:${r(M)}cqw;top:${r(headTop)}cqw;width:${r(U(1400))}cqw;z-index:5;">
      ${glitch(id, head.lines, {
        met: metrics(th, head.size, 700, 1.06),
        style: `${metrics(th, head.size, 700, 1.06)}${chromeFill(th)}`,
        ghostA: rgba(th.accent, 0.9), ghostB: rgba(th.teal, 0.9),
      })}
    </div>
    ${pics.map((shot, i) => neonWindow(`${id}-w${i}`, th, {
      x: M + i * (w + gap), y, w, h, shot, color: i === 0 ? lead : sup,
      band: notes[i]
        ? `<div style="display:flex;align-items:center;gap:${r(U(16))}cqw;">${chip(th, K.pad2(i + 1), i === 0 ? lead : sup)}<span style="font-family:${th.bodyStack};font-weight:400;font-size:${r(U(24))}cqw;line-height:1.3;color:${th.ink};white-space:nowrap;">${esc(trimTail(K.clampWords(notes[i], bandChars(w, U(24), U(150)))))}</span></div>`
        : "",
    })).join("")}`,
    s: [
      `tl.fromTo(".${id}-chip",{opacity:0,x:"${r(-U(30))}cqw"},{opacity:1,x:0,duration:${du(0.22)},ease:"expo.out"},${at(0.06)});`,
      ...glitchTweens(id, ctx, 0.14),
      sweepTween(id, ctx, 0.42),
      ...pics.flatMap((_, i) => windowTweens(`${id}-w${i}`, ctx, 0.52 + i * 0.16)),
    ],
    // Two strips span the measure, so the orb rises between them at centre; one strip leaves the
    // right half of the sky open, and that is where the sun belongs.
  }, ctx, { sunX: n === 2 ? 960 : 1580, sun: 460, gridA: 0.5 });
}

// HOW — the walkthrough. Numbered neon-chip steps in the sky on the left, ONE `contain` product
// window on the right (the manifest's 998×367). The headline stays solid chrome and spends the
// frame's one focal device on the emphasis GLOW instead of a second gradient-clip.
function sHow(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const { lead, sup } = neon(ctx);
  const steps = K.bullets(scene, 3);
  if (steps.length < 2) return fallback(scene, ctx);
  const shot = (shots || [])[0] || null;
  const winW = U(768), winH = U(282);
  const winX = U(1920) - M - winW;
  const colW = shot ? winX - M - U(56) : COL;
  const line = String(scene.headline || STRINGS.how);
  const size = K.fitOne(line, colW / K.camSafe(), U(66), th.adv);
  const headTop = TOPBAR + U(50);
  const rowsTop = headTop + size * 1.08 + U(52);
  // Rows DIVIDE the room they have, but a two-step beat must not sprawl its rows 150px apart just
  // because the sky is tall — capped, the group still reads as a list rather than as scattered lines.
  const rowH = Math.min(U(130), Math.max(U(84), (SKY - rowsTop) / steps.length));
  return shell({
    html: `
    <div class="${id}-chip" style="position:absolute;left:${r(M)}cqw;top:${r(TOPBAR)}cqw;z-index:5;opacity:0;">${chip(th, String(scene.kicker || ctx.label || STRINGS.how).slice(0, 26), lead)}</div>
    <div class="${id}-hd" style="position:absolute;left:${r(M)}cqw;top:${r(headTop)}cqw;width:${r(colW)}cqw;z-index:5;${metrics(th, size, 700, 1.08)}color:${th.ink};opacity:0;">${glowRun(th, line, String(scene.emphasis || ""), lead)}</div>
    ${steps.map((s, i) => `<div class="${id}-row" style="position:absolute;left:${r(M)}cqw;top:${r(rowsTop + i * rowH)}cqw;width:${r(colW)}cqw;height:${r(rowH)}cqw;display:flex;align-items:center;gap:${r(U(22))}cqw;border-top:${r(U(2))}cqw solid ${rgba(sup, 0.28)};z-index:5;opacity:0;">
      ${chip(th, K.pad2(i + 1), i === 0 ? lead : sup)}
      <span style="font-family:${th.displayStack};font-weight:600;font-size:${r(U(32))}cqw;line-height:1.25;color:${th.ink};">${esc(K.clampWords(String(s), 66))}</span>
    </div>`).join("")}
    ${neonWindow(`${id}-w0`, th, { x: winX, y: rowsTop, w: winW, h: winH, shot, color: sup, contain: true })}`,
    s: [
      `tl.fromTo(".${id}-chip",{opacity:0,x:"${r(-U(30))}cqw"},{opacity:1,x:0,duration:${du(0.22)},ease:"expo.out"},${at(0.06)});`,
      `tl.fromTo(".${id}-hd",{opacity:0,y:"${r(U(26))}cqw"},{opacity:1,y:0,duration:${du(0.32)},ease:"expo.out"},${at(0.14)});`,
      `tl.fromTo(".${id}-row",{opacity:0,x:"${r(-U(38))}cqw"},{opacity:1,x:0,duration:${du(0.28)},ease:"expo.out",stagger:${du(0.13)}},${at(0.4)});`,
      ...(shot ? windowTweens(`${id}-w0`, ctx, 0.5) : []),
    ],
    // The orb goes to the RIGHT on this beat and comes down: the step rows own the left column all
    // the way to the horizon, and at 300px the sun rose directly behind the last step's copy.
  }, ctx, { sunX: 1660, sun: 460, core: 0.55, gridA: 0.52 });
}

// PROOF — the brief's Stat frame: one to three `stat-plate`s floating in the open sky, big
// gradient-clip figures over a single magenta neon rule with a bloom beneath it. NO panel and NO
// picture: the plates float, and this is the one role in the pack that prints figures as figures.
function sProof(scene, ctx) {
  const { id, th, at, du } = ctx;
  const { lead, sup } = neon(ctx);
  const stats = K.numbersIn(scene, 3);
  if (stats.length < 2) return fallback(scene, ctx, true);
  const line = K.clampWords(String(scene.headline || scene.title || ""), 54);
  const size = K.fitOne(line, U(1400) / K.camSafe(), U(60), th.adv);
  const headTop = TOPBAR + U(52);
  const gap = U(44);
  const w = (COL - gap * (stats.length - 1)) / stats.length;
  const plateY = headTop + size * 1.08 + U(64);
  const numSize = K.fitOne(`${stats[0].v}${unit(stats[0].suffix)}`, w - U(20), U(140), th.adv);
  return shell({
    html: `
    <div class="${id}-chip" style="position:absolute;left:${r(M)}cqw;top:${r(TOPBAR)}cqw;z-index:5;opacity:0;">${chip(th, String(scene.kicker || ctx.label || STRINGS.proof).slice(0, 26), lead)}</div>
    <div class="${id}-hd" style="position:absolute;left:${r(M)}cqw;top:${r(headTop)}cqw;width:${r(U(1400))}cqw;z-index:5;${metrics(th, size, 700, 1.08)}color:${th.ink};opacity:0;">${glowRun(th, line, String(scene.emphasis || ""), lead)}</div>
    ${stats.map((st, i) => {
      const fit = K.fitOne(`${st.v}${unit(st.suffix)}`, w - U(20), numSize, th.adv);
      return `<div class="${id}-fig" style="position:absolute;left:${r(M + i * (w + gap))}cqw;top:${r(plateY)}cqw;width:${r(w)}cqw;z-index:5;opacity:0;">
      <div style="${metrics(th, fit, 700, 1, "-0.02em")}${figFill(th)}white-space:pre;"><span class="${id}-n${i}">0</span>${esc(unit(st.suffix))}</div>
      <div style="position:relative;margin-top:${r(U(26))}cqw;height:${r(U(4))}cqw;width:${r(w * 0.78)}cqw;">
        <div class="${id}-r${i}" style="position:absolute;inset:0;background:linear-gradient(90deg, ${th.accent} 0%, ${rgba(th.accent, 0.15)} 100%);transform:scaleX(0);transform-origin:left center;"></div>
        <div style="position:absolute;left:0;right:0;top:${r(U(2))}cqw;height:${r(U(90))}cqw;background:${blob(520, 90, 520, 90, 22, 0, `${rgba(th.accent, 0.22)} 0%, ${rgba(th.accent, 0)} 70%`)};"></div>
      </div>
      <div style="margin-top:${r(U(24))}cqw;font-family:${th.displayStack};font-weight:600;font-size:${r(U(22))}cqw;letter-spacing:0.22em;text-transform:uppercase;color:${th.sub};white-space:nowrap;overflow:hidden;">${esc(K.statLabel(scene, i))}</div>
    </div>`;
    }).join("")}`,
    s: [
      `tl.fromTo(".${id}-chip",{opacity:0,x:"${r(-U(30))}cqw"},{opacity:1,x:0,duration:${du(0.22)},ease:"expo.out"},${at(0.06)});`,
      `tl.fromTo(".${id}-hd",{opacity:0,y:"${r(U(26))}cqw"},{opacity:1,y:0,duration:${du(0.3)},ease:"expo.out"},${at(0.14)});`,
      `tl.fromTo(".${id}-fig",{opacity:0,y:"${r(U(48))}cqw"},{opacity:1,y:0,duration:${du(0.3)},ease:"expo.out",stagger:${du(0.14)}},${at(0.34)});`,
      ...stats.flatMap((st, i) => {
        const num = Number(String(st.v).replace(/,/g, "")) || 0;
        const dp = String(st.v).includes(".") ? 1 : 0;
        return [
          `tl.to(".${id}-r${i}",{scaleX:1,duration:${du(0.36)},ease:"expo.out"},${at(0.5 + i * 0.14)});`,
          `tl.fromTo(".${id}-n${i}",{innerText:0},{innerText:${num},duration:${du(0.52)},ease:"power2.out",snap:{innerText:${dp ? 0.1 : 1}},onUpdate:function(){var e=document.querySelector(".${id}-n${i}");if(e)e.textContent=Number(e.textContent).toFixed(${dp});}},${at(0.44 + i * 0.14)});`,
        ];
      }),
    ],
    // Stat labels come within ~90px of the horizon, so the orb is dimmed rather than moved: the
    // plates span the whole measure and there is no side of the frame it could move to.
  }, ctx, { sunX: 960, sun: 420, core: 0.62, gridA: 0.66 });
}

// QUOTE — the brief's frame 4: one centred quote in SOLID chrome (no gradient-clip here), the
// sun-orb low and centred behind it as a halo, the attribution in a neon-chip, the grid faint.
function sQuote(scene, ctx) {
  const { id, th, at, du } = ctx;
  const { lead } = neon(ctx);
  const q = String(scene.quote || scene.headline || scene.subtext || "").trim().slice(0, 220);
  if (!q) return fallback(scene, ctx, true);
  const by = K.clampWords(String(scene.attribution || scene.emphasis || "").trim(), 44);
  const fit = K.fitLines(q, U(1420) / K.camSafe(), U(58), 4, th.adv);
  const top = U(236);
  const bottom = top + fit.lines.length * fit.size * 1.34;
  return shell({
    html: `
    <div class="${id}-q" style="position:absolute;left:${r(M)}cqw;top:${r(top)}cqw;width:${r(COL)}cqw;text-align:center;z-index:5;${metrics(th, fit.size, 500, 1.34, "-0.01em")}color:${th.ink};text-shadow:0 0 ${r(U(30))}cqw ${rgba(th.violet, 0.4)};opacity:0;">
      ${fit.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}
    </div>
    ${by ? `<div class="${id}-by" style="position:absolute;left:${r(M)}cqw;top:${r(Math.min(bottom + U(48), SKY - U(50)))}cqw;width:${r(COL)}cqw;text-align:center;z-index:5;opacity:0;">${chip(th, by, lead)}</div>` : ""}`,
    s: [
      `tl.fromTo(".${id}-q",{opacity:0,y:"${r(U(30))}cqw"},{opacity:1,y:0,duration:${du(0.4)},ease:"expo.out"},${at(0.16)});`,
      by ? `tl.fromTo(".${id}-by",{opacity:0,scale:0.8},{opacity:1,scale:1,duration:${du(0.3)},ease:"back.out(1.8)"},${at(0.6)});` : "",
    ].filter(Boolean),
    // The brief wants the orb BEHIND the quote "as a halo", so here it is at its largest and its
    // faintest: a four-line quote reaches down into it, and a lit core under chrome type is exactly
    // what the pack's own text law forbids.
  }, ctx, { sunX: 960, sun: 700, core: 0.4, gridA: 0.34 });
}

// CLOSING — the brief's frame 5: a centred sign-off, the ONE `cta-button` (magenta → violet, void
// text, 10px radius, glowing), the sun dead-centre behind as the hero glow, a brighter grid, and the
// optional scanline shimmer. The CTA appears exactly once in a film, and this is it.
function sClosing(scene, ctx, logo) {
  const { id, th, at, du } = ctx;
  const { lead, sup } = neon(ctx);
  const hasMark = !!(logo && logo.path);
  const head = K.fitLines(String(scene.headline || scene.emphasis || ctx.title || ""), U(1360) / K.camSafe(), U(96), 2, th.adv);
  const headTop = hasMark ? U(342) : U(300);
  const headBot = headTop + head.lines.length * head.size * 1.04;
  const action = K.clampWords(String(scene.emphasis || "").trim(), 24) || ctx.S.go || STRINGS.go;
  const rowY = Math.min(headBot + U(52), SKY - U(78));
  return shell({
    html: `
    <div class="${id}-scan" style="position:absolute;inset:0;z-index:3;background:repeating-linear-gradient(to bottom, ${rgba(CHROME, 0.05)} 0 ${r(U(3))}cqw, ${rgba(CHROME, 0)} ${r(U(3))}cqw ${r(U(8))}cqw);"></div>
    <div class="${id}-glow" style="position:absolute;left:${r(U(360))}cqw;top:${r(U(200))}cqw;width:${r(U(1200))}cqw;height:${r(U(440))}cqw;background:${disc(`${rgba(th.violet, 0.28)} 0%, ${rgba(th.violet, 0)} 68%`)};z-index:2;opacity:0;"></div>
    ${hasMark ? `<div class="${id}-logo" style="position:absolute;left:0;right:0;top:${r(U(196))}cqw;display:flex;justify-content:center;z-index:5;opacity:0;">
      <span style="width:${r(U(112))}cqw;height:${r(U(112))}cqw;border-radius:${r(U(24))}cqw;border:${r(U(2))}cqw solid ${rgba(sup, 0.6)};box-shadow:0 0 ${r(U(30))}cqw ${rgba(sup, 0.3)};background:${rgba(VOID, 0.6)};display:flex;align-items:center;justify-content:center;padding:${r(U(18))}cqw;box-sizing:border-box;"><img src="${esc(logo.path)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain;"></span>
    </div>` : ""}
    <div style="position:absolute;left:${r(M)}cqw;top:${r(headTop)}cqw;width:${r(COL)}cqw;text-align:center;z-index:5;">
      ${glitch(id, head.lines, {
        met: metrics(th, head.size, 700, 1.04, "-0.03em"),
        style: `${metrics(th, head.size, 700, 1.04, "-0.03em")}${chromeFill(th)}`,
        ghostA: rgba(th.accent, 0.9), ghostB: rgba(th.teal, 0.9), centred: true,
      })}
    </div>
    <div style="position:absolute;left:${r(M)}cqw;top:${r(rowY)}cqw;width:${r(COL)}cqw;display:flex;align-items:center;justify-content:center;gap:${r(U(28))}cqw;z-index:5;">
      <span class="${id}-btn" style="display:inline-block;background:linear-gradient(96deg, ${th.accent} 0%, ${th.violet} 100%);color:${th.bg};font-family:${th.displayStack};font-weight:700;font-size:${r(K.fitOne(action, U(560), U(32), K.ADVANCE.upper))}cqw;letter-spacing:0.1em;text-transform:uppercase;padding:${r(U(22))}cqw ${r(U(46))}cqw;border-radius:${r(U(10))}cqw;box-shadow:0 0 ${r(U(40))}cqw ${rgba(th.accent, 0.4)};white-space:nowrap;opacity:0;">${esc(action)}</span>
      <span class="${id}-url" style="opacity:0;">${chip(th, ctx.url, sup)}</span>
    </div>`,
    s: [
      hasMark ? `tl.fromTo(".${id}-logo",{opacity:0,scale:0.7},{opacity:1,scale:1,duration:${du(0.28)},ease:"back.out(1.6)"},${at(0.1)});` : "",
      `tl.to(".${id}-glow",{opacity:1,duration:${du(0.5)},ease:"none"},${at(0.14)});`,
      ...glitchTweens(id, ctx, 0.22),
      sweepTween(id, ctx, 0.56),
      `tl.fromTo(".${id}-btn",{opacity:0,y:"${r(U(22))}cqw",scale:0.9},{opacity:1,y:0,scale:1,duration:${du(0.3)},ease:"back.out(1.8)"},${at(0.72)});`,
      `tl.fromTo(".${id}-url",{opacity:0},{opacity:1,duration:${du(0.22)},ease:"none"},${at(0.86)});`,
      // The shimmer: one scanline cell of travel, so the loop is invisible. Finite, like the floor.
      `tl.fromTo(".${id}-scan",{y:0},{y:"${r(U(8))}cqw",duration:0.9,ease:"none",repeat:${K.reps(ctx.L, 0.9)}},${r(ctx.T)});`,
    ].filter(Boolean),
  }, ctx, { sunX: 960, sun: 620, gridA: 0.82 });
}

// ---- spine -------------------------------------------------------------------
const SPEC = {
  first: "cover", last: "closing",
  middle: ["feature", "proof", "how", "quote"],
  shapes: {
    // The manifest's OWN slot geometry. `cover` takes the `context` strip (826×162), `feature` the
    // two screenshot letterboxes (1728×410), `how` the product image (998×367). `proof` declares
    // none: the brief's Stat frame is plates floating in open sky, and a 1728×410 screenshot plus
    // three figures do not both fit above a horizon at 62%.
    cover: [826 / 162], feature: [1728 / 410, 1728 / 410], how: [998 / 367],
    proof: [], quote: [], closing: [], statement: [], "statement-c": [],
  },
  slots: (role, budget) => (role === "feature" ? Math.min(2, Math.max(0, budget))
    : role === "cover" || role === "how" ? Math.min(1, Math.max(0, budget)) : 0),
  // Only `feature` is incomplete without a picture — cover and how are designed to stand without one.
  needs: (role) => (role === "feature" ? 1 : 0),
  carry: (role, scene, budget) => {
    const isStats = K.numbersIn(scene).length >= 2;
    if (role === "proof") return isStats;
    if (isStats) return false;                        // only `proof` prints figures as figures
    if (role === "feature") return budget >= 1;
    if (role === "how") return K.bullets(scene, 3).length >= 2;
    // A QUOTE FRAME NEEDS SOMETHING QUOTED. The usual `scene.quote || scene.subtext` test is far too
    // loose — every beat has a subtext, so a plain feature landed in the testimonial frame under a
    // "WORD OF MOUTH" label with no attribution and nothing but its own headline in quotation
    // position. Declining hands the beat to the next role in the rotation, which fits it better.
    if (role === "quote") {
      return !!String(scene.quote || scene.attribution || "").trim()
        || /quote|testimonial|review|voice/i.test(String(scene.kind || scene.purpose || ""));
    }
    return true;
  },
};
const BUILDERS = {
  cover: sCover, feature: sFeature, how: sHow, proof: sProof, quote: sQuote, closing: sClosing,
  statement: (sc, ctx) => fallback(sc, ctx),
  "statement-c": (sc, ctx) => fallback(sc, ctx, true),
};
const LABELS = {
  cover: STRINGS.cover, feature: STRINGS.feature, how: STRINGS.how,
  proof: STRINGS.proof, quote: STRINGS.quote, closing: STRINGS.closing,
};

const css = (th, stage) => K.baseCss(th, stage, `
  #cap-pill { border:${r(U(2))}cqw solid ${rgba(TEAL, 0.34)}; border-radius:${r(U(10))}cqw; }
  #cap-text { letter-spacing:-0.005em; }`);

function buildComposition(opts = {}) {
  return K.buildFilm({
    ...opts, stage: STAGE, theme, STRINGS, spec: SPEC, builders: BUILDERS, labels: LABELS,
    // `audio.energy: high`, `tempo: fast` — a shorter reference beat, so the glitch and the whip
    // stay snappy on a long scene instead of stretching into a slow dissolve.
    css, refBeat: 3.8,
    // `motion.drift: 1.05` from the manifest, and a real push: this pack lunges.
    camera: { push: 140, scale: 1.05 },
    signature: "editorial", fallbackBrand: "NOVA",
  });
}

module.exports = { buildComposition, STRINGS };
module.exports.__test = { SPEC, BUILDERS, theme, STAGE };
