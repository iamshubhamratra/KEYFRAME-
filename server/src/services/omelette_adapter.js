// OMELETTE ADAPTER — renders the USER'S film inside the ORIGINAL template.
//
// PLAYBACK BAR — FIXED 2026-07-31, do not re-chase. It reached the video because
// the renderer captures the PAGE, not the #root element, so keeping the bar
// outside #root was never enough on its own. hideChrome() (below) walks from
// #root up to <body> hiding every off-path sibling subtree and pins #root to
// (0,0); the two class/attribute hooks it replaced could never match — measured
// live, the bar node's className is "" and it matches neither [data-om-playback]
// nor .om-playbar/.om-playback-bar. Verified by re-render on all 15 omelette
// packs. The engine's auto-scale reads the VIEWPORT, not its siblings, so hiding
// them does not disturb the fit.
//
// KNOWN OPEN DEFECT (2026-07-30) — VERTICAL renders mis-fit.
// Landscape is verified good. In portrait the engine's own auto-scale leaves the
// stage at scale 0.64375 (464x824 inside a 720x1280 frame).
// MEASURED, so the next attempt need not re-derive it:
//   * the stage has NO viewBox — anything keyed off one silently no-ops;
//   * width/height/box-shadow set with !important DO persist on the stage;
//   * `transform` alone is reassigned back to scale(...) after every override,
//     including after a MutationObserver re-assert, so it is being recomputed
//     from engine state rather than written once;
//   * a document stylesheet cannot be relied on — the tree contains sc-host
//     shadow boundaries.
// SHARPENED (7th attempt, engine-side): the film is natively 1080x1920 and the
// engine solves scale = min(cw/1080, (ch-44)/1920). At a 720x1280 render it
// computes (1280-44)/1920 = 0.64375, so the film lands 695x1236 instead of the
// 720x1280 that would fill the frame — the correct scale is 1280/1920 = 0.6667.
// Resizing "the first ancestor with >1 child" to H+44 did NOT change the result,
// so that is NOT the element stageRef measures. Next step: identify the real
// stageRef container (instrument animations-v2.jsx's measure() directly, or find
// which ancestor's clientHeight equals 1280) and give THAT +44px.
//
// The alternative was hand-porting each template to native GSAP (as
// momentum_composer.js and showcase_composer.js do). That is ~700 lines per
// template, 17 templates, and every port is a reproduction that can drift from
// the source. This runs the source itself.
//
// It works because these templates already expose a frame-exact seek contract —
// proven by spike, not assumed:
//   * the stage carries data-om-exportable-video-with-duration-secs
//   * dispatching `data-om-seek-to-time-frame` with detail {time, sync:true}
//     applies the commit through ReactDOM.flushSync, so the DOM reflects that
//     frame the moment dispatchEvent returns (the stage advertises this as
//     data-om-sync-seek="true")
//   * verified: seeking forward then BACK to the same t yields a byte-identical
//     committed DOM, which is exactly what a frame-by-frame renderer needs
//
// So the adapter only has to:
//   1. swap window.OM_SCENES for the user's scenes (the template's own default
//      OM_SCENES tells us its authored scene names and content fields)
//   2. hide the engine's playback bar — it is drawn by animations-v2.jsx, NOT by
//      the film, which is why grepping the film sources for "PlaybackBar" found
//      nothing and the bar still rendered
//   3. install window.__timelines["vid"] as a GSAP-shaped shim over that seek
//   4. stamp the HyperFrames root contract (data-composition-id/width/height/
//      duration) — without it the renderer reports "Composition has zero
//      duration" even though the film is healthy

const fs = require("node:fs");
const path = require("node:path");
const config = require("../config");

const TPL_DIR = path.join(config.paths.root, "public", "omelette-templates");

function templatePath(name) {
  const f = path.join(TPL_DIR, `${String(name).replace(/[^A-Za-z0-9]/g, "")}.html`);
  return fs.existsSync(f) ? f : null;
}

