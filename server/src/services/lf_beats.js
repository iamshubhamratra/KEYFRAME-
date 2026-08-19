// LF BEATS — the sixty long-form scene renderers.
//
// EVERY FUNCTION IN THIS FILE IS A TRANSCRIPTION of a renderer in
// templete-design/longform-handoff/engine/lf-kit.js, and the transcription is deliberately
// mechanical: same segment windows, same easings, same pixel constants, same DOM order. Where
// the source reads `seg(p, 0.1 + k * 0.028, 0.24 + k * 0.028)`, so does this. Nothing here is a
// judgement about what the motion should look like — that judgement was made by the designer
// and is what the handoff IS.
//
// THREE MECHANICAL DIFFERENCES from the source, all forced by the runtime and none of them
// visual:
//
//   1. NO `Frame` WRAPPER. The source's every renderer returns `R(Frame, {p,i,bg,dark,world},
//      …children)`. In our composition the ground, the world, the brand chrome and the garnish
//      are separate tracks with their own lifetimes, and the camera is applied by the runtime to
//      a wrapper the stage emits — so a renderer here returns only what was inside Frame. What
//      Frame carried as props (`bg`, `dark`, `world`) is declared in META below instead, read
//      straight off the source.
//
//   2. NO CLOSURES. The source's renderers close over the kit's scope for R, seg, ease, PADX,
//      fitSize and the three type helpers. These take all of that through `u`, because
//      `browserSource()` ships every function to the page via Function.prototype.toString and a
//      captured variable would arrive undefined. If you add a renderer, reach for `u.` — a bare
//      `seg(...)` will pass in Node (module scope) and throw in the browser.
//
//   3. NO `useTimeline()`. The source reads the global clock with a hook; here `t` arrives as an
//      argument, already multiplied by the pack's ambient. Same number, no state.
//
// META is the other half of the contract. It is not documentation — the stage reads it to decide
// each scene's ground, whether the world shows through, and which storyboard fields the content
// adapter must fill. Its values were extracted mechanically from the source rather than typed:
// grounds are paper x23, sageT x13, terraT x11, ink x9, accent x3 and one alternating (Recap),
// with dark on 12 and world:false on 15.

// ---------------------------------------------------------------- META
// bg     — the palette role this renderer paints, read from its Frame call
// dark   — Frame's `dark` prop: type flips to paper, sub tints against paper
// world  — false where the source passes world:false (the backdrop is hidden, not stopped)
// fit    — the authored display size passed to fitSize, where the renderer calls it
// keys   — the OM_SCENES fields it reads; the content adapter fills exactly these
const META = {
  Open: { bg: "paper", fit: 210, keys: ["title", "kicker", "sub"] },
  Wilt: { bg: "sageT", keys: ["lines"] },
  Problem: { bg: "paper", keys: ["text", "hi", "kicker"] },
  Note: { bg: "terraT", keys: ["text", "kicker", "sign"] },
  Flap: { bg: "ink", dark: true, keys: ["steps", "prefix", "sub"] },
  GrowOnce: { bg: "ink", dark: true, world: false, fit: 230, keys: ["title", "sub"] },
  Counts: { bg: "paper", keys: ["stats", "title"] },
  Wave: { bg: "sageT", fit: 150, keys: ["title", "sub"] },
  Creed: { bg: "paper", keys: ["items", "title"] },
  Marker: { bg: "terraT", keys: ["lines"] },
  Kit: { bg: "accent2", dark: true, world: false, keys: ["num", "title", "sub"] },
  Compose: { bg: "paper", keys: ["title", "sub"] },
  BoxList: { bg: "sageT", keys: ["items", "title"] },
  Cards: { bg: "terraT", keys: ["words", "title", "sub"] },
  Peek: { bg: "paper", keys: ["lines", "title", "image", "caption"] },
  NoGarden: { bg: "ink", dark: true, world: false, keys: ["title", "sub"] },
  Objections: { bg: "paper", keys: ["pairs", "title"] },
  Sill: { bg: "sageT", keys: ["title", "sub"] },
  Steps: { bg: "paper", keys: ["items", "title", "sub"] },
  Weeks: { bg: "terraT", keys: ["steps", "prefix"] },
  Quote: { bg: "sageT", keys: ["text", "by"] },
  Rows: { bg: "paper", keys: ["rows", "sub"] },
  Habit: { bg: "paper", world: false, keys: ["num", "title", "sub"] },
  Metronome: { bg: "paper", keys: ["words", "title", "sub"] },
  Grid: { bg: "sageT", keys: ["words", "keep", "title", "sub"] },
  Breathe: { bg: "terraT", keys: ["title", "sub"] },
  QA: { bg: "ink", dark: true, world: false, keys: ["q", "a", "sub"] },
  Ladder: { bg: "paper", keys: ["stats", "title"] },
  Swing: { bg: "sageT", keys: ["lines", "sub"] },
  Ransom: { bg: "paper", keys: ["title", "sub"] },
  Rewrite: { bg: "terraT", keys: ["old", "neu", "rest", "sub"] },
  Ribbons: { bg: "paper", keys: ["band1", "band2", "title"] },
  Curtain: { bg: "sageT", keys: ["lines", "sub"] },
  Patience: { bg: "ink", dark: true, world: false, keys: ["title", "sub"] },
  Ring: { bg: "paper", keys: ["ring", "title"] },
  Offer: { bg: "accent2", dark: true, world: false, keys: ["lines", "num"] },
  Plans: { bg: "paper", keys: ["plans", "title", "badge"] },
  Spiral: { bg: "terraT", fit: 160, keys: ["title", "sub"] },
  Recap: { bg: "self", world: false, keys: ["words"] },
  Join: { bg: "accent", dark: true, world: false, keys: ["title", "logo", "cta", "url"] },
  Tally: { bg: "paper", keys: ["to", "title", "sub"] },
  Blink: { bg: "ink", dark: true, world: false, fit: 150, keys: ["title", "sub"] },
  Rain: { bg: "paper", fit: 170, keys: ["title", "sub"] },
  Slice: { bg: "ink", dark: true, world: false, fit: 168, keys: ["title", "sub"] },
  Orbit: { bg: "paper", keys: ["sats", "title", "center", "sub"] },
  Magnet: { bg: "ink", dark: true, world: false, keys: ["left", "right", "sub"] },
  TearOff: { bg: "sageT", keys: ["months", "title", "sub", "stampline"] },
  LongShadow: { bg: "terraT", fit: 190, keys: ["word", "sub"] },
  Seesaw: { bg: "paper", keys: ["title", "left", "right", "sub"] },
  Receipt: { bg: "sageT", keys: ["rows", "title", "sub", "header", "total"] },
  Weave: { bg: "paper", keys: ["phrases", "title"] },
  Pile: { bg: "sageT", keys: ["lines", "title"] },
  Bloom: { bg: "terraT", keys: ["title", "sub"] },
  Echo: { bg: "ink", dark: true, world: false, keys: ["word", "sub"] },
  Stamps: { bg: "terraT", keys: ["stamps", "caps", "title", "sub"] },
  Perimeter: { bg: "paper", world: false, keys: ["edge", "word", "sub"] },
  Gauge: { bg: "paper", keys: ["title", "lo", "hi", "sub"] },
  Accordion: { bg: "sageT", keys: ["lines", "title"] },
  Doors: { bg: "sageT", world: false, keys: ["lines", "title"] },
  ZoomThrough: { bg: "terraT", keys: ["word", "title", "sub"] },
};

// ---------------------------------------------------------------- shared prelude
// Helpers more than one renderer needs. They are declared HERE rather than passed through `u`
// because they are beat-level furniture, not engine utilities — but they obey the same law as
// the renderers: no closures over module scope, everything through arguments, so `browserSource`
// can ship them by toString alongside the beats that call them.

/* MediaSlot — lf-kit.js:73-81. The only asset surface in the whole kit: a 980x540 card in Peek
   and a 140px circle in Join, twice per film and nowhere else.
   ONE DELIBERATE DIVERGENCE FROM THE SOURCE: the dashed "DROP IMAGE TO REPLACE" placeholder is
   never emitted. In the handoff it is an authoring affordance; in a delivered film it would be
   a defect, and test-film-packs.js already fails any pack that ships the string. With no asset
   the slot collapses and the scene's copy takes the space, which is the same choice bCta makes
   when a film has no logo. */
function MediaSlot({ src, theme, w, h, radius = 24, caption, u }) {
  const { R, rgba } = u;
  if (src) {
    return R("div", { style: { width: w, height: h, borderRadius: radius, overflow: "hidden" } },
      R("img", { src, style: { width: "100%", height: "100%", objectFit: "cover" } }));
  }
  return R("div", {
    style: {
      width: w, height: h, borderRadius: radius, background: rgba(theme.ink, 0.05),
      border: `2px solid ${rgba(theme.ink, 0.12)}`,
      display: "flex", alignItems: "center", justifyContent: "center",
    },
  }, caption
    ? R("div", { style: { fontFamily: u.FB, fontWeight: 600, fontSize: 20, color: rgba(theme.ink, 0.35) } }, caption)
    : null);
}

const HELPERS = { MediaSlot };

// ---------------------------------------------------------------- the renderers
// Signature, identical for all sixty:
//   ({ progress, index, localTime, scene, theme, t, u }) -> element
// where `u` carries R, seg, segRaw, ease, clamp01, lerp, rgba, fitSize, splitLines, wordsOf,
// the three type helpers (kick/sub/ttl), and the geometry constants PADX/COLW/W/H.

/* 01 — letters drop in one-by-one with rotation.  lf-kit.js:112-128 */
function Open({ progress: p, scene, theme, u }) {
  const { R, seg, ease, clamp01, fitSize, PADX, COLW, FH } = u;
  const title = scene.title || "";
  const size = fitSize(title, 210, COLW);
  return R("div", { style: { position: "absolute", left: PADX, top: 300 } },
    R("div", {
      style: {
        ...u.kick(theme), opacity: seg(p, 0.02, 0.1),
        transform: `translateY(${(1 - ease.outBack(seg(p, 0.02, 0.14))) * 40}px)`,
      },
    }, scene.kicker || ""),
    R("div", { style: { marginTop: 46, whiteSpace: "nowrap" } },
      title.split("").map((ch, k) => {
        const e = ease.outBack(seg(p, 0.1 + k * 0.028, 0.24 + k * 0.028));
        return R("span", {
          key: k,
          style: {
            display: "inline-block", fontFamily: FH, fontSize: size, color: theme.ink,
            opacity: clamp01(e * 2),
            transform: `translateY(${(1 - e) * -160}px) rotate(${(1 - e) * 14}deg)`,
            minWidth: ch === " " ? "0.35em" : 0,
          },
        }, ch);
      })),
    R("div", {
      style: {
        ...u.sub(theme), marginTop: 44, opacity: seg(p, 0.5, 0.62),
        transform: `translateY(${(1 - ease.outCubic(seg(p, 0.5, 0.66))) * 34}px)`,
      },
    }, scene.sub || ""));
}

/* 03 — paragraph words pop in sequence, key words tinted.  lf-kit.js:150-164 */
function Problem({ progress: p, scene, theme, u }) {
  const { R, seg, ease, lerp, wordsOf, PADX, FH, FB } = u;
  const ws = wordsOf(scene.text);
  const his = scene.hi || [];
  return R("div", { style: { position: "absolute", left: PADX, right: PADX, top: 330 } },
    R("div", {
      style: {
        fontFamily: FB, fontWeight: 800, fontSize: 26, letterSpacing: "0.18em",
        color: theme.accent, marginBottom: 40, opacity: seg(p, 0.02, 0.1),
      },
    }, scene.kicker || ""),
    R("div", { style: { lineHeight: 1.28, maxWidth: 1560 } },
      ws.map((wd, k) => {
        const e = ease.outCubic(seg(p, 0.08 + k * 0.022, 0.2 + k * 0.022));
        const hi = his.includes(wd.replace(/[.,]/g, ""));
        return R("span", {
          key: k,
          style: {
            display: "inline-block", fontFamily: FH, fontSize: 74,
            color: hi ? theme.accent : theme.ink, marginRight: "0.3em", opacity: e,
            transform: `scale(${lerp(1.35, 1, e)}) translateY(${(1 - e) * 20}px)`,
          },
        }, wd);
      })));
}

/* 02 — lines slide from alternating sides.  lf-kit.js:131-148 */
function Wilt({ progress: p, scene, theme, u }) {
  const { R, seg, ease, PADX, FH } = u;
  const lines = scene.lines || [];
  return R("div", { style: { position: "absolute", left: PADX, top: 250, width: 1180 } },
    lines.map((ln, k) => {
      const e = ease.outCubic(seg(p, 0.08 + k * 0.1, 0.3 + k * 0.1));
      const fromLeft = k % 2 === 0;
      return R("div", {
        key: k,
        style: {
          fontFamily: FH, fontSize: 92, lineHeight: 1.12, color: theme.ink,
          opacity: e, marginBottom: 18,
          transform: `translateX(${(1 - e) * (fromLeft ? -220 : 220)}px)`,
        },
      }, ln);
    }));
}

