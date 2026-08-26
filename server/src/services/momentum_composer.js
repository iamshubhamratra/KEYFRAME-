// MOMENTUM composer — a faithful native GSAP port of the "MOMENTUM" kinetic
// velocity hype template (server/public/momentum-template/momentum-film.jsx).
// The pack `momentum` (manifest renderer:"momentum") routes here from
// attemptLlmComposition, exactly like the blueprint/genesis composers — so
// selecting the template gives THE TEMPLATE: its eight authored scene types
// (Intro ring+logo, flush-left Statement, browser-frame Feature, phone-bezel
// Mobile, accent-flooded Stats, word-by-word Quote, Gallery grid, ring CTA),
// its whip/zoom camera rig with motion blur, and its persistent HUD chrome
// (drifting dot grid, animated vector field, top marquee, blinking status,
// corner crop marks). The bottom progress rail/playhead was removed — a filling
// timeline made the film read as a slideshow ticking through slides. Only the
// CONTENT is swapped: every storyboard scene is routed to the template scene
// type it fits and filled with the user's own headlines, bullets, numbers,
// quotes, screenshots and photos.
//
// Engineering contract (identical to the other dedicated composers): one paused
// GSAP timeline registered as window.__timelines["vid"]; direct-child .clip
// scenes on disjoint tracks with a hard opacity:0 kill at each scene end;
// hidden state is opacity:0 ONLY (all from-states live in gsap.fromTo); finite
// repeats; pathLength=100 on every draw-on; live counters/labels driven by
// seeked onUpdate proxies. Deterministic: every per-frame value is a pure
// function of tl.time().

const { fontFaceCss, isBundled } = require("../fonts/pack_fonts");
// Momentum renders on its own, but shares the engine's script->display-copy
// adapter so both paths put the scene's OWN words on screen.
const { withDisplayCopy } = require("./template_engine");
const E = require("./template_engine");
// One implementation of "which picture belongs on this beat", shared with every
// other renderer — see the wiring note on takePool below.
const { pickForScene } = require("./scene_match");
const { fitScenes, MAX_CLIPS } = require("./scene_fit");

const GSAP_CDN = "https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js";
const DISPLAY = "Sora"; // bundled stand-in for the template's Hanken Grotesk
const MONO = "JetBrains Mono"; // bundled stand-in for Space Mono

// ---- helpers -----------------------------------------------------------------
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const r = (n) => Math.round((Number(n) || 0) * 100) / 100;

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
// Ink that reads on a given background. Delegates to the engine's CONTRAST-based
// chooser rather than a luminance threshold: on a saturated accent the luminance
// guess picks the lower-contrast side (cream on this pack's orange measured
// 2.98:1 against a 4.5 floor), and readable() then guarantees the result.
function inkOn(bg, ink) { return E.readable(bg, E.inkOn(bg, "#141210", ink || "#F5F2EA"), 1, 4.5); }

// Momentum identity + brand adaptivity. The accent recolors to the brand (the
// template's own Accent tweak) and — when matchSiteTheme handed us a site
// ground — the sheet follows the site's light/dark theme with ink re-derived.
function momentumTheme(brandSkin) {
  const skin = brandSkin || {};
  const accent = /^#[0-9a-f]{3,8}$/i.test(String(skin.accents && skin.accents[0] || "")) ? skin.accents[0] : "#FF4B2B";
  const ground = /^#[0-9a-f]{3,8}$/i.test(String(skin.ground || "")) ? skin.ground : "#131210";
  const ink = lum(ground) > 0.45 ? "#1A1713" : "#F5F2EA";
  const fontFace = (isBundled(DISPLAY) ? fontFaceCss(DISPLAY) : "") + (isBundled(MONO) ? fontFaceCss(MONO) : "");
  return {
    accent, ground, ink,
    displayStack: `'${DISPLAY}', 'Hanken Grotesk', system-ui, sans-serif`,
    monoStack: `'${MONO}', 'Space Mono', ui-monospace, monospace`,
    fontFace,
  };
}

// ---- content miners (the "editor brain": template slots ← user's script) -----

// Headline broken for the template's stacked display type: honors the authored
// '|' break, else breaks a long headline near its middle word.
function breakLines(text, fallback) {
  const t = String(text || fallback || "").trim();
  if (!t) return [String(fallback || "")];
  // '|' is the template's break marker; a cast headline may carry real newlines.
  if (/[|\n]/.test(t)) return t.split(/[|\n]/).map((x) => x.trim()).filter(Boolean);
  const words = t.split(/\s+/);
  if (words.length < 3) return [t];
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
}

