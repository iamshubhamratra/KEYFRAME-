// PREMIERE NIGHT composer — a faithful native GSAP port of the user's
// "Premiere Night" bundled reel template (premiere-night-film.jsx).
// The pack `premiere-night` (manifest renderer:"cinema") routes here, so
// selecting the template gives THE TEMPLATE: its six authored beats (marquee
// Hook with a floating 3D browser card, rule-bar Statement with a gold-shimmer
// punchline, terracotta-framed Feature with sliding glow chips, counter-scrolling
// film-strip Montage, odometer Stats "box office report", spotlit logo CTA),
// its covered theater cuts (doors / iris / blinds cycling per scene), its 3D
// dolly (slow push + perspective sway, never still) and its living world (dark
// warm house, chasing marquee bulb rails top+bottom, sweeping spotlight cones,
// film grain + vignette) with the brand chip and a per-scene progress rail.
// Signature text effect: FlipTitle — letters flip up in 3D one by one
// (rotateX -88°→0, origin 50% 92%, back.out, per-char stagger normalized so the
// title lands by ~60% of the beat); the key word carries a moving gold-gradient
// shimmer (background-clip:text on an inner span the timeline only animates
// backgroundPosition on — transforms stay on the wrapper). Only CONTENT is
// swapped: script copy, chips/tiles/stats from the Template Director, and the
// template's own media slots filled with the film's REAL assets — the website
// screenshot in the browser cards, site photos on the film strips, the brand
// logo in the CTA circle.
//
// Portrait (the template's native 9:16) reproduces the film's layout ~1:1 in
// cqw; landscape re-stages each beat as a two-column adaptation with the same
// type, motion and world. Render contract is template_engine's (seek-safe,
// finite repeats, hard kills); this module is design only.

const { deriveTheme } = require("./scene_kit");
const { fontFaceCss, isBundled } = require("../fonts/pack_fonts");
const E = require("./template_engine");
const { esc, r, rgba, mix, inkOn, statsOf, breakLines, bullets, fit } = E;

const FH = "'Caprasimo', Georgia, serif";
const FB = "'Figtree', system-ui, sans-serif";

// ---- theme --------------------------------------------------------------------
function theme(manifest, brandSkin, { framePack, land } = {}) {
  const t = deriveTheme(framePack || "premiere-night", {}, brandSkin);
  const ground = t.ground || "#171514";            // the dark warm house
  const paper = t.ink || "#f5ead8";                // house paper ink
  const accent = (t.accents && t.accents[0]) || "#c67139"; // terracotta
  const glow = (t.accents && t.accents[1]) || "#e8b06a";   // marquee gold
  const sage = (t.accents && t.accents[2]) || "#7a8a5e";
  return {
    ...t, ground, paper, accent, glow, sage,
    panel: mix(ground, paper, 0.08),               // the film's ink3 panel
    btnInk: inkOn(accent),                          // text on the accent pill
    sageL: mix(sage, "#ffffff", 0.28),
    sageD: mix(sage, "#000000", 0.45),
    shine: mix(paper, "#ffffff", 0.5),              // the glare/shimmer white
    displayStack: FH, bodyStack: FB,
    fontFace: (isBundled("Caprasimo") ? fontFaceCss("Caprasimo") : "") + (isBundled("Figtree") ? fontFaceCss("Figtree") : ""),
  };
}

// ---- vocabulary (Template Director casts onto these) --------------------------
const TEMPLATE_SCENES = [
  {
    type: "hook", bestFor: "opening — the one-night-only announcement",
    look: "Chasing marquee bulbs frame a letter-spaced gold kicker, the title flips up letter by letter in 3D, a floating tilting browser card holds the website hero, one warm sub-line under it.",
    slots: { kicker: "max 26 chars, uppercase", headline: "2-3 short lines ('|' breaks)", subtext: "one warm sentence, max 90 chars" },
    media: ["desktop"],
  },
  {
    type: "statement", bestFor: "the problem or a bold belief",
    look: "A glowing terracotta rule, a 3D letter-flip title, then the punchline shimmers in a moving gold gradient, plus one supporting sentence — all type on the dark house.",
    slots: { headline: "2 short lines", mark: "the 2-3 word punchline that shimmers gold, max 18 chars", subtext: "one sentence, max 100 chars" },
    media: [],
  },
  {
    type: "feature", bestFor: "the product/offer shown for real",
    look: "Tonight's main feature: a big tilting 3D browser card in a terracotta frame with the website screenshot, checklist pills sliding in beneath, each with a glowing gold dot.",
    slots: { headline: "max 2 short lines", chips: "2-3 items, max 26 chars each" },
    media: ["desktop"],
  },
  {
    type: "montage", bestFor: "range — several items/pages/angles",
    look: "Two counter-scrolling film strips with sprocket holes carry labeled stills past the title — scene by scene.",
    slots: { headline: "max 2 short lines", tiles: "4 short labels, max 14 chars each" },
    media: ["photo", "photo"], mediaMin: 0,
  },
  {
    type: "stats", bestFor: "numbers that prove it",
    look: "The box-office report: big gold odometer digits roll up beside their labels over glowing rules.",
    slots: { headline: "max 2 short lines", stats: "1-3 of {v, suf, l}" },
    media: [],
  },
  {
    type: "cta", bestFor: "closing invitation",
    look: "Marquee bulbs pulse; the brand logo glows in a spotlit circle, the closing title flips up huge, a pulsing terracotta pill button, the url shimmering gold beneath.",
    slots: { headline: "max 2 short lines", cta: "button label, max 24 chars" },
    media: [],
  },
];
const mediaSlots = { hook: ["desktop"], feature: ["desktop"], montage: ["photo", "photo", "photo", "photo"] };

