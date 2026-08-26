// SHOWCASE composer — a faithful native GSAP port of the "SHOWCASE" annotated
// product-tour template (showcase-film.jsx, from the user's template zip).
// The pack `showcase` (manifest renderer:"showcase") routes here from
// attemptLlmComposition, exactly like momentum/blueprint/genesis — so selecting
// the template gives THE TEMPLATE: its seven authored scene types (Intro hero
// browser, Tour split with zoom + annotation, Detail multi-callout, Mobile phone
// bezel, Montage six-tile wall, Proof counter cards, CTA logo + pill), its
// animated blob backdrop with paper planes and birds, and its drawn annotation
// arrows, numbered callouts, pulsing highlights and moving cursor.
//
// Why this template matters here: it is the most SCREENSHOT-FORWARD of the set —
// every scene is built around a real capture in a browser or phone frame. It
// pairs directly with topic_shots.js, which now supplies real on-topic website
// captures even for films that have no website of their own.
//
// Engineering contract (identical to the other dedicated composers): one paused
// GSAP timeline registered as window.__timelines["vid"]; direct-child .clip
// scenes on disjoint tracks with a hard opacity:0 kill at each scene end; the
// LAST clip's window extended past the timeline end (an exact-D boundary renders
// the final frame black); hidden state is opacity:0 ONLY (every from-state lives
// in gsap.fromTo); finite repeats so a seek never lands mid-infinite-tween;
// pathLength=100 on every draw-on; counters driven by seeked onUpdate proxies.
// Deterministic: every per-frame value is a pure function of tl.time().

const { fontFaceCss } = require("../fonts/pack_fonts");
// Shared script->display-copy adapter: the script emits `onScreenText`, the
// builders read `headline`. Without it a scene falls back to pack boilerplate
// while the narrator reads the real script (the COPY LAW).
const { withDisplayCopy } = require("./template_engine");
// One implementation of "which picture belongs on this beat", shared with every
// other renderer — see the wiring note on takePool below.
const { pickForScene } = require("./scene_match");
const { fitScenes, MAX_CLIPS } = require("./scene_fit");

const GSAP_CDN = "https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js";
const DISPLAY = "Space Grotesk";   // the template's own display face (bundled)
const MONO = "JetBrains Mono";     // the template's own mono face (bundled)

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
function inkOn(bg) { return lum(bg) > 0.6 ? "#131722" : "#FFFFFF"; }

// Showcase identity + brand adaptivity: the accent recolours to the brand (the
// template's own Accent tweak). The sheet stays light — this template's whole
// look is a bright product-tour surface, and a dark ground would break the
// device frames, the paper planes and the annotation ink together.
function showcaseTheme(brandSkin) {
  const skin = brandSkin || {};
  const accent = /^#[0-9a-f]{3,8}$/i.test(String((skin.accents && skin.accents[0]) || "")) ? skin.accents[0] : "#2F6BFF";
  return {
    accent,
    bg: "#EEF1F7", panel: "#FFFFFF", ink: "#131722",
    sub: "#5B6472", line: "#D9DEE8", mark: "#FFC53D",
  };
}

const isShot = (a) => {
  const s = String((a && a.source) || "").toLowerCase(), k = String((a && a.kind) || "").toLowerCase();
  return s === "website" || s === "screenshot" || k === "screenshot" || /screenshot|peekshot/.test(s);
};
const isLogo = (a) => a && (a.kind === "logo" || /logo/i.test(String(a.alt || "")));
const ratioOf = (a) => (a && Number(a.ratio) > 0 ? Number(a.ratio) : (a && a.width && a.height ? a.width / a.height : 0));
const isPortraitAsset = (a) => { const rt = ratioOf(a); return rt > 0 && rt < 0.9; };
const plateOk = (a) => a && a.path && String(a.type) !== "video" && !/\.svg($|\?)/i.test(String(a.path));

function lines(text, fallback) {
  const t = String(text || fallback || "").trim();
  if (!t) return [String(fallback || "")];
  if (/[|\n]/.test(t)) return t.split(/[|\n]/).map((x) => x.trim()).filter(Boolean);
  const w = t.split(/\s+/);
  if (w.length < 4) return [t];
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
  return list.slice(0, n).map(String);
}
function fit(text, max) {
  const t = String(text || "").trim();
  if (t.length <= max) return t;
  let out = "";
  for (const w of t.split(/\s+/)) { if ((out + " " + w).trim().length > max) break; out = (out + " " + w).trim(); }
  return out || t.slice(0, max);
}
function statsOf(scene, n) {
  const raw = Array.isArray(scene.stats) ? scene.stats : [];
  const out = [];
  for (const s of raw) {
    if (!s) continue;
    const v = Number(s.v != null ? s.v : s.value);
    if (!isFinite(v)) continue;
    out.push({ v, suf: String(s.suf || s.suffix || ""), l: String(s.l || s.label || "").toUpperCase().slice(0, 22) });
    if (out.length >= n) break;
  }
  return out;
}

// ---- media slots per scene type ----------------------------------------------
// The engine's vocabulary: "desktop" wants a landscape capture (browser chrome),
// "phone" a portrait one (device bezel), "photo" anything.
const SHOW_SLOTS = {
  intro: ["desktop"],
  tour: ["desktop"],
  detail: ["desktop"],
  mobile: ["phone"],
  montage: ["desktop", "photo", "desktop", "photo", "desktop", "photo"],
  proof: [],
  cta: [],
};

// Published vocabulary for the Template Director.
const TEMPLATE_SCENES = {
  intro: { bestFor: "the opening — a big headline over the hero screenshot in a browser frame", slots: { headline: "1-2 short lines", eyebrow: "max 26 chars", kicker: "max 18 chars" }, media: ["desktop"] },
  tour: { bestFor: "a feature explained beside its screenshot, with an arrow and callout", slots: { headline: "1-2 short lines", body: "one sentence, max 120 chars", callout: "max 22 chars", eyebrow: "max 26 chars" }, media: ["desktop"] },
  detail: { bestFor: "one screenshot with three numbered callouts drawn onto it", slots: { headline: "one line, max 46 chars", items: "2-3 callout labels, max 22 chars each" }, media: ["desktop"] },
  mobile: { bestFor: "the product on a phone, headline set right", slots: { headline: "1-2 short lines", eyebrow: "max 26 chars", callout: "max 22 chars" }, media: ["phone"] },
  montage: { bestFor: "everything at once — a six-tile wall of screenshots", slots: { headline: "one line, max 44 chars" }, media: ["desktop", "photo", "desktop", "photo", "desktop", "photo"] },
  proof: { bestFor: "two or three counting metrics on cards", slots: { headline: "one line, max 40 chars", stats: "2-3 of {v:number, suf:'%'|'K+'|'★', l:label}" }, media: [] },
  cta: { bestFor: "the closing ask — logo, big line, accent pill", slots: { headline: "1-2 short lines", cta: "button label, max 20 chars" }, media: [] },
};

