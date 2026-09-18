// ASSET FIT — the one place that decides how an image meets its placeholder.
//
// THE DEFECT THIS REPLACES. Every composer in this repo wrote the same literal into
// every image it drew:
//
//     style="width:100%;height:100%;object-fit:cover;object-position:top center;"
//
// Forty-odd call sites, one string, no variation — verified on a shipped film
// (server/jobs/pkffl0i9dz/index.html: 11 <img> elements, 11 identical fit declarations).
// `cover` fills the box and throws away whatever overflows, and `top center` decides what
// survives without ever looking at the image OR at the box. Measured on that film: the
// hero plate is 833x768 CSS px (aspect 1.08) and the website captures are 2732x1800
// (aspect 1.518), so 28.5% of every screenshot's WIDTH was discarded — 14% off each side,
// which is why the site's navigation is cut mid-word on both edges of every frame.
//
// The deeper reason it went unnoticed: A PLACEHOLDER'S ASPECT RATIO IS NOWHERE IN THIS
// CODEBASE. Composers size media boxes by mixing units — `width:45cqw` (a percentage of
// the container's WIDTH) with `top:13%;bottom:13%` (percentages of its HEIGHT) — so the
// box's SHAPE is an emergent property of the render dimensions that no function computes
// and no selector can read. `template_media.js` supplies that missing number; this module
// is what consumes it.
//
// WHAT THIS DOES. Given an asset (with real pixel dimensions) and a slot spec (with real
// pixel dimensions), it returns the complete fit decision — mode, object-fit,
// object-position, the box to actually draw, and an honest account of what is lost:
//
//     1. RESHAPE THE BOX when the slot says it may flex. A crop you never take is better
//        than the cleverest crop you do. A 1.518 capture in a slot free to sit anywhere in
//        [1.2, 1.7] simply becomes a 1.518 box, and the loss is zero.
//     2. COVER WITH A CONTENT-AWARE FOCAL POINT when the residual crop is inside what the
//        content class tolerates. The focal point comes from crop_engine.js — a real
//        saliency analysis that has been in this repo, fully working, called from exactly
//        ONE site (film_stage.js:657) and dead everywhere else.
//     3. CONTAIN when the class must not be cut at all. A logo is never cropped. A user
//        interface loses its meaning at the edges — the nav, the primary button and the
//        price all live there — so a website capture letterboxes rather than lies.
//     4. COVER AND SAY SO when nothing better exists. A photograph with a hopeless aspect
//        mismatch is still better cropped than letterboxed into a sliver; the result is
//        marked `compromised` so the selector learns not to choose it again and the QA
//        gate can count it.
//
// It NEVER returns `object-fit: fill`. Nothing in a KEYFRAME film is ever stretched.
//
// FAIL-OPEN (THE HOUSE LAW). Every path is wrapped and every unknown degrades to the
// behaviour that shipped before this module existed. A fit decision must never cost a
// film its render.

const CLASS = {
  LOGO: "logo",        // a brand mark — never cropped, never upscaled past its own size
  VECTOR: "vector",    // flat art — never cropped; scales losslessly
  UI: "ui",            // a website / app / product capture — meaning lives at the edges
  PHOTO: "photo",      // a photograph — edges are usually expendable
};

// The fraction of a source axis that may be discarded before `cover` stops being the
// right answer for that content class.
//
// UI is 0.10 because a page capture's load-bearing pixels sit at its margins: the
// navigation across the top, the primary button at the right, the price at the end of the
// row. Ten percent off an axis still shows a whole component; twenty cuts a word in half,
// which is exactly the failure in the shipped film this module was written for.
//
// PHOTO is 0.34 because a photograph is a field, not a document — a third off one axis is
// the ordinary language of cropping, and the focal-point search below spends that third
// where the subject is not.
const CROP_TOLERANCE = {
  [CLASS.LOGO]: 0,
  [CLASS.VECTOR]: 0,
  [CLASS.UI]: 0.10,
  [CLASS.PHOTO]: 0.34,
};