function route(scene, i, total, ctx) {
  const k = String(scene.kind || "").toLowerCase(), p = String(scene.purpose || "").toLowerCase();
  if (i === 0 || k === "hook" || k === "title") return "hook";
  if (i === total - 1 || k === "cta" || p === "cta") return "cta";
  if (k === "stat" || k === "chart" || statsOf(scene, 1).length) return "stats";
  if ((ctx.pinned || ctx.hasShot) && ctx.prevType !== "feature") return "feature";
  if (/montage|gallery|range|showcase/.test(`${k} ${p}`) || (ctx.freeCount >= 2 && ctx.prevType !== "montage")) return "montage";
  if (bullets(scene, 3).length >= 2) return "feature";
  return ctx.prevType === "statement" ? "feature" : "statement";
}
const mediaFallback = (scene) => (bullets(scene, 3).length >= 2 ? "feature" : "statement");
const wantsLogo = (type) => type === "cta";

// ---- shared pieces ------------------------------------------------------------
// Film px → cqw. Portrait maps the template's native 1080-wide sheet 1:1;
// landscape uses its own staging numbers, so it only converts type sizes.
const q = (px, land) => r(px * (land ? 0.052 : 0.0926));

const lastWord = (text, fb) => {
  const ls = breakLines(text, fb);
  const ws = String(ls[ls.length - 1] || "").split(/\s+/).filter(Boolean);
  return ws[ws.length - 1] || "";
};

// The film's rise(): outQuint rise from 44px, delay 0.1·L + i·0.06·L.
function rise(sel, T, L, idx) {
  return `tl.fromTo("${sel}",{opacity:0,y:44},{opacity:1,y:0,duration:${r(Math.min(1.4, L * 0.4))},ease:"expo.out"},${r(T + Math.min(0.5, L * 0.1) + idx * Math.min(0.22, L * 0.06))});`;
}
// outBack pop (logo / button).
function pop(sel, L, at) {
  return `tl.fromTo("${sel}",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:${r(Math.min(1, Math.max(0.4, L * 0.18)))},ease:"back.out(1.7)"},${r(at)});`;
}

// FlipTitle — the film's letter-by-letter 3D flip-up. Char spans (hidden
// opacity:0 inline) inside nowrap rows; the key word gets the glow color +
// halo. Returns { html, total } so the anim can normalize its stagger.
function flipTitle(id, text, fallback, sizePx, th, land, { hi = "", color, hiColor } = {}) {
  const hiSet = new Set(String(hi).toLowerCase().split(/\s+/).map((w) => w.replace(/[^\w]/g, "")).filter(Boolean));
  let total = 0;
  // The rows are nowrap, so a long cast headline ran straight off the right edge
  // (portrait cut "THE PREMIERE YO…" mid-word). Shrink to the longest line: a
  // display cap is ~0.58em wide, and the copy column is ~88cqw.
  {
    const longest = Math.max(...breakLines(text, fallback).slice(0, 3).map((l) => fit(String(l), 18).length), 1);
    // Caprasimo is a heavy display face — its caps run ~0.75em, not the ~0.58em
    // a text face would; the first cut of this clamp still let long cast
    // headlines run off the right edge.
    const maxCqw = (land ? 58 : 82) / (longest * 0.75);
    sizePx = Math.min(sizePx, maxCqw / (land ? 0.052 : 0.0926));
  }
  const rows = breakLines(text, fallback).slice(0, 3).map((ln) => {
    const words = fit(ln, 18).split(/\s+/).filter(Boolean);
    const spans = words.map((w) => {
      const isHi = hiSet.size && hiSet.has(w.toLowerCase().replace(/[^\w]/g, ""));
      const chars = w.split("").map((ch) => {
        total++;
        return `<span class="${id}-ch" style="opacity:0;display:inline-block;font-family:${FH};font-size:${q(sizePx, land)}cqw;color:${isHi ? hiColor : color};text-transform:uppercase;${isHi ? `text-shadow:0 0 2cqw ${rgba(hiColor, 0.45)};` : ""}">${esc(ch)}</span>`;
      }).join("");
      return `<span style="display:inline-block;white-space:nowrap;">${chars}</span>`;
    }).join(`<span style="display:inline-block;width:0.26em;font-size:${q(sizePx, land)}cqw;"></span>`);
    return `<div style="line-height:1.04;white-space:nowrap;">${spans}</div>`;
  }).join("");
  return { html: `<div style="perspective:900px;">${rows}</div>`, total: total || 1 };
}
// rotateX -88°→0 per char, origin 50% 92%, back.out; stagger normalized so the
// whole title lands by ~62% of the beat regardless of length (the film's rule).
function flipAnim(id, T, L, total, { startFrac = 0.04, stepFrac = 0.022 } = {}) {
  const eff = Math.min(stepFrac, Math.max(0.006, (0.62 - startFrac - 0.32) / Math.max(1, total))) * L;
  const step = r(Math.min(0.14, Math.max(0.02, eff)));
  const dur = r(Math.min(1.1, Math.max(0.35, L * 0.32)));
  return `tl.fromTo("#${id} .${id}-ch",{opacity:0,rotateX:-88,y:24,transformPerspective:900,transformOrigin:"50% 92%"},{opacity:1,rotateX:0,y:0,duration:${dur},ease:"back.out(1.7)",stagger:${step}},${r(T + startFrac * L)});`;
}

// Shimmer — moving gold gradient text. GOTCHA: background-clip:text breaks if
// a transform animates the SAME element, so the timeline only ever animates
// backgroundPosition here; any reveal transform goes on a wrapper div.
function shimmer(sid, text, sizePx, th, land, { font = FH, extra = "" } = {}) {
  return `<span id="${sid}" style="display:inline-block;font-family:${font};font-size:${q(sizePx, land)}cqw;text-transform:uppercase;line-height:1.02;background:linear-gradient(105deg,${th.glow} 38%,${th.shine} 50%,${th.glow} 62%);background-size:260% 100%;background-position:0% 0%;-webkit-background-clip:text;background-clip:text;color:transparent;${extra}">${esc(text)}</span>`;
}
function shimmerAnim(sid, T, L) {
  return `tl.fromTo("#${sid}",{backgroundPosition:"0% 0%"},{backgroundPosition:"-260% 0%",duration:4.3,ease:"none",repeat:reps(${r(L)},4.3)},${r(T)});`;
}

