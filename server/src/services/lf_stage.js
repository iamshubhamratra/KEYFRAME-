// LF STAGE — the shared composer engine behind the 27 long-form packs.
//
// WHY A SECOND STAGE. film_stage.js hosts the FilmKit family: six archetypes, ten mechanics, a
// per-TEMPLATE `look` table, twelve scenes, portrait by default. The long-form drop is a
// different engine wearing a similar coat — sixty renderers, no mechanics, no `look` in any of
// the thirty cfgs (the per-scene ground is baked into each renderer instead), forty-one scenes
// and five minutes, 16:9 only. Reconciling those two data models inside one file would mean a
// per-family branch in the module that 97 published packs and every golden hash render through.
// This repo has already made that call once, for the same reason, in om_stage.js:1-13.
//
// What IS shared, deliberately and by import rather than by copy: the fonts and their measured
// metrics, brand_kit's hue rotation, asset admission, the caption contract, the pack manifest,
// pipeline registration, and the SVG element shim (see lf_runtime.js).
//
// ── THE PORT ────────────────────────────────────────────────────────────────────────
// React plus a wall-clock ticker cannot be rendered by HyperFrames, so the runtime is replaced
// while the DESIGN is kept intact:
//
//   • SceneStage's elapsed -> {progress, index}  becomes a paused GSAP timeline seeked by the
//     renderer, with one proxy tween resolving the active scene from an emitted bounds table.
//   • window.useTimeline()'s global clock       becomes `now * ambient`, computed from the seek
//     rather than from a rAF accumulator, so it is identical forwards and backwards.
//   • the sixty scene renderers                 are TRANSCRIBED, not re-expressed as tweens, and
//     re-evaluated per seek. See the lf_runtime.js header for why that is the only reading of
//     "never re-implement an authored function" that survives contact with these files.
//   • cfg.World                                 RUNS VERBATIM against the same shim.
//   • MediaSlot's "DROP IMAGE TO REPLACE"       becomes a real asset, or the slot is dropped.
//   • the tweak panel's accent/accent2          become the Art Director's brand skin, hue-rotated
//                                               onto the authored luminances.
//
// Engineering contract, identical to every other composer here: one paused GSAP timeline on
// window.__timelines["vid"]; direct-child .clip layers on unique tracks; a boundary opacity:0
// hard-kill per scene; ONE seek-safe caption node (#cap-text) driven by a single onUpdate proxy;
// finite repeats; cqw units + container-type:size; hidden = inline opacity:0 only; no
// Math.random, no Date, no rAF at runtime.

const { fontFaceCss, isBundled } = require("../fonts/pack_fonts");
const { advanceEm, hasMetrics, METRICS } = require("../fonts/font_metrics");
const { resolveBrand } = require("./brand_kit");
const { GSAP_CDN, r, esc } = require("./composer_kit");
const { camTransform } = require("./lf_runtime");
const rt = require("./lf_runtime");

// THE ENGINE REVISION, STAMPED ON #root as data-lf-rev.
//
// Bump on any visually meaningful engine change. Deliberately a constant and never a date or an
// mtime: compositions must stay byte-identical across checkouts for the golden baseline. The
// FilmKit family learned this the expensive way (film_stage.js:58-74) — a film composed by a
// server process whose require cache predated a fix looked like the old engine because it WAS
// the old engine, and proving it took a forensic diff of emitted idioms.
// 1 = first long-form port
const ENGINE_REV = 1;

// The authored stage. Every one of the thirty cfgs is 1920x1080 with padx 140 — measured, not
// assumed — so unlike film_stage there is no STAGES table to switch on.
const RW = 1920, RH = 1080, PADX = 140;
const COLW = RW - PADX * 2;

// ---------------------------------------------------------------- the canonical spine
// Duplicated from gen-lf-skins.js ON PURPOSE, and asserted equal by test-lf-packs.js. The
// generator needs it at authoring time to DERIVE each pack's override list; the stage needs it
// at build time to REPLAY that list. Importing the generator from the engine would drag a
// script that reads the handoff directory into every render.
const SPINE = [
  "Open", "Problem", "Wilt", "Note", "Tally", "Flap", "Creed", "Marker", "Counts", "Slice",
  "Kit", "BoxList", "Cards", "Peek", "Rewrite", "Objections", "Steps", "Weeks", "Quote", "Rows",
  "Habit", "Grid", "LongShadow", "QA", "Ladder", "Receipt", "Seesaw", "Pile", "Curtain", "Metronome",
  "Stamps", "Ransom", "Accordion", "Gauge", "TearOff", "Bloom", "Offer", "Plans", "Recap", "Join",
];

