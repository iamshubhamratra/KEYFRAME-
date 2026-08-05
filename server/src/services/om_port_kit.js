// OM PORT KIT — the shared machinery behind the imported OM/React template ports.
//
// WHY IT EXISTS. All 16 imported templates share ONE contract: `window.OM_SCENES` +
// `<SceneStage transition="cut">` + `<MediaSlot src={s.shot}>` + a `theme` object whose accent
// is the brand hook. What differs between them is the ART — a matrix rain, a departures board,
// a bioluminescent trench — not the plumbing. Showcase was ported longhand first; everything in
// this file is the part of it that was never about Showcase.
//
// A template built on this kit supplies a THEME, its STRINGS, and its SCENE BUILDERS. The kit
// supplies the things that are easy to get subtly wrong and expensive to re-learn:
//
//   · the clip/camera/chrome shell and the film-wide progress rule
//   · the caption node — ONE node for the whole film, seek-safe, and the single choke point
//     multilang injection targets
//   · role assignment with a picture BUDGET, so a layout is never promised imagery that has
//     already been spent
//   · slot filling BREADTH BEFORE DEPTH, scored on CD rank + scene-id hint + own-asset bonus
//     − log-misfit, so a 1.78:1 capture never lands in a 0.46:1 phone screen
//   · the STATEMENT fallback — the layout for a beat that has no picture
//   · brand resolution, text fitting, and the GSAP timeline assembly
//
// THE TWO LAWS EVERY PORT INHERITS (both learned from delivered films that QA blocked):
//   1. NEVER DRAW AN EMPTY CONTAINER. No device frame, panel or plate around nothing.
//   2. NEVER LEAVE AN EMPTY FRAME EITHER. A beat with no picture gets `statement`, a layout
//      DESIGNED to be pictureless — not its normal layout with the picture removed.
// ─────────────────────────────────────────────────────────────────────────────────────

const { fontFaceCss, isBundled } = require("./../fonts/pack_fonts");
const { resolveBrand } = require("./brand_kit");
const { GSAP_CDN, r, esc, hexToRgb, relLum, bullets, logoAssetOf, resolveBrandName } = require("./composer_kit");
const {
  dealTransitions, classifyBeat, xfadeFor, accentsFrom, mulberry, RUNTIME_HELPERS,
} = require("./transition_kit");

// ---- stage -------------------------------------------------------------------
// Every geometry helper is built against ONE stage, so a template states its authored size
// once and then writes the reference's own pixel numbers verbatim.
function stageOf(W, H) {
  const U = (px) => Math.round((px / W) * 10000) / 100;   // px -> cqw, 2dp
  return { W, H, U, VH: U(H), portrait: H > W };
}

