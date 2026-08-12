// DEEP — a descent into a bioluminescent trench. Native GSAP + DOM, built on om_port_kit.
//
// PROVENANCE. Ported from the imported OM template "deep" (1920x1080,
// SCENE_MAP = Descend/Discover/Explore/Signals/Pocket, transition="cut").
//
// THE LOOK. The ground DARKENS as the film descends — a teal shelf at the top grading to
// near-black at the bottom — with god-rays raking down from the surface and motes of marine
// snow drifting up through them. One bioluminescent teal against a deep violet counter-glow.
// Everything glows rather than shines: type carries a soft halo, panels are lit from within,
// and pictures ride in porthole frames with a rim light and a caustic sheen.
//
// FONT SUBSTITUTION: none — every reference face is now bundled (see src/fonts/pack_fonts.js).

// ─────────────────────────────────────────────────────────────────────────────────────

const K = require("./om_port_kit");
const F = require("./deep_furniture");
const { r, esc, rgba } = K;

const STAGE = K.stageOf(1920, 1080);
const { U, VH } = STAGE;

const TOP = "#0A3A44", MID = "#062632", DEEP = "#02101A";
const INK = "#E9FBF8", SUB = "#7FB8B8", ACCENT = "#3FE7D6";
// FONTS: the reference's own Outfit + DM Mono, both bundled.
const DISPLAY = "Outfit", MONO = "DM Mono";

const STRINGS = {
  descend: "DESCENT", discover: "DISCOVERY", explore: "EXPLORE",
  signals: "SIGNALS", pocket: "IN HAND", surface: "SURFACE", scene: "DEPTH", of: "OF", go: "DIVE IN",
};

function theme(brandSkin) {
  const { accent, resolvedBrand } = K.resolveAccent(brandSkin, { ground: MID, isDark: true, packAccent: ACCENT });
  return {
    accent, bg: DEEP, top: TOP, mid: MID, panel: rgba("#0C3E4A", 0.72), ink: INK, sub: SUB,
    line: rgba(accent, 0.24),
    // The counter-glow — the reference's violet, derived so a rebranded trench is lit by the brand.
    glow2: K.spin(accent, 150, -0.04, 0.55),
    halo: rgba(accent, 0.5),
    adv: K.ADVANCE.mixed,
    capBg: "#062632", capInk: INK,
    ...K.fontStacks(DISPLAY, MONO),
    resolvedBrand,
  };
}

// ---- furniture ---------------------------------------------------------------
const M = U(96);
const COL = U(1920) - M * 2;

// The water column: a vertical grade, raking god-rays, a counter-glow bloom, and motes.
// Everything is a gradient or a solid — no blur filters, which is what keeps the
// heavy-overlay count low (a stack of them is what makes a composition capture black).
const MOTES = [[8, 72], [21, 34], [33, 88], [44, 18], [56, 60], [67, 30], [78, 80], [89, 46], [95, 14], [15, 52]];
// REBUILT 5 Aug 2026 against the readable reference. The port had the trench COLOURS and none of
// its life — the reference's OceanBG carries caustic light shafts, drifting plankton, kelp
// swaying from the seabed, fish crossing the frame and bubbles rising continuously. See
// deep_furniture.js. The theme names its grounds top/mid/bg; the furniture takes bgTop/bgMid/
// bgDeep, mapped here rather than renaming a theme four other scenes read.
function water(id, th) {
  return F.oceanBg({ ...th, bgTop: th.top, bgMid: th.mid, bgDeep: th.bg }, { cls: id });
}
const waterTweens = (id, ctx) => F.oceanTweens(ctx, { cls: id });

const glowText = (th) => `text-shadow:0 0 ${r(U(26))}cqw ${th.halo};`;
const kicker = (th, t) =>
  `<span style="font-family:${th.monoStack};font-size:${r(U(17))}cqw;letter-spacing:0.28em;color:${th.accent};text-transform:uppercase;${glowText(th)}">${esc(t)}</span>`;

// A porthole — a rounded, rim-lit frame around a real picture. Never drawn empty.
function porthole(th, { cls, x, y, w, h, shot, z = 2 }) {
  const rad = Math.min(w, h) * 0.5;
  return `<div class="${cls}" style="position:absolute;left:${r(x)}cqw;top:${r(y)}cqw;width:${r(w)}cqw;height:${r(h)}cqw;z-index:${z};border-radius:${r(rad)}cqw;overflow:hidden;border:${r(U(6))}cqw solid ${rgba(th.accent, 0.55)};box-shadow:0 0 ${r(U(50))}cqw ${rgba(th.accent, 0.32)}, inset 0 0 ${r(U(40))}cqw ${rgba(th.accent, 0.2)};background:${th.mid};opacity:0;">
    ${K.shotFill(shot, { filter: "saturate(0.86) brightness(0.94)", bg: th.mid })}
    <div style="position:absolute;inset:0;background:linear-gradient(158deg, ${rgba(th.ink, 0.18)} 0%, transparent 40%, ${rgba(th.glow2, 0.2)} 100%);"></div>
  </div>`;
}