// Deterministic router (used when the Template Director is off / a scene uncast).
function showArchetype(scene, i, total, pinned, poolLeft) {
  const k = String(scene.kind || "").toLowerCase();
  const p = String(scene.purpose || "").toLowerCase();
  if (i === 0 || k === "hook" || k === "title") return "intro";
  if (i === total - 1 || k === "cta" || p === "cta") return "cta";
  if (k === "stat" || k === "chart" || statsOf(scene, 1).length) return "proof";
  if (pinned && isPortraitAsset(pinned)) return "mobile";
  // A deep pool is itself reason enough for the montage: requiring a keyword too
  // meant a film holding 11 captures and plain headlines never reached the one
  // scene type that shows several at once.
  if (poolLeft >= 4 && (/gallery|showcase|everything|all|suite/.test(`${k} ${p} ${scene.headline || ""}`) || poolLeft >= 5)) return "montage";
  if (bullets(scene, 3).length >= 3 && (pinned || poolLeft >= 1)) return "detail";
  if (pinned || poolLeft >= 1) return "tour";
  return "proof";
}

// ---- shared chrome pieces -----------------------------------------------------
// Media box: a real asset, or the template's own dashed "drop image" plate. An
// unfilled slot must still LOOK designed — but it is stamped so media_fill can
// count it as a hole from the DOM.
function mediaBox(asset, kind, theme, label) {
  if (asset && asset.path) {
    return `<img src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" data-media-slot="${esc(kind)}" data-media-fill="asset" `
      + `style="width:100%;height:100%;object-fit:${kind === "logo" ? "contain" : "cover"};object-position:top center;display:block;">`;
  }
  const lbl = label || ({ desktop: "DESKTOP SCREENSHOT", phone: "PHONE SCREEN", photo: "PRODUCT PHOTO", logo: "LOGO" }[kind] || "SCREENSHOT");
  return `<div data-media-slot="${esc(kind)}" data-media-fill="empty" style="width:100%;height:100%;position:relative;`
    + `background:repeating-linear-gradient(135deg,${rgba(theme.ink, 0.045)} 0 13px,${rgba(theme.ink, 0.02)} 13px 26px);`
    + `display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;">`
    + `<div style="width:42px;height:42px;border-radius:11px;border:2px dashed ${rgba(theme.accent, 0.8)};display:grid;place-items:center;color:${theme.accent};font-size:26px;">+</div>`
    + `<div style="font-family:'${MONO}',ui-monospace,monospace;font-size:13px;letter-spacing:0.12em;color:${theme.sub};text-transform:uppercase;">${esc(lbl)}</div>`
    + `</div>`;
}

function browserFrame(inner, theme, url, id) {
  return `<div style="width:100%;height:100%;border-radius:16px;overflow:hidden;background:${theme.panel};border:1px solid ${theme.line};`
    + `box-shadow:0 40px 90px ${rgba(theme.ink, 0.18)};display:flex;flex-direction:column;position:relative;">`
    + `<div style="height:46px;flex-shrink:0;background:#F6F8FC;border-bottom:1px solid ${theme.line};display:flex;align-items:center;gap:8px;padding:0 18px;">`
    + ["#FF5F57", "#FEBC2E", "#28C840"].map((c) => `<span style="width:12px;height:12px;border-radius:12px;background:${c};"></span>`).join("")
    + `<div style="margin-left:14px;flex:1;max-width:420px;height:26px;border-radius:13px;background:#EAEEF5;display:flex;align-items:center;padding:0 14px;`
    + `font-family:'${MONO}',ui-monospace,monospace;font-size:12px;color:${theme.sub};">${esc(url)}</div></div>`
    + `<div id="${id}" style="flex:1;min-height:0;position:relative;overflow:hidden;">${inner}</div></div>`;
}

function phoneFrame(inner, theme) {
  return `<div style="width:100%;height:100%;border-radius:46px;padding:12px;background:${theme.ink};box-shadow:0 40px 90px ${rgba(theme.ink, 0.28)};position:relative;">`
    + `<div style="position:absolute;top:24px;left:50%;transform:translateX(-50%);width:100px;height:26px;border-radius:26px;background:${theme.ink};z-index:3;"></div>`
    + `<div style="width:100%;height:100%;border-radius:34px;overflow:hidden;background:${theme.panel};position:relative;">${inner}</div></div>`;
}

// Numbered callout bubble.
function callout(id, x, y, num, text, theme, alignRight) {
  return `<div id="${id}" style="opacity:0;position:absolute;left:${r(x)}px;top:${r(y)}px;${alignRight ? "transform:translateX(-100%);" : ""}`
    + `display:flex;align-items:center;gap:10px;padding:10px 16px 10px 10px;background:${theme.ink};color:#fff;border-radius:12px;`
    + `box-shadow:0 10px 30px ${rgba(theme.ink, 0.3)};white-space:nowrap;">`
    + `<span style="width:26px;height:26px;border-radius:8px;background:${theme.accent};display:grid;place-items:center;`
    + `font-family:'${MONO}',ui-monospace,monospace;font-weight:700;font-size:14px;color:${inkOn(theme.accent)};">${esc(num)}</span>`
    + `<span style="font-family:'${DISPLAY}',system-ui,sans-serif;font-weight:600;font-size:20px;">${esc(text)}</span></div>`;
}