// ---- colour ------------------------------------------------------------------
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const hex2 = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
const rgbHex = (a) => `#${hex2(a[0])}${hex2(a[1])}${hex2(a[2])}`;
const rgba = (h, a) => { const c = hexToRgb(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
const lerp = (a, b, t) => a + (b - a) * t;
function mixHex(a, b, t) {
  const x = hexToRgb(a), y = hexToRgb(b);
  return rgbHex([lerp(x[0], y[0], t), lerp(x[1], y[1], t), lerp(x[2], y[2], t)]);
}
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
// Companion hues as rotations of the brand accent. This is what stops a branded film wearing
// its colour in one element and the stock palette everywhere else.
const spin = (hex, deg, dl = 0, minS = 0.42) => {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  return hslToHex(h + deg, Math.max(minS, s), clamp01(l + dl));
};
// Force an accent to clear its ground. `dark` grounds lift it, light grounds darken it —
// either way a pale or muddy brand still reads AS an accent.
function ensureContrast(hex, { dark = false, limit = dark ? 0.34 : 0.46 } = {}) {
  let [rr, gg, bb] = hexToRgb(hex);
  if (dark) {
    for (let i = 0; i < 24 && relLum(rgbHex([rr, gg, bb])) < limit; i++) {
      rr = rr + (255 - rr) * 0.14; gg = gg + (255 - gg) * 0.14; bb = bb + (255 - bb) * 0.14;
    }
  } else {
    for (let i = 0; i < 24 && relLum(rgbHex([rr, gg, bb])) > limit; i++) { rr *= 0.9; gg *= 0.9; bb *= 0.9; }
  }
  return rgbHex([rr, gg, bb]);
}
const inkOn = (hex, dark = "#0B0B0C", light = "#FFFFFF") => (relLum(hex) > 0.5 ? dark : light);

// Resolve the brand once, the same way for every port: one accent, contrast-corrected against
// the pack's own ground, plus the `resolvedBrand` return trip the Brand panel reads.
function resolveAccent(brandSkin, { ground, isDark, packAccent }) {
  try {
    const brand = resolveBrand(brandSkin, { ground, isDark, packAccents: [packAccent] });
    if (brand.applied && brand.accent) {
      const accent = ensureContrast(brand.accent, { dark: isDark });
      return {
        accent,
        resolvedBrand: {
          ...(brandSkin && typeof brandSkin === "object" ? brandSkin : {}),
          // ONE accent reported, because one accent is what the film wears. Reporting a
          // palette the composition never paints is how a coverage disclosure starts lying.
          accents: [accent],
          emphasis: brand.emphasis, adjusted: brand.adjusted, dropped: brand.dropped,
          tier: brand.tier, applied: true,
        },
      };
    }
  } catch { /* fall through to the pack's own accent */ }
  return { accent: packAccent, resolvedBrand: null };
}

// EVERY FAMILY THE PACK NAMES MUST GET AN @font-face, not just the display and mono ones.
// Four packs set their BODY copy in a third family (Figtree) that only appeared inside the
// fallback string — so the renderer's `font_family_without_font_face` lint failed them and the
// body text would have rendered in a generic fallback. `extra` is that third family.
function fontStacks(display, mono, fallback = "'Helvetica Neue', Arial, sans-serif", extra = []) {
  const families = [display, mono, ...(Array.isArray(extra) ? extra : [extra])].filter(Boolean);
  const seen = new Set();
  const fontFace = families
    .filter((f) => !seen.has(f.toLowerCase()) && seen.add(f.toLowerCase()) && isBundled(f))
    .map((f) => fontFaceCss(f))
    .join("");
  return {
    fontFace,
    displayStack: `'${display}', ${fallback}`,
    monoStack: `'${mono}', ui-monospace, monospace`,
  };
}

// ---- text --------------------------------------------------------------------
const wordsOf = (t) => String(t || "").trim().split(/\s+/).filter(Boolean);
// Trim to at most `max` characters ON A WORD BOUNDARY. A bare slice() cuts mid-word, and a
// button reading "REPLACE MESSY SPREADSH" is indistinguishable from clipped text — QA blocked
// a delivered film for exactly that. Keeps at least the first word, however long it is.
function clampWords(text, max) {
  const s = String(text || "").trim();
  if (s.length <= max) return s;
  const words = wordsOf(s);
  let out = words[0] || "";
  for (let i = 1; i < words.length && `${out} ${words[i]}`.length <= max; i++) out += ` ${words[i]}`;
  return out;
}
// Mean glyph advance, in em. MEASURED off renders, never estimated — two ports shipped a
// too-low number and clipped a headline before it was corrected against actual pixels.
// Uppercase condensed display faces run wider than mixed-case grotesks.
const ADVANCE = { mixed: 0.55, upper: 0.70, mono: 0.60 };
const FIT_SAFETY = 0.95;

function fitLines(text, maxLineCqw, maxSizeCqw, maxLines = 3, adv = ADVANCE.mixed) {
  const words = wordsOf(text);
  if (!words.length) return { lines: [], size: maxSizeCqw };
  for (let n = 1; n <= maxLines; n++) {
    const target = Math.ceil(words.length / n);
    const lines = [];
    for (let i = 0; i < words.length; i += target) lines.push(words.slice(i, i + target).join(" "));
    if (lines.length > n) continue;
    const longest = lines.reduce((a, l) => Math.max(a, l.length), 0);
    const size = Math.min(maxSizeCqw, (maxLineCqw * FIT_SAFETY) / (longest * adv));
    // Accept the first line count that does not force the type below 62% of its authored
    // size — past that the layout is better served by another line than by smaller type.
    if (size >= maxSizeCqw * 0.62 || n === maxLines) return { lines, size: Math.max(size, maxSizeCqw * 0.4) };
  }
  return { lines: [text], size: maxSizeCqw * 0.4 };
}
// One line, shrunk to fit. Never wraps — for URLs, brand words and button labels.
function fitOne(text, lineCqw, maxSizeCqw, adv = ADVANCE.mixed, floorCqw = 0.6) {
  const n = String(text || "").length || 1;
  return Math.max(floorCqw, Math.min(maxSizeCqw, (lineCqw * FIT_SAFETY) / (n * adv)));
}

const domainOf = (s) => {
  const m = String(s || "").match(/\b((?:[a-z0-9-]+\.)+(?:com|io|ai|app|co|dev|net|org|so|xyz|studio|design|tech|cloud|sh|me))\b/i);
  return m ? m[1].toLowerCase() : "";
};

// Figures a stat card can print, with whatever unit was attached. NOTHING is invented here —
// a proof card printing a number the script never claimed is the defect the agent audit closed.
function numbersIn(scene, max = 3) {
  const text = [scene.emphasis, scene.headline, scene.subtext, scene.body].filter(Boolean).join(" · ");
  const out = [];
  const re = /(\d[\d.,]*)\s*(%|x|k\+?|m\+?|b\+?|★|\/\s*\d+|hrs?|days?|min(?:ute)?s?|sec(?:ond)?s?)?/gi;
  let m;
  while ((m = re.exec(text)) && out.length < max) {
    const v = m[1].replace(/,$/, "");
    if (!v || v.length > 6) continue;
    out.push({ v, suffix: (m[2] || "").trim() });
  }
  return out;
}
// The card already prints the number in display type, so a label lifted verbatim off
// "12K+ teams" renders as "12K+" above "12K+ TEAMS" — a layout bug, not a caption.
const NUMERIC_TOKEN = /^[\d.,]+\s*(%|x|k\+?|m\+?|b\+?|★)?$/i;
function statLabel(scene, i, maxLen = 16) {
  const list = bullets(scene, 3);
  const clean = (s) => wordsOf(s).filter((w) => !NUMERIC_TOKEN.test(w)).slice(0, 2).join(" ").toUpperCase().slice(0, maxLen);
  return list[i] ? clean(list[i]) : clean(scene.subtext || scene.headline || "");
}

// ---- assets ------------------------------------------------------------------
const ratioOf = (a) => Number(a && a.ratio) || (a && a.width && a.height ? a.width / a.height : 0);
function screenOk(a) {
  if (!a || !a.path) return false;
  if (String(a.role || "") === "logo") return false;
  const k = String(a.kind || a.type || "");
  return k !== "audio" && k !== "video";
}
const BRAND_SOURCES = new Set(["upload", "website", "website-brand", "website-asset"]);
const isOwnAsset = (a) => !!a && (BRAND_SOURCES.has(String(a.source || "")) || String(a.role || "") === "logo");

// A picture filling a box, cropped from its centre. `filter` lets a pack impose a treatment
// (a trench blue-shift, a terminal green-screen) without every scene repeating it.
function shotFill(asset, { focus = "center center", filter = null, bg = "#000" } = {}) {
  if (!asset || !asset.path) return "";
  return `<img src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:${focus};display:block;background:${bg};${filter ? `filter:${filter};` : ""}">`;
}

// ---- the spine ---------------------------------------------------------------
// Role assignment against a picture BUDGET. Roles are chosen before assets are placed, because
// how many pictures a beat can hold is a property of the LAYOUT it was given, not of the beat —
// assigning the other way round is what produced the earlier ports' stranded shots.
//
// `spec` is the template's own table:
//   { first, last, middle:[...], slots:(role,budget)=>n, carry:(role,scene,budget)=>bool }
function assignRoles(scenes, totalShots, spec) {
  const n = scenes.length;
  if (n === 1) return [spec.first];
  const roles = new Array(n).fill(null);
  roles[0] = spec.first;
  roles[n - 1] = spec.last;
  let budget = Math.max(0, totalShots - spec.slots(spec.first, totalShots));
  let cur = 0, dry = 0;
  for (let i = 1; i < n - 1; i++) {
    let pick = null;
    for (let step = 0; step < spec.middle.length; step++) {
      const cand = spec.middle[(cur + step) % spec.middle.length];
      if (spec.carry(cand, scenes[i], budget)) { pick = cand; cur = (cur + step + 1) % spec.middle.length; break; }
    }
    // NOTHING FIT — the film has run out of pictures, so the beat gets the STATEMENT layout,
    // which is designed to be pictureless rather than degraded into being pictureless.
    // Alternating its two alignments matters: an asset-poor film that prints the identical
    // composition three and four times running reads as a stuck render, not as a design.
    if (!pick) { pick = dry++ % 2 ? "statement-c" : "statement"; cur = (cur + 1) % spec.middle.length; }
    roles[i] = pick;
    budget = Math.max(0, budget - spec.slots(pick, budget));
  }
  return roles;
}

// Fill every drawable box with the best remaining picture.
//
// BREADTH BEFORE DEPTH: every scene's first box, in scene order, before any scene's second.
// Walking scene by scene instead lets one montage take six pictures while three later beats
// get none — a film that front-loads its imagery and then goes blank.
function fillSlots(scenes, roles, shots, spec) {
  const sceneShots = scenes.map(() => []);
  const sceneIdOf = (i) => (scenes[i].id != null ? String(scenes[i].id) : `s${i + 1}`);
  const slots = [];
  const maxSlots = Math.max(0, ...roles.map((role) => spec.slots(role, shots.length)));
  for (let rank = 0; rank < maxSlots; rank++) {
    roles.forEach((role, i) => {
      if (spec.slots(role, shots.length) <= rank) return;
      const shapes = (spec.shapes && spec.shapes[role]) || [];
      slots.push({ i, target: shapes[rank] || shapes[0] || 1.6 });
    });
  }
  const taken = new Set();
  for (const slot of slots) {
    let pick = -1, best = -Infinity;
    for (let a = 0; a < shots.length; a++) {
      if (taken.has(a)) continue;
      const ar = ratioOf(shots[a]) || slot.target;
      const misfit = Math.abs(Math.log(ar / slot.target));
      // The CD's sceneId is a strong RELEVANCE hint, so it outweighs a mild shape mismatch —
      // but not an extreme one, where honouring it would crop the picture to nothing while
      // another asset fills the slot edge to edge. Phone screens are where this bites hardest.
      const hint = String(shots[a].sceneId != null ? shots[a].sceneId : "") === sceneIdOf(slot.i) ? 4 : 0;
      const own = isOwnAsset(shots[a]) ? 3 : 0;
      const score = (Number(shots[a].cdScore) || 0) + hint + own - 3 * misfit;
      if (score > best) { best = score; pick = a; }
    }
    if (pick < 0) break;   // out of pictures — the remaining layouts fall back to type
    taken.add(pick);
    sceneShots[slot.i].push(shots[pick]);
  }
  return sceneShots;
}

// ---- timing ------------------------------------------------------------------
// Finite repeat count for an ambient loop, so nothing runs past the scene it belongs to.
const reps = (span, dur) => Math.max(0, Math.floor(span / Math.max(0.001, dur)) - 1);
function seedFrom(str) {
  let h = 2166136261; const s = String(str || "om");
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) || 7;
}
const pad2 = (n) => String(n).padStart(2, "0");

// ---- shell -------------------------------------------------------------------
// The clip + camera + chrome wrapper every scene shares.
//
// FOUR LAYERS, AND EACH ONE IS OWNED BY EXACTLY ONE ANIMATOR. That single-ownership rule is
// what lets this family have both a continuously-alive frame and varied cuts without the two
// systems fighting for a property (`overlapping_gsap_tweens` is a seek-order hazard, not just
// a lint nit):
//
//   .om-cam    the CUT layer      — owned by transition_kit. transform/opacity/filter/clip-path.
//   .om-bg     the PARALLAX layer — the pack's backdrop, drifting slower than the content.
//   .om-drift  the AMBIENT layer  — the content's own slow push across the beat.
//   .om-hud    the FURNITURE      — chrome. Sits OUTSIDE .om-cam so it never rides the cut;
//                                   cross-faded across the overlap so two scenes' HUDs never
//                                   ghost over each other.
//
// The HUD wrapper is kit-owned on purpose: packs return wildly different chrome markup (a
// bare positioned div, a `.om-chrome` block, a story bar), so there is no class the kit could
// rely on. The wrapper is `position:static`, so absolutely-positioned chrome still resolves
// against the clip root exactly as it did before — geometry is untouched.
function open(ctx, inner, { backdrop = "", chrome = null } = {}) {
  return `<div id="${ctx.id}" class="clip om-scene" data-start="${r(ctx.T)}" data-duration="${r(ctx.clipDur)}" data-track-index="${ctx.track}" style="opacity:0;">
  <div class="om-cam">
    <div class="om-bg">${backdrop}</div>
    <div class="om-drift">${inner}</div>
  </div>
  <div class="om-hud">${chrome == null ? chromeHtml(ctx) : chrome}</div>
</div>`;
}

// A running HUD: brand badge, beat label, scene counter, film-wide progress rule.
function chromeHtml(ctx) {
  const { th, U } = ctx;
  const initial = (ctx.brand || "F").trim().charAt(0).toUpperCase() || "F";
  const pad = ctx.portrait ? U(54) : U(60);
  return `<div class="om-chrome">
    <div style="position:absolute;top:${r(ctx.portrait ? U(64) : U(46))}cqw;left:${r(pad)}cqw;display:flex;align-items:center;gap:${r(U(14))}cqw;">
      <span style="width:${r(U(30))}cqw;height:${r(U(30))}cqw;border-radius:${r(U(9))}cqw;background:${th.accent};display:grid;place-items:center;color:${inkOn(th.accent)};font-family:${th.displayStack};font-weight:700;font-size:${r(U(18))}cqw;flex:0 0 auto;">${esc(initial)}</span>
      <span style="font-family:${th.displayStack};font-weight:700;font-size:${r(U(22))}cqw;color:${th.ink};letter-spacing:-0.01em;white-space:nowrap;">${esc(ctx.brand)}</span>
      ${ctx.label ? `<span style="font-family:${th.monoStack};font-size:${r(U(13))}cqw;letter-spacing:0.14em;color:${th.sub};text-transform:uppercase;white-space:nowrap;">／ ${esc(ctx.label)}</span>` : ""}
    </div>
    ${ctx.portrait ? "" : `<div style="position:absolute;top:${r(U(52))}cqw;right:${r(pad)}cqw;font-family:${th.monoStack};font-size:${r(U(13))}cqw;letter-spacing:0.18em;color:${th.sub};">${esc(ctx.S.scene || "SCENE")} ${pad2(ctx.i + 1)} ${esc(ctx.S.of || "OF")} ${pad2(ctx.total)}</div>`}
    <div style="position:absolute;bottom:${r(ctx.portrait ? U(62) : U(52))}cqw;left:${r(pad)}cqw;right:${r(pad)}cqw;height:${r(U(4))}cqw;border-radius:${r(U(4))}cqw;background:${rgba(th.ink, 0.1)};overflow:hidden;">
      <div class="${ctx.id}-prog" style="width:100%;height:100%;border-radius:${r(U(4))}cqw;background:${th.accent};transform:scaleX(0);transform-origin:left center;"></div>
    </div>
  </div>`;
}
// The progress rule fills across the WHOLE film, so it is driven from absolute time.
function chromeTweens(ctx, D) {
  const from = ctx.T / Math.max(0.001, D), to = (ctx.T + ctx.clipDur) / Math.max(0.001, D);
  return [`tl.fromTo(".${ctx.id}-prog",{scaleX:${r(from)}},{scaleX:${r(to)},duration:${r(ctx.clipDur)},ease:"none"},${r(ctx.T)});`];
}

// LEGACY camera: a slide-push in, a slow scale across the beat, a slide-push out — ONE move,
// performed identically by every scene of every film of all 14 packs. Kept only for a pack that
// explicitly opts out of the transition system (`transitions:false`), because a template with a
// bespoke edit of its own should not be forced onto the shared one.
function cameraTweens(ctx, { push = 200, scale = 1.03 } = {}) {
  const { id, L, U } = ctx;
  const IN = Math.min(0.55, L * 0.12), OUT = Math.max(0.1, L * 0.12);
  const tail = Math.max(0.1, L - OUT);
  return [
    `tl.fromTo("#${id} .om-cam",{x:"${r(U(push))}cqw",opacity:0},{x:0,opacity:1,duration:${r(IN)},ease:"power3.out"},${r(ctx.T)});`,
    `tl.fromTo("#${id} .om-cam",{scale:1},{scale:${scale},duration:${r(L)},ease:"sine.inOut"},${r(ctx.T)});`,
    `tl.to("#${id} .om-cam",{x:"${r(-U(push))}cqw",opacity:0,duration:${r(OUT)},ease:"power2.in"},${r(ctx.T + tail)});`,
    // HARD KILL ON THE FADED ELEMENT ITSELF. Killing the scene root is not enough: a
    // non-linear seek landing after the exit would restore stale visibility on `.om-cam`
    // while the root is hidden, and the renderer's lint fails the composition for it.
    `tl.set("#${id} .om-cam",{opacity:0},${r(ctx.T + ctx.clipDur)});`,
  ];
}

// THE CAMERA CONFIG WAS BEING READ IN TWO DIFFERENT UNITS. `cameraTweens` takes `push` in
// AUTHORED PIXELS and runs it through U(); drive, momentum and teampulse each passed a
// FRACTION (`push: 0.03`) plus a `drift` key that nothing read. U(0.03) is 0.003cqw, so those
// three packs pushed by three thousandths of a frame — no camera move at all, only the 3%
// scale — and momentum's own comment says its per-scene "zoom/whip rig becomes the kit's
// camera". The intent was there; the units silently ate it.
//
// Both spellings are now honoured: >= 1 means authored px, < 1 means a fraction of the frame.
function normalizeCamera(camera = {}, stage) {
  const raw = Number(camera.push);
  const pushPx = !Number.isFinite(raw) ? 200 : (raw >= 1 ? raw : raw * stage.W);
  const scale = Number(camera.scale) || (Number(camera.drift) ? 1 + Number(camera.drift) : 1.03);
  return { push: pushPx, scale };
}

// AMBIENT MOTION — the reason a frame reads as alive between cuts rather than as a still that
// happens to arrive and leave. Two layers moving at different rates is the cheapest honest
// parallax there is: the backdrop creeps, the content pushes, and the gap between them reads
// as depth.
//
// The magnitude is deliberately the SAME 1.03 the old single-layer camera used, so the safe
// area every pack's layout was measured against is unchanged (the SAFE-AREA LAW: a camera that
// scales its own layer shrinks the usable frame). This is a redistribution of existing motion
// across layers, not an increase in it.
function driftTweens(ctx, { scale = 1.03, dir = 1 } = {}) {
  const { id, L, T } = ctx;
  const bgScale = 1 + (scale - 1) * 0.45;   // the backdrop creeps at under half the content's rate
  return [
    `tl.fromTo("#${id} .om-drift",{scale:1,y:"${r(0.5 * dir)}cqw"},{scale:${r(scale)},y:"${r(-0.5 * dir)}cqw",duration:${r(L)},ease:"sine.inOut"},${r(T)});`,
    `tl.fromTo("#${id} .om-bg",{scale:${r(bgScale)},x:"${r(-0.6 * dir)}cqw"},{scale:1,x:"${r(0.6 * dir)}cqw",duration:${r(L)},ease:"sine.inOut"},${r(T)});`,
  ];
}
// The camera scales its own layer, so that fraction of every edge is off-frame for the whole
// beat. Anything MEASURED must divide by this. (SAFE-AREA LAW, learned from slab-stage.)
const camSafe = (scale = 1.03) => scale;

// ---- the statement layout ----------------------------------------------------
// THE LAYOUT FOR A BEAT WITH NO PICTURE.
//
// Avoiding a hollow container is only half the problem. Showcase's first cut fell back to
// "the same layout, minus the screenshot", and QA blocked two frames of a delivered film for
// it — "under-illustrated frame with massive empty space around headline". An empty FRAME is
// the same defect as an empty PANEL, failing at a different scale.
//
// So: oversized type scaled to the room it has, an accent rule, and the beat's own bullets as
// a full-width ruled list whose rows DIVIDE the remaining height — one bullet and four bullets
// both reach the foot of the stage. Every word comes from the script.
function statement(scene, ctx, { centred = false } = {}) {
  const { id, th, U, VH, at, du } = ctx;
  const eyebrow = String(scene.kicker || scene.purpose || ctx.label || "").toUpperCase().slice(0, 34);
  const list = bullets(scene, 4);
  const body = String(scene.subtext || scene.body || "").slice(0, 140);

  const margin = ctx.portrait ? U(84) : U(96);
  const colW = centred ? ctx.U(ctx.W) - margin * 2.5 : ctx.U(ctx.W) - margin * 2;
  const left = centred ? margin * 1.25 : margin;
  const headMax = list.length ? (ctx.portrait ? U(104) : U(126)) : (ctx.portrait ? U(126) : U(158));
  const head = fitLines(scene.headline || scene.title || "", colW / camSafe(), headMax, 3, th.adv || ADVANCE.mixed);

  const top = VH * 0.21;
  const eyeH = eyebrow ? U(40) : 0;
  const ruleY = top + eyeH + head.lines.length * head.size * 1.02 + U(34);
  const bodyY = ruleY + U(44);
  const listY = bodyY + (body ? U(78) : U(10));
  const foot = VH * 0.845;
  const rowH = list.length ? Math.max(U(74), (foot - listY) / list.length) : 0;

  const rows = list.map((b, i) => `<div class="${id}-row" style="position:absolute;left:${r(left)}cqw;top:${r(listY + i * rowH)}cqw;width:${r(colW)}cqw;height:${r(rowH)}cqw;display:flex;align-items:center;gap:${r(U(20))}cqw;border-top:1px solid ${rgba(th.ink, 0.14)};opacity:0;">
      <span style="width:${r(U(12))}cqw;height:${r(U(12))}cqw;border-radius:50%;background:${th.accent};flex:0 0 auto;"></span>
      <span style="font-family:${th.displayStack};font-weight:600;font-size:${r(U(30))}cqw;line-height:1.25;color:${th.ink};">${esc(String(b).slice(0, 78))}</span>
    </div>`).join("");

  return {
    html: `
    <div class="${id}-head" style="position:absolute;left:${r(left)}cqw;top:${r(top)}cqw;width:${r(colW)}cqw;${centred ? "text-align:center;" : ""}opacity:0;">
      ${eyebrow ? `<div style="font-family:${th.monoStack};font-size:${r(U(17))}cqw;letter-spacing:0.22em;color:${th.accent};text-transform:uppercase;margin-bottom:${r(U(16))}cqw;">${esc(eyebrow)}</div>` : ""}
      <div style="font-family:${th.displayStack};font-weight:700;font-size:${r(head.size)}cqw;line-height:1.02;letter-spacing:-0.03em;color:${th.ink};">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
    </div>
    <div class="${id}-rule" style="position:absolute;left:${r(centred ? left + colW / 2 - U(300) : left)}cqw;top:${r(ruleY)}cqw;width:${r(U(560))}cqw;height:${r(U(6))}cqw;background:${th.accent};transform:scaleX(0);transform-origin:${centred ? "center" : "left"} center;"></div>
    ${body ? `<div class="${id}-body" style="position:absolute;left:${r(left)}cqw;top:${r(bodyY)}cqw;width:${r(colW)}cqw;${centred ? "text-align:center;" : ""}font-family:${th.displayStack};font-weight:400;font-size:${r(U(30))}cqw;line-height:1.45;color:${th.sub};opacity:0;">${esc(body)}</div>` : ""}
    ${rows}`,
    s: [
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(46))}cqw"},{opacity:1,y:0,duration:${du(0.75)},ease:"back.out(1.4)"},${at(0.25)});`,
      `tl.fromTo(".${id}-rule",{scaleX:0},{scaleX:1,duration:${du(0.6)},ease:"power3.inOut"},${at(0.9)});`,
      body ? `tl.fromTo(".${id}-body",{opacity:0,y:"${r(U(20))}cqw"},{opacity:1,y:0,duration:${du(0.5)},ease:"power3.out"},${at(1.1)});` : "",
      list.length ? `tl.fromTo(".${id}-row",{opacity:0,x:"${r(-U(30))}cqw"},{opacity:1,x:0,duration:${du(0.5)},ease:"power3.out",stagger:${du(0.2)}},${at(1.35)});` : "",
    ].filter(Boolean),
  };
}