// A VIEWPORT — the reference's actual media frame, and the one our port did not have.
//
// Deep defines both `Porthole` (a circle) and `Viewport` (a rounded rectangle with a titlebar),
// and its six scenes use **Viewport** for Descend, Discover and Explore, **Phone** for Pocket,
// and a circular plate only for the Surface logo. `Porthole` is declared and never used. Our
// port framed every picture in a circle, which crops a 16:9 screenshot to a disc and loses the
// glass-panel look the whole template is built around.
//
// Reference geometry (150-158): radius 22, 2px border accent@0.7, `0 0 70px accent@0.45` plus
// `inset 0 0 50px accent@0.14`, backdrop-filter blur(4px), and an optional 40px titlebar with
// three lamps and the url.
// `url` is passed in, not read off the theme: buildFilm calls theme(brandSkin) with one argument
// and before it resolves the film's url, so threading it through the theme yields an empty bar.
function viewport(th, { cls, x, y, w, h, shot, glow = null, chrome = true, z = 2, url = "" }) {
  const g = glow || th.accent;
  const bar = chrome ? `<div style="height:${r(U(40))}cqw;flex-shrink:0;display:flex;align-items:center;gap:${r(U(7))}cqw;padding:0 ${r(U(16))}cqw;border-bottom:1px solid ${rgba(g, 0.3)};">
      ${[0, 1, 2].map(() => `<span style="width:${r(U(10))}cqw;height:${r(U(10))}cqw;border-radius:50%;background:${rgba(g, 0.6)};flex:0 0 auto;"></span>`).join("")}
      <span style="margin-left:${r(U(10))}cqw;font-family:${th.monoStack};font-size:${r(U(12))}cqw;color:${rgba(th.ink, 0.55)};white-space:nowrap;overflow:hidden;">${esc(url)}</span>
    </div>` : "";
  return `<div class="${cls}" style="position:absolute;left:${r(x)}cqw;top:${r(y)}cqw;width:${r(w)}cqw;height:${r(h)}cqw;z-index:${z};border-radius:${r(U(22))}cqw;overflow:hidden;background:${rgba("#02101A", 0.5)};border:${r(U(2))}cqw solid ${rgba(g, 0.7)};box-shadow:0 0 ${r(U(70))}cqw ${rgba(g, 0.45)}, inset 0 0 ${r(U(50))}cqw ${rgba(g, 0.14)};backdrop-filter:blur(${r(U(4))}cqw);display:flex;flex-direction:column;opacity:0;">
    ${bar}
    <div style="flex:1;min-height:0;position:relative;">${K.shotFill(shot, { bg: th.mid })}</div>
  </div>`;
}

// THE CREATURE LAYER. The reference draws its jellyfish (and sonar rings) in an SVG in the
// authored 1920x1080 space, inside the camera and above OceanBG — so they sit behind the panels
// and the copy but in front of the water. Same here: one SVG at z-index 1.
function creatures(id, th, list) {
  if (!list || !list.length) return "";
  const body = list.map((c, i) => (c.kind === "sonar"
    ? F.sonar(`${id}-s${i}`, c)
    : F.jelly(`${id}-j${i}`, { ...c, color: c.color === "accent" ? th.accent : th.glow2 }))).join("");
  return `<svg viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0;width:100%;height:100%;z-index:1;pointer-events:none;overflow:visible;">${body}</svg>`;
}
function creatureTweens(id, ctx, th, list) {
  return (list || []).flatMap((c, i) => (c.kind === "sonar"
    ? F.sonarTweens(ctx, `${id}-s${i}`, th, { n: c.n || 3, at: c.at != null ? c.at : 0.2 })
    : F.jellyTweens(ctx, `${id}-j${i}`, { phase: c.phase || 0 })));
}