// Curved annotation arrow that draws itself. pathLength=100 so the dash maths is
// resolution-independent and a seek lands mid-draw deterministically.
function arrowSvg(id, from, to, bend, color, W, H) {
  const mx = (from[0] + to[0]) / 2, my = (from[1] + to[1]) / 2;
  const dx = to[0] - from[0], dy = to[1] - from[1], len = Math.hypot(dx, dy) || 1;
  const cx = mx - (dy / len) * bend, cy = my + (dx / len) * bend;
  const ang = Math.atan2(to[1] - cy, to[0] - cx) * 180 / Math.PI;
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible;">`
    + `<path id="${id}-p" pathLength="100" d="M${r(from[0])} ${r(from[1])} Q ${r(cx)} ${r(cy)} ${r(to[0])} ${r(to[1])}" fill="none" `
    + `stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-dasharray="100" stroke-dashoffset="100"></path>`
    + `<g id="${id}-h" transform="translate(${r(to[0])} ${r(to[1])}) rotate(${r(ang)})" opacity="0">`
    + `<path d="M2 0 L-20 -12 L-13 0 L-20 12 Z" fill="${color}"></path></g></svg>`;
}

// ---- scene builders -----------------------------------------------------------
// Each returns { html, s } — html is the .clip element, s the timeline lines.
function sceneShell(ctx, inner, extra) {
  const { id, T, winL, track, theme } = ctx;
  return `<div class="clip show-scene" id="${id}" data-start="${r(T)}" data-duration="${r(winL)}" data-track-index="${track}" `
    + `style="position:absolute;inset:0;opacity:0;background:${theme.bg};font-family:'${DISPLAY}',system-ui,sans-serif;overflow:hidden;">`
    + `<div id="${id}-cam" style="position:absolute;inset:0;">${inner}</div>${extra || ""}</div>`;
}

function headBlock(id, ls, theme, size, align, extraCss) {
  return `<div id="${id}" style="opacity:0;${extraCss || ""}text-align:${align || "left"};">`
    + ls.map((l) => `<div style="font-family:'${DISPLAY}',system-ui,sans-serif;font-weight:700;font-size:${size}px;line-height:0.97;letter-spacing:-0.03em;color:${theme.ink};">${esc(l)}</div>`).join("")
    + `</div>`;
}

function eyebrow(text, theme, size) {
  return `<div style="font-family:'${MONO}',ui-monospace,monospace;font-size:${size || 18}px;letter-spacing:0.22em;color:${theme.accent};text-transform:uppercase;margin-bottom:14px;">${esc(text)}</div>`;
}

function buildIntro(scene, ctx, asset) {
  const { id, T, L, theme, W, H, url, land } = ctx;
  const ls = lines(scene.headline, "See how it works.").slice(0, 2);
  const eb = fit(scene.eyebrow || scene.kicker || "A guided tour", 26).toUpperCase();
  const shotW = land ? W * 0.58 : W * 0.86, shotH = land ? H * 0.55 : H * 0.34;
  const inner =
    `<div id="${id}-head" style="opacity:0;position:absolute;left:0;right:0;top:${r(H * 0.13)}px;text-align:center;">`
    + eyebrow(eb, theme) + headBlock(`${id}-h2`, ls, theme, land ? 104 : 76, "center").replace('opacity:0;', '')
    + `</div>`
    + `<div id="${id}-shot" style="opacity:0;position:absolute;left:50%;top:${r(H * 0.37)}px;width:${r(shotW)}px;height:${r(shotH)}px;transform:translateX(-50%);">`
    + browserFrame(mediaBox(asset, "desktop", theme, "HERO SCREENSHOT"), theme, url, `${id}-shotinner`) + `</div>`;
  const s = [
    `tl.fromTo("#${id}-head",{opacity:0,y:44},{opacity:1,y:0,duration:0.5,ease:"back.out(1.4)"},${r(T + L * 0.05)});`,
    `tl.fromTo("#${id}-shot",{opacity:0,y:${r(H * 0.4)},scale:0.94},{opacity:1,y:0,scale:1,duration:0.75,ease:"back.out(1.2)"},${r(T + L * 0.16)});`,
  ];
  return { html: sceneShell(ctx, inner), s };
}

function buildTour(scene, ctx, asset) {
  const { id, T, L, theme, W, H, url, land } = ctx;
  const ls = lines(scene.headline, "One view, zero noise.").slice(0, 2);
  const body = fit(scene.body || scene.subtext || "", 120);
  const eb = fit(scene.eyebrow || scene.kicker || "The dashboard", 26).toUpperCase();
  const cal = fit(scene.callout || bullets(scene, 1)[0] || "Live metrics", 22);
  const colW = land ? W * 0.30 : W * 0.84;
  const shotW = land ? W * 0.52 : W * 0.86, shotH = land ? H * 0.57 : H * 0.34;
  const inner =
    `<div id="${id}-head" style="opacity:0;position:absolute;left:${r(land ? W * 0.05 : W * 0.08)}px;top:${r(land ? H * 0.18 : H * 0.10)}px;width:${r(colW)}px;">`
    + eyebrow(eb, theme, 16) + headBlock(`${id}-h2`, ls, theme, land ? 72 : 60, "left").replace('opacity:0;', '')
    + (body ? `<div style="margin-top:22px;font-family:'${DISPLAY}',system-ui,sans-serif;font-size:22px;line-height:1.5;color:${theme.sub};">${esc(body)}</div>` : "")
    + `</div>`
    + `<div id="${id}-shot" style="opacity:0;position:absolute;${land ? `right:${r(W * 0.045)}px;top:${r(H * 0.185)}px;` : `left:50%;top:${r(H * 0.46)}px;transform:translateX(-50%);`}width:${r(shotW)}px;height:${r(shotH)}px;">`
    + browserFrame(`<div id="${id}-zoom" style="position:absolute;inset:0;">${mediaBox(asset, "desktop", theme)}</div>`, theme, url, `${id}-shotinner`) + `</div>`
    + `<div id="${id}-arrow" style="position:absolute;inset:0;pointer-events:none;">`
    + arrowSvg(`${id}-a`, [W * 0.37, H * 0.44], [W * 0.66, H * 0.37], -90, theme.accent, W, H) + `</div>`
    + callout(`${id}-cal`, W * 0.24, H * 0.44, "1", cal, theme, false);
  const s = [
    `tl.fromTo("#${id}-head",{opacity:0,y:40},{opacity:1,y:0,duration:0.5,ease:"back.out(1.4)"},${r(T + L * 0.12)});`,
    `tl.fromTo("#${id}-shot",{opacity:0,x:${r(land ? W * 0.45 : 0)},y:${r(land ? 0 : H * 0.2)}},{opacity:1,x:0,y:0,duration:0.62,ease:"back.out(1.1)"},${r(T + L * 0.08)});`,
    // Ken-Burns to a focus spot inside the capture.
    `tl.fromTo("#${id}-zoom",{scale:1},{scale:1.16,duration:${r(L * 0.55)},ease:"sine.inOut"},${r(T + L * 0.42)});`,
    `tl.fromTo("#${id}-a-p",{strokeDashoffset:100},{strokeDashoffset:0,duration:${r(Math.min(0.9, L * 0.28))},ease:"power2.out"},${r(T + L * 0.55)});`,
    `tl.fromTo("#${id}-a-h",{opacity:0,scale:0.4},{opacity:1,scale:1,duration:0.24,ease:"back.out(2)"},${r(T + L * 0.55 + Math.min(0.9, L * 0.28) * 0.85)});`,
    `tl.fromTo("#${id}-cal",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:0.34,ease:"back.out(2)"},${r(T + L * 0.62)});`,
  ];
  return { html: sceneShell(ctx, inner), s };
}