// Statement lines: 2-4 stacked lines of 1-2 words from the headline.
function statementLines(scene) {
  const words = String(scene.headline || scene.title || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const lines = [];
  for (let i = 0; i < words.length && lines.length < 4; ) {
    const pair = words[i] && words[i + 1] && (words[i].length + words[i + 1].length) <= 12 ? 2 : 1;
    lines.push(words.slice(i, i + pair).join(" "));
    i += pair;
  }
  if (lines.length < 2) return null;
  return lines;
}

// Up to n short bullet strings.
function bullets(scene, n) {
  let list = Array.isArray(scene.onScreenText) ? scene.onScreenText.filter(Boolean) : [];
  if (!list.length && Array.isArray(scene.bullets)) list = scene.bullets.filter(Boolean);
  if (!list.length && scene.subtext) {
    list = String(scene.subtext).split(/[.;\n•]|\s—\s/).map((s) => s.trim()).filter((s) => s.length > 2);
  }
  return list.slice(0, n).map((s) => String(s));
}

// Feature/Mobile chips — short punchy uppercase fragments. Truncation lands on
// a word boundary so a long bullet never renders as a mid-word cut chip. The
// Template Director's `chips` slot (already shaped to the template) wins.
function chipsFor(scene) {
  const cast = Array.isArray(scene.chips) ? scene.chips.filter(Boolean).slice(0, 3) : null;
  return (cast && cast.length ? cast : bullets(scene, 3))
    .map((b) => String(b).split(/[:—-]\s/)[0].trim())
    .map((b) => {
      let out = "";
      for (const w of b.split(/\s+/)) {
        if ((out + " " + w).trim().length > 18) break;
        out = (out + " " + w).trim();
      }
      return out;
    })
    .filter((b) => b.length >= 2)
    .map((b) => b.toUpperCase());
}

// "240% faster ships" → {v:240, suf:"%", isFloat:false, l:"FASTER SHIPS"}
function mineStat(str) {
  // The suffix must not be the next word's first letter, or the label loses it
  // ("Free for 12 months" shipped as "FREE FORONTHS"). Rebuild the label around
  // the number rather than string-replacing it, so its space survives.
  const s = String(str || "");
  const m = /([$₹€£]?)\s?(\d[\d,]*(?:\.\d+)?)(?:\s?(%|x|\+|k|m|bn?|★)(?![A-Za-z]))?/i.exec(s);
  if (!m) return null;
  const v = parseFloat(m[2].replace(/,/g, ""));
  if (!isFinite(v) || v > 10000000) return null;
  const label = `${s.slice(0, m.index)} ${s.slice(m.index + m[0].length)}`
    .replace(/[^\w\s.%-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 24).toUpperCase();
  return { pre: m[1] || "", v, suf: (m[3] || "").toUpperCase(), isFloat: String(m[2]).includes("."), l: label };
}

// Up to 3 counters for the Stats scene. The Template Director's `stats` slot
// (already {v,suf,l}-shaped) wins; otherwise mine bullets/subtext/emphasis.
function mineStats(scene) {
  if (Array.isArray(scene.stats) && scene.stats.length) {
    const cast = scene.stats
      .filter((s) => s && isFinite(Number(s.v)))
      .slice(0, 3)
      .map((s) => ({ pre: String(s.pre || ""), v: Number(s.v), suf: String(s.suf || "").toUpperCase().slice(0, 2), isFloat: !Number.isInteger(Number(s.v)), l: String(s.l || "").slice(0, 24).toUpperCase() }));
    if (cast.length) return cast;
  }
  const srcs = []
    .concat(Array.isArray(scene.onScreenText) ? scene.onScreenText : [])
    .concat(scene.subtext ? String(scene.subtext).split(/[.;\n]/) : [])
    .concat(scene.emphasis ? [scene.emphasis] : []);
  const out = [];
  for (const s of srcs) {
    if (!/\d/.test(String(s))) continue;
    const st = mineStat(s);
    if (st && !out.some((o) => o.v === st.v && o.suf === st.suf)) out.push(st);
    if (out.length >= 3) break;
  }
  return out;
}

// ---- asset gates -------------------------------------------------------------
// Trust matches the scene-kit prominentOk gate: the user's own website/blog
// shots, curated-library picks, or Creative-Director-approved web stock.
function plateOk(a) {
  if (!a || !a.path) return false;
  if (a.type === "video" || /\.(mp4|webm|mov)($|\?)/i.test(a.path)) return false;
  if (/\.svg($|\?)/i.test(a.path)) return false;
  const src = String(a.source || "").toLowerCase();
  return a.source === "website" || a.source === "blog" || src === "website-image" || src.startsWith("library")
    || a.visionOk === true || a.cdProminence === "hero" || a.cdProminence === "support";
}
function assetRatio(a) {
  return Number(a && a.ratio) || (a && a.width && a.height ? a.width / a.height : 0);
}
function isPortraitAsset(a) { const rt = assetRatio(a); return rt > 0 && rt < 0.9; }
function isShot(a) {
  const s = String((a && a.source) || "").toLowerCase();
  const k = String((a && a.kind) || "").toLowerCase();
  return s === "website" || s === "screenshot" || k === "screenshot" || /screenshot|peekshot/.test(s);
}
function isLogo(a) {
  const k = String((a && a.kind) || "").toLowerCase();
  return k === "logo" || /logo/i.test(String((a && a.alt) || "")) || /logo\.[a-z]+($|\?)/i.test(String((a && a.path) || ""));
}

// ---- scene router ------------------------------------------------------------
function momArchetype(scene, i, total, pinnedAsset, poolLeft) {
  const k = String(scene.kind || "").toLowerCase();
  const p = String(scene.purpose || "").toLowerCase();
  if (i === 0 || k === "hook" || k === "title") return "intro";
  if (i === total - 1 || k === "cta" || p === "cta") return "cta";
  if (k === "quote" || scene.quote || /testimonial|quote/.test(p)) return "quote";
  if (k === "stat" || k === "chart" || k === "countdown" || mineStats(scene).length >= 2) return "stats";
  if (pinnedAsset) return isPortraitAsset(pinnedAsset) ? "mobile" : "feature";
  if (/gallery|showcase|proof|social/.test(`${k} ${p}`) && poolLeft >= 2) return "gallery";
  const words = String(scene.headline || "").trim().split(/\s+/).filter(Boolean).length;
  // SPEND THE ASSETS. This test sat AHEAD of the media branch, so any scene with
  // a short headline and no subtext became a text-only statement no matter how
  // many real screenshots were waiting — measured on a live Trello film, this
  // pack put 1 of 11 captures on screen. A statement plate is the right call when
  // there is nothing to show; with a deep pool the product shot wins.
  if (words > 0 && words <= 8 && !scene.subtext && statementLines(scene) && poolLeft < 3) return "statement";
  if (poolLeft >= 1) return "feature";
  return statementLines(scene) ? "statement" : "quote";
}

// ---- shared scene furniture (html snippets) ----------------------------------

// Speed streak lines — entrance burst riding the left edge.
function streaksHtml(id, accent) {
  return [18, 34, 50, 66, 82].map((top, i) =>
    `<div class="${id}-streak" style="position:absolute;top:${top}%;left:-45%;width:${28 + (i % 3) * 9}%;height:${i % 2 ? 2 : 3}px;background:linear-gradient(90deg, transparent, ${rgba(accent, 0.9)});opacity:0;"></div>`
  ).join("");
}
function streaksScript(id, T) {
  return [
    `tl.fromTo(".${id}-streak",{opacity:0,xPercent:0},{opacity:1,xPercent:240,duration:0.42,ease:"expo.out",stagger:0.03},${r(T + 0.05)});`,
    `tl.to(".${id}-streak",{opacity:0,duration:0.22,ease:"power1.in",stagger:0.03},${r(T + 0.3)});`,
  ];
}

// Pumping chevrons »»» (finite pulse off the timeline).
function chevronsHtml(cls, color, style, n = 3, size = 1.35, flip = false) {
  const svgs = new Array(n).fill(0).map(() =>
    `<svg class="${cls}" width="10" height="10" viewBox="0 0 24 24" style="width:${size}cqw;height:${size}cqw;opacity:0;"><path d="M7 4l9 8-9 8" fill="none" stroke="${color}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  ).join("");
  return `<div style="position:absolute;display:flex;gap:${size * 0.28}cqw;${style}${flip ? "transform:scaleX(-1);" : ""}">${svgs}</div>`;
}
function chevronsScript(cls, T, L) {
  const cyc = 1.1;
  return [
    `tl.fromTo(".${cls}",{opacity:0.18},{opacity:1,duration:${cyc / 2},ease:"sine.inOut",yoyo:true,repeat:reps(${r(Math.max(cyc, L - 0.6))},${cyc / 2}),stagger:0.16},${r(T + 0.4)});`,
  ];
}

// Corner reticle brackets drawing around a media slot.
function reticleHtml(id, color, inset = "-1cqw") {
  const seg = (pos, o) => `<span class="${id}-ret" style="position:absolute;${pos};width:1.5cqw;height:1.5cqw;border:0 solid ${color};${o};opacity:0;"></span>`;
  return `<div style="position:absolute;inset:${inset};pointer-events:none;">${
    seg("left:0;top:0", "border-left-width:3px;border-top-width:3px")}${
    seg("right:0;top:0", "border-right-width:3px;border-top-width:3px")}${
    seg("left:0;bottom:0", "border-left-width:3px;border-bottom-width:3px")}${
    seg("right:0;bottom:0", "border-right-width:3px;border-bottom-width:3px")}</div>`;
}
function reticleScript(id, T) {
  return [`tl.fromTo(".${id}-ret",{opacity:0,scale:1.7},{opacity:1,scale:1,duration:0.3,ease:"power2.out",stagger:0.05},${r(T)});`];
}

// A media slot: real asset image, or (no asset) a momentum-styled placeholder
// panel with the brand mark — never the raw "DROP IMAGE" editor hint.
function mediaHtml(asset, theme, fit, brand) {
  if (asset && asset.path) {
    return `<img src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="width:100%;height:100%;object-fit:${fit || "cover"};object-position:top center;display:block;">`;
  }
  return `<div style="width:100%;height:100%;position:relative;background:repeating-linear-gradient(135deg, ${rgba(theme.ink, 0.06)} 0 14px, ${rgba(theme.ink, 0.02)} 14px 28px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0.8cqw;">
    <div style="font-weight:800;font-size:3.4cqw;letter-spacing:-0.03em;color:${theme.accent};text-transform:uppercase;">${esc(String(brand || "◆").slice(0, 1))}</div>
    <div class="mono" style="font-size:0.75cqw;letter-spacing:0.2em;color:${rgba(theme.ink, 0.45)};text-transform:uppercase;">${esc(String(brand || ""))}</div>
  </div>`;
}

// ---- scene-type builders  ((scene, ctx, asset) -> { html, s })  --------------
// ctx = { id, T, L, track, dims, land, theme, i, count, brand, url }

function momIntro(scene, ctx, asset) {
  const { id, T, L, theme, land, brand } = ctx;
  const tagline = String(scene.tagline || scene.subtext || scene.headline || "THE LAUNCH, ENGINEERED").slice(0, 60).toUpperCase();
  const showBrand = String(scene.brand || brand).toUpperCase();
  const ringCq = land ? 15.6 : 26;
  const logo = asset && isLogo(asset) ? asset : null;
  const html = `<div class="clip mom-scene" id="${id}" data-start="${ctx.T}" data-duration="${r(ctx.winL || L)}" data-track-index="${ctx.track}" style="opacity:0;">
  <div class="camo" id="${id}-camo"><div class="cami" id="${id}-cami">
    ${streaksHtml(id, theme.accent)}
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;">
      <div style="position:relative;display:grid;place-items:center;margin-bottom:${land ? 2.1 : 3.4}cqw;">
        ${reticleHtml(id, theme.accent, land ? "-1.9cqw" : "-3cqw")}
        <svg id="${id}-ring" viewBox="0 0 340 340" style="position:absolute;width:${ringCq + 6}cqw;height:${ringCq + 6}cqw;opacity:0;">
          <g id="${id}-ringspin"><circle cx="170" cy="170" r="150" fill="none" stroke="${rgba(theme.accent, 0.9)}" stroke-width="3" stroke-dasharray="151 85" stroke-linecap="round"/></g>
        </svg>
        <div id="${id}-badge" style="opacity:0;width:${ringCq * 0.7}cqw;height:${ringCq * 0.7}cqw;border-radius:1.6cqw;background:${rgba(theme.ink, 0.05)};border:1px solid ${rgba(theme.ink, 0.16)};display:grid;place-items:center;overflow:hidden;padding:1.4cqw;">
          ${mediaHtml(logo, theme, "contain", showBrand)}
        </div>
        ${chevronsHtml(`${id}-chl`, theme.accent, `left:${-ringCq - 6}cqw;top:${ringCq / 2 - 0.8}cqw;`, 3, 1.5)}
        ${chevronsHtml(`${id}-chr`, theme.accent, `left:${ringCq + 3}cqw;top:${ringCq / 2 - 0.8}cqw;`, 3, 1.5, true)}
      </div>
      <div id="${id}-brand" style="opacity:0;font-weight:900;font-size:${land ? 7.8 : 11.5}cqw;letter-spacing:-0.05em;color:${theme.ink};text-transform:uppercase;line-height:0.9;text-align:center;">${esc(showBrand)}</div>
      <div id="${id}-tag" class="mono" style="opacity:0;margin-top:${land ? 0.95 : 1.8}cqw;font-size:${land ? 1.15 : 2.2}cqw;letter-spacing:0.28em;color:${theme.accent};text-transform:uppercase;text-align:center;max-width:88%;">${esc(tagline)}</div>
    </div>
  </div></div></div>`;
  const s = []
    .concat(streaksScript(id, T))
    .concat(reticleScript(id, T + 0.55))
    .concat([
      `tl.fromTo("#${id}-ring",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.7)"},${r(T + 0.3)});`,
      `tl.to("#${id}-ringspin",{rotation:${r(30 * L)},duration:${r(L)},ease:"none",svgOrigin:"170 170"},${T});`,
      `tl.fromTo("#${id}-badge",{opacity:0,scale:0.3},{opacity:1,scale:1,duration:0.55,ease:"back.out(1.8)"},${r(T + 0.35)});`,
      `tl.fromTo("#${id}-brand",{opacity:0,y:70},{opacity:1,y:0,duration:0.55,ease:"back.out(1.4)"},${r(T + 0.95)});`,
      `tl.fromTo("#${id}-tag",{opacity:0,y:40},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 1.25)});`,
    ])
    .concat(chevronsScript(`${id}-chl`, T + 0.6, L)).concat(chevronsScript(`${id}-chr`, T + 0.6, L));
  return { html, s };
}

function momStatement(scene, ctx) {
  const { id, T, L, theme, land } = ctx;
  const cast = Array.isArray(scene.lines) ? scene.lines.map((l) => String(l || "").trim()).filter(Boolean).slice(0, 4) : null;
  // Never fall through to the template's own demo copy: with no castable lines,
  // stack the scene's real headline instead.
  const lines = (cast && cast.length >= 2 ? cast : null)
    || statementLines(scene)
    || breakLines(scene.headline, scene.subtext || "");
  const chips = chipsFor(scene);
  const chipHtml = chips.length ? `<div style="margin-top:2cqw;display:flex;gap:0.62cqw;flex-wrap:wrap;">${chips.map((c) =>
    `<span class="${id}-chip" style="opacity:0;display:inline-flex;align-items:center;gap:0.42cqw;padding:0.5cqw 0.85cqw;border-radius:999px;border:1px solid ${rgba(theme.accent, 0.5)};background:${rgba(theme.ink, 0.05)};font-family:${theme.monoStack};font-size:${land ? 0.73 : 1.5}cqw;letter-spacing:0.1em;color:${theme.ink};white-space:nowrap;flex-shrink:0;"><span style="width:0.36cqw;height:0.36cqw;border-radius:999px;background:${theme.accent};"></span>${esc(c)}</span>`
  ).join("")}</div>` : "";
  const emph = String(scene.emphasis || "").toLowerCase();
  let accentIdx = Number.isInteger(scene.accentLine) && scene.accentLine >= 0 && scene.accentLine < lines.length
    ? scene.accentLine
    : lines.findIndex((ln) => emph && ln.toLowerCase().includes(emph));
  if (accentIdx < 0) accentIdx = 1 % lines.length;
  const bigNum = `/${String(ctx.i + 1).padStart(2, "0")}`;
  // Template scale: 158px ≈ 8.2cqw. Shrink only when the longest line would
  // overflow the column (~0.62 fs per char, ~78cqw of usable width).
  const maxLen = Math.max(...lines.map((l) => l.length));
  const fs = land ? Math.min(8.2, 88 / maxLen) : Math.min(11, 138 / maxLen);
  const rows = lines.map((ln, i) => {
    const isA = i === accentIdx;
    return `<div class="${id}-line" style="opacity:0;display:flex;align-items:center;">
      ${isA ? `<span class="${id}-bar" style="display:inline-block;width:2.3cqw;height:2.3cqw;background:${theme.accent};margin-right:1.25cqw;"></span>` : ""}
      <span style="font-weight:900;font-size:${r(fs)}cqw;line-height:0.94;letter-spacing:-0.05em;text-transform:uppercase;color:${isA ? theme.accent : theme.ink};">${esc(ln)}</span>
    </div>`;
  }).join("");
  const html = `<div class="clip mom-scene" id="${id}" data-start="${T}" data-duration="${r(ctx.winL || L)}" data-track-index="${ctx.track}" style="opacity:0;">
  <div class="camo" id="${id}-camo"><div class="cami" id="${id}-cami">
    ${streaksHtml(id, theme.accent)}
    <div id="${id}-num" style="position:absolute;right:4.7cqw;top:${land ? 6.2 : 10}cqw;font-weight:900;font-size:${land ? 17.7 : 22}cqw;line-height:0.8;color:${rgba(theme.ink, 0.05)};letter-spacing:-0.05em;">${esc(bigNum)}</div>
    <div style="position:absolute;left:5cqw;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;gap:0.2cqw;">${rows}${chipHtml}</div>
  </div></div></div>`;
  const s = []
    .concat(streaksScript(id, T))
    .concat([
      `tl.fromTo(".${id}-line",{opacity:0,y:90},{opacity:1,y:0,duration:0.5,ease:"back.out(1.4)",stagger:0.09},${r(T + 0.25)});`,
      `tl.fromTo(".${id}-bar",{scaleX:0},{scaleX:1,transformOrigin:"left center",duration:0.45,ease:"expo.out"},${r(T + 0.55)});`,
      chips.length ? `tl.fromTo(".${id}-chip",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:0.42,ease:"back.out(2)",stagger:0.1},${r(T + 0.85)});` : "",
    ].filter(Boolean));
  return { html, s };
}

function momFeature(scene, ctx, asset) {
  const { id, T, L, theme, land, url } = ctx;
  const lines = breakLines(scene.headline, "See it live.");
  const eyebrow = String(scene.eyebrow || scene.purpose || `FEATURE // ${String(ctx.i).padStart(2, "0")}`).slice(0, 26).toUpperCase();
  const body = String(scene.body || scene.subtext || "").slice(0, 150);
  const chips = chipsFor(scene);
  const chipHtml = chips.map((c) =>
    `<span class="${id}-chip" style="opacity:0;display:inline-flex;align-items:center;gap:0.42cqw;padding:0.5cqw 0.85cqw;border-radius:999px;border:1px solid ${rgba(theme.accent, 0.5)};background:${rgba(theme.ink, 0.05)};font-family:${theme.monoStack};font-size:${land ? 0.73 : 1.5}cqw;letter-spacing:0.1em;color:${theme.ink};white-space:nowrap;flex-shrink:0;"><span style="width:0.36cqw;height:0.36cqw;border-radius:999px;background:${theme.accent};"></span>${esc(c)}</span>`
  ).join("");
  const copy = `
      <div id="${id}-head" style="opacity:0;">
        <div class="mono" style="font-size:${land ? 0.89 : 1.7}cqw;letter-spacing:0.24em;color:${theme.accent};margin-bottom:0.95cqw;">${esc(eyebrow)}</div>
        <div style="font-weight:900;font-size:${land ? 4.8 : 6.8}cqw;line-height:0.94;letter-spacing:-0.04em;text-transform:uppercase;color:${theme.ink};">${lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
      </div>
      ${body ? `<div id="${id}-body" class="mono" style="opacity:0;margin-top:1.35cqw;font-size:${land ? 0.94 : 1.85}cqw;line-height:1.6;color:${rgba(theme.ink, 0.66)};max-width:${land ? 24 : 78}cqw;">${esc(body)}</div>` : ""}
      ${chips.length ? `<div style="margin-top:1.55cqw;display:flex;gap:0.62cqw;flex-wrap:wrap;">${chipHtml}</div>` : ""}`;
  const browser = `
      <div id="${id}-shot" style="opacity:0;position:absolute;${land ? "right:5cqw;top:8.75cqw;width:46.9cqw;height:32.3cqw;" : "left:6cqw;right:6cqw;top:64cqw;height:82cqw;"}">
        <div style="width:100%;height:100%;border-radius:0.85cqw;overflow:hidden;background:#0c0b0a;border:1px solid ${rgba(theme.ink, 0.14)};box-shadow:0 2.1cqw 4.7cqw ${rgba("#000000", 0.55)};display:flex;flex-direction:column;">
          <div style="height:2.4cqw;flex-shrink:0;background:${rgba(theme.ink, 0.06)};display:flex;align-items:center;gap:0.42cqw;padding:0 0.95cqw;">
            <span style="width:0.62cqw;height:0.62cqw;border-radius:999px;background:#FF5F57;"></span><span style="width:0.62cqw;height:0.62cqw;border-radius:999px;background:#FEBC2E;"></span><span style="width:0.62cqw;height:0.62cqw;border-radius:999px;background:#28C840;"></span>
            <div class="mono" style="margin-left:0.72cqw;flex:1;max-width:19.8cqw;height:1.25cqw;border-radius:999px;background:${rgba(theme.ink, 0.08)};display:flex;align-items:center;padding:0 0.72cqw;font-size:0.62cqw;color:${rgba(theme.ink, 0.5)};letter-spacing:0.06em;overflow:hidden;">${esc(url)}</div>
          </div>
          <div style="flex:1;min-height:0;overflow:hidden;"><div id="${id}-kb" style="width:100%;height:100%;">${mediaHtml(asset, theme, "cover", ctx.brand)}</div></div>
        </div>
        ${reticleHtml(id, theme.accent)}
      </div>`;
  const html = `<div class="clip mom-scene" id="${id}" data-start="${T}" data-duration="${r(ctx.winL || L)}" data-track-index="${ctx.track}" style="opacity:0;">
  <div class="camo" id="${id}-camo"><div class="cami" id="${id}-cami">
    <div style="position:absolute;${land ? "left:5cqw;top:7.8cqw;width:32.3cqw;" : "left:6cqw;right:6cqw;top:10cqw;"}">${copy}</div>
    ${browser}
    ${chevronsHtml(`${id}-ch`, theme.accent, land ? "left:37cqw;top:24.5cqw;" : "left:6cqw;top:57cqw;", 4, 1.15)}
  </div></div></div>`;
  const s = [
    `tl.fromTo("#${id}-head",{opacity:0,y:50},{opacity:1,y:0,duration:0.55,ease:"back.out(1.4)"},${r(T + 0.3)});`,
    body ? `tl.fromTo("#${id}-body",{opacity:0,y:30},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.65)});` : "",
    chips.length ? `tl.fromTo(".${id}-chip",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:0.42,ease:"back.out(2)",stagger:0.1},${r(T + 1.05)});` : "",
    `tl.fromTo("#${id}-shot",{opacity:0,x:${land ? 760 : 0},y:${land ? 0 : 420}},{opacity:1,x:0,y:0,duration:0.62,ease:"back.out(1.15)"},${r(T + 0.25)});`,
    `tl.fromTo("#${id}-kb",{scale:1.0},{scale:1.05,duration:${r(Math.max(1, L - 1.2))},ease:"sine.inOut"},${r(T + 0.95)});`,
  ].filter(Boolean)
    .concat(reticleScript(id, T + 1.1))
    .concat(chevronsScript(`${id}-ch`, T + 0.8, L));
  return { html, s };
}

function momMobile(scene, ctx, asset) {
  const { id, T, L, theme, land } = ctx;
  const lines = breakLines(scene.headline, "In your pocket.");
  const eyebrow = String(scene.eyebrow || scene.purpose || "ON THE GO").slice(0, 26).toUpperCase();
  const chips = chipsFor(scene);
  const chipHtml = chips.map((c) =>
    `<span class="${id}-chip" style="opacity:0;display:inline-flex;align-items:center;gap:0.42cqw;padding:0.5cqw 0.85cqw;border-radius:999px;border:1px solid ${rgba(theme.accent, 0.5)};background:${rgba(theme.ink, 0.05)};font-family:${theme.monoStack};font-size:${land ? 0.73 : 1.5}cqw;letter-spacing:0.1em;color:${theme.ink};white-space:nowrap;flex-shrink:0;"><span style="width:0.36cqw;height:0.36cqw;border-radius:999px;background:${theme.accent};"></span>${esc(c)}</span>`
  ).join("");
  const html = `<div class="clip mom-scene" id="${id}" data-start="${T}" data-duration="${r(ctx.winL || L)}" data-track-index="${ctx.track}" style="opacity:0;">
  <div class="camo" id="${id}-camo"><div class="cami" id="${id}-cami">
    <div style="position:absolute;${land ? "right:6.25cqw;top:6.8cqw;width:33.3cqw;text-align:right;" : "left:6cqw;right:6cqw;top:9cqw;text-align:center;"}">
      <div id="${id}-head" style="opacity:0;">
        <div class="mono" style="font-size:${land ? 0.89 : 1.7}cqw;letter-spacing:0.24em;color:${theme.accent};margin-bottom:0.95cqw;">${esc(eyebrow)}</div>
        <div style="font-weight:900;font-size:${land ? 5 : 6.6}cqw;line-height:0.94;letter-spacing:-0.04em;text-transform:uppercase;color:${theme.ink};">${lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
      </div>
      ${chips.length ? `<div style="margin-top:1.55cqw;display:flex;gap:0.62cqw;flex-wrap:wrap;justify-content:${land ? "flex-end" : "center"};">${chipHtml}</div>` : ""}
    </div>
    <div id="${id}-phone" style="opacity:0;position:absolute;${land ? "left:10.9cqw;top:6.25cqw;width:18.5cqw;height:39.6cqw;" : "left:50%;margin-left:-16cqw;top:42cqw;width:32cqw;height:68cqw;"}">
      <div style="width:100%;height:100%;border-radius:2.2cqw;padding:0.62cqw;background:#0a0908;border:2px solid ${rgba(theme.ink, 0.16)};box-shadow:0 2.1cqw 4.7cqw ${rgba("#000000", 0.6)};position:relative;">
        <div style="position:absolute;top:1.15cqw;left:50%;transform:translateX(-50%);width:5cqw;height:1.15cqw;border-radius:999px;background:#0a0908;z-index:2;"></div>
        <div style="width:100%;height:100%;border-radius:1.7cqw;overflow:hidden;background:#151311;">${mediaHtml(asset, theme, "cover", ctx.brand)}</div>
      </div>
      ${reticleHtml(id, theme.accent)}
    </div>
    ${chevronsHtml(`${id}-ch`, theme.accent, land ? "left:31.3cqw;top:27cqw;" : "left:6cqw;top:38cqw;", 4, 1.15)}
  </div></div></div>`;
  const s = [
    `tl.fromTo("#${id}-head",{opacity:0,y:50},{opacity:1,y:0,duration:0.55,ease:"back.out(1.4)"},${r(T + 0.4)});`,
    chips.length ? `tl.fromTo(".${id}-chip",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:0.42,ease:"back.out(2)",stagger:0.1},${r(T + 1.05)});` : "",
    `tl.fromTo("#${id}-phone",{opacity:0,y:720},{opacity:1,y:0,duration:0.65,ease:"back.out(1.15)"},${r(T + 0.25)});`,
  ].filter(Boolean)
    .concat(reticleScript(id, T + 1.1))
    .concat(chevronsScript(`${id}-ch`, T + 0.9, L));
  return { html, s };
}

function momStats(scene, ctx) {
  const { id, T, L, theme, land } = ctx;
  const ink = inkOn(theme.accent, theme.ink);
  const dim = rgba(ink, 0.62);
  let stats = mineStats(scene);
  if (!stats.length) stats = [{ pre: "", v: 100, suf: "%", isFloat: false, l: "COMMITTED" }];
  const kicker = String(scene.kicker || scene.purpose || "BY THE NUMBERS").slice(0, 24).toUpperCase();
  const lines = breakLines(scene.headline, "Proof, not promises.");
  const bars = [0.45, 0.7, 0.55, 0.88, 1.0, 0.75, 0.92];
  const barH = land ? 21.9 : 20;
  const barHtml = bars.map((h, i) =>
    `<div class="${id}-bar" style="width:${land ? 2.4 : 3}cqw;height:${r(barH * h)}cqw;background:${i === 4 ? ink : rgba(ink, 0.22)};transform-origin:bottom;"></div>`
  ).join("");
  const statHtml = stats.map((st, i) => `<div class="${id}-stat" style="opacity:0;">
      <div style="font-weight:900;font-size:${land ? 6.15 : 10.5}cqw;line-height:1;letter-spacing:-0.05em;color:${ink};"><span id="${id}-n${i}">${esc(st.pre)}0${esc(st.suf)}</span></div>
      ${st.l ? `<div class="mono" style="font-size:${land ? 0.83 : 1.6}cqw;letter-spacing:0.16em;color:${dim};margin-top:0.42cqw;">${esc(st.l)}</div>` : ""}
      <div class="${id}-ustat" style="width:6.25cqw;height:${land ? 0.21 : 0.4}cqw;background:${ink};margin-top:0.72cqw;transform-origin:left center;"></div>
    </div>`).join("");
  const html = `<div class="clip mom-scene" id="${id}" data-start="${T}" data-duration="${r(ctx.winL || L)}" data-track-index="${ctx.track}" style="opacity:0;background:${theme.accent};">
  <div class="camo" id="${id}-camo"><div class="cami" id="${id}-cami">
    <div style="position:absolute;inset:-3cqw;background-image:radial-gradient(${rgba(ink, 0.35)} 1.3px, transparent 1.3px);background-size:2.4cqw 2.4cqw;opacity:0.35;"></div>
    <div style="position:absolute;right:${land ? 4.7 : 6}cqw;${land ? "bottom:10.9cqw" : "top:42cqw"};display:flex;align-items:flex-end;gap:${land ? 0.94 : 1.2}cqw;height:${barH}cqw;">${barHtml}</div>
    <svg viewBox="0 0 500 260" style="position:absolute;${land ? "right:4.2cqw;top:22cqw;width:26cqw;height:13.5cqw;" : "left:5cqw;top:72cqw;width:56cqw;height:29cqw;"}overflow:visible;">
      <polyline id="${id}-trend" class="draw" pathLength="100" points="23,231 87,126 151,189 215,50 279,0 343,105 407,34" fill="none" stroke="${ink}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>
    <div style="position:absolute;left:5cqw;top:${land ? 7.8 : 10}cqw;">
      <div id="${id}-kick" class="mono" style="opacity:0;font-size:${land ? 0.94 : 1.8}cqw;letter-spacing:0.26em;color:${ink};">${esc(kicker)}</div>
      <div id="${id}-head" style="opacity:0;margin-top:0.72cqw;max-width:${land ? 46.9 : 86}cqw;font-weight:900;font-size:${land ? 5.4 : 8.6}cqw;line-height:0.92;letter-spacing:-0.04em;text-transform:uppercase;color:${ink};">${lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
    </div>
    <div style="position:absolute;left:5cqw;${land ? "bottom:9.9cqw;display:flex;gap:4.7cqw;" : "bottom:12cqw;display:flex;flex-direction:column;gap:3.4cqw;"}">${statHtml}</div>
  </div></div></div>`;
  const s = [
    `tl.fromTo("#${id}-kick",{opacity:0,y:40},{opacity:1,y:0,duration:0.45,ease:"power2.out"},${r(T + 0.25)});`,
    `tl.fromTo("#${id}-head",{opacity:0,y:60},{opacity:1,y:0,duration:0.55,ease:"back.out(1.4)"},${r(T + 0.5)});`,
    `tl.fromTo(".${id}-bar",{scaleY:0},{scaleY:1,duration:0.45,ease:"power2.out",stagger:0.06},${r(T + 0.45)});`,
    `tl.to("#${id}-trend",{strokeDashoffset:0,duration:0.6,ease:"power2.inOut"},${r(T + L * 0.42)});`,
    `tl.fromTo(".${id}-stat",{opacity:0,y:40},{opacity:1,y:0,duration:0.5,ease:"back.out(1.4)",stagger:0.16},${r(T + L * 0.34)});`,
    `tl.fromTo(".${id}-ustat",{scaleX:0},{scaleX:1,duration:0.5,ease:"power2.out",stagger:0.16},${r(T + L * 0.34 + 0.25)});`,
  ].filter(Boolean);
  stats.forEach((st, i) => {
    s.push(`countTxt("#${id}-n${i}",${st.v},${r(T + L * 0.34 + i * 0.16)},${r(Math.min(1.2, L * 0.3))},${JSON.stringify(st.pre)},${JSON.stringify(st.suf)},${st.isFloat ? 10 : 1});`);
  });
  return { html, s };
}

function momQuote(scene, ctx) {
  const { id, T, L, theme, land } = ctx;
  const quote = String(scene.quote || scene.headline || scene.subtext || "").slice(0, 140);
  const words = quote.split(/\s+/).filter(Boolean);
  const author = String(scene.author || scene.emphasis || "").slice(0, 40);
  const role = String(scene.role || scene.purpose || ctx.brand).slice(0, 50).toUpperCase();
  const per = Math.min(0.11, (L * 0.42) / Math.max(1, words.length));
  const wordHtml = words.map((w) =>
    `<span class="${id}-w" style="opacity:0;font-weight:800;font-size:${land ? 3.5 : 5}cqw;line-height:1.18;letter-spacing:-0.03em;color:${theme.ink};margin-right:1.15cqw;">${esc(w)}</span>`
  ).join("");
  const html = `<div class="clip mom-scene" id="${id}" data-start="${T}" data-duration="${r(ctx.winL || L)}" data-track-index="${ctx.track}" style="opacity:0;">
  <div class="camo" id="${id}-camo"><div class="cami" id="${id}-cami">
    <div id="${id}-mark" style="opacity:0;position:absolute;left:7.8cqw;top:${land ? 7.3 : 9}cqw;font-weight:900;font-size:${land ? 18.75 : 24}cqw;line-height:0.7;color:${rgba(theme.accent, 0.9)};">“</div>
    <div style="position:absolute;left:7.8cqw;right:7.8cqw;top:${land ? 17.7 : 32}cqw;display:flex;flex-wrap:wrap;">${wordHtml}</div>
    <div id="${id}-attr" style="opacity:0;position:absolute;left:7.9cqw;bottom:${land ? 10.9 : 20}cqw;display:flex;align-items:center;gap:1.05cqw;">
      <div class="${id}-dash" style="width:3.3cqw;height:0.26cqw;background:${theme.accent};transform-origin:left center;"></div>
      <div>
        ${author ? `<div style="font-weight:800;font-size:${land ? 1.56 : 2.6}cqw;color:${theme.ink};letter-spacing:-0.01em;">${esc(author)}</div>` : ""}
        <div class="mono" style="font-size:${land ? 0.83 : 1.6}cqw;letter-spacing:0.14em;color:${rgba(theme.ink, 0.55)};margin-top:0.21cqw;">${esc(role)}</div>
      </div>
    </div>
  </div></div></div>`;
  const s = [
    `tl.fromTo("#${id}-mark",{opacity:0,scale:0.4},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.7)",transformOrigin:"left top"},${r(T + 0.25)});`,
    `tl.fromTo(".${id}-w",{opacity:0,y:22},{opacity:1,y:0,duration:0.34,ease:"power2.out",stagger:${r(per)}},${r(T + 0.6)});`,
    `tl.fromTo("#${id}-attr",{opacity:0,y:40},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + L * 0.62)});`,
    `tl.fromTo(".${id}-dash",{scaleX:0},{scaleX:1,duration:0.5,ease:"expo.out"},${r(T + L * 0.62 + 0.1)});`,
  ];
  return { html, s };
}

function momGallery(scene, ctx, assetA, assetB) {
  const { id, T, L, theme, land } = ctx;
  const lines = breakLines(scene.headline, "Everything you need.");
  const eyebrow = String(scene.eyebrow || scene.purpose || "THE FULL PICTURE").slice(0, 26).toUpperCase();
  const badgeStat = mineStat(scene.emphasis) || mineStat(scene.subtext);
  const badge = String(scene.badge || (badgeStat ? `${badgeStat.pre}${badgeStat.v}${badgeStat.suf}` : String(ctx.brand))).slice(0, 8).toUpperCase();
  const badgeLabel = String(scene.badgeLabel || (badgeStat && badgeStat.l) || scene.kicker || scene.purpose || "SHOWCASE").slice(0, 22).toUpperCase();
  const tile = (inner, cls, extra) => `<div class="${cls}" style="opacity:0;border-radius:0.85cqw;overflow:hidden;border:1px solid ${rgba(theme.ink, 0.14)};${extra || ""}">${inner}</div>`;
  const html = `<div class="clip mom-scene" id="${id}" data-start="${T}" data-duration="${r(ctx.winL || L)}" data-track-index="${ctx.track}" style="opacity:0;">
  <div class="camo" id="${id}-camo"><div class="cami" id="${id}-cami">
    <div id="${id}-head" style="opacity:0;position:absolute;left:5cqw;top:${land ? 6.35 : 8}cqw;">
      <div class="mono" style="font-size:${land ? 0.89 : 1.7}cqw;letter-spacing:0.24em;color:${theme.accent};margin-bottom:0.72cqw;">${esc(eyebrow)}</div>
      <div style="max-width:${land ? 52 : 86}cqw;font-weight:900;font-size:${land ? 4.6 : 6.4}cqw;line-height:0.92;letter-spacing:-0.04em;text-transform:uppercase;color:${theme.ink};">${lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
    </div>
    <div id="${id}-grid" style="position:absolute;left:5cqw;right:5cqw;top:${land ? 18.2 : 30}cqw;${land ? "height:29.2cqw;display:grid;grid-template-columns:1.5fr 1fr;grid-template-rows:1fr 1fr;gap:1.15cqw;" : "bottom:14cqw;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1.6fr 1fr;gap:1.6cqw;"}">
      ${tile(mediaHtml(assetA, theme, "cover", ctx.brand), `${id}-ta`, land ? "grid-row:span 2;" : "grid-column:span 2;")}
      ${tile(mediaHtml(assetB, theme, "cover", ctx.brand), `${id}-tb`, "")}
      ${tile(`<div style="width:100%;height:100%;display:grid;place-items:center;background:${rgba(theme.accent, 0.1)};"><div style="text-align:center;padding:1.25cqw;">
        <div style="font-weight:900;font-size:${land ? 4.4 : 5.4}cqw;line-height:1;color:${theme.accent};letter-spacing:-0.04em;">${esc(badge)}</div>
        <div class="mono" style="font-size:${land ? 0.78 : 1.4}cqw;letter-spacing:0.16em;color:${rgba(theme.ink, 0.6)};margin-top:0.42cqw;">${esc(badgeLabel)}</div>
      </div></div>`, `${id}-tc`, `border-color:${rgba(theme.accent, 0.5)} !important;`)}
    </div>
  </div></div></div>`;
  const s = [
    `tl.fromTo("#${id}-head",{opacity:0,y:50},{opacity:1,y:0,duration:0.5,ease:"back.out(1.4)"},${r(T + 0.25)});`,
    `tl.fromTo(".${id}-ta",{opacity:0,x:-120,y:40},{opacity:1,x:0,y:0,duration:0.5,ease:"back.out(1.3)"},${r(T + 0.55)});`,
    `tl.fromTo(".${id}-tb",{opacity:0,x:120,y:40},{opacity:1,x:0,y:0,duration:0.5,ease:"back.out(1.3)"},${r(T + 0.75)});`,
    `tl.fromTo(".${id}-tc",{opacity:0,x:120,y:40},{opacity:1,x:0,y:0,duration:0.5,ease:"back.out(1.3)"},${r(T + 0.95)});`,
    `tl.fromTo("#${id}-grid",{y:0},{y:-30,duration:${r(Math.max(0.8, L - 1.6))},ease:"sine.inOut"},${r(T + 1.35)});`,
  ];
  return { html, s };
}

function momCta(scene, ctx) {
  const { id, T, L, theme, land, url } = ctx;
  const lines = breakLines(scene.headline, "Start building.");
  const eyebrow = String(scene.eyebrow || scene.purpose || "READY WHEN YOU ARE").slice(0, 30).toUpperCase();
  const cta = String(scene.cta || scene.emphasis || (Array.isArray(scene.onScreenText) && scene.onScreenText[0]) || "GET STARTED").slice(0, 24).toUpperCase();
  const btnInk = inkOn(theme.accent, theme.ink);
  const html = `<div class="clip mom-scene" id="${id}" data-start="${T}" data-duration="${r(ctx.winL || L)}" data-track-index="${ctx.track}" style="opacity:0;">
  <div class="camo" id="${id}-camo"><div class="cami" id="${id}-cami">
    ${streaksHtml(id, theme.accent)}
    <svg viewBox="0 0 600 600" style="position:absolute;left:50%;top:46%;transform:translate(-50%,-50%);width:${land ? 31.25 : 52}cqw;height:${land ? 31.25 : 52}cqw;overflow:visible;" data-layout-allow-occlusion>
      <circle id="${id}-ring" class="draw" pathLength="100" cx="300" cy="300" r="280" fill="none" stroke="${rgba(theme.accent, 0.28)}" stroke-width="2" stroke-linecap="round" transform="rotate(-90 300 300)"/>
      <g id="${id}-burst" opacity="0">${new Array(16).fill(0).map((_, i) => {
        const a = (i / 16) * Math.PI * 2;
        return `<line x1="${r(300 + Math.cos(a) * 70)}" y1="${r(300 + Math.sin(a) * 70)}" x2="${r(300 + Math.cos(a) * 290)}" y2="${r(300 + Math.sin(a) * 290)}" stroke="${theme.accent}" stroke-width="3" stroke-linecap="round"/>`;
      }).join("")}</g>
    </svg>
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;">
      <div id="${id}-eye" class="mono" style="opacity:0;font-size:${land ? 1.04 : 2}cqw;letter-spacing:0.3em;color:${theme.accent};text-transform:uppercase;margin-bottom:0.95cqw;">${esc(eyebrow)}</div>
      <div id="${id}-head" style="opacity:0;max-width:88%;font-weight:900;font-size:${land ? 8.4 : 11}cqw;line-height:0.88;letter-spacing:-0.05em;text-transform:uppercase;color:${theme.ink};text-align:center;">${lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
      <div id="${id}-pill" style="opacity:0;margin-top:2.3cqw;display:flex;align-items:center;gap:0.85cqw;${land ? "" : "flex-direction:column;"}">
        <div style="display:inline-flex;align-items:center;gap:0.72cqw;padding:1.05cqw 2.1cqw;border-radius:999px;background:${theme.accent};color:${btnInk};font-weight:800;font-size:${land ? 1.46 : 2.6}cqw;letter-spacing:0.02em;box-shadow:0 0 3.1cqw ${rgba(theme.accent, 0.5)};">${esc(cta)} <span style="font-size:${land ? 1.56 : 2.8}cqw;">→</span></div>
        <div class="mono" style="font-size:${land ? 1.04 : 1.9}cqw;letter-spacing:0.14em;color:${rgba(theme.ink, 0.7)};">${esc(url)}</div>
      </div>
    </div>
    ${chevronsHtml(`${id}-chl`, theme.accent, land ? "left:25cqw;top:28.1cqw;" : "left:8cqw;top:50cqw;", 4, 1.35)}
    ${chevronsHtml(`${id}-chr`, theme.accent, land ? "left:67.7cqw;top:28.1cqw;" : "left:78cqw;top:50cqw;", 4, 1.35, true)}
  </div></div></div>`;
  const s = []
    .concat(streaksScript(id, T))
    .concat([
      `tl.to("#${id}-ring",{strokeDashoffset:0,duration:${r(Math.min(2.4, L * 0.55))},ease:"power2.inOut"},${r(T + 0.35)});`,
      `tl.fromTo("#${id}-burst",{opacity:0,scale:0.24,svgOrigin:"300 300"},{opacity:1,scale:1,duration:0.5,ease:"expo.out"},${r(T + L * 0.36)});`,
      `tl.to("#${id}-burst",{opacity:0,duration:0.35,ease:"power1.in"},${r(T + L * 0.36 + 0.5)});`,
      `tl.fromTo("#${id}-eye",{opacity:0,y:30},{opacity:1,y:0,duration:0.45,ease:"power2.out"},${r(T + 0.3)});`,
      `tl.fromTo("#${id}-head",{opacity:0,y:80},{opacity:1,y:0,duration:0.6,ease:"back.out(1.4)"},${r(T + 0.5)});`,
      `tl.fromTo("#${id}-pill",{opacity:0,scale:0.5},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.8)"},${r(T + L * 0.4)});`,
    ])
    .concat(chevronsScript(`${id}-chl`, T + 0.8, L)).concat(chevronsScript(`${id}-chr`, T + 0.8, L));
  return { html, s };
}

const BUILDERS = { intro: momIntro, statement: momStatement, feature: momFeature, mobile: momMobile, stats: momStats, quote: momQuote, gallery: momGallery, cta: momCta };

// TEMPLATE VOCABULARY — the closed set of authored scenes this template ships,
// published for the Template Director agent (services/template_director.js).
// `slots` states the SHAPE each field must take; the director casts every
// storyboard beat as one of these types and fills only these slots. `media`
// lists the media slots the type must be given to be renderable.
const TEMPLATE_SCENES = [
  {
    type: "intro", bestFor: "opening title / brand reveal",
    look: "Rotating accent ring + logo badge, huge brand wordmark rising, mono tagline, speed streaks.",
    slots: { brand: "the brand name, 1-2 words", tagline: "one line, max 48 chars" },
    media: ["logo"], mediaRequired: false,
  },
  {
    type: "statement", bestFor: "manifesto, positioning claim, punchy promise",
    look: "Flush-left stacked display lines, one line ignited in the accent colour, giant ghosted /0N number.",
    slots: { lines: "2-4 stacked lines of 1-2 words each", accentLine: "0-based index of the line to ignite", chips: "optional, up to 3 tags, max 18 chars each" },
    media: [],
  },
  {
    type: "feature", bestFor: "a product capability shown on a real desktop screen",
    look: "Left copy column (eyebrow, 2-line headline, body, pill chips) + a browser frame flying in from the right, then a slow push-in.",
    slots: { eyebrow: "max 26 chars", headline: "max 2 short lines", body: "one sentence, max 150 chars", chips: "up to 3 tags, max 18 chars each" },
    media: ["desktop"],
  },
  {
    type: "mobile", bestFor: "a mobile app / on-the-go capability with a tall screen",
    look: "Right-aligned copy + a phone bezel rising from below with reticle brackets.",
    slots: { eyebrow: "max 26 chars", headline: "max 2 short lines", chips: "up to 3 tags, max 18 chars each" },
    media: ["phone"],
  },
  {
    type: "stats", bestFor: "numbers, proof, results",
    look: "The whole frame floods with the accent colour; up to 3 counters count up beside a growing bar chart and a drawing trend line.",
    slots: { kicker: "max 24 chars", headline: "max 2 short lines", stats: "up to 3 of {v: number, suf: '%'|'X'|'K'|'M'|'', l: label max 24 chars}" },
    media: [],
  },
  {
    type: "quote", bestFor: "testimonial, customer voice",
    look: "Giant accent quote mark, the quote revealing word by word, an attribution rule that draws out.",
    slots: { quote: "max 140 chars, verbatim", author: "person's name", role: "role and/or company" },
    media: [],
  },
  {
    type: "gallery", bestFor: "showcase of several visuals, social proof",
    look: "2x2 grid: a tall hero tile, a secondary tile, and an accent badge tile, all panning slowly.",
    slots: { eyebrow: "max 26 chars", headline: "max 2 short lines", badge: "a rating or number, max 8 chars", badgeLabel: "max 22 chars" },
    media: ["photo", "photo"], mediaMin: 1,
  },
  {
    type: "cta", bestFor: "closing call to action",
    look: "Centered ring drawing round the frame, a radial burst, huge headline, accent pill button + url.",
    slots: { eyebrow: "max 30 chars", headline: "max 2 short lines", cta: "button label, max 24 chars" },
    media: [],
  },
];

// Status labels per archetype (the template's kicker defaults).
const STATUS_LABEL = { intro: "NOW LAUNCHING", statement: "MANIFESTO", feature: "FEATURE", mobile: "ON THE GO", stats: "BY THE NUMBERS", quote: "TESTIMONIAL", gallery: "SHOWCASE", cta: "GET STARTED" };

// ---- persistent chrome (the template's HUD + animated backdrop) --------------
function chromeHtml(theme, D, brand, url, count, land) {
  const ink = theme.ink, accent = theme.accent;
  // The template's VectorField: constellation + connectors, rotating arc rings
  // with an orbiting node, a dashed trajectory with a travelling node, plus-marks
  // and an oscilloscope trace. One persistent SVG on the backdrop layer.
  const nodes = [[250, 300], [372, 214], [188, 436], [430, 356], [300, 508]];
  const far = [[1600, 300], [1742, 232], [1682, 430], [1820, 372]];
  const conn = [];
  nodes.forEach((n, i) => nodes.slice(i + 1).forEach((m) => {
    if (Math.hypot(n[0] - m[0], n[1] - m[1]) < 210) conn.push(`<line x1="${n[0]}" y1="${n[1]}" x2="${m[0]}" y2="${m[1]}" stroke="${rgba(ink, 0.16)}" stroke-width="1"/>`);
  }));
  const wavePts = new Array(46).fill(0).map((_, i) => `${1180 + i * 15},${928 + Math.sin(i * 0.5) * 9}`).join(" ");
  const vector = `<svg id="vfield" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0;width:100%;height:100%;">
    <g opacity="0.55">${conn.join("")}
      ${nodes.map((n, i) => `<circle class="vf-node" cx="${n[0]}" cy="${n[1]}" r="${i % 2 ? 3.5 : 2.5}" fill="${i === 0 ? accent : rgba(ink, 0.5)}"/>`).join("")}
      ${far.map((n) => `<circle cx="${n[0]}" cy="${n[1]}" r="2.5" fill="${rgba(ink, 0.4)}"/>`).join("")}
      ${far.slice(0, -1).map((n, i) => `<line x1="${n[0]}" y1="${n[1]}" x2="${far[i + 1][0]}" y2="${far[i + 1][1]}" stroke="${rgba(ink, 0.14)}" stroke-width="1"/>`).join("")}
    </g>
    <g id="vf-rings" opacity="0.8" transform="translate(1700 250)">
      <circle r="92" fill="none" stroke="${rgba(accent, 0.55)}" stroke-width="2" stroke-dasharray="58 30"/>
      <circle r="62" fill="none" stroke="${rgba(ink, 0.22)}" stroke-width="1.5" stroke-dasharray="18 14"/>
      <circle cx="92" cy="0" r="5" fill="${accent}"/>
    </g>
    <path d="M 150 760 Q 720 560 1240 800" fill="none" stroke="${rgba(ink, 0.16)}" stroke-width="1.5" stroke-dasharray="6 9"/>
    <circle id="vf-traveller" cx="150" cy="760" r="6" fill="${accent}" opacity="0.9"/>
    ${[[110, 150], [1810, 150], [960, 116], [110, 940], [1500, 470]].map((p) =>
      `<g stroke="${rgba(ink, 0.28)}" stroke-width="1.5"><line x1="${p[0] - 8}" y1="${p[1]}" x2="${p[0] + 8}" y2="${p[1]}"/><line x1="${p[0]}" y1="${p[1] - 8}" x2="${p[0]}" y2="${p[1] + 8}"/></g>`).join("")}
    <polyline id="vf-wave" points="${wavePts}" fill="none" stroke="${rgba(accent, 0.45)}" stroke-width="2"/>
  </svg>`;
  const marqueeUnit = `${esc(String(brand).toUpperCase())}  ◆  ${esc(url)}`;
  const marqueeLine = new Array(8).fill(marqueeUnit).join("     ◆     ");
  const crop = ["left:0;top:0", "right:0;top:0", "left:0;bottom:0", "right:0;bottom:0"].map((pos) => {
    const h = pos.includes("top") ? "top:0" : "bottom:0", v = pos.includes("left") ? "left:0" : "right:0";
    return `<div style="position:absolute;${pos};width:2.4cqw;height:2.4cqw;">
      <div style="position:absolute;${v};${h};width:2.4cqw;height:3px;background:${rgba(ink, 0.5)};"></div>
      <div style="position:absolute;${v};${h};width:3px;height:2.4cqw;background:${rgba(ink, 0.5)};"></div></div>`;
  }).join("");
  return `
  <div id="backdrop" class="clip" data-start="0" data-duration="__D__" data-track-index="0" data-layout-allow-occlusion style="opacity:0;background:${theme.ground};">
    <div id="bd-zoom" style="position:absolute;inset:0;">
      <div id="dotgrid" style="position:absolute;inset:-2.4cqw;opacity:0.5;background-image:radial-gradient(${rgba(ink, 0.5)} 1.3px, transparent 1.3px);background-size:2.4cqw 2.4cqw;"></div>
      ${vector}
    </div>
    <div style="position:absolute;inset:0;pointer-events:none;background:radial-gradient(120% 90% at 50% 42%, transparent 40%, ${rgba(theme.ground, 0.85)} 100%);"></div>
  </div>
  <div id="hud" class="clip" data-start="0" data-duration="__D__" data-track-index="40" data-layout-allow-occlusion style="opacity:0;background:none;">
    <div style="position:absolute;inset:2.8cqw;pointer-events:none;">${crop}</div>
    <div style="position:absolute;top:1.25cqw;left:0;right:0;height:1.15cqw;overflow:hidden;display:flex;align-items:center;">
      <div id="marquee" class="mono" style="white-space:nowrap;font-size:0.68cqw;letter-spacing:0.24em;color:${rgba(ink, 0.32)};text-transform:uppercase;">${marqueeLine}   ${marqueeLine}</div>
    </div>
    <div style="position:absolute;left:5cqw;top:3.1cqw;display:flex;align-items:center;gap:0.52cqw;">
      <span id="status-dot" style="width:0.47cqw;height:0.47cqw;border-radius:999px;background:${accent};box-shadow:0 0 0.52cqw ${accent};"></span>
      <span id="status-label" class="mono" style="font-size:0.73cqw;letter-spacing:0.22em;color:${rgba(ink, 0.65)};text-transform:uppercase;">NOW LAUNCHING</span>
    </div>
  </div>
  <div id="caps" class="clip" data-start="0" data-duration="__D__" data-track-index="41" style="background:none;"><div id="cap-pill"><div id="cap-text"></div></div></div>`;
}

function styleBlock(theme, land) {
  const portrait = land ? "" : `
  #cap-pill { max-width:86%; padding:1.3cqw 3cqw; }
  #cap-text { font-size:2.3cqw; }
  #marquee { font-size:1.4cqw; }
  #status-label { font-size:1.5cqw; }`;
  return `${theme.fontFace}
  * { box-sizing:border-box; margin:0; padding:0; }
  html, body { width:100%; height:100%; overflow:hidden; background:${theme.ground}; }
  #root { position:relative; overflow:hidden; isolation:isolate; background:${theme.ground};
    container-type:size; color:${theme.ink}; font-family:${theme.displayStack}; }
  .clip { position:absolute; top:0; left:0; width:100%; height:100%; overflow:hidden; }
  .mom-scene { background:none; }
  .camo, .cami { position:absolute; inset:0; will-change:transform, filter, opacity; }
  .mono { font-family:${theme.monoStack}; }
  .draw { stroke-dasharray:100; stroke-dashoffset:100; }
  #caps { position:absolute; inset:0; display:flex; justify-content:center; align-items:flex-end; padding-bottom:7%; z-index:50; pointer-events:none; }
  #cap-pill { max-width:74%; height:fit-content; flex:0 0 auto; text-align:center; padding:0.8cqw 2cqw; border-radius:0.42cqw; opacity:0; background:${rgba("#0C0B0A", 0.85)}; border:1px solid ${rgba(theme.accent, 0.45)}; }
  #cap-text { font-family:${theme.monoStack}; font-weight:500; font-size:1.3cqw; line-height:1.4; color:${theme.ink}; }
  ${portrait}`;
}

// ---- MAIN --------------------------------------------------------------------
// Media demand per archetype, DERIVED from TEMPLATE_SCENES above rather than
// restated — momentum is the one composer that fills its slots by hand instead
// of through template_engine, so a second hand-kept list would be free to drift
// from what the Template Director casts against.
const MOM_SLOTS = Object.fromEntries(TEMPLATE_SCENES.map((t) => [t.type, t.media || []]));

function buildComposition({ storyboard, dims, framePack, captionCues, assets, brandSkin, templatePlan } = {}) {
  const theme = momentumTheme(brandSkin);
  const sb = storyboard || {};
  const W = (dims && dims.width) || 1920, H = (dims && dims.height) || 1080;
  const land = W >= H;
  // Same display-copy adapter the shared engine applies: the script emits
  // `onScreenText`, the builders read `headline`, and without this a scene falls
  // back to pack boilerplate while the narrator reads the real script.
  const scenes = (Array.isArray(sb.scenes) && sb.scenes.length
    ? fitScenes(sb.scenes, MAX_CLIPS)          // merge past the ceiling, never truncate (scene_fit.js)
    : [{ id: "s1", start: 0, duration: 4, kind: "hook", headline: sb.title || "MOMENTUM" }]).map(withDisplayCopy);
  const D = r(sb.durationSec || scenes.reduce((a, s) => Math.max(a, (Number(s.start) || 0) + (Number(s.duration) || 0)), 0) || 12);

  // Brand + url from the film itself (site the assets came from beats lore).
  const brandHost = (Array.isArray(assets) ? assets : [])
    .filter((a) => a && (a.source === "website" || a.source === "website-image") && a.sourceUrl)
    .map((a) => { try { return new URL(a.sourceUrl).hostname.replace(/^www\./, ""); } catch { return null; } })
    .find(Boolean);
  const brand = String(sb.brand || sb.title || (brandHost ? brandHost.split(".")[0] : "") || "MOMENTUM").slice(0, 18);
  const url = String(sb.url || brandHost || `${brand.toLowerCase().replace(/[^a-z0-9]/g, "")}.app`).slice(0, 40);

  // Asset pools: a logo (Intro badge), scene-pinned plates (director placement
  // wins), then best-first for Feature/Mobile/Gallery slots.
  const images = (Array.isArray(assets) ? assets : [])
    .filter(plateOk)
    .sort((a, b) => ((b.source === "website") - (a.source === "website"))
      || ((isShot(b) ? 1 : 0) - (isShot(a) ? 1 : 0))
      || (Number(b.cdScore) || 0) - (Number(a.cdScore) || 0));
  const logoAsset = (Array.isArray(assets) ? assets : []).find(isLogo) || null;
  const byScene = new Map();
  const pool = [];
  for (const a of images) {
    if (a === logoAsset) continue;
    const sid = a.sceneId != null ? String(a.sceneId) : null;
    if (sid && !byScene.has(sid)) byScene.set(sid, a);
    else pool.push(a);
  }
  let pooli = 0;
  // WHICH PICTURE BELONGS ON *THIS* BEAT. The sort above is entirely
  // FILM-GLOBAL — site-ness, screenshot-ness, cdScore — so every slot in the
  // film popped the next item off that one list and what the beat was SAYING
  // never came into it. On a website job every capture is written
  // site_0.png…site_5.png with the same boilerplate alt, so the candidates tie
  // and arrival order breaks the tie. Measured on the fixture film once the
  // director's scene pins are gone (the ordinary case on a blog or topic film,
  // where nothing pinned a shot to a scene): the "One workspace" beat drew a
  // grid of design tools, "Shared context" drew the testimonial logo wall, and
  // the capture whose vision text literally reads "start with design context,
  // build with consistency" was never placed at all — 3 of 4 media beats shared
  // a word with the line they played under, now 4 of 4.
  // `scene` is optional so every other call site is unchanged, and when nothing
  // in the pool is even loosely about the beat this falls straight back to the
  // old best-first walk — it can only improve on the previous pick, never
  // starve a slot.
  const takePool = (pred, scene = null) => {
    const onTopic = scene ? pickForScene(pool, scene, { pred }) : null;
    const idx = onTopic ? pool.indexOf(onTopic) : pool.findIndex((a, i) => i >= pooli && (!pred || pred(a)));
    if (idx < 0) return null;
    const a = pool.splice(idx, 1)[0];
    return a;
  };

  // Template camera program: whip/zoom + direction, indexed by the entering scene.
  const CAM_KIND = ["zoom", "whip", "whip", "zoom", "whip", "zoom", "whip", "whip"];
  const CAM_DIR = [0, 1, -1, 0, 1, 0, -1, 1];
  const DRIFT = [-1, 1, -1, 1, 1, -1, 1, -1];

  const scriptStart = (i) => scenes.slice(0, i).reduce((a, s) => a + (Number(s.duration) || 0), 0);
  const bodyParts = [];
  const sceneScripts = [];
  // The Template Director's cast (services/template_director.js) decides which
  // authored scene each beat becomes and what fills its slots. Absent or
  // unusable, the deterministic router below makes the same call locally.
  const cast = (templatePlan && templatePlan.byScene) || null;
  const mediaPlan = [];
  scenes.forEach((rawScene, i) => {
    const T = r(rawScene.start != null ? rawScene.start : scriptStart(i));
    const L = r(rawScene.duration || 4);
    const sid = rawScene.id != null ? String(rawScene.id) : `s${i + 1}`;
    const pinned = byScene.get(sid) || null;
    const castEntry = cast && cast[sid] && BUILDERS[cast[sid].type] ? cast[sid] : null;
    // Cast slot copy overlays the scene's own fields (director wins; the scene's
    // text is what the director shaped, so nothing is invented here).
    const scene = castEntry && castEntry.slots ? { ...rawScene, ...castEntry.slots } : rawScene;
    let arch, asset = null, assetB = null;
    if (castEntry) {
      arch = castEntry.type;
      const castAssets = (castEntry.assets || []).filter((a) => a && a.path);
      // A pinned shot lives outside `pool`, so the cast branch could never reach
      // it — the screenshot director's topic-matched page shot was silently
      // orphaned on every cast scene, exactly as on the template_engine path.
      if (pinned && !castAssets.some((x) => x === pinned || x.path === pinned.path)) castAssets.unshift(pinned);
      asset = castAssets[0] || null;
      assetB = castAssets[1] || null;
      if (arch === "intro" && !asset) asset = logoAsset;
    } else {
      arch = momArchetype(scene, i, scenes.length, pinned, pool.length - pooli);
      // Fill the media slot: pinned first, else pool (portrait shot → phone,
      // screenshots → browser, photos → gallery tiles).
      asset = pinned;
      if (arch === "feature" && !asset) asset = takePool((a) => !isPortraitAsset(a), scene);
      if (arch === "mobile" && !asset) asset = takePool(isPortraitAsset, scene);
      // Only the tall hero tile picks on topic; the second stays in rank order,
      // so one gallery beat cannot claim both of the film's best matches and
      // leave a later beat that is actually about one of them with nothing.
      if (arch === "gallery") { asset = pinned || takePool(null, scene); assetB = takePool(); }
      if (arch === "intro") asset = logoAsset;
      if (arch === "feature" && !asset) arch = statementLines(scene) ? "statement" : "quote";
    }
    const kick = String(scene.kicker || scene.purpose || STATUS_LABEL[arch] || "").slice(0, 26).toUpperCase() || STATUS_LABEL[arch];
    // The LAST clip's window extends past the timeline end: the framework
    // windows clips out at data-start+data-duration, so an exact-D boundary
    // rendered the film's final frame black.
    const winL = i === scenes.length - 1 ? L + 0.5 : L;
    const ctx = { id: `s${i + 1}`, T, L, winL, track: 2 + i, dims: { width: W, height: H }, land, theme, i, count: scenes.length, brand, url };
    const built = (BUILDERS[arch] || momStatement)(scene, ctx, asset, assetB);
    // Stamp this clip's media demand/coverage so a hole is countable from the
    // rendered DOM — an unfilled slot draws a styled panel, never a missing
    // <img>, so nothing downstream can otherwise tell design from a gap.
    const need = MOM_SLOTS[arch] || [];
    const filledCount = [asset, assetB].filter(Boolean).slice(0, need.length).length;
    mediaPlan.push({ sceneIndex: i, sceneId: sid, sceneType: arch, need, filled: filledCount });
    bodyParts.push(built.html.replace(
      /^(\s*<div class="clip mom-scene")/,
      `$1 data-scene-type="${arch}" data-media-demand="${need.length}" data-media-filled="${filledCount}" data-media-kinds="${need.join(",")}"`,
    ));
    sceneScripts.push(built.s.join("\n  "));
    // Camera rig: entrance whip/zoom with motion blur on the outer layer, the
    // continuous push-in + drift on the inner layer; exit mirrors the NEXT
    // boundary's kind/dir so both sides of the cut move the same way.
    const eK = CAM_KIND[i % CAM_KIND.length], eD = CAM_DIR[i % CAM_DIR.length] || 1;
    const nx = (i + 1) % scenes.length;
    const xK = CAM_KIND[nx % CAM_KIND.length], xD = CAM_DIR[nx % CAM_DIR.length] || 1;
    const dr = DRIFT[i % 8];
    const inD = r(Math.min(0.55, L * 0.14)), outD = r(Math.min(0.5, L * 0.13));
    sceneScripts.push(`tl.fromTo("#${ctx.id}",{opacity:0},{opacity:1,duration:0.3,ease:"none"},${T});`);
    if (i > 0 || scenes.length === 1) {
      sceneScripts.push(eK === "whip"
        ? `tl.fromTo("#${ctx.id}-camo",{x:${r(-eD * W * 0.62)},filter:"blur(26px)"},{x:0,filter:"blur(0px)",duration:${inD},ease:"expo.out"},${T});`
        : `tl.fromTo("#${ctx.id}-camo",{scale:1.26,filter:"blur(20px)"},{scale:1,filter:"blur(0px)",duration:${inD},ease:"expo.out"},${T});`);
    }
    if (i < scenes.length - 1) {
      sceneScripts.push(xK === "whip"
        ? `tl.to("#${ctx.id}-camo",{x:${r(xD * W * 0.62)},filter:"blur(26px)",duration:${outD},ease:"expo.in"},${r(T + L - outD)});`
        : `tl.to("#${ctx.id}-camo",{scale:1.28,filter:"blur(20px)",duration:${outD},ease:"expo.in"},${r(T + L - outD)});`);
    }
    sceneScripts.push(`tl.fromTo("#${ctx.id}-cami",{x:${r(-dr * 15)},y:${r((i % 2 ? 1 : -1) * -6)}},{x:${r(dr * 15)},y:${r((i % 2 ? 1 : -1) * 6)},duration:${r(L)},ease:"none"},${T});`);
    sceneScripts.push(`tl.fromTo("#${ctx.id}-cami",{scale:1},{scale:1.06,duration:${r(L)},ease:"sine.inOut"},${T});`);
    // HUD live status label at this boundary.
    sceneScripts.push(`tl.set("#status-label",{textContent:${JSON.stringify(kick)}},${i === 0 ? 0 : T});`);
    if (i < scenes.length - 1) sceneScripts.push(`kill("#${ctx.id}",${r(T + L)});`);
  });

  const cues = (Array.isArray(captionCues) ? captionCues : [])
    .filter((c) => c && (c.text != null))
    .map((c) => [r(c.start != null ? c.start : c.startSec || 0), r(c.end != null ? c.end : (c.start || 0) + 2), String(c.text)]);

  // Chrome windows extend 0.5s past D too — same final-frame boundary guard.
  const chrome = chromeHtml(theme, D, brand, url, scenes.length, land).replace(/__D__/g, String(r(D + 0.5)));

  const script = `(function(){
  var D=${D};
  var tl=gsap.timeline({paused:true});
  var $=function(s){return document.querySelector(s);};
  function reps(t,c){return Math.max(0,Math.floor(t/c)-1);}
  function kill(id,t){tl.set(id,{opacity:0},t);}
  function countTxt(sel,to,at,dur,pre,suf,f){var o={v:0};tl.to(o,{v:to*f,duration:dur,ease:"expo.out",snap:{v:1},onUpdate:function(){var e=$(sel);if(e)e.textContent=pre+(f>1?(Math.round(o.v)/f).toFixed(1):Math.round(o.v))+suf;}},at);}

  // Persistent backdrop: drifting dot grid, breathing zoom, vector-field life.
  tl.fromTo("#backdrop",{opacity:0},{opacity:1,duration:0.6},0);
  tl.fromTo("#dotgrid",{backgroundPosition:"0cqw 0cqw"},{backgroundPosition:"-24cqw -9.6cqw",duration:D,ease:"none"},0);
  tl.fromTo("#bd-zoom",{scale:1},{scale:1.05,duration:Math.max(6,D/2),ease:"sine.inOut",yoyo:true,repeat:reps(D,Math.max(6,D/2)),transformOrigin:"center center"},0);
  tl.to("#vf-rings",{rotation:${r(22 * D)},duration:D,ease:"none",svgOrigin:"1700 250"},0);
  tl.to("#vf-traveller",{keyframes:[{attr:{cx:720,cy:660}},{attr:{cx:1240,cy:800}}],duration:3.4,ease:"sine.inOut",yoyo:true,repeat:reps(D,3.4)},0);
  tl.to("#vf-wave",{x:-90,duration:2.2,ease:"sine.inOut",yoyo:true,repeat:reps(D,2.2)},0);
  tl.to(".vf-node",{y:6,duration:1.6,ease:"sine.inOut",yoyo:true,repeat:reps(D,1.6),stagger:0.3},0);

  // Persistent HUD: marquee scroll, blinking status.
  tl.fromTo("#hud",{opacity:0},{opacity:1,duration:0.5},0.2);
  tl.fromTo("#marquee",{xPercent:0},{xPercent:-50,duration:${r(Math.max(8, D))},ease:"none"},0);
  tl.to("#status-dot",{opacity:0.3,duration:0.45,ease:"sine.inOut",yoyo:true,repeat:reps(D,0.45)},0);

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
    `<style>`, styleBlock(theme, land), `</style>`,
    `</head>`, `<body>`,
    `<div id="root" class="composition" data-composition-id="vid" data-width="${W}" data-height="${H}" data-start="0" data-duration="${D}" style="width:${W}px;height:${H}px;">`,
    chrome,
    bodyParts.join("\n"),
    `</div>`,
    `<script>`, script, `</script>`,
    `</body>`, `</html>`,
  ].join("\n");

  const metaJson = JSON.stringify({ compositionId: "vid", width: W, height: H, fps: (dims && dims.fps) || 30, duration: D });
  const totals = mediaPlan.reduce((t, p) => {
    t.demand += p.need.length; t.filled += p.filled;
    for (const k of p.need) t.byKind[k] = (t.byKind[k] || 0) + 1;
    return t;
  }, { demand: 0, filled: 0, empty: 0, byKind: {}, byFill: {} });
  totals.empty = Math.max(0, totals.demand - totals.filled);
  const holes = mediaPlan.flatMap((p) => p.need.slice(p.filled).map((kind, n) => ({
    sceneId: p.sceneId, sceneIndex: p.sceneIndex, sceneType: p.sceneType,
    slotIndex: p.filled + n, kind,
  })));
  return { indexHtml, metaJson, mediaPlan: { plan: mediaPlan, totals, holes } };
}

// Momentum fills its slots by hand rather than through template_engine, so the
// only drift-proof way to report its demand is to run the very same pass and
// keep just the manifest. Composition is pure string building (no I/O), so the
// discarded HTML costs a few ms and buys a guarantee the numbers are real.
function planMedia(opts) { return buildComposition(opts).mediaPlan; }

module.exports = { buildComposition, planMedia, TEMPLATE_SCENES };