// ---- style + document --------------------------------------------------------
function baseCss(th, stage, extra = "") {
  const { U, portrait } = stage;
  return `${th.fontFace}
  * { box-sizing:border-box; margin:0; padding:0; }
  html, body { width:100%; height:100%; overflow:hidden; background:${th.bg}; }
  #root { position:relative; overflow:hidden; isolation:isolate; background:${th.bg}; container-type:size; color:${th.ink}; font-family:${th.displayStack}; }
  .clip { position:absolute; top:0; left:0; width:100%; height:100%; overflow:hidden; }
  /* The perspective lives on the SCENE, not on the layer being rotated: a transform layer
     cannot supply its own vanishing point, so perspective-flip would otherwise flatten into a
     horizontal squash instead of reading as a card turning in space. */
  /* The base plate lives on .om-cam, NOT on the scene root. Two scenes coexist for the length of
     a cut, and the incoming clip's root turns opaque the instant its beat starts — an opaque root
     would slam a flat rectangle over the outgoing scene and eat the whole transition. On .om-cam
     the plate is carried BY the cut, so it moves, fades and clips with the scene it belongs to.
     #root paints th.bg underneath, so a transition that scales or slides .om-cam away still lands
     on the pack's own background rather than on white. */
  .om-scene { perspective:1400px; }
  .om-cam { position:absolute; inset:0; background:${th.bg}; will-change:transform, opacity, filter; transform-origin:center center; }
  /* Parallax pair. Both inset:0 and unpositioned-content-transparent: absolutely positioned
     children resolve against a box identical to .om-cam's, so every pack's existing geometry
     is byte-for-byte unchanged by the extra nesting. */
  .om-bg { position:absolute; inset:0; will-change:transform; transform-origin:center center; }
  .om-drift { position:absolute; inset:0; will-change:transform; transform-origin:center center; }
  /* Static on purpose — see open(). Absolutely positioned chrome keeps resolving against the
     clip root, so wrapping it changes opacity ownership and nothing else. */
  .om-hud { position:static; }
  .om-chrome { position:absolute; inset:0; pointer-events:none; z-index:40; }
  /* .kw / .kwi are the names caption_render.js's SHAPING_FIX targets — a non-Latin video-text
     language relies on the overflow being neutralised HERE. */
  .kw { display:block; overflow:hidden; }
  .kwi { display:block; will-change:transform; }
  /* ONE caption node for the whole film: seek-safe, and the single choke point multilang
     injection targets. Sits clear of the progress rule. */
  #caps { position:absolute; inset:0; display:flex; justify-content:center; align-items:flex-end; padding:0 ${r(U(160))}cqw ${r(portrait ? U(150) : U(96))}cqw; z-index:60; pointer-events:none; }
  #cap-pill { max-width:${r(U(1400))}cqw; height:fit-content; flex:0 0 auto; text-align:center; opacity:0; background:${rgba(th.capBg || "#FFFFFF", 0.88)}; border-radius:${r(U(12))}cqw; padding:${r(U(12))}cqw ${r(U(24))}cqw; }
  #cap-text { font-family:${th.displayStack}; font-weight:600; font-size:${r(U(30))}cqw; line-height:1.3; letter-spacing:-0.01em; color:${th.capInk || th.ink}; }
${extra}`;
}