function buildDetail(scene, ctx, asset) {
  const { id, T, L, theme, W, H, url, land } = ctx;
  const head = fit(scene.headline || "Three things to notice.", 46);
  const items = bullets(scene, 3);
  while (items.length < 3) items.push(["One-click actions", "Real-time sync", "Your whole team"][items.length]);
  const shotW = land ? W * 0.61 : W * 0.88, shotH = land ? H * 0.61 : H * 0.4;
  // Callout anchors: two left, one right — mirrors the template's spot layout.
  const spots = land
    ? [{ ax: W * 0.14, ay: H * 0.30, tx: W * 0.50, ty: H * 0.33, bend: -60, right: false },
       { ax: W * 0.14, ay: H * 0.56, tx: W * 0.51, ty: H * 0.55, bend: 60, right: false },
       { ax: W * 0.86, ay: H * 0.72, tx: W * 0.70, ty: H * 0.62, bend: -60, right: true }]
    : [{ ax: W * 0.10, ay: H * 0.30, tx: W * 0.46, ty: H * 0.36, bend: -50, right: false },
       { ax: W * 0.10, ay: H * 0.62, tx: W * 0.46, ty: H * 0.58, bend: 50, right: false },
       { ax: W * 0.90, ay: H * 0.78, tx: W * 0.62, ty: H * 0.70, bend: -50, right: true }];
  const inner =
    `<div id="${id}-head" style="opacity:0;position:absolute;left:0;right:0;top:${r(H * 0.09)}px;text-align:center;">`
    + `<div style="font-family:'${DISPLAY}',system-ui,sans-serif;font-weight:700;font-size:${land ? 58 : 46}px;letter-spacing:-0.02em;color:${theme.ink};">${esc(head)}</div></div>`
    + `<div id="${id}-shot" style="opacity:0;position:absolute;left:50%;top:${r(H * 0.23)}px;width:${r(shotW)}px;height:${r(shotH)}px;transform:translateX(-50%);">`
    + browserFrame(mediaBox(asset, "desktop", theme), theme, url, `${id}-shotinner`) + `</div>`
    + `<div style="position:absolute;inset:0;pointer-events:none;">`
    + spots.map((sp, i) => arrowSvg(`${id}-a${i}`, [sp.ax, sp.ay], [sp.tx, sp.ty], sp.bend, theme.accent, W, H)).join("") + `</div>`
    + spots.map((sp, i) => callout(`${id}-c${i}`, sp.ax, sp.ay - 20, String(i + 1), fit(items[i], 22), theme, sp.right)).join("");
  const s = [
    `tl.fromTo("#${id}-head",{opacity:0,y:36},{opacity:1,y:0,duration:0.46,ease:"back.out(1.4)"},${r(T + L * 0.08)});`,
    `tl.fromTo("#${id}-shot",{opacity:0,scale:0.95},{opacity:1,scale:1,duration:0.55,ease:"back.out(1.1)"},${r(T + L * 0.08)});`,
  ];
  spots.forEach((sp, i) => {
    const at = T + L * (0.38 + i * 0.15);
    const d = Math.min(0.7, L * 0.22);
    s.push(`tl.fromTo("#${id}-a${i}-p",{strokeDashoffset:100},{strokeDashoffset:0,duration:${r(d)},ease:"power2.out"},${r(at)});`);
    s.push(`tl.fromTo("#${id}-a${i}-h",{opacity:0,scale:0.4},{opacity:1,scale:1,duration:0.22,ease:"back.out(2)"},${r(at + d * 0.85)});`);
    s.push(`tl.fromTo("#${id}-c${i}",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:0.32,ease:"back.out(2)"},${r(at + 0.06)});`);
  });
  return { html: sceneShell(ctx, inner), s };
}

function buildMobile(scene, ctx, asset) {
  const { id, T, L, theme, W, H, land } = ctx;
  const ls = lines(scene.headline, "Take it with you.").slice(0, 2);
  const eb = fit(scene.eyebrow || scene.kicker || "Pocket-sized", 26).toUpperCase();
  const cal = fit(scene.callout || bullets(scene, 1)[0] || "Instant alerts", 22);
  const phW = land ? W * 0.194 : W * 0.44, phH = phW * 2.1;
  const phX = land ? W * 0.20 : W * 0.28;
  const inner =
    `<div id="${id}-head" style="opacity:0;position:absolute;${land ? `right:${r(W * 0.068)}px;top:${r(H * 0.28)}px;width:${r(W * 0.32)}px;text-align:right;` : `left:0;right:0;top:${r(H * 0.08)}px;text-align:center;`}">`
    + eyebrow(eb, theme, 16) + headBlock(`${id}-h2`, ls, theme, land ? 78 : 58, land ? "right" : "center").replace('opacity:0;', '')
    + `</div>`
    + `<div id="${id}-ph" style="opacity:0;position:absolute;left:${r(phX)}px;top:${r(land ? H * 0.12 : H * 0.36)}px;width:${r(phW)}px;height:${r(phH)}px;">`
    + phoneFrame(mediaBox(asset, "phone", theme), theme) + `</div>`
    + `<div style="position:absolute;inset:0;pointer-events:none;">`
    + arrowSvg(`${id}-a`, [W * 0.43, H * 0.39], [W * 0.32, H * 0.35], 50, theme.accent, W, H) + `</div>`
    + callout(`${id}-cal`, W * 0.44, H * 0.37, "1", cal, theme, false);
  const s = [
    `tl.fromTo("#${id}-head",{opacity:0,y:40},{opacity:1,y:0,duration:0.5,ease:"back.out(1.4)"},${r(T + L * 0.16)});`,
    `tl.fromTo("#${id}-ph",{opacity:0,y:${r(H * 0.6)}},{opacity:1,y:0,duration:0.7,ease:"back.out(1.15)"},${r(T + L * 0.1)});`,
    `tl.fromTo("#${id}-a-p",{strokeDashoffset:100},{strokeDashoffset:0,duration:${r(Math.min(0.8, L * 0.25))},ease:"power2.out"},${r(T + L * 0.5)});`,
    `tl.fromTo("#${id}-a-h",{opacity:0,scale:0.4},{opacity:1,scale:1,duration:0.22,ease:"back.out(2)"},${r(T + L * 0.5 + Math.min(0.8, L * 0.25) * 0.85)});`,
    `tl.fromTo("#${id}-cal",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:0.32,ease:"back.out(2)"},${r(T + L * 0.54)});`,
  ];
  return { html: sceneShell(ctx, inner), s };
}

