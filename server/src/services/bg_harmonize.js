// Deterministic BACKGROUND HARMONIZER.
//
// The QA agent kept flagging (but never fixing) a specific defect: a full-bleed
// background PHOTO shown in its raw native colors, clashing with the pack's design
// (e.g. a bright brown-paper-bag photo on a dark blue/black ground). The
// deterministic scene-kit path always lays a ground-colored scrim under such a
// photo (scrimBg) — but the LLM composer path can place a raw `<img … object-fit:
// cover>` background with NO scrim, so the photo's raw hues fight the palette and
// QA blocks the film. Nothing repaired it: only CONTRAST blockers auto-fix; a
// background clash shipped flagged (scene-kit) or got a coin-flip LLM re-roll.
//
// This closes that gap deterministically: it finds every UNSCRIMMED full-bleed
// background photo and drops a ground-colored veil over it, so the image reads as
// part of the design instead of a raw clash — the same treatment scene-kit already
// applies, now guaranteed on every path. It runs as a pure HTML string transform
// (cheap, no re-render) inside contrastFixPass, so it happens BEFORE QA — the
// blocker is prevented, not just flagged.
//
// SAFE BY CONSTRUCTION — it only touches an <img> that is BOTH:
//   • full-bleed (inset:0 or absolute+100%×100%) with object-fit:cover  → a background, and
//   • a raster PHOTO (.jpg/.png/.webp — NOT an .svg vector), and
//   • NOT already followed by an inset:0 scrim/veil div (idempotent).
// Framed hero plates (product screenshots in a rounded/shadowed browser frame) are
// NOT full-bleed inset:0 cover images, so they're never veiled — the reveal stays
// crisp. Re-running is a no-op (the injected veil counts as "already scrimmed").

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return [11, 15, 24];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lum(hex) { const [r, g, b] = hexToRgb(hex); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }

// Build the ground veil. Dark grounds get a top-to-bottom darkening in the ground
// hue (keeps the photo as texture but firmly grounded); light grounds get a
// lighter wash. Opacity is meaningful (0.5→0.9) so a hard-clashing photo can't
// shout through — matching scene-kit's scrimBg intent.
function groundVeil(ground, strong) {
  const [r, g, b] = hexToRgb(ground);
  const a = (o) => `rgba(${r},${g},${b},${o})`;
  // `strong` veil is used by the ESCALATED (post-QA) pass — QA still saw a clash
  // through the normal veil, so pull the photo harder toward the ground.
  return strong
    ? `linear-gradient(180deg, ${a(0.66)} 0%, ${a(0.84)} 55%, ${a(0.97)} 100%)`
    : `linear-gradient(180deg, ${a(0.5)} 0%, ${a(0.72)} 55%, ${a(0.9)} 100%)`;
}