// Apply a pack's override list to the canonical spine. Substitutions first, then splices — the
// same order gen-lf-skins.js derives them in, which is what makes the round-trip exact.
function resolveSpine(skin) {
  const ov = Array.isArray(skin.spineOverrides) ? skin.spineOverrides : [];
  const out = SPINE.slice();
  for (const o of ov) if (o[0] !== "insert") out[o[0]] = o[1];
  for (const o of ov) if (o[0] === "insert") out.splice(o[1], 0, o[2]);
  return out;
}

// ---------------------------------------------------------------- strings
const BASE_STRINGS = {
  brandName: "",
  ctaButton: "Get started",
  hookKicker: "A SHORT FILM",
  peekCaption: "Desktop screenshot",
  dropImage: "",              // never rendered — a placeholder must not reach a film
};

// ---------------------------------------------------------------- theme
// THE SIX ROLES ARE THE CONTRACT. Every authored palette returns exactly
// {paper, ink, accent, accent2, sageT, terraT}, so — unlike FilmKit, which has to infer which
// stop is ink by luminance-sorting arbitrary per-template role names — there is nothing to guess.
//
// BRAND TAKES THE TWO ACCENTS, NOT THE GROUND. accent and accent2 are exactly the pair the
// authored tweak panel exposes (accentOpts / accent2Opts), which makes them the pair the design
// itself considers substitutable. The four ground stops keep their authored values: a brand that
// repainted `paper` would not be recolouring this film, it would be replacing it.
function buildTheme(skin, brandSkin) {
  const P0 = skin.palette({});
  const resolved = resolveBrand(brandSkin, {
    ground: P0[skin.groundKey || "paper"],
    isDark: false,
    packAccents: [P0.accent, P0.accent2],
  });
  const c = { ...P0 };
  if (resolved && Array.isArray(resolved.accents) && resolved.accents.length) {
    if (resolved.accents[0]) c.accent = resolved.accents[0];
    if (resolved.accents[1]) c.accent2 = resolved.accents[1];
  }
  const displayStack = `"${skin.display}", ${skin.displayFallback || "sans-serif"}`;
  const bodyStack = `"${skin.body}", ${skin.bodyFallback || "sans-serif"}`;
  return {
    ...c,
    W: RW, H: RH,
    energy: 1,
    brand: (skin.strings && skin.strings.brandName) || skin.label || "",
    displayStack, bodyStack,
    resolvedBrand: resolved || null,
  };
}

// ---------------------------------------------------------------- the content adapter
// THE GOVERNING LAW, IMPLEMENTED. "The AI decides what the video SAYS. The template decides how
// it LOOKS." Which renderer runs at index i comes from the SPINE — template data. What that
// renderer says comes from the storyboard — model data. The adapter is the seam, and it only
// ever moves text: it can never change which renderer runs.
//
// Two directions, because the same engine serves two callers:
//
//   FIDELITY  the authored deck already speaks the renderers' own vocabulary
//             ({"name":"Receipt","header":…,"rows":[[a,b]],"total":…}), so those keys pass
//             straight through. This is the path scripts/shot-lf-pack.js drives, and it is the
//             only honest way to diff our render against the handoff.
//   PRODUCTION a KEYFRAME storyboard scene speaks {headline, subtext, bullets, stats, …}. Every
//             renderer declares the keys it needs (lf_beats META); anything the scene does not
//             carry natively is filled from that vocabulary, and a renderer whose required keys
//             cannot be filled falls back to the shape that CAN be — never to an invented
//             statistic and never to an empty frame.
function adaptScene(name, scene, meta, Str) {
  const s = scene || {};
  const want = (meta && meta.keys) || [];
  const out = {};
  // 1) native keys win — the fidelity path
  for (const k of want) if (s[k] !== undefined) out[k] = s[k];

  const headline = s.headline || s.title || "";
  const sub = s.subtext || s.sub || "";
  const bullets = Array.isArray(s.bullets) ? s.bullets.filter(Boolean).map(String)
    : Array.isArray(s.items) ? s.items.filter(Boolean).map(String) : [];

  // 2) fill from the storyboard vocabulary
  for (const k of want) {
    if (out[k] !== undefined) continue;
    switch (k) {
      case "title": out[k] = headline; break;
      case "sub": out[k] = sub; break;
      case "word": out[k] = String(headline).split(/\s+/)[0] || headline; break;
      case "kicker": out[k] = s.kicker || Str.hookKicker; break;
      case "text": out[k] = sub || headline; break;
      case "lines": out[k] = bullets.length ? bullets : String(headline).split("|"); break;
      case "items": case "words": case "steps": case "rows": case "stamps": case "months":
        out[k] = bullets; break;
      case "prefix": out[k] = s.kicker || headline; break;
      default: break;
    }
  }
  return out;
}