function buildMontage(scene, ctx, tiles) {
  const { id, T, L, theme, W, H, url, land } = ctx;
  const head = fit(scene.headline || "Every screen, one glance.", 44);
  // Six tiles on a two-row wall, each flying in from a different edge.
  const grid = land
    ? [{ x: 0.05, y: 0.23, w: 0.28, h: 0.30, d: [-1, 0] }, { x: 0.35, y: 0.23, w: 0.20, h: 0.30, d: [0, -1] },
       { x: 0.565, y: 0.23, w: 0.385, h: 0.30, d: [1, 0] }, { x: 0.05, y: 0.56, w: 0.20, h: 0.30, d: [0, 1] },
       { x: 0.265, y: 0.56, w: 0.32, h: 0.30, d: [0, 1] }, { x: 0.605, y: 0.56, w: 0.345, h: 0.30, d: [1, 1] }]
    : [{ x: 0.06, y: 0.16, w: 0.42, h: 0.18, d: [-1, 0] }, { x: 0.52, y: 0.16, w: 0.42, h: 0.18, d: [1, 0] },
       { x: 0.06, y: 0.37, w: 0.42, h: 0.18, d: [-1, 0] }, { x: 0.52, y: 0.37, w: 0.42, h: 0.18, d: [1, 0] },
       { x: 0.06, y: 0.58, w: 0.42, h: 0.18, d: [0, 1] }, { x: 0.52, y: 0.58, w: 0.42, h: 0.18, d: [0, 1] }];
  const inner =
    `<div id="${id}-head" style="opacity:0;position:absolute;left:0;right:0;top:${r(H * 0.09)}px;text-align:center;z-index:5;">`
    + `<div style="font-family:'${DISPLAY}',system-ui,sans-serif;font-weight:700;font-size:${land ? 66 : 48}px;letter-spacing:-0.02em;color:${theme.ink};">${esc(head)}</div></div>`
    + grid.map((g, i) => `<div id="${id}-t${i}" style="opacity:0;position:absolute;left:${r(g.x * W)}px;top:${r(g.y * H)}px;width:${r(g.w * W)}px;height:${r(g.h * H)}px;">`
      + browserFrame(mediaBox(tiles[i], i % 2 ? "photo" : "desktop", theme, `SCREENSHOT ${i + 1}`), theme, url, `${id}-ti${i}`) + `</div>`).join("");
  const s = [`tl.fromTo("#${id}-head",{opacity:0,y:36},{opacity:1,y:0,duration:0.44,ease:"back.out(1.4)"},${r(T + L * 0.06)});`];
  grid.forEach((g, i) => {
    const at = T + L * (0.16 + i * 0.075);
    s.push(`tl.fromTo("#${id}-t${i}",{opacity:0,x:${r(g.d[0] * W * 0.26)},y:${r(g.d[1] * H * 0.36)},scale:0.9},`
      + `{opacity:1,x:0,y:0,scale:1,duration:0.52,ease:"back.out(1.2)"},${r(at)});`);
  });
  return { html: sceneShell(ctx, inner), s };
}

function buildProof(scene, ctx) {
  const { id, T, L, theme, W, H, land } = ctx;
  const head = fit(scene.headline || "Loved at scale.", 40);
  let stats = statsOf(scene, 3);
  if (!stats.length) {
    const bs = bullets(scene, 3);
    stats = bs.length ? bs.slice(0, 3).map((b, i) => ({ v: [12, 4.9, 99][i] || 10, suf: ["K+", "★", "%"][i] || "", l: fit(b, 20).toUpperCase() }))
      : [{ v: 12, suf: "K+", l: "TEAMS" }, { v: 4.9, suf: "★", l: "RATING" }, { v: 99.9, suf: "%", l: "UPTIME" }];
  }
  const inner =
    `<div id="${id}-head" style="opacity:0;position:absolute;left:0;right:0;top:${r(H * 0.19)}px;text-align:center;">`
    + `<div style="font-family:'${DISPLAY}',system-ui,sans-serif;font-weight:700;font-size:${land ? 80 : 56}px;letter-spacing:-0.02em;color:${theme.ink};">${esc(head)}</div></div>`
    + `<div style="position:absolute;left:0;right:0;top:${r(H * 0.39)}px;display:flex;justify-content:center;gap:${land ? 60 : 24}px;${land ? "" : "flex-direction:column;align-items:center;"}">`
    + stats.map((st, i) => `<div id="${id}-st${i}" style="opacity:0;background:${theme.panel};border:1px solid ${theme.line};border-radius:24px;`
      + `box-shadow:0 20px 50px ${rgba(theme.ink, 0.1)};padding:${land ? "44px 60px" : "24px 40px"};text-align:center;min-width:${land ? 300 : 260}px;">`
      + `<div style="font-family:'${DISPLAY}',system-ui,sans-serif;font-weight:700;font-size:${land ? 108 : 72}px;line-height:1;letter-spacing:-0.03em;color:${theme.accent};">`
      + `<span id="${id}-n${i}">0</span>${esc(st.suf)}</div>`
      + `<div style="font-family:'${MONO}',ui-monospace,monospace;font-size:16px;letter-spacing:0.16em;color:${theme.sub};margin-top:10px;">${esc(st.l)}</div></div>`).join("")
    + `</div>`;
  const s = [`tl.fromTo("#${id}-head",{opacity:0,y:36},{opacity:1,y:0,duration:0.46,ease:"back.out(1.4)"},${r(T + L * 0.06)});`];
  stats.forEach((st, i) => {
    const at = T + L * (0.3 + i * 0.12);
    s.push(`tl.fromTo("#${id}-st${i}",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:0.42,ease:"back.out(1.8)"},${r(at)});`);
    // Counter driven by a seeked proxy — deterministic under scrub.
    const dec = String(st.v).includes(".") ? 1 : 0;
    s.push(`(function(){var o={v:0};tl.to(o,{v:${st.v},duration:${r(Math.min(1.1, L * 0.4))},ease:"expo.out",`
      + `onUpdate:function(){var e=document.getElementById("${id}-n${i}");if(e)e.textContent=o.v.toFixed(${dec});}},${r(at + 0.04)});})();`);
  });
  return { html: sceneShell(ctx, inner), s };
}