// Media slot: real asset (cover) or the template's dashed dark placeholder.
function slot(id, asset, th, { radius = 12, focusTop = false } = {}) {
  if (asset && asset.path) {
    return `<img data-media-slot="filled" id="${id}" src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="width:100%;height:100%;border-radius:${radius}px;object-fit:${asset.fitContain ? "contain" : "cover"};padding:${asset.fitContain ? "7%" : "0"};object-position:${asset.fitContain ? "center" : (focusTop ? "top center" : (asset.cropFocus || "center"))};display:block;">`;
  }
  return `<div data-media-slot="empty" id="${id}" style="width:100%;height:100%;border-radius:${radius}px;display:flex;align-items:center;justify-content:center;background:${rgba(th.paper, 0.06)};border:1px solid ${rgba(th.paper, 0.3)};">
    
  </div>`;
}

// The film's Browser chrome (frame color varies per beat) around a media slot.
function browser(id, asset, th, land, frameColor) {
  return `<div style="background:${frameColor};border-radius:${q(24, land)}cqw;padding:${q(10, land)}cqw;width:100%;height:100%;">
    <div style="display:flex;gap:${q(7, land)}cqw;padding:${q(4, land)}cqw ${q(8, land)}cqw ${q(9, land)}cqw;">${[0.9, 0.4, 0.4].map((o) => `<span style="width:${q(12, land)}cqw;height:${q(12, land)}cqw;border-radius:999px;background:${rgba(th.paper, o)};"></span>`).join("")}</div>
    <div style="border-radius:${q(15, land)}cqw;overflow:hidden;height:calc(100% - ${q(34, land)}cqw);">${slot(`${id}-img`, asset, th, { radius: 0, focusTop: true })}</div>
  </div>`;
}

// Card3D — floating card with live tilt + a sweeping glare stripe.
function card3d(id, inner, th, land) {
  return `<div style="perspective:1400px;width:100%;height:100%;">
    <div id="${id}-cd" style="position:relative;width:100%;height:100%;border-radius:${q(24, land)}cqw;box-shadow:0 3cqw 7cqw ${rgba("#000000", 0.55)},0 0 4cqw ${rgba(th.accent, 0.14)};will-change:transform;">
      ${inner}
      <div style="position:absolute;inset:0;pointer-events:none;overflow:hidden;border-radius:${q(24, land)}cqw;">
        <div id="${id}-gl" style="position:absolute;top:-12%;bottom:-12%;width:24%;left:-28%;transform:rotate(14deg);background:linear-gradient(90deg,transparent,${rgba(th.shine, 0.3)},transparent);"></div>
      </div>
    </div>
  </div>`;
}
function card3dAnim(id, T, L, phase = 0) {
  return [
    `tl.to("#${id}-cd",{rotationY:6,duration:5.2,ease:"sine.inOut",yoyo:true,repeat:reps(${r(L)},5.2)},${r(T + phase)});`,
    `tl.to("#${id}-cd",{rotationX:-3.5,duration:6.9,ease:"sine.inOut",yoyo:true,repeat:reps(${r(L)},6.9)},${r(T + phase)});`,
    `tl.fromTo("#${id}-gl",{xPercent:0},{xPercent:520,duration:3.2,ease:"sine.inOut",repeat:reps(${r(L)},3.2)},${r(T + 0.4 + phase)});`,
  ];
}

// ---- covered theater cuts + the 3D dolly --------------------------------------
// doors (accent panels meet center) | iris (panel circle) | blinds (sage bars).
// The scene's own cover opens after the clip fades in; the NEXT kind closes
// over the scene end — the film's covered-cut rhythm, baked per scene.
const CKIND = ["doors", "iris", "blinds"];
function coverHtml(cid, kind, th, visible) {
  const vis = visible ? "" : "opacity:0;";
  if (kind === "iris") {
    return `<div id="${cid}" style="position:absolute;inset:-6%;z-index:9;background:${th.panel};box-shadow:inset 0 0 0 1.2cqw ${th.accent};clip-path:circle(${visible ? 122 : 0}% at 50% 50%);${vis}"></div>`;
  }
  if (kind === "blinds") {
    return `<div id="${cid}" style="position:absolute;inset:-6%;z-index:9;display:flex;flex-direction:column;${vis}">${[0, 1, 2, 3, 4].map((k) => `<div class="${cid}-b" style="flex:1;background:${th.sageD};border-bottom:3px solid ${rgba(th.glow, 0.35)};transform-origin:${k % 2 ? "bottom" : "top"} center;${visible ? "" : "transform:scaleY(0);"}"></div>`).join("")}</div>`;
  }
  return `<div id="${cid}" style="position:absolute;inset:-6%;z-index:9;${vis}">
    <div class="${cid}-l" style="position:absolute;top:0;bottom:0;left:0;width:52%;background:${th.accent};${visible ? "" : "transform:translateX(-104%);"}"><div style="position:absolute;right:0;top:0;bottom:0;width:1cqw;background:${th.glow};"></div></div>
    <div class="${cid}-r" style="position:absolute;top:0;bottom:0;right:0;width:52%;background:${th.accent};${visible ? "" : "transform:translateX(104%);"}"><div style="position:absolute;left:0;top:0;bottom:0;width:1cqw;background:${th.glow};"></div></div>
  </div>`;
}
function coverOpen(cid, kind, T, L) {
  const d = r(Math.min(0.9, L * 0.13)), t0 = r(T + 0.12);
  if (kind === "iris") return [`tl.fromTo("#${cid}",{clipPath:"circle(122% at 50% 50%)"},{clipPath:"circle(0% at 50% 50%)",duration:${d},ease:"power2.inOut"},${t0});`, `kill("#${cid}",${r(t0 + d + 0.05)});`];
  if (kind === "blinds") return [`tl.fromTo("#${cid} .${cid}-b",{scaleY:1},{scaleY:0,duration:${r(d * 0.75)},ease:"power2.inOut",stagger:${r(d * 0.06)}},${t0});`, `kill("#${cid}",${r(t0 + d + 0.1)});`];
  return [
    `tl.fromTo("#${cid} .${cid}-l",{xPercent:0},{xPercent:-104,duration:${d},ease:"power2.inOut"},${t0});`,
    `tl.fromTo("#${cid} .${cid}-r",{xPercent:0},{xPercent:104,duration:${d},ease:"power2.inOut"},${t0});`,
    `kill("#${cid}",${r(t0 + d + 0.05)});`,
  ];
}
function coverClose(cid, kind, T, L) {
  const d = r(Math.min(0.8, L * 0.12)), t0 = r(T + L - d);
  const show = `tl.fromTo("#${cid}",{opacity:0},{opacity:1,duration:0.02,ease:"none"},${r(t0 - 0.02)});`;
  if (kind === "iris") return [show, `tl.fromTo("#${cid}",{clipPath:"circle(0% at 50% 50%)"},{clipPath:"circle(122% at 50% 50%)",duration:${d},ease:"power2.inOut"},${t0});`];
  if (kind === "blinds") return [show, `tl.fromTo("#${cid} .${cid}-b",{scaleY:0},{scaleY:1,duration:${r(d * 0.75)},ease:"power2.inOut",stagger:${r(d * 0.06)}},${t0});`];
  return [show,
    `tl.fromTo("#${cid} .${cid}-l",{xPercent:-104},{xPercent:0,duration:${d},ease:"power2.inOut"},${t0});`,
    `tl.fromTo("#${cid} .${cid}-r",{xPercent:104},{xPercent:0,duration:${d},ease:"power2.inOut"},${t0});`];
}
// Per-beat "camera": covers as camo enter/exit + the film's Frame dolly on cami
// (settle, slow push, rotateX/rotateY perspective sway — never still).
function stage(ctx) {
  const { id, T, L, i, isLast, theme: th } = ctx;
  const kIn = CKIND[i % 3], kOut = CKIND[(i + 1) % 3];
  const html = (i === 0 ? "" : coverHtml(`${id}-cvi`, kIn, th, true)) + (isLast ? "" : coverHtml(`${id}-cvo`, kOut, th, false));
  const s = [
    ...(i === 0 ? [] : coverOpen(`${id}-cvi`, kIn, T, L)),
    ...(isLast ? [] : coverClose(`${id}-cvo`, kOut, T, L)),
    i === 0 ? "" : `tl.fromTo("#${id}-camo",{scale:1.05},{scale:1,duration:${r(Math.min(1.2, L * 0.2))},ease:"expo.out"},${T});`,
    `tl.fromTo("#${id}-cami",{scale:1.008},{scale:1.062,duration:${r(L)},ease:"sine.inOut"},${T});`,
    `tl.to("#${id}-cami",{rotationX:1.2,duration:3.9,ease:"sine.inOut",yoyo:true,repeat:reps(${r(L)},3.9)},${T});`,
    `tl.to("#${id}-cami",{rotationY:1.6,duration:4.7,ease:"sine.inOut",yoyo:true,repeat:reps(${r(L)},4.7)},${T});`,
  ];
  return { html, s };
}