// Beyond this, `contain` stops being a fit and becomes a stamp in the middle of an empty
// box. A slot padded more than this on an axis is better filled by a different asset —
// the selector's job — and `cover` is the lesser evil until one arrives.
const MAX_PAD = 0.42;

// An asset scaled past this is being asked to be bigger than it is. 1.25 is the point at
// which a bilinear upscale starts to read as soft on a 1080p frame.
const UPSCALE_LIMIT = 1.25;

// Aspect distance, measured as |log(a/b)|, so 2:1-vs-1:1 and 1:1-vs-1:2 are the same
// distance apart. 0 = identical shape. 0.12 ~ a 13% difference; 0.41 ~ 3:2 vs 1:1.
const aspectDistance = (a, b) => (a > 0 && b > 0 ? Math.abs(Math.log(a / b)) : Infinity);

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const pct1 = (v) => Math.round(v * 1000) / 10;

/** The asset's real aspect ratio, from whatever metadata it carries. */
function assetAspect(asset) {
  if (!asset) return 0;
  const r = num(asset.ratio, 0);
  if (r > 0) return r;
  const w = num(asset.width, 0), h = num(asset.height, 0);
  return w > 0 && h > 0 ? w / h : 0;
}

/**
 * What KIND of picture is this — which decides how much of it may be thrown away.
 *
 * Deliberately generous about what counts as UI: the cost of treating a photograph as an
 * interface is a little letterboxing, and the cost of treating an interface as a
 * photograph is the unreadable frame this module exists to prevent.
 */
function classify(asset) {
  if (!asset) return CLASS.PHOTO;
  const p = String(asset.path || asset.src || "").toLowerCase();
  const kind = String(asset.kind || "").toLowerCase();
  const source = String(asset.source || "").toLowerCase();
  const alt = String(asset.alt || asset.sees || "").toLowerCase();

  if (kind === "logo" || asset.isLogo || /(^|\/)logo[._-]|brand_/.test(p)) return CLASS.LOGO;
  if (/\.svg($|\?)/.test(p) || kind === "vector" || source === "iconify") return CLASS.VECTOR;
  if (asset.fitContain) return CLASS.VECTOR;          // the mark contract already set upstream
  if (kind === "screenshot" || source === "website" || /^(page_|site_|shot_|screenshot)/.test(p.split("/").pop() || "")) return CLASS.UI;
  if (/\b(screenshot|dashboard|interface|app screen|web page|webpage|ui\b)/.test(alt)) return CLASS.UI;
  return CLASS.PHOTO;
}

/**
 * Normalise a slot spec. Everything is optional; a bare `{ w, h }` is a valid slot and a
 * bare `{}` degrades to "no opinion", which is what every call site had before.
 *
 * @typedef {object} SlotSpec
 * @property {string}  [id]         slot identity, for reports
 * @property {string}  [want]       "desktop" | "phone" | "photo" | "logo" | "vector"
 * @property {number}  w            the box's width in px at the film's dimensions
 * @property {number}  h            the box's height in px
 * @property {[number,number]} [flex]  permitted aspect band if the box may reshape
 * @property {string}  [fit]        "auto" (default) | "cover" | "contain" — a hard override
 * @property {string}  [importance] "hero" | "support" | "accent"
 * @property {string[]} [allow]     content classes this slot accepts
 */
function normalizeSlot(slot) {
  const s = slot || {};
  const w = num(s.w ?? s.width, 0);
  const h = num(s.h ?? s.height, 0);
  const flex = Array.isArray(s.flex) && s.flex.length === 2
    ? [Math.min(num(s.flex[0], 0), num(s.flex[1], 0)), Math.max(num(s.flex[0], 0), num(s.flex[1], 0))]
    : null;
  return {
    id: s.id || null,
    want: s.want || null,
    w, h,
    aspect: w > 0 && h > 0 ? w / h : num(s.aspect, 0),
    flex: flex && flex[0] > 0 ? flex : null,
    fit: s.fit || "auto",
    importance: s.importance || "support",
    allow: Array.isArray(s.allow) ? s.allow : null,
  };
}