function buildCta(scene, ctx, logoAsset) {
  const { id, T, L, theme, W, H, url, land } = ctx;
  const ls = lines(scene.headline, "Start the free trial.").slice(0, 2);
  const cta = fit(scene.cta || scene.ctaLabel || "GET STARTED", 20).toUpperCase();
  const inner =
    `<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;">`
    + `<div id="${id}-logo" style="opacity:0;width:132px;height:132px;border-radius:30px;background:${theme.panel};border:1px solid ${theme.line};`
    + `box-shadow:0 20px 50px ${rgba(theme.ink, 0.12)};overflow:hidden;padding:16px;margin-bottom:30px;">`
    + mediaBox(logoAsset, "logo", theme) + `</div>`
    + headBlock(`${id}-head`, ls, theme, land ? 112 : 72, "center")
    + `<div id="${id}-pill" style="opacity:0;margin-top:40px;display:flex;align-items:center;gap:22px;${land ? "" : "flex-direction:column;"}">`
    + `<div style="display:inline-flex;align-items:center;gap:12px;padding:20px 42px;border-radius:14px;background:${theme.accent};`
    + `color:${inkOn(theme.accent)};font-family:'${DISPLAY}',system-ui,sans-serif;font-weight:600;font-size:28px;`
    + `box-shadow:0 14px 34px ${rgba(theme.accent, 0.4)};">${esc(cta)} <span style="font-size:30px;">&rarr;</span></div>`
    + `<div style="font-family:'${MONO}',ui-monospace,monospace;font-size:20px;letter-spacing:0.1em;color:${theme.sub};">${esc(url)}</div></div></div>`;
  const s = [
    `tl.fromTo("#${id}-logo",{opacity:0,scale:0.4},{opacity:1,scale:1,duration:0.6,ease:"back.out(1.8)"},${r(T + L * 0.2)});`,
    `tl.fromTo("#${id}-head",{opacity:0,y:50},{opacity:1,y:0,duration:0.55,ease:"back.out(1.4)"},${r(T + L * 0.1)});`,
    `tl.fromTo("#${id}-pill",{opacity:0,scale:0.5},{opacity:1,scale:1,duration:0.45,ease:"back.out(1.8)"},${r(T + L * 0.4)});`,
  ];
  return { html: sceneShell(ctx, inner), s };
}

const BUILDERS = { intro: buildIntro, tour: buildTour, detail: buildDetail, mobile: buildMobile, montage: buildMontage, proof: buildProof, cta: buildCta };

// ---- persistent chrome --------------------------------------------------------
// Animated blob wash + grid + ambient sky (paper planes, birds, floating dots).
// Every motion is a finite tween on the master timeline, so a seek is exact.
function chromeLayer(theme, W, H, D) {
  const blobs = [
    { c: theme.accent, w: 0.34, x: -0.10, y: -0.23, o: 0.17 },
    { c: "#3FA9F5", w: 0.29, x: 0.745, y: -0.21, o: 0.16 },
    { c: "#57B894", w: 0.27, x: -0.09, y: 0.65, o: 0.15 },
    { c: "#FFC53D", w: 0.31, x: 0.71, y: 0.59, o: 0.17 },
    { c: "#8B5CF6", w: 0.23, x: 0.41, y: 0.74, o: 0.11 },
  ];
  const html =
    `<div id="bgwash" style="position:absolute;inset:0;background:linear-gradient(160deg,${theme.bg} 0%,#FFFFFF 52%,${theme.bg} 100%);overflow:hidden;">`
    + blobs.map((b, i) => `<div class="blob" id="blob${i}" style="position:absolute;width:${r(b.w * W)}px;height:${r(b.w * W)}px;border-radius:50%;`
      + `left:${r(b.x * W)}px;top:${r(b.y * H)}px;background:${rgba(b.c, b.o)};filter:blur(52px);"></div>`).join("")
    + `<div style="position:absolute;inset:0;background-image:linear-gradient(${rgba(theme.ink, 0.045)} 1px,transparent 1px),`
    + `linear-gradient(90deg,${rgba(theme.ink, 0.045)} 1px,transparent 1px);background-size:52px 52px;opacity:0.5;"></div></div>`
    + `<svg id="sky" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;">`
    + [[0.16, 0.48], [0.83, 0.44], [0.47, 0.28], [0.74, 0.77], [0.26, 0.78], [0.60, 0.59]]
      .map((d, i) => `<circle class="dot" id="dot${i}" cx="${r(d[0] * W)}" cy="${r(d[1] * H)}" r="${7 + (i % 3) * 3}" `
        + `fill="${i === 0 ? theme.accent : ["#3FA9F5", "#57B894", "#FFC53D", "#F25C8A", "#8B5CF6"][i % 5]}" opacity="0.5"></circle>`).join("")
    + `<g id="plane1"><path d="M-16 0 q -90 -4 -168 -32" stroke="${theme.accent}" stroke-width="3" stroke-dasharray="2 11" fill="none" opacity="0.55" stroke-linecap="round"></path>`
    + `<path d="M24 0 L-20 -15 L-7 0 L-20 15 Z" fill="${theme.accent}"></path></g>`
    + `<g id="plane2" opacity="0.75"><path d="M-16 0 q -90 -4 -168 -32" stroke="#3FA9F5" stroke-width="3" stroke-dasharray="2 11" fill="none" opacity="0.55" stroke-linecap="round"></path>`
    + `<path d="M24 0 L-20 -15 L-7 0 L-20 15 Z" fill="#3FA9F5"></path></g>`
    + `</svg>`;
  // Finite, seek-safe ambient motion.
  const s = [
    `tl.fromTo("#plane1",{x:${r(-W * 0.15)},y:${r(H * 0.16)}},{x:${r(W * 1.08)},y:${r(H * 0.22)},duration:${r(D)},ease:"none"},0);`,
    `tl.fromTo("#plane2",{x:${r(W * 1.05)},y:${r(H * 0.33)}},{x:${r(-W * 0.12)},y:${r(H * 0.29)},duration:${r(D)},ease:"none"},0);`,
  ];
  blobs.forEach((b, i) => {
    s.push(`tl.fromTo("#blob${i}",{x:${r(-24 - i * 4)},y:${r(-18 - i * 3)}},{x:${r(26 + i * 4)},y:${r(20 + i * 3)},duration:${r(D)},ease:"sine.inOut"},0);`);
  });
  [[0, 1], [1, -1], [2, 1], [3, -1], [4, 1], [5, -1]].forEach(([i, dir]) => {
    s.push(`tl.fromTo("#dot${i}",{y:${r(-14 * dir)}},{y:${r(14 * dir)},duration:${r(D)},ease:"sine.inOut"},0);`);
  });
  return { html, s };
}

