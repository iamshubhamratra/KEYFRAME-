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
function sPocket(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const shot = shots[0] || null;
  if (!shot) return { ...K.statement(scene, ctx, { centred: true }), backdrop: water(id, th) };
  const head = K.fitLines(scene.headline || scene.title || "", U(620) / K.camSafe(), U(88), 3, th.adv);
  const chips = K.bullets(scene, 3).map((b) => String(b).toUpperCase().slice(0, 18));
  return {
    backdrop: water(id, th),
    html: `
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
      ...waterTweens(id, ctx),
    ].filter(Boolean),
  };
}

// DESCEND — the opener. Title sinking into place with the first porthole beside it.
function sDescend(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const shot = shots[0] || null;
  const head = K.fitLines(scene.headline || scene.title || ctx.title,
    (shot ? U(820) : COL) / K.camSafe(), shot ? U(92) : U(140), 3, th.adv);
  return {
    backdrop: water(id, th),
    html: `
    <div class="${id}-kick" style="position:absolute;left:${r(M)}cqw;top:${r(U(230))}cqw;opacity:0;">${kicker(th, String(scene.kicker || STRINGS.descend).slice(0, 28))}</div>
    <div class="${id}-head" style="position:absolute;left:${r(M)}cqw;top:${r(U(290))}cqw;width:${r(shot ? U(820) : COL)}cqw;font-family:${th.displayStack};font-weight:700;font-size:${r(head.size)}cqw;line-height:1.02;letter-spacing:-0.03em;color:${th.ink};${glowText(th)}opacity:0;">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
    ${shot ? porthole(th, { cls: `${id}-ph`, x: U(1080), y: U(190), w: U(700), h: U(700), shot }) : ""}
    ${scene.subtext ? `<div class="${id}-sub" style="position:absolute;left:${r(M)}cqw;top:${r(U(760))}cqw;width:${r(shot ? U(820) : COL * 0.7)}cqw;font-family:${th.displayStack};font-weight:400;font-size:${r(U(28))}cqw;line-height:1.5;color:${th.sub};opacity:0;">${esc(String(scene.subtext).slice(0, 150))}</div>` : ""}`,
    s: [
      `tl.fromTo(".${id}-kick",{opacity:0,y:"${r(-U(20))}cqw"},{opacity:1,y:0,duration:${du(0.4)},ease:"power2.out"},${at(0.2)});`,
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(-U(46))}cqw"},{opacity:1,y:0,duration:${du(0.85)},ease:"power3.out"},${at(0.35)});`,
      shot ? `tl.to(".${id}-ph",{opacity:1,duration:${du(0.5)},ease:"none"},${at(0.6)});` : "",
      shot ? `tl.fromTo(".${id}-ph",{scale:0.86,y:"${r(-U(50))}cqw"},{scale:1,y:0,duration:${du(1.0)},ease:"power3.out"},${at(0.6)});` : "",
      shot ? `tl.to(".${id}-ph",{y:"${r(U(14))}cqw",duration:2.6,ease:"sine.inOut",repeat:${K.reps(Math.max(0, ctx.L - 1.6 * ctx.k), 2.6)},yoyo:true},${at(1.6)});` : "",
      scene.subtext ? `tl.fromTo(".${id}-sub",{opacity:0},{opacity:1,duration:${du(0.5)},ease:"none"},${at(1.1)});` : "",
      ...waterTweens(id, ctx),
    ].filter(Boolean),
  };
}

// DISCOVER — the reveal. A large porthole centres and the statement glows on beneath it.
function sDiscover(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const shot = shots[0] || null;
  if (!shot) return { ...K.statement(scene, ctx, { centred: true }), backdrop: water(id, th) };
  const word = String(scene.emphasis || scene.headline || "").slice(0, 30);
  const size = K.fitOne(word, COL / K.camSafe(), U(126), th.adv);
  // The headline used to sit at U(870) — inside the caption's lane at the foot of the frame,
  // where it read as clipped and the caption crossed it. The beat now reads top-down
  // (sub · word · porthole) and the porthole takes the height that is left above the caption.
  const wordTop = U(172);
  const phTop = wordTop + size + U(46);
  const ph = Math.min(U(700), U(890) - phTop);
  return {
    backdrop: water(id, th),
    html: `
    ${porthole(th, { cls: `${id}-ph`, x: (U(1920) - ph) / 2, y: phTop, w: ph, h: ph, shot })}
    <div class="${id}-word" style="position:absolute;left:${r(M)}cqw;top:${r(wordTop)}cqw;width:${r(COL)}cqw;text-align:center;font-family:${th.displayStack};font-weight:700;font-size:${r(size)}cqw;line-height:1;letter-spacing:-0.03em;color:${th.ink};${glowText(th)}opacity:0;z-index:6;">${esc(word)}</div>
    ${scene.subtext ? `<div class="${id}-sub" style="position:absolute;left:${r(M)}cqw;top:${r(U(96))}cqw;width:${r(COL)}cqw;text-align:center;font-family:${th.monoStack};font-size:${r(U(19))}cqw;letter-spacing:0.2em;color:${th.sub};text-transform:uppercase;opacity:0;z-index:6;">${esc(String(scene.subtext).slice(0, 80))}</div>` : ""}`,
    s: [
      `tl.to(".${id}-ph",{opacity:1,duration:${du(0.5)},ease:"none"},${at(0.15)});`,
      `tl.fromTo(".${id}-ph",{scale:0.7},{scale:1,duration:${du(1.1)},ease:"power3.out"},${at(0.15)});`,
      scene.subtext ? `tl.fromTo(".${id}-sub",{opacity:0},{opacity:1,duration:${du(0.4)},ease:"none"},${at(0.45)});` : "",
      `tl.fromTo(".${id}-word",{opacity:0,y:"${r(U(30))}cqw"},{opacity:1,y:0,duration:${du(0.6)},ease:"power3.out"},${at(0.7)});`,
      ...waterTweens(id, ctx),
    ].filter(Boolean),
  };
}