// Assemble the document.
//
// It no longer merely CUTS. The reference's `transition="cut"` was faithfully ported and then
// became the family's biggest weakness: every scene arrived and left the same way, so a
// seven-beat film performed one move seven times. Scenes now OVERLAP by a clamped xfade on
// their (already unique) tracks, and transition_kit choreographs each cut. `overlayParts`
// carries the clips a transition draws for itself — a light bar, a seam, a particle burst.
function document_({ th, stage, css, bodyParts, overlayParts = [], sceneScripts, captionCues, D, dims, W, H, helpers = "" }) {
  const cues = (Array.isArray(captionCues) ? captionCues : [])
    .filter((c) => c && c.text != null)
    .map((c) => [r(c.start != null ? c.start : c.startSec || 0), r(c.end != null ? c.end : (c.start || 0) + 2), String(c.text)]);

  const caps = `<div id="caps" class="clip" data-start="0" data-duration="${D}" data-track-index="50"><div id="cap-pill"><div id="cap-text"></div></div></div>`;

  const script = `(function(){
  var D=${D};
  var tl=gsap.timeline({paused:true});
  var $=function(s){return document.querySelector(s);};
  function kill(id,t){tl.set(id,{opacity:0},t);}
  ${helpers}

  ${sceneScripts.join("\n  ")}

  var cues=${JSON.stringify(cues)};
  tl.to({},{duration:D,ease:"none",onUpdate:function(){
    var now=tl.time();
    var cap=$("#cap-pill"),txt=$("#cap-text");
    if(cap&&txt){var a=null;for(var k=0;k<cues.length;k++){if(now>=cues[k][0]&&now<cues[k][1]){a=cues[k];break;}}if(a){if(txt.textContent!==a[2])txt.textContent=a[2];cap.style.opacity="1";}else cap.style.opacity="0";}
  }},0);

  window.__timelines=window.__timelines||{};
  window.__timelines["vid"]=tl;
  if(typeof navigator==="undefined"||!navigator.webdriver){tl.play(0);tl.eventCallback("onComplete",function(){tl.restart();});}
})();`;

  const indexHtml = [
    `<!DOCTYPE html>`, `<html lang="en">`, `<head>`, `<meta charset="utf-8">`, `<title>vid</title>`,
    `<script src="${GSAP_CDN}"></script>`,
    `<style>`, css || baseCss(th, stage), `</style>`, `</head>`, `<body>`,
    `<div id="root" class="composition" data-composition-id="vid" data-width="${W}" data-height="${H}" data-start="0" data-duration="${D}" style="width:${W}px;height:${H}px;">`,
    bodyParts.join("\n"),
    overlayParts.join("\n"),
    caps,
    `</div>`,
    `<script>`, script, `</script>`,
    `</body>`, `</html>`,
  ].join("\n");

  const metaJson = JSON.stringify({ compositionId: "vid", width: W, height: H, fps: (dims && dims.fps) || 30, duration: D });
  return { indexHtml, metaJson };
}

