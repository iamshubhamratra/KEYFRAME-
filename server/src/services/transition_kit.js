// TRANSITION KIT — the shared cut vocabulary for KEYFRAME's modern template family.
//
// WHY IT EXISTS. The 15 packs built on `om_port_kit` shared ONE camera move: slide in from
// +200px, scale to 1.03, slide out to -200px (om_port_kit.cameraTweens). Every scene of every
// film of every pack performed it, so a seven-beat film played the same move seven times and
// two different templates cut identically. That is the single largest reason the family read
// as a slideshow with nice frames rather than as directed motion — and no gate caught it,
// because a repeated move is neither a lint error nor a layout defect.
//
// The engine below is the one proven on `kinetic_universe_composer` (12 transitions over
// overlapping clips), generalised so any pack can deal from it, plus two new moves. It is the
// reusable component this family was missing, not a per-pack flourish.
//
// HOW A CUT WORKS HERE. Two scenes coexist for `x` seconds on their own (already unique)
// tracks. `o` / `n` are the OUTGOING / INCOMING transform selectors — never the clip roots:
// the framework owns clip visibility, GSAP owns the inner layer, and the two never touch the
// same property. That split is what makes an overlapping transition lint-clean.
//
// THE FOUR RULES EVERY ENTRY OBEYS (each one is a bug already paid for elsewhere):
//   1. GPU-FRIENDLY PROPERTIES ONLY — transform, opacity, filter:blur, clip-path. Animating a
//      layout property re-flows a 1080x1920 Chromium capture on every frame.
//   2. ONE TWEEN PER ELEMENT+PROPERTY AT A TIME. Two tweens fighting for one property is a
//      seek-order hazard (`overlapping_gsap_tweens`), not just a lint nit.
//   3. FINITE REPEATS VIA FLOOR, never ceil — `gsap_repeat_ceil_overshoot` exists because a
//      ceil'd cycle runs past the clip it belongs to.
//   4. NEVER INLINE `transform:` on an element a transform channel is tweened on — GSAP
//      replaces the whole property. Use the standalone `translate:` for centring.

const { r, esc, hexToRgb } = require("./composer_kit");

// How long two scenes coexist during a cut. Long enough for the move to read as a designed
// choice rather than a dissolve; short enough that the overlapping pair never looks like two
// competing layouts. Callers clamp this against the SHORTER of the two beats.
const XFADE = 0.46;