/** What `cover` costs on this pairing: the fraction of each source axis discarded. */
function coverLoss(srcAspect, boxAspect) {
  if (!(srcAspect > 0 && boxAspect > 0)) return { x: 0, y: 0 };
  return srcAspect > boxAspect
    ? { x: 1 - boxAspect / srcAspect, y: 0 }   // source is wider: width is cut
    : { x: 0, y: 1 - srcAspect / boxAspect };  // source is taller: height is cut
}

/** What `contain` costs: the fraction of each box axis left empty. */
function containPad(srcAspect, boxAspect) {
  if (!(srcAspect > 0 && boxAspect > 0)) return { x: 0, y: 0 };
  return srcAspect > boxAspect
    ? { x: 0, y: 1 - boxAspect / srcAspect }
    : { x: 1 - srcAspect / boxAspect, y: 0 };
}

/**
 * The box this asset should actually be drawn in.
 *
 * A slot that declares `flex` is saying its design tolerates a range of shapes — the plate
 * can be shorter, the card can be taller — and within that range the honest move is to
 * take the shape the picture already has. The box never grows past the slot's declared
 * w x h; it only ever gives width or height back to the layout.
 */
function resolveBox(slot, asset) {
  const s = normalizeSlot(slot);
  const a = assetAspect(asset);
  if (!s.flex || !(a > 0) || !(s.w > 0 && s.h > 0)) return { w: s.w, h: s.h, aspect: s.aspect, reshaped: false };
  const target = clamp(a, s.flex[0], s.flex[1]);
  if (aspectDistance(target, s.aspect) < 0.01) return { w: s.w, h: s.h, aspect: s.aspect, reshaped: false };
  // Shrink to the target shape inside the declared box — never overflow it.
  let w = s.w, h = s.w / target;
  if (h > s.h) { h = s.h; w = s.h * target; }
  return { w: Math.round(w), h: Math.round(h), aspect: target, reshaped: true };
}

/** The content-aware focal point, or the honest default when the engine has not run. */
function focalFor(asset, boxW, boxH, fallback) {
  try {
    const { focusFor } = require("./crop_engine");
    const f = focusFor(asset, boxW, boxH, fallback || null);
    if (f) return f;
  } catch { /* crop_engine is an enhancement, never a dependency */ }
  // Without an analysis, a UI capture still wants its top: a page's header is above the
  // fold by definition. Everything else stays centred on its subject.
  return fallback || (classify(asset) === CLASS.UI ? "top center" : "center center");
}

/**
 * THE DECISION. Everything above, applied in order.
 *
 * @param {object} asset  the asset wire object (needs width/height or ratio to do its best)
 * @param {SlotSpec} slot the placeholder's declaration
 * @returns {{
 *   mode: string, objectFit: string, objectPosition: string, css: string,
 *   box: {w:number,h:number,aspect:number,reshaped:boolean},
 *   cropXpct: number, cropYpct: number, padXpct: number, padYpct: number,
 *   upscale: number, compromised: boolean, contentClass: string, reason: string
 * }}
 */