// ---------------------------------------------------------------- fonts
// Resolve the per-character advance table for this pack's display face ONCE, and hand the same
// numbers to both evaluators. The build side uses them through makeFitSize; the browser side
// gets them as a literal so a seek re-fits identically. All 51 families the drop uses are
// measured (verified 51/51), so the avg fallback is a safety net, not a code path in use.
function advanceFor(skin) {
  const fam = skin.display;
  const m = hasMetrics(fam) ? METRICS[fam] : null;
  const table = (m && m.w) || {};
  const avg = (m && m.avg) || skin.em || 0.58;
  return {
    table, avg,
    fn: (str) => advanceEm(str, fam, { avg }),
  };
}

// ---------------------------------------------------------------- build
function build(skin, { storyboard, dims, captionCues, assets, brandSkin = null, localized = null } = {}) {
  const { BEATS, META } = require("./lf_beats");

  const theme = buildTheme(skin, brandSkin);
  const Str = { ...BASE_STRINGS, ...(skin.strings || {}), ...(localized || {}) };
  const sb = storyboard || {};
  const W = (dims && dims.width) || RW, H = (dims && dims.height) || RH;

  // THE SPINE DECIDES THE RENDERERS, THE STORYBOARD DECIDES THE LENGTH.
  //
  // Note what is NOT here: film_stage.js:922's `sb.scenes.slice(0, 12)`. That cap is the single
  // line that makes the FilmKit engine unable to host a five-minute film — it truncates silently
  // while `D` keeps coming from durationSec, so scene twelve holds for the remaining four
  // minutes. This engine takes as many scenes as the spine resolves to and asserts the two agree.
  const spine = resolveSpine(skin);
  const authored = Array.isArray(sb.scenes) ? sb.scenes : [];
  const n = authored.length || spine.length;
  const perScene = sb.durationSec ? sb.durationSec / n : 7.5;

  const scenes = [];
  let cursor = 0;
  for (let i = 0; i < n; i++) {
    const a = authored[i] || {};
    // The renderer is the spine's, unless the caller supplied a deck that names one AND the
    // engine actually has it. A name we do not implement falls back to the spine rather than
    // rendering nothing — the same "drop it in silence" rule treatments.js already applies.
    const named = typeof a.name === "string" && BEATS[a.name] ? a.name : null;
    const name = named || spine[i % spine.length];
    const meta = META[name] || {};
    const duration = Number(a.dur || a.duration) || perScene;
    scenes.push({
      i, name, meta,
      start: r(cursor),
      duration: r(duration),
      data: adaptScene(name, a, meta, Str),
      bg: groundOf(theme, meta, i),
      dark: !!meta.dark,
      world: meta.world !== false,
    });
    cursor += duration;
  }
  const D = r(sb.durationSec || cursor || n * 7.5);

  const adv = advanceFor(skin);
  const utils = rt.buildUtils({
    W: RW, H: RH, dark: false, advance: adv.fn, PADX, COLW,
    FH: theme.displayStack, FB: theme.bodyStack,
  });

  // ---- static markup: every scene rendered at its settled progress -----------------
  // See the lf_runtime header. The document must carry real text before any seek lands, or a
  // render that never reaches the timeline ships forty empty divs — and test:ghosts and
  // test:frame-fill would both be right to fail it.
  const cams = (skin.cams && skin.cams.length) ? skin.cams : ["pushL", "zoomIn", "hopU", "pushR", "zoomOut", "drop"];
  const camStride = Number(skin.camStride) || 3;
  const camOff = Number(skin.camOff) || 1;
  const SETTLE = 0.55;
  const body = scenes.map((sc) => {
    const fn = BEATS[sc.name];
    let inner = "";
    if (fn) {
      const u = rt.buildUtils({
        W: RW, H: RH, dark: sc.dark, advance: adv.fn, PADX, COLW,
        FH: theme.displayStack, FB: theme.bodyStack,
      });
      try {
        const tree = fn({
          progress: SETTLE, index: sc.i, localTime: sc.duration * SETTLE,
          scene: sc.data, theme, t: (sc.start + sc.duration * SETTLE) * (skin.ambient || 1.5), u,
        });
        inner = (tree && tree.html) || "";
      } catch (e) {
        inner = "";
      }
    }
    const camKind = cams[(sc.i * camStride + camOff) % cams.length];
    const camT = camTransform(camKind, SETTLE, (sc.start + sc.duration * SETTLE) * (skin.ambient || 1.5), 1);
    return `<div class="clip lf-scene" id="lfs${sc.i}" data-track-index="${10 + sc.i}" `
      + `data-start="${sc.start}" data-duration="${sc.duration}" data-beat="${esc(sc.name)}" `
      + `style="opacity:${sc.i === 0 ? 1 : 0}">`
      + `<div class="lf-cam" id="lfc${sc.i}" style="position:absolute;inset:0;will-change:transform;transform:${camT}">`
      + `${inner}</div>`
      + garnishHtml(skin, theme, sc, (sc.start + sc.duration * SETTLE) * (skin.ambient || 1.5))
      + `</div>`;
  });

  // The world sits UNDER every scene on its own track and keeps one continuous clock across
  // cuts; a scene that declares world:false hides it rather than resetting it.
  const World = skin.World ? rt.compileAuthored(skin.World, { R: rt.H, rgba: rt.rgba }) : null;
  let worldHtml = "";
  if (World) {
    try { worldHtml = (World(theme, 0, utils) || {}).html || ""; } catch { worldHtml = ""; }
  }
  const worldClip = `<div class="clip" id="lf-world" data-track-index="0" style="opacity:1">`
    + `<svg id="lf-world-svg" width="${RW}" height="${RH}" viewBox="0 0 ${RW} ${RH}" `
    + `preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0;width:100%;height:100%">`
    + `${worldHtml}</svg></div>`;

  const grounds = scenes.map((s) => s.bg);
  const fonts = [skin.display, skin.body].filter((f) => f && isBundled(f));

  const style = css(skin, theme, grounds[0]);
  const script = timelineScript(skin, scenes, D, W, H, captionCues, adv);

  const indexHtml = [
    `<!DOCTYPE html>`, `<html lang="en">`, `<head>`, `<meta charset="utf-8">`, `<title>vid</title>`,
    `<script src="${GSAP_CDN}"></script>`,
    `<style>`, fonts.map(fontFaceCss).join("\n"), style, `</style>`, `</head>`, `<body>`,
    `<div id="root" class="composition" data-composition-id="vid" data-lf-rev="${ENGINE_REV}" `
      + `data-width="${W}" data-height="${H}" data-start="0" data-duration="${D}" `
      + `style="width:${W}px;height:${H}px;">`,
    `<div id="lf-ground" class="clip" data-track-index="1" style="background:${grounds[0]}"></div>`,
    worldClip,
    body.join("\n"),
    chromeHtml(theme),
    `<div class="clip" id="caps" data-track-index="94"><div id="cap-text"></div></div>`,
    `</div>`,
    `<script>`, authoredScript(skin, theme, scenes, adv), `</script>`,
    `<script>`, script, `</script>`,
    `</body>`, `</html>`,
  ].join("\n");

  const metaJson = JSON.stringify({
    compositionId: "vid", width: W, height: H, fps: (dims && dims.fps) || 30, duration: D,
  });
  return { indexHtml, metaJson, resolvedBrand: theme.resolvedBrand };
}