// CHROME — the reference's own (183-195): a glowing accent dot, the brand at 24px/0.06em, the
// scene label after a middot, and a DEPTH readout on the right that counts 400m per beat. The
// reference draws NO progress rule and NO "01 OF 06" counter, so returning this from every
// builder replaces the shared kit HUD (which also stops the kit emitting its now-orphaned
// progress tween — see om_port_kit.buildFilm).
function chrome(th, ctx) {
  const depth = String((ctx.i + 1) * 400).padStart(4, "0");
  return `<div class="om-chrome">
    <div style="position:absolute;top:${r(U(44))}cqw;left:${r(U(58))}cqw;display:flex;align-items:center;gap:${r(U(13))}cqw;">
      <span style="width:${r(U(12))}cqw;height:${r(U(12))}cqw;border-radius:50%;background:${th.accent};box-shadow:0 0 ${r(U(14))}cqw ${th.accent};flex:0 0 auto;"></span>
      <span style="font-family:${th.displayStack};font-weight:700;font-size:${r(U(24))}cqw;letter-spacing:0.06em;color:${th.ink};white-space:nowrap;">${esc(String(ctx.brand || "DEEP").toUpperCase())}</span>
      ${ctx.label ? `<span style="font-family:${th.monoStack};font-size:${r(U(13))}cqw;letter-spacing:0.16em;color:${th.sub};text-transform:uppercase;white-space:nowrap;">· ${esc(ctx.label)}</span>` : ""}
    </div>
    <div style="position:absolute;top:${r(U(50))}cqw;right:${r(U(58))}cqw;font-family:${th.monoStack};font-size:${r(U(13))}cqw;letter-spacing:0.14em;color:${th.sub};white-space:nowrap;">DEPTH ${depth}M</div>
  </div>`;
}

// A lit panel — a glass slab for copy, lit from within.
const slab = (th) => `background:${th.panel};border:1px solid ${th.line};border-radius:${r(U(22))}cqw;box-shadow:0 0 ${r(U(40))}cqw ${rgba(th.accent, 0.14)};`;

// A handset, rim-lit like the portholes — the reference's Pocket beat device.
function handset(th, { cls, x, y, w, h, shot }) {
  return `<div class="${cls}" style="position:absolute;left:${r(x)}cqw;top:${r(y)}cqw;width:${r(w)}cqw;height:${r(h)}cqw;z-index:2;border-radius:${r(U(46))}cqw;padding:${r(U(12))}cqw;box-sizing:border-box;background:#07161C;border:${r(U(3))}cqw solid ${rgba(th.accent, 0.5)};box-shadow:0 0 ${r(U(60))}cqw ${rgba(th.accent, 0.3)};opacity:0;">
    <div style="position:absolute;top:${r(U(22))}cqw;left:50%;translate:-50% 0;width:${r(U(96))}cqw;height:${r(U(20))}cqw;border-radius:${r(U(20))}cqw;background:#07161C;z-index:2;"></div>
    <div style="width:100%;height:100%;border-radius:${r(U(34))}cqw;overflow:hidden;background:${th.mid};">
      ${K.shotFill(shot, { filter: "saturate(0.86) brightness(0.94)", bg: th.mid })}
    </div>
  </div>`;
}

// ---- scenes ------------------------------------------------------------------
// POCKET — the reference's "in hand" beat: right-aligned copy with chips, and the handset
// rising 780px from below on the left. RESTORED 4 Aug 2026 — the bundle-derived port dropped
// this scene, which is the film's only portrait-device moment.
const POCKET_CAST = [{ x: 1440, y: 720, s: 0.8, phase: 1.5, color: "glow2" }];
function sPocket(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const shot = shots[0] || null;
  if (!shot) return { ...K.statement(scene, ctx, { centred: true }), backdrop: water(id, th) };
  const head = K.fitLines(scene.headline || scene.title || "", U(620) / K.camSafe(), U(88), 3, th.adv);
  const chips = K.bullets(scene, 3).map((b) => String(b).toUpperCase().slice(0, 18));
  return {
    backdrop: water(id, th),
    chrome: chrome(th, ctx),
    html: `
    ${creatures(id, th, POCKET_CAST)}
    <div class="${id}-copy" style="position:absolute;right:${r(U(130))}cqw;top:${r(U(260))}cqw;width:${r(U(620))}cqw;text-align:right;z-index:6;opacity:0;">
      <div style="font-family:${th.monoStack};font-size:${r(U(18))}cqw;letter-spacing:0.2em;color:${th.accent};margin-bottom:${r(U(16))}cqw;text-transform:uppercase;">${esc(String(scene.kicker || STRINGS.discover).slice(0, 26))}</div>
      <div style="font-family:${th.displayStack};font-weight:700;font-size:${r(head.size)}cqw;line-height:0.98;color:${th.ink};${glowText(th)}">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
      ${chips.length ? `<div style="margin-top:${r(U(24))}cqw;display:flex;gap:${r(U(12))}cqw;flex-wrap:wrap;justify-content:flex-end;">${chips.map((c) => `<span class="pchip" style="display:inline-flex;align-items:center;gap:${r(U(8))}cqw;padding:${r(U(9))}cqw ${r(U(18))}cqw;border-radius:${r(U(999))}cqw;border:1px solid ${rgba(th.accent, 0.5)};background:${rgba(th.accent, 0.08)};font-family:${th.monoStack};font-size:${r(U(16))}cqw;letter-spacing:0.1em;color:${th.ink};white-space:nowrap;opacity:0;"><span style="width:${r(U(7))}cqw;height:${r(U(7))}cqw;border-radius:50%;background:${th.accent};flex:0 0 auto;"></span>${esc(c)}</span>`).join("")}</div>` : ""}
    </div>
    ${handset(th, { cls: `${id}-ph`, x: U(340), y: U(150), w: U(360), h: U(760), shot })}`,
    s: [
      `tl.fromTo(".${id}-copy",{opacity:0,y:"${r(U(40))}cqw"},{opacity:1,y:0,duration:${du(0.3)},ease:"power3.out"},${at(0.14)});`,
      `tl.to(".${id}-ph",{opacity:1,duration:${du(0.12)},ease:"none"},${at(0.12)});`,
      `tl.fromTo(".${id}-ph",{y:"${r(U(780))}cqw"},{y:0,duration:${du(0.34)},ease:"power3.out"},${at(0.12)});`,
      chips.length ? `tl.fromTo("#${id} .pchip",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:${du(0.28)},ease:"back.out(1.8)",stagger:${du(0.09)}},${at(0.46)});` : "",
      ...creatureTweens(id, ctx, th, POCKET_CAST),
      ...waterTweens(id, ctx),
    ].filter(Boolean),
  };
}