function fitFor(asset, slot) {
  const s = normalizeSlot(slot);
  const cls = classify(asset);
  const srcA = assetAspect(asset);
  const box = resolveBox(s, asset);
  const boxA = box.aspect || s.aspect;

  const out = {
    mode: "cover", objectFit: "cover", objectPosition: "center center", css: "",
    box, cropXpct: 0, cropYpct: 0, padXpct: 0, padYpct: 0,
    upscale: 0, compromised: false, contentClass: cls, reason: "",
  };

  // A MARK IS NEVER CROPPED, AND THAT DOES NOT DEPEND ON KNOWING ITS SIZE. This test has
  // to come before the measurability guard below: an SVG has no raster dimensions for
  // ffprobe to read, so a logo or a vector would otherwise fall straight through to the
  // generic cover — and half a logo is not a crop, it is the wrong logo.
  if (cls === CLASS.LOGO || cls === CLASS.VECTOR) {
    out.mode = "contain"; out.objectFit = "contain"; out.objectPosition = "center center";
    if (srcA > 0 && boxA > 0) { const p0 = containPad(srcA, boxA); out.padXpct = pct1(p0.x); out.padYpct = pct1(p0.y); }
    out.reason = `${cls} is never cropped`;
    out.css = "object-fit:contain;object-position:center center;";
    return out;
  }

  // Nothing measurable — keep the behaviour that shipped, plus a real focal point.
  if (!(srcA > 0) || !(boxA > 0)) {
    out.objectPosition = focalFor(asset, box.w, box.h, null);
    out.reason = "no source dimensions — cover with the best focal point available";
    out.css = `object-fit:cover;object-position:${out.objectPosition};`;
    return out;
  }

  const srcW = num(asset.width, 0), srcH = num(asset.height, 0);
  if (srcW > 0 && srcH > 0 && box.w > 0 && box.h > 0) {
    out.upscale = Math.round(Math.max(box.w / srcW, box.h / srcH) * 100) / 100;
  }

  const loss = coverLoss(srcA, boxA);
  const pad = containPad(srcA, boxA);
  const tol = CROP_TOLERANCE[cls] ?? CROP_TOLERANCE[CLASS.PHOTO];
  const worstLoss = Math.max(loss.x, loss.y);

  const useContain = () => {
    out.mode = "contain"; out.objectFit = "contain";
    out.objectPosition = "center center";
    out.padXpct = pct1(pad.x); out.padYpct = pct1(pad.y);
    out.css = `object-fit:contain;object-position:center center;`;
    return out;
  };
  const useCover = (why) => {
    out.mode = box.reshaped ? "reshaped-cover" : "cover";
    out.objectFit = "cover";
    out.objectPosition = focalFor(asset, box.w, box.h, null);
    out.cropXpct = pct1(loss.x); out.cropYpct = pct1(loss.y);
    out.reason = why;
    out.css = `object-fit:cover;object-position:${out.objectPosition};`;
    return out;
  };

  // ---- hard overrides from the slot itself -----------------------------------------
  if (s.fit === "contain") { out.reason = "slot declares contain"; return useContain(); }
  if (s.fit === "cover") return useCover("slot declares cover");

  // ---- 1. a mark is never cut — handled above, before the measurability guard ------

  // ---- 2. the box took the picture's own shape -------------------------------------
  if (box.reshaped && worstLoss <= 0.02) {
    return useCover(`slot reshaped to ${Math.round(boxA * 100) / 100} — the asset fits as it is`);
  }

  // ---- 3. the crop is inside what this content tolerates ----------------------------
  if (worstLoss <= tol) {
    return useCover(`crop ${pct1(worstLoss)}% is within the ${cls} tolerance of ${pct1(tol)}%`);
  }

  // ---- 4. an interface stays readable, even letterboxed -----------------------------
  if (cls === CLASS.UI && Math.max(pad.x, pad.y) <= MAX_PAD) {
    out.reason = `a ${pct1(worstLoss)}% crop would cut the interface — contained instead`;
    return useContain();
  }

  // ---- 5. nothing better exists. Crop, and say so. ----------------------------------
  out.compromised = true;
  return useCover(`no good fit: ${pct1(worstLoss)}% crop exceeds the ${cls} tolerance and `
    + `containing would leave ${pct1(Math.max(pad.x, pad.y))}% of the box empty`);
}