// ---- bucket 1 ----------------------------------------------------------------
/* 06 — outline text fills from the bottom (clip-path reveal).  lf-kit.js:197-213 */
function GrowOnce({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, ease, rgba, fitSize, PADX, COLW, FH } = u;
  const title = scene.title || "GROW IT ONCE.";
  const size = fitSize(title, 230, COLW);
  const fill = ease.inOut(seg(p, 0.2, 0.66));
  const st = { fontFamily: FH, fontSize: size, lineHeight: 1, whiteSpace: "nowrap" };
  return R("div", { style: { position: "absolute", inset: 0 } },
    R("div", { style: { position: "absolute", left: PADX, top: 420 } },
      R("div", { style: { position: "relative", opacity: seg(p, 0.04, 0.14) } },
        R("div", { style: { ...st, color: "transparent", WebkitTextStroke: `3px ${rgba(theme.paper, 0.7)}` } }, title),
        R("div", { style: { position: "absolute", inset: 0, ...st, color: theme.accent, clipPath: `inset(${(1 - fill) * 100}% 0 0 0)` } }, title)),
      R("div", { style: { ...u.sub(theme, true, 42), marginTop: 60, opacity: seg(p, 0.6, 0.74), transform: `translateY(${(1 - ease.outCubic(seg(p, 0.6, 0.76))) * 30}px)` } }, scene.sub || "")),
    R("div", { style: { position: "absolute", right: PADX, bottom: 160, width: 320, height: 10, borderRadius: 999, background: rgba(theme.paper, 0.2) } },
      R("div", { style: { width: (fill * 100) + "%", height: "100%", borderRadius: 999, background: theme.accent2 } })));
}

/* 17 — dialogue: objection bubbles left, answers right, tails and pops.  lf-kit.js:382-400 */
function Objections({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, ease, clamp01, rgba, PADX, FH, FB } = u;
  const pairs = scene.pairs || [];
  return R("div", { style: { position: "absolute", inset: 0 } },
    R("div", { style: { position: "absolute", left: PADX, top: 150 } },
      R("div", { style: { ...u.ttl(theme, false, 92), opacity: seg(p, 0.02, 0.1) } }, scene.title || "")),
    R("div", { style: { position: "absolute", left: PADX, right: PADX, top: 288 } },
      pairs.map(([q, a], k) => {
        const eq = ease.outBack(seg(p, 0.08 + k * 0.2, 0.2 + k * 0.2));
        const ea = ease.outBack(seg(p, 0.16 + k * 0.2, 0.3 + k * 0.2));
        return R("div", { key: k, style: { marginBottom: 20 } },
          R("div", { style: { display: "flex" } },
            R("div", { style: { background: rgba(theme.accent2, 0.28), padding: "18px 36px", borderRadius: "30px 30px 30px 8px", fontFamily: FB, fontWeight: 700, fontSize: 36, color: theme.ink, opacity: clamp01(eq * 2), transform: `scale(${eq}) rotate(${(1 - eq) * -4}deg)`, transformOrigin: "left bottom" } }, q)),
          R("div", { style: { display: "flex", justifyContent: "flex-end", marginTop: 10 } },
            R("div", { style: { background: theme.accent, padding: "18px 40px", borderRadius: "30px 30px 8px 30px", fontFamily: FH, fontSize: 40, color: theme.paper, opacity: clamp01(ea * 2), transform: `scale(${ea}) rotate(${(1 - ea) * 4}deg)`, transformOrigin: "right bottom", boxShadow: `0 20px 44px ${rgba(theme.ink, 0.18)}` } }, a)));
      })));
}

/* 36 — chapter: scale ladder, each line larger, biggest bleeds off frame.  lf-kit.js:700-713 */
function Offer({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, ease, clamp01, lerp, rgba, PADX, FH, FB } = u;
  const lines = scene.lines || [];
  const sizes = [90, 150, 250];
  return R("div", { style: { position: "absolute", left: PADX, top: 230 } },
    R("div", { style: { fontFamily: FB, fontWeight: 800, fontSize: 28, letterSpacing: "0.2em", color: rgba(theme.paper, 0.7), marginBottom: 40, opacity: seg(p, 0.02, 0.1) } }, scene.num || "03"),
    lines.map((ln, k) => {
      const e = ease.outQuint(seg(p, 0.08 + k * 0.14, 0.3 + k * 0.14));
      return R("div", { key: k, style: { fontFamily: FH, fontSize: sizes[k] || 100, lineHeight: 1.02, color: k === lines.length - 1 ? theme.paper : rgba(theme.paper, 0.85), whiteSpace: "nowrap", opacity: clamp01(e * 1.6), transform: `translateY(${(1 - e) * 90}px) scale(${lerp(0.9, 1, e)})`, transformOrigin: "left bottom" } }, ln);
    }));
}

/* 40 — CTA: seed burst, logo slot, rising words, pulsing pill button.  lf-kit.js:765-792 */
function Join({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, ease, clamp01, rgba, wordsOf, W, H, FH, FB } = u;
  const burst = ease.outQuint(seg(p, 0.04, 0.3));
  const btn = ease.outBack(seg(p, 0.42, 0.58));
  const ws = wordsOf(scene.title);
  return R("div", { style: { position: "absolute", inset: 0 } },
    R("svg", { width: W, height: H, style: { position: "absolute", inset: 0 } },
      Array.from({ length: 16 }).map((_, k) => {
        const a = (k / 16) * Math.PI * 2;
        const r = burst * (300 + (k % 4) * 90);
        return R("ellipse", { key: k, cx: W / 2 + Math.cos(a) * r * 1.5, cy: 430 + Math.sin(a) * r, rx: 7, ry: 11, fill: rgba(k % 2 ? theme.paper : "#f2dcc4", (1 - burst) * 0.9 + 0.1), transform: `rotate(${a * 57 + t * 40} ${W / 2 + Math.cos(a) * r * 1.5} ${430 + Math.sin(a) * r})` });
      })),
    R("div", { style: { position: "absolute", left: 0, right: 0, top: 210, display: "flex", flexDirection: "column", alignItems: "center" } },
      // AUTHORING AFFORDANCE, NOT FILM CONTENT — the second of the port's two deliberate
      // divergences (the first is in MediaSlot, for the same reason). lf-kit.js:781 fills an
      // empty slot with a "DROP LOGO" label, which is right in a design tool and a defect in a
      // delivered film. The WHOLE DISC goes, not just the label: keeping it would leave a bare
      // white circle floating above the CTA, which reads as a failed image rather than as a
      // design. film_beats' bCta drops its lockup the same way for an unbranded film.
      scene.logo
        ? R("div", { style: { width: 140, height: 140, borderRadius: 999, overflow: "hidden", background: theme.paper, transform: `scale(${ease.outBack(seg(p, 0.02, 0.16))})`, boxShadow: `0 26px 60px ${rgba(theme.ink, 0.3)}` } },
          R("img", { src: scene.logo, style: { width: "100%", height: "100%", objectFit: "cover" } }))
        : null,
      R("div", { style: { marginTop: 50, textAlign: "center" } },
        ws.map((wd, k) => {
          const e = ease.outBack(seg(p, 0.16 + k * 0.07, 0.32 + k * 0.07));
          return R("span", { key: k, style: { display: "inline-block", fontFamily: FH, fontSize: 150, color: theme.paper, marginRight: "0.28em", opacity: clamp01(e * 2), transform: `translateY(${(1 - e) * 90}px) rotate(${(1 - e) * (k % 2 ? 6 : -6)}deg)` } }, wd);
        })),
      R("div", { style: { display: "inline-flex", alignItems: "center", gap: 20, marginTop: 60, padding: "30px 74px", borderRadius: 999, background: theme.ink, color: theme.paper, fontFamily: FH, fontSize: 52, opacity: clamp01(btn * 2), transform: `scale(${btn * (1 + Math.sin(t * 2.4) * 0.025)})`, boxShadow: `0 30px 70px ${rgba(theme.ink, 0.4)}` } },
        scene.cta || "Start growing",
        R("svg", { width: 40, height: 40, viewBox: "0 0 24 24", fill: "none", stroke: theme.paper, strokeWidth: 2.75, strokeLinecap: "round", strokeLinejoin: "round" }, R("path", { d: "M5 12h14" }), R("path", { d: "M13 6l6 6-6 6" }))),
      R("div", { style: { fontFamily: FB, fontWeight: 800, fontSize: 40, color: theme.paper, marginTop: 44, opacity: seg(p, 0.58, 0.7) } }, scene.url || "")));
}

/* 41 — tally marks scratch in by fives, count follows.  lf-kit.js:793-809 */
function Tally({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, PADX, FH } = u;
  const total = scene.to || 21;
  const n = Math.floor(seg(p, 0.08, 0.66) * total);
  return R("div", { style: { position: "absolute", inset: 0 } },
    R("div", { style: { position: "absolute", left: PADX, top: 210 } },
      R("div", { style: { ...u.ttl(theme, false, 100), opacity: seg(p, 0.02, 0.1) } }, scene.title || ""),
      R("div", { style: { display: "flex", flexWrap: "wrap", gap: 34, marginTop: 66, maxWidth: 1150 } },
        Array.from({ length: Math.ceil(total / 5) }).map((_, g) =>
          R("svg", { key: g, width: 148, height: 118 },
            [0, 1, 2, 3].map((k) => (g * 5 + k < n) ? R("line", { key: k, x1: 22 + k * 30, y1: 14 + (k % 2) * 4, x2: 27 + k * 30, y2: 104, stroke: theme.ink, strokeWidth: 9, strokeLinecap: "round" }) : null),
            (g * 5 + 4 < n) ? R("line", { x1: 6, y1: 86, x2: 128, y2: 28, stroke: theme.accent, strokeWidth: 10, strokeLinecap: "round" }) : null))),
      R("div", { style: { ...u.sub(theme, false, 38), marginTop: 50, opacity: seg(p, 0.6, 0.74) } }, scene.sub || "")),
    R("div", { style: { position: "absolute", right: PADX, top: 300, fontFamily: FH, fontSize: 300, color: theme.accent2, fontVariantNumeric: "tabular-nums" } }, n));
}

/* 50 — a receipt prints line by line from a slot.  lf-kit.js:952-970 */
function Receipt({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, rgba, PADX, FH, FB } = u;
  const rows = scene.rows || [];
  const printed = Math.floor(seg(p, 0.1, 0.7) * (rows.length + 1));
  const ph = 150 + Math.min(printed, rows.length) * 78 + (printed > rows.length ? 100 : 20);
  return R("div", { style: { position: "absolute", inset: 0 } },
    R("div", { style: { position: "absolute", left: PADX, top: 240, width: 680 } },
      R("div", { style: { ...u.ttl(theme, false, 100), opacity: seg(p, 0.02, 0.12) } }, scene.title || ""),
      R("div", { style: { ...u.sub(theme, false, 38), marginTop: 40, opacity: seg(p, 0.24, 0.38) } }, scene.sub || "")),
    R("div", { style: { position: "absolute", right: PADX + 60, top: 230, width: 760 } },
      R("div", { style: { height: 34, borderRadius: 999, background: theme.ink, position: "relative", zIndex: 2, boxShadow: `0 10px 26px ${rgba(theme.ink, 0.3)}` } }),
      R("div", { style: { width: 690, margin: "0 auto", background: "#fdf7ec", overflow: "hidden", height: ph, transition: "none", boxShadow: `0 26px 56px ${rgba(theme.ink, 0.14)}`, transform: `rotate(${Math.sin(t * 0.8) * 0.6}deg)` } },
        R("div", { style: { padding: "36px 44px 10px", fontFamily: FB, fontWeight: 800, fontSize: 28, letterSpacing: "0.18em", color: rgba(theme.ink, 0.55), textAlign: "center" } }, scene.header || "— SEASON LEDGER —"),
        rows.map((r2, k) => R("div", { key: k, style: { display: "flex", justifyContent: "space-between", padding: "18px 44px", fontFamily: FB, fontWeight: 600, fontSize: 32, color: theme.ink, opacity: k < printed ? 1 : 0, borderBottom: `2px dashed ${rgba(theme.ink, 0.14)}` } },
          R("span", null, r2[0]), R("span", { style: { fontVariantNumeric: "tabular-nums" } }, r2[1]))),
        printed > rows.length ? R("div", { style: { display: "flex", justifyContent: "space-between", padding: "22px 44px", fontFamily: FH, fontSize: 40, color: theme.accent } }, R("span", null, "TOTAL"), R("span", null, scene.total || "")) : null)));
}

/* 51 — wavy underlines stitch themselves beneath each phrase.  lf-kit.js:971-986 */
function Weave({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, ease, clamp01, PADX, FH } = u;
  const phrases = scene.phrases || [];
  return R("div", { style: { position: "absolute", left: PADX, top: 220 } },
    R("div", { style: { ...u.ttl(theme, false, 96), opacity: seg(p, 0.02, 0.1), marginBottom: 60 } }, scene.title || ""),
    phrases.map((ph2, k) => {
      const drw = ease.inOut(seg(p, 0.14 + k * 0.16, 0.4 + k * 0.16));
      return R("div", { key: k, style: { marginBottom: 54 } },
        R("div", { style: { fontFamily: FH, fontSize: 88, color: k === 1 ? theme.accent : theme.ink, opacity: clamp01(drw * 3) } }, ph2),
        R("svg", { width: 900, height: 34 },
          R("path", { d: "M 4 16 " + Array.from({ length: 10 }).map(() => "q 45 26 90 0").join(" "), fill: "none", stroke: k % 2 ? theme.accent2 : theme.accent, strokeWidth: 7, strokeLinecap: "round", strokeDasharray: 1000, strokeDashoffset: 1000 * (1 - drw) })));
    }));
}

/* 52 — cards drop from above and pile into a stack.  lf-kit.js:987-999 */
function Pile({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, ease, clamp01, rgba, PADX, FH } = u;
  const lines = scene.lines || [];
  return R("div", { style: { position: "absolute", inset: 0 } },
    R("div", { style: { position: "absolute", left: PADX, top: 190, ...u.ttl(theme, false, 96), opacity: seg(p, 0.02, 0.1) } }, scene.title || ""),
    R("div", { style: { position: "absolute", left: PADX, top: 370 } },
      lines.map((ln, k) => {
        const e = ease.outBack(seg(p, 0.1 + k * 0.13, 0.3 + k * 0.13));
        return R("div", { key: k, style: { display: "inline-block", clear: "both", float: "left", background: k % 2 ? "#fdf7ec" : rgba(theme.accent, 0.16), border: `3px solid ${rgba(theme.ink, 0.16)}`, borderRadius: 22, padding: "22px 46px", marginBottom: 20, fontFamily: FH, fontSize: 62, color: theme.ink, opacity: clamp01(e * 1.6), transform: `translateY(${(1 - e) * -(500 + k * 90)}px) rotate(${(k % 2 ? 1.4 : -1.4) * e}deg)`, boxShadow: `0 16px 36px ${rgba(theme.ink, 0.1)}` } }, ln);
      })));
}