// The per-scene ground. Twenty-three renderers sit on paper, thirteen on the sage tint, eleven
// on the terracotta tint, nine on ink and three on an accent — measured off lf-kit.js, carried
// in lf_beats META. Recap alternates by index, which is the one computed case.
function groundOf(theme, meta, i) {
  const key = meta.bg || "paper";
  // "self" — the renderer paints its own, because the colour changes DURING the scene (Recap
  // cycles four grounds as its word flashes advance). The stage still needs something under it
  // for the frame before the first draw, and paper is the safe neutral: fully covered either way.
  if (key === "self") return theme.paper;
  return theme[key] || theme.paper;
}

module.exports = { build, BASE_STRINGS, SPINE, resolveSpine, buildTheme, adaptScene, groundOf, ENGINE_REV, RW, RH, PADX, COLW };

// ---------------------------------------------------------------- emitted css
function css(skin, theme, ground0) {
  return `
  html,body { margin:0; padding:0; background:${skin.desk || theme.ink}; }
  * { box-sizing:border-box; }
  #root { position:relative; overflow:hidden; isolation:isolate; container-type:size;
          background:${ground0}; color:${theme.ink}; font-family:${theme.bodyStack};
          font-optical-sizing:auto; }
  .clip { position:absolute; top:0; left:0; width:100%; height:100%; overflow:hidden; }
  .lf-scene { will-change:opacity; }
  #cap-text { position:absolute; left:50%; bottom:64px; transform:translateX(-50%);
              max-width:1200px; text-align:center; font-family:${theme.bodyStack};
              font-weight:700; font-size:38px; line-height:1.26; color:${theme.paper};
              background:${rt.rgba(theme.ink, 0.88)}; padding:16px 30px; border-radius:16px; }`;
}