/**
 * The inline CSS for an <img> that fills its slot. This is the string that replaces every
 * hardcoded `object-fit:cover;object-position:top center;` in the composers.
 *
 * Takes the fit decision already attached to the asset by the planner (`asset.__fit`) so
 * the render draws exactly what the plan chose; computes it on the spot when a caller has
 * a slot but no plan; and degrades to the historical literal when it has neither, so no
 * call site can be made worse by adopting it.
 */
function fitCss(asset, slot = null) {
  try {
    if (asset && asset.__fit && asset.__fit.css) return asset.__fit.css;
    if (slot) return fitFor(asset, slot).css;
    if (asset) {
      const cls = classify(asset);
      if (cls === CLASS.LOGO || cls === CLASS.VECTOR) return "object-fit:contain;object-position:center center;";
      return `object-fit:cover;object-position:${focalFor(asset, 0, 0, null)};`;
    }
  } catch { /* fall through to the historical default */ }
  return "object-fit:cover;object-position:top center;";
}

/**
 * GEOMETRIC COMPATIBILITY, 0..1 — how well this asset suits this slot's SHAPE and SIZE,
 * with no regard to what it depicts. The selector multiplies this into its semantic score
 * so a picture must be both about the right thing and the right shape.
 *
 * The shape term is the aspect distance passed through a soft exponential rather than a
 * threshold, so a slightly-wrong shape is slightly worse rather than suddenly unusable —
 * a hard cutoff would leave slots empty on films whose asset pool is genuinely narrow.
 */
function fitScore(asset, slot) {
  try {
    const s = normalizeSlot(slot);
    const cls = classify(asset);
    if (s.allow && !s.allow.includes(cls)) return 0;

    const srcA = assetAspect(asset);
    if (!(srcA > 0) || !(s.aspect > 0)) return 0.5;      // unknown: neither reward nor punish

    // A flexible slot is scored against the nearest shape it may take, not its nominal one.
    const target = s.flex ? clamp(srcA, s.flex[0], s.flex[1]) : s.aspect;
    const d = aspectDistance(srcA, target);
    // exp(-d/0.28): identical = 1.00, 3:2-vs-4:3 (d=.12) = 0.65, 3:2-vs-1:1 (d=.41) = 0.23.
    const shape = Math.exp(-d / 0.28);

    // How much of the picture survives, weighted by how much this class can spare.
    const loss = coverLoss(srcA, target);
    const tol = CROP_TOLERANCE[cls] ?? CROP_TOLERANCE[CLASS.PHOTO];
    const survival = tol > 0 ? clamp(1 - Math.max(loss.x, loss.y) / (tol * 2.2), 0, 1) : 1;

    // Resolution, in BOTH directions. An asset asked to scale past UPSCALE_LIMIT is soft on
    // screen — and one scaled far DOWN is a different failure with the same cause: a
    // 2732px-wide page capture crushed into a 397px gallery tile is present, sharp and
    // completely unreadable. Scoring a 4x downscale as perfect made exactly that the
    // top-ranked candidate for a small tile. Only an INTERFACE is penalised for it: a
    // photograph loses nothing by being shown small, while a screenshot IS its text.
    const srcW = num(asset.width, 0), srcH = num(asset.height, 0);
    let res = 0.75;
    if (srcW > 0 && srcH > 0 && s.w > 0 && s.h > 0) {
      const up = Math.max(s.w / srcW, s.h / srcH);
      res = up <= 1 ? 1 : clamp(1 - (up - 1) / (UPSCALE_LIMIT * 2), 0, 1);
      if (cls === CLASS.UI) {
        // Below ~2.2x the shrink is ordinary; past 4x a page's body text is sub-pixel.
        const down = Math.max(srcW / Math.max(s.w, 1), srcH / Math.max(s.h, 1));
        if (down > 2.2) res = Math.min(res, clamp(1 - (down - 2.2) / 3.4, 0.12, 1));
      }
    }

    // A device slot draws browser or phone chrome around whatever lands in it, so what
    // lands there must actually BE a product screen — a stock photo framed as the product
    // is a lie the layout tells for the whole beat.
    let intent = 1;
    if (s.want === "desktop") intent = cls === CLASS.UI ? 1 : 0.45;
    else if (s.want === "phone") intent = cls === CLASS.UI && srcA < 0.9 ? 1 : cls === CLASS.UI ? 0.6 : 0.35;
    else if (s.want === "logo") intent = cls === CLASS.LOGO ? 1 : 0.3;
    // A plain `photo` tile is a gallery cell, not a device mount: it draws no browser
    // chrome, so a page capture in it reads as a picture OF a webpage rather than as the
    // product's screen — and in a small tile it reads as nothing at all. A screenshot is
    // still allowed there (often it is all a film has), just no longer preferred over an
    // actual photograph. Without this a `photo` slot declares allow:null and had no intent
    // term whatsoever, so a 2732px capture was maximally admissible in a 397px tile.
    else if (s.want === "photo") intent = cls === CLASS.UI ? 0.7 : 1;

    return clamp(0.42 * shape + 0.26 * survival + 0.18 * res + 0.14 * intent, 0, 1);
  } catch {
    return 0.5;
  }
}