// ---- scenes -------------------------------------------------------------------

function hook(scene, ctx, a) {
  const { id, T, L, theme: th, land } = ctx;
  const st = stage(ctx);
  const kicker = fit(String(scene.kicker || scene.purpose || "one night only"), 26).toUpperCase();
  const sub = fit(String(scene.subtext || ""), 90);
  const hi = String(scene.emphasis || "").trim() || lastWord(scene.headline, "The premiere|you deserve");
  const ft = flipTitle(id, scene.headline, "The premiere|you deserve", land ? 84 : 108, th, land, { hi, color: th.paper, hiColor: th.glow });
  const card = card3d(id, browser(id, a, th, land, th.panel), th, land);
  const kickerHtml = `<div id="${id}-k" style="opacity:0;font-family:${FB};font-weight:800;font-size:${q(25, land)}cqw;letter-spacing:0.34em;color:${th.glow};margin-bottom:${q(34, land)}cqw;">${esc(kicker)}</div>`;
  const subHtml = sub ? `<div id="${id}-s" style="opacity:0;font-family:${FB};font-weight:500;font-size:${q(36, land)}cqw;color:${rgba(th.paper, 0.62)};margin-top:${q(44, land)}cqw;">${esc(sub)}</div>` : "";
  const html = (land
    ? `<div style="position:absolute;left:6cqw;top:50%;transform:translateY(-50%);width:45cqw;">
         ${kickerHtml}${ft.html}${subHtml}
       </div>
       <div id="${id}-cw" style="opacity:0;position:absolute;right:5cqw;top:15.2cqw;width:41cqw;height:25.6cqw;">${card}</div>`
    : `<div style="position:absolute;left:5.9cqw;right:5.9cqw;top:27.8cqw;text-align:center;">
         ${kickerHtml}
         <div style="display:flex;justify-content:center;">${ft.html}</div>
         <div id="${id}-cw" style="opacity:0;margin:${q(52, land)}cqw auto 0;width:81.5cqw;height:51.9cqw;">${card}</div>
         ${subHtml}
       </div>`) + st.html;
  const s = [
    ...st.s,
    rise(`#${id}-k`, T, L, 0),
    flipAnim(id, T, L, ft.total),
    rise(`#${id}-cw`, T, L, 4),
    sub ? rise(`#${id}-s`, T, L, 6) : "",
    ...card3dAnim(id, T, L, 0),
  ];
  return { html, s };
}