// The persistent brand lockup and the garnish layer — lf-kit.js:53-58 and :59-71. Both sit
// OUTSIDE the camera transform, like the world, which is why they never drift with the scene.
//
// BUILT THROUGH THE SHIM, NOT BY STRING CONCATENATION, and that is not a style preference. The
// first version of this function pasted `font-family:${theme.bodyStack}` straight into a
// `style="…"` attribute — and a body stack is `"Nunito", system-ui, sans-serif`, whose first
// inner double quote TERMINATES the attribute. Everything after it (weight, size, tracking,
// uppercase) was silently dropped, and the frame rendered a small lowercase wordmark that looked
// like a design decision rather than a parse error. The shim's escAttr closes that whole class.
function chromeHtml(theme) {
  const R = rt.H;
  return `<div class="clip" id="lf-chrome" data-track-index="92" style="pointer-events:none">`
    + R("div", { style: { position: "absolute", top: 44, left: PADX, display: "flex", alignItems: "center", gap: 14 } },
      R("div", { style: { width: 16, height: 16, borderRadius: 999, background: theme.accent } }),
      R("div", {
        style: {
          fontFamily: theme.bodyStack, fontWeight: 800, fontSize: 24, letterSpacing: "0.14em",
          color: theme.ink, textTransform: "uppercase",
        },
      }, theme.brand)).html
    + `</div>`;
}

// THE GARNISH — why no frame reads as empty (handoff README, "Garnish layer").
//
// Three slots, rotated by scene index so consecutive frames never repeat: a corner tag from
// cfg.tags, an italic footnote with a rule from cfg.foots, and — alternating with a spinning
// six-spoke doodle — a vertical side label from cfg.sides. Transcribed from lf-kit.js:59-71,
// including the index arithmetic: TAGS[i % n], FOOTS[i % n], SIDES[(i >> 1) % n], and the
// even/odd split that decides label-or-doodle.
//
// The tag's slow rotation and the doodle's spin are functions of the clock, so they are emitted
// per scene at the settled time and recomputed by the runtime alongside everything else.
function garnishHtml(skin, theme, sc, t) {
  const R = rt.H;
  const c = sc.dark ? theme.paper : theme.ink;
  const tags = skin.tags && skin.tags.length ? skin.tags : [""];
  const foots = skin.foots && skin.foots.length ? skin.foots : [""];
  const sides = skin.sides && skin.sides.length ? skin.sides : [""];
  const i = sc.i;
  const kids = [
    R("div", {
      style: {
        position: "absolute", top: 40, right: PADX, fontFamily: theme.bodyStack, fontWeight: 800,
        fontSize: 21, letterSpacing: "0.18em", textTransform: "uppercase", color: rt.rgba(c, 0.55),
        border: `2px solid ${rt.rgba(c, 0.28)}`, borderRadius: 999, padding: "10px 26px",
        transform: `rotate(${Math.sin(t * 1.1 + i) * 1.4}deg)`,
      },
    }, tags[i % tags.length]),
    R("div", { style: { position: "absolute", bottom: 40, left: PADX, display: "flex", alignItems: "center", gap: 18 } },
      R("div", { style: { width: 46, height: 4, borderRadius: 999, background: theme.accent } }),
      R("div", { style: { fontFamily: theme.bodyStack, fontWeight: 600, fontSize: 24, color: rt.rgba(c, 0.55), fontStyle: "italic" } },
        foots[i % foots.length])),
    i % 2 === 0
      ? R("div", {
        style: {
          position: "absolute", left: 34, top: 340, writingMode: "vertical-rl",
          transform: "rotate(180deg)", fontFamily: theme.bodyStack, fontWeight: 800, fontSize: 18,
          letterSpacing: "0.32em", color: rt.rgba(c, 0.3), textTransform: "uppercase",
        },
      }, sides[(i >> 1) % sides.length])
      : R("svg", { width: 70, height: 70, viewBox: "0 0 70 70", style: { position: "absolute", right: 64, bottom: 44, opacity: 0.55 } },
        R("g", { transform: `rotate(${t * 26} 35 35)` },
          [0, 1, 2, 3, 4, 5].map((k) => R("line", {
            key: k, x1: 35, y1: 10, x2: 35, y2: 26, stroke: theme.accent, strokeWidth: 5,
            strokeLinecap: "round", transform: `rotate(${k * 60} 35 35)`,
          })))),
  ];
  return R("div", { class: "lf-garnish", id: `lfg${i}` }, kids).html;
}