/**
 * Attach the fit decision to a COPY of the asset, so the same picture in two different
 * slots gets two different crops. Composers read `asset.__fit`; nothing else changes.
 */
function withFit(asset, slot) {
  if (!asset) return asset;
  try { return { ...asset, __fit: fitFor(asset, slot) }; }
  catch { return asset; }
}

// ---------------------------------------------------------------- render-time fitting
//
// THE BOX IS ONLY TRULY KNOWN IN THE BROWSER. Everything above decides the fit from the
// geometry a template DECLARES, which is the number selection needs and the number that
// did not exist before. But a declaration can be absent (197 of the 311 packs render a
// bundled template this repo does not author), stale, or overridden at runtime by a
// camera transform. The one place the box is not a guess is the live layout.
//
// So the same policy runs twice, from one definition: in Node to CHOOSE the asset and set
// the initial CSS, and in the page to FIT it against the box that was actually painted.
// The render-time pass always wins, because it is always measuring rather than modelling.
//
// The table below is the only thing Node has to send: per image file, its content class,
// its real pixel size, and the focal points crop_engine computed for it per aspect ratio.
// Keyed by basename because that is what survives every path rewrite between the job
// directory, the bundled template's own asset resolution, and a shadow root.

/** The per-file record the in-page fitter needs. Small: ~120 bytes per asset. */
function fitTable(assets) {
  const t = {};
  for (const a of (Array.isArray(assets) ? assets : [])) {
    if (!a || !a.path) continue;
    const key = String(a.path).split(/[\\/]/).pop();
    if (!key) continue;
    t[key] = {
      c: classify(a),
      w: num(a.width, 0), h: num(a.height, 0),
      f: (a.cropFocusByAspect && typeof a.cropFocusByAspect === "object") ? a.cropFocusByAspect : null,
      d: a.cropFocus || null,
    };
  }
  return t;
}

/**
 * A self-contained IIFE that fits every image on the page to the box it is actually
 * drawn in. Walks shadow roots (the bundled templates render inside them, and a document
 * stylesheet does not cross that boundary). Idempotent and cheap: it records the last
 * declaration it wrote per element and does nothing when the answer has not changed, so
 * it is safe to call on every seek and on every animation frame.
 *
 * Exposes `window.__kfFit(root)` so a composer's own seek handler can call it directly.
 *
 * @param {object[]} assets  the film's asset wire
 * @param {object} [opts]    { auto: boolean } — also run it on a rAF loop (default true)
 */