// DESCEND — the opener, rebuilt to the reference (212-228): a CENTRED brand at 200px with a
// wide-tracked mono tagline under it, the hero viewport centred below at 940x440, and two
// jellyfish — the large violet one upper-right, a small teal one lower-left.
//
// Our port had it left-aligned with a 700x700 circle on the right and the display type capped at
// 92px. The reference sets 200px and centres everything; that is the frame the template is known
// by, and the two are not the same composition.
const DESCEND_CAST = [
  { x: 1480, y: 360, s: 1.15, phase: 0, color: "glow2" },
  { x: 360, y: 720, s: 0.7, phase: 2, color: "accent" },
];
function sDescend(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const shot = shots[0] || null;
  // 200 is the reference CEILING; fitOne still shrinks a long AI-authored brand line.
  const word = String(scene.headline || scene.emphasis || ctx.brand || ctx.title || "").trim();
  const size = K.fitOne(word, U(1700), U(200), th.adv);
  const tagline = String(scene.subtext || scene.body || "").slice(0, 90);
  const vpW = U(940), vpH = U(440), vpX = (U(1920) - vpW) / 2;
  return {
    backdrop: water(id, th),
    chrome: chrome(th, ctx),
    html: `
    ${creatures(id, th, DESCEND_CAST)}
    <div style="position:absolute;left:0;right:0;top:${r(U(200))}cqw;text-align:center;z-index:6;">
      <div class="${id}-head" style="transform-origin:center;font-family:${th.displayStack};font-weight:700;font-size:${r(size)}cqw;line-height:0.9;letter-spacing:0.08em;color:${th.ink};text-shadow:0 0 ${r(U(60))}cqw ${rgba(th.accent, 0.6)};opacity:0;">${esc(word)}</div>
      ${tagline ? `<div class="${id}-tag" style="margin-top:${r(U(10))}cqw;font-family:${th.monoStack};font-size:${r(U(24))}cqw;letter-spacing:0.28em;color:${th.accent};text-transform:uppercase;opacity:0;">${esc(tagline)}</div>` : ""}
    </div>
    ${shot ? viewport(th, { cls: `${id}-vp`, x: vpX, y: U(560), w: vpW, h: vpH, shot, url: ctx.url }) : ""}`,
    s: [
      // M.pop from 0.7 on easeOutBack, centred.
      `tl.fromTo(".${id}-head",{opacity:0,scale:0.7},{opacity:1,scale:1,duration:${du(0.9)},ease:"back.out(1.5)"},${at(0.3)});`,
      tagline ? `tl.fromTo(".${id}-tag",{opacity:0,y:"${r(U(34))}cqw"},{opacity:1,y:0,duration:${du(0.6)},ease:"power3.out"},${at(0.8)});` : "",
      // The reference slides the panel up 120px and scales 0.95 -> 1 across progress 0.42..0.72.
      shot ? `tl.fromTo(".${id}-vp",{opacity:0,y:"${r(U(120))}cqw",scale:0.95},{opacity:1,y:0,scale:1,duration:${r(0.3 * ctx.L)},ease:"power3.out"},${r(ctx.T + 0.42 * ctx.L)});` : "",
      ...creatureTweens(id, ctx, th, DESCEND_CAST),
      ...waterTweens(id, ctx),
    ].filter(Boolean),
  };
}

