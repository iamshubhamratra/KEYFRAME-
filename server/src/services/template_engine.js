// TEMPLATE ENGINE — the shared, proven skeleton every FAMILY template composer
// is built on.
//
// Background: scene_kit routes all 56 skin-only packs through ONE shared set of
// archetypes (archHook / archFeatureGrid / archStat / …), so every pack draws the
// same furniture — the card row users recognise across unrelated films. A pack
// only looks different if it owns its SCENE GRAMMAR, the way the momentum
// template does (momentum_composer.js). Authoring that grammar 56 times is the
// design work; re-implementing the RENDER CONTRACT 56 times is how blank frames,
// dead seeks and black tails get shipped. So the contract lives here, once.
//
// A family composer supplies only design:
//   theme(manifest, brandSkin)  -> palette/fonts/etc (its own shape, passed through)
//   styleBlock(theme, land)     -> CSS
//   chrome(ctx)                 -> { html, script } persistent layers (optional)
//   SCENES { <type>: (scene, ctx, assetA, assetB) => ({ html, s }) }
//   TEMPLATE_SCENES             -> the published vocabulary (Template Director)
//   route(scene, i, total, ctx) -> a type name (deterministic fallback router)
//
// The engine owns everything else and guarantees, for every film it builds:
//   * one paused GSAP timeline registered as window.__timelines["vid"]
//   * direct-child .clip scenes on disjoint tracks, hard opacity:0 kill at each
//     scene end, and the LAST clip's window extended past the timeline end (an
//     exact-D boundary renders the final frame black)
//   * hidden state is opacity:0 ONLY — every from-state lives in gsap.fromTo
//   * finite repeats (reps()), so a seek never lands mid-infinite-tween
//   * a single seeked caption node (never one clip per cue)
//   * deterministic output: every per-frame value is a pure function of tl.time()
//
// It also applies the Template Director's cast (services/template_director.js):
// slot copy overlays the scene, cast assets fill the media slots, and anything
// uncast falls back to the family's own router — so a family works with the
// director on or off.

// The one shared motion vocabulary. A family opts in by declaring `motion`
// (see family_bright) and the engine emits the presets for it — so the timing,
// easing and physics of a card or a headline are identical in every template.
const motion = require("./motion_presets");
const { displayOk } = require("./asset_admission");