// ---- read the template's OWN authored scene list -------------------------------
// This is the key to being generic: every template ships its default OM_SCENES,
// which names its scene types in order and shows which content fields each uses.
function readTemplateScenes(html) {
  const m = /<script type="__bundler\/template"[^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (!m) return null;
  let page;
  try { page = JSON.parse(m[1]); } catch { return null; }
  const sm = /window\.OM_SCENES\s*=\s*'([\s\S]*?)'\s*;/.exec(page);
  if (!sm) return null;
  try { return JSON.parse(sm[1]); } catch { return null; }
}

const isShot = (a) => {
  const s = String((a && a.source) || "").toLowerCase(), k = String((a && a.kind) || "").toLowerCase();
  return s === "website" || s === "screenshot" || k === "screenshot" || /screenshot|peekshot/.test(s);
};
const isLogo = (a) => a && (a.kind === "logo" || /logo/i.test(String(a.alt || "")));
const ratioOf = (a) => (a && Number(a.ratio) > 0 ? Number(a.ratio) : (a && a.width && a.height ? a.width / a.height : 0));
const isPortraitAsset = (a) => { const rt = ratioOf(a); return rt > 0 && rt < 0.9; };
const plateOk = (a) => a && a.path && String(a.type) !== "video" && !/\.svg($|\?)/i.test(String(a.path));

function fit(text, max) {
  const t = String(text || "").trim();
  if (t.length <= max) return t;
  let out = "";
  for (const w of t.split(/\s+/)) { if ((out + " " + w).trim().length > max) break; out = (out + " " + w).trim(); }
  return out || t.slice(0, max);
}
function bullets(scene, n) {
  let list = Array.isArray(scene.chips) ? scene.chips.filter(Boolean) : [];
  if (!list.length && Array.isArray(scene.onScreenText)) list = scene.onScreenText.filter(Boolean);
  if (!list.length && Array.isArray(scene.bullets)) list = scene.bullets.filter(Boolean);
  if (!list.length && scene.subtext) list = String(scene.subtext).split(/[.;\n•]|\s—\s/).map((s) => s.trim()).filter((s) => s.length > 2);
  return list.slice(0, n).map(String);
}
// The templates break headlines on "|" — give them the same two-line shape the
// authored copy has, or a long script line overruns its column.
function twoLines(text, max) {
  const t = fit(text, max);
  const w = t.split(/\s+/);
  if (w.length < 4) return t;
  const mid = Math.ceil(w.length / 2);
  return `${w.slice(0, mid).join(" ")}|${w.slice(mid).join(" ")}`;
}
// PORTRAIT slam headlines need SHORT lines. The reel/vertical templates draw the
// headline at a fixed ~190px inside a ~960px column with NO fit-to-width, so a
// long "|" segment (twoLines makes 12-16 char lines) runs straight off the edge
// and crops ("WAITING DAYS FOR MOTION" -> "WAITII"/"MOTIO"). Break portrait copy
// into up to 3 short lines instead — matching the authored "YOUR APP|GOES|VIRAL."
// shape — while the runtime autofit in the harness guarantees whatever is left
// still fits. Landscape columns are wide, so keep the original midpoint split.
function breakHeadline(text, max, land) {
  if (land) return twoLines(text, max);
  const t = fit(text, max);
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return t;
  const perLine = 9, maxLines = 3;   // ~9 char lines keep the slam BIG (short lines need little/no autofit shrink)
  const lines = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur.length + 1 + w.length) <= perLine) cur += ` ${w}`;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const head = lines.slice(0, maxLines - 1);
    head.push(lines.slice(maxLines - 1).join(" "));
    return head.join("|");
  }
  return lines.join("|");
}
function statsFor(scene) {
  const raw = Array.isArray(scene.stats) ? scene.stats : [];
  const out = [];
  for (const s of raw) {
    const v = Number(s && (s.v != null ? s.v : s.value));
    if (!isFinite(v)) continue;
    out.push({ v, suf: String(s.suf || s.suffix || ""), l: String(s.l || s.label || "").toUpperCase().slice(0, 20) });
    if (out.length >= 3) break;
  }
  return out;
}
// Numbers mined from the scene's OWN text (onScreenText/subtext), so a stats
// slide can only ever show figures the script actually stated. The suffix
// lookahead mirrors template_engine.mineStat: a unit must not steal the first
// letter of the next word ("12 months" is 12, not 12m-onths).
function minedStats(scene) {
  const lines = []
    .concat(Array.isArray(scene.onScreenText) ? scene.onScreenText : [])
    .concat(scene.subtext ? String(scene.subtext).split(/[.;\n]/) : []);
  const out = [];
  const seen = new Set();
  for (const raw of lines) {
    const s = String(raw || "");
    const m = /([$₹€£]?)\s?(\d[\d,]*(?:\.\d+)?)(?:\s?(%|x|k|m|bn?|\+|★)(?![A-Za-z]))?/i.exec(s);
    if (!m) continue;
    const v = parseFloat(m[2].replace(/,/g, ""));
    if (!isFinite(v) || v > 10000000) continue;
    const key = `${v}${m[3] || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const label = `${s.slice(0, m.index)} ${s.slice(m.index + m[0].length)}`
      .replace(/[^\w\s.%-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 20);
    out.push({ v, suf: (m[3] || "").toUpperCase(), l: label.toUpperCase() });
    if (out.length >= 3) break;
  }
  return out;
}

// ---- scene-slot casting ---------------------------------------------------------
// A template's scene list is a GRAMMAR, not a fixed reel: an opener, some content
// shapes, a closer. Classify each authored slot so the user's film keeps that
// dramatic arc at any length.
function classifySlots(tplScenes) {
  const isOutro = (t, i) =>
    i === tplScenes.length - 1 &&
    (Object.prototype.hasOwnProperty.call(t, "cta") || Object.prototype.hasOwnProperty.call(t, "url") ||
     /cta|outro|end|close/i.test(String(t.name)));
  const isIntro = (t, i) =>
    i === 0 &&
    (Object.prototype.hasOwnProperty.call(t, "brand") || Object.prototype.hasOwnProperty.call(t, "tagline") ||
     /title|intro|open|brand|logo|hook/i.test(String(t.name)));
  let intro = null, outro = null;
  const middle = [];
  tplScenes.forEach((t, i) => {
    if (!intro && isIntro(t, i)) { intro = t; return; }
    if (!outro && isOutro(t, i)) { outro = t; return; }
    middle.push(t);
  });
  if (!middle.length) middle.push(...tplScenes);   // degenerate template — never starve
  return { intro, outro, middle };
}

/**
 * Merge the user's storyboard into the template's authored scene sequence.
 *
 * The template's ARC is preserved — opener first, closer last — while its
 * CONTENT scenes repeat as needed to cover the user's storyboard. The previous
 * mapping was a plain modulo over the whole list, and on a 6-slot template an
 * 8-scene film re-ran the Title mid-film (it read as "the template restarted"),
 * fired the CTA at 17s, and ENDED on a content scene instead of the close.
 */
function buildScenes({ tplScenes, scenes, assets, brand, url, tfx, land, accent }) {
  const { intro, outro, middle } = classifySlots(tplScenes);
  // Uppercase the COPY rather than relying on a CSS rule. These films are React
  // components that set type inline on their own elements, so a stylesheet hook
  // means guessing at their markup — and a guess that misses fails silently, with
  // the frame still looking plausible. Transforming the text is exact.
  const UP = String((tfx || {}).case || "").toLowerCase() === "upper";
  const up = (v) => (UP && typeof v === "string" ? v.toUpperCase() : v);
  const pool = (Array.isArray(assets) ? assets : []).filter(plateOk)
    .sort((a, b) => ((isShot(b) ? 1 : 0) - (isShot(a) ? 1 : 0)) || ((Number(b.cdScore) || 0) - (Number(a.cdScore) || 0)));
  const logo = (Array.isArray(assets) ? assets : []).find(isLogo) || null;
  const byScene = new Map();
  const free = [];
  for (const a of pool) {
    if (a === logo) continue;
    const sid = a.sceneId != null ? String(a.sceneId) : null;
    if (sid && !byScene.has(sid)) byScene.set(sid, a); else free.push(a);
  }
  let fi = 0;
  const take = (pred) => {
    for (let k = fi; k < free.length; k++) if (!pred || pred(free[k])) { const a = free[k]; free.splice(k, 1); return a; }
    return null;
  };

  // Which authored slot renders user scene i:
  //   first  -> the opener (when the template has one)
  //   last   -> the closer (when the template has one)  — the film always ENDS
  //             on the CTA; it never fires mid-film and Title never re-runs
  //   middle -> the content shapes, cycled — but only shapes the scene can FILL.
  //             A statless scene on the Stats slide (or a bulletless one on a
  //             chips slide) renders acres of nothing; walk forward to the first
  //             shape whose demands the scene's own copy meets.
  const canFill = (t, sc) => {
    const hasK = (k) => Object.prototype.hasOwnProperty.call(t, k);
    if (hasK("stats") && !(statsFor(sc).length || minedStats(sc).length)) return false;
    if ((hasK("chips") || hasK("items")) && bullets(sc, 2).length < 2) return false;
    return true;
  };
  const slotFor = (i, sc) => {
    const last = scenes.length - 1;
    if (i === 0 && intro) return intro;
    if (i === last && outro) return outro;
    const k = ((i - (intro ? 1 : 0)) % middle.length + middle.length) % middle.length;
    for (let step = 0; step < middle.length; step++) {
      const t = middle[(k + step) % middle.length];
      if (canFill(t, sc)) return t;
    }
    return middle[k] || tplScenes[0] || {};
  };

  return scenes.map((sc, i) => {
    const tpl = slotFor(i, sc);
    const sid = sc.id != null ? String(sc.id) : `s${i + 1}`;
    const out = { name: tpl.name, dur: Math.max(1.2, Number(sc.duration) || 4) };

    // Copy — only fields THIS template's scene actually uses, so we never invent
    // furniture the design does not have.
    //
    // NEVER fall back to the template's own demo copy (`tpl.X`). Those defaults
    // are another product's words: a real film shipped its opener as
    // "FETCH — Every good boy delivers." and its CTA button as "GET FETCH"
    // because the user scene lacked those fields. A thinner slide in the user's
    // own words always beats a full slide in the demo brand's.
    const has = (k) => Object.prototype.hasOwnProperty.call(tpl, k);
    const line1 = () => sc.headline || sc.title || bullets(sc, 1)[0] || "";
    if (has("brand")) out.brand = up(fit(brand, 18));
    if (has("tagline")) out.tagline = fit(line1() || sc.subtext || "", 40);
    if (has("headline")) out.headline = up(breakHeadline(line1(), 52, land));
    if (has("kicker")) out.kicker = fit(sc.kicker || sc.purpose || "", 20).toUpperCase();
    if (has("eyebrow")) out.eyebrow = fit(sc.eyebrow || sc.kicker || sc.purpose || "", 26).toUpperCase();
    if (has("body")) out.body = fit(sc.body || sc.subtext || "", 120);
    if (has("sub")) out.sub = fit(sc.subtext || sc.body || "", 120);
    if (has("callout")) out.callout = up(fit(bullets(sc, 1)[0] || sc.callout || "", 22));
    if (has("calloutNum")) out.calloutNum = tpl.calloutNum || "1";   // a slide number, not copy
    if (has("cta")) out.cta = fit(sc.cta || sc.ctaLabel || `GET ${brand}`, 20).toUpperCase();
    if (has("url")) out.url = url;
    if (has("quote")) out.quote = fit(sc.quote || sc.subtext || sc.voiceover || "", 140);
    if (has("author")) out.author = fit(sc.author || brand, 24);
    if (has("chips")) out.chips = bullets(sc, 4);
    if (has("items")) out.items = bullets(sc, 4);
    // Template-specific text props discovered in the compiled films — each is
    // demo-brand copy if left authored (Drive's CTA road sign, Flight's Gate
    // lead line, Fight's combo list, Hacker's terminal stamp/command).
    if (has("lead")) out.lead = fit(sc.subtext || sc.body || line1(), 90);
    if (has("sign")) out.sign = up(fit(brand, 16));
    if (has("combos")) { const bl = bullets(sc, 3); if (bl.length) out.combos = bl; }
    if (has("stamp")) out.stamp = fit(sc.kicker || sc.purpose || "ACCESS GRANTED", 24).toUpperCase();
    if (has("cmd")) out.cmd = `> get ${brand.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
    // Stats must be TRUE. The demo numbers are another product's figures, so a
    // scene with no numbers of its own renders none rather than borrowing them.
    if (has("stats")) { const st = statsFor(sc); out.stats = st.length ? st : minedStats(sc); }

    // TEAMPULSE-CLASS SLOTS. Films name their copy slots differently — words /
    // pains / feats / tags / caps / roster / ticker / pill / text. Anything left
    // unmapped is blanked to " " by the suppression pass below, so an unmapped
    // slot is not demo copy but an EMPTY frame. Map them onto the scene's own
    // words. Note these films take word lists as a "|"-separated STRING, not an
    // array (verified in the authored defaults: "WORK|SHOULD|SLAP.").
    const listStr = (n, max) => { const b = bullets(sc, n).map((x) => fit(x, max || 18)); return b.length ? b.join("|") : ""; };
    if (has("words")) out.words = listStr(3, 14) || twoLines(sc.headline || "", 30);
    if (has("pains")) out.pains = listStr(3, 26);
    if (has("feats")) out.feats = listStr(4, 26);
    if (has("tags")) out.tags = listStr(4, 16);
    if (has("caps")) out.caps = listStr(4, 22);
    if (has("roster")) out.roster = listStr(4, 18);
    if (has("text")) out.text = fit(sc.headline || sc.subtext || "", 90);
    if (has("quoteBy")) out.quoteBy = fit(sc.author || sc.by || brand, 24);
    if (has("by")) out.by = fit(sc.author || sc.by || brand, 24);
    if (has("brand")) out.brand = brand;
    if (has("pill")) out.pill = fit(sc.kicker || sc.purpose || "", 20).toUpperCase();
    // The ticker is a repeating marquee — the film's subject reads as branding,
    // where a scene line would read as stray copy.
    if (has("ticker")) out.ticker = fit(String(brand), 40).toUpperCase();

    // SUPPRESS COMPILED FALLBACKS. The films read fields as `s.X || <authored
    // demo copy>` INSIDE the compiled components, so a mapped-but-EMPTY string
    // still surfaces the demo brand's line (verified live: a statless scene's
    // empty `sub` rendered "…a leaderboard for the goodest boys"). A single
    // space is truthy, renders as nothing, and costs one byte of the 16KB cap.
    for (const k of Object.keys(out)) {
      if (typeof out[k] === "string" && out[k] === "") out[k] = " ";
    }
    // …and any authored STRING field this scene declares that we did not map at
    // all gets the same one-space blank — whatever it is, it is the demo
    // product's words, and neutral emptiness beats another brand's copy.
    for (const k of Object.keys(tpl)) {
      if (k === "name" || k === "dur" || k === "nat") continue;
      if (typeof tpl[k] === "string" && out[k] === undefined) out[k] = " ";
    }

    // Media — a scene-pinned asset wins, then the pool. Every compiled film
    // reads `shot` (verified across all 17 decoded bundles) and its walls read
    // shot1..N — but the authored OM_SCENES never DECLARE media fields, so
    // has("shotN") is always false and only the scene NAME can tell us a wall
    // is present. The name list below is the full set discovered in the
    // compiled code (the old /montage|gallery|fleet/ regex missed eight of
    // them, which is one way gallery walls shipped as placeholder hatching).
    const pinned = byScene.get(sid) || null;
    const wantsPhone = /mobile|phone|pocket/i.test(String(tpl.name));
    const primary = pinned || (wantsPhone ? take(isPortraitAsset) : take((a) => !isPortraitAsset(a))) || take();
    if (primary) out.shot = primary.path;
    const WALL = /montage|gallery|fleet|wall|grid|explore|billboard|spread|cruise|deploy|sighting|line|assemble/i;
    if (WALL.test(String(tpl.name))) {
      const wall = [];
      for (let n = 1; n <= 6; n++) {
        const a = take();
        if (!a) break;
        out[`shot${n}`] = a.path;
        wall.push(a.path);
      }
      // Momentum's Gallery reads shotA/shotB instead of shot1/shot2 — feed both
      // namings; unread fields are ignored by every other film.
      if (wall[0]) out.shotA = wall[0];
      if (wall[1]) out.shotB = wall[1];
    }
    // The CTA logo box renders UNCONDITIONALLY: with no s.logo it draws a
    // hatched "LOGO / DROP IMAGE TO REPLACE" placeholder in the middle of the
    // user's closing frame. A real logo asset wins; otherwise a generated brand
    // monogram — never the placeholder.
    out.logo = logo ? logo.path : monogram(brand, accent);
    return out;
  });
}