// DISCOVER — rebuilt to the reference (230-248): copy left in a 640 column (mono eyebrow, an
// 88px headline, a row of chips) with a 900x620 viewport sliding in from the right, and a violet
// jellyfish low-left. Our port centred a single word over a circle, which is a different beat.
const DISCOVER_CAST = [{ x: 470, y: 760, s: 0.9, phase: 1, color: "glow2" }];
function sDiscover(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const shot = shots[0] || null;
  if (!shot) {
    const st = K.statement(scene, ctx, { centred: true });
    return { ...st, backdrop: water(id, th), html: creatures(id, th, DISCOVER_CAST) + st.html, s: [...(st.s || []), ...creatureTweens(id, ctx, th, DISCOVER_CAST), ...waterTweens(id, ctx)] };
  }
  const head = K.fitLines(scene.headline || scene.title || "", U(640), U(88), 3, th.adv);
  const chips = K.bullets(scene, 3).map((b) => String(b).toUpperCase().slice(0, 18));
  return {
    backdrop: water(id, th),
    chrome: chrome(th, ctx),
    html: `
    ${creatures(id, th, DISCOVER_CAST)}
    <div class="${id}-copy" style="position:absolute;left:${r(U(110))}cqw;top:${r(U(250))}cqw;width:${r(U(640))}cqw;z-index:6;opacity:0;">
      <div style="font-family:${th.monoStack};font-size:${r(U(18))}cqw;letter-spacing:0.2em;color:${th.accent};margin-bottom:${r(U(16))}cqw;text-transform:uppercase;">${esc(String(scene.kicker || STRINGS.discover).slice(0, 26))}</div>
      <div style="font-family:${th.displayStack};font-weight:700;font-size:${r(head.size)}cqw;line-height:0.98;color:${th.ink};${glowText(th)}">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
      ${chips.length ? `<div style="margin-top:${r(U(26))}cqw;display:flex;gap:${r(U(12))}cqw;flex-wrap:wrap;">${chips.map((c) => `<span class="dchip" style="display:inline-flex;align-items:center;gap:${r(U(8))}cqw;padding:${r(U(9))}cqw ${r(U(16))}cqw;border-radius:${r(U(999))}cqw;border:1px solid ${rgba(th.accent, 0.5)};background:${rgba(th.accent, 0.08)};backdrop-filter:blur(${r(U(6))}cqw);font-family:${th.monoStack};font-size:${r(U(15))}cqw;color:${th.ink};white-space:nowrap;opacity:0;"><span style="width:${r(U(7))}cqw;height:${r(U(7))}cqw;border-radius:50%;background:${th.accent};box-shadow:0 0 ${r(U(8))}cqw ${th.accent};flex:0 0 auto;"></span>${esc(c)}</span>`).join("")}</div>` : ""}
    </div>
    ${viewport(th, { cls: `${id}-vp`, x: U(1920 - 110 - 900), y: U(210), w: U(900), h: U(620), shot, url: ctx.url })}`,
    s: [
      `tl.fromTo(".${id}-copy",{opacity:0,y:"${r(U(40))}cqw"},{opacity:1,y:0,duration:${du(0.6)},ease:"power3.out"},${at(0.25)});`,
      // The reference throws it in from 700px right across progress 0.12..0.46.
      `tl.fromTo(".${id}-vp",{opacity:0,x:"${r(U(700))}cqw"},{opacity:1,x:0,duration:${r(0.34 * ctx.L)},ease:"power3.out"},${r(ctx.T + 0.12 * ctx.L)});`,
      chips.length ? `tl.fromTo("#${id} .dchip",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:${du(0.3)},ease:"back.out(1.8)",stagger:${du(0.09)}},${r(ctx.T + 0.48 * ctx.L)});` : "",
      ...creatureTweens(id, ctx, th, DISCOVER_CAST),
      ...waterTweens(id, ctx),
    ].filter(Boolean),
  };
}