// The authored payload: the runtime shims, this pack's theme and scene table, and the verbatim
// World source. Emitted before the timeline so the proxy can call into it.
function authoredScript(skin, theme, scenes, adv) {
  const bounds = scenes.map((s) => ({
    name: s.name, start: s.start, duration: s.duration, bg: s.bg,
    dark: s.dark, world: s.world, data: s.data,
  }));
  return [
    `var LFW=${RW},LFH=${RH},LFPADX=${PADX},LFCOLW=${COLW};`,
    `var LFAMBIENT=${Number(skin.ambient) || 1.5};`,
    `var LFCAMS=${JSON.stringify(skin.cams && skin.cams.length ? skin.cams : ["pushL","zoomIn","hopU","pushR","zoomOut","drop"])},LFCSTRIDE=${Number(skin.camStride) || 3},LFCOFF=${Number(skin.camOff) || 1};`,
    `var LFFH=${JSON.stringify(theme.displayStack)},LFFB=${JSON.stringify(theme.bodyStack)};`,
    `var LFTHEME=${JSON.stringify({
      paper: theme.paper, ink: theme.ink, accent: theme.accent, accent2: theme.accent2,
      sageT: theme.sageT, terraT: theme.terraT, W: RW, H: RH, energy: 1, brand: theme.brand,
      displayStack: theme.displayStack, bodyStack: theme.bodyStack,
    })};`,
    `var LFSCENES=${JSON.stringify(bounds)};`,
    rt.runtimeScript({ advanceTable: adv.table, advanceAvg: adv.avg }),
    `var World=${skin.World ? skin.World.toString() : "null"};`,
    `var LFBEATS=(function(){${require("./lf_beats").browserSource()}})();`,
  ].join("\n");
}

// ONE paused timeline, ONE proxy tween. Everything visual is recomputed inside the proxy's
// onUpdate from tl.time(), which is what makes a seek exact in both directions.
function timelineScript(skin, scenes, D, W, H, captionCues, adv) {
  const cues = Array.isArray(captionCues) ? captionCues.map((c) => [r(c.start), r(c.end), String(c.text || "")]) : [];
  return `
var tl = gsap.timeline({ paused: true });
window.__timelines = window.__timelines || {};
window.__timelines["vid"] = tl;
var LFCUES=${JSON.stringify(cues)};
var capNode=document.getElementById("cap-text");
function LFcaption(now){
  if(!capNode)return;
  var txt="";
  for(var i=0;i<LFCUES.length;i++){ if(now>=LFCUES[i][0]&&now<LFCUES[i][1]){txt=LFCUES[i][2];break;} }
  if(capNode.__t!==txt){capNode.textContent=txt;capNode.__t=txt;}
  capNode.style.opacity=txt?"1":"0";
}
tl.to({}, { duration: ${D}, ease: "none", onUpdate: function(){
  var now = tl.time();
  LFdraw(now);
  LFcaption(now);
} }, 0);
LFdraw(0); LFcaption(0);
window.addEventListener("hf-seek", function(e){
  var t=(e && e.detail && e.detail.time)||0;
  tl.pause(); tl.seek(t, false); LFdraw(t); LFcaption(t);
});
if (!navigator.webdriver) tl.play();
`;
}