// ---- local colour helpers ----------------------------------------------------
// Deliberately duplicated (they are ~10 lines) rather than imported from om_port_kit: that
// module requires THIS one, and a cycle between them would resolve to a half-built export
// object at load time.
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const hex2 = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
const rgbHex = (a) => `#${hex2(a[0])}${hex2(a[1])}${hex2(a[2])}`;
const rgba = (h, a) => { const c = hexToRgb(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
function rgbToHsl([rr, gg, bb]) {
  rr /= 255; gg /= 255; bb /= 255;
  const mx = Math.max(rr, gg, bb), mn = Math.min(rr, gg, bb), d = mx - mn;
  let h = 0; const l = (mx + mn) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (mx === rr) h = ((gg - bb) / d) % 6;
    else if (mx === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
  }
  return [(h * 60 + 360) % 360, clamp01(s), clamp01(l)];
}
function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const t = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgbHex([(t[0] + m) * 255, (t[1] + m) * 255, (t[2] + m) * 255]);
}
const spin = (hex, deg, dl = 0, minS = 0.42) => {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  return hslToHex(h + deg, Math.max(minS, s), clamp01(l + dl));
};

// The accent pair a transition paints with. A cut that flashes a colour the film never wears
// reads as a glitch, so both stops derive from the theme's OWN resolved accent — which is the
// brand colour whenever one was supplied.
function accentsFrom(th) {
  const a = (th && (th.accent || th.accent1)) || "#6C5CE7";
  const b = (th && th.accent2) || spin(a, 38, 0.06);
  return {
    a, b,
    gradient: `linear-gradient(90deg,${a},${b})`,
    gradientSoft: `linear-gradient(90deg,${rgba(a, 0.55)},${rgba(b, 0.3)})`,
  };
}

function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- the library -------------------------------------------------------------
// `energy` (0..1) is the impulse a pack's animated backdrop can react to, so a canvas/gradient
// ground pulses with the CUT rather than on an unrelated loop of its own. A pack that ignores
// it renders identically — it is an offer, not a requirement.
const TRANSITIONS = [
  { name: "warp-through", energy: 1.00, build: ({ o, n, t, x }) => ({ js: [
      `tl.to("${o}",{scale:2.6,opacity:0,filter:"blur(13px)",duration:${r(x)},ease:"power3.in"},${r(t)});`,
      `tl.fromTo("${n}",{scale:0.46,opacity:0,filter:"blur(17px)"},{scale:1,opacity:1,filter:"blur(0px)",duration:${r(x * 1.2)},ease:"expo.out"},${r(t)});`,
    ] }) },
  { name: "depth-pull", energy: 0.85, build: ({ o, n, t, x }) => ({ js: [
      `tl.to("${o}",{scale:0.36,opacity:0,filter:"blur(10px)",duration:${r(x)},ease:"power3.in"},${r(t)});`,
      `tl.fromTo("${n}",{scale:1.8,opacity:0,filter:"blur(12px)"},{scale:1,opacity:1,filter:"blur(0px)",duration:${r(x * 1.2)},ease:"expo.out"},${r(t)});`,
    ] }) },
  { name: "iris", energy: 0.55, build: ({ o, n, t, x }) => ({ js: [
      `tl.fromTo("${o}",{clipPath:"circle(82% at 50% 46%)"},{clipPath:"circle(0% at 50% 46%)",duration:${r(x)},ease:"power2.inOut"},${r(t)});`,
      `tl.set("${o}",{opacity:0},${r(t + x)});`,
      `tl.fromTo("${n}",{clipPath:"circle(0% at 50% 46%)",opacity:1},{clipPath:"circle(96% at 50% 46%)",duration:${r(x * 1.15)},ease:"power3.out"},${r(t)});`,
    ] }) },
  { name: "shape-morph", energy: 0.60, build: ({ o, n, t, x }) => ({ js: [
      `tl.fromTo("${o}",{clipPath:"inset(0% 0% 0% 0% round 0cqw)"},{clipPath:"inset(40% 40% 40% 40% round 26cqw)",opacity:0,duration:${r(x)},ease:"power3.in"},${r(t)});`,
      `tl.fromTo("${n}",{clipPath:"inset(44% 44% 44% 44% round 28cqw)",opacity:0},{clipPath:"inset(0% 0% 0% 0% round 0cqw)",opacity:1,duration:${r(x * 1.2)},ease:"power3.out"},${r(t)});`,
    ] }) },
  { name: "blur-push", energy: 0.75, build: ({ o, n, t, x }) => ({ js: [
      `tl.to("${o}",{xPercent:-24,opacity:0,filter:"blur(11px)",duration:${r(x)},ease:"power3.in"},${r(t)});`,
      `tl.fromTo("${n}",{xPercent:28,opacity:0,filter:"blur(13px)"},{xPercent:0,opacity:1,filter:"blur(0px)",duration:${r(x * 1.15)},ease:"expo.out"},${r(t)});`,
    ] }) },
  { name: "layer-split", energy: 0.90, build: ({ o, n, t, x, id, track, acc }) => ({
      html: `<div class="clip" id="${id}" data-start="${r(t)}" data-duration="${r(x * 1.3)}" data-track-index="${track}" data-layout-allow-occlusion style="pointer-events:none;">
        <div class="${id}-ln" style="position:absolute;left:0;right:0;top:50%;height:0.34cqw;margin-top:-0.17cqw;background:linear-gradient(90deg,transparent,${acc.a},${acc.b},transparent);opacity:0;box-shadow:0 0 5cqw ${acc.a};"></div></div>`,
      js: [
        `tl.to("${o}",{scaleY:0.006,opacity:0.9,duration:${r(x * 0.5)},ease:"power3.in",transformOrigin:"center center"},${r(t)});`,
        `tl.set("${o}",{opacity:0},${r(t + x * 0.5)});`,
        `tl.fromTo(".${id}-ln",{opacity:0,scaleX:0.2},{opacity:1,scaleX:1,duration:${r(x * 0.4)},ease:"power2.out"},${r(t + x * 0.25)});`,
        `tl.to(".${id}-ln",{opacity:0,duration:${r(x * 0.45)},ease:"power2.in"},${r(t + x * 0.65)});`,
        `tl.fromTo("${n}",{scaleY:0.006,opacity:1},{scaleY:1,opacity:1,duration:${r(x * 0.62)},ease:"power3.out",transformOrigin:"center center"},${r(t + x * 0.48)});`,
      ] }) },
  { name: "perspective-flip", energy: 0.70, build: ({ o, n, t, x }) => ({ js: [
      `tl.to("${o}",{rotationY:-72,scale:0.83,opacity:0,duration:${r(x)},ease:"power3.in"},${r(t)});`,
      `tl.fromTo("${n}",{rotationY:70,scale:0.85,opacity:0},{rotationY:0,scale:1,opacity:1,duration:${r(x * 1.2)},ease:"power3.out"},${r(t)});`,
    ] }) },
  { name: "light-wipe", energy: 0.80, build: ({ o, n, t, x, id, track, acc }) => ({
      html: `<div class="clip" id="${id}" data-start="${r(t)}" data-duration="${r(x * 1.4)}" data-track-index="${track}" data-layout-allow-occlusion style="pointer-events:none;overflow:hidden;">
        <div class="${id}-bar" style="position:absolute;top:-25%;left:0;width:46%;height:150%;transform-origin:50% 50%;background:linear-gradient(100deg,transparent,${acc.a}88,#ffffffcc,${acc.b}88,transparent);filter:blur(1.2cqw);opacity:0.95;"></div></div>`,
      js: [
        // The sweep tweens POSITION only and the bar's resting opacity is inline, so the fade
        // below is the sole opacity tween on this element (see rule 2 in the header).
        `tl.fromTo(".${id}-bar",{xPercent:-240,rotation:9},{xPercent:360,rotation:9,duration:${r(x * 1.25)},ease:"power2.inOut"},${r(t)});`,
        `tl.to(".${id}-bar",{opacity:0,duration:0.14,ease:"none"},${r(t + x * 1.25)});`,
        `tl.to("${o}",{opacity:0,x:"-5cqw",filter:"blur(6px)",duration:${r(x * 0.7)},ease:"power2.in"},${r(t + x * 0.22)});`,
        `tl.fromTo("${n}",{opacity:0,x:"6cqw"},{opacity:1,x:0,duration:${r(x * 0.85)},ease:"power3.out"},${r(t + x * 0.34)});`,
      ] }) },
  { name: "ribbon-sweep", energy: 0.65, build: ({ o, n, t, x, id, track, acc }) => ({
      html: `<div class="clip" id="${id}" data-start="${r(t)}" data-duration="${r(x * 1.4)}" data-track-index="${track}" data-layout-allow-occlusion style="pointer-events:none;overflow:hidden;">
        ${[0, 1, 2, 3, 4].map((k) => `<div class="${id}-rb" style="position:absolute;left:0;top:${k * 20}%;width:100%;height:20.4%;background:${k % 2 ? acc.gradientSoft : acc.gradient};opacity:0.9;"></div>`).join("")}</div>`,
      js: [
        `tl.fromTo(".${id}-rb",{xPercent:-105},{xPercent:0,duration:${r(x * 0.5)},ease:"power3.out",stagger:0.045},${r(t)});`,
        `tl.to(".${id}-rb",{xPercent:105,duration:${r(x * 0.55)},ease:"power3.in",stagger:0.045},${r(t + x * 0.66)});`,
        `tl.to("${o}",{opacity:0,duration:0.14,ease:"none"},${r(t + x * 0.5)});`,
        `tl.fromTo("${n}",{opacity:0,scale:1.05},{opacity:1,scale:1,duration:${r(x * 0.7)},ease:"power2.out"},${r(t + x * 0.55)});`,
      ] }) },
  { name: "particle-dissolve", energy: 0.95, build: ({ o, n, t, x, id, track, acc, rnd }) => {
      const dots = Array.from({ length: 20 }).map((_, k) => {
        const ang = (k / 20) * 360 + rnd() * 12, dist = 16 + rnd() * 26, sz = r(0.5 + rnd() * 1.1);
        const dx = r(Math.cos(ang * Math.PI / 180) * dist), dy = r(Math.sin(ang * Math.PI / 180) * dist);
        return `<div class="${id}-pt" data-dx="${dx}" data-dy="${dy}" style="position:absolute;left:50%;top:46%;width:${sz}cqw;height:${sz}cqw;border-radius:50%;background:${k % 2 ? acc.a : acc.b};box-shadow:0 0 1.6cqw ${k % 2 ? acc.a : acc.b};opacity:0;"></div>`;
      }).join("");
      return {
        html: `<div class="clip" id="${id}" data-start="${r(t)}" data-duration="${r(x * 1.4)}" data-track-index="${track}" data-layout-allow-occlusion style="pointer-events:none;">${dots}</div>`,
        // `burst` is the shared runtime helper (see RUNTIME_HELPERS) — the fly-out vector is a
        // data-attribute rather than a CSS transform, so GSAP owns the transform outright.
        // THE OUTGOING FRAME MUST COMMIT TO LEAVING. Tuned after watching this cut land on a
        // full-bleed accent scene: with the exit easing out over 0.8x and the arrival starting
        // at 0.28x, both frames sat near half opacity for most of the window and the picture
        // turned to coloured mud. A dissolve is only legible when one frame is clearly winning,
        // so the exit is now faster (0.55x on a steeper curve) and the arrival waits for it.
        js: [
          `burst(".${id}-pt",${r(t)},${r(x * 1.1)});`,
          `tl.to("${o}",{opacity:0,filter:"blur(9px)",scale:1.09,duration:${r(x * 0.55)},ease:"power3.in"},${r(t)});`,
          `tl.fromTo("${n}",{opacity:0,scale:0.93,filter:"blur(8px)"},{opacity:1,scale:1,filter:"blur(0px)",duration:${r(x * 0.9)},ease:"power3.out"},${r(t + x * 0.42)});`,
        ] };
    } },
  { name: "liquid-slide", energy: 0.60, build: ({ o, n, t, x }) => ({ js: [
      `tl.fromTo("${o}",{yPercent:0,borderRadius:"0% 0% 0% 0%"},{yPercent:-40,opacity:0,borderRadius:"44% 44% 0% 0%",filter:"blur(6px)",duration:${r(x)},ease:"power3.inOut"},${r(t)});`,
      `tl.fromTo("${n}",{yPercent:44,opacity:0,borderRadius:"0% 0% 44% 44%"},{yPercent:0,opacity:1,borderRadius:"0% 0% 0% 0%",duration:${r(x * 1.25)},ease:"power3.out"},${r(t)});`,
    ] }) },
  { name: "orbit-swing", energy: 0.70, build: ({ o, n, t, x }) => ({ js: [
      `tl.to("${o}",{rotation:-11,xPercent:-20,yPercent:7,scale:0.88,opacity:0,duration:${r(x)},ease:"power3.in"},${r(t)});`,
      `tl.fromTo("${n}",{rotation:10,xPercent:22,yPercent:-7,scale:0.9,opacity:0},{rotation:0,xPercent:0,yPercent:0,scale:1,opacity:1,duration:${r(x * 1.2)},ease:"back.out(1.4)"},${r(t)});`,
    ] }) },

  // ---- new in this kit -------------------------------------------------------
  // WHIP-PAN. The one move the family had no answer for: a fast lateral throw with directional
  // blur, the cut a sports/launch edit uses to change subject without changing energy. The blur
  // peaks mid-throw rather than easing out of it, which is what separates a whip from a slide.
  { name: "whip-pan", energy: 1.00, build: ({ o, n, t, x }) => ({ js: [
      `tl.to("${o}",{xPercent:-115,opacity:0,filter:"blur(20px)",duration:${r(x * 0.62)},ease:"power3.in"},${r(t)});`,
      `tl.fromTo("${n}",{xPercent:120,opacity:0,filter:"blur(22px)"},{xPercent:0,opacity:1,filter:"blur(0px)",duration:${r(x * 0.95)},ease:"expo.out"},${r(t + x * 0.42)});`,
    ] }) },
  // BARN-DOOR. The outgoing frame parts from its own centre line and the incoming one is
  // revealed behind it. Pure clip-path, so it costs nothing and reads as a mechanical,
  // engineered cut — the right register for the technical packs.
  { name: "barn-door", energy: 0.80, build: ({ o, n, t, x, id, track, acc }) => ({
      html: `<div class="clip" id="${id}" data-start="${r(t)}" data-duration="${r(x * 1.2)}" data-track-index="${track}" data-layout-allow-occlusion style="pointer-events:none;">
        <div class="${id}-seam" style="position:absolute;top:0;bottom:0;left:50%;width:0.3cqw;margin-left:-0.15cqw;background:linear-gradient(180deg,transparent,${acc.a},${acc.b},transparent);opacity:0;box-shadow:0 0 4cqw ${acc.a};"></div></div>`,
      js: [
        `tl.fromTo("${o}",{clipPath:"inset(0% 0% 0% 0%)"},{clipPath:"inset(0% 50% 0% 50%)",opacity:0,duration:${r(x)},ease:"power3.inOut"},${r(t)});`,
        `tl.fromTo(".${id}-seam",{opacity:0,scaleY:0.3},{opacity:1,scaleY:1,duration:${r(x * 0.4)},ease:"power2.out"},${r(t)});`,
        `tl.to(".${id}-seam",{opacity:0,duration:${r(x * 0.5)},ease:"power2.in"},${r(t + x * 0.5)});`,
        `tl.fromTo("${n}",{scale:1.12,opacity:0},{scale:1,opacity:1,duration:${r(x * 1.15)},ease:"power3.out"},${r(t + x * 0.18)});`,
      ] }) },
];

const BY_NAME = new Map(TRANSITIONS.map((t) => [t.name, t]));

// The runtime helpers a transition's `js` may call. Emitted ONCE per document by the caller —
// `particle-dissolve` is the only current user, but a helper referenced and never defined is a
// silent runtime throw that kills the whole timeline, so the dependency is declared here rather
// than remembered.
const RUNTIME_HELPERS = `function burst(sel,at,dur){var ns=document.querySelectorAll(sel);for(var i=0;i<ns.length;i++){var el=ns[i];
    var dx=parseFloat(el.getAttribute("data-dx"))||0,dy=parseFloat(el.getAttribute("data-dy"))||0;
    tl.fromTo(el,{opacity:0,x:0,y:0,scale:0.2},{opacity:1,x:dx+"cqw",y:dy+"cqw",scale:1,duration:dur*0.55,ease:"power2.out"},at+i*0.012);
    tl.to(el,{opacity:0,scale:0.3,duration:dur*0.45,ease:"power2.in"},at+dur*0.5);}}`;

// ---- pack signatures ---------------------------------------------------------
// A SHARED library must not make 15 templates cut alike — that would trade one uniformity for
// another. Each pack declares a personality; the dealer draws from that pool first. The pools
// overlap deliberately (a move belongs to more than one register), so a film still surprises
// inside its own vocabulary.
const SIGNATURES = {
  cinematic: ["warp-through", "depth-pull", "perspective-flip", "light-wipe", "whip-pan"],
  editorial: ["shape-morph", "iris", "blur-push", "barn-door", "light-wipe"],
  kinetic:   ["layer-split", "whip-pan", "orbit-swing", "particle-dissolve", "warp-through"],
  technical: ["layer-split", "barn-door", "blur-push", "iris", "light-wipe"],
  organic:   ["liquid-slide", "shape-morph", "orbit-swing", "iris", "ribbon-sweep"],
};

// AFFINITY — what the cut should MEAN about the beat it lands on. A cut into a product moment
// pushes through depth (the product arrives), a cut into the CTA warps (arrival), a cut into a
// proof beat breaks (impact). Coherence is the difference between varied and merely random.
const AFFINITY = {
  open:      ["warp-through", "iris", "light-wipe"],
  showcase:  ["depth-pull", "perspective-flip", "light-wipe", "whip-pan"],
  proof:     ["layer-split", "barn-door", "particle-dissolve"],
  statement: ["iris", "shape-morph", "liquid-slide", "blur-push"],
  context:   ["blur-push", "shape-morph", "orbit-swing", "ribbon-sweep"],
  cta:       ["warp-through", "iris", "particle-dissolve"],
};

// Classify a beat for affinity purposes. Deliberately derived from what the film ALREADY
// decided — the role the spec assigned, the pictures the beat actually holds, the figures its
// own copy carries — so a pack gets sensible cuts without declaring anything per scene.
function classifyBeat({ role, scene, shotCount = 0, i = 0, total = 1, numbers = 0 }) {
  const rl = String(role || "").toLowerCase();
  if (i === 0) return "open";
  if (i === total - 1) return "cta";
  if (/^statement/.test(rl)) return "statement";
  if (/cta|close|signup|sign-up/.test(rl)) return "cta";
  if (numbers >= 2 || /stat|number|proof|metric|result/.test(rl)) return "proof";
  if (shotCount > 0) return "showcase";
  return "context";
}

// Deal the cuts across an edit. Two guarantees, and they are the whole difference between a
// vocabulary and a shuffle:
//   - NO REPEAT WITHIN 3 CUTS, so the next move is never predictable;
//   - AFFINITY FIRST, so when a move IS reused it lands somewhere it means something.
// Deterministic in `seed`: the same job re-renders the same edit, which is what makes a repair
// lap comparable to the render it is repairing.
function dealTransitions({ classes = [], seed = 7, signature = null, avoid = [] } = {}) {
  const rnd = mulberry(seed);
  const sig = (SIGNATURES[signature] || []).filter((n) => BY_NAME.has(n));
  const blocked = new Set(avoid);
  const all = TRANSITIONS.filter((t) => !blocked.has(t.name));
  const out = [], recent = [];
  const fresh = (list) => list.filter((t) => !recent.includes(t.name));

  for (let i = 0; i < Math.max(0, classes.length - 1); i++) {
    // The cut is named for the beat it lands ON, not the one it leaves.
    const want = AFFINITY[classes[i + 1]] || [];
    const inSig = (t) => !sig.length || sig.includes(t.name);
    // Narrowest pool first, widening only when it is empty: signature AND affinity, then
    // affinity alone, then signature alone, then anything — and only then allow a repeat.
    let pool = fresh(all.filter((t) => want.includes(t.name) && inSig(t)));
    if (!pool.length) pool = fresh(all.filter((t) => want.includes(t.name)));
    if (!pool.length) pool = fresh(all.filter(inSig));
    if (!pool.length) pool = fresh(all);
    if (!pool.length) pool = all.slice();
    if (!pool.length) pool = TRANSITIONS.slice();
    const pick = pool[Math.floor(rnd() * pool.length) % pool.length];
    out.push(pick);
    recent.push(pick.name);
    if (recent.length > 3) recent.shift();
  }
  return out;
}

// The clamped overlap for one cut. A transition longer than the beats it joins would still be
// arriving when the next cut fires; 30% of the SHORTER neighbour is the ceiling that keeps a
// 1.2s beat legible without shortening the move on a 6s one.
function xfadeFor(outDur, inDur, base = XFADE) {
  return Math.max(0.12, Math.min(base, (Number(outDur) || base) * 0.3, (Number(inDur) || base) * 0.3));
}

module.exports = {
  XFADE, TRANSITIONS, SIGNATURES, AFFINITY, RUNTIME_HELPERS,
  dealTransitions, classifyBeat, xfadeFor, accentsFrom, mulberry, spin, rgba,
};