const r = (n) => Math.round((Number(n) || 0) * 100) / 100;

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ---- colour helpers (every family needs these) --------------------------------
function hexToRgb(h) {
  h = String(h || "").replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  if (!isFinite(n)) return [255, 255, 255];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgba(h, a) { const [rr, g, b] = hexToRgb(h); return `rgba(${rr},${g},${b},${a})`; }
function lum(h) {
  const c = hexToRgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function isDark(h) { return lum(h) < 0.45; }
function contrastRatio(a, b) {
  const l1 = lum(a), l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
// Pick the ink that ACTUALLY reads on this background. A luminance threshold gets
// mid-tone accents wrong (a saturated amber sits right at the boundary, where the
// "correct" side by luminance can still be the lower-contrast choice).
function inkOn(bg, darkInk, lightInk) {
  const dark = darkInk || "#141210", light = lightInk || "#F7F5F0";
  return contrastRatio(dark, bg) >= contrastRatio(light, bg) ? dark : light;
}
// Composite a colour at `alpha` over `bg` — what the eye actually sees.
function flatten(fg, bg, alpha) {
  const F = hexToRgb(fg), B = hexToRgb(bg);
  const c = F.map((v, i) => Math.round(v * alpha + B[i] * (1 - alpha)));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
// TEXT THAT READS, guaranteed. Returns a colour whose COMPOSITED appearance on
// `bg` clears `target` contrast if that is reachable: it first drops the alpha
// (a 0.82-alpha ink on a saturated accent measured 3.63:1 where the same ink at
// full strength measured 4.60:1 — that exact regression shipped), then pushes the
// ink toward black or white until it clears or clamps. Body copy on a coloured
// panel must go through here.
function readable(bg, ink, alpha = 1, target = 4.5) {
  const base = ink || inkOn(bg);
  if (contrastRatio(flatten(base, bg, alpha), bg) >= target) return alpha >= 1 ? base : rgba(base, alpha);
  if (contrastRatio(base, bg) >= target) return base;                 // full strength is enough
  // Try BOTH directions. Picking one by luminance fails when the caller's ink
  // candidates are both dark (a light-ground pack passes its dark ink as the
  // "light" option): on a deep blue accent that walked toward black, ending at
  // 2.48:1, when white was available at ~9:1.
  let best = base, bestRatio = contrastRatio(base, bg);
  for (const toward of ["#000000", "#FFFFFF"]) {
    for (let t = 0.2; t <= 1.001; t += 0.2) {
      const c = mix(base, toward, t);
      const ratio = contrastRatio(c, bg);
      if (ratio >= target) return c;
      if (ratio > bestRatio) { best = c; bestRatio = ratio; }
    }
  }
  return best;                                                        // best available
}
function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// ---- text shaping (shared by every family's builders) -------------------------
function breakLines(text, fallback) {
  const t = String(text || fallback || "").trim();
  if (!t) return [String(fallback || "")];
  if (/[|\n]/.test(t)) return t.split(/[|\n]/).map((x) => x.trim()).filter(Boolean);
  const w = t.split(/\s+/);
  if (w.length < 3) return [t];
  const mid = Math.ceil(w.length / 2);
  return [w.slice(0, mid).join(" "), w.slice(mid).join(" ")];
}
function bullets(scene, n) {
  let list = Array.isArray(scene.chips) ? scene.chips.filter(Boolean) : [];
  if (!list.length && Array.isArray(scene.onScreenText)) list = scene.onScreenText.filter(Boolean);
  if (!list.length && Array.isArray(scene.bullets)) list = scene.bullets.filter(Boolean);
  if (!list.length && scene.subtext) {
    list = String(scene.subtext).split(/[.;\n•]|\s—\s/).map((s) => s.trim()).filter((s) => s.length > 2);
  }
  // LAST RESORT: THE LINE THE NARRATOR IS SPEAKING. Every list shape in every
  // family — chips, rows, points, feature cards — sources from here, and
  // `sceneCanFill` REFUSES a list shape when this returns fewer than two
  // entries. So a scene carrying only a headline could neither fill a list
  // shape nor be routed to one, and fell through to the sparsest shape the
  // family has: a headline over empty ground, which is the frame the user is
  // complaining about. The narration always exists and is always about this
  // beat, so its clauses are honest material. Still last — a real list reads
  // better than a split sentence.
  if (!list.length && scene.voiceover) {
    list = String(scene.voiceover)
      .split(/[.;!?\n•]|\s[—–]\s|,\s(?=and\b|but\b|so\b|then\b)/)
      .map((s) => s.replace(/^[\s,:;—–-]+|[\s,:;—–-]+$/g, "").trim())
      .filter((s) => s.length > 2);
  }
  return list.slice(0, n).map((s) => String(s));
}
// Word-boundary truncation — a mid-word cut reads as a bug.
function fit(text, max) {
  const t = String(text || "").trim();
  if (t.length <= max) return t;
  let out = "";
  for (const w of t.split(/\s+/)) {
    if ((out + " " + w).trim().length > max) break;
    out = (out + " " + w).trim();
  }
  return out || t.slice(0, max);
}
// A unit suffix must NOT be the first letter of the following word. Without the
// lookahead, "Free for 12 months" parsed as 12 + suffix "m", and the label was
// built by deleting that span — shipping "FREE FORONTHS" on screen. Same trap for
// "12 kits", "3 x-ray", "40 bn…". The label is rebuilt around the number (not by
// string-replacing it) so the space where it stood survives.
function mineStat(str) {
  const s = String(str || "");
  const m = /([$₹€£]?)\s?(\d[\d,]*(?:\.\d+)?)(?:\s?(%|x|k|m|bn?|\+|★)(?![A-Za-z]))?/i.exec(s);
  if (!m) return null;
  const v = parseFloat(m[2].replace(/,/g, ""));
  if (!isFinite(v) || v > 10000000) return null;
  const label = `${s.slice(0, m.index)} ${s.slice(m.index + m[0].length)}`
    .replace(/[^\w\s.%-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 24);
  return { pre: m[1] || "", v, suf: (m[3] || "").toUpperCase(), isFloat: String(m[2]).includes("."), l: label.toUpperCase() };
}
function statsOf(scene, limit = 3) {
  if (Array.isArray(scene.stats) && scene.stats.length) {
    const cast = scene.stats.filter((s) => s && isFinite(Number(s.v))).slice(0, limit).map((s) => ({
      pre: String(s.pre || ""), v: Number(s.v), suf: String(s.suf || "").toUpperCase().slice(0, 2),
      isFloat: !Number.isInteger(Number(s.v)), l: String(s.l || "").slice(0, 24).toUpperCase(),
    }));
    if (cast.length) return cast;
  }
  const seen = new Set();
  return []
    .concat(Array.isArray(scene.onScreenText) ? scene.onScreenText : [])
    .concat(Array.isArray(scene.bullets) ? scene.bullets : [])
    .concat(scene.subtext ? String(scene.subtext).split(/[.;\n]/) : [])
    .concat(scene.emphasis ? [scene.emphasis] : [])
    .filter((s) => /\d/.test(String(s)))
    .map(mineStat).filter(Boolean)
    .filter((s) => { const k = `${s.v}${s.suf}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, limit);
}

// ---- asset gating (identical trust rules to the composers + director) ---------
function ratioOf(a) { return Number(a && a.ratio) || (a && a.width && a.height ? a.width / a.height : 0); }
function isPortraitAsset(a) { const rt = ratioOf(a); return rt > 0 && rt < 0.9; }
function isScreenshot(a) {
  const s = String((a && a.source) || "").toLowerCase(), k = String((a && a.kind) || "").toLowerCase();
  return s === "website" || s === "screenshot" || k === "screenshot" || /screenshot|peekshot/.test(s);
}
function isLogo(a) {
  const k = String((a && a.kind) || "").toLowerCase();
  return k === "logo" || /\blogo\b/i.test(String((a && a.alt) || "")) || /logo\.[a-z]+($|\?)/i.test(String((a && a.path) || ""));
}
// ADMISSION vs PREFERENCE (ported from Rohit's asset_admission.js).
//
// This used to end with a TRUST test — website/blog/library source, or the
// Creative Director promoting the asset to hero/support. Read as an admission
// gate, which is how the pool at `pool = assets.filter(plateOk)` used it, that
// silently deletes every stock photo the CD demoted to "background" — and the CD
// demotes everything past its per-scene cap, as does the layout director past its
// budget. A film could arrive with five perfectly good pictures on the wire and
// render as text-only.
//
// The give-away is thirty lines below: `take()` ends with
// `free.find((x) => free1(x) && !demoted(x)) || free.find(free1)` — a deliberate
// last-resort pass over demoted assets that could never fire, because plateOk had
// already removed them from `free`. The intent was always "seat them last", not
// "drop them".
//
// So admission now asks only whether something JUDGED this asset unusable
// (__rejected / __captureUnusable / __missingFile). Absence of approval is not a
// rejection. Seat order is still governed by `rank`/`demoted` below, so a demoted
// stock photo fills a box that would otherwise render empty and nothing better is
// ever displaced.
function plateOk(a) {
  if (!a || !a.path) return false;
  // allowLogo: this pool has always permitted logos; logo-specific slots pick
  // them out by isLogo() rather than by excluding them here.
  return displayOk(a, { allowLogo: true, allowVideo: false, allowVector: false });
}
// A topical VECTOR (iconify/undraw art fetched for this film's subject). Never a
// plate — cover-cropping flat art reads as a blank — but far better than an
// empty dashed placeholder when a beat has no photo or screenshot left. Slots
// filled this way carry `fitContain` so composers letterbox instead of crop.
function isVector(a) {
  return !!(a && a.path && /\.svg($|\?)/i.test(a.path) && !isLogo(a));
}

// ---- deterministic per-pack variation ----------------------------------------
// Two packs in the same family share a grammar; this lets a family pick a
// different layout variant per pack so they don't stage identically either.
function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < String(str).length; i++) { h ^= String(str).charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}
function variantFor(framePack, n) { return n > 0 ? hashSeed(framePack || "pack") % n : 0; }

// Paint order must not depend on DOM order. A family's chrome (letterbox bars,
// HUD rails, edge strips) is emitted BEFORE the scene clips, so any scene that
// paints full-bleed covers it — the cinema letterbox vanished behind a full-frame
// plate exactly this way. Every clip already declares its layer as
// data-track-index; this stamps that number into the element's own z-index so the
// stack is explicit in the markup, wherever it is rendered.
function withZIndex(html) {
  return String(html || "").replace(/<(\w+)([^>]*data-track-index="(\d+)"[^>]*)>/g, (tag, name, attrs, track) => {
    if (/z-index\s*:/.test(attrs)) return tag;
    if (/style="/.test(attrs)) return `<${name}${attrs.replace('style="', `style="z-index:${track};`)}>`;
    return `<${name}${attrs} style="z-index:${track};">`;
  });
}

// ---- scene display copy --------------------------------------------------------

// Give every scene a `headline` drawn from its OWN script copy.
//
// The script agent's schema has no `headline` field — it emits `onScreenText`
// ("the keyword, the number, the imperative") as the display typography. Every
// family builder, though, reads `scene.headline` and falls back to the PACK's
// demo copy when it is missing. That is how a film ends up narrating "Still
// hunting deals everywhere?" while the screen reads "Feeds are noisy. Blocks cut
// through." — the same pack boilerplate repeated across four consecutive scenes,
// with the scene's real display line ("Deals everywhere?") sitting unused.
//
// The narration for scene N is generated from scene N's script and mixed in over
// scene N, so the words on screen have to come from the same place.
//
// A first line carrying a NUMBER stays in `onScreenText` as well: stat archetypes
// mine their figures from that list (statsOf), and removing it would strip the
// number the scene exists to show.
function withDisplayCopy(s) {
  if (!s || typeof s !== "object") return s;
  if (s.headline != null && String(s.headline).trim()) return s;
  const ost = Array.isArray(s.onScreenText) ? s.onScreenText.filter(Boolean).map(String) : [];
  const first = ost[0] || String(s.subtext || "").split(/[.;\n]/)[0].trim();
  if (!first) return s;
  const keepAll = /\d/.test(first) || ost.length > 2;
  return { ...s, headline: first, onScreenText: keepAll ? ost : ost.slice(1) };
}

// ---- media planning ------------------------------------------------------------

// A slot's shape constraint: "phone" wants a portrait asset, "desktop" a
// landscape one; "photo"/"logo" take any shape.
function shapeForWant(want) {
  if (want === "phone") return isPortraitAsset;
  if (want === "desktop") return (x) => !isPortraitAsset(x);
  return null;
}
function isDeviceWant(want) { return want === "phone" || want === "desktop"; }

// Fill every slot a scene type declares — each one independently.
//
// A miss must NEVER abort the remaining slots. The cast path used to `break` on
// the first unmatched slot, so a montage whose slot 1 wanted a portrait shot
// lost slots 2 and 3 as well, even with matching photos sitting unclaimed in
// the pool.
//
// A "desktop"/"phone" slot renders inside BROWSER OR DEVICE CHROME, so whatever
// lands in it reads as "this is the product's screen". Each device slot takes a
// REAL screenshot first and only falls back to a generic asset when none is
// left — otherwise a stock photo gets framed as if it were the product UI.
// `scene` is threaded purely so `take` can prefer the candidate that matches
// what this beat is SAYING (see the matcher in planMedia). Optional — with no
// scene every take() falls back to the old global rank order.
function fillSlots(need, { preset = [], pin = null, take: take0, takeVec, recycle = false, placedPool = [], vecQuota = 0, scene = null } = {}) {
  const take = (pred) => take0(pred, scene);
  const slots = [];
  const n = Math.max(need.length, preset.length);
  let vq = vecQuota;
  for (let k = 0; k < n; k++) {
    const want = need[k] || null;
    const shape = want ? shapeForWant(want) : null;
    let asset = preset[k] || null;
    let fill = asset ? (asset === pin ? "pinned" : "cast") : null;
    if (!asset && k === 0 && pin) { asset = pin; fill = "pinned"; }
    // VECTOR CADENCE — a slot RESERVED for graphic art.
    //
    // The leftover-only pass at the bottom of this function reads as generous but
    // is unreachable in practice: it runs after every slot has had a shot at the
    // photo pool, and a real film supplies more photos than slots. Measured across
    // all eight families with 6 screenshots + 9 photos + 4 vectors supplied: 0 of
    // 4 vectors reached the frame, on every one. So a film that paid to fetch
    // vectors (the planner budgets ~0.45/scene) showed photographs exclusively.
    //
    // The reservation is deliberately the LAST slot of a scene and never a device
    // slot: the hero card and anything inside browser/phone chrome still take a
    // photograph or a capture first, so this can only ever convert a trailing tile
    // — the one most likely to be a recycled repeat — into graphic material.
    if (!asset && vq > 0 && k === n - 1 && !(want && isDeviceWant(want)) && takeVec) {
      const v = takeVec();
      if (v) { asset = v; fill = "vector"; vq--; }
    }
    if (!asset && want && isDeviceWant(want)) {
      asset = take((x) => isScreenshot(x) && (!shape || shape(x)));
      if (asset) fill = "screenshot";
    }
    if (!asset) {
      asset = take(shape);
      if (asset) fill = isScreenshot(asset) ? "screenshot" : "photo";
    }
    // SHAPE IS A PREFERENCE ON A PLAIN PLATE — NOT IN A DEVICE FRAME. Measured on
    // a live Trello film: a 4-tile wall showed only 2 distinct images while 3
    // assets sat UNCLAIMED, because the spares were full-page captures (very
    // tall) and the "photo" shape test rejected them, so the slot fell through to
    // recycling. On a plain tile the viewer sees the duplicate, not the aspect
    // ratio it was rejected for — so a real asset beats a repeat.
    //
    // A DEVICE slot is different and keeps its shape requirement: a landscape
    // shot dropped into a phone bezel is the documented crop disaster, and
    // media_demand.test.cjs defect-3 pins that an unfillable phone slot must stay
    // empty rather than swallow the photo a later slot needs.
    if (!asset && !(want && isDeviceWant(want))) {
      asset = take();
      if (asset) fill = isScreenshot(asset) ? "screenshot" : "photo";
    }
    slots.push({ slotIndex: k, kind: want, asset, fill });
  }
  // Topical VECTOR fill runs only after every slot has had its shot at a real
  // photo/screenshot, so a vector never outbids photography for an early slot.
  for (const s of slots) {
    if (s.asset) continue;
    const v = takeVec();
    if (v) { s.asset = v; s.fill = "vector"; }
  }
  // RECYCLE — when the pool is exhausted, REPEAT a real asset rather than leave
  // the card blank. A second look at the product's own screenshot reads far
  // better than an empty panel, so packs whose empty slot renders a featureless
  // placeholder opt in via `family.recycleMedia`. Packs that draw an AUTHORED
  // no-media panel instead (brand plate, note card) do not, because for them a
  // repeat would replace a designed frame rather than rescue a blank one.
  //
  // Preference order: something already shown in THIS scene (so a grid reads as
  // a deliberate rhythm), then anything placed earlier in the film. A device
  // slot only ever recycles a real screenshot — repeating a stock photo into
  // browser chrome would present it as the product's UI.
  if (recycle) {
    const inScene = slots.map((s) => s.asset).filter(Boolean);
    let cursor = 0;
    for (const s of slots) {
      if (s.asset) continue;
      const wantShot = s.kind && isDeviceWant(s.kind);
      const source = (inScene.length ? inScene : placedPool)
        .filter((a) => !wantShot || isScreenshot(a));
      if (!source.length) continue;
      s.asset = source[cursor++ % source.length];
      s.fill = "recycled";
    }
  }
  for (const s of slots) if (!s.asset) s.fill = "empty";
  return slots;
}

// THE single source of truth for "what media does this film ask for, and what
// filled each slot". buildFilm() below is a pure emitter over this result, so
// the plan and the rendered DOM cannot drift: there is exactly one
// implementation of routing + slot filling, and both the planner and the
// renderer run it.
//
// Callers outside the renderer (demand planning, coverage verification) get the
// manifest for free — no LLM, no render, pure computation.
function planMedia(family, { storyboard, dims, framePack, assets, brandSkin, templatePlan, manifest } = {}) {
  const sb = storyboard || {};
  const W = (dims && dims.width) || 1920, H = (dims && dims.height) || 1080;
  const land = W >= H;
  const scenes = (Array.isArray(sb.scenes) && sb.scenes.length
    ? sb.scenes.slice(0, 30)
    : [{ id: "s1", start: 0, duration: 4, kind: "hook", headline: sb.title || "" }]).map(withDisplayCopy);
  const D = r(sb.durationSec || scenes.reduce((a, s) => Math.max(a, (Number(s.start) || 0) + (Number(s.duration) || 0)), 0) || 12);
  const theme = family.theme(manifest || {}, brandSkin || null, { framePack, land });

  // Brand + url from the film itself (the site the assets came from beats lore).
  const host = (Array.isArray(assets) ? assets : [])
    .filter((a) => a && (a.source === "website" || a.source === "website-image") && a.sourceUrl)
    .map((a) => { try { return new URL(a.sourceUrl).hostname.replace(/^www\./, ""); } catch { return null; } })
    .find(Boolean);
  // THE BRAND IS A NAME, NOT THE FILM'S TITLE — AND A SLICE IS NOT A FIT.
  //
  // `sb.brand` frequently arrives as the film's headline ("Everything You Need"),
  // and a flat .slice(0, 18) then cut it to "EVERYTHING YOU NEE" — which is what
  // the brand sticker showed in the top-left corner of EVERY frame of a shipped
  // Flipkart film, for the film's whole 35 seconds, while "flipkart.com" sat in
  // the assets. QA logged it as TEXT OVERFLOW on every sampled frame.
  //
  // Same rule the omelette adapter already uses: a multi-word phrase long enough
  // to be a slogan is not a brand, so the site's own domain wins; and when nothing
  // better exists, cut on a WORD boundary so the sticker reads as a short name
  // rather than a severed one.
  const hostBrand = host ? host.split(".")[0].replace(/^./, (c) => c.toUpperCase()) : "";
  const brand = (() => {
    const explicit = String(sb.brand || "").trim();
    const isSlogan = (s) => s.split(/\s+/).length >= 3 && s.length > 16;
    const pick = (explicit && !(isSlogan(explicit) && hostBrand)) ? explicit
      : (hostBrand || explicit || String(sb.title || "").trim().split(/\s+/)[0] || "STUDIO");
    if (pick.length <= 18) return pick;
    const cut = pick.slice(0, 18);
    const sp = cut.lastIndexOf(" ");
    return (sp > 6 ? cut.slice(0, sp) : cut).trim();
  })();
  const url = String(sb.url || host || `${brand.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`).slice(0, 40);

  // Asset pools — cast assets win; the rest are claimed in scene order.
  const pool = (Array.isArray(assets) ? assets : []).filter(plateOk);
  const logoAsset = (Array.isArray(assets) ? assets : []).find(isLogo) || null;
  const pinned = new Map();
  const free = [];
  for (const a of pool) {
    if (a === logoAsset) continue;
    const sid = a.sceneId != null ? String(a.sceneId) : null;
    if (sid && !pinned.has(sid)) pinned.set(sid, a); else free.push(a);
  }
  // RELEVANCE ORDER, not arrival order. The creative director already scored
  // every asset (cdScore, CLIP pixel-relevance, hero/support/background
  // prominence) — but this pool used to be walked in raw array order, so a slot
  // took whatever happened to be fetched first. With the density raise there are
  // now far more slots than there are good assets, and that arrival order is
  // exactly what put off-topic stock into hero image cards. Rank once here and
  // every take() below inherits it.
  const rank = (a) => (isScreenshot(a) ? 60 : 0)
    + (a.cdProminence === "hero" ? 25 : a.cdProminence === "support" ? 12 : 0)
    + (Number(a.cdScore) || 0)
    + (typeof a.clipRelevance === "number" ? a.clipRelevance * 30 : 0);
  free.sort((x, y) => rank(y) - rank(x));
  // An asset the director demoted to "background" is one it judged weak or
  // off-topic. It may still scrim behind type, but it must not be the FIRST
  // choice for a designed media card — so prominent candidates are exhausted
  // before a demoted one is considered at all.
  const demoted = (a) => a.cdProminence === "background" || a.visionOk === false;
  const claimed = new Set();

  // ---- WHICH PICTURE BELONGS ON *THIS* BEAT ----------------------------------
  // `rank` above is entirely FILM-GLOBAL — screenshot-ness, the director's
  // prominence verdict, its score, its CLIP relevance to the film's subject.
  // None of it knows what the scene in front of it is SAYING, so every slot in
  // the film popped the next item off one global list: the beat about pricing
  // got whatever ranked highest, which is the "random screenshots / random
  // assets" complaint in full. The 139 bundled packs already match per scene;
  // the 49 family packs had no per-scene matching at all.
  //
  // Everything scored here is data the pipeline already produced and then threw
  // away: the vision pass's literal description of the image (`sees`), which
  // part of the site it came from (`sectionType`), the query it was fetched for,
  // and the page it was captured from.
  const STOP = new Set(["the", "a", "an", "and", "or", "for", "with", "your", "our", "this",
    "that", "page", "of", "to", "in", "on", "it", "is", "are", "you", "we", "all", "every",
    "real", "website", "screenshot", "image", "photo", "product", "present", "styled",
    "browser", "frame", "hero", "treatment", "matches", "scene", "topic", "unpinned",
    // Prepositions and filler carry no subject, and leaving one out is enough to
    // score a decorative image onto a beat: an alt reading "testimonials from
    // Zoom" matched a line containing "from", and that single word was the whole
    // match. Kept in step with asset_sources-side scene_match.js.
    "from", "into", "onto", "over", "under", "after", "before", "than", "then",
    "its", "their", "them", "they", "was", "were", "been", "being", "have", "has",
    "had", "will", "would", "can", "could", "should", "more", "most", "just", "also"]);
  const wordsOf = (s) => String(s || "").toLowerCase().match(/[a-z0-9]{3,}/g) || [];
  const sceneWords = (sc) => new Set([
    ...wordsOf(sc.headline), ...wordsOf(sc.title), ...wordsOf(sc.subtext),
    ...wordsOf(sc.voiceover), ...wordsOf(sc.kicker), ...wordsOf(sc.emphasis),
    ...bullets(sc, 4).flatMap(wordsOf),
  ].filter((w) => !STOP.has(w)));
  const ASSET_FIELDS = [["sees", 1.6], ["alt", 1.2], ["query", 1.2], ["sectionType", 1.0], ["url", 0.9], ["file", 0.7]];
  const assetWords = (a) => {
    const src = {
      sees: a.sees, alt: a.alt, query: a.query || a.searchQuery, sectionType: a.sectionType,
      url: String(a.pageUrl || a.sourceUrl || "").replace(/https?:\/\/[^/]+/, "").replace(/[/_-]+/g, " "),
      file: String(a.path || "").split("/").pop().replace(/^page_\d+_/, "").replace(/\.\w+$/, ""),
    };
    const m = new Map();
    for (const [k, w] of ASSET_FIELDS) {
      for (const t of wordsOf(src[k])) { if (!STOP.has(t) && (m.get(t) || 0) < w) m.set(t, w); }
    }
    return m;
  };
  // A beat's PURPOSE says which part of a site belongs on it — the proof beat
  // wants the logo wall, the close wants the sign-up, the opener wants the hero.
  // Word overlap cannot make that link: a testimonial capture rarely repeats the
  // narrator's nouns.
  const SECTION_FOR = {
    hook: /hero|home|landing/i, title: /hero|home|landing/i,
    context: /hero|features|about/i, problem: /hero|features|about/i,
    feature: /features|product|how|solution/i, demo: /features|product|how/i,
    proof: /testimonial|logos|customers|social|stats/i, testimonial: /testimonial|logos|customers|social/i,
    stat: /stats|testimonial|logos|customers/i, chart: /stats|pricing/i,
    pricing: /pricing|plans/i,
    cta: /cta|signup|sign-up|footer|pricing/i, close: /cta|signup|footer/i,
  };
  const matchScore = (sc, a) => {
    if (!sc) return 0;
    const terms = sceneWords(sc);
    let score = 0;
    if (terms.size) for (const [t, w] of assetWords(a)) if (terms.has(t)) score += w;
    const want = SECTION_FOR[String(sc.purpose || sc.kind || "").toLowerCase()];
    if (want && want.test(String(a.sectionType || ""))) score += 1.5;
    if (typeof a.clipSceneRelevance === "number") score += a.clipSceneRelevance * 1.2;
    else if (typeof a.clipRelevance === "number") score += a.clipRelevance * 0.8;
    return score;
  };
  // `scene` is optional so every existing call site keeps working unchanged: with
  // no scene this is exactly the old rank-order walk.
  const take = (pred, scene = null) => {
    const free1 = (x) => !claimed.has(x) && (!pred || pred(x));
    let a = null;
    if (scene && process.env.TE_TOPIC_MATCH !== "0") {   // =0 restores the old global rank walk, for A/B
      let best = 0;
      for (const x of free) {
        if (!free1(x) || demoted(x)) continue;
        const s = matchScore(scene, x);
        if (s > best) { best = s; a = x; }
      }
    }
    a = a || free.find((x) => free1(x) && !demoted(x)) || free.find(free1);
    if (a) claimed.add(a);
    return a || null;
  };
  // Topical vectors, claimed only after every photo/screenshot is spoken for.
  const vecs = (Array.isArray(assets) ? assets : []).filter(isVector);
  const takeVec = () => {
    const v = vecs.find((x) => !claimed.has(x));
    if (!v) return null;
    claimed.add(v);
    return { ...v, fitContain: true };
  };
  // How many slots THIS scene may reserve for a vector — see the cadence note in
  // fillSlots. One graphic beat in every three media beats: enough that a film
  // reads as designed rather than as a photo reel, not so much that it becomes a
  // slide-deck of icons (an early build that let vectors compete freely for slots
  // came out roughly half icons, which is why they were demoted to leftovers in
  // the first place — this restores them as a rationed accent instead).
  let mediaBeat = 0;
  const vecQuotaForScene = () =>
    (vecs.some((x) => !claimed.has(x)) && (mediaBeat++ % 3 === 2)) ? 1 : 0;

  const cast = (templatePlan && templatePlan.byScene) || null;
  const startOf = (i) => scenes.slice(0, i).reduce((a, s) => a + (Number(s.duration) || 0), 0);
  const plan = [];
  const usedTypes = [];
  // Sliding window of the shapes just seen, for the anti-slideshow rung below.
  // Two is deliberate: it breaks A-A and A-B-A without forcing a family with
  // only three legal shapes for a bullet scene to reach for a worse one.
  const RECENT_WINDOW = 2;
  const recentTypes = [];

  // ---- anti-slideshow support -------------------------------------------------
  // Can this scene's own copy actually FILL that shape? Every family publishes
  // TEMPLATE_SCENES — the same descriptors the Template Director reads — and
  // each entry names the slots its design draws. That is machine-checkable: a
  // stats shape needs a figure, a quote shape needs a quote, a list shape needs
  // two bullets. Routing a scene into a shape it cannot fill is worse than the
  // repeat we are trying to avoid (it renders acres of empty frame), so this
  // check is deliberately strict and the rung simply does nothing when it fails.
  const DESC = new Map((family.TEMPLATE_SCENES || []).map((d) => [d.type, d]));
  const sceneCanFill = (t, sc, avail) => {
    const d = DESC.get(t);
    if (!d || !family.SCENES[t]) return false;
    const keys = Object.keys(d.slots || {});
    if (keys.some((k) => /^stats?$/i.test(k)) && !statsOf(sc, 1).length) return false;
    if (keys.some((k) => /^(quote|testimonial)$/i.test(k)) && !(sc.quote || sc.testimonial)) return false;
    if (keys.some((k) => /^(items|chips|bullets|rows|points|list)$/i.test(k)) && bullets(sc, 2).length < 2) return false;
    // A media shape with no media left is an empty plate, not a variation.
    const md = (family.mediaSlots && family.mediaSlots[t]) || [];
    const min = d.mediaMin != null ? d.mediaMin : md.length;
    if (min > 0 && avail < min) return false;
    return true;
  };
  // The opener and the closer are the film's bookends — a mid-film "titlespread"
  // reads as the template restarting, which is the exact tell we are removing.
  // Ask the router which shapes it reserves for those positions and keep them
  // out of the middle.
  const reservedTypes = new Set();
  if (typeof family.route === "function" && scenes.length > 2) {
    const probeCtx = { dims: { width: W, height: H }, land, theme, brand, url, framePack, freeCount: free.length, esc, r, rgba, lum, mix, inkOn, breakLines, bullets, fit, statsOf, mineStat };
    for (const [sc, idx] of [[scenes[0], 0], [scenes[scenes.length - 1], scenes.length - 1]]) {
      try {
        const t = family.route(sc, idx, scenes.length, { ...probeCtx, i: idx, prevType: null });
        if (t && family.SCENES[t]) reservedTypes.add(t);
      } catch { /* no reservation discoverable — the rung just has more candidates */ }
    }
  }
  // Real assets already shown, in film order — what the recycle rung repeats
  // from when a later scene runs out of fresh media.
  const placed = [];

  scenes.forEach((rawScene, i) => {
    const T = r(rawScene.start != null ? rawScene.start : startOf(i));
    const L = r(rawScene.duration || 4);
    const sid = rawScene.id != null ? String(rawScene.id) : `s${i + 1}`;
    const entry = cast && cast[sid] && family.SCENES[cast[sid].type] ? cast[sid] : null;
    const scene = entry && entry.slots ? { ...rawScene, ...entry.slots } : rawScene;
    // The last clip's window runs past the timeline end: the framework windows a
    // clip out at data-start+data-duration, so an exact-D boundary would render
    // the film's final frame black.
    const isLast = i === scenes.length - 1;
    const ctx = {
      id: `s${i + 1}`, T, L, winL: isLast ? L + 0.5 : L, track: 2 + i, i, isLast,
      count: scenes.length, dims: { width: W, height: H }, land, theme, brand, url,
      framePack, prevType: usedTypes[i - 1] || null, esc, r, rgba, lum, mix, inkOn,
      breakLines, bullets, fit, statsOf, mineStat, variant: variantFor(framePack, family.variants || 1),
    };

    const pin = pinned.get(sid) || null;
    let type, typeVia, need = [], slots = [];

    if (entry) {
      type = entry.type;
      typeVia = "cast";
      const preset = (entry.assets || []).filter((x) => x && x.path);
      // A pin lives OUTSIDE `free`, so take() can never reach it. Without this
      // the screenshot director's topic-matched page shot is silently ORPHANED
      // on every cast scene — the film narrates a pricing page it never shows.
      if (pin && !preset.some((x) => x === pin || x.path === pin.path)) preset.unshift(pin);
      preset.forEach((x) => claimed.add(x));
      // The director casts a scene with the assets IT chose, which is often
      // fewer than the type actually draws (it cast montage with 2 while the
      // grid renders 4); fillSlots tops the rest up from the unclaimed pool.
      need = (family.mediaSlots && family.mediaSlots[type]) || [];
      // CAST PIN RESCUE — the director can cast a scene to a TEXT-ONLY type while
      // an asset is pinned (or cast) to it. The asset then lands in a slot the
      // type cannot draw and is dropped with NO signal anywhere: `need` is 0, so
      // planMedia and scanCoverage both report zero, agree with each other, and
      // the no-drift test passes green while the film silently loses the picture.
      // Observed live — a 5-scene film assigned 3 assets and rendered 0 <img>.
      // Mirrors the router's pinRescue below; the director keeps its chosen type
      // whenever it cast a media-bearing one, or when there is nothing to show.
      const showable = preset[0] || null;
      if (showable && !need.length && family.mediaSlots) {
        const want = isPortraitAsset(showable) ? "phone" : "desktop";
        const types = Object.keys(family.mediaSlots).filter((t) => family.SCENES[t] && (family.mediaSlots[t] || []).length);
        const cand = types.find((t) => (family.mediaSlots[t] || [])[0] === want) || types[0];
        if (cand) { type = cand; need = family.mediaSlots[cand]; typeVia = "castPinRescue"; }
      }
      slots = fillSlots(need, { preset, pin, take, takeVec, recycle: !!family.recycleMedia, placedPool: placed, vecQuota: vecQuotaForScene(), scene });
    } else {
      if (pin) claimed.add(pin);
      type = family.route(scene, i, scenes.length, {
        ...ctx, pinned: pin, hasPortrait: free.some((x) => !claimed.has(x) && isPortraitAsset(x)),
        hasShot: free.some((x) => !claimed.has(x) && isScreenshot(x)),
        freeCount: free.filter((x) => !claimed.has(x)).length,
      });
      typeVia = "router";
      if (!family.SCENES[type]) { type = family.fallbackType || Object.keys(family.SCENES)[0]; typeVia = "fallbackType"; }
      // ANTI-SLIDESHOW. Every router guards against an immediate repeat via
      // ctx.prevType, but that guard only looks back ONE scene and only on the
      // branches that carry media. Once the asset pool is spent — which on a
      // 20-scene long-form film happens by scene 8 — every remaining bullet/
      // feature beat falls through to the same text shape, and the back half of
      // the film is eight identical slides. Measured on all 8 families: runs of
      // 3, and ~8 repeats of one type across the tail.
      //
      // The fix asks the ROUTER, not us, for the alternatives: re-run it with a
      // different prevType and it reveals which other shapes it considers
      // legitimate for THIS scene's own copy. So every candidate here is one the
      // family itself would have chosen — we only pick the least-recently-seen
      // of them. A scene with genuinely one legal shape keeps it.
      if (recentTypes.includes(type)) {
        const avail = free.filter((x) => !claimed.has(x)).length + (pin ? 1 : 0);
        const cands = Object.keys(family.SCENES)
          .filter((t) => t !== type && !recentTypes.includes(t)
            && !reservedTypes.has(t) && sceneCanFill(t, scene, avail));
        // Least recently used wins, so a long film walks the family's whole
        // vocabulary instead of pinning one shape.
        if (cands.length) {
          cands.sort((x, y) => (usedTypes.lastIndexOf(x)) - (usedTypes.lastIndexOf(y)));
          type = cands[0];
          typeVia = "antiRepeat";
        }
      }
      // SPEND THE ASSETS. Measured on two live Trello films: 11 real screenshots
      // were captured and the film put 3 on screen. The router alternates media
      // beats to avoid a slideshow, which is right when assets are scarce and
      // wrong when they are plentiful — the captures are the most convincing
      // thing in a product film, and leaving two-thirds of them on disk is a
      // bigger loss than two media beats in a row.
      //
      // So: when the pool is still deep, a text-only beat is re-routed to a
      // media-bearing type the scene can actually fill. sceneCanFill keeps this
      // honest (no routing a quote scene into a stats plate), and the recent
      // window still blocks the same shape twice running.
      const stillFree = free.filter((x) => !claimed.has(x)).length;
      const needNow = (family.mediaSlots && family.mediaSlots[type]) || [];
      if (!needNow.length && stillFree >= 3 && family.mediaSlots) {
        const cand = Object.keys(family.mediaSlots)
          .filter((t) => (family.mediaSlots[t] || []).length
            && family.SCENES[t] && !recentTypes.includes(t)
            && !reservedTypes.has(t) && sceneCanFill(t, scene, stillFree));
        if (cand.length) {
          cand.sort((x, y) => usedTypes.lastIndexOf(x) - usedTypes.lastIndexOf(y));
          type = cand[0];
          typeVia = "spendAssets";
        }
      }
      need = (family.mediaSlots && family.mediaSlots[type]) || [];
      // A scene the screenshot director PINNED an asset to MUST show it. Routers
      // guard against two media beats in a row (`prevType !== "feature"`), which
      // silently swallowed the pinned page shot whenever the previous beat had
      // already claimed the media type — the film then narrated a page it never
      // showed. A pin outranks that guard: re-route to a media-bearing type that
      // fits the asset's orientation.
      if (pin && !need.length && family.mediaSlots) {
        const want = isPortraitAsset(pin) ? "phone" : "desktop";
        const types = Object.keys(family.mediaSlots).filter((t) => family.SCENES[t] && (family.mediaSlots[t] || []).length);
        const cand = types.find((t) => family.mediaSlots[t][0] === want) || types[0];
        if (cand) { type = cand; need = family.mediaSlots[cand]; typeVia = "pinRescue"; }
      }
      if (need.length) slots = fillSlots(need, { pin, take, takeVec, recycle: !!family.recycleMedia, placedPool: placed, vecQuota: vecQuotaForScene(), scene });
    }

    const media = slots.map((s) => s.asset);
    // Only FRESH placements join the recycle pool — re-adding a recycled asset
    // would let one image crowd out every other candidate downstream.
    for (const s of slots) {
      if (s.asset && s.fill !== "recycled" && !placed.includes(s.asset)) placed.push(s.asset);
    }
    // ctx.media keeps its established "compacted, no holes" contract for every
    // existing scene function; ctx.mediaSlots is the positional/nullable view.
    ctx.media = media.filter(Boolean);
    ctx.mediaSlots = media;
    let a = media[0] || null;
    const b = media[1] || null;
    if (family.wantsLogo && family.wantsLogo(type) && !a) {
      a = logoAsset;
      if (logoAsset && slots[0]) { slots[0].asset = logoAsset; slots[0].fill = "logo"; }
    }
    // A media type with STILL no media renders an empty frame — re-route.
    // Deliberately slot 0 ONLY: every family's 2+-slot type draws an AUTHORED
    // no-media panel for the later slots (brand plate, note card, signal plate),
    // so re-routing the whole scene because slot 3 is empty would destroy that
    // authored design rather than improve it.
    if (need.length && !a && family.mediaFallback) {
      const alt = family.mediaFallback(scene, ctx);
      if (alt) { type = alt; typeVia = "mediaFallback"; }
    }

    // When a shape genuinely HAS to come back — a family with one list design
    // and a film with six list beats — it must not come back identical. Every
    // family authors 2-3 layout variants of each shape and reads ctx.variant,
    // but that was a per-PACK constant, so all six beats staged the same way.
    // Advancing it per recurrence means the repeat is a different arrangement of
    // the same design language rather than the same slide again.
    const nVar = Math.max(1, family.variants || 1);
    if (nVar > 1) {
      const rep = usedTypes.filter((t) => t === type).length;   // occurrences before this one
      ctx.variant = (variantFor(framePack, nVar) + rep) % nVar;
    }

    usedTypes[i] = type;
    recentTypes.push(type);
    if (recentTypes.length > RECENT_WINDOW) recentTypes.shift();
    ctx.type = type;
    plan.push({ sceneIndex: i, sceneId: sid, rawScene, scene, ctx, type, typeVia, need, slots, media, a, b, T, L, isLast });
  });

  // Coverage math, computed once here instead of re-derived by every caller.
  const totals = { demand: 0, filled: 0, empty: 0, byFill: {}, byKind: {} };
  const holes = [];
  for (const p of plan) {
    for (const s of p.slots) {
      if (!s.kind) continue;            // beyond the declared slots (director overflow)
      totals.demand++;
      totals.byKind[s.kind] = (totals.byKind[s.kind] || 0) + 1;
      totals.byFill[s.fill] = (totals.byFill[s.fill] || 0) + 1;
      if (s.asset) { totals.filled++; continue; }
      totals.empty++;
      holes.push({
        sceneId: p.sceneId, sceneIndex: p.sceneIndex, sceneType: p.type,
        slotIndex: s.slotIndex, kind: s.kind,
        purpose: p.rawScene.purpose || p.rawScene.kind || null,
        visualDirection: p.rawScene.visualDirection || null,
      });
    }
  }

  return {
    W, H, land, D, theme, brand, url, scenes, plan, totals, holes,
    supply: {
      plates: pool.length,
      screenshots: pool.filter(isScreenshot).length,
      portrait: pool.filter(isPortraitAsset).length,
      vectors: vecs.length,
      logo: !!logoAsset,
    },
  };
}

// ---- the film -----------------------------------------------------------------
// family = { theme, styleBlock, chrome, SCENES, TEMPLATE_SCENES, route, camera }
//
// A pure emitter over planMedia(): every media decision was already made and
// recorded there, so what renders is exactly what the manifest describes.
function buildFilm(family, opts = {}) {
  const { dims, framePack, captionCues } = opts;
  const P = planMedia(family, opts);
  const { W, H, land, D, theme, brand, url, scenes, plan } = P;

  const cam = family.camera || {};
  const KIND = cam.kinds || ["zoom", "whip", "whip", "zoom", "whip", "zoom", "whip", "whip"];
  const DIR = cam.dirs || [0, 1, -1, 0, 1, 0, -1, 1];
  const DRIFT = [-1, 1, -1, 1, 1, -1, 1, -1];
  const camOn = cam.enabled !== false;
  // The previous scene's card, so the motion pass can hand off across the cut.
  let prevCardSel = null;
  const bodyParts = [];
  const sceneScripts = [];
  const authoredScenes = opts.authoredScenes instanceof Map ? opts.authoredScenes : null;
  const authoredCss = [];

  plan.forEach((p) => {
    const { ctx, scene, type, a, b, T, L, isLast, sceneIndex: i } = p;
    // An AUTHORED scene (services/scene_author.js) replaces the pack's builder for
    // this slot — that is how a 60s film on a 30-second pack gets new layouts
    // instead of the same shapes with new words. It has already passed lintScene,
    // and anything that failed simply never reaches here, so the pack's own
    // builder stays the floor: an authored scene can add variety, never blank a
    // frame. Its script is written against AT/DUR, bound here to this slot.
    const authored = authoredScenes && authoredScenes.get(i);
    if (authored && authored.css) authoredCss.push(authored.css);
    const built = authored
      ? { html: authored.html, clipStyle: "", s: `(function(){var AT=${T},DUR=${r(ctx.winL)};\n${authored.s}\n})();` }
      : (family.SCENES[type] || family.SCENES[family.fallbackType])(scene, ctx, a, b);
    // Coverage stamped on the clip itself: one edit here makes every
    // template-engine composer's media demand countable from the rendered DOM,
    // which is otherwise impossible — an unfilled slot draws a styled <div>
    // with no <img> and is indistinguishable from intentional design.
    const filledCount = p.slots.filter((s) => s.kind && s.asset).length;
    // ---- SCENE FILL -----------------------------------------------------------
    // A family that declares `fill` gets its spare copy drawn as furniture in a
    // band it says is safe. Opt-in and zone-driven on purpose: the engine cannot
    // know where a given design has room, and guessing would overlap authored
    // layout — the one failure mode worse than an empty frame.
    let fillPart = { html: "", s: [] };
    if (family.fill) {
      const zone = typeof family.fill === "function" ? family.fill(type, ctx, scene) : family.fill;
      if (zone) {
        try { fillPart = sceneFill(ctx.id, scene, ctx, zone) || fillPart; }
        catch { /* fill is decoration — never let it break a render */ }
      }
    }
    bodyParts.push(`<div class="clip tpl-scene" id="${ctx.id}" data-start="${T}" data-duration="${r(ctx.winL)}" data-track-index="${ctx.track}" data-scene-type="${type}" data-media-demand="${p.need.length}" data-media-filled="${filledCount}" data-media-kinds="${p.need.join(",")}" style="z-index:${ctx.track};opacity:0;${built.clipStyle || ""}">
  <div class="camo" id="${ctx.id}-camo"><div class="cami" id="${ctx.id}-cami">${built.html}${fillPart.html}</div></div>
</div>`);
    if (fillPart.s && fillPart.s.length) sceneScripts.push(fillPart.s.filter(Boolean).join("\n  "));
    // When the motion system owns the entrance (family.motion + camera disabled),
    // the clip is switched on INSTANTLY and the visible arrival is the wipe/push
    // preset. The 0.3s opacity ramp below is a crossfade — fine as a windowing
    // device under a camera whip, but it is the exact transition the motion spec
    // rules out, so it must not survive where the presets are the transition.
    const motionOwnsEntry = !!(family.motion && (family.camera || {}).enabled === false);
    sceneScripts.push(motionOwnsEntry
      ? `tl.set("#${ctx.id}",{opacity:1},${T});`
      : `tl.fromTo("#${ctx.id}",{opacity:0},{opacity:1,duration:0.3,ease:"none"},${T});`);
    sceneScripts.push(Array.isArray(built.s) ? built.s.filter(Boolean).join("\n  ") : String(built.s || ""));

    // ---- SHARED MOTION PASS ---------------------------------------------------
    // A family that declares `motion` hands the engine the selectors for its
    // headline / card / media in a scene, and the engine drives them from the one
    // preset library. The family keeps authoring its DESIGN; it stops authoring
    // physics. That is what makes two films from two templates move alike.
    //
    // The family's own tweens for these elements must be removed when it opts in,
    // or two timelines fight over the same property.
    if (family.motion) {
      const M = family.motion;
      const pick = (v) => (typeof v === "function" ? v(ctx.id, type, ctx) : v || null);
      // Does THIS scene actually draw the card the family named? Asking the
      // built markup beats maintaining a per-family list of which scene types
      // own a card: the list would silently rot the first time a family gains a
      // scene type, and the failure mode is invisible (a card entrance with
      // nothing to animate, or a card that never enters).
      const rawCard = pick(M.card);
      const cardPresent = !!rawCard && rawCard.split(",").some((s) => {
        const m = s.trim().match(/^[#.]([\w-]+)/);
        return m && String(built.html || "").includes(m[1]);
      });
      const tokens = typeof M.tokens === "function"
        ? M.tokens(type, i, ctx, { hasCard: cardPresent })
        : motion.tokensForScene(i, { hasCard: cardPresent, hero: type === (M.heroType || null) });
      // A card selector is only handed to the presets when this scene draws one,
      // so a text-only scene never emits an entrance with nothing to animate.
      const cardSel = cardPresent ? rawCard : null;
      sceneScripts.push(...motion.resolveMotion(tokens, {
        at: T, span: L, index: i,
        // The outline phase draws the word in THIS colour with a transparent
        // fill, so it has to clear large-text contrast on its own — a raw accent
        // (mint on near-white measured 1.69:1) is unreadable for the whole hold.
        // readable() darkens it just far enough to pass while staying the brand hue.
        // The settled colour is the pack's HEADLINE ink — the one the pack has
        // already guaranteed reads on its own ground.
        ink: readable(theme.ground || theme.card || "#FFFFFF", theme.ink, 1, 3),
        // The accent appears only as the transient outline stroke.
        accent: theme.accent || theme.ink,
        // The muted fill the outline phase starts on. Mixing a FIXED fraction
        // toward the ground cannot guarantee a floor — at 55% it measured 2.87:1
        // on liquid-glass against the 3:1 large-text threshold, passing on every
        // other pack purely by palette luck. So the mix is only a starting point
        // and readable() pushes it back until it actually clears, per pack.
        //
        // The mix is deliberately shallow (28%, not 55%): readable() can only
        // reason about theme.ground, and a pack that paints its own panel behind
        // the headline — liquid-glass does — has a real backdrop the engine
        // cannot see. Staying close to the final ink keeps the phase legible on
        // ANY backdrop; the stroke, not the pale fill, carries the outline read.
        inkSoft: (() => {
          const bg = theme.ground || theme.card || "#FFFFFF";
          const full = readable(bg, theme.ink, 1, 3);
          return readable(bg, mix(full, bg, 0.28), 1, 3);
        })(),
        sel: {
          // `scene` is handed over ONLY when the family disabled the engine
          // camera. Otherwise the camo whip and a wipe would both animate the
          // same arrival — the classic double entrance.
          scene: motionOwnsEntry ? `#${ctx.id}-camo` : null,
          card: cardSel, text: pick(M.text), camera: pick(M.camera),
          shadow: M.shadow !== false,
        },
      }));
      // CARD HAND-OFF ACROSS THE BOUNDARY. The outgoing scene's card steps back
      // into depth as the incoming one arrives, overlapping by TIMING.overlap, so
      // screens read as a stack being dealt rather than as slides advancing. It
      // has to live here rather than in a scene function: no scene can see its
      // neighbour, and the whole point is that the two overlap.
      if (prevCardSel && cardSel && tokens.exit !== "none") {
        sceneScripts.push(...motion.cardStackTransition(prevCardSel, null, r(T - motion.TIMING.overlap)));
      }
      prevCardSel = cardSel;
    }

    if (camOn) {
      const eK = KIND[i % KIND.length], eD = DIR[i % DIR.length] || 1;
      const nx = (i + 1) % scenes.length;
      const xK = KIND[nx % KIND.length], xD = DIR[nx % DIR.length] || 1;
      const inD = r(Math.min(0.55, L * 0.14)), outD = r(Math.min(0.5, L * 0.13));
      const blur = cam.blur != null ? cam.blur : 26;
      if (i > 0 || scenes.length === 1) {
        sceneScripts.push(eK === "whip"
          ? `tl.fromTo("#${ctx.id}-camo",{x:${r(-eD * W * 0.62)},filter:"blur(${blur}px)"},{x:0,filter:"blur(0px)",duration:${inD},ease:"expo.out"},${T});`
          : `tl.fromTo("#${ctx.id}-camo",{scale:${cam.zoomIn || 1.26},filter:"blur(${Math.round(blur * 0.77)}px)"},{scale:1,filter:"blur(0px)",duration:${inD},ease:"expo.out"},${T});`);
      }
      if (!isLast) {
        sceneScripts.push(xK === "whip"
          ? `tl.to("#${ctx.id}-camo",{x:${r(xD * W * 0.62)},filter:"blur(${blur}px)",duration:${outD},ease:"expo.in"},${r(T + L - outD)});`
          : `tl.to("#${ctx.id}-camo",{scale:${cam.zoomOut || 1.28},filter:"blur(${Math.round(blur * 0.77)}px)",duration:${outD},ease:"expo.in"},${r(T + L - outD)});`);
      }
      const dr = DRIFT[i % 8], push = cam.push != null ? cam.push : 0.06;
      sceneScripts.push(`tl.fromTo("#${ctx.id}-cami",{x:${r(-dr * 15)},y:${r((i % 2 ? 1 : -1) * -6)}},{x:${r(dr * 15)},y:${r((i % 2 ? 1 : -1) * 6)},duration:${r(L)},ease:"none"},${T});`);
      if (push) sceneScripts.push(`tl.fromTo("#${ctx.id}-cami",{scale:1},{scale:${r(1 + push)},duration:${r(L)},ease:"sine.inOut"},${T});`);
    }
    if (family.perScene) sceneScripts.push(family.perScene(scene, ctx) || "");
    if (!isLast) sceneScripts.push(`kill("#${ctx.id}",${r(T + L)});`);
  });

  const chrome = family.chrome
    ? family.chrome({ theme, D, brand, url, count: scenes.length, land, dims: { width: W, height: H }, framePack, esc, rgba, r, variant: variantFor(framePack, family.variants || 1) })
    : { html: "", script: "" };

  const cues = (Array.isArray(captionCues) ? captionCues : [])
    .filter((c) => c && c.text != null)
    .map((c) => [r(c.start != null ? c.start : c.startSec || 0), r(c.end != null ? c.end : (c.start || 0) + 2), String(c.text)]);

  // The narration, on screen in display type. Driven off the same seeked time
  // lookup as the subtitle node below, so it is frame-exact under scrubbing.
  let overlay = null;
  try {
    // OPT-IN — see the note in omelette_adapter. The narration in display type
    // duplicates the copy the family's own headline slots already show, in a
    // second face, over whatever the scene drew. It renders only on an explicit
    // request now; `captionCues` no longer implies it, because subtitles and a
    // full-frame script layer are different asks.
    // `!== true` on purpose — the default "omelette" mode must not reach this
    // path: this engine has no placeScript (the layer pins to a fixed band,
    // which is exactly the burned-in-caption look the user rejected), 46/49
    // family packs fall back to the generic Anton stack because
    // theme.fonts.display doesn't resolve here, and the halo is hardcoded black
    // behind the pack's dark ink. Only an explicit job-level `true` turns the
    // layer on for family/landscape packs.
    if (opts.scriptOverlay !== true || !Array.isArray(opts.scriptCues) || !opts.scriptCues.length) {
      throw new Error("script overlay not requested");
    }
    // The pack's ink on the pack's ground, run through readable() so the pairing
    // is guaranteed to clear AA before it is ever written into the film.
    const oGround = theme.card || theme.ground || "#0B0B0C";
    overlay = require("./script_overlay").buildScriptOverlay(opts.scriptCues, W, H, {
      ground: oGround,
      ink: readable(oGround, theme.ink, 1, 4.5),
      font: (theme.fonts && (theme.fonts.display || theme.fonts.head)) || theme.display || null,
    });
  } catch { /* a film without VO simply has no script to show */ }

  const script = `(function(){
  var D=${D};
  var tl=gsap.timeline({paused:true});
  var $=function(s){return document.querySelector(s);};
  function reps(t,c){return Math.max(0,Math.floor(t/c)-1);}
${motion.runtimeHelpers()}
  function kill(id,t){tl.set(id,{opacity:0},t);}
  function countTxt(sel,to,at,dur,pre,suf,f){f=f||1;var o={v:0};tl.to(o,{v:to*f,duration:dur,ease:"expo.out",snap:{v:1},onUpdate:function(){var e=$(sel);if(e)e.textContent=pre+(f>1?(Math.round(o.v)/f).toFixed(1):Math.round(o.v))+suf;}},at);}
  function type(sel,str,at,dur){var o={n:0};tl.to(o,{n:str.length,duration:dur,ease:"none",snap:{n:1},onUpdate:function(){var e=$(sel);if(e)e.textContent=str.slice(0,Math.round(o.n));}},at);}

  ${chrome.script || ""}

  ${sceneScripts.filter(Boolean).join("\n  ")}

  ${overlay ? overlay.js : ""}
  var cues=${JSON.stringify(cues)};
  tl.to({},{duration:D,ease:"none",onUpdate:function(){
    var now=tl.time();
    if(window.__kfScript) window.__kfScript(now);
    var cap=$("#cap-pill"),txt=$("#cap-text");
    if(cap&&txt){var a=null;for(var k=0;k<cues.length;k++){if(now>=cues[k][0]&&now<cues[k][1]){a=cues[k];break;}}if(a){if(txt.textContent!==a[2])txt.textContent=a[2];cap.style.opacity="1";}else cap.style.opacity="0";}
  }},0);

  window.__timelines=window.__timelines||{};
  window.__timelines["vid"]=tl;
  if(typeof navigator==="undefined"||!navigator.webdriver){tl.play(0);tl.eventCallback("onComplete",function(){tl.restart();});}
})();`;

  const capsHtml = `<div id="caps" class="clip" data-start="0" data-duration="${r(D + 0.5)}" data-track-index="41" style="z-index:41;background:none;"><div id="cap-pill"><div id="cap-text"></div></div></div>`
    + (overlay ? `<div id="kf-script-clip" class="clip" data-start="0" data-duration="${r(D + 0.5)}" data-track-index="42" style="z-index:72;background:none;">${overlay.html}</div>` : "");
  const indexHtml = [
    `<!DOCTYPE html>`, `<html lang="en">`, `<head>`, `<meta charset="utf-8">`, `<title>vid</title>`,
    `<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>`,
    `<style>`, baseCss(theme), family.styleBlock(theme, land), textfxCss(opts.manifest, framePack),
    authoredCss.join("\n"), overlay ? overlay.css : "", `</style>`,
    `</head>`, `<body>`,
    `<div id="root" class="composition" data-composition-id="vid" data-width="${W}" data-height="${H}" data-start="0" data-duration="${D}" style="width:${W}px;height:${H}px;">`,
    withZIndex((chrome.html || "").replace(/__D__/g, String(r(D + 0.5)))),
    capsHtml,
    bodyParts.join("\n"),
    `</div>`,
    `<script>`, script, `</script>`,
    `</body>`, `</html>`,
  ].join("\n");

  const metaJson = JSON.stringify({ compositionId: "vid", width: W, height: H, fps: (dims && dims.fps) || 30, duration: D });
  return { indexHtml, metaJson };
}

// Structural CSS every family relies on (the .clip/.camo/.cami contract + the
// caption node). Families add their own look on top and may restyle #cap-pill.
// PER-PACK TYPOGRAPHIC TREATMENT (manifest `textfx`) for the FAMILY path.
//
// scene_kit has always honoured textfx.case/weight (it wraps words in .kfw and
// styles that class), but the family templates never did — every family draws its
// display type with inline `font-family:${th.displayStack};font-weight:400`, so a
// pack could declare case:"upper" / weight:900 and render sentence-case and light.
// That silently split the 2026-07-30 energetic wave in half: 30 dedicated packs
// took the treatment, 49 family packs took only the font.
//
// The hook is that inline font-family: the pack's DISPLAY face name appears in
// the style attribute of exactly its display-type elements (body and mono runs
// use a different stack), so an attribute selector reaches display type and
// nothing else. `!important` is required — these are inline styles.
function textfxCss(manifest, framePack) {
  // Resolve the manifest here rather than trusting the caller: NEITHER production
  // (pipeline.composeWithPackRenderer) nor the preview generator passes one, so
  // families are themed from `{}` and an opts-only read silently produced no CSS
  // at all. Looking it up by framePack makes the treatment apply on every path.
  let m = manifest;
  if (!m || !m.textfx) {
    try { m = require("./frame_manifest").getManifest(framePack) || m; } catch { /* keep what we were given */ }
  }
  const tf = (m && m.textfx) || null;
  if (!tf) return "";
  manifest = m;
  const face = String((manifest.typography && manifest.typography.display)
    || (Array.isArray(manifest.fonts) && manifest.fonts[0]) || "").trim();
  if (!face) return "";
  const sel = `#root [style*="${face}"]`;
  const rules = [];
  if (String(tf.case).toLowerCase() === "upper") rules.push("text-transform:uppercase !important");
  const w = Number(tf.weight);
  if (Number.isFinite(w) && w >= 100 && w <= 900) rules.push(`font-weight:${Math.round(w)} !important`);
  const tr = Number(tf.tracking);
  if (Number.isFinite(tr) && Math.abs(tr) <= 0.5) rules.push(`letter-spacing:${tr}em !important`);
  if (!rules.length) return "";
  // sizeScale rides on the container-query font sizes the families already emit,
  // so it is applied as a font-size multiplier rather than a hard override —
  // overriding font-size outright would flatten every size step in the design.
  const sc = Number(tf.sizeScale);
  const scaleRule = (Number.isFinite(sc) && sc > 0.5 && sc <= 1.6 && Math.abs(sc - 1) > 0.01)
    ? `\n${sel}{font-size:calc(1em * ${Math.round(sc * 100) / 100});}` : "";
  return `\n${sel}{${rules.join(";")};}${scaleRule}\n`;
}

function baseCss(theme) {
  const ground = (theme && theme.ground) || "#101010";
  const ink = (theme && theme.ink) || "#F5F2EA";
  return `
  * { box-sizing:border-box; margin:0; padding:0; }
  html, body { width:100%; height:100%; overflow:hidden; background:${ground}; }
  #root { position:relative; overflow:hidden; isolation:isolate; container-type:size; background:${ground}; color:${ink}; }
  .clip { position:absolute; top:0; left:0; width:100%; height:100%; overflow:hidden; }
  .tpl-scene { background:none; }
  .camo, .cami { position:absolute; inset:0; will-change:transform, filter, opacity; }
  .draw { stroke-dasharray:100; stroke-dashoffset:100; }
  #caps { position:absolute; inset:0; display:flex; justify-content:center; align-items:flex-end; padding-bottom:6%; z-index:50; pointer-events:none; }
  #cap-pill { max-width:76%; height:fit-content; flex:0 0 auto; text-align:center; padding:0.8cqw 2cqw; border-radius:0.4cqw; opacity:0; background:${rgba(isDark(ground) ? "#000000" : "#FFFFFF", 0.82)}; border:1px solid ${rgba(ink, 0.25)}; }
  #cap-text { font-size:1.3cqw; line-height:1.4; color:${ink}; }`;
}

// ---- portrait density ---------------------------------------------------------
// The bundler packs anchor their sparse scene types (statement / stats / cta) in
// the upper half of the frame. At 16:9 that reads as confident white space; at
// 9:16 the sheet is nearly twice as tall for the same width, so the lower third
// renders EMPTY — the "why does my vertical video look so bare?" complaint.
//
// The content to fill it already exists and was simply never drawn: the Text
// Director mines scene.bullets for most scenes (see text_review.scenesWithBullets),
// but only the `feature` scene type ever rendered them. This turns those unused
// points into a stacked support list sized for the dead band.
//
// Callers pass geometry in cqw from their own px->cqw mapper and gate on portrait
// themselves — landscape has no gap to fill, and its layouts are already tuned.
//
//   items  : strings (bullets/chips); blanks dropped, capped at `max`
//   o      : { top,left,right, font,rowGap,gap,dotSize, fg,dot,fontFamily,
//              max, at, stagger, flow, marginTop }
//
// Two placement modes:
//   absolute (default) — for scenes whose beats swap under an absolutely-placed
//     block (storyblocks' statement), where the list must hold its own position.
//   flow (`o.flow`)    — for the single-block scenes (rule -> headline -> subtext),
//     where appending inside the existing wrapper keeps the list aligned with the
//     copy above it and lets it ride a taller headline instead of colliding.
// Returns { html, s } in the same shape as every other piece in these packs.
function supportList(id, items, ctx, o = {}) {
  const list = (items || []).map((t) => String(t == null ? "" : t).trim()).filter(Boolean).slice(0, o.max || 3);
  if (!list.length) return { html: "", s: [] };
  const { T, L } = ctx;
  const font = o.font || 3.4;
  const dotSize = o.dotSize != null ? o.dotSize : r(font * 0.42);
  const rows = list.map((t, i) => `
      <div class="${id}-sr" style="opacity:0;display:flex;align-items:flex-start;gap:${o.gap != null ? o.gap : r(font * 0.5)}cqw;${i ? `margin-top:${o.rowGap != null ? o.rowGap : r(font * 0.62)}cqw;` : ""}">
        <span style="flex:none;width:${dotSize}cqw;height:${dotSize}cqw;border-radius:999px;background:${o.dot || o.fg};margin-top:${r(font * 0.36)}cqw;"></span>
        <span style="font-family:${o.fontFamily};font-weight:700;font-size:${font}cqw;line-height:1.3;color:${o.fg};">${esc(t)}</span>
      </div>`).join("");
  const box = o.flow
    ? `margin-top:${o.marginTop != null ? o.marginTop : r(font * 1.2)}cqw;`
    : `position:absolute;left:${o.left}cqw;right:${o.right}cqw;top:${o.top}cqw;z-index:3;`;
  // OPTIONAL PLATE. This list is positioned absolutely in whatever space a scene
  // has spare, which means the surface under it is not knowable at build time —
  // in story-blocks the panel behind it animates away, leaving cream type on the
  // cream ground at 1.39:1. A caller that cannot guarantee the backdrop passes
  // `plate` and the list carries its own.
  const plateCss = o.plate
    ? `background:${o.plate};padding:${r(font * 0.7)}cqw ${r(font * 0.9)}cqw;border-radius:${r(font * 0.5)}cqw;`
    : "";
  const html = `<div id="${id}" style="${box}${plateCss}">${rows}</div>`;
  // Enter after the headline has landed, and comfortably before the scene ends.
  const at = o.at != null ? o.at : r(T + Math.min(1.5, L * 0.34));
  const stagger = o.stagger != null ? o.stagger : 0.12;
  const s = [
    `tl.fromTo(".${id}-sr",{opacity:0,x:${r(-font * 1.6)}},{opacity:1,x:0,duration:${r(Math.min(0.62, L * 0.16))},ease:"power3.out",stagger:${stagger}},${at});`,
  ];
  return { html, s };
}

// ---- LABEL THAT MATCHES THE PICTURE -------------------------------------------
// A tile wall labels its cards from the SCRIPT while filling them from the asset
// pool, and nothing correlates the two. Measured on a live Trello film: the card
// labelled "Inbox" showed the Planner page and "Boards" showed Customer Stories.
// A caption that contradicts the image under it is worse than no caption.
//
// The screenshot director already names each capture — the alt reads "… the
// inbox page (matches this scene's topic) …" and the file is page_1_inbox-page.png
// — so the truthful label is recoverable from the asset itself. Falls back to the
// script's own label when the asset carries no page name (stock, vectors).
function labelForAsset(asset, fallback, max = 16) {
  const clean = (s) => fit(String(s || "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim(), max);
  if (asset) {
    const alt = String(asset.alt || "");
    const m = /\bthe\s+([a-z0-9][a-z0-9 &'-]{1,40}?)\s+page\b/i.exec(alt);
    if (m) return clean(m[1]);
    const f = /(?:^|\/)page_\d+_(.+?)(?:-page)?\.\w+$/i.exec(String(asset.path || ""));
    if (f) return clean(f[1]);
  }
  return clean(fallback);
}

// ---- SCENE FILL ---------------------------------------------------------------
// Measured 2026-08-04 across all 8 families: a scene carries ~11 words in ~8
// elements and covers ~14% of the frame. The rest is empty ground — which is why
// films read as thin. The copy usually EXISTS (the script and the Text Director
// mine supporting points, figures and a subtext per scene); most scene types
// simply draw a headline and one line and drop the rest.
//
// This emits the leftovers as designed furniture in a band the family says is
// safe, so nothing overlaps authored layout:
//   * a chip row of the scene's OWN supporting points
//   * a figure chip when the scene has a number the design did not already use
//   * a slow marquee of the film's own key phrases (never invented copy)
//
// Rules it inherits from the rest of this file: seek-safe (finite reps, no
// runtime randomness), and every colour guaranteed against the plate it sits on
// rather than against theme.ground — the blind spot that produced a day of
// near-miss contrast failures.
function sceneFill(id, scene, ctx, o = {}) {
  const { land, T, L, theme: th } = ctx;
  const plate = o.plate || th.card || th.ground || "#111";
  const ink = readable(plate, o.ink || th.ink, 1, 4.5);
  const soft = readable(plate, o.ink || th.ink, 0.78, 4.5);
  const accent = o.accent || th.accent || ink;
  const font = o.fontFamily || th.bodyStack || "system-ui, sans-serif";
  const fs0 = o.font != null ? o.font : (land ? 1.15 : 2.0);

  // Only copy this scene actually owns. `used` lets a family exclude what its own
  // design already drew, so nothing is said twice.
  const used = new Set((o.used || []).map((x) => String(x || "").trim().toLowerCase()));
  const pts = bullets(scene, 6)
    .map((b) => fit(String(b), o.maxChars || 30))
    .filter((b) => b && !used.has(b.toLowerCase()))
    .slice(0, o.max || 3);
  const st = statsOf(scene, 1)[0] || mineStat(scene.subtext) || null;
  const showStat = !!st && !o.noStat;
  const tokens = (Array.isArray(o.marquee) ? o.marquee : [ctx.brand, ctx.url, scene.headline || scene.title])
    .map((x) => fit(String(x || "").trim(), 28))
    .filter(Boolean);
  // A family that already draws a brand ticker in its chrome passes marquee:false
  // — two tickers on one frame is not density, it is a duplicate.
  const phrase = (o.marquee === false || tokens.length < 2) ? "" : tokens.join("  •  ").toUpperCase();
  if (!pts.length && !showStat && !phrase) return { html: "", s: [] };

  const gap = r(fs0 * 0.7);
  const chip = (t, i) => `<span class="${id}-fc" style="opacity:0;display:inline-flex;align-items:center;gap:${r(fs0 * 0.5)}cqw;padding:${r(fs0 * 0.42)}cqw ${r(fs0 * 0.8)}cqw;border-radius:999px;background:${rgba(o.ink || th.ink, 0.09)};border:${land ? 0.08 : 0.14}cqw solid ${rgba(o.ink || th.ink, 0.16)};font-family:${font};font-weight:600;font-size:${fs0}cqw;color:${ink};white-space:nowrap;">
      <span style="width:${r(fs0 * 0.36)}cqw;height:${r(fs0 * 0.36)}cqw;border-radius:50%;background:${accent};display:block;flex:0 0 auto;"></span>${esc(t)}</span>`;
  const statChip = showStat
    ? `<span class="${id}-fc" style="opacity:0;display:inline-flex;align-items:baseline;gap:${r(fs0 * 0.4)}cqw;padding:${r(fs0 * 0.42)}cqw ${r(fs0 * 0.9)}cqw;border-radius:999px;background:${rgba(accent, 0.14)};font-family:${font};font-size:${fs0}cqw;color:${ink};white-space:nowrap;">
        <b style="font-size:${r(fs0 * 1.5)}cqw;font-weight:800;letter-spacing:-0.02em;">${esc(st.pre || "")}${st.isFloat ? st.v.toFixed(1) : Math.round(st.v)}${esc(st.suf || "")}</b>
        <span style="opacity:0.85;">${esc(fit(String(st.l || ""), 18))}</span></span>`
    : "";
  const marquee = phrase
    ? `<div style="overflow:hidden;margin-top:${gap}cqw;"><div id="${id}-fm" style="white-space:nowrap;font-family:${font};font-weight:600;font-size:${r(fs0 * 0.92)}cqw;letter-spacing:0.14em;text-transform:uppercase;color:${soft};">${esc(phrase)} &nbsp;•&nbsp; ${esc(phrase)}</div></div>`
    : "";

  const box = o.flow
    ? `margin-top:${o.marginTop != null ? o.marginTop : gap}cqw;`
    : `position:absolute;left:${o.left}cqw;right:${o.right}cqw;${o.bottom != null ? `bottom:${o.bottom}cqw;` : `top:${o.top}cqw;`}z-index:3;`;
  const html = `<div id="${id}-fill" style="${box}">
    <div style="display:flex;flex-wrap:wrap;gap:${gap}cqw;align-items:center;">${statChip}${pts.map(chip).join("")}</div>
    ${marquee}
  </div>`;

  const at = o.at != null ? o.at : r(T + Math.min(1.4, L * 0.32));
  const s = [
    `tl.fromTo(".${id}-fc",{opacity:0,y:${r(fs0 * 8)},scale:0.94},{opacity:1,y:0,scale:1,duration:0.46,ease:"power3.out",stagger:0.09,immediateRender:false},${at});`,
  ];
  if (phrase) {
    // One slow pass across the scene's remaining time — finite, so a seek lands
    // in exactly one place.
    s.push(`tl.fromTo("#${id}-fm",{xPercent:0},{xPercent:-50,duration:${r(Math.max(2, L - 1))},ease:"none",immediateRender:false},${at});`);
  }
  return { html, s };
}

module.exports = {
  buildFilm, planMedia, fillSlots, shapeForWant, isDeviceWant, withDisplayCopy, sceneFill,
  esc, r, rgba, lum, isDark, inkOn, mix, hexToRgb, contrastRatio, flatten, readable,
  breakLines, bullets, fit, mineStat, statsOf, supportList, labelForAsset,
  ratioOf, isPortraitAsset, isScreenshot, isLogo, plateOk, isVector, hashSeed, variantFor,
};