// EXPLORE — "a world of screens". The reference (250-270) lays FIVE viewports asymmetrically at
// fixed coordinates, alternating the teal and violet glow and floating each on its own phase.
// Our port drew up to three equal circles in a centred row, which reads as a stock gallery.
// Only as many tiles as there are pictures are drawn — never an empty frame.
const EXPLORE_TILES = [
  { x: 150, y: 300, w: 500, h: 300, g: "accent" }, { x: 700, y: 250, w: 360, h: 300, g: "glow2" },
  { x: 1120, y: 300, w: 640, h: 300, g: "accent" }, { x: 320, y: 640, w: 560, h: 250, g: "glow2" },
  { x: 960, y: 640, w: 640, h: 250, g: "accent" },
];
// THE REFERENCE LAYOUT IS A COMPOSITION, NOT A LIST. Taking the first N of five tiles leaves a
// two-picture film with both panels in the top-left and the bottom half of the frame empty
// (observed in the frames). The asymmetric signature needs enough material to read as deliberate,
// so it is used from four pictures up; below that the beat falls back to a centred row built from
// the reference's own tile shape and glow alternation, which stays balanced at any count.
function exploreTiles(n) {
  if (n >= 4) return EXPLORE_TILES.slice(0, Math.min(5, n));
  const w = 500, h = 300, gap = 50, y = 390;
  const startX = (1920 - (w * n + gap * (n - 1))) / 2;
  return Array.from({ length: n }, (_, i) => ({
    x: startX + i * (w + gap), y, w, h, g: i % 2 === 1 ? "glow2" : "accent",
  }));
}
function sExplore(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const pics = (shots || []).filter(Boolean);
  if (pics.length < 2) return { ...K.statement(scene, ctx), backdrop: water(id, th) };
  const tiles = exploreTiles(Math.min(EXPLORE_TILES.length, pics.length));
  const head = K.fitLines(scene.headline || scene.title || "", U(1700), U(68), 2, th.adv);
  return {
    backdrop: water(id, th),
    chrome: chrome(th, ctx),
    html: `
    <div class="${id}-head" style="position:absolute;left:0;right:0;top:${r(U(110))}cqw;text-align:center;font-family:${th.displayStack};font-weight:700;font-size:${r(head.size)}cqw;color:${th.ink};text-shadow:0 0 ${r(U(40))}cqw ${rgba(th.accent, 0.5)};opacity:0;z-index:6;">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
    ${tiles.map((t, i) => viewport(th, {
    cls: `${id}-p${i}`, x: U(t.x), y: U(t.y), w: U(t.w), h: U(t.h),
    shot: pics[i], glow: t.g === "glow2" ? th.glow2 : th.accent, chrome: false, url: ctx.url,
  })).join("")}`,
    s: [
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(30))}cqw"},{opacity:1,y:0,duration:${du(0.5)},ease:"power3.out"},${at(0.2)});`,
      // Reference: entrance at progress 0.16 + i*0.09 over 0.34, translateY 60 -> 0, scale 0.92 -> 1.
      ...tiles.map((t, i) => `tl.fromTo(".${id}-p${i}",{opacity:0,y:"${r(U(60))}cqw",scale:0.92},{opacity:1,y:0,scale:1,duration:${r(0.34 * ctx.L)},ease:"power3.out"},${r(ctx.T + (0.16 + i * 0.09) * ctx.L)});`),
      // sin(localTime*0.6 + i)*10 — period 10.47s, half-cycle 5.24s, phase-staggered per tile.
      // THE UNIT SUFFIX IS LOad-BEARING. This tween alone was written `y:"+=1.04"` — U(20) with no
      // `cqw` — so GSAP read it as 1.04 PIXELS instead of 1.04cqw (~20px on a 1920 stage). The
      // amplitude arrived 19x too small and Explore's five suspended panels, whose only motion
      // after they land is this float, were effectively frozen. The comment above was right and
      // the arithmetic was right; three characters were missing.
      ...tiles.map((t, i) => `tl.to(".${id}-p${i}",{y:"+=${r(U(20))}cqw",duration:5.24,ease:"sine.inOut",repeat:${K.reps(Math.max(0.4, ctx.L - (0.5 + i * 0.09) * ctx.L), 5.24)},yoyo:true},${r(ctx.T + (0.5 + i * 0.09) * ctx.L)});`),
      ...waterTweens(id, ctx),
    ],
  };
}