function statement(scene, ctx) {
  const { id, T, L, theme: th, land } = ctx;
  const st = stage(ctx);
  let lines = breakLines(scene.headline, "Most launches|whisper.").slice(0, 3);
  let mark = fit(String(scene.mark || scene.emphasis || ""), 18);
  if (!mark && lines.length > 1) mark = lines.pop();
  // The emphasis word is usually already IN the headline — shimmering it again
  // underneath printed the same word twice ("…PRODUCT DESERVES" / "PREMIERE").
  // Only keep the mark when it adds a line the headline doesn't already carry.
  if (mark && lines.join(" ").toLowerCase().includes(mark.toLowerCase())) mark = "";
  const sub = fit(String(scene.subtext || ""), 100);
  const hi = lastWord(lines.join("|"), "whisper.");
  const ft = flipTitle(id, lines.join("|"), "Most launches|whisper.", land ? 76 : 104, th, land, { hi, color: th.paper, hiColor: th.accent });
  // 9:16: the block ends at the subtext and leaves the lower half bare — flow the
  // scene's supporting points under the copy (see daybreak_composer's statement).
  const sup = land ? { html: "", s: [] } : E.supportList(`${id}-sup`, bullets(scene, 3), ctx, {
    flow: true, marginTop: q(46, land), font: q(34, land), fontFamily: FB,
    fg: rgba(th.paper, 0.7), dot: th.accent, max: 3,
  });
  const html = `<div style="position:absolute;left:${land ? 10 : 5.9}cqw;${land ? "top:50%;transform:translateY(-50%);width:72cqw;" : "right:5.9cqw;top:59.3cqw;"}">
    <div id="${id}-rule" style="opacity:0;width:${q(96, land)}cqw;height:${q(10, land)}cqw;border-radius:999px;background:${th.accent};box-shadow:0 0 2.2cqw ${rgba(th.accent, 0.7)};margin-bottom:${q(48, land)}cqw;"></div>
    ${ft.html}
    ${mark ? `<div id="${id}-mkw" style="opacity:0;margin-top:${q(26, land)}cqw;">${shimmer(`${id}-mk`, mark, land ? 96 : 135, th, land)}</div>` : ""}
    ${sub ? `<div id="${id}-s" style="opacity:0;font-family:${FB};font-weight:500;font-size:${q(37, land)}cqw;color:${rgba(th.paper, 0.65)};margin-top:${q(46, land)}cqw;max-width:${land ? 46 : 72}cqw;">${esc(sub)}</div>` : ""}
    ${sup.html}
  </div>` + st.html;
  const s = [
    ...st.s,
    rise(`#${id}-rule`, T, L, 0),
    `tl.fromTo("#${id}-rule",{scaleX:0},{scaleX:1,duration:0.8,ease:"power3.out",transformOrigin:"left center"},${r(T + 0.15)});`,
    flipAnim(id, T, L, ft.total, { stepFrac: 0.04 }),
    mark ? rise(`#${id}-mkw`, T, L, 5) : "",
    mark ? shimmerAnim(`${id}-mk`, T, L) : "",
    sub ? rise(`#${id}-s`, T, L, 8) : "",
    ...sup.s,
  ];
  return { html, s };
}

function feature(scene, ctx, a) {
  const { id, T, L, theme: th, land } = ctx;
  const st = stage(ctx);
  const chips = (Array.isArray(scene.chips) && scene.chips.length ? scene.chips : bullets(scene, 3)).slice(0, 3).map((c) => fit(String(c), 26));
  const hi = String(scene.emphasis || "").trim() || lastWord(scene.headline, "Tonight's|main feature.");
  const ft = flipTitle(id, scene.headline, "Tonight's|main feature.", land ? 68 : 96, th, land, { hi, color: th.paper, hiColor: th.glow });
  const card = card3d(id, browser(id, a, th, land, th.accent), th, land);
  const chipRow = chips.map((c) => `<div class="${id}-tag" style="opacity:0;display:inline-flex;align-items:center;gap:${q(16, land)}cqw;padding:${q(15, land)}cqw ${q(30, land)}cqw;border-radius:999px;background:${rgba(th.paper, 0.06)};border:2px solid ${rgba(th.glow, 0.5)};box-shadow:0 0 2.4cqw ${rgba(th.accent, 0.15)};font-family:${FB};font-weight:700;font-size:${q(30, land)}cqw;color:${th.paper};">
      <span style="width:${q(12, land)}cqw;height:${q(12, land)}cqw;border-radius:999px;background:${th.glow};box-shadow:0 0 1.1cqw ${th.glow};"></span>${esc(c)}</div>`).join("");
  const html = (land
    ? `<div style="position:absolute;left:6cqw;top:9cqw;width:38cqw;">
         ${ft.html}
         <div style="display:flex;flex-direction:column;gap:${q(18, land)}cqw;align-items:flex-start;margin-top:${q(46, land)}cqw;">${chipRow}</div>
       </div>
       <div id="${id}-cw" style="opacity:0;position:absolute;right:4.5cqw;top:13.6cqw;width:46cqw;height:29.2cqw;">${card}</div>`
    : `<div style="position:absolute;left:5.9cqw;right:5.9cqw;top:25cqw;">
         ${ft.html}
         <div id="${id}-cw" style="opacity:0;margin:${q(50, land)}cqw 0 ${q(46, land)}cqw;width:87.4cqw;height:55.6cqw;">${card}</div>
         <div style="display:flex;flex-direction:column;gap:${q(18, land)}cqw;align-items:flex-start;">${chipRow}</div>
       </div>`) + st.html;
  const s = [
    ...st.s,
    flipAnim(id, T, L, ft.total),
    rise(`#${id}-cw`, T, L, 3),
    `tl.fromTo("#${id} .${id}-tag",{opacity:0,x:120},{opacity:1,x:0,duration:${r(Math.min(1.1, L * 0.32))},ease:"back.out(1.5)",stagger:${r(Math.min(0.22, L * 0.09))}},${r(T + Math.min(2, L * 0.4))});`,
    ...card3dAnim(id, T, L, 1.4),
  ];
  return { html, s };
}