// A tiny inline SVG mark — the brand's initial on the accent colour. Kept
// minimal on purpose: OM_SCENES must stay under the engine's 16KB cap, and this
// is ~250 chars.
function monogram(brand, accent) {
  const ch = (String(brand || "").trim()[0] || "K").toUpperCase();
  const bg = /^#[0-9a-f]{3,8}$/i.test(String(accent || "")) ? accent : "#1A1A1A";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="${bg}"/><text x="50" y="50" font-family="Arial,Helvetica,sans-serif" font-size="58" font-weight="800" fill="#FFFFFF" text-anchor="middle" dominant-baseline="central">${ch}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Build a composition that renders `storyboard` inside the named template.
 * Returns the same { indexHtml, metaJson, mediaPlan } shape every dedicated
 * composer returns, so composeWithPackRenderer needs no special-casing.
 */
function buildComposition({ storyboard, dims, framePack, assets, template, manifest } = {}) {
  // composeWithPackRenderer passes framePack (the SLUG, e.g. "reel"); the
  // template file is named by the manifest ("Reel"). Resolve through the
  // manifest so a pack only has to declare `template` once, in pack.json.
  let tplName = template || (manifest && manifest.template) || null;
  if (!tplName && framePack) {
    try { tplName = (require("./frame_manifest").getManifest(framePack) || {}).template || null; }
    catch { /* fall through to the slug */ }
  }
  tplName = tplName || framePack;
  // Per-pack typographic treatment. Resolved here rather than trusted from opts:
  // neither pipeline.composeWithPackRenderer nor the preview generator passes a
  // manifest, so an opts-only read yields nothing on every real path.
  let tfx = (manifest && manifest.textfx) || null;
  if (!tfx && framePack) {
    try { tfx = ((require("./frame_manifest").getManifest(framePack) || {}).textfx) || null; }
    catch { /* no manifest — render the template's own type unchanged */ }
  }
  const file = templatePath(tplName);
  if (!file) throw new Error(`omelette: template "${tplName}" not found in ${TPL_DIR}`);
  let html = fs.readFileSync(file, "utf8");

  const sb = storyboard || {};
  const reqW = (dims && dims.width) || 1920, reqH = (dims && dims.height) || 1080;
  // COMPOSE AT THE TEMPLATE'S NATIVE CANVAS (1920x1080 / 1080x1920).
  //
  // These films lay type out in absolute px against their authored canvas, and
  // the engine fits them with scale = min(cw/filmW, (ch - 44)/filmH), reserving
  // 44px for its playback bar. At any OTHER size that reserve makes the film
  // land short — measured: a 720x1280 render of a 1080x1920 film scaled to
  // 0.64375, filling 695x1236 of a 720x1280 frame, with the bar in shot.
  // Overriding the engine's scale afterwards never held (React recomputes it),
  // and resizing its container did not reach the element it measures.
  //
  // At native, that same arithmetic solves to exactly 1 — no override, no fight.
  // The page is sized 44px taller so the reserve cancels and the bar renders
  // BELOW #root, which is clipped to the native canvas. The finished video is
  // simply encoded at native resolution, which is never worse than the request.
  // Native canvas is a property of the TEMPLATE, not of what the caller asked
  // for. Deriving it from the requested aspect meant a portrait template asked
  // for at 1280x720 composed landscape (and vice versa) — the film would then be
  // cropped into the wrong frame. These four are the 9:16 editions; every other
  // template in the set is authored 16:9.
  const PORTRAIT_TEMPLATES = new Set(["Reel", "FetchVertical", "FlightVertical", "ShowcaseVertical", "Teampulse"]);
  const nativePortrait = PORTRAIT_TEMPLATES.has(String(tplName)) || (reqH > reqW && !/Vertical|Reel/.test(String(tplName)) === false);
  const W = nativePortrait ? 1080 : 1920;
  const H = nativePortrait ? 1920 : 1080;
  const scenes = Array.isArray(sb.scenes) && sb.scenes.length ? sb.scenes.slice(0, 30) : [{ id: "s1", duration: 4, headline: sb.title || "" }];
  const D = Math.round((scenes.reduce((a, s) => a + Math.max(1.2, Number(s.duration) || 4), 0)) * 100) / 100;

  // OWNER sources only. topic-screenshots are captures of OTHER products'
  // reference sites, so deriving the film's URL from one printed a COMPETITOR'S
  // domain on the CTA — a real Lumen film closed on "reflect.app" because its
  // topic shots were of reflect/notion/mem.
  const host = (Array.isArray(assets) ? assets : [])
    .filter((a) => a && a.sourceUrl && /^(website|website-image|blog)$/.test(String(a.source)))
    .map((a) => { try { return new URL(a.sourceUrl).hostname.replace(/^www\./, ""); } catch { return null; } })
    .find(Boolean);
  const brand = String(sb.brand || sb.title || (host ? host.split(".")[0] : "") || "STUDIO").slice(0, 18);
  const url = String(sb.url || host || `${brand.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`).slice(0, 40);

  const tplScenes = readTemplateScenes(html);
  if (!tplScenes || !tplScenes.length) throw new Error(`omelette: template "${tplName}" exposes no OM_SCENES`);
  // The template's accent colour (for the monogram fallback) lives in its
  // OM_TWEAKS — either form (quoted string or EDITMODE object literal).
  const accent = (() => {
    const m = /window\.OM_TWEAKS\s*=\s*(?:'([\s\S]*?)'|\/\*EDITMODE-BEGIN\*\/([\s\S]*?)\/\*EDITMODE-END\*\/)/.exec(html);
    if (!m) return null;
    try { return (JSON.parse(m[1] || m[2]) || {}).accent || null; } catch { return null; }
  })();

  let omScenes = buildScenes({ tplScenes, scenes, assets, brand, url, tfx, land: W > H, accent });

  // HARD ENGINE LIMIT: ssParse rejects an OM_SCENES string over 16KB (or >50
  // scenes) by rendering a full-frame ERROR SLATE for the whole film — worse
  // than any trimmed field could ever be. Shed weight in quality order until it
  // fits: gallery walls first, then long copy, then whole tail scenes.
  const fits = () => JSON.stringify(JSON.stringify(omScenes)).length < 15500;
  if (!fits()) {
    for (const s of omScenes) { for (let n = 1; n <= 6; n++) delete s[`shot${n}`]; delete s.shotA; delete s.shotB; if (fits()) break; }
  }
  if (!fits()) {
    for (const s of omScenes) { for (const k of ["body", "sub", "quote"]) if (typeof s[k] === "string") s[k] = fit(s[k], 60); if (fits()) break; }
  }
  while (!fits() && omScenes.length > 2) omScenes.splice(omScenes.length - 2, 1);   // drop content scenes, keep the closer

  // 1 — swap the scene list. It lives in a plain inline <script> in the page
  // HTML, which the bundler stores JSON-encoded inside __bundler/template.
  const payload = JSON.stringify(JSON.stringify(omScenes));      // the film reads a STRING
  html = html.replace(/<script type="__bundler\/template"[^>]*>([\s\S]*?)<\/script>/i, (full, body) => {
    let page;
    try { page = JSON.parse(body); } catch { return full; }
    page = page.replace(/window\.OM_SCENES\s*=\s*'[\s\S]*?'\s*;/, `window.OM_SCENES = ${payload};`);
    // OM_TWEAKS drives the PERSISTENT chrome — the brand mark and URL pinned to
    // every frame — and ships in TWO forms. Some templates store it as a quoted
    // JSON string; others (Fetch et al) as a raw object literal wrapped in
    // /*EDITMODE-BEGIN*/…/*EDITMODE-END*/ markers. The old quoted-only regex
    // silently missed the second form, so the demo brand ("Fetch" / fetch.dog)
    // stayed in the corner of every frame of the user's film. MERGE rather than
    // replace: the object also carries template-specific knobs (accent,
    // dogColor, …) that the design needs.
    const mergeTweaks = (raw) => {
      let cur = {};
      try { cur = JSON.parse(raw) || {}; } catch { /* keep {} — still brand-correct */ }
      return { ...cur, brandName: brand, url };
    };
    page = page.replace(
      /window\.OM_TWEAKS\s*=\s*'([\s\S]*?)'\s*;/,
      (_, raw) => `window.OM_TWEAKS = ${JSON.stringify(JSON.stringify(mergeTweaks(raw)))};`,
    );
    page = page.replace(
      /window\.OM_TWEAKS\s*=\s*\/\*EDITMODE-BEGIN\*\/([\s\S]*?)\/\*EDITMODE-END\*\//,
      (_, raw) => `window.OM_TWEAKS = /*EDITMODE-BEGIN*/${JSON.stringify(mergeTweaks(raw))}/*EDITMODE-END*/`,
    );
    // `/` MUST be escaped on the way back in. The page HTML contains literal
    // "</script>" sequences; JSON.stringify does not escape the slash, so the
    // re-embedded JSON would close this very <script> tag early and the block
    // would parse as truncated garbage (the film then never mounts). The bundler
    // itself writes them as </script> for exactly this reason — `\/` is a
    // valid JSON escape, so this stays parseable.
    return `<script type="__bundler/template">${JSON.stringify(page).replace(/<\//g, "<\\/")}</script>`;
  });

  // 2/3/4 — the render harness. Injected at the very end of <body> so it runs
  // after the bundler has mounted the film.
  const tfxCss = (() => {
    if (!tfx) return "";
    const rules = [];
    if (String(tfx.case).toLowerCase() === "upper") rules.push("text-transform:uppercase !important");
    const w = Number(tfx.weight);
    if (Number.isFinite(w) && w >= 100 && w <= 900) rules.push(`font-weight:${Math.round(w)} !important`);
    const tr = Number(tfx.tracking);
    if (Number.isFinite(tr) && Math.abs(tr) <= 0.5) rules.push(`letter-spacing:${tr}em !important`);
    if (!rules.length) return "";
    // Headlines only: the templates draw them at >=34px, while eyebrows, URLs and
    // callout labels are small mono runs that are already styled deliberately.
    return `
#root [style*="font-size"]{}
#root h1,#root h2,#root [style*="font-weight:700"],#root [style*="font-weight: 700"]{${rules.join(";")};}
`;
  })();

  const harness = `
<div id="cap-pill" style="position:absolute;left:8%;right:8%;bottom:6%;text-align:center;font-family:system-ui,sans-serif;font-weight:700;font-size:${Math.round(H * 0.028)}px;line-height:1.3;color:#fff;text-shadow:0 2px 12px rgba(0,0,0,.75);opacity:0;z-index:60;"></div>
<style>
  /* The playback bar is drawn by the ENGINE (animations-v2.jsx), not the film —
     which is why grepping the film sources for "PlaybackBar" found nothing while
     the bar still appeared in every export.
     It cannot simply be display:none'd: the engine's auto-scale reserves exactly
     44px for it (barH = 44; scale = min(w/W, (h - barH)/H)), so hiding it alone
     leaves the film letterboxed by that reserve.
     So instead the PAGE is made 44px TALLER than the film. The engine then solves
     scale = min(W/W, (H+44-44)/H) = 1 — a pixel-exact fit — and the bar renders
     BELOW the film, outside #root, which is clipped to exactly H. The renderer
     captures #root, so the bar can never reach the video. */
  html,body { margin:0; padding:0; overflow:hidden; background:#000; width:${W}px; height:${H + 44}px; }
  /* Neutralise the engine's auto-scale outright. It solves
     scale = min(w/W, (h - 44)/H) against the VIEWPORT, reserving 44px for its
     playback bar — so the film shrinks and letterboxes whenever the host sizes
     the page to exactly WxH (which the preview renderer does). Pinning the stage
     to WxH at scale 1 makes the fit independent of however the host measures. */
  /* The engine reserves 44px for its playback bar when auto-scaling
     (scale = min(w/W, (h - 44)/H)), so the page is sized 44px taller than the
     film: the fit then lands at 1 and the bar renders BELOW #root, outside the
     captured element. Verified good for LANDSCAPE. Vertical still mis-fits —
     see the note at the top of this file. */
  #kf-comp-root { overflow:hidden !important; }
  #kf-comp-root { overflow:hidden !important; }
  ${tfxCss}
  /* Belt and braces for builds that mark the transport explicitly. */
  [data-om-playback], .om-playbar, .om-playback-bar { display:none !important; }
</style>
<script>
(function(){
  var W=${W}, H=${H}, D=${D};
  // Walk from #root up to <body>, hiding every sibling subtree along the way.
  // The stage's ancestors stay untouched (the engine's auto-scale reads the
  // VIEWPORT, not its siblings), so the film keeps its scale-1 fit while the
  // transport bar — and any other engine chrome — stops painting. Re-applied on
  // every seek because the film is React and re-commits its tree each frame.
  function hideChrome(){
    try{
      var node=document.getElementById('kf-comp-root');
      if(!node) return;
      node.style.setProperty('position','absolute','important');
      node.style.setProperty('left','0','important');
      node.style.setProperty('top','0','important');
      while(node && node.parentElement && node.parentElement!==document.documentElement){
        var par=node.parentElement, kids=par.children;
        for(var i=0;i<kids.length;i++){
          if(kids[i]!==node) kids[i].style.setProperty('display','none','important');
        }
        node=par;
      }
    }catch(e){}
  }
  function boot(){
    var el=document.querySelector('[data-om-exportable-video-with-duration-secs]');
    if(!el){ return setTimeout(boot, 120); }
    // THE COMPOSITION ROOT MUST BE BUILT HERE, NOT IN THE STATIC HTML.
    // The bundler replaces document.body's contents when it mounts the film, so
    // a <div id="root"> written into the source markup is destroyed before the
    // renderer ever looks for it — HyperFrames then finds no composition and
    // reports "Composition has zero duration" despite a perfectly healthy film.
    // Wrapping the mounted stage AFTER boot survives, and wrapping the stage
    // ONLY (not its container) leaves the engine's playback bar outside the
    // captured element, where it can never reach the video.
    if(!document.getElementById('kf-comp-root')){
      var wrap=document.createElement('div');
      wrap.id='kf-comp-root'; wrap.className='composition';
      wrap.setAttribute('data-composition-id','vid');
      wrap.setAttribute('data-width',W); wrap.setAttribute('data-height',H);
      wrap.setAttribute('data-start','0'); wrap.setAttribute('data-duration',D);
      wrap.style.cssText='position:relative;width:'+W+'px;height:'+H+'px;overflow:hidden;';
      el.parentElement.insertBefore(wrap, el);
      // The compensating transform must NOT sit on the composition root: the
      // renderer measures that element, and scaling it inflated its box to
      // 2002x1126 for a 1920x1080 composition — which is what made the output
      // aspect wrong. Root keeps its exact declared box; an inner layer carries
      // the fit.
      var fitLayer=document.createElement('div');
      fitLayer.id='kf-fit';
      fitLayer.style.cssText='position:absolute;left:0;top:0;width:'+W+'px;height:'+H+'px;transform-origin:0 0;';
      wrap.appendChild(fitLayer);
      fitLayer.appendChild(el);
      // Subtitle node — required by the render contract (check:templates looks
      // for #cap-pill) and by baked-caption jobs. Lives INSIDE #root so it is
      // captured with the film; driven by the seeked cue lookup below.
      var cap=document.getElementById('cap-pill');
      if(cap) wrap.appendChild(cap);   // move it INSIDE the captured root
      // The engine's playback bar is a SIBLING of the stage inside its container.
      // Hiding it by class name is guesswork (verified: the bar node carries
      // className "" and matches none of the data-om-playback/.om-playbar hooks
      // below); hiding every sibling that is not on the path to our wrapper is
      // exact. It has to happen even though the bar sits OUTSIDE #root — the
      // renderer captures the PAGE, not the #root element, so anything left
      // painted above or below the film lands in the video.
      hideChrome();
    }
    // AUTOFIT — these templates draw headlines at a FIXED px (e.g. 190 in a 960px
    // column) with no fit-to-width, so long copy overruns and crops. Shrink any
    // headline-scale run to fit its column. Must run AFTER every seek: the film is
    // React and re-commits the authored font-size on each frame, wiping our value —
    // so we re-measure from the authored size each frame (cheap, a few nodes).
    // Layout metrics (scroll/clientWidth) are pre-transform, so the stage's
    // scale() does not skew the math.
    // FIT THE FRAME by MEASUREMENT, on OUR OWN wrapper.
    // Controlling the engine's scale never held: it recomputes the stage
    // transform on every React commit, the container it measures sits behind
    // sc-host shadow boundaries, and its 44px playback-bar reserve leaves the
    // film short even at native size (measured 0.977083 = (1920-44)/1920).
    // #root is ours and React never writes to it — so rather than dictate the
    // engine's scale, measure what it produced and map that rect onto the frame.
    // Correct for any scale the engine picks, and it also pulls the film flush to
    // 0,0 (the engine centres it, which is where the offsets came from).
    function fitFrame(){
      try{
        var wrapEl=document.getElementById('kf-comp-root');
        var fitEl=document.getElementById('kf-fit');
        if(!wrapEl||!fitEl||!el) return;
        fitEl.style.transform='none';                // measure the true rect first
        var wr=wrapEl.getBoundingClientRect(), sr=el.getBoundingClientRect();
        if(sr.width<2||sr.height<2) return;
        var k=Math.min(W/sr.width,H/sr.height);
        if(!isFinite(k)||k<=0) return;
        var dx=sr.left-wr.left, dy=sr.top-wr.top;
        fitEl.style.transformOrigin='0 0';
        fitEl.style.transform='translate('+(-dx*k).toFixed(2)+'px,'+(-dy*k).toFixed(2)+'px) scale('+k.toFixed(6)+')';
      }catch(e){}
    }
    function autofit(){
      try{
        var canvasW=el.clientWidth||el.getBoundingClientRect().width||0;
        if(!canvasW) return;
        var thr=canvasW*0.075;                 // headline-scale text only (~80px @1080)
        var nodes=el.querySelectorAll('[style]');
        for(var i=0;i<nodes.length;i++){
          var n=nodes[i];
          var fs=parseFloat(getComputedStyle(n).fontSize)||0;
          if(fs<thr) continue;
          var p=n.parentElement;
          if(p && (parseFloat(getComputedStyle(p).fontSize)||0)>=thr) continue; // topmost big-font node only
          if(!(n.textContent||'').replace(/\s+/g,'')) continue;
          // Keep each authored "|" segment on ONE line so an over-long line shrinks
          // rather than wrapping into extra rows; measure the widest segment.
          var kids=n.children,need=0,k;
          if(kids.length){ for(k=0;k<kids.length;k++){ kids[k].style.whiteSpace='nowrap'; need=Math.max(need,kids[k].scrollWidth);} }
          else { n.style.whiteSpace='nowrap'; need=n.scrollWidth; }
          var cw=n.clientWidth||0;
          var avail=(cw>0 && cw<canvasW)?cw:canvasW*0.92;   // bounded column, else canvas w/ margin
          if(need>avail && avail>0){
            var target=Math.max(canvasW*0.03, fs*(avail/need)*0.97);
            n.style.setProperty('font-size',target.toFixed(1)+'px','important');
            var need2=0;                                     // one correction pass for non-linear residue
            if(kids.length){ for(k=0;k<kids.length;k++){ need2=Math.max(need2,kids[k].scrollWidth);} } else { need2=n.scrollWidth; }
            if(need2>avail){ n.style.setProperty('font-size',Math.max(canvasW*0.03,target*(avail/need2)*0.97).toFixed(1)+'px','important'); }
          }
        }
      }catch(e){}
    }
    // The engine's own duration governs the film; ours governs the render.
    var cur=0;
    function seek(t){
      cur=Math.max(0,Math.min(D,Number(t)||0));
      el.dispatchEvent(new CustomEvent('data-om-seek-to-time-frame',{detail:{time:cur,sync:true}}));
    }
    var tl={
      duration:function(){return D;},
      time:function(t){ if(t===undefined) return cur; seek(t); return tl; },
      seek:function(t){ seek(t); return tl; },
      progress:function(p){ if(p===undefined) return D?cur/D:0; seek((Number(p)||0)*D); return tl; },
      pause:function(){return tl;}, play:function(){return tl;}, kill:function(){}, totalDuration:function(){return D;}
    };
    window.__timelines=window.__timelines||{};
    window.__timelines["vid"]=tl;
    // Caption cues, seeked exactly like the film.
    var CUES=window.__KF_CUES||[];
    var capEl=document.getElementById('cap-pill');
    var _seek=seek;
    seek=function(t){
      _seek(t);
      fitFrame();
      autofit();
      hideChrome();
      if(!capEl) return;
      var cur=null;
      for(var i=0;i<CUES.length;i++){ if(cur===null && t>=CUES[i].t && t<CUES[i].e) cur=CUES[i]; }
      if(cur){ if(capEl.textContent!==cur.x) capEl.textContent=cur.x; capEl.style.opacity='1'; }
      else { capEl.style.opacity='0'; }
    };
    seek(0);
    fitFrame();
    hideChrome();
    document.documentElement.setAttribute('data-om-ready','1');
  }
  boot();
})();
</script>`;

  // The LIVE root contract is stamped by the harness AFTER the film mounts (see
  // boot()) — a static wrapper does not survive the bundler replacing
  // document.body, so it cannot be the thing that gets captured.
  //
  // But the RENDER DIMENSIONS are resolved from the markup HyperFrames parses,
  // NOT from the live DOM. Measured on drive-highway (a 1920x1080 pack): with
  // the runtime contract deliberately stamped 800x600 and meta.json saying
  // 1920x1080, it still rendered 1080x1920 — the template's native portrait
  // canvas — so BOTH were being ignored. Every omelette pack therefore rendered
  // 9:16 regardless of its declared size, which is why the 11 landscape packs
  // came out as a small letterboxed film floating in a portrait frame (and read
  // as a mostly-black card in the Templates gallery). Scene-kit packs declare
  // #root statically and have always rendered at their declared size — that
  // difference is the whole bug.
  //
  // So: declare the contract STATICALLY too, purely so the parse-time dimension
  // lookup finds the right numbers. The bundler wipes it moments later and
  // boot() builds the real captured root, so this node never has to render.
  // Verified: drive-highway 1080x1920 -> 1920x1080, film filling the frame.
  const staticContract =
    `<div class="composition" data-composition-id="vid" data-width="${W}" data-height="${H}" ` +
    `data-start="0" data-duration="${D}" ` +
    `style="position:absolute;left:0;top:0;width:${W}px;height:${H}px;overflow:hidden;"></div>`;
  html = html.replace(/<body([^>]*)>/i, `<body$1>${staticContract}`);
  html = html.replace(/<\/body>/i, `${harness}</body>`);

  const metaJson = JSON.stringify({ compositionId: "vid", width: W, height: H, fps: (dims && dims.fps) || 30, duration: D });
  // Media coverage: one demand per scene that carries a shot, filled when the
  // path is real. Keeps the same stamp shape the other composers report.
  const plan = omScenes.map((s, i) => {
    const wall = Object.keys(s).filter((k) => /^shot([1-6]|A|B)$/.test(k)).length;
    const n = (s.shot ? 1 : 0) + wall;
    return {
      sceneIndex: i, sceneId: (scenes[i] && scenes[i].id) || `s${i + 1}`, sceneType: s.name,
      need: n ? Array(n).fill("desktop") : [], filled: n,
    };
  });
  const totals = plan.reduce((t, p) => ({ demand: t.demand + p.need.length, filled: t.filled + p.filled, empty: 0, scenes: plan.length }), { demand: 0, filled: 0, empty: 0, scenes: plan.length });
  totals.empty = totals.demand - totals.filled;

  return { indexHtml: html, metaJson, mediaPlan: { plan, totals } };
}

function planMedia(opts) { return buildComposition(opts).mediaPlan; }
function listTemplates() {
  try { return fs.readdirSync(TPL_DIR).filter((f) => f.endsWith(".html")).map((f) => f.replace(/\.html$/, "")); }
  catch { return []; }
}

module.exports = { buildComposition, planMedia, listTemplates, readTemplateScenes, templatePath, TPL_DIR };