// ---- document -----------------------------------------------------------------
function buildComposition({ storyboard, dims, framePack, captionCues, assets, brandSkin, templatePlan } = {}) {
  const theme = showcaseTheme(brandSkin);
  const sb = storyboard || {};
  const W = (dims && dims.width) || 1920, H = (dims && dims.height) || 1080;
  const land = W >= H;
  const scenes = (Array.isArray(sb.scenes) && sb.scenes.length
    ? fitScenes(sb.scenes, MAX_CLIPS)          // merge past the ceiling, never truncate (scene_fit.js)
    : [{ id: "s1", start: 0, duration: 4, kind: "hook", headline: sb.title || "SHOWCASE" }]).map(withDisplayCopy);
  const D = r(sb.durationSec || scenes.reduce((a, s) => Math.max(a, (Number(s.start) || 0) + (Number(s.duration) || 0)), 0) || 12);

  const brandHost = (Array.isArray(assets) ? assets : [])
    .filter((a) => a && (a.source === "website" || a.source === "website-image" || a.source === "topic-screenshot") && a.sourceUrl)
    .map((a) => { try { return new URL(a.sourceUrl).hostname.replace(/^www\./, ""); } catch { return null; } })
    .find(Boolean);
  const brand = String(sb.brand || sb.title || (brandHost ? brandHost.split(".")[0] : "") || "SHOWCASE").slice(0, 18);
  const url = String(sb.url || brandHost || `${brand.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`).slice(0, 40);

  // Asset pools — screenshots first (this template frames them as the product),
  // then anything else. Scene-pinned assets win over the pool.
  const images = (Array.isArray(assets) ? assets : []).filter(plateOk)
    .sort((a, b) => ((isShot(b) ? 1 : 0) - (isShot(a) ? 1 : 0)) || ((Number(b.cdScore) || 0) - (Number(a.cdScore) || 0)));
  const logoAsset = (Array.isArray(assets) ? assets : []).find(isLogo) || null;
  const byScene = new Map();
  const pool = [];
  for (const a of images) {
    if (a === logoAsset) continue;
    const sid = a.sceneId != null ? String(a.sceneId) : null;
    if (sid && !byScene.has(sid)) byScene.set(sid, a); else pool.push(a);
  }
  let pooli = 0;
  // WHICH PICTURE BELONGS ON *THIS* BEAT. The sort above is entirely
  // FILM-GLOBAL — screenshot-ness, then cdScore — so every slot in the film
  // popped the next item off that one list and what the beat was SAYING never
  // came into it. This template is the most screenshot-forward of the set, and a
  // website job writes every capture as site_0.png…site_5.png with the same
  // boilerplate alt, so the candidates tie and arrival order breaks the tie:
  // that is the "random screenshots" complaint in full.
  // `scene` is optional so every other call site is unchanged, and when nothing
  // in the pool is even loosely about the beat this falls straight back to the
  // old rank walk — it can only improve on the previous pick, never starve a
  // slot.
  const takePool = (pred, scene = null) => {
    const onTopic = scene ? pickForScene(pool, scene, { pred }) : null;
    if (onTopic) { pool.splice(pool.indexOf(onTopic), 1); return onTopic; }
    for (let k = pooli; k < pool.length; k++) {
      if (!pred || pred(pool[k])) { const a = pool[k]; pool.splice(k, 1); return a; }
    }
    return null;
  };

  const cast = templatePlan && templatePlan.byScene ? templatePlan.byScene : null;
  const bodyParts = [], sceneScripts = [], mediaPlan = [];
  let T = 0;

  scenes.forEach((scene, i) => {
    const sid = scene.id != null ? String(scene.id) : `s${i + 1}`;
    const L = r(Math.max(1.2, Number(scene.duration) || (D / scenes.length)));
    const pinned = byScene.get(sid) || null;
    const castEntry = cast && cast[sid] && BUILDERS[cast[sid].type] ? cast[sid] : null;

    let arch, picked = [];
    if (castEntry) {
      arch = castEntry.type;
      const castAssets = (castEntry.assets || []).filter((a) => a && a.path);
      // A pin lives outside `pool`, so the cast branch could never reach it —
      // the same orphaning defect fixed on the template_engine path.
      if (pinned && !castAssets.some((x) => x === pinned || x.path === pinned.path)) castAssets.unshift(pinned);
      picked = castAssets;
    } else {
      arch = showArchetype(scene, i, scenes.length, pinned, pool.length - pooli);
      if (pinned) picked.push(pinned);
    }

    const need = SHOW_SLOTS[arch] || [];
    // Top the slots up from the pool — the director often casts fewer assets
    // than the type actually draws (montage renders six).
    while (picked.length < need.length) {
      const want = need[picked.length];
      // Only the first empty slot picks on topic. For every single-media type
      // that IS the slot; for the six-tile montage it is the tile that reads.
      // Letting all six pick on topic measured WORSE — 2 of 3 media beats on
      // topic down to 1 of 3: the wall claimed the "workspace layout" capture
      // for its own beat, and the very next beat, "One workspace", the one
      // actually talking about it, fell back to the site footer. One beat may
      // not strip the film of its matches.
      const sc = picked.length ? null : scene;
      const a = want === "phone" ? takePool(isPortraitAsset, sc)
        : want === "desktop" ? takePool((x) => !isPortraitAsset(x), sc)
          : takePool(null, sc);
      if (!a) break;
      picked.push(a);
    }
    // A media type with nothing to show re-routes rather than drawing an empty
    // frame — the same rule the engine applies via mediaFallback.
    if (need.length && !picked.length && arch !== "montage") arch = statsOf(scene, 1).length || bullets(scene, 2).length ? "proof" : "cta";
    const finalNeed = SHOW_SLOTS[arch] || [];
    const filledCount = picked.filter(Boolean).slice(0, finalNeed.length).length;

    const winL = i === scenes.length - 1 ? L + 0.5 : L;
    const ctx = { id: `s${i + 1}`, T, L, winL, track: 2 + i, W, H, land, theme, i, count: scenes.length, brand, url };
    const built = arch === "montage"
      ? buildMontage(scene, ctx, picked)
      : arch === "cta"
        ? buildCta(scene, ctx, logoAsset)
        : (BUILDERS[arch] || buildProof)(scene, ctx, picked[0] || null);

    mediaPlan.push({ sceneIndex: i, sceneId: sid, sceneType: arch, need: finalNeed, filled: filledCount });
    // Stamp demand/coverage so a hole is countable from the rendered DOM — an
    // unfilled slot draws a styled plate, never a missing <img>, so nothing
    // downstream could otherwise tell design from a gap.
    bodyParts.push(built.html.replace(
      /^(\s*<div class="clip show-scene")/,
      `$1 data-scene-type="${arch}" data-media-demand="${finalNeed.length}" data-media-filled="${filledCount}" data-media-kinds="${finalNeed.join(",")}"`,
    ));
    sceneScripts.push(built.s.join("\n  "));
    // Scene in/out: the template's clean slide-push flow.
    sceneScripts.push(`tl.fromTo("#${ctx.id}",{opacity:0},{opacity:1,duration:0.25,ease:"none"},${r(T)});`);
    if (i > 0) sceneScripts.push(`tl.fromTo("#${ctx.id}-cam",{x:${r(W * 0.1)}},{x:0,duration:${r(Math.min(0.6, L * 0.16))},ease:"expo.out"},${r(T)});`);
    if (i < scenes.length - 1) {
      sceneScripts.push(`tl.to("#${ctx.id}-cam",{x:${r(-W * 0.1)},duration:${r(Math.min(0.55, L * 0.14))},ease:"expo.in"},${r(T + L - Math.min(0.55, L * 0.14))});`);
      // Hard opacity:0 kill at the scene end so a finished clip can never bleed
      // into the next. MUST be tl.set (not a 1ms tl.to) — the renderer's lint
      // recognises only the set form as a hard kill (gsap_exit_missing_hard_kill).
      sceneScripts.push(`tl.set("#${ctx.id}",{opacity:0},${r(T + L)});`);
    }
    // Continuous inner push — a pure function of time, so scrubbing is exact.
    sceneScripts.push(`tl.fromTo("#${ctx.id}-cam",{scale:1},{scale:1.03,duration:${r(L)},ease:"sine.inOut"},${r(T)});`);
    T = r(T + L);
  });

  const chrome = chromeLayer(theme, W, H, D);
  const capCss = `#cap-pill{position:absolute;left:8%;right:8%;bottom:6%;text-align:center;font-family:'${DISPLAY}',system-ui,sans-serif;`
    + `font-weight:600;font-size:${land ? 30 : 26}px;line-height:1.3;color:${theme.ink};text-shadow:0 2px 10px ${rgba("#FFFFFF", 0.8)};opacity:0;z-index:40;}`;
  const cues = Array.isArray(captionCues) ? captionCues : [];

  const indexHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
${fontFaceCss(DISPLAY) || ""}
${fontFaceCss(MONO) || ""}
*{margin:0;padding:0;box-sizing:border-box;}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:${theme.bg};}
#root{position:relative;width:${W}px;height:${H}px;overflow:hidden;}
.clip{will-change:transform,opacity;}
${capCss}
</style></head>
<body><div id="root" class="composition" data-composition-id="vid" data-width="${W}" data-height="${H}" data-start="0" data-duration="${r(D)}">
${chrome.html}
${bodyParts.join("\n")}
<div id="cap-pill"></div>
</div>
<script src="${GSAP_CDN}"></script>
<script>
(function(){
  var tl = gsap.timeline({paused:true});
  ${chrome.s.join("\n  ")}
  ${sceneScripts.join("\n  ")}
${cues.length ? `  var CUES=${JSON.stringify(cues.map((c) => ({ t: r(c.start), e: r(c.end), x: String(c.text || "") })))};
  var capEl=document.getElementById("cap-pill");
  tl.to({}, {duration:${r(D)}, ease:"none", onUpdate:function(){
    var t=tl.time(), cur=null;
    for(var i=0;i<CUES.length;i++){ if(t>=CUES[i].t && t<CUES[i].e){ cur=CUES[i]; break; } }
    if(cur){ if(capEl.textContent!==cur.x) capEl.textContent=cur.x; capEl.style.opacity=1; }
    else { capEl.style.opacity=0; }
  }}, 0);` : ""}
  tl.set({}, {}, ${r(D)});
  window.__timelines = window.__timelines || {};
  window.__timelines["vid"] = tl;
})();
</script>
</body></html>`;

  // metaJson is REQUIRED by composeWithPackRenderer — it writes built.metaJson to
  // meta.json before rendering, and HyperFrames reads the compositionId/duration
  // from it. Omitting it throws inside fs.writeFileSync ("data argument must be
  // of type string ... Received undefined") and the job silently falls back to
  // scene-kit with the pack's styling, which looks like the composer simply
  // never ran.
  const metaJson = JSON.stringify({ compositionId: "vid", width: W, height: H, fps: (dims && dims.fps) || 30, duration: D });
  return { indexHtml, metaJson, mediaPlan: { plan: mediaPlan, totals: mediaTotals(mediaPlan) } };
}

function mediaTotals(plan) {
  const t = { demand: 0, filled: 0, empty: 0, scenes: plan.length };
  for (const p of plan) { t.demand += p.need.length; t.filled += p.filled; }
  t.empty = t.demand - t.filled;
  return t;
}

function planMedia(opts) { return buildComposition(opts).mediaPlan; }

module.exports = { buildComposition, planMedia, TEMPLATE_SCENES };