// EXPLORE — a row of portholes. Fits the pictures it has; never an empty one.
function sExplore(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const n = Math.min(3, shots.length);
  if (n < 2) return { ...K.statement(scene, ctx), backdrop: water(id, th) };
  const head = K.fitLines(scene.headline || scene.title || "", COL / K.camSafe(), U(62), 1, th.adv);
  const gap = U(50), each = Math.min(U(520), (COL - gap * (n - 1)) / n);
  const startX = (U(1920) - (each * n + gap * (n - 1))) / 2;
  return {
    backdrop: water(id, th),
    html: `
    <div class="${id}-head" style="position:absolute;left:${r(M)}cqw;top:${r(U(180))}cqw;width:${r(COL)}cqw;text-align:center;font-family:${th.displayStack};font-weight:700;font-size:${r(head.size)}cqw;letter-spacing:-0.02em;color:${th.ink};${glowText(th)}opacity:0;z-index:6;">${esc(head.lines.join(" "))}</div>
    ${Array.from({ length: n }, (_, i) => porthole(th, {
    cls: `${id}-p${i}`, x: startX + i * (each + gap), y: U(360), w: each, h: each, shot: shots[i],
  })).join("")}`,
    s: [
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(24))}cqw"},{opacity:1,y:0,duration:${du(0.5)},ease:"power3.out"},${at(0.2)});`,
      ...Array.from({ length: n }, (_, i) => `tl.to(".${id}-p${i}",{opacity:1,duration:${du(0.3)},ease:"none"},${at(0.5 + i * 0.26)});`),
      ...Array.from({ length: n }, (_, i) => `tl.fromTo(".${id}-p${i}",{scale:0.6,y:"${r(U(50))}cqw"},{scale:1,y:0,duration:${du(0.7)},ease:"back.out(1.4)"},${at(0.5 + i * 0.26)});`),
      // The bob starts on the SAME stagger as the entrance — pinned to a single at(1.5) it
      // began tweening y on the last porthole while its entrance was still tweening y.
      ...Array.from({ length: n }, (_, i) => `tl.to(".${id}-p${i}",{y:"${r(U(16))}cqw",duration:${r(2.4 + i * 0.3)},ease:"sine.inOut",repeat:${K.reps(Math.max(0, ctx.L - (1.6 + i * 0.26) * ctx.k), 2.4 + i * 0.3)},yoyo:true},${at(1.5 + i * 0.26)});`),
      ...waterTweens(id, ctx),
    ],
  };
}

// SIGNALS — the readouts, on lit slabs. Figures come from the script only.
function sSignals(scene, ctx) {
  const { id, th, at, du } = ctx;
  const stats = K.numbersIn(scene, 3);
  if (stats.length < 2) return { ...K.statement(scene, ctx, { centred: true }), backdrop: water(id, th) };
  const head = K.fitLines(scene.headline || scene.title || "", COL / K.camSafe(), U(74), 2, th.adv);
  const gap = U(40), each = (COL - gap * (stats.length - 1)) / stats.length;
  return {
    backdrop: water(id, th),
    html: `
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
      ...waterTweens(id, ctx),
    ],
  };
}

// SURFACE — the close. The trench inverts: light rises, the mark surfaces, the call glows.
function sSurface(scene, ctx, logo) {
  const { id, th, at, du } = ctx;
  const head = K.fitLines(scene.headline || scene.emphasis || ctx.title, COL / K.camSafe(), U(130), 3, th.adv);
  const action = K.clampWords(String(scene.emphasis || ""), 20) || STRINGS.go;
  const hasMark = !!(logo && logo.path);
  return {
    backdrop: `<div style="position:absolute;inset:0;background:linear-gradient(180deg, ${th.bg} 0%, ${th.mid} 40%, ${th.top} 100%);overflow:hidden;">
      <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 108%, ${rgba(th.accent, 0.34)} 0%, transparent 62%);"></div>
      <div class="${id}-motes" style="position:absolute;inset:${r(-U(60))}cqw;background:${MOTES.map(([x, y], i) => `radial-gradient(circle ${(i % 3) + 2}px at ${x}% ${y}%, ${rgba(th.ink, 0.45)} 0 100%, transparent 100%)`).join(",")};"></div>
    </div>`,
    html: `
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 ${r(M)}cqw;">
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
    ].filter(Boolean),
  };
}

// ---- spine -------------------------------------------------------------------
const SPEC = {
  first: "descend", last: "surface",
  middle: ["discover", "explore", "pocket", "signals"],
  shapes: { descend: [1], discover: [1], explore: [1, 1, 1], pocket: [360 / 736], signals: [], surface: [], statement: [], "statement-c": [] },
  slots: (role, budget) => (role === "descend" || role === "discover" || role === "pocket" ? 1 : role === "explore" ? Math.min(3, Math.max(0, budget)) : 0),
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