function montage(scene, ctx, a, b) {
  const { id, T, L, theme: th, land, dims } = ctx;
  const st = stage(ctx);
  const tiles = (Array.isArray(scene.tiles) && scene.tiles.length ? scene.tiles : bullets(scene, 4));
  const labels = [0, 1, 2, 3].map((i) => fit(String(tiles[i] || ["Opening shot", "The build", "The reveal", "Ovation"][i]), 14));
  const hi = lastWord(scene.headline, "Scene by|scene.");
  const ft = flipTitle(id, scene.headline, "Scene by|scene.", land ? 66 : 104, th, land, { hi, color: th.paper, hiColor: th.glow });
  // Film strip: panel frames with sprocket holes both sides, content ×4 so a
  // full-beat scroll never runs off the end; two strips counter-scroll.
  const geom = land
    ? { frameH: 17, gap: 1.3, mediaH: 11.5, top: 3, pos: [47, 73], w: 24, sets: 1.2 }
    : { frameH: 33.3, gap: 2.4, mediaH: 24, top: 51.9, pos: [5, 52.8], w: 43.5, sets: 1.4 };
  // Four film-strip frames, four assets. Each strip used to receive ONE asset and
  // fill only its j===0 frame, so half of every strip was a blank panel. Cycle a
  // short pool instead of leaving holes.
  const pool = (Array.isArray(ctx.media) && ctx.media.length ? ctx.media : [a, b]).filter(Boolean);
  const m = [0, 1, 2, 3].map((k) => (pool.length ? pool[k % pool.length] : null));
  const stripEl = (si, labs, assets) => {
    const frames = [];
    for (let rep = 0; rep < 4; rep++) for (let j = 0; j < labs.length; j++) {
      frames.push(`<div style="height:${geom.frameH}cqw;margin-bottom:${geom.gap}cqw;background:${th.panel};border-radius:${q(18, land)}cqw;padding:${q(14, land)}cqw ${q(30, land)}cqw;position:relative;">
        ${[0, 1].map((side) => `<div style="position:absolute;top:${q(12, land)}cqw;bottom:${q(12, land)}cqw;${side ? "right" : "left"}:${q(8, land)}cqw;width:${q(14, land)}cqw;display:flex;flex-direction:column;justify-content:space-between;">${Array.from({ length: 6 }, () => `<div style="width:${q(14, land)}cqw;height:${q(20, land)}cqw;border-radius:${q(4, land)}cqw;background:${th.ground};"></div>`).join("")}</div>`).join("")}
        <div style="height:${geom.mediaH}cqw;border-radius:${q(10, land)}cqw;overflow:hidden;margin:0 ${q(18, land)}cqw;">${slot(`${id}-im${si}r${rep}j${j}`, assets[j] || null, th, {})}</div>
        <div style="font-family:${FB};font-weight:700;font-size:${q(22, land)}cqw;color:${rgba(th.paper, 0.75)};text-align:center;margin-top:${q(10, land)}cqw;text-transform:uppercase;letter-spacing:0.1em;">${esc(labs[j])}</div>
      </div>`);
    }
    return `<div class="${id}-stw" style="opacity:0;position:absolute;left:${geom.pos[si]}cqw;top:${geom.top}cqw;bottom:0;width:${geom.w}cqw;overflow:hidden;">
      <div id="${id}-st${si}" style="position:absolute;left:0;right:0;will-change:transform;">${frames.join("")}</div>
    </div>`;
  };
  const distPx = r(geom.sets * 2 * (geom.frameH + geom.gap) * dims.width / 100);
  const html = `<div style="position:absolute;left:${land ? 6 : 5.9}cqw;${land ? "width:36cqw;top:16cqw;" : "right:5.9cqw;top:26.9cqw;"}z-index:2;">${ft.html}</div>
    ${stripEl(0, [labels[0], labels[1]], [m[0], m[1]])}${stripEl(1, [labels[2], labels[3]], [m[2], m[3]])}` + st.html;
  const s = [
    ...st.s,
    flipAnim(id, T, L, ft.total),
    `tl.fromTo("#${id} .${id}-stw",{opacity:0},{opacity:1,duration:${r(Math.min(1, L * 0.25))},ease:"none",stagger:0.15},${r(T + 0.2)});`,
    `tl.fromTo("#${id}-st0",{y:0},{y:${-distPx},duration:${r(L)},ease:"none"},${T});`,
    `tl.fromTo("#${id}-st1",{y:${-distPx}},{y:0,duration:${r(L)},ease:"none"},${T});`,
  ];
  return { html, s };
}

// Odometer — the film's digit roll: each digit is a masked column of 0-9 that
// spins down to its target (deeper digits spin further), expo.out. Values with
// >4 digits fall back to the engine's countTxt.
function numberBlock(oid, stt, sizePx, color, ctx, at) {
  const { land, dims, L } = ctx;
  const fs = q(sizePx, land);
  const digitsN = String(stt.v).replace(/[^0-9]/g, "").length;
  const sufHtml = stt.suf ? `<span style="font-family:${FH};font-size:${r(fs * 0.45)}cqw;color:${color};margin-left:0.9cqw;">${esc(stt.suf)}</span>` : "";
  if (digitsN > 4) {
    return {
      html: `<div style="display:flex;align-items:baseline;"><span id="${oid}" style="font-family:${FH};font-size:${fs}cqw;line-height:0.9;color:${color};font-variant-numeric:tabular-nums;">0</span>${sufHtml}</div>`,
      s: [`countTxt("#${oid}",${stt.v},${r(at)},${r(Math.min(1.8, L * 0.5))},"${esc(stt.pre || "")}","",${stt.isFloat ? 10 : 1});`],
    };
  }
  const dh = r(fs * 0.94);
  const dhPx = r(dh * dims.width / 100);
  const parts = [], s = [];
  if (stt.pre) parts.push(`<span style="font-family:${FH};font-size:${fs}cqw;color:${color};line-height:0.9;">${esc(stt.pre)}</span>`);
  let di = 0;
  for (const ch of String(stt.v)) {
    if (!/\d/.test(ch)) { parts.push(`<span style="font-family:${FH};font-size:${fs}cqw;color:${color};line-height:0.9;">${esc(ch)}</span>`); continue; }
    const d = +ch, k = di;
    const col = Array.from({ length: 10 * (k + 2) }, (_, n) => `<div style="font-family:${FH};font-size:${fs}cqw;color:${color};height:${dh}cqw;line-height:${dh}cqw;font-variant-numeric:tabular-nums;">${n % 10}</div>`).join("");
    parts.push(`<div style="height:${dh}cqw;overflow:hidden;"><div id="${oid}-d${k}" style="will-change:transform;">${col}</div></div>`);
    s.push(`tl.fromTo("#${oid}-d${k}",{y:0},{y:${r(-(10 * (k + 1) + d) * dhPx)},duration:${r(Math.min(1.6, L * 0.45))},ease:"expo.out"},${r(at + k * 0.12)});`);
    di++;
  }
  return { html: `<div style="display:flex;align-items:flex-end;">${parts.join("")}${sufHtml}</div>`, s };
}