/* 54 — the word echoes forward out of its own copies.  lf-kit.js:1014-1028 */
function Echo({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, ease, lerp, rgba, FH } = u;
  const word = scene.word || "";
  return R("div", { style: { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" } },
    R("div", { style: { position: "relative", textAlign: "center" } },
      [4, 3, 2, 1].map((k) => {
        const e = ease.outQuint(seg(p, 0.06 + (4 - k) * 0.07, 0.24 + (4 - k) * 0.07));
        return R("div", { key: k, style: { position: "absolute", left: "50%", top: "50%", transform: `translate(-50%,-50%) scale(${(1 + k * 0.34) * lerp(1.4, 1, e)})`, fontFamily: FH, fontSize: 200, whiteSpace: "nowrap", color: rgba(theme.paper, 0.1 + 0.05 * (4 - k)), opacity: e } }, word);
      }),
      R("div", { style: { position: "relative", fontFamily: FH, fontSize: 200, whiteSpace: "nowrap", color: theme.accent, opacity: seg(p, 0.3, 0.4), transform: `scale(${lerp(1.5, 1, ease.outBack(seg(p, 0.3, 0.46)))})` } }, word),
      R("div", { style: { ...u.sub(theme, true, 40), margin: "430px auto 0", position: "relative", textAlign: "center", opacity: seg(p, 0.52, 0.66) } }, scene.sub || "")));
}

// ---- bucket 2 ----------------------------------------------------------------
/* 13 — checklist: boxes pop, checkmarks draw stroke-by-stroke.  lf-kit.js:311-329 */
function BoxList({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, ease, clamp01, PADX, FH } = u;
  const items = scene.items || [];
  return R("div", { style: { position: "absolute", inset: 0 } },
    R("div", { style: { position: "absolute", left: PADX, top: 170 } },
      R("div", { style: { ...u.ttl(theme, false, 104), opacity: seg(p, 0.02, 0.1) } }, scene.title || "")),
    R("div", { style: { position: "absolute", left: PADX, top: 350 } },
      items.map((it, k) => {
        const e = ease.outBack(seg(p, 0.1 + k * 0.11, 0.24 + k * 0.11));
        const drw = seg(p, 0.18 + k * 0.11, 0.32 + k * 0.11);
        return R("div", { key: k, style: { display: "flex", alignItems: "center", gap: 36, marginBottom: 32, opacity: clamp01(e * 2), transform: `translateX(${(1 - e) * -140}px)` } },
          R("svg", { width: 74, height: 74, viewBox: "0 0 74 74" },
            R("rect", { x: 5, y: 5, width: 64, height: 64, rx: 18, fill: "#fdf7ec", stroke: theme.ink, strokeWidth: 4 }),
            R("path", { d: "M 20 38 L 33 51 L 56 24", fill: "none", stroke: theme.accent, strokeWidth: 8, strokeLinecap: "round", strokeLinejoin: "round", strokeDasharray: 70, strokeDashoffset: 70 * (1 - drw) })),
          R("div", { style: { fontFamily: FH, fontSize: 56, color: theme.ink } }, it));
      })));
}

/* 19 — horizontal step timeline: line draws, nodes pop above/below.  lf-kit.js:414-437 */
function Steps({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, ease, clamp01, rgba, PADX, W, FH } = u;
  const steps = scene.items || [];
  const drw = ease.inOut(seg(p, 0.1, 0.55));
  return R("div", { style: { position: "absolute", inset: 0 } },
    R("div", { style: { position: "absolute", left: PADX, top: 190 } },
      R("div", { style: { ...u.ttl(theme, false, 100), opacity: seg(p, 0.02, 0.1) } }, scene.title || "")),
    R("svg", { width: W, height: 500, style: { position: "absolute", left: 0, top: 430 } },
      R("line", { x1: PADX, y1: 250, x2: PADX + (W - PADX * 2) * drw, y2: 250, stroke: theme.ink, strokeWidth: 6, strokeDasharray: "2 22", strokeLinecap: "round" }),
      steps.map((s, k) => {
        const x = PADX + 90 + k * ((W - PADX * 2 - 180) / (steps.length - 1 || 1));
        const e = ease.outBack(seg(p, 0.14 + k * 0.12, 0.3 + k * 0.12));
        const up = k % 2 === 0;
        return R("g", { key: k, transform: `translate(${x},250)` },
          R("circle", { r: 30 * e, fill: k % 2 ? theme.accent2 : theme.accent }),
          R("text", { y: 12, textAnchor: "middle", fontFamily: FH, fontSize: 30, fill: theme.paper, opacity: e }, k + 1),
          R("g", { opacity: clamp01(e * 1.6), transform: `translate(0,${up ? -74 - (1 - e) * 40 : 96 + (1 - e) * 40})` },
            R("text", { textAnchor: "middle", fontFamily: FH, fontSize: 46, fill: theme.ink }, s),
            R("path", { d: `M -8 ${up ? 18 : -52} q 8 ${up ? 14 : -14} 16 0`, fill: "none", stroke: rgba(theme.accent2, 0.7), strokeWidth: 4 })));
      })),
    R("div", { style: { position: "absolute", left: PADX, top: 880, ...u.sub(theme, false, 36), opacity: seg(p, 0.62, 0.75) } }, scene.sub || ""));
}

/* 29 — lines swing in on rotateY with perspective, settle with overshoot.  lf-kit.js:583-595 */
function Swing({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, ease, clamp01, PADX, FH } = u;
  const lines = scene.lines || [];
  return R("div", { style: { position: "absolute", left: PADX, top: 300, perspective: 1100 } },
    lines.map((ln, k) => {
      const e = ease.outBack(seg(p, 0.06 + k * 0.14, 0.3 + k * 0.14));
      return R("div", { key: k, style: { fontFamily: FH, fontSize: 108, lineHeight: 1.22, color: k === 1 ? theme.accent : theme.ink, opacity: clamp01(e * 1.6), transform: `rotateY(${(1 - e) * -74}deg) translateX(${(1 - e) * 120}px)`, transformOrigin: "left center" } }, ln);
    }),
    R("div", { style: { ...u.sub(theme, false, 38), marginTop: 54, opacity: seg(p, 0.56, 0.7) } }, scene.sub || ""));
}

/* 34 — elastic squash-and-stretch single word, ellipsis dots pop after.  lf-kit.js:667-680 */
function Patience({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, ease, clamp01, lerp, FH } = u;
  const e = seg(p, 0.08, 0.42);
  const el = ease.outElastic(e);
  const sx = lerp(1.7, 1, el), sy = lerp(0.35, 1, el);
  return R("div", { style: { position: "absolute", left: 0, right: 0, top: 380, textAlign: "center" } },
    R("div", { style: { display: "inline-block", fontFamily: FH, fontSize: 260, color: theme.paper, opacity: clamp01(e * 4), transform: `scale(${sx}, ${sy})`, transformOrigin: "center bottom" } }, scene.title || "PATIENCE"),
    R("div", { style: { display: "flex", justifyContent: "center", gap: 30, marginTop: 30 } },
      [0, 1, 2].map((k) => R("div", { key: k, style: { width: 34, height: 34, borderRadius: 999, background: theme.accent, transform: `scale(${ease.outBack(seg(p, 0.46 + k * 0.08, 0.56 + k * 0.08))}) translateY(${Math.sin(t * 2 + k) * 6}px)` } }))),
    R("div", { style: { ...u.sub(theme, true, 42), margin: "60px auto 0", textAlign: "center", opacity: seg(p, 0.64, 0.76) } }, scene.sub || ""));
}

/* 39 — rapid recap: full-frame word flashes with alternating grounds.  lf-kit.js:748-764 */
function Recap({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, ease, clamp01, lerp, rgba, FH } = u;
  const ws = scene.words || [];
  const q = seg(p, 0.04, 0.96) * ws.length;
  const k = Math.min(ws.length - 1, Math.floor(q));
  const f = clamp01((q - k) * 4);
  const grounds = [theme.ink, theme.accent, theme.accent2, "#fdf7ec"];
  const inks = [theme.paper, theme.paper, theme.paper, theme.ink];
  const g = grounds[k % 4], c = inks[k % 4];
  // THE ONE RENDERER THAT PAINTS ITS OWN GROUND, and it has to.
  //
  // Every other beat has a ground that is constant for the whole scene, so the stage paints it
  // on #lf-ground and META names the role. Recap's cycles WITHIN the scene: `g` is indexed by
  // `k`, the flash currently showing, which is a function of `p`. Dropping the Frame wrapper
  // therefore dropped a colour that changes eight times in seven and a half seconds — the scene
  // rendered its words over whichever single ground the stage had chosen, and scored 59.9%
  // against the reference where every other beat scored above 95%.
  //
  // META marks it bg:"self" so the stage paints a neutral base it knows will be covered.
  return R("div", { style: { position: "absolute", inset: 0, background: g } },
    R("div", { style: { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" } },
      R("div", { style: { fontFamily: FH, fontSize: 240, color: c, transform: `scale(${lerp(1.5, 1, ease.outQuint(f))}) rotate(${(1 - ease.outQuint(f)) * (k % 2 ? 5 : -5)}deg)`, opacity: clamp01(f * 3) } }, ws[k] || "")),
    R("div", { style: { position: "absolute", bottom: 120, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 16 } },
      ws.map((_, d) => R("div", { key: d, style: { width: 18, height: 18, borderRadius: 999, background: d <= k ? (k % 4 === 3 ? theme.accent : theme.paper) : rgba(k % 4 === 3 ? theme.ink : theme.paper, 0.25) } }))));
}

/* 43 — letters rain down into place with jitter.  lf-kit.js:826-840 */
function Rain({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, ease, clamp01, fitSize, PADX, COLW, FH } = u;
  const title = (scene.title || "").toUpperCase();
  const size = fitSize(title, 170, COLW);
  return R("div", { style: { position: "absolute", left: PADX, top: 430, whiteSpace: "nowrap" } },
    title.split("").map((ch, k) => {
      const st = ((k * 7) % 13) / 13 * 0.34;
      const e = ease.outBack(seg(p, 0.05 + st, 0.24 + st));
      return R("span", { key: k, style: { display: "inline-block", fontFamily: FH, fontSize: size, color: k % 6 === 3 ? theme.accent2 : theme.ink, opacity: clamp01(e * 2), transform: `translateY(${(1 - e) * -(300 + (k % 5) * 110)}px) translateX(${(1 - e) * Math.sin(k * 3.1) * 40}px)`, minWidth: ch === " " ? "0.4em" : 0 } }, ch);
    }),
    R("div", { style: { ...u.sub(theme, false, 40), marginTop: 60, opacity: seg(p, 0.56, 0.7) } }, scene.sub || ""));
}

/* 48 — a sun dot arcs by; the word’s long shadow swings with it.  lf-kit.js:917-935 */
function LongShadow({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, lerp, rgba, fitSize, PADX, COLW, W, FH } = u;
  const sunq = seg(p, 0.06, 0.9);
  const sunx = lerp(PADX + 60, W - PADX - 60, sunq);
  const word = scene.word || "";
  const size = fitSize(word, 190, COLW);
  const sdx = (W / 2 - sunx) / 46;
  return R("div", { style: { position: "absolute", inset: 0 } },
    R("svg", { width: W, height: 400, style: { position: "absolute", inset: 0 } },
      R("circle", { cx: sunx, cy: 240 - Math.sin(sunq * Math.PI) * 90, r: 54, fill: theme.accent }),
      [0, 1, 2, 3, 4, 5, 6, 7].map((k) => R("line", { key: k, x1: sunx + Math.cos(k * 0.785 + t) * 72, y1: 240 - Math.sin(sunq * Math.PI) * 90 + Math.sin(k * 0.785 + t) * 72, x2: sunx + Math.cos(k * 0.785 + t) * 92, y2: 240 - Math.sin(sunq * Math.PI) * 90 + Math.sin(k * 0.785 + t) * 92, stroke: theme.accent, strokeWidth: 6, strokeLinecap: "round" }))),
    R("div", { style: { position: "absolute", left: 0, right: 0, top: 470, textAlign: "center" } },
      R("div", { style: { position: "relative", display: "inline-block" } },
        [8, 7, 6, 5, 4, 3, 2, 1].map((k) => R("div", { key: k, style: { position: "absolute", left: sdx * k, top: k * 11, fontFamily: FH, fontSize: size, whiteSpace: "nowrap", color: rgba(theme.ink, 0.05 + 0.012 * (8 - k)) } }, word)),
        R("div", { style: { position: "relative", fontFamily: FH, fontSize: size, whiteSpace: "nowrap", color: theme.ink, opacity: seg(p, 0.04, 0.16) } }, word)),
      R("div", { style: { ...u.sub(theme, false, 40), margin: "70px auto 0", opacity: seg(p, 0.4, 0.54) } }, scene.sub || "")));
}

/* 49 — seesaw: two words on a beam that tips toward the winner.  lf-kit.js:936-951 */
function Seesaw({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, ease, lerp, rgba, PADX, FH } = u;
  const tip = lerp(9, -13, ease.outBack(seg(p, 0.24, 0.52))) + Math.sin(t * 1.2) * 1.2;
  return R("div", { style: { position: "absolute", inset: 0 } },
    R("div", { style: { position: "absolute", left: PADX, top: 190, ...u.ttl(theme, false, 96), opacity: seg(p, 0.02, 0.1) } }, scene.title || ""),
    R("div", { style: { position: "absolute", left: 0, right: 0, top: 320 } },
      R("div", { style: { width: 1240, margin: "0 auto", position: "relative", transform: `rotate(${tip}deg)`, transformOrigin: "center 330px" } },
        R("div", { style: { height: 22, borderRadius: 999, background: theme.ink, marginTop: 300 } }),
        R("div", { style: { position: "absolute", left: -30, top: 90, background: theme.accent2, color: theme.paper, fontFamily: FH, fontSize: 76, padding: "22px 54px", borderRadius: 26, transform: `rotate(${-tip}deg)`, opacity: seg(p, 0.1, 0.2), boxShadow: `0 20px 44px ${rgba(theme.ink, 0.18)}` } }, scene.left || ""),
        R("div", { style: { position: "absolute", right: -30, top: 90, background: theme.accent, color: theme.paper, fontFamily: FH, fontSize: 76, padding: "22px 54px", borderRadius: 26, transform: `rotate(${-tip}deg)`, opacity: seg(p, 0.16, 0.26), boxShadow: `0 20px 44px ${rgba(theme.ink, 0.18)}` } }, scene.right || "")),
      R("div", { style: { width: 0, height: 0, margin: "-8px auto 0", borderLeft: "70px solid transparent", borderRight: "70px solid transparent", borderBottom: `130px solid ${rgba(theme.ink, 0.85)}` } })),
    R("div", { style: { position: "absolute", left: 0, right: 0, top: 928, textAlign: "center" } },
      R("div", { style: { ...u.sub(theme, false, 36), margin: "0 auto", opacity: seg(p, 0.56, 0.7) } }, scene.sub || "")));
}

/* 56 — text patrols the frame border on all four edges.  lf-kit.js:1048-1065 */
function Perimeter({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, ease, rgba, FH, FB } = u;
  const txt = ((scene.edge || "") + " · ").repeat(12);
  const strip = (st, inner) => R("div", { style: { position: "absolute", overflow: "hidden", whiteSpace: "nowrap", ...st } }, inner);
  const mono = { fontFamily: FB, fontWeight: 800, fontSize: 30, letterSpacing: "0.2em", color: rgba(theme.ink, 0.5), display: "inline-block" };
  const x = (t * 90) % 800;
  return R("div", { style: { position: "absolute", inset: 0 } },
    strip({ top: 108, left: 120, right: 120, opacity: seg(p, 0.04, 0.14) }, R("div", { style: { ...mono, transform: `translateX(${-x}px)` } }, txt)),
    strip({ bottom: 108, left: 120, right: 120, opacity: seg(p, 0.1, 0.2) }, R("div", { style: { ...mono, transform: `translateX(${x - 800}px)` } }, txt)),
    strip({ top: 170, bottom: 170, left: 108, width: 44, opacity: seg(p, 0.16, 0.26) }, R("div", { style: { ...mono, writingMode: "vertical-rl", transform: `translateY(${-x}px)` } }, txt)),
    strip({ top: 170, bottom: 170, right: 108, width: 44, opacity: seg(p, 0.22, 0.32) }, R("div", { style: { ...mono, writingMode: "vertical-rl", transform: `translateY(${x - 800}px)` } }, txt)),
    [0, 1, 2, 3].map((k) => R("div", { key: k, style: { position: "absolute", width: 20, height: 20, borderRadius: 999, background: theme.accent, left: k % 2 ? "auto" : 100, right: k % 2 ? 100 : "auto", top: k < 2 ? 100 : "auto", bottom: k < 2 ? "auto" : 100, transform: `scale(${ease.outBack(seg(p, 0.05 + k * 0.05, 0.16 + k * 0.05))})` } })),
    R("div", { style: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" } },
      R("div", { style: { fontFamily: FH, fontSize: 210, color: theme.ink, opacity: seg(p, 0.28, 0.4), transform: `scale(${ease.outBack(seg(p, 0.28, 0.46))})` } }, scene.word || ""),
      R("div", { style: { ...u.sub(theme, false, 38), marginTop: 40, textAlign: "center", opacity: seg(p, 0.5, 0.64) } }, scene.sub || "")));
}

// ---- bucket 3 ----------------------------------------------------------------
/* 10 — marker highlights sweep behind key words.  lf-kit.js:262-280 */
function Marker({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, ease, rgba, PADX, FH } = u;
  const lines = scene.lines || [];
  return R("div", { style: { position: "absolute", left: PADX, top: 300 } },
    lines.map((ln, k) => {
      const halves = ln.split("*");
      const e = seg(p, 0.05 + k * 0.16, 0.14 + k * 0.16);
      const hl = ease.inOut(seg(p, 0.14 + k * 0.16, 0.3 + k * 0.16));
      return R("div", { key: k, style: { fontFamily: FH, fontSize: 96, lineHeight: 1.3, color: theme.ink, opacity: e, transform: `translateY(${(1 - ease.outCubic(e)) * 40}px)` } },
        halves[0],
        halves[1] ? R("span", { style: { position: "relative", whiteSpace: "nowrap" } },
          R("span", { style: { position: "absolute", left: "-0.1em", right: "-0.1em", top: "0.14em", bottom: "0.04em", background: rgba(theme.accent2, 0.45), borderRadius: 14, transform: `scaleX(${hl})`, transformOrigin: "left" } }),
          R("span", { style: { position: "relative" } }, halves[1])) : null,
        halves[2] || "");
    }));
}

/* 12 — words fly in from scattered positions to compose the sentence.  lf-kit.js:296-310 */
function Compose({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, ease, clamp01, wordsOf, PADX, FH } = u;
  const ws = wordsOf(scene.title);
  const size = 110;
  return R("div", { style: { position: "absolute", left: PADX, right: PADX, top: 400, lineHeight: 1.25 } },
    ws.map((wd, k) => {
      const e = ease.outQuint(seg(p, 0.06 + k * 0.07, 0.3 + k * 0.07));
      const sx = Math.sin(k * 12.7) * 700, sy = Math.cos(k * 7.3) * 420, sr = Math.sin(k * 5.1) * 50;
      return R("span", { key: k, style: { display: "inline-block", fontFamily: FH, fontSize: size, color: k === ws.length - 1 ? theme.accent : theme.ink, marginRight: "0.32em", opacity: clamp01(e * 1.6), transform: `translate(${(1 - e) * sx}px, ${(1 - e) * sy}px) rotate(${(1 - e) * sr}deg)` } }, wd);
    }),
    R("div", { style: { ...u.sub(theme, false, 38), marginTop: 60, opacity: seg(p, 0.62, 0.75) } }, scene.sub || ""));
}

/* 23 — chapter: ink circle spreads from center, title knocked out, recedes to ring.  lf-kit.js:486-499 */
function Habit({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, ease, lerp, FH } = u;
  const grow = ease.outQuint(seg(p, 0.05, 0.3));
  const shrink = ease.inOut(seg(p, 0.62, 0.85));
  const r = lerp(0, 1400, grow) - shrink * 1120;
  return R("div", { style: { position: "absolute", inset: 0 } },
    R("div", { style: { position: "absolute", left: "50%", top: "50%", width: r * 2, height: r * 2, borderRadius: 999, background: theme.accent, transform: "translate(-50%,-50%)" } }),
    R("div", { style: { position: "absolute", left: 0, right: 0, top: 360, textAlign: "center" } },
      R("div", { style: { fontFamily: FH, fontSize: 300, lineHeight: 0.9, color: grow > 0.4 ? theme.paper : theme.ink, opacity: seg(p, 0.14, 0.26) } }, scene.num || "02"),
      R("div", { style: { fontFamily: FH, fontSize: 140, color: grow > 0.4 ? theme.paper : theme.ink, opacity: seg(p, 0.24, 0.36), transform: `scale(${lerp(0.8, 1, ease.outBack(seg(p, 0.24, 0.42)))})` } }, scene.title || ""),
      R("div", { style: { ...u.sub(theme, grow > 0.4 && shrink < 0.5, 40), margin: "34px auto 0", textAlign: "center", opacity: seg(p, 0.4, 0.52) } }, scene.sub || "")));
}

/* 28 — number ladder: stats rise from the bottom and stack upward.  lf-kit.js:566-582 */
function Ladder({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, ease, clamp01, rgba, PADX, H, FH, FB } = u;
  const stats = scene.stats || [];
  const cols = [theme.accent, theme.accent2, "#a8845c"];
  return R("div", { style: { position: "absolute", inset: 0 } },
    R("div", { style: { position: "absolute", left: PADX, top: 170 } },
      R("div", { style: { ...u.ttl(theme, false, 96), opacity: seg(p, 0.02, 0.1) } }, scene.title || "")),
    stats.slice(0, 3).map((st, k) => {
      const e = ease.outQuint(seg(p, 0.1 + k * 0.16, 0.3 + k * 0.16));
      const y = 350 + k * 220;
      return R("div", { key: k, style: { position: "absolute", left: PADX, right: PADX, top: y, display: "flex", alignItems: "baseline", gap: 50, opacity: clamp01(e * 1.6), transform: `translateY(${(1 - e) * (H - y)}px)` } },
        R("div", { style: { fontFamily: FH, fontSize: 170, lineHeight: 0.9, color: cols[k], fontVariantNumeric: "tabular-nums", minWidth: 460 } }, Math.round(st.to * ease.outCubic(seg(p, 0.14 + k * 0.16, 0.5 + k * 0.16))).toLocaleString(), R("span", { style: { fontSize: 80 } }, st.suffix || "")),
        R("div", { style: { fontFamily: FB, fontWeight: 600, fontSize: 38, lineHeight: 1.3, color: rgba(theme.ink, 0.72), maxWidth: 900 } }, st.label));
    }));
}

/* 30 — ransom note: each word a different treatment, popping in shuffled order.  lf-kit.js:596-617 */
function Ransom({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, ease, clamp01, rgba, wordsOf, PADX, FH } = u;
  const ws = wordsOf(scene.title);
  const styles = [
    { background: theme.accent, color: theme.paper, borderRadius: 18, padding: "8px 34px" },
    { background: "transparent", color: theme.ink, borderBottom: `10px solid ${theme.accent2}`, padding: "8px 6px" },
    { background: theme.ink, color: theme.paper, borderRadius: 999, padding: "8px 40px" },
    { background: "#fdf7ec", color: theme.accent, borderRadius: 14, padding: "8px 30px", boxShadow: `0 14px 30px ${rgba(theme.ink, 0.14)}` },
    { background: theme.accent2, color: theme.paper, borderRadius: 22, padding: "8px 34px" },
  ];
  const order = ws.map((_, k) => (k * 7 + 3) % ws.length);
  return R("div", { style: { position: "absolute", left: PADX, right: PADX, top: 380, lineHeight: 1.5 } },
    ws.map((wd, k) => {
      const rank = order.indexOf(k);
      const e = ease.outBack(seg(p, 0.06 + rank * 0.09, 0.22 + rank * 0.09));
      return R("span", { key: k, style: { display: "inline-block", fontFamily: FH, fontSize: 104, marginRight: "0.3em", ...styles[k % styles.length], opacity: clamp01(e * 2), transform: `scale(${e}) rotate(${(k % 2 ? 2.4 : -2.4) + Math.sin(t * 1.2 + k) * 0.8}deg)` } }, wd);
    }),
    R("div", { style: { ...u.sub(theme, false, 38), marginTop: 66, opacity: seg(p, 0.62, 0.76) } }, scene.sub || ""));
}

/* 33 — curtain windows: lines revealed by bars sliding up inside masks.  lf-kit.js:651-666 */
function Curtain({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, ease, lerp, PADX, FH } = u;
  const lines = scene.lines || [];
  return R("div", { style: { position: "absolute", left: PADX, top: 280 } },
    lines.map((ln, k) => {
      const rise = ease.outQuint(seg(p, 0.08 + k * 0.14, 0.32 + k * 0.14));
      const bar = ease.inOut(seg(p, 0.16 + k * 0.14, 0.38 + k * 0.14));
      return R("div", { key: k, style: { position: "relative", overflow: "hidden", marginBottom: 30, borderRadius: 10 } },
        R("div", { style: { fontFamily: FH, fontSize: 116, lineHeight: 1.14, color: k === lines.length - 1 ? theme.accent : theme.ink, transform: `translateY(${(1 - rise) * 105}%)`, padding: "4px 0" } }, ln),
        R("div", { style: { position: "absolute", inset: 0, background: k % 2 ? theme.accent2 : theme.accent, transform: `translateY(${lerp(0, -105, bar)}%)`, borderRadius: 10 } }));
    }),
    R("div", { style: { ...u.sub(theme, false, 38), marginTop: 40, opacity: seg(p, 0.66, 0.78) } }, scene.sub || ""));
}

/* 45 — satellites orbit the center word, then dock into a row.  lf-kit.js:860-877 */
function Orbit({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, ease, lerp, rgba, PADX, W, FH } = u;
  const sats = scene.sats || [];
  const dock = ease.inOut(seg(p, 0.5, 0.72));
  return R("div", { style: { position: "absolute", inset: 0 } },
    R("div", { style: { position: "absolute", left: PADX, top: 170, ...u.ttl(theme, false, 84), opacity: seg(p, 0.02, 0.1) } }, scene.title || ""),
    R("div", { style: { position: "absolute", left: 0, right: 0, top: 470, textAlign: "center", fontFamily: FH, fontSize: 190, color: theme.ink, opacity: seg(p, 0.06, 0.16), transform: `scale(${lerp(0.8, 1, ease.outBack(seg(p, 0.06, 0.22)))})` } }, scene.center || ""),
    sats.map((s, k) => {
      const a = t * 0.7 + (k / sats.length) * Math.PI * 2;
      const ox = W / 2 + Math.cos(a) * 640, oy = 560 + Math.sin(a) * 240;
      const sx = W / 2 - ((sats.length - 1) / 2 - k) * -340, sy = 860;
      const x = lerp(ox, sx, dock), y = lerp(oy, sy, dock);
      return R("div", { key: k, style: { position: "absolute", left: x - 150, top: y - 44, width: 300, textAlign: "center", fontFamily: FH, fontSize: 52, color: theme.paper, background: k % 2 ? theme.accent : theme.accent2, borderRadius: 999, padding: "18px 0", opacity: seg(p, 0.1 + k * 0.05, 0.2 + k * 0.05), boxShadow: `0 16px 36px ${rgba(theme.ink, 0.16)}` } }, s);
    }),
    R("div", { style: { position: "absolute", left: 0, right: 0, top: 950, textAlign: "center", ...u.sub(theme, false, 34), margin: "0 auto", opacity: seg(p, 0.74, 0.86) } }, scene.sub || ""));
}

/* 46 — two words slam together like magnets, sparks on impact.  lf-kit.js:878-896 */
function Magnet({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, ease, clamp01, W, H, FH } = u;
  const e = ease.outQuint(seg(p, 0.1, 0.32));
  const hit = clamp01((seg(p, 0.28, 0.34) - seg(p, 0.5, 0.62)));
  return R("div", { style: { position: "absolute", inset: 0 } },
    R("div", { style: { position: "absolute", left: 0, right: 0, top: 430, display: "flex", justifyContent: "center", alignItems: "baseline" } },
      R("div", { style: { fontFamily: FH, fontSize: 210, color: theme.paper, transform: `translateX(${(1 - e) * -640}px)` } }, scene.left || ""),
      R("div", { style: { fontFamily: FH, fontSize: 210, color: theme.accent, transform: `translateX(${(1 - e) * 640}px)` } }, scene.right || "")),
    R("svg", { width: W, height: H, style: { position: "absolute", inset: 0 } },
      [0, 1, 2, 3, 4, 5].map((k) => {
        const a = (k / 6) * Math.PI * 2 + 0.5;
        const r = 120 + hit * 160;
        return R("g", { key: k, opacity: hit, transform: `translate(${W / 2 + Math.cos(a) * r},${540 + Math.sin(a) * r * 0.6})` },
          R("path", { d: "M -16 0 H 16 M 0 -16 V 16", stroke: k % 2 ? theme.accent2 : theme.paper, strokeWidth: 7, strokeLinecap: "round", transform: `rotate(${k * 30 + t * 60}) scale(${1 - hit * 0.4})` }));
      })),
    R("div", { style: { position: "absolute", left: 0, right: 0, top: 700, textAlign: "center", ...u.sub(theme, true, 42), margin: "0 auto", opacity: seg(p, 0.5, 0.64) } }, scene.sub || ""));
}

/* 53 — petals bloom open around the statement.  lf-kit.js:1000-1013 */
function Bloom({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, ease, rgba, PADX } = u;
  const e = ease.outBack(seg(p, 0.08, 0.4));
  return R("div", { style: { position: "absolute", inset: 0 } },
    R("svg", { width: 700, height: 700, style: { position: "absolute", right: PADX - 40, top: 190 } },
      [0, 1, 2, 3, 4, 5].map((k) => R("ellipse", { key: k, cx: 350, cy: 240, rx: 74, ry: 150, fill: k % 2 ? rgba(theme.accent, 0.85) : rgba(theme.accent2, 0.85), transform: `rotate(${k * 60 + Math.sin(t * 0.9) * 4} 350 350) scale(${e})`, style: { transformOrigin: "350px 350px" } })),
      R("circle", { cx: 350, cy: 350, r: 84 * e, fill: "#fdf7ec" }),
      R("circle", { cx: 350, cy: 350, r: 84 * e, fill: "none", stroke: rgba(theme.ink, 0.2), strokeWidth: 4 })),
    R("div", { style: { position: "absolute", left: PADX, top: 380, width: 980 } },
      R("div", { style: { ...u.ttl(theme, false, 124), opacity: seg(p, 0.14, 0.26), transform: `translateY(${(1 - ease.outQuint(seg(p, 0.14, 0.3))) * 60}px)` } }, scene.title || ""),
      R("div", { style: { ...u.sub(theme, false, 40), marginTop: 44, opacity: seg(p, 0.42, 0.56) } }, scene.sub || "")));
}

// ---- bucket 4 ----------------------------------------------------------------
/* 05 — split-flap word board cycling options.  lf-kit.js:177-196 */
function Flap({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, ease, clamp01, rgba, PADX, FH, FB } = u;
  const steps = scene.steps || ["BASIL", "MINT", "CHILLI"];
  const q = seg(p, 0.14, 0.86) * steps.length;
  const si = Math.min(steps.length - 1, Math.floor(q));
  const f = clamp01((q - si) * 3);
  const flip = ease.inOut(f > 0.5 ? 1 : f * 2);
  return R("div", { style: { position: "absolute", inset: 0 } },
    R("div", { style: { position: "absolute", left: PADX, top: 280 } },
      R("div", { style: { fontFamily: FB, fontWeight: 800, fontSize: 30, letterSpacing: "0.2em", color: rgba(theme.paper, 0.6), marginBottom: 40, opacity: seg(p, 0.02, 0.1) } }, scene.prefix || "WHAT IF YOU GREW"),
      R("div", { style: { display: "inline-block", perspective: 900 } },
        R("div", { style: { padding: "30px 60px", borderRadius: 20, background: "#2c2927", boxShadow: `inset 0 -4px 0 ${rgba("#000", 0.4)}, 0 26px 60px ${rgba("#000", 0.4)}`, transform: `rotateX(${(1 - flip) * -86}deg)`, transformOrigin: "center top" } },
          R("div", { style: { fontFamily: FH, fontSize: 190, color: theme.paper, lineHeight: 1 } }, steps[si]),
          R("div", { style: { position: "absolute", left: 0, right: 0, top: "50%", height: 3, background: rgba("#000", 0.5) } }))),
      R("div", { style: { ...u.sub(theme, true, 40), marginTop: 56, opacity: seg(p, 0.3, 0.44) } }, scene.sub || "")),
    R("div", { style: { position: "absolute", right: PADX, top: 320, display: "flex", flexDirection: "column", gap: 18 } },
      // THE ONE CSS CLOCK IN THE WHOLE KIT, REMOVED. lf-kit.js:194 carries
      // `transition: "color 0.2s"` here. In a live preview it softens the step list's colour as
      // the flap board advances; under a seeked renderer it is a SECOND clock running on wall
      // time, so a frame captured within 200ms of a step change is caught mid-fade and the same
      // timestamp yields different pixels depending on how the seek was reached. The colour is
      // already fully determined by `k === si`, so dropping the transition is lossless at every
      // settled frame and strictly more correct at every seeked one. Asserted absent by
      // scripts/test-lf-packs.js, which rejects a TIMED transition and permits `transition:none`.
      steps.map((s, k) => R("div", { key: k, style: { fontFamily: FB, fontWeight: 700, fontSize: 30, letterSpacing: "0.12em", color: k === si ? theme.accent : rgba(theme.paper, 0.3) } }, s))));
}

/* 15 — the ONE mid-film media scene: big landscape slot + side text.  lf-kit.js:347-361 */
function Peek({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, ease, clamp01, rgba, PADX, FB } = u;
  const e = ease.outQuint(seg(p, 0.1, 0.3));
  const lines = scene.lines || [];
  return R("div", { style: { position: "absolute", inset: 0 } },
    R("div", { style: { position: "absolute", left: PADX, top: 200, width: 560 } },
      R("div", { style: { ...u.ttl(theme, false, 96), opacity: seg(p, 0.02, 0.12) } }, scene.title || ""),
      lines.map((ln, k) => R("div", { key: k, style: { ...u.sub(theme, false, 34), marginTop: 30, opacity: seg(p, 0.3 + k * 0.1, 0.42 + k * 0.1), transform: `translateX(${(1 - ease.outCubic(seg(p, 0.3 + k * 0.1, 0.46 + k * 0.1))) * -80}px)` } }, ln))),
    R("div", { style: { position: "absolute", right: PADX - 20, top: 220, transform: `rotate(${1.6 + Math.sin(t * 0.8) * 0.5}deg) translateY(${(1 - e) * 320}px)`, opacity: clamp01(e * 1.6) } },
      R("div", { style: { background: "#fdf7ec", padding: 24, borderRadius: 34, boxShadow: `0 36px 80px ${rgba(theme.ink, 0.2)}` } },
        MediaSlot({ src: scene.image, theme, w: 980, h: 540, radius: 22, caption: scene.caption || "Desktop screenshot", u }),
        R("div", { style: { fontFamily: FB, fontWeight: 700, fontSize: 28, color: rgba(theme.ink, 0.6), textAlign: "center", marginTop: 20 } }, scene.caption || ""))));
}

/* 18 — tracking-in: letter-spacing collapses from very wide, rules expand.  lf-kit.js:401-413 */
function Sill({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, ease, clamp01, lerp, FH } = u;
  const e = ease.inOut(seg(p, 0.08, 0.5));
  const track = lerp(0.62, 0.02, e);
  return R("div", { style: { position: "absolute", left: 0, right: 0, top: 430, textAlign: "center" } },
    R("div", { style: { height: 6, width: `${e * 46}%`, background: theme.accent, margin: "0 auto 56px", borderRadius: 999 } }),
    R("div", { style: { fontFamily: FH, fontSize: 128, color: theme.ink, letterSpacing: track + "em", whiteSpace: "nowrap", opacity: clamp01(e * 3 + 0.15) } }, (scene.title || "").toUpperCase()),
    R("div", { style: { height: 6, width: `${e * 46}%`, background: theme.accent2, margin: "56px auto 0", borderRadius: 999 } }),
    R("div", { style: { ...u.sub(theme, false, 38), margin: "50px auto 0", opacity: seg(p, 0.55, 0.68) } }, scene.sub || ""));
}

/* 26 — breathing line: slow scale + tracking oscillation, orbiting seeds.  lf-kit.js:539-552 */
function Breathe({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, lerp, FH, W } = u;
  const br = Math.sin(t * 1.1) * 0.5 + 0.5;
  return R("div", { style: { position: "absolute", inset: 0 } },
    R("div", { style: { position: "absolute", left: 0, right: 0, top: 420, textAlign: "center" } },
      R("div", { style: { fontFamily: FH, fontSize: 140, color: theme.ink, letterSpacing: lerp(0.01, 0.06, br) + "em", transform: `scale(${lerp(0.97, 1.05, br)})`, opacity: seg(p, 0.05, 0.2) } }, scene.title || ""),
      R("div", { style: { ...u.sub(theme, false, 40), margin: "60px auto 0", opacity: seg(p, 0.4, 0.54) } }, scene.sub || "")),
    [0, 1, 2].map((k) => {
      const a = t * (0.5 + k * 0.16) + k * 2.1;
      return R("div", { key: k, style: { position: "absolute", left: W / 2 + Math.cos(a) * (560 + k * 60) - 10, top: 500 + Math.sin(a) * (200 + k * 30), width: 20 - k * 4, height: 28 - k * 5, borderRadius: 999, background: k % 2 ? theme.accent : theme.accent2, opacity: 0.7 } });
    }));
}

/* 32 — diagonal ribbons slide across in opposite directions, title pops between.  lf-kit.js:634-650 */
function Ribbons({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, ease, clamp01, rgba, FH, FB } = u;
  const mk = (txt, y, rot, dir, bg, c, k) => {
    const x = ((t * 180 * dir) % 1000) - (dir > 0 ? 1000 : 0);
    return R("div", { key: k, style: { position: "absolute", left: -300, right: -300, top: y, transform: `rotate(${rot}deg)`, opacity: seg(p, 0.04 + k * 0.1, 0.18 + k * 0.1) } },
      R("div", { style: { background: bg, padding: "20px 0", whiteSpace: "nowrap", overflow: "hidden" } },
        R("div", { style: { display: "inline-block", fontFamily: FB, fontWeight: 800, fontSize: 44, letterSpacing: "0.22em", color: c, transform: `translateX(${x}px)` } }, (txt + " ✳ ").repeat(10))));
  };
  const e = ease.outBack(seg(p, 0.26, 0.44));
  return R("div", { style: { position: "absolute", inset: 0 } },
    mk(scene.band1 || "", 200, -7, 1, theme.accent, theme.paper, 0),
    mk(scene.band2 || "", 800, 6, -1, theme.accent2, theme.paper, 1),
    R("div", { style: { position: "absolute", left: 0, right: 0, top: 430, textAlign: "center" } },
      R("div", { style: { display: "inline-block", fontFamily: FH, fontSize: 108, color: theme.ink, background: "#fdf7ec", padding: "24px 60px", borderRadius: 34, boxShadow: `0 30px 70px ${rgba(theme.ink, 0.18)}`, opacity: clamp01(e * 2), transform: `scale(${e}) rotate(${Math.sin(t * 0.9) * 1.2}deg)` } }, scene.title || "")));
}

/* 35 — circular rotating ring text + center word pop.  lf-kit.js:681-699 */
function Ring({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, ease, clamp01, rgba, splitLines, FH, FB, W, H } = u;
  const txt = (scene.ring || "FROM SEED TO SUPPER · ").repeat(2);
  const chars = txt.split("");
  const e = ease.outBack(seg(p, 0.28, 0.46));
  return R("div", { style: { position: "absolute", left: W / 2 - 380, top: H / 2 - 380, width: 760, height: 760 } },
    R("svg", { width: 760, height: 760 },
      R("circle", { cx: 380, cy: 380, r: 296, fill: "none", stroke: rgba(theme.accent2, 0.4), strokeWidth: 3, strokeDasharray: 1860, strokeDashoffset: 1860 * (1 - seg(p, 0.04, 0.3)) }),
      R("g", { transform: `rotate(${t * 16} 380 380)` },
        chars.map((ch, k) => {
          const a = (k / chars.length) * 360;
          return R("text", { key: k, x: 380, y: 42, textAnchor: "middle", fontFamily: FB, fontWeight: 800, fontSize: 30, letterSpacing: "0.1em", fill: theme.ink, opacity: seg(p, 0.04 + k * 0.004, 0.1 + k * 0.004), transform: `rotate(${a} 380 380)` }, ch);
        }))),
    R("div", { style: { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" } },
      R("div", { style: { fontFamily: FH, fontSize: 130, color: theme.accent, textAlign: "center", lineHeight: 1.05, opacity: clamp01(e * 2), transform: `scale(${e})` } }, splitLines(scene.title || "").map((l, k) => R("div", { key: k }, l)))));
}

/* 37 — pricing rows slide in, prices count, middle row gets a wiggling badge.  lf-kit.js:714-733 */
function Plans({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, ease, clamp01, rgba, PADX, FH, FB } = u;
  const plans = scene.plans || [];
  return R("div", { style: { position: "absolute", inset: 0 } },
    R("div", { style: { position: "absolute", left: PADX, top: 170 } },
      R("div", { style: { ...u.ttl(theme, false, 100), opacity: seg(p, 0.02, 0.1) } }, scene.title || "")),
    R("div", { style: { position: "absolute", left: PADX, right: PADX, top: 360 } },
      plans.map((pl, k) => {
        const e = ease.outQuint(seg(p, 0.1 + k * 0.14, 0.3 + k * 0.14));
        const price = Math.round(pl.price * ease.outCubic(seg(p, 0.16 + k * 0.14, 0.44 + k * 0.14)));
        const mid = k === 1;
        return R("div", { key: k, style: { display: "flex", alignItems: "center", gap: 44, padding: "34px 50px", borderRadius: 28, marginBottom: 26, background: mid ? theme.accent : "#fdf7ec", boxShadow: `0 22px 50px ${rgba(theme.ink, mid ? 0.22 : 0.1)}`, opacity: clamp01(e * 1.6), transform: `translateX(${(1 - e) * (k % 2 ? 400 : -400)}px) scale(${mid ? 1.02 : 1})` } },
          R("div", { style: { fontFamily: FH, fontSize: 60, color: mid ? theme.paper : theme.ink, width: 420 } }, pl.name),
          R("div", { style: { fontFamily: FB, fontWeight: 600, fontSize: 32, color: mid ? rgba(theme.paper, 0.85) : rgba(theme.ink, 0.6), flex: 1 } }, pl.blurb),
          mid ? R("div", { style: { fontFamily: FB, fontWeight: 800, fontSize: 22, letterSpacing: "0.1em", background: theme.paper, color: theme.accent, borderRadius: 999, padding: "10px 24px", transform: `rotate(${Math.sin(t * 2.4) * 3}deg)` } }, scene.badge || "MOST PICKED") : null,
          R("div", { style: { fontFamily: FH, fontSize: 84, color: mid ? theme.paper : theme.accent, fontVariantNumeric: "tabular-nums" } }, "$" + price));
      })));
}

/* 42 — venetian slats: the headline assembles from horizontal blinds.  lf-kit.js:810-825 */
function Blink({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, ease, fitSize, PADX, COLW, FH } = u;
  const title = scene.title || "";
  const size = fitSize(title, 150, COLW);
  const SL = 8, slatH = Math.ceil(size * 1.16 / SL);
  return R("div", { style: { position: "absolute", left: PADX, top: 420 } },
    Array.from({ length: SL }).map((_, k) => {
      const e = ease.outQuint(seg(p, 0.06 + k * 0.045, 0.24 + k * 0.045));
      return R("div", { key: k, style: { overflow: "hidden", height: slatH, transform: `scaleX(${e})`, transformOrigin: k % 2 ? "left center" : "right center" } },
        R("div", { style: { fontFamily: FH, fontSize: size, lineHeight: 1.16, color: theme.paper, whiteSpace: "nowrap", transform: `translateY(${-k * slatH}px)` } }, title));
    }),
    R("div", { style: { ...u.sub(theme, true, 40), marginTop: 46, opacity: seg(p, 0.5, 0.64) } }, scene.sub || ""));
}

/* 57 — a gauge needle sweeps from doubt to certainty.  lf-kit.js:1066-1084 */
function Gauge({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, ease, lerp, rgba, PADX, W, FB } = u;
  const eN = ease.outBack(seg(p, 0.2, 0.6));
  const ang = lerp(-78, 64, eN) + Math.sin(t * 1.4) * 1.5;
  return R("div", { style: { position: "absolute", inset: 0 } },
    R("div", { style: { position: "absolute", left: PADX, top: 200, ...u.ttl(theme, false, 100), opacity: seg(p, 0.02, 0.1) } }, scene.title || ""),
    R("svg", { width: 1100, height: 560, style: { position: "absolute", left: (W - 1100) / 2, top: 380 } },
      R("path", { d: "M 110 520 A 440 440 0 0 1 990 520", fill: "none", stroke: rgba(theme.ink, 0.14), strokeWidth: 54, strokeLinecap: "round" }),
      R("path", { d: "M 110 520 A 440 440 0 0 1 990 520", fill: "none", stroke: theme.accent2, strokeWidth: 54, strokeLinecap: "round", strokeDasharray: 1382, strokeDashoffset: 1382 * (1 - eN * 0.82) }),
      [0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => R("line", { key: k, x1: 550, y1: 150, x2: 550, y2: 110, stroke: rgba(theme.ink, 0.4), strokeWidth: 6, strokeLinecap: "round", transform: `rotate(${-80 + k * 20} 550 520)` })),
      R("g", { transform: `rotate(${ang} 550 520)` },
        R("line", { x1: 550, y1: 520, x2: 550, y2: 170, stroke: theme.accent, strokeWidth: 16, strokeLinecap: "round" }),
        R("circle", { cx: 550, cy: 520, r: 34, fill: theme.ink })),
      R("text", { x: 150, y: 500, fontFamily: FB, fontWeight: 700, fontSize: 32, fill: rgba(theme.ink, 0.55) }, scene.lo || ""),
      R("text", { x: 950, y: 500, textAnchor: "end", fontFamily: FB, fontWeight: 700, fontSize: 32, fill: rgba(theme.ink, 0.55) }, scene.hi || "")),
    R("div", { style: { position: "absolute", left: 0, right: 0, top: 960, textAlign: "center", ...u.sub(theme, false, 36), margin: "0 auto", opacity: seg(p, 0.6, 0.74) } }, scene.sub || ""));
}

/* 58 — accordion: lines unfold downward on rotateX hinges.  lf-kit.js:1085-1097 */
function Accordion({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, ease, clamp01, rgba, PADX, FH } = u;
  const lines = scene.lines || [];
  return R("div", { style: { position: "absolute", inset: 0 } },
    R("div", { style: { position: "absolute", left: PADX, top: 190, ...u.ttl(theme, false, 100), opacity: seg(p, 0.02, 0.1) } }, scene.title || ""),
    R("div", { style: { position: "absolute", left: PADX, top: 370, perspective: 1400, width: 1300 } },
      lines.map((ln, k) => {
        const e = ease.outQuint(seg(p, 0.1 + k * 0.13, 0.32 + k * 0.13));
        return R("div", { key: k, style: { background: k % 2 ? "#fdf7ec" : rgba(theme.accent2, 0.22), borderRadius: 18, padding: "26px 46px", marginBottom: 16, fontFamily: FH, fontSize: 60, color: theme.ink, opacity: clamp01(e * 1.4), transform: `rotateX(${(1 - e) * -86}deg)`, transformOrigin: "center top", boxShadow: `0 14px 30px ${rgba(theme.ink, 0.08)}` } }, ln);
      })));
}

// ---- bucket 5 ----------------------------------------------------------------
/* 04 — typewriter on a tilted note card, caret blinks, underline draws.  lf-kit.js:162-176 */
function Note({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, rgba, PADX, FH, FB } = u;
  const txt = scene.text || "";
  const n = Math.floor(seg(p, 0.08, 0.62) * txt.length);
  return R("div", { style: { position: "absolute", left: PADX + 60, top: 260, width: 1440, background: "#fdf7ec", borderRadius: 26, padding: "80px 90px", boxShadow: `0 30px 70px ${rgba(theme.ink, 0.16)}`, transform: `rotate(${-1.4 + Math.sin(t * 0.7) * 0.4}deg)` } },
    R("div", { style: { fontFamily: FB, fontWeight: 700, fontSize: 26, letterSpacing: "0.16em", color: rgba(theme.ink, 0.45), marginBottom: 36 } }, scene.kicker || "PINNED TO THE FRIDGE"),
    R("div", { style: { fontFamily: FH, fontSize: 78, lineHeight: 1.24, color: theme.ink, minHeight: 300 } },
      txt.slice(0, n),
      R("span", { style: { display: "inline-block", width: 8, height: 66, background: theme.accent, marginLeft: 10, verticalAlign: "-6px", opacity: Math.sin(t * 7) > 0 ? 1 : 0 } })),
    R("div", { style: { height: 8, borderRadius: 999, background: theme.accent2, transform: `scaleX(${seg(p, 0.66, 0.8)})`, transformOrigin: "left", marginTop: 30 } }),
    R("div", { style: { fontFamily: FB, fontWeight: 600, fontSize: 30, color: rgba(theme.ink, 0.55), marginTop: 26, opacity: seg(p, 0.72, 0.82) } }, scene.sign || ""));
}

/* 09 — numbered creed: circles pop, rules draw, lines slide.  lf-kit.js:245-261 */
function Creed({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, ease, clamp01, PADX, FH } = u;
  const items = scene.items || [];
  return R("div", { style: { position: "absolute", inset: 0 } },
    R("div", { style: { position: "absolute", left: PADX, top: 180 } },
      R("div", { style: { ...u.ttl(theme, false, 100), opacity: seg(p, 0.02, 0.1) } }, scene.title || "")),
    R("div", { style: { position: "absolute", left: PADX, right: PADX, top: 370 } },
      items.map((it, k) => {
        const e = ease.outBack(seg(p, 0.12 + k * 0.13, 0.3 + k * 0.13));
        const e2 = ease.outQuint(seg(p, 0.16 + k * 0.13, 0.36 + k * 0.13));
        return R("div", { key: k, style: { display: "flex", alignItems: "center", gap: 40, marginBottom: 38 } },
          R("div", { style: { width: 92, height: 92, borderRadius: 999, background: k % 2 ? theme.accent2 : theme.accent, color: theme.paper, fontFamily: FH, fontSize: 44, display: "flex", alignItems: "center", justifyContent: "center", flex: "none", transform: `scale(${e}) rotate(${(1 - e) * 90}deg)` } }, k + 1),
          R("div", { style: { fontFamily: FH, fontSize: 62, color: theme.ink, opacity: clamp01(e2 * 2), transform: `translateX(${(1 - e2) * 260}px)` } }, it));
      })));
}

/* 16 — skew slam with impact shake + burst lines.  lf-kit.js:362-381 */
function NoGarden({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, ease, clamp01, rgba, splitLines, W, H, FH } = u;
  const lines = splitLines(scene.title || "");
  return R("div", { style: { position: "absolute", inset: 0 } },
    R("svg", { width: W, height: H, style: { position: "absolute", inset: 0 } },
      Array.from({ length: 10 }).map((_, k) => {
        const e = ease.outQuint(seg(p, 0.16, 0.3));
        const a = k * Math.PI / 5;
        return R("line", { key: k, x1: W / 2 + Math.cos(a) * 320 * e, y1: H / 2 + Math.sin(a) * 220 * e, x2: W / 2 + Math.cos(a) * (320 + 140 * (1 - e)) * e, y2: H / 2 + Math.sin(a) * (220 + 100 * (1 - e)) * e, stroke: rgba(theme.accent, (1 - e) * 0.9), strokeWidth: 8, strokeLinecap: "round" });
      })),
    R("div", { style: { position: "absolute", left: 0, right: 0, top: 340, textAlign: "center" } },
      lines.map((ln, k) => {
        const e = ease.outQuint(seg(p, 0.06 + k * 0.14, 0.2 + k * 0.14));
        const shake = (1 - seg(p, 0.2 + k * 0.14, 0.5 + k * 0.14)) * Math.sin(t * 30 + k) * 6;
        return R("div", { key: k, style: { fontFamily: FH, fontSize: 176, lineHeight: 1.04, color: k % 2 ? theme.accent : theme.paper, opacity: clamp01(e * 2), transform: `skewX(${(1 - e) * -14}deg) translateX(${(1 - e) * 500 + shake}px)` } }, ln);
      }),
      R("div", { style: { ...u.sub(theme, true, 40), margin: "50px auto 0", textAlign: "center", opacity: seg(p, 0.5, 0.64) } }, scene.sub || "")));
}

/* 20 — odometer: number column rolls through the weeks, captions crossfade.  lf-kit.js:438-455 */
function Weeks({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, ease, clamp01, rgba, PADX, FH } = u;
  const steps = scene.steps || [];
  const q = seg(p, 0.1, 0.85) * (steps.length - 1);
  const si = Math.min(steps.length - 1, Math.floor(q));
  const f = ease.inOut(clamp01((q - si) * 2.2));
  const DIGIT_H = 300;
  return R("div", { style: { position: "absolute", inset: 0 } },
    R("div", { style: { position: "absolute", left: PADX, top: 340, display: "flex", alignItems: "center", gap: 70 } },
      R("div", { style: { fontFamily: FH, fontSize: 110, color: theme.ink, opacity: seg(p, 0.02, 0.12) } }, scene.prefix || "WEEK"),
      R("div", { style: { height: DIGIT_H, overflow: "hidden", borderRadius: 30, background: "#fdf7ec", boxShadow: `inset 0 10px 30px ${rgba(theme.ink, 0.12)}`, padding: "0 50px" } },
        R("div", { style: { transform: `translateY(${-(si + f) * DIGIT_H}px)` } },
          steps.map((s, k) => R("div", { key: k, style: { height: DIGIT_H, display: "flex", alignItems: "center", fontFamily: FH, fontSize: 220, color: theme.accent, fontVariantNumeric: "tabular-nums" } }, s.n))))),
    R("div", { style: { position: "absolute", left: PADX, right: PADX, top: 740, height: 200 } },
      steps.map((s, k) => R("div", { key: k, style: { position: "absolute", left: 0, width: "100%", ...u.sub(theme, false, 46), maxWidth: 1500, opacity: k === si ? 1 - f * (si < steps.length - 1 ? 1 : 0) : (k === si + 1 ? f : 0) } }, s.label))));
}

/* 22 — three marquee bands crossing at different speeds and directions.  lf-kit.js:470-485 */
function Rows({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, rgba, PADX, FH } = u;
  const rows = scene.rows || [];
  const cfg = [{ y: 260, dir: 1, sp: 200, bg: theme.accent, c: theme.paper, tilt: -2 }, { y: 480, dir: -1, sp: 260, bg: "#fdf7ec", c: theme.ink, tilt: 1.5 }, { y: 700, dir: 1, sp: 160, bg: theme.accent2, c: theme.paper, tilt: -1 }];
  return R("div", { style: { position: "absolute", inset: 0 } },
    cfg.map((c, k) => {
      const txt = ((rows[k] || "") + " · ").repeat(8);
      const x = ((t * c.sp * c.dir) % 1200) - (c.dir > 0 ? 1200 : 0);
      return R("div", { key: k, style: { position: "absolute", left: -200, right: -200, top: c.y, transform: `rotate(${c.tilt}deg)`, opacity: seg(p, 0.04 + k * 0.08, 0.16 + k * 0.08) } },
        R("div", { style: { background: c.bg, padding: "26px 0", boxShadow: `0 20px 50px ${rgba(theme.ink, 0.12)}`, overflow: "hidden", whiteSpace: "nowrap" } },
          R("div", { style: { display: "inline-block", fontFamily: FH, fontSize: 78, color: c.c, transform: `translateX(${x}px)` } }, txt)));
    }),
    R("div", { style: { position: "absolute", left: PADX, top: 880, ...u.sub(theme, false, 38), opacity: seg(p, 0.5, 0.64) } }, scene.sub || ""));
}

/* 27 — question types out, answer slams huge, follow-up settles.  lf-kit.js:553-565 */
function QA({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, ease, clamp01, lerp, rgba, PADX, FH, FB } = u;
  const q = scene.q || "";
  const n = Math.floor(seg(p, 0.04, 0.3) * q.length);
  const slam = ease.outQuint(seg(p, 0.36, 0.48));
  return R("div", { style: { position: "absolute", left: PADX, top: 280 } },
    R("div", { style: { fontFamily: FB, fontWeight: 700, fontSize: 56, color: rgba(theme.paper, 0.75), minHeight: 80 } }, q.slice(0, n), n < q.length ? R("span", { style: { opacity: Math.sin(t * 8) > 0 ? 1 : 0 } }, "|") : null),
    R("div", { style: { fontFamily: FH, fontSize: 330, lineHeight: 0.95, color: theme.accent, marginTop: 40, opacity: clamp01(slam * 2), transform: `scale(${lerp(2.6, 1, slam)}) rotate(${(1 - slam) * -6}deg)`, transformOrigin: "left center" } }, scene.a || "NO."),
    R("div", { style: { ...u.sub(theme, true, 42), marginTop: 50, opacity: seg(p, 0.58, 0.7), transform: `translateY(${(1 - ease.outCubic(seg(p, 0.58, 0.74))) * 40}px)` } }, scene.sub || ""));
}

/* 44 — sliced headline: halves slide in from opposite sides, seam flashes.  lf-kit.js:841-859 */
function Slice({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, ease, clamp01, fitSize, PADX, COLW, FH } = u;
  const title = scene.title || "";
  const size = fitSize(title, 168, COLW);
  const hh = Math.ceil(size * 0.58);
  const e = ease.outQuint(seg(p, 0.08, 0.32));
  const off = (1 - e) * 460;
  const flash = seg(p, 0.32, 0.38) * (1 - seg(p, 0.46, 0.58));
  return R("div", { style: { position: "absolute", left: PADX, top: 420, opacity: clamp01(e * 3) } },
    R("div", { style: { overflow: "hidden", height: hh } },
      R("div", { style: { fontFamily: FH, fontSize: size, lineHeight: 1.16, color: theme.paper, whiteSpace: "nowrap", transform: `translateX(${-off}px)` } }, title)),
    R("div", { style: { height: 6, background: theme.accent, opacity: flash, borderRadius: 999 } }),
    R("div", { style: { overflow: "hidden", height: hh } },
      R("div", { style: { fontFamily: FH, fontSize: size, lineHeight: 1.16, color: theme.paper, whiteSpace: "nowrap", transform: `translate(${off}px, ${-hh - 6}px)` } }, title)),
    R("div", { style: { ...u.sub(theme, true, 40), marginTop: 40, opacity: seg(p, 0.5, 0.64) } }, scene.sub || ""));
}

/* 47 — calendar pages tear off and fly away.  lf-kit.js:897-916 */
function TearOff({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, clamp01, rgba, PADX, FH, FB } = u;
  const months = scene.months || [];
  const q = seg(p, 0.12, 0.82) * (months.length - 1);
  const si = Math.min(months.length - 1, Math.floor(q));
  const f = clamp01((q - si) * 2.4);
  return R("div", { style: { position: "absolute", inset: 0 } },
    R("div", { style: { position: "absolute", left: PADX, top: 210, width: 700 } },
      R("div", { style: { ...u.ttl(theme, false, 96), opacity: seg(p, 0.02, 0.1) } }, scene.title || ""),
      R("div", { style: { ...u.sub(theme, false, 38), marginTop: 40, opacity: seg(p, 0.3, 0.44) } }, scene.sub || "")),
    R("div", { style: { position: "absolute", right: PADX + 40, top: 250 } },
      [2, 1].map((d) => (si + d < months.length) ? R("div", { key: d, style: { position: "absolute", left: d * 14, top: d * 14, width: 620, height: 520, borderRadius: 30, background: "#fdf7ec", boxShadow: `0 20px 50px ${rgba(theme.ink, 0.1)}` } }) : null),
      (si + 1 < months.length) ? R("div", { style: { position: "absolute", left: 0, top: 0, width: 620, height: 520, borderRadius: 30, background: "#fdf7ec", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FH, fontSize: 120, color: theme.ink } }, months[si + 1]) : null,
      R("div", { style: { position: "relative", width: 620, height: 520, borderRadius: 30, background: "#fdf7ec", boxShadow: `0 30px 66px ${rgba(theme.ink, 0.18)}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", transform: `translate(${f * 720}px, ${f * -340}px) rotate(${f * 34}deg)`, opacity: 1 - f * 0.9 } },
        R("div", { style: { position: "absolute", top: 34, display: "flex", gap: 240 } }, [0, 1].map((h) => R("div", { key: h, style: { width: 26, height: 26, borderRadius: 999, background: theme.sageT, border: `4px solid ${rgba(theme.ink, 0.3)}` } }))),
        R("div", { style: { fontFamily: FH, fontSize: 120, color: theme.ink } }, months[si] || ""),
        R("div", { style: { fontFamily: FB, fontWeight: 700, fontSize: 30, color: theme.accent, letterSpacing: "0.14em" } }, scene.stampline || "SOW AGAIN"))));
}

/* 59 — barn doors part to reveal the stacked reveal.  lf-kit.js:1098-1112 */
function Doors({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, ease, lerp, rgba, FH, FB } = u;
  const open = ease.inOut(seg(p, 0.14, 0.44));
  const lines = scene.lines || [];
  return R("div", { style: { position: "absolute", inset: 0 } },
    R("div", { style: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" } },
      R("div", { style: { fontFamily: FH, fontSize: 170, color: theme.ink, opacity: seg(p, 0.3, 0.42), transform: `scale(${lerp(0.86, 1, ease.outBack(seg(p, 0.3, 0.5)))})` } }, scene.title || ""),
      lines.map((ln, k) => R("div", { key: k, style: { fontFamily: FB, fontWeight: 600, fontSize: 42, color: rgba(theme.ink, 0.75), marginTop: k === 0 ? 50 : 18, opacity: seg(p, 0.46 + k * 0.09, 0.58 + k * 0.09), transform: `translateY(${(1 - ease.outCubic(seg(p, 0.46 + k * 0.09, 0.62 + k * 0.09))) * 30}px)` } }, ln))),
    R("div", { style: { position: "absolute", top: 0, bottom: 0, left: 0, width: "50%", background: theme.accent2, transform: `translateX(${-open * 102}%)`, boxShadow: `10px 0 40px ${rgba(theme.ink, 0.2)}` } },
      R("div", { style: { position: "absolute", right: 44, top: "48%", width: 26, height: 90, borderRadius: 999, background: rgba("#f5ead8", 0.8) } })),
    R("div", { style: { position: "absolute", top: 0, bottom: 0, right: 0, width: "50%", background: theme.accent, transform: `translateX(${open * 102}%)`, boxShadow: `-10px 0 40px ${rgba(theme.ink, 0.2)}` } },
      R("div", { style: { position: "absolute", left: 44, top: "48%", width: 26, height: 90, borderRadius: 999, background: rgba("#f5ead8", 0.8) } })));
}

/* 60 — one word zooms straight past the camera.  lf-kit.js:1113-1125 */
function ZoomThrough({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, ease, clamp01, PADX, FH } = u;
  const z = seg(p, 0.06, 0.5);
  const scale2 = 0.4 + Math.pow(z, 2) * 17;
  return R("div", { style: { position: "absolute", inset: 0 } },
    R("div", { style: { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" } },
      R("div", { style: { fontFamily: FH, fontSize: 120, color: theme.accent, transform: `scale(${scale2}) rotate(${z * 4}deg)`, opacity: (1 - seg(p, 0.42, 0.5)) * clamp01(z * 8 + 0.2), whiteSpace: "nowrap" } }, scene.word || "")),
    R("div", { style: { position: "absolute", left: PADX, top: 430, opacity: seg(p, 0.5, 0.62) } },
      R("div", { style: { ...u.ttl(theme, false, 116), transform: `translateY(${(1 - ease.outQuint(seg(p, 0.5, 0.66))) * 60}px)` } }, scene.title || ""),
      R("div", { style: { ...u.sub(theme, false, 42), marginTop: 44, opacity: seg(p, 0.64, 0.78) } }, scene.sub || "")));
}

// ---- bucket 6 ----------------------------------------------------------------
/* 07 — three counters roll up at different speeds with growing bars.  lf-kit.js:214-232 */
function Counts({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, ease, rgba, PADX, FH, FB } = u;
  const stats = scene.stats || [];
  const cols = [theme.accent, theme.accent2, theme.ink];
  return R("div", { style: { position: "absolute", inset: 0 } },
    R("div", { style: { position: "absolute", left: PADX, top: 220 } },
      R("div", { style: { ...u.ttl(theme, false, 108), opacity: seg(p, 0.02, 0.12), transform: `translateX(${(1 - ease.outQuint(seg(p, 0.02, 0.16))) * -120}px)` } }, scene.title || "")),
    R("div", { style: { position: "absolute", left: PADX, right: PADX, top: 430, display: "flex", gap: 70 } },
      stats.slice(0, 3).map((st, k) => {
        const e = ease.outCubic(seg(p, 0.14 + k * 0.14, 0.5 + k * 0.14));
        const v = Math.round(st.to * e);
        return R("div", { key: k, style: { flex: 1, opacity: seg(p, 0.12 + k * 0.14, 0.2 + k * 0.14) } },
          R("div", { style: { fontFamily: FH, fontSize: 200, lineHeight: 0.9, color: cols[k], fontVariantNumeric: "tabular-nums", transform: `translateY(${(1 - e) * 60}px)` } }, v.toLocaleString(), R("span", { style: { fontSize: 90 } }, st.suffix || "")),
          R("div", { style: { height: 12, borderRadius: 999, background: cols[k], transform: `scaleX(${e})`, transformOrigin: "left", margin: "34px 0" } }),
          R("div", { style: { fontFamily: FB, fontWeight: 600, fontSize: 32, lineHeight: 1.35, color: rgba(theme.ink, 0.7) } }, st.label));
      })));
}

/* 08 — letters ride a sine wave that calms to flat.  lf-kit.js:233-244 */
function Wave({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, ease, fitSize, PADX, COLW, FH } = u;
  const title = (scene.title || "").toUpperCase();
  const size = fitSize(title, 150, COLW);
  const amp = (1 - ease.inOut(seg(p, 0.25, 0.7))) * 60 + 4;
  return R("div", { style: { position: "absolute", left: PADX, top: 440, whiteSpace: "nowrap" } },
    title.split("").map((ch, k) => R("span", { key: k, style: { display: "inline-block", fontFamily: FH, fontSize: size, color: theme.ink, opacity: seg(p, 0.03 + k * 0.012, 0.1 + k * 0.012), transform: `translateY(${Math.sin(t * 2.4 + k * 0.55) * amp}px) rotate(${Math.sin(t * 2.4 + k * 0.55) * amp * 0.1}deg)`, minWidth: ch === " " ? "0.4em" : 0 } }, ch)),
    R("div", { style: { ...u.sub(theme, false, 40), marginTop: 70, opacity: seg(p, 0.55, 0.68) } }, scene.sub || ""));
}

/* 11 — chapter card: giant number + title revealed by sliding shutter windows.  lf-kit.js:281-295 */
function Kit({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, ease, rgba, PADX, FH } = u;
  const rise = ease.outQuint(seg(p, 0.12, 0.34));
  return R("div", { style: { position: "absolute", inset: 0 } },
    R("div", { style: { position: "absolute", left: PADX, top: 250 } },
      R("div", { style: { fontFamily: FH, fontSize: 420, lineHeight: 0.9, color: "transparent", WebkitTextStroke: `3px ${rgba(theme.paper, 0.5)}`, opacity: seg(p, 0.02, 0.12) } }, scene.num || "01"),
      R("div", { style: { overflow: "hidden", marginTop: -60 } },
        R("div", { style: { fontFamily: FH, fontSize: 170, color: theme.paper, transform: `translateY(${(1 - rise) * 110}%)` } }, scene.title || "")),
      R("div", { style: { overflow: "hidden" } },
        R("div", { style: { ...u.sub(theme, true, 42), marginTop: 26, transform: `translateY(${(1 - ease.outQuint(seg(p, 0.24, 0.44))) * 130}%)` } }, scene.sub || ""))),
    R("div", { style: { position: "absolute", right: PADX, top: 300, width: 200, height: 200, borderRadius: 999, border: `4px solid ${rgba(theme.paper, 0.5)}`, transform: `rotate(${t * 24}deg)` } },
      R("div", { style: { position: "absolute", top: -9, left: "50%", width: 18, height: 18, borderRadius: 999, background: theme.paper } })));
}

/* 14 — word cards flip in on rotateY, each its own tint, bobbing after.  lf-kit.js:330-346 */
function Cards({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, ease, clamp01, rgba, PADX, FH } = u;
  const ws = scene.words || [];
  const tints = [theme.accent, theme.accent2, theme.ink, "#a8845c"];
  return R("div", { style: { position: "absolute", inset: 0 } },
    R("div", { style: { position: "absolute", left: PADX, top: 200 } },
      R("div", { style: { ...u.ttl(theme, false, 96), opacity: seg(p, 0.02, 0.1) } }, scene.title || "")),
    R("div", { style: { position: "absolute", left: PADX, right: PADX, top: 420, display: "flex", gap: 44, perspective: 1200 } },
      ws.map((wd, k) => {
        const e = ease.outQuint(seg(p, 0.1 + k * 0.12, 0.32 + k * 0.12));
        return R("div", { key: k, style: { flex: 1, height: 380, borderRadius: 30, background: tints[k % 4], display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 30px 60px ${rgba(theme.ink, 0.2)}`, opacity: clamp01(e * 1.5), transform: `rotateY(${(1 - e) * 92}deg) translateY(${Math.sin(t * 1.3 + k) * 8}px)` } },
          R("div", { style: { fontFamily: FH, fontSize: 72, color: theme.paper } }, wd));
      })),
    R("div", { style: { position: "absolute", left: PADX, top: 860, ...u.sub(theme, false, 36), opacity: seg(p, 0.6, 0.72) } }, scene.sub || ""));
}

/* 21 — giant quote marks draw, lines fade up, attribution slides.  lf-kit.js:456-469 */
function Quote({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, ease, rgba, splitLines, PADX, FH, FB } = u;
  const lines = splitLines(scene.text || "");
  return R("div", { style: { position: "absolute", inset: 0 } },
    R("svg", { width: 260, height: 220, style: { position: "absolute", left: PADX - 20, top: 190 } },
      R("path", { d: "M 40 170 Q 20 120 40 70 Q 60 20 120 20 M 150 170 Q 130 120 150 70 Q 170 20 230 20", fill: "none", stroke: theme.accent, strokeWidth: 26, strokeLinecap: "round", strokeDasharray: 560, strokeDashoffset: 560 * (1 - seg(p, 0.04, 0.24)) })),
    R("div", { style: { position: "absolute", left: PADX + 40, right: PADX, top: 400 } },
      lines.map((ln, k) => R("div", { key: k, style: { fontFamily: FH, fontSize: 92, lineHeight: 1.2, color: theme.ink, opacity: seg(p, 0.18 + k * 0.12, 0.32 + k * 0.12), transform: `translateY(${(1 - ease.outCubic(seg(p, 0.18 + k * 0.12, 0.36 + k * 0.12))) * 46}px)` } }, ln)),
      R("div", { style: { display: "flex", alignItems: "center", gap: 24, marginTop: 56, opacity: seg(p, 0.6, 0.72), transform: `translateX(${(1 - ease.outQuint(seg(p, 0.6, 0.76))) * 200}px)` } },
        R("div", { style: { width: 90, height: 6, background: theme.accent2, borderRadius: 999 } }),
        R("div", { style: { fontFamily: FB, fontWeight: 700, fontSize: 36, color: rgba(theme.ink, 0.65) } }, scene.by || ""))));
}

/* 24 — pendulum words tick left-right from a top pivot, metronome arm.  lf-kit.js:500-519 */
function Metronome({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, PADX, FH } = u;
  const ws = scene.words || [];
  const beatN = Math.floor(seg(p, 0.1, 0.9) * 8);
  const cur = ws[beatN % ws.length] || "";
  const swing = Math.sin(t * 2.6) * 24;
  return R("div", { style: { position: "absolute", inset: 0 } },
    R("svg", { width: 420, height: 560, style: { position: "absolute", right: PADX, top: 240 } },
      R("polygon", { points: "210,40 340,520 80,520", fill: "#fdf7ec", stroke: theme.ink, strokeWidth: 5 }),
      R("g", { transform: `rotate(${swing} 210 470)` },
        R("line", { x1: 210, y1: 470, x2: 210, y2: 120, stroke: theme.accent, strokeWidth: 12, strokeLinecap: "round" }),
        R("circle", { cx: 210, cy: 200, r: 26, fill: theme.accent2 })),
      R("circle", { cx: 210, cy: 470, r: 16, fill: theme.ink })),
    R("div", { style: { position: "absolute", left: PADX, top: 300 } },
      R("div", { style: { ...u.ttl(theme, false, 96), opacity: seg(p, 0.02, 0.1), marginBottom: 70 } }, scene.title || ""),
      R("div", { style: { fontFamily: FH, fontSize: 190, lineHeight: 1, color: beatN % 2 ? theme.accent2 : theme.accent, transformOrigin: "center top", transform: `rotate(${swing * 0.25}deg) scale(${1 + Math.abs(Math.sin(t * 2.6)) * 0.04})` } }, cur),
      R("div", { style: { ...u.sub(theme, false, 38), marginTop: 60, opacity: seg(p, 0.5, 0.64) } }, scene.sub || "")));
}

/* 25 — word grid cells light up in sequence, keepers stay lit.  lf-kit.js:520-538 */
function Grid({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, rgba, PADX, FH } = u;
  const ws = scene.words || [];
  const lit = Math.floor(seg(p, 0.08, 0.7) * ws.length);
  const keep = scene.keep || [];
  return R("div", { style: { position: "absolute", inset: 0 } },
    R("div", { style: { position: "absolute", left: PADX, top: 170 } },
      R("div", { style: { ...u.ttl(theme, false, 96), opacity: seg(p, 0.02, 0.1) } }, scene.title || "")),
    R("div", { style: { position: "absolute", left: PADX, right: PADX, top: 360, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 26 } },
      ws.map((wd, k) => {
        const on = k < lit;
        const keeper = keep.includes(wd);
        const active = on && (keeper || k === lit - 1);
        return R("div", { key: k, style: { padding: "38px 20px", borderRadius: 24, textAlign: "center", fontFamily: FH, fontSize: 46, background: active ? (keeper ? theme.accent : "#fdf7ec") : rgba("#fdf7ec", 0.4), color: active && keeper ? theme.paper : rgba(theme.ink, on ? 0.9 : 0.35), transform: `scale(${on ? 1 : 0.94})`, boxShadow: active ? `0 18px 40px ${rgba(theme.ink, 0.14)}` : "none" } }, wd);
      })),
    R("div", { style: { position: "absolute", left: PADX, top: 900, ...u.sub(theme, false, 36), opacity: seg(p, 0.72, 0.84) } }, scene.sub || ""));
}

/* 31 — strikethrough rewrite: old line struck out, new word stamps over.  lf-kit.js:618-633 */
function Rewrite({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, ease, clamp01, lerp, rgba, PADX, FH } = u;
  const strike = ease.inOut(seg(p, 0.22, 0.4));
  const stamp = ease.outBack(seg(p, 0.46, 0.6));
  return R("div", { style: { position: "absolute", left: PADX, top: 380 } },
    R("div", { style: { position: "relative", display: "inline-block", opacity: seg(p, 0.04, 0.14) } },
      R("div", { style: { fontFamily: FH, fontSize: 150, color: rgba(theme.ink, lerp(1, 0.4, strike)) } }, scene.old || ""),
      R("div", { style: { position: "absolute", left: "-2%", top: "52%", width: "104%", height: 14, borderRadius: 999, background: theme.accent, transform: `scaleX(${strike}) rotate(-2deg)`, transformOrigin: "left center" } })),
    R("div", { style: { display: "flex", alignItems: "center", gap: 40, marginTop: 40 } },
      R("div", { style: { fontFamily: FH, fontSize: 170, color: theme.accent2, opacity: clamp01(stamp * 2), transform: `scale(${lerp(2.2, 1, stamp)}) rotate(${lerp(-10, -3, stamp)}deg)`, transformOrigin: "left center", textShadow: `0 16px 40px ${rgba(theme.ink, 0.2)}` } }, scene.neu || ""),
      R("div", { style: { fontFamily: FH, fontSize: 150, color: theme.ink, opacity: seg(p, 0.56, 0.66) } }, scene.rest || "")),
    R("div", { style: { ...u.sub(theme, false, 38), marginTop: 56, opacity: seg(p, 0.68, 0.8) } }, scene.sub || ""));
}

/* 38 — letters spiral in, rotating around their own centers.  lf-kit.js:734-747 */
function Spiral({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, ease, clamp01, lerp, fitSize, PADX, COLW, FH } = u;
  const title = (scene.title || "").toUpperCase();
  const size = fitSize(title, 160, COLW);
  return R("div", { style: { position: "absolute", left: PADX, top: 440, whiteSpace: "nowrap" } },
    title.split("").map((ch, k) => {
      const e = ease.outQuint(seg(p, 0.05 + k * 0.024, 0.26 + k * 0.024));
      return R("span", { key: k, style: { display: "inline-block", fontFamily: FH, fontSize: size, color: k % 5 === 2 ? theme.accent : theme.ink, opacity: clamp01(e * 1.4), transform: `rotate(${(1 - e) * -240}deg) scale(${lerp(0.1, 1, e)})`, minWidth: ch === " " ? "0.4em" : 0 } }, ch);
    }),
    R("div", { style: { ...u.sub(theme, false, 40), marginTop: 66, opacity: seg(p, 0.6, 0.74) } }, scene.sub || ""));
}

/* 55 — rubber stamps slam onto the frame in sequence.  lf-kit.js:1029-1047 */
function Stamps({ progress: p, index: i, scene, theme, t, u }) {
  const { R, seg, ease, clamp01, lerp, rgba, PADX, FH, FB } = u;
  const stamps = scene.stamps || [];
  const caps = scene.caps || [];
  const rots = [-8, 5, -4];
  return R("div", { style: { position: "absolute", inset: 0 } },
    R("div", { style: { position: "absolute", left: PADX, top: 210, ...u.ttl(theme, false, 100), opacity: seg(p, 0.02, 0.1) } }, scene.title || ""),
    R("div", { style: { position: "absolute", left: PADX, right: PADX, top: 420, display: "flex", gap: 60, justifyContent: "center" } },
      stamps.map((s, k) => {
        const e = ease.outQuint(seg(p, 0.16 + k * 0.16, 0.26 + k * 0.16));
        const c = [theme.accent, theme.accent2, theme.ink][k % 3];
        return R("div", { key: k, style: { textAlign: "center", opacity: clamp01(e * 2), transform: `scale(${lerp(2.6, 1, e)}) rotate(${rots[k % 3]}deg)` } },
          R("div", { style: { border: `8px solid ${c}`, borderRadius: 24, padding: "30px 54px", fontFamily: FH, fontSize: 76, color: c, boxShadow: `inset 0 0 0 4px ${rgba(c, 0.3)}`, letterSpacing: "0.04em" } }, s),
          R("div", { style: { fontFamily: FB, fontWeight: 700, fontSize: 26, color: rgba(theme.ink, 0.55), marginTop: 20 } }, caps[k] || ""));
      })),
    R("div", { style: { position: "absolute", left: 0, right: 0, top: 830, textAlign: "center", ...u.sub(theme, false, 38), margin: "0 auto", opacity: seg(p, 0.66, 0.8) } }, scene.sub || ""));
}

// ---------------------------------------------------------------- registry
const BEATS = {
  Accordion, Blink, Bloom, BoxList, Breathe, Cards,
  Compose, Counts, Creed, Curtain, Doors, Echo,
  Flap, Gauge, Grid, GrowOnce, Habit, Join,
  Kit, Ladder, LongShadow, Magnet, Marker, Metronome,
  NoGarden, Note, Objections, Offer, Open, Orbit,
  Patience, Peek, Perimeter, Pile, Plans, Problem,
  QA, Quote, Rain, Ransom, Recap, Receipt,
  Rewrite, Ribbons, Ring, Rows, Seesaw, Sill,
  Slice, Spiral, Stamps, Steps, Swing, Tally,
  TearOff, Wave, Weave, Weeks, Wilt, ZoomThrough,

};

// ---------------------------------------------------------------- browser payload
// Every renderer, shipped to the page as source and reassembled into the same map. This is the
// counterpart of the verbatim World carriage in the skins, and it is why rule 2 in the header
// matters: `String(fn)` carries the text, never the scope, so a renderer that closed over
// anything in this module would arrive at the browser referencing an identifier that is not
// there. `test-lf-packs.js` renders every beat through both evaluators and diffs them, which is
// what turns that rule from a convention into a checked property.
function browserSource() {
  const helpers = Object.keys(HELPERS).map((n) => `var ${n}=${HELPERS[n].toString()};`).join("\n");
  const names = Object.keys(BEATS);
  const defs = names.map((n) => `var ${n}=${BEATS[n].toString()};`).join("\n");
  return `${helpers}\n${defs}\nreturn {${names.map((n) => `${n}:${n}`).join(",")}};`;
}

module.exports = { BEATS, META, HELPERS, browserSource };