// A background <img> is full-bleed if it covers the frame.
function isFullBleedCover(style) {
  if (!/object-fit\s*:\s*cover/i.test(style)) return false;
  if (/inset\s*:\s*0/i.test(style)) return true;
  return /position\s*:\s*absolute/i.test(style) && /width\s*:\s*100%/i.test(style) && /height\s*:\s*100%/i.test(style);
}
// A CSS-background div is full-bleed if it fills the frame (no object-fit — it's a
// background-image/shorthand, not an <img>).
function isFullBleedBg(style) {
  if (/inset\s*:\s*0/i.test(style)) return true;
  return /position\s*:\s*(?:absolute|fixed)/i.test(style) && /width\s*:\s*100%/i.test(style) && /height\s*:\s*100%/i.test(style);
}
// Only raster photos clash; svg/vector line art is theme-neutral (and scene-kit
// tints vectors elsewhere), so leave it alone.
function isRasterPhoto(src) {
  const s = String(src || "");
  if (/\.svg(\?|#|$)/i.test(s)) return false;
  return /\.(jpe?g|png|webp|gif|avif)(\?|#|$)/i.test(s) || /\/assets\/images\//i.test(s);
}

// CRITICAL discriminator: a full-frame BACKGROUND fills the scene clip; a HERO
// screenshot fills a FRAMED PLATE (a sized/rounded/shadowed showcase container —
// the product being shown off). Veiling a hero would darken the showcase, so if
// the image's nearest enclosing <div> looks like a plate, it is NOT a background.
// Errs toward NOT veiling when unsure (a false negative just skips a fix; a false
// positive would ruin a product reveal).
function parentIsPlate(html, imgStart) {
  const back = html.slice(Math.max(0, imgStart - 500), imgStart);
  const lastDiv = back.lastIndexOf("<div");
  if (lastDiv < 0) return false;
  const gt = back.indexOf(">", lastDiv);
  const openTag = back.slice(lastDiv, gt < 0 ? back.length : gt + 1);
  const style = (openTag.match(/style\s*=\s*"([^"]*)"/i) || [, ""])[1];
  // Plate signals: a fixed pixel/rem/vh size, a rounded corner, a drop shadow, or
  // an aspect-ratio box — the hallmarks of a framed screenshot/device, never of a
  // full-frame scene background (a bg clip is inset:0 with no fixed size/frame).
  return /(?:^|;|\s)(?:width|height)\s*:\s*\d+(?:px|rem|vh|vw|em)/i.test(style)
    || /border-radius/i.test(style)
    || /box-shadow/i.test(style)
    || /aspect-ratio/i.test(style);
}

// harmonizeBackgrounds(html, {theme, escalate}) -> { html, changed:[...] }
// theme.ground is the pack's authored ground color; falls back to a deep neutral.
// PRE-render (escalate=false) veils raw full-bleed background <img> photos. When
// QA STILL flags a clash after the film is composed, the deterministic repair node
// re-runs this with escalate=true, which (a) uses a STRONGER veil, (b) also veils
// full-bleed CSS background-image / shorthand-url divs the <img> pass can't see,
// and (c) strengthens any veil already present — so the re-pass does real work
// instead of a no-op (mirrors contrast_fix's recolor→scrim escalation).
function harmonizeBackgrounds(html, { theme, escalate = false } = {}) {
  const ground = (theme && theme.ground) || "#0B0F18";
  const veil = groundVeil(ground, escalate);
  const changed = [];
  const re = /<img\b[^>]*>/gi;
  let out = "", last = 0, m;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const style = (tag.match(/style\s*=\s*"([^"]*)"/i) || [, ""])[1];
    const src = (tag.match(/src\s*=\s*"([^"]*)"/i) || [, ""])[1];
    const id = (tag.match(/id\s*=\s*"([^"]*)"/i) || [, ""])[1];
    if (!isFullBleedCover(style) || !isRasterPhoto(src)) continue;
    // Never veil a showcased plate: scene-kit hero screenshots use an id ending
    // in "img" (s2img); framed containers are caught by parentIsPlate.
    if (/img$/i.test(id) && !/bgi$/i.test(id)) continue;
    if (parentIsPlate(html, m.index)) continue;
    const tagEnd = m.index + tag.length;
    // Already grounded? The scene-kit / composer scrim is an inset:0 div carrying a
    // background gradient/color immediately after the image — or our own kf-bgveil.
    const after = html.slice(tagEnd, tagEnd + 320);
    const alreadyScrimmed = /^\s*<div\b[^>]*style\s*=\s*"[^"]*inset\s*:\s*0[^"]*background\s*:[^"]*(rgba|gradient|#)/i.test(after)
      || /^\s*<div\b[^>]*class\s*=\s*"[^"]*kf-bgveil/i.test(after);
    if (alreadyScrimmed) continue;
    out += html.slice(last, tagEnd) + `<div class="kf-bgveil" style="position:absolute;inset:0;background:${veil};pointer-events:none;"></div>`;
    last = tagEnd;
    changed.push(src);
  }
  out += html.slice(last);

  if (escalate) {
    const strong = groundVeil(ground, true);
    // Full-bleed CSS-background divs (background-image:url / background:…url()) the
    // <img> pass can't reach — layer the veil gradient over the image. Carries the
    // SAME safeguards as the <img> pass so it can't bury a product reveal:
    //   • skip a framed SHOWCASE plate — the div's OWN style has a rounded corner,
    //     a drop shadow, an aspect-ratio box, or a fixed px/rem/vh size;
    //   • skip svg / data-uri vector art (theme-neutral, must be left alone);
    //   • skip anything already veiled/layered (idempotent).
    // NOTE: deliberately does NOT blanket-"strengthen" pre-existing kf-bgveil veils
    // — those can sit over legitimate content panels (e.g. contact-sheet tiles), and
    // globally darkening them let a fault in one scene black out another. The
    // escalation's real work is the STRONG veil on newly-caught raw backgrounds.
    out = out.replace(/<div\b[^>]*>/gi, (tag) => {
      if (/data-kfveil/i.test(tag)) return tag;                          // already veiled
      const style = (tag.match(/style\s*=\s*"([^"]*)"/i) || [, ""])[1];
      const url = (style.match(/url\(\s*['"]?([^'")]+)/i) || [, ""])[1];
      if (!url || !isFullBleedBg(style)) return tag;                     // not a full-bleed bg image
      if (/\.svg(\?|#|$)/i.test(url) || /^data:image\/svg/i.test(url)) return tag; // vector — leave it
      if (/border-radius|box-shadow|aspect-ratio/i.test(style)          // framed showcase plate
        || /(?:^|;|\s)(?:width|height)\s*:\s*\d+(?:px|rem|vh|vw|em)/i.test(style)) return tag;
      if (/linear-gradient\([^)]*rgba/i.test(style)) return tag;        // already layered
      let ns;
      if (/background-image\s*:/i.test(style)) ns = style.replace(/background-image\s*:\s*/i, `background-image:${strong},`);
      else if (/background\s*:/i.test(style)) ns = style.replace(/background\s*:\s*/i, `background:${strong},`);
      else return tag;
      changed.push("css-bg-veiled");
      return tag.replace(style, ns).replace(/<div\b/i, '<div data-kfveil="1"');
    });
  }
  return { html: out, changed };
}


// ---------------------------------------------------------------------------------------
// PLATED PHOTOS — the case harmonizeBackgrounds deliberately does not cover.
//
// harmonizeBackgrounds veils FULL-BLEED backgrounds and skips anything inside a plate, on the
// reasoning that veiling a hero screenshot would ruin a product reveal. That bias is right for a
// curtain of ground colour. But a plate gives a photo a FRAME, not a PALETTE: a raw daylight
// photo inside a rounded card still tears the design system, and that is the exact class QA
// blocks as "PALETTE-CLASHING PHOTO". Measured on a shipped film, 5 of 13 photos carried no
// treatment at all, and across ten packs 30 of 50 - because composer.js instructs every photo to
// carry a filter tint plus a ground scrim, and nothing on the deterministic path ever applies one.
//
// This is a SEPARATE, WEAKER pass, and deliberately so:
//   * it runs only on the QA-repair re-pass (escalate), so it can touch only films a reviewer
//     has already condemned - no pack regresses by default;
//   * it never reuses groundVeil(), whose escalated stop is rgba(...,0.97) - an opaque rectangle
//     over a plate. The plate wash is hard-capped an order of magnitude lighter;
//   * it takes the ground from the scene's own data-fk-ground attribute and SKIPS when that is
//     absent, rather than falling back to a default. Guessing #0B0F18 over a #f7f7f8 set is how
//     a "fix" turns a light pack muddy.
function platedGround(html, imgStart) {
  const back = html.slice(0, imgStart);
  const at = back.lastIndexOf("data-fk-ground=\"");
  if (at === -1) return null;
  const m = /^data-fk-ground="([^"]*)"/.exec(back.slice(at));
  const g = m && m[1] ? m[1].trim() : "";
  return /^#[0-9a-f]{3,8}$/i.test(g) ? g : null;
}

function isPlatedPhoto(style) {
  if (!/object-fit\s*:\s*(cover|contain)/i.test(style)) return false;
  return /position\s*:\s*absolute/i.test(style) && /inset\s*:\s*0/i.test(style);
}

function harmonizePlatedPhotos(html, { escalate = false } = {}) {
  const changed = [];
  if (!escalate) return { html: String(html), changed };
  let out = "";
  let last = 0;
  const re = /<img\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const end = m.index + tag.length;
    const style = (tag.match(/style\s*=\s*"([^"]*)"/i) || [, ""])[1];
    const src = (tag.match(/src\s*=\s*"([^"]*)"/i) || [, ""])[1];
    const alt = (tag.match(/alt\s*=\s*"([^"]*)"/i) || [, ""])[1];
    const skip = (why) => why;
    let reason = null;
    if (!isPlatedPhoto(style)) reason = "not plated";
    else if (!isRasterPhoto(src)) reason = "not a raster photo";
    // GUARD 1 - never re-treat something already washed or tinted.
    else if (/filter\s*:/i.test(style)) reason = "already filtered";
    else if (/opacity\s*:\s*(0?\.[0-5]\d*|0)\b/i.test(style)) reason = "already dimmed";
    // GUARD 5 - a brand mark must keep its own colours.
    else if (/logo|wordmark|badge|favicon/i.test(src) || /logo|wordmark/i.test(alt)) reason = "logo";
    // idempotence - our own span, or an existing scrim sibling.
    else if (/^\s*<(?:span|div)\b[^>]*class\s*=\s*"[^"]*kf-plateveil/i.test(html.slice(end, end + 320))) reason = "already harmonised";
    if (reason) { out += html.slice(last, end); last = end; continue; }
    // PROVENANCE - the scene's own ground, or nothing at all.
    const ground = platedGround(html, m.index);
    if (!ground) { out += html.slice(last, end); last = end; continue; }
    const [r0, g0, b0] = hexToRgb(ground);
    const light = lum(ground) >= 0.45 * 255;
    // GUARD 3 - a light set goes muddy under a dark wash and under contrast() < 1.
    const filt = light
      ? "saturate(0.82) contrast(1.04) brightness(1.02)"
      : "saturate(0.76) contrast(1.04)";
    const a1 = light ? 0.08 : 0.12;
    const a2 = light ? 0.18 : 0.32;
    // GUARD 4 - `background` on an <img> paints the whole content box, so a fill would show
    // through every transparent pixel of a PNG. Only the wash span carries colour.
    const wash = `linear-gradient(180deg,rgba(${r0},${g0},${b0},${a1}) 0%,rgba(${r0},${g0},${b0},${a2}) 100%)`;
    const hair = `inset 0 0 0 0.19cqw rgba(${r0},${g0},${b0},0.55)`;
    const styled = tag.replace(/style\s*=\s*"([^"]*)"/i, (whole, css) =>
      `style="${css.replace(/;\s*$/, "")};filter:${filt};"`);
    out += html.slice(last, m.index) + styled
      + `<span class="kf-plateveil" style="position:absolute;inset:0;pointer-events:none;background:${wash};box-shadow:${hair};"></span>`;
    last = end;
    changed.push(src.split("/").pop());
  }
  out += html.slice(last);
  return { html: out, changed };
}

module.exports = { harmonizeBackgrounds, harmonizePlatedPhotos };