// ---- the driver --------------------------------------------------------------
// Everything a port shares between "resolve the theme" and "return the document". A template
// calls this with its theme, spec and builders; the kit walks the scenes, assigns roles, fills
// slots, opens each shell, collects the timeline and assembles the file.
function buildFilm({
  storyboard, dims, captionCues, assets, brandSkin, localized, seedKey,
  stage, theme, STRINGS, spec, builders, css, refBeat = 4.4, camera = {}, labels = {},
  backdropFor = null, fallbackBrand = "FILM",
  // The pack's cut personality (transition_kit.SIGNATURES). A shared library must not make 14
  // templates cut alike, so each pack draws from its own pool first.
  signature = "cinematic",
  // Escape hatch for a pack with an edit of its own: false restores the legacy single camera.
  transitions = true,
} = {}) {
  const th = theme(brandSkin);
  const S = localized ? { ...STRINGS, ...localized } : STRINGS;
  const sb = storyboard || {};
  const W = (dims && dims.width) || stage.W, H = (dims && dims.height) || stage.H;
  const scenes = Array.isArray(sb.scenes) && sb.scenes.length
    ? sb.scenes.slice(0, 12)
    : [{ id: "s1", start: 0, duration: 5, kind: "hook", headline: String(sb.title || "").trim() }];
  const title = String(sb.title || "").trim();
  // After `scenes`, because the brand may have to be recovered from a scene's own address.
  const brand = resolveBrandName(title, scenes) || fallbackBrand;
  const D = r(sb.durationSec || scenes.reduce((a, x) => Math.max(a, (Number(x.start) || 0) + (Number(x.duration) || 0)), 0) || 12);
  const filmUrl = scenes.map((sc) => domainOf(sc.subtext) || domainOf(sc.emphasis)).find(Boolean)
    || domainOf(title) || `${String(brand).toLowerCase().replace(/[^a-z0-9]/g, "")}.com`;

  const logo = logoAssetOf(assets);
  const shots = (Array.isArray(assets) ? assets : []).filter(screenOk)
    .sort((a, b) => (Number(b.cdScore) || 0) - (Number(a.cdScore) || 0));

  const roles = assignRoles(scenes, shots.length, spec);
  const sceneShots = fillSlots(scenes, roles, shots, spec);

  const scriptStart = (i) => scenes.slice(0, i).reduce((a, x) => a + (Number(x.duration) || 0), 0);
  const bodyParts = [], overlayParts = [], sceneScripts = [];
  const seed = seedFrom(`${seedKey || ""}|${title || "om"}`);
  const cam = normalizeCamera(camera, stage);

  // PASS 1 — RESOLVE EVERY BEAT BEFORE DRAWING ANY OF THEM. The transition dealer needs the
  // whole sequence up front: "no repeat within three cuts" and "the cut means something about
  // the beat it lands on" are both properties of the EDIT, and neither can be honoured one
  // scene at a time. The role downgrade below used to happen mid-draw, which is exactly why
  // the sequence was never knowable in advance.
  const plan = scenes.map((scene, i) => {
    const T = r(scene.start != null ? scene.start : scriptStart(i));
    const L = r(scene.duration || 5);
    let role = roles[i] || "statement";
    // LAST GATE BEFORE DRAWING. Roles were assigned against a BUDGET; this is the beat's
    // ACTUAL hand. A layout that ended up short would draw hollow containers, so it degrades
    // to `statement` — the one layout that is complete without a picture.
    const need = spec.needs ? spec.needs(role) : 0;
    if (need > 0 && sceneShots[i].length < need) role = "statement";
    return { scene, i, T, L, role };
  });

  const useTx = transitions !== false && plan.length > 1;
  const cuts = useTx
    ? dealTransitions({
        classes: plan.map((p) => classifyBeat({
          role: p.role, scene: p.scene, shotCount: sceneShots[p.i].length,
          i: p.i, total: plan.length, numbers: numbersIn(p.scene, 3).length,
        })),
        seed, signature,
      })
    : [];
  // xf[i] is the overlap of the cut OUT of scene i — which is the same window as the cut INTO
  // scene i+1. Clamped against the SHORTER neighbour so a long move never outlives a short beat.
  const xf = plan.map((p, i) => (useTx && i < plan.length - 1 ? xfadeFor(p.L, plan[i + 1].L) : 0));
  const acc = accentsFrom(th);
  const rnd = mulberry(seed ^ 0x9E3779B9);

  plan.forEach((p, i) => {
    const { scene, T, L, role } = p;
    const isLast = i === plan.length - 1;
    // The clip lives its own xfade PAST its end, so the outgoing scene is still alive while
    // the incoming one arrives — the window a transition needs. Unique tracks keep the overlap
    // legal (`overlapping_clips_same_track` keys by track, not by time).
    const clipDur = isLast ? Math.max(0.1, D - T) : Math.min(Math.max(0.1, D - T), L + xf[i]);
    const k = Math.min(1, L / refBeat);
    const ctx = {
      id: `s${i + 1}`, T, L, clipDur, i, isLast, track: 2 + i,
      th, S, W, H, k, seed, U: stage.U, VH: stage.VH, portrait: stage.portrait,
      at: (sec) => r(T + sec * k),
      du: (sec) => r(Math.max(0.06, sec * k)),
      title, brand: String(brand).slice(0, 22), label: labels[role] || "",
      total: plan.length, url: filmUrl, role,
    };
    const build = builders[role]
      || (role === "statement-c" ? (sc, c) => statement(sc, c, { centred: true }) : null)
      || ((sc, c) => statement(sc, c));
    // The LOGO also rides a 4th argument, always. Passing it only in slot 3 of the last role
    // meant any other beat that wants a mark — an opening logo lockup, a reveal plate — could
    // never receive one, and silently fell back to a brand initial.
    const built = build(scene, ctx, role === spec.last ? logo : sceneShots[i], logo);
    const backdrop = built.backdrop != null ? built.backdrop : (backdropFor ? backdropFor(ctx) : "");
    bodyParts.push(built.wrapped ? built.html : open(ctx, built.html, { backdrop, chrome: built.chrome }));

    const xIn = i > 0 ? xf[i - 1] : 0;
    const motion = [];
    if (built.noCamera) {
      // The pack drives its own camera — leave every layer alone.
    } else if (!useTx) {
      motion.push(...cameraTweens(ctx, cam));
    } else {
      // AMBIENT on the inner layers, CUTS on .om-cam. Alternating the drift direction per beat
      // stops a long film from feeling like one continuous slow zoom.
      motion.push(...driftTweens(ctx, { scale: cam.scale, dir: i % 2 ? -1 : 1 }));
      if (i === 0) {
        // No cut lands on the first beat, so it needs an opening of its own — otherwise the
        // film starts on a hard appear while every later beat gets a designed arrival.
        motion.push(`tl.fromTo("#${ctx.id} .om-cam",{opacity:0,scale:1.055,filter:"blur(9px)"},{opacity:1,scale:1,filter:"blur(0px)",duration:${r(Math.min(0.9, L * 0.35))},ease:"expo.out"},${r(T)});`);
      }
      // Same seek-safety kill the legacy camera carried: the root going hidden is not enough,
      // because a non-linear seek landing past the exit would restore stale visibility here.
      motion.push(`tl.set("#${ctx.id} .om-cam",{opacity:0},${r(T + clipDur)});`);
      // THE FURNITURE MUST NOT GHOST. Two scenes coexist during a cut, and their HUDs are not
      // identical — the progress rule is at a different fill and the scene counter reads a
      // different number. Cross-fading the wrapper is what keeps an overlap from showing two
      // brand badges and two progress bars at once.
      if (xIn > 0) motion.push(`tl.fromTo("#${ctx.id} .om-hud",{opacity:0},{opacity:1,duration:${r(xIn * 0.9)},ease:"power2.out"},${r(T)});`);
      if (!isLast && xf[i] > 0) motion.push(`tl.to("#${ctx.id} .om-hud",{opacity:0,duration:${r(xf[i] * 0.75)},ease:"power2.in"},${r(T + L)});`);
    }

    sceneScripts.push([
      `tl.set("#${ctx.id}",{opacity:1},${r(T)});`,
      ...built.s,
      ...motion,
      ...chromeTweens(ctx, D),
      built.capTint ? `tl.set("#cap-text",{color:"${built.capTint}"},${r(T)});` : "",
    ].filter(Boolean).join("\n  "));

    // The cut OUT of this beat, choreographed by transition_kit. Overlay tracks sit above the
    // scenes (2+i) and below the caption node (50), so a light bar sweeps the picture without
    // ever crossing the subtitle.
    if (useTx && !isLast && cuts[i]) {
      const piece = cuts[i].build({
        o: `#${ctx.id} .om-cam`, n: `#s${i + 2} .om-cam`,
        t: plan[i + 1].T, x: xf[i], id: `tx${i + 1}`, track: 20 + i, acc, th, rnd,
      });
      if (piece.html) overlayParts.push(piece.html);
      sceneScripts.push(piece.js.filter(Boolean).join("\n  "));
    }
    sceneScripts.push(`kill("#${ctx.id}",${r(T + clipDur)});`);
  });

  const out = document_({
    th, stage, css: css ? css(th, stage) : baseCss(th, stage),
    bodyParts, overlayParts, sceneScripts, captionCues, D, dims, W, H,
    helpers: useTx ? RUNTIME_HELPERS : "",
  });
  return { ...out, resolvedBrand: th.resolvedBrand };
}

module.exports = {
  stageOf, rgba, mixHex, spin, rgbHex, hexToRgb, relLum, rgbToHsl, hslToHex,
  ensureContrast, inkOn, resolveAccent, fontStacks, clamp01, lerp,
  wordsOf, clampWords, fitLines, fitOne, ADVANCE, domainOf, numbersIn, statLabel, bullets,
  ratioOf, screenOk, isOwnAsset, shotFill, logoAssetOf,
  assignRoles, fillSlots, reps, seedFrom, pad2,
  open, chromeHtml, chromeTweens, cameraTweens, driftTweens, normalizeCamera, camSafe, statement,
  baseCss, document_, buildFilm, esc, r,
  // The shared decorative vocabulary (om_furniture.js), re-exported so a pack reaches it as
  // K.figPlate / K.marquee / K.clipHead with no second require. That module must NOT require
  // this one back — the cycle would resolve to a half-built export object at load time, which
  // is also why it keeps its own one-line copy of `reps`.
  ...require("./om_furniture"),
};