// SIGNALS — the readouts, on lit slabs. Figures come from the script only.
// The reference pings a SONAR at (1500,420) with a small teal jellyfish sitting inside the rings.
const SIGNALS_CAST = [
  { kind: "sonar", cx: 1500, cy: 420, n: 3, at: 0.2 },
  { x: 1500, y: 420, s: 0.6, phase: 0, color: "accent" },
];
function sSignals(scene, ctx) {
  const { id, th, at, du } = ctx;
  const stats = K.numbersIn(scene, 3);
  if (stats.length < 2) return { ...K.statement(scene, ctx, { centred: true }), backdrop: water(id, th) };
  const head = K.fitLines(scene.headline || scene.title || "", COL / K.camSafe(), U(74), 2, th.adv);
  const gap = U(40), each = (COL - gap * (stats.length - 1)) / stats.length;
  return {
    backdrop: water(id, th),
    chrome: chrome(th, ctx),
    html: `
    ${creatures(id, th, SIGNALS_CAST)}
    <div class="${id}-head" style="position:absolute;left:${r(M)}cqw;top:${r(U(200))}cqw;width:${r(COL)}cqw;text-align:center;opacity:0;">
      <div style="margin-bottom:${r(U(18))}cqw;">${kicker(th, String(scene.kicker || STRINGS.signals).slice(0, 26))}</div>
      <div style="font-family:${th.displayStack};font-weight:700;font-size:${r(head.size)}cqw;line-height:1.06;letter-spacing:-0.02em;color:${th.ink};${glowText(th)}">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
    </div>
    ${stats.map((st, i) => `<div class="${id}-c${i}" style="position:absolute;left:${r(M + i * (each + gap))}cqw;top:${r(U(510))}cqw;width:${r(each)}cqw;height:${r(U(300))}cqw;${slab(th)}display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${r(U(12))}cqw;opacity:0;">
      <div style="font-family:${th.displayStack};font-weight:700;font-size:${r(U(96))}cqw;line-height:1;letter-spacing:-0.04em;color:${th.accent};${glowText(th)}white-space:nowrap;"><span class="${id}-n${i}">0</span>${esc(st.suffix)}</div>
      <div style="font-family:${th.monoStack};font-size:${r(U(17))}cqw;letter-spacing:0.2em;color:${th.sub};white-space:nowrap;overflow:hidden;">${esc(K.statLabel(scene, i))}</div>
    </div>`).join("")}`,
    s: [
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(24))}cqw"},{opacity:1,y:0,duration:${du(0.55)},ease:"power3.out"},${at(0.2)});`,
      ...stats.flatMap((st, i) => {
        const num = Number(String(st.v).replace(/,/g, "")) || 0;
        const dp = String(st.v).includes(".") ? 1 : 0;
        return [
          `tl.fromTo(".${id}-c${i}",{opacity:0,scale:0.78},{opacity:1,scale:1,duration:${du(0.45)},ease:"back.out(1.8)"},${at(0.62 + i * 0.26)});`,
          `tl.fromTo(".${id}-n${i}",{innerText:0},{innerText:${num},duration:${du(0.68)},ease:"power2.out",snap:{innerText:${dp ? 0.1 : 1}},onUpdate:function(){var e=document.querySelector(".${id}-n${i}");if(e)e.textContent=Number(e.textContent).toFixed(${dp});}},${at(0.74 + i * 0.26)});`,
        ];
      }),
      ...creatureTweens(id, ctx, th, SIGNALS_CAST),
      ...waterTweens(id, ctx),
    ],
  };
}

// SURFACE — the close. The trench inverts: light rises, the mark surfaces, the call glows.
// The reference rings a FOUR-ring sonar from the centre and frames the moment with two
// jellyfish — violet upper-left, teal lower-right.
const SURFACE_CAST = [
  { kind: "sonar", cx: 960, cy: 470, n: 4, at: 0.2 },
  { x: 520, y: 300, s: 0.7, phase: 0, color: "glow2" },
  { x: 1420, y: 720, s: 0.8, phase: 2, color: "accent" },
];
function sSurface(scene, ctx, logo) {
  const { id, th, at, du } = ctx;
  const head = K.fitLines(scene.headline || scene.emphasis || ctx.title, COL / K.camSafe(), U(130), 3, th.adv);
  const action = K.clampWords(String(scene.emphasis || ""), 20) || STRINGS.go;
  const hasMark = !!(logo && logo.path);
  return {
    // THE OCEAN IS ON EVERY SCENE, INCLUDING THIS ONE. The reference's `Frame` renders OceanBG
    // unconditionally, so Surface carries the same caustics, kelp, fish and bubbles as the rest —
    // it is the beat where the trench brightens, not the beat where it disappears. This port had
    // swapped in a bespoke gradient, which (a) diverged from the reference and (b) left the
    // ~20 `waterTweens` below animating ocean classes that were never rendered: dead tweens
    // indistinguishable from furniture that failed to appear. The rising up-glow and the motes
    // stay, layered OVER the water rather than instead of it.
    backdrop: `${water(id, th)}
      <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 108%, ${rgba(th.accent, 0.34)} 0%, transparent 62%);"></div>
      <div class="${id}-motes" style="position:absolute;inset:${r(-U(60))}cqw;background:${MOTES.map(([x, y], i) => `radial-gradient(circle ${(i % 3) + 2}px at ${x}% ${y}%, ${rgba(th.ink, 0.45)} 0 100%, transparent 100%)`).join(",")};"></div>`,
    chrome: chrome(th, ctx),
    html: `
    ${creatures(id, th, SURFACE_CAST)}
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 ${r(M)}cqw;z-index:6;">
      ${hasMark ? `<div class="${id}-logo" style="width:${r(U(140))}cqw;height:${r(U(140))}cqw;border-radius:50%;border:${r(U(4))}cqw solid ${rgba(th.accent, 0.6)};background:${th.panel};box-shadow:0 0 ${r(U(46))}cqw ${rgba(th.accent, 0.35)};padding:${r(U(22))}cqw;margin-bottom:${r(U(38))}cqw;display:flex;align-items:center;justify-content:center;opacity:0;"><img src="${esc(logo.path)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain;"></div>` : ""}
      <div class="${id}-head" style="width:100%;text-align:center;font-family:${th.displayStack};font-weight:700;font-size:${r(head.size)}cqw;line-height:1.0;letter-spacing:-0.03em;color:${th.ink};${glowText(th)}opacity:0;">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
      <div class="${id}-pill" style="margin-top:${r(U(46))}cqw;display:flex;align-items:center;gap:${r(U(24))}cqw;opacity:0;">
        <span style="padding:${r(U(20))}cqw ${r(U(46))}cqw;border-radius:${r(U(100))}cqw;background:${th.accent};color:${K.inkOn(th.accent, "#02101A")};font-family:${th.displayStack};font-weight:700;font-size:${r(K.fitOne(action, U(520), U(32), th.adv))}cqw;text-transform:uppercase;white-space:nowrap;box-shadow:0 0 ${r(U(46))}cqw ${rgba(th.accent, 0.55)};">${esc(action)}</span>
        <span style="font-family:${th.monoStack};font-size:${r(U(21))}cqw;letter-spacing:0.16em;color:${th.sub};white-space:nowrap;">${esc(ctx.url)}</span>
      </div>
    </div>`,
    s: [
      ...waterTweens(id, ctx),
      `tl.to(".${id}-motes",{y:"${r(-U(160))}cqw",duration:${r(Math.max(5, ctx.L * 1.8))},ease:"none"},${r(ctx.T)});`,
      hasMark ? `tl.fromTo(".${id}-logo",{opacity:0,scale:0.5,y:"${r(U(40))}cqw"},{opacity:1,scale:1,y:0,duration:${du(0.6)},ease:"back.out(1.8)"},${at(0.28)});` : "",
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(40))}cqw"},{opacity:1,y:0,duration:${du(0.75)},ease:"power3.out"},${at(0.55)});`,
      `tl.fromTo(".${id}-pill",{opacity:0,scale:0.7},{opacity:1,scale:1,duration:${du(0.5)},ease:"back.out(2)"},${at(1.25)});`,
      ...creatureTweens(id, ctx, th, SURFACE_CAST),
    ].filter(Boolean),
  };
}