function runtimeFitScript(assets, { auto = true } = {}) {
  const table = fitTable(assets);
  if (!Object.keys(table).length) return "";
  return `<script>/* KEYFRAME asset_fit — render-time fitting (services/asset_fit.js) */
(function(){
  var T=${JSON.stringify(table)};
  var TOL={ui:${CROP_TOLERANCE[CLASS.UI]},photo:${CROP_TOLERANCE[CLASS.PHOTO]},logo:0,vector:0};
  var MAXPAD=${MAX_PAD};
  function rec(img){
    var s=img.getAttribute("src")||img.src||"";
    if(!s) return null;
    var b=s.split("?")[0].split("#")[0].split(/[\\\\/]/).pop();
    if(T[b]) return T[b];
    for(var k in T){ if(s.indexOf(k)>=0) return T[k]; }
    return null;
  }
  function focal(r,a){
    if(!r.f) return r.d||null;
    var best=null,bd=1e9;
    for(var k in r.f){ var d=Math.abs(parseFloat(k)-a); if(d<bd){bd=d;best=r.f[k];} }
    return best||r.d||null;
  }
  function apply(img,fit,pos,pad){
    var sig=fit+"|"+pos+"|"+(pad||"");
    if(img.__kfSig===sig) return;
    img.__kfSig=sig;
    img.style.setProperty("object-fit",fit,"important");
    img.style.setProperty("object-position",pos,"important");
    if(pad){ img.style.setProperty("padding",pad,"important"); img.style.setProperty("box-sizing","border-box","important"); }
    else if(img.style.getPropertyValue("padding")==="6%"){ img.style.removeProperty("padding"); }
  }
  function one(img){
    var r=rec(img); if(!r) return;
    var bw=img.clientWidth||img.getBoundingClientRect().width;
    var bh=img.clientHeight||img.getBoundingClientRect().height;
    if(!(bw>2&&bh>2)) return;
    // A mark is never cropped — half a logo is not a crop, it is the wrong logo. Decided
    // before dimensions, because an SVG may report none.
    if(r.c==="logo"||r.c==="vector"){ apply(img,"contain","center","6%"); return; }
    var sw=r.w||img.naturalWidth, sh=r.h||img.naturalHeight;
    if(!(sw>0&&sh>0)) return;
    var bA=bw/bh, sA=sw/sh;
    // 'miss' is one number for both readings of the same mismatch: the fraction of the
    // SOURCE that cover throws away, which is exactly the fraction of the BOX that
    // contain leaves empty. Cropping and letterboxing cost the same amount; the only
    // question is which of the two this kind of picture can afford.
    var miss = sA>bA ? (1-bA/sA) : (1-sA/bA);
    var tol = TOL[r.c]!=null ? TOL[r.c] : TOL.photo;
    if(miss<=tol){ apply(img,"cover",focal(r,bA)||"center center",null); return; }
    // An interface stays readable even letterboxed: its nav, its primary button and its
    // price all live at the edges that cover would cut.
    if(r.c==="ui" && miss<=MAXPAD){ apply(img,"contain","center",null); return; }
    apply(img,"cover",focal(r,bA)||"center center",null);
  }
  function walk(root){
    try{
      var d=root||document;
      var imgs=d.querySelectorAll("img");
      for(var i=0;i<imgs.length;i++) one(imgs[i]);
      var all=d.querySelectorAll("*");
      for(var j=0;j<all.length;j++) if(all[j].shadowRoot) walk(all[j].shadowRoot);
    }catch(e){}
  }
  window.__kfFit=walk;
  walk();
  if(document.readyState!=="complete") window.addEventListener("load",function(){walk();});
  ${auto ? `var n=0;(function loop(){ walk(); if(++n<100000) requestAnimationFrame(loop); })();` : ""}
})();
</script>`;
}

module.exports = {
  CLASS, CROP_TOLERANCE, UPSCALE_LIMIT, MAX_PAD,
  classify, assetAspect, aspectDistance, coverLoss, containPad,
  normalizeSlot, resolveBox, focalFor,
  fitFor, fitCss, fitScore, withFit,
  fitTable, runtimeFitScript,
};