function stats(scene, ctx) {
  const { id, T, L, theme: th, land } = ctx;
  const st = stage(ctx);
  const sts = statsOf(scene, 3);
  const rows = sts.length ? sts : [{ pre: "", v: 100, suf: "%", l: "worth the ticket", isFloat: false }];
  const cols = [th.glow, th.paper, th.sageL];
  const hi = lastWord(scene.headline, "The box office|report.");
  const ft = flipTitle(id, scene.headline, "The box office|report.", land ? 64 : 96, th, land, { hi, color: th.paper, hiColor: th.accent });
  const numAnims = [];
  const rowHtml = rows.map((stt, i) => {
    const num = numberBlock(`${id}-o${i}`, stt, land ? 96 : 168, cols[i % 3], ctx, r(T + Math.min(1, L * 0.12) + i * Math.min(0.6, L * 0.08)));
    numAnims.push(...num.s);
    return `<div class="${id}-row" style="opacity:0;display:flex;align-items:center;gap:${q(40, land)}cqw;border-bottom:2px solid ${rgba(th.glow, 0.22)};padding-bottom:${q(34, land)}cqw;">
      ${num.html}
      <div style="font-family:${FB};font-weight:600;font-size:${q(37, land)}cqw;color:${rgba(th.paper, 0.72)};max-width:${land ? 26 : 44}cqw;">${esc(stt.l || "")}</div>
    </div>`;
  }).join("");
  const html = (land
    ? `<div style="position:absolute;left:6cqw;top:10cqw;width:30cqw;">${ft.html}</div>
       <div style="position:absolute;left:40cqw;right:8cqw;top:8cqw;display:flex;flex-direction:column;gap:${q(60, land)}cqw;">${rowHtml}</div>`
    : `<div style="position:absolute;left:5.9cqw;right:5.9cqw;top:31.5cqw;">
         ${ft.html}
         <div style="margin-top:${q(70, land)}cqw;display:flex;flex-direction:column;gap:${q(60, land)}cqw;">${rowHtml}</div>
       </div>`) + st.html;
  const s = [
    ...st.s,
    flipAnim(id, T, L, ft.total),
    `tl.fromTo("#${id} .${id}-row",{opacity:0,y:44},{opacity:1,y:0,duration:${r(Math.min(1.3, L * 0.38))},ease:"expo.out",stagger:${r(Math.min(0.24, L * 0.06))}},${r(T + Math.min(0.9, L * 0.1))});`,
    ...numAnims,
  ];
  return { html, s };
}

function cta(scene, ctx, a) {
  const { id, T, L, theme: th, land, brand, url } = ctx;
  const st = stage(ctx);
  const label = fit(String(scene.cta || scene.buttonLabel || "Take your seat"), 24);
  // 9:16: the closing block ends at the url with the lower sheet empty — close on
  // the film's own proof points rather than dead ground (see statement above).
  const supC = land ? { html: "", s: [] } : E.supportList(`${id}-supc`, bullets(scene, 3), ctx, {
    flow: true, marginTop: q(44, land), font: q(33, land), fontFamily: FB,
    fg: rgba(th.paper, 0.72), dot: th.accent, max: 3,
  });
  const hi = String(scene.emphasis || "").trim() || lastWord(scene.headline, "Take your|seat.");
  const ft = flipTitle(id, scene.headline, "Take your|seat.", land ? 92 : 140, th, land, { hi, color: th.paper, hiColor: th.glow });
  const logo = a && a.path
    ? `<img src="${esc(a.path)}" alt="logo" style="width:100%;height:100%;object-fit:cover;">`
    : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:${th.accent};color:${th.btnInk};font-family:${FH};font-size:${q(64, land)}cqw;">${esc(String(brand).slice(0, 1).toUpperCase())}</div>`;
  const btnAt = T + Math.min(1.6, L * 0.28);
  const btnDur = Math.min(1, Math.max(0.4, L * 0.18));
  const html = `<div style="position:absolute;left:${land ? 15 : 5.9}cqw;right:${land ? 15 : 5.9}cqw;top:${land ? 5.5 : 48.1}cqw;text-align:center;">
    <div id="${id}-lg" style="opacity:0;width:${q(140, land)}cqw;height:${q(140, land)}cqw;border-radius:999px;overflow:hidden;margin:0 auto ${q(48, land)}cqw;box-shadow:0 0 4.6cqw ${rgba(th.accent, 0.4)};">${logo}</div>
    <div style="display:flex;justify-content:center;">${ft.html}</div>
    <div id="${id}-btn" style="opacity:0;display:inline-flex;align-items:center;gap:${q(16, land)}cqw;margin-top:${q(56, land)}cqw;padding:${q(27, land)}cqw ${q(56, land)}cqw;border-radius:999px;background:${th.accent};color:${th.btnInk};font-family:${FH};font-size:${q(46, land)}cqw;box-shadow:0 0 4.5cqw ${rgba(th.accent, 0.55)};">${esc(label)}
      <svg viewBox="0 0 24 24" fill="none" stroke="${th.btnInk}" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round" style="width:${q(38, land)}cqw;height:${q(38, land)}cqw;"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>
    </div>
    <div id="${id}-uw" style="opacity:0;margin-top:${q(46, land)}cqw;">${shimmer(`${id}-url`, url, land ? 30 : 40, th, land, { font: FB, extra: "font-weight:800;letter-spacing:0.06em;text-transform:none;" })}</div>
    <div style="display:flex;justify-content:center;">${supC.html}</div>
  </div>` + st.html;
  const s = [
    ...st.s,
    pop(`#${id}-lg`, L, r(T + Math.min(0.6, L * 0.08))),
    ...supC.s,
    flipAnim(id, T, L, ft.total),
    pop(`#${id}-btn`, L, r(btnAt)),
    `tl.to("#${id}-btn",{scale:1.03,duration:1.3,ease:"sine.inOut",yoyo:true,repeat:reps(${r(Math.max(1, L - 2))},1.3)},${r(btnAt + btnDur + 0.1)});`,
    rise(`#${id}-uw`, T, L, 6),
    shimmerAnim(`${id}-url`, T, L),
  ];
  return { html, s };
}

const SCENES = { hook, statement, feature, montage, stats, cta };