// ---- spine -------------------------------------------------------------------
const SPEC = {
  first: "descend", last: "surface",
  middle: ["discover", "explore", "pocket", "signals"],
  // Aspect hints are the REFERENCE frame shapes, not squares. They were `[1]`/`[1,1,1]` from the
  // circular-porthole port; a 16:9 screenshot asked to fill a square is centre-cropped to a
  // square before it ever reaches the frame, so the hint has to describe the real box.
  shapes: {
    descend: [940 / 440], discover: [900 / 620],
    explore: [500 / 300, 360 / 300, 640 / 300, 560 / 250, 640 / 250],
    pocket: [360 / 736], signals: [], surface: [], statement: [], "statement-c": [],
  },
  slots: (role, budget) => (role === "descend" || role === "discover" || role === "pocket" ? 1 : role === "explore" ? Math.min(5, Math.max(0, budget)) : 0),
  needs: (role) => (role === "discover" || role === "pocket" ? 1 : role === "explore" ? 2 : 0),
  carry: (role, scene, budget) => {
    // Roles are picked by a ROTATING cursor, not by priority. `signals` is the only layout that
    // prints figures AS figures, so every other role declines a beat carrying two or more.
    const isStats = K.numbersIn(scene).length >= 2;
    if (role === "signals") return isStats;
    if (isStats) return false;
    if (role === "discover" || role === "pocket") return budget >= 1;
    if (role === "explore") return budget >= 2;
    return true;
  },
};
const BUILDERS = {
  descend: sDescend, discover: sDiscover, pocket: sPocket, explore: sExplore, signals: sSignals, surface: sSurface,
  statement: (sc, ctx) => { const b = K.statement(sc, ctx); return { ...b, backdrop: water(ctx.id, ctx.th), s: [...(b.s || []), ...waterTweens(ctx.id, ctx)] }; },
  "statement-c": (sc, ctx) => { const b = K.statement(sc, ctx, { centred: true }); return { ...b, backdrop: water(ctx.id, ctx.th), s: [...(b.s || []), ...waterTweens(ctx.id, ctx)] }; },
};
const LABELS = {
  descend: STRINGS.descend, discover: STRINGS.discover, explore: STRINGS.explore,
  signals: STRINGS.signals, pocket: STRINGS.pocket, surface: STRINGS.surface,
};

const css = (th, stage) => K.baseCss(th, stage, `
  #cap-pill { border:1px solid ${th.line}; }`);

function buildComposition(opts = {}) {
  return K.buildFilm({
    ...opts, stage: STAGE, theme, STRINGS, spec: SPEC, builders: BUILDERS, labels: LABELS,
    css, refBeat: 4.6, camera: { push: 100, scale: 1.04 },
    signature: "organic", fallbackBrand: "DEEP",
  });
}

module.exports = { buildComposition, STRINGS };
module.exports.__test = { SPEC, BUILDERS, theme, STAGE };