// ---- chrome: the living premiere house + brand chip + progress rail -----------
// Track 1 (under scenes): dark house, sweeping spotlight cones, drifting glow.
// Track 39 (over scenes): chasing marquee bulb rails top+bottom, vignette,
// jittering film grain, brand chip, per-scene progress rail.
function chrome({ theme: th, D, brand, count, land, r: rr, esc: esch }) {
  const bulbN = land ? 21 : 13;
  const rail = (topPct) => `<div style="position:absolute;left:3.7%;right:3.7%;top:${topPct}%;display:flex;justify-content:space-between;">${Array.from({ length: bulbN }, () => `<div class="pn-bulb" style="width:${land ? 0.8 : 1.5}cqw;height:${land ? 0.8 : 1.5}cqw;border-radius:999px;background:${th.glow};opacity:0.3;box-shadow:0 0 ${land ? 1 : 1.7}cqw ${rgba(th.glow, 0.75)};"></div>`).join("")}</div>`;
  const coneW = land ? 30 : 62, coneH = land ? 64 : 186;
  const cone = (i, xPct, col) => `<div id="pn-cone${i}" style="position:absolute;top:-5%;left:calc(${xPct}% - ${coneW / 2}cqw);width:${coneW}cqw;height:${coneH}cqw;clip-path:polygon(50% 0,0 100%,100% 100%);background:linear-gradient(180deg,${rgba(col, 0.16)},${rgba(col, 0)} 82%);transform-origin:50% 0;will-change:transform;"></div>`;
  const html = `
  <div id="pn-world" class="clip" data-start="0" data-duration="__D__" data-track-index="1" data-layout-allow-occlusion style="opacity:0;background:${th.ground};">
    <div style="position:absolute;inset:0;background:radial-gradient(circle at 50% 6%, ${rgba(th.glow, 0.08)}, transparent 52%);"></div>
    ${cone(0, 30, th.glow)}${cone(1, 72, th.accent)}
    <div id="pn-ball" style="position:absolute;left:24%;top:9%;width:${land ? 10 : 19}cqw;height:${land ? 10 : 19}cqw;border-radius:999px;background:${rgba(th.glow, 0.06)};filter:blur(6px);"></div>
  </div>
  <div id="pn-fx" class="clip" data-start="0" data-duration="__D__" data-track-index="39" data-layout-allow-occlusion style="opacity:0;background:none;">
    ${rail(land ? 2.4 : 1.6)}${rail(land ? 95 : 96.9)}
    <div style="position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 120% 90% at 50% 42%, transparent 55%, ${rgba(mix(th.ground, "#000000", 0.85), 0.55)} 100%);"></div>
    <svg id="pn-grain" style="position:absolute;top:-2%;left:-2%;width:104%;height:104%;opacity:0.05;pointer-events:none;"><filter id="pn-gr"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2"/></filter><rect width="100%" height="100%" filter="url(#pn-gr)"/></svg>
    <div style="position:absolute;top:${land ? 4 : 2.9}%;left:${land ? 3.5 : 5.9}%;display:flex;align-items:center;gap:1.4cqw;">
      <div style="width:${land ? 2.4 : 4.3}cqw;height:${land ? 2.4 : 4.3}cqw;border-radius:999px;background:${th.accent};box-shadow:0 0 2.4cqw ${rgba(th.accent, 0.6)};display:flex;align-items:center;justify-content:center;">
        <svg viewBox="0 0 24 24" fill="none" stroke="${th.btnInk}" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round" style="width:55%;height:55%;"><path d="M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/></svg>
      </div>
      <span style="font-family:${FH};font-size:${land ? 1.7 : 3}cqw;color:${th.paper};">${esch(brand)}</span>
    </div>
  </div>`;
  const script = `
  tl.fromTo("#pn-world",{opacity:0},{opacity:1,duration:0.5},0);
  tl.fromTo("#pn-fx",{opacity:0},{opacity:1,duration:0.5},0.15);
  tl.fromTo("#pn-cone0",{rotation:-16},{rotation:16,duration:6.3,ease:"sine.inOut",yoyo:true,repeat:reps(${rr(D)},6.3)},0);
  tl.fromTo("#pn-cone1",{rotation:14},{rotation:-14,duration:6.3,ease:"sine.inOut",yoyo:true,repeat:reps(${rr(D)},6.3)},0);
  tl.fromTo("#pn-ball",{x:-40},{x:40,duration:6.3,ease:"sine.inOut",yoyo:true,repeat:reps(${rr(D)},6.3)},0);
  tl.fromTo(".pn-bulb",{opacity:0.3},{opacity:1,duration:0.35,ease:"sine.inOut",yoyo:true,repeat:reps(${rr(D)},0.35),stagger:0.09},0);
  tl.to("#pn-grain",{x:4,duration:0.13,ease:"steps(1)",yoyo:true,repeat:reps(${rr(D)},0.13)},0);
  tl.to("#pn-grain",{y:-3,duration:0.19,ease:"steps(1)",yoyo:true,repeat:reps(${rr(D)},0.19)},0);`;
  return { html, script };
}

// No per-scene chrome — the segmented progress rail was removed (it read as a
// slideshow ticking through slides).

function styleBlock(th) {
  return `${th.fontFace}
  #root { font-family:${FB}; }
  .camo { perspective:1600px; }
  #cap-pill { background:${rgba(th.panel, 0.92)}; border:1px solid ${rgba(th.glow, 0.4)} !important; }
  #cap-text { font-family:${FB}; color:${th.paper}; }`;
}

const family = {
  theme, styleBlock, chrome, SCENES, TEMPLATE_SCENES, route, mediaSlots, mediaFallback, wantsLogo,
  // Empty slots in this pack render a featureless placeholder card, so a
  // REPEAT of a real screenshot/photo beats leaving one blank.
  recycleMedia: true,
  fallbackType: "statement",
  variants: 1,
  camera: { enabled: false }, // the film's own dolly + covered cuts are baked per scene
};

function buildComposition(opts) { return E.buildFilm(family, opts); }
// This pack's media demand + what filled each slot, WITHOUT rendering. Runs the
// exact routing and slot-filling the renderer runs, so the manifest can never
// drift from the film that ships.
function planMedia(opts) { return E.planMedia(family, opts); }

module.exports = { buildComposition, planMedia, TEMPLATE_SCENES };
