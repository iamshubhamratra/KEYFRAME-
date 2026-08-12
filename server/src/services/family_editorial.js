// EDITORIAL-QUIET family template — the authored scene grammar for the print /
// museum-catalog / analyst-report packs (atelier, cartesian, capsule,
// biennale-yellow, flux-analytics, signal-mono, blueprint-atelier).
//
// These packs used to render through scene_kit's SHARED archetypes, so a warm
// ivory fashion editorial and a near-black analyst dashboard drew the same
// feature-card row as every other pack in the gallery. This file gives the whole
// family its own grammar — seven authored scenes that only make sense as a
// printed spread: page margins, hairline rules, small-caps labels, figure plates
// with captions, a ruled table, footnotes, a colophon.
//
// Its whole identity is RESTRAINT. Where family_poster slams, this one settles:
// nothing whips, nothing scales past 1.05, type fades and rises a hair. Every
// pack still keeps its OWN skin — colours, ground and fonts come from
// scene_kit.deriveTheme(pack), so atelier stays espresso-on-ivory and
// signal-mono stays cyan-on-near-black. `variant` (hashed from the pack name)
// flips staging per pack so two packs in the family never compose identically.
//
// The render contract (seek-safety, tracks, hard kills, caption node, camera) is
// the engine's — see template_engine.js. This module is design only.

const { deriveTheme } = require("./scene_kit");
const E = require("./template_engine");
// The shared motion vocabulary — see services/motion_presets.js. Physics for
// headlines and cards lives there now, so every template moves alike.
const MOTION = require("./motion_presets");
const { esc, r, rgba, mix, statsOf, breakLines, bullets, fit, mineStat, isScreenshot } = E;

// ---- theme -------------------------------------------------------------------
// The pack's own resolved identity + the editorial family's paper furniture.
// A pack whose serif display face failed to bundle collapses to the UI sans
// (cartesian declares Playfair, capsule declares Bodoni — neither ships), which
// would erase the print identity, so the family lends it a real book face. Packs
// whose display type IS their identity (Fraunces, Instrument Serif, IBM Plex
// Mono, Space Grotesk) are left completely alone.
const GENERIC_UI = /^(inter|system-ui|roboto|arial|helvetica|segoe)/i;

function theme(manifest, brandSkin, { framePack } = {}) {
  const t = deriveTheme(framePack, {}, brandSkin);
  const accents = (t.accents && t.accents.length ? t.accents : ["#8A8178", "#C4674E"]).slice(0, 4);
  const ink = t.ink || "#14130E";
  const raw = t.displayStack || t.fontStack || "Georgia, serif";
  const lead = ((String(raw).match(/^\s*'?([^',]+)'?/) || [])[1] || "").trim();
  const displayStack = GENERIC_UI.test(lead) ? `Georgia, 'Times New Roman', ${raw}` : raw;
  return {
    ...t,
    accent: accents[0],
    // Accents are tuned for FILLS. As small text they can sit at 2.9:1 on the
    // pack ground (measured across the gallery), so text use goes through a
    // guaranteed-AA variant while fills keep the raw hue.
    accentText: E.readable(t.ground, accents[0], 1, 4.5),
    accentText2: E.readable(t.ground, accents[1] || accents[0], 1, 4.5),
    accent2: accents[1] || accents[0],
    ink,
    rule: rgba(ink, t.isDark ? 0.36 : 0.32),
    hair: rgba(ink, t.isDark ? 0.2 : 0.18),
    // Alpha on TEXT silently kills contrast: faint measured 3.12:1 on the paper
    // (the small-caps section labels). Both are guaranteed against the ground.
    copy: E.readable(t.ground, ink, 0.82, 4.5),
    faint: E.readable(t.ground, ink, 0.56, 4.5),
    mat: t.isDark ? mix(t.ground, "#FFFFFF", 0.07) : mix(t.ground, "#FFFFFF", 0.55),
    // …and the same tiers again for small copy that sits on the MAT rather than
    // on the paper. The mat is up to 55% toward white, so a colour guaranteed
    // against the ground lands short on it — the section labels and figure
    // numbers measured 3.92-4.4:1 against a 4.5 floor exactly this way. Target 6
    // so a tinted panel or a rule underneath cannot eat the remaining margin.
    matAccent: E.readable(t.isDark ? mix(t.ground, "#FFFFFF", 0.07) : mix(t.ground, "#FFFFFF", 0.55), accents[0], 1, 6),
    matFaint: E.readable(t.isDark ? mix(t.ground, "#FFFFFF", 0.07) : mix(t.ground, "#FFFFFF", 0.55), ink, 1, 6),
    displayStack,
    bodyStack: t.fontStack || "system-ui, sans-serif",
    fontFace: t.fontFace || "",
  };
}

// ---- published vocabulary (Template Director casts onto these) ----------------
const TEMPLATE_SCENES = [
  {
    type: "titlespread", bestFor: "the opening title page of the film",
    look: "A quiet title spread: a small-caps dateline over a hairline that draws slowly across the page, then a serif headline settling line by line into deep white space, a short accent rule and a standfirst beneath.",
    slots: { lines: "1-3 headline lines, max 26 chars each", kicker: "dateline, max 26 chars", standfirst: "one sentence, max 130 chars" },
    media: [],
  },
  {
    type: "feature", bestFor: "a capability or idea explained at length",
    look: "A two-column article: a small-caps section label and serif headline in the left column, a lede paragraph with a drop cap in the right, divided by a vertical hairline that draws downward, with a ruled note beneath.",
    slots: { kicker: "section label, max 22 chars", headline: "max 2 short lines", body: "the lede paragraph, max 240 chars", detail: "a short ruled note, max 60 chars" },
    media: [],
  },
  {
    type: "plate", bestFor: "a product screen or photograph presented as a figure",
    look: "A figure plate: the image matted inside a hairline frame with wide page margins, a running head above it and a small-caps 'Fig.' caption set beneath, plus an optional inset detail crop.",
    slots: { kicker: "running head, max 22 chars", headline: "max 2 short lines", caption: "figure caption, max 90 chars" },
    media: ["photo", "photo"], mediaMin: 1,
  },
  {
    type: "ledger", bestFor: "figures, measured proof, a comparison table",
    look: "A ruled data table: a double rule over rows of small-caps labels, each with its figure right-aligned in the display face and counting up slowly, hairlines between and a double rule to close.",
    slots: { kicker: "table label, max 22 chars", headline: "max 2 short lines", items: "2-4 rows, max 40 chars each", stats: "1-4 of {v: number, suf: '%'|'X'|'K'|'M'|'', l: label max 24 chars}" },
    media: [],
  },
  {
    type: "footnotes", bestFor: "steps, a short list of points, how something works",
    look: "A numbered footnote list: small raised numerals in the accent, the point set in the book face beside them, a hairline ruled under each entry, each fading up in turn.",
    slots: { kicker: "section label, max 22 chars", headline: "max 2 short lines", items: "2-4 entries, max 54 chars each" },
    media: [],
  },
  {
    type: "pullquote", bestFor: "a testimonial or one sentence worth setting apart",
    look: "A centred pull-quote in serif italic between two rules that draw outward from the middle of the page, with the attribution in small caps beneath.",
    slots: { quote: "max 150 chars, verbatim", author: "person's name", role: "role and/or company" },
    media: [],
  },
  {
    type: "colophon", bestFor: "the closing colophon and call to action",
    look: "A restrained closing colophon: a small diamond end-mark, the closing line in the book face, a thin outlined action label and the url set small in wide small caps under a hairline.",
    slots: { headline: "max 2 short lines", cta: "action label, max 20 chars", kicker: "max 22 chars" },
    media: [],
  },
];

// `plate` is the figure scene; `pullquote` now also carries a small testimonial
// portrait. Both are media-bearing, so a plate may follow a pullquote — imagery
// no longer has to strictly alternate with text (see route()).
const mediaSlots = { plate: ["photo", "photo"], pullquote: ["photo"] };

// ---- deterministic router (used when the director is off / uncast) -----------
function route(scene, i, total, ctx) {
  const k = String(scene.kind || "").toLowerCase();
  const p = String(scene.purpose || "").toLowerCase();
  if (i === 0 || k === "hook" || k === "title") return "titlespread";
  if (i === total - 1 || k === "cta" || p === "cta") return "colophon";
  if (k === "quote" || scene.quote || /testimonial/.test(p)) return "pullquote";
  if (k === "stat" || k === "chart" || statsOf(scene, 1).length) return "ledger";
  // MEDIA BEAT. The topic regex made this the emptiest family of all — a plate
  // needed the scene's kind/purpose to literally say "product/demo/proof", which
  // ordinary narrative beats never do, so films ran text-only past a single
  // plate. With assets to spare the regex is no longer required; this stays the
  // most restrained family by design — a plate never repeats directly after
  // another plate, but it MAY follow a different media beat (a pullquote's
  // testimonial portrait), so imagery need not strictly alternate with text.
  const onTopic = /product|screen|show|gallery|demo|feature|proof|result/.test(`${k} ${p}`);
  if ((ctx.pinned || ctx.hasShot || ctx.freeCount >= 1) && onTopic && ctx.prevType !== "plate") return "plate";
  if (ctx.freeCount >= 2 && ctx.prevType !== "plate") return "plate";
  if (bullets(scene, 4).length >= 2) return "footnotes";
  return ctx.prevType === "feature" ? "footnotes" : "feature";
}
const mediaFallback = (scene) => {
  // Keep a quote scene on its pullquote card (monogram fallback) when no photo is
  // free, instead of rerouting the testimonial away and dropping the quote.
  if (scene && (scene.quote || String(scene.kind || "").toLowerCase() === "quote" || /testimonial|review/.test(String(scene.purpose || "").toLowerCase()))) return null;
  return bullets(scene, 3).length >= 2 ? "footnotes" : (statsOf(scene, 1).length ? "ledger" : "feature");
};

// ---- shared page furniture ----------------------------------------------------
// Page margin, hairline weight and the small-caps label size, per orientation.
const M = (land) => (land ? 10 : 8);
const HAIR = (land) => (land ? 0.1 : 0.18);
const LAB = (land) => (land ? 0.95 : 1.6);
const COPY = (land) => (land ? 1.3 : 2.05);

const caps = (txt, th, land, color, extra) =>
  `<span style="font-family:${th.bodyStack};font-size:${r(LAB(land))}cqw;letter-spacing:0.3em;text-transform:uppercase;white-space:nowrap;color:${color || th.matFaint};${extra || ""}">${esc(txt)}</span>`;

// Display size that keeps the longest line inside a column `col` cqw wide.
// ~0.5em average advance for a book face at normal tracking.
function serifSize(lines, col, cap, min) {
  const longest = Math.max(...lines.map((l) => String(l).length), 1);
  const v = (col / longest) / 0.5;
  return r(Math.max(min, Math.min(cap, v)));
}

// Soft line-wrap for verbatim copy (quotes) — the engine's breakLines only halves.
function wrapLines(text, perLine, maxLines) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  const out = [];
  let cur = "";
  for (const w of words) {
    if (cur && (cur + " " + w).length > perLine) { out.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) out.push(cur);
  if (out.length > maxLines) return out.slice(0, maxLines - 1).concat(out.slice(maxLines - 1).join(" "));
  return out.filter(Boolean);
}

// Headline lines that are never empty — the storyboard first, the brand last.
function headLines(scene, ctx, max) {
  const raw = (Array.isArray(scene.lines) && scene.lines.length ? scene.lines : breakLines(scene.headline, ""))
    .map((x) => String(x).trim()).filter(Boolean);
  const out = raw.length ? raw : [String(ctx.brand || "")].filter(Boolean);
  return (out.length ? out : ["—"]).slice(0, max || 3);
}

const serifLines = (lines, size, color, cls, th, extra) => lines
  .map((ln) => `<div class="${cls}" style="opacity:0;font-family:${th.displayStack};font-weight:400;font-size:${r(size)}cqw;line-height:1.12;letter-spacing:-0.012em;color:${color};${extra || ""}">${esc(ln)}</div>`)
  .join("");

// A hairline that draws. `origin` picks which end it grows from.
const hairline = (idOrCls, th, land, color, origin, extra) =>
  `<div ${idOrCls} style="height:${r(HAIR(land))}cqw;background:${color || th.hair};transform-origin:${origin || "left center"};${extra || ""}"></div>`;

const ROMAN = ["I", "II", "III", "IV", "V"];

// ---- scenes -------------------------------------------------------------------

function titlespread(scene, ctx) {
  const { id, T, theme: th, land, brand, variant } = ctx;
  const lines = headLines(scene, ctx, 3);
  const dateline = fit(String(scene.kicker || scene.purpose || brand || ""), 26).toUpperCase();
  const stand = fit(String(scene.standfirst || scene.subtext || scene.body || ""), land ? 130 : 96);
  const m = M(land);
  const col = 100 - 2 * m;
  const size = serifSize(lines, col * (land ? 0.9 : 1), land ? 8.4 : 11.4, land ? 2.4 : 3.4);
  const centred = variant % 3 === 1;
  const head = centred
    ? `<div style="display:flex;align-items:center;justify-content:center;gap:1.6cqw;width:100%;">
        ${hairline(`class="${id}-dr"`, th, land, th.rule, "right center", `flex:0 0 ${land ? 12 : 14}cqw;`)}
        <span id="${id}-date" style="opacity:0;">${caps(dateline, th, land, th.faint)}</span>
        ${hairline(`class="${id}-dr"`, th, land, th.rule, "left center", `flex:0 0 ${land ? 12 : 14}cqw;`)}
      </div>`
    : `<div style="display:flex;align-items:center;gap:1.6cqw;width:100%;">
        <span id="${id}-date" style="opacity:0;flex:0 0 auto;">${caps(dateline, th, land, th.faint)}</span>
        ${hairline(`class="${id}-dr"`, th, land, th.rule, "left center", "flex:1 1 auto;")}
      </div>`;
  // A title page uses the WHOLE sheet: dateline at the head, the headline set on
  // the optical centre, the standfirst dropped to the foot.
  const html = `
    <div style="position:absolute;left:${m}cqw;right:${m}cqw;top:14%;bottom:14%;display:flex;flex-direction:column;justify-content:space-between;${centred ? "align-items:center;text-align:center;" : "align-items:flex-start;"}">
      ${head}
      <div style="${centred ? "" : "max-width:100%;"}">
        ${serifLines(lines, size, th.ink, `${id}-line`, th)}
        <div id="${id}-krule" style="margin-top:${land ? 2 : 3}cqw;width:${land ? 9 : 13}cqw;height:${r(HAIR(land) * 2.6)}cqw;background:${th.accent};transform-origin:${centred ? "center" : "left"} center;${centred ? "margin-left:auto;margin-right:auto;" : ""}"></div>
      </div>
      ${stand
      ? `<div id="${id}-stand" style="opacity:0;max-width:${land ? 54 : 92}%;font-family:${th.displayStack};font-size:${r(COPY(land) * 1.12)}cqw;line-height:1.62;color:${th.copy};overflow-wrap:break-word;">${esc(stand)}</div>`
      : `<div style="height:${land ? 1 : 1.6}cqw;"></div>`}
    </div>`;
  const s = [
    `tl.fromTo("#${id}-date",{opacity:0,y:${land ? 10 : 14}},{opacity:1,y:0,duration:0.8,ease:"power2.out"},${r(T + 0.15)});`,
    `tl.fromTo(".${id}-dr",{scaleX:0},{scaleX:1,duration:1.25,ease:"power2.inOut"},${r(T + 0.25)});`,
    `tl.fromTo("#${id}-krule",{scaleX:0},{scaleX:1,duration:0.85,ease:"power2.out"},${r(T + 1)});`,
    stand ? `tl.fromTo("#${id}-stand",{opacity:0,y:${land ? 12 : 16}},{opacity:1,y:0,duration:0.85,ease:"power2.out"},${r(T + 1.2)});` : "",
  ];
  return { html, s };
}

function feature(scene, ctx) {
  const { id, T, theme: th, land, variant } = ctx;
  const lines = headLines(scene, ctx, 2);
  const label = fit(String(scene.kicker || scene.purpose || ""), 22).toUpperCase();
  const bodyText = String(scene.body || scene.subtext || "").trim();
  const bl = bullets(scene, 3);
  const lede = fit(bodyText || bl[0] || "", land ? 250 : 190);
  const detail = fit(String(scene.detail || scene.emphasis || (bodyText ? "" : bl[1] || "")).trim(), 60);
  const m = M(land);
  const page = 100 - 2 * m;
  const leftPct = variant % 3 === 2 ? 42 : 47;
  const headCol = land ? page * (leftPct / 100) * 0.94 : page;
  const size = serifSize(lines, headCol, land ? 5.2 : 7, land ? 1.7 : 2.6);
  const dropInk = variant % 3 === 2 ? th.accent2 : th.accent;
  // A drop cap needs a paragraph to sit in — on a one-line lede it reads as a typo.
  const drop = lede.length >= 60;
  const ledeHtml = lede
    ? `<div id="${id}-lede" style="opacity:0;font-family:${th.displayStack};font-size:${r(COPY(land) * (drop ? 1 : 1.25))}cqw;line-height:1.66;color:${th.copy};overflow-wrap:break-word;">
        ${drop ? `<span style="float:left;font-family:${th.displayStack};font-size:${r(COPY(land) * 3.1)}cqw;line-height:0.84;padding-right:${land ? 0.55 : 0.9}cqw;color:${dropInk};">${esc(lede.slice(0, 1))}</span>${esc(lede.slice(1))}` : esc(lede)}
      </div>` : "";
  const detailHtml = detail
    ? `<div style="margin-top:${land ? 2 : 3}cqw;">
        ${hairline(`id="${id}-drule"`, th, land, th.hair, "left center", "")}
        <div id="${id}-detail" style="opacity:0;margin-top:${land ? 0.9 : 1.4}cqw;">
          ${caps("Note", th, land, th.accentText, `margin-right:${land ? 1.2 : 1.8}cqw;`)}
          <span style="font-family:${th.displayStack};font-size:${r(COPY(land) * 0.95)}cqw;line-height:1.5;color:${th.faint};">${esc(detail)}</span>
        </div>
      </div>` : "";
  const leftBlock = `
      <div style="${land ? `flex:0 0 ${leftPct}%;` : ""}display:flex;flex-direction:column;justify-content:${land ? "center" : "flex-start"};">
        ${label ? `<div id="${id}-lab" style="opacity:0;display:flex;align-items:center;gap:1.1cqw;margin-bottom:${land ? 1.4 : 2.2}cqw;">${caps(label, th, land, th.matAccent)}<span style="display:inline-block;width:${land ? 3.2 : 4.6}cqw;height:${r(HAIR(land) * 2)}cqw;background:${th.accent};"></span></div>` : ""}
        <div>${serifLines(lines, size, th.ink, `${id}-line`, th)}</div>
      </div>`;
  const rightBlock = `
      <div style="${land ? "flex:1 1 auto;" : `margin-top:${lede || detail ? 3.4 : 0}cqw;`}display:flex;flex-direction:column;justify-content:${land && detail ? "space-between" : (land ? "center" : "flex-start")};${land ? "padding-left:3.4cqw;" : ""}">
        ${ledeHtml}
        ${detailHtml}
      </div>`;
  const divider = land && (lede || detail)
    ? `<div id="${id}-vr" style="flex:0 0 ${r(HAIR(land))}cqw;align-self:stretch;background:${th.hair};transform-origin:center top;margin:0 0 0 ${land ? 3 : 0}cqw;"></div>`
    : "";
  const html = `
    <div style="position:absolute;left:${m}cqw;right:${m}cqw;top:16%;bottom:15%;display:flex;flex-direction:${land ? "row" : "column"};align-items:${land ? "stretch" : "flex-start"};">
      ${leftBlock}
      ${divider}
      ${rightBlock}
    </div>`;
  const s = [
    label ? `tl.fromTo("#${id}-lab",{opacity:0,y:${land ? 9 : 12}},{opacity:1,y:0,duration:0.7,ease:"power2.out"},${r(T + 0.15)});` : "",
    divider ? `tl.fromTo("#${id}-vr",{scaleY:0},{scaleY:1,duration:1.1,ease:"power2.inOut"},${r(T + 0.5)});` : "",
    lede ? `tl.fromTo("#${id}-lede",{opacity:0,y:${land ? 12 : 16}},{opacity:1,y:0,duration:0.9,ease:"power2.out"},${r(T + 0.85)});` : "",
    detail ? `tl.fromTo("#${id}-drule",{scaleX:0},{scaleX:1,duration:0.9,ease:"power2.out"},${r(T + 1.25)});` : "",
    detail ? `tl.fromTo("#${id}-detail",{opacity:0,y:10},{opacity:1,y:0,duration:0.8,ease:"power2.out"},${r(T + 1.4)});` : "",
  ];
  return { html, s };
}

function plate(scene, ctx, a, b) {
  const { id, T, L, theme: th, land, brand } = ctx;
  const lines = headLines(scene, ctx, 2);
  const label = fit(String(scene.kicker || scene.purpose || ""), 22).toUpperCase();
  const m = M(land);
  const page = 100 - 2 * m;
  const size = serifSize(lines, page * (land ? 0.62 : 1), land ? 3.2 : 4.6, land ? 1.5 : 2.3);
  const figNo = String(ctx.i + 1).padStart(2, "0");
  const caption = fit(String(scene.caption || scene.subtext || (a && a.alt) || scene.headline || ""), 90);
  const shot = isScreenshot(a);
  const img = (asset, cls, fit2) => (asset && asset.path
    ? `<img class="${cls}" src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="width:100%;height:100%;object-fit:cover;object-position:${fit2};display:block;">`
    : `<div style="width:100%;height:100%;display:flex;flex-direction:column;justify-content:center;gap:${land ? 1.4 : 2.2}cqw;padding:${land ? 3 : 5}cqw;background:${th.mat};">
        ${[0, 1, 2, 3].map(() => `<div style="height:${r(HAIR(land))}cqw;background:${th.hair};"></div>`).join("")}
        <div style="text-align:center;padding:${land ? 1 : 2}cqw 0;">${caps(String(brand || "plate"), th, land, th.faint)}</div>
        ${[0, 1, 2].map(() => `<div style="height:${r(HAIR(land))}cqw;background:${th.hair};"></div>`).join("")}
      </div>`);
  const inset = b && b.path
    ? `<div id="${id}-inset" style="opacity:0;position:absolute;right:${land ? 1.6 : 2.4}cqw;bottom:${land ? 1.6 : 2.4}cqw;width:${land ? 15 : 26}cqw;height:${land ? 10 : 17}cqw;background:${th.mat};padding:${land ? 0.4 : 0.7}cqw;box-shadow:0 0 0 ${r(HAIR(land))}cqw ${th.rule};overflow:hidden;">
        ${img(b, `${id}-img2`, "center center")}
      </div>` : "";
  const html = `
    <div style="position:absolute;left:${m}cqw;right:${m}cqw;top:13%;bottom:12%;display:flex;flex-direction:column;">
      <div style="display:flex;align-items:center;gap:1.4cqw;">
        <span id="${id}-fig" style="opacity:0;flex:0 0 auto;">${caps(`Fig. ${figNo}`, th, land, th.accentText)}</span>
        ${label ? `<span id="${id}-lab" style="opacity:0;flex:0 0 auto;">${caps(label, th, land, th.matFaint)}</span>` : ""}
        ${hairline(`class="${id}-hr"`, th, land, th.hair, "left center", "flex:1 1 auto;")}
      </div>
      <div style="margin-top:${land ? 1.3 : 2.1}cqw;max-width:${land ? 66 : 100}%;">${serifLines(lines, size, th.ink, `${id}-line`, th)}</div>
      <div style="flex:1 1 auto;min-height:0;width:${land ? 78 : 100}%;margin:${land ? 1.8 : 2.8}cqw auto 0 auto;display:flex;flex-direction:column;">
        <div id="${id}-plate" style="opacity:0;flex:1 1 auto;min-height:0;position:relative;overflow:hidden;background:${th.mat};box-shadow:0 0 0 ${r(HAIR(land))}cqw ${th.rule};">
          ${img(a, `${id}-img`, shot ? "top center" : "center center")}
          ${inset}
        </div>
        <div id="${id}-cap" style="opacity:0;margin-top:${land ? 0.9 : 1.5}cqw;display:flex;align-items:baseline;gap:${land ? 1 : 1.6}cqw;">
          ${caps(`Fig. ${figNo}`, th, land, th.accentText)}
          <span style="font-family:${th.displayStack};font-style:italic;font-size:${r(COPY(land) * 0.92)}cqw;line-height:1.45;color:${th.faint};overflow-wrap:break-word;">${esc(caption)}</span>
        </div>
      </div>
    </div>`;
  const s = [
    `tl.fromTo("#${id}-fig",{opacity:0,y:8},{opacity:1,y:0,duration:0.7,ease:"power2.out"},${r(T + 0.15)});`,
    label ? `tl.fromTo("#${id}-lab",{opacity:0,y:8},{opacity:1,y:0,duration:0.7,ease:"power2.out"},${r(T + 0.25)});` : "",
    `tl.fromTo(".${id}-hr",{scaleX:0},{scaleX:1,duration:1.1,ease:"power2.inOut"},${r(T + 0.25)});`,
    a && a.path ? `tl.fromTo(".${id}-img",{scale:1},{scale:1.045,duration:${r(Math.max(1.2, L - 0.7))},ease:"sine.inOut"},${r(T + 0.7)});` : "",
    inset ? `tl.fromTo("#${id}-inset",{opacity:0,y:10},{opacity:1,y:0,duration:0.8,ease:"power2.out"},${r(T + 1.25)});` : "",
    caption ? `tl.fromTo("#${id}-cap",{opacity:0,y:9},{opacity:1,y:0,duration:0.8,ease:"power2.out"},${r(T + 1.15)});` : "",
  ];
  return { html, s };
}

function ledger(scene, ctx) {
  const { id, T, L, theme: th, land } = ctx;
  const lines = headLines(scene, ctx, 2);
  const label = fit(String(scene.kicker || scene.purpose || ""), 22).toUpperCase();
  const m = M(land);
  const page = 100 - 2 * m;
  const size = serifSize(lines, page * (land ? 0.7 : 1), land ? 3.9 : 5.4, land ? 1.6 : 2.4);

  const src = (Array.isArray(scene.items) && scene.items.length ? scene.items : bullets(scene, 4)).filter(Boolean);
  let rows = src.map((b) => {
    const st = mineStat(b);
    const lab = st ? (st.l || fit(String(b), 30)) : fit(String(b).replace(/^[\s—-]+/, ""), land ? 40 : 26);
    return { label: String(lab).toUpperCase(), st };
  });
  if (!rows.length) {
    rows = statsOf(scene, 4).map((st) => ({ label: String(st.l || fit(String(scene.headline || ""), 26)).toUpperCase(), st }));
  }
  if (!rows.length) rows = [{ label: fit(String(scene.headline || ctx.brand || ""), 30).toUpperCase(), st: null }];
  rows = rows.slice(0, 4);

  const numSize = land ? 3.6 : 4.8;
  const dot = land ? 0.62 : 1;
  const leader = `<span style="flex:1 1 auto;height:${r(dot)}cqw;background-image:radial-gradient(circle, ${th.hair} 36%, rgba(0,0,0,0) 38%);background-size:${r(dot)}cqw ${r(dot)}cqw;background-repeat:repeat-x;background-position:left bottom;"></span>`;
  const rowsHtml = rows.map((row, k) => `
      <div class="${id}-row" style="opacity:0;display:flex;align-items:baseline;gap:${land ? 1.6 : 2.4}cqw;padding:${land ? 0.6 : 1.9}cqw 0;">
        <span style="flex:0 0 auto;font-family:${th.bodyStack};font-size:${r(LAB(land) * 1.14)}cqw;letter-spacing:0.2em;text-transform:uppercase;color:${th.copy};">${esc(row.label)}</span>
        ${leader}
        ${row.st
      ? `<span id="${id}-n${k}" style="flex:0 0 auto;font-family:${th.displayStack};font-size:${r(numSize)}cqw;line-height:1;letter-spacing:-0.02em;color:${th.accentText};white-space:nowrap;">${esc(row.st.pre)}0${esc(row.st.suf)}</span>`
      : `<span style="flex:0 0 auto;font-family:${th.displayStack};font-size:${r(numSize * 0.62)}cqw;line-height:1;letter-spacing:0.14em;color:${th.accentText};white-space:nowrap;">${ROMAN[k] || String(k + 1)}</span>`}
      </div>
      ${k < rows.length - 1 ? hairline(`class="${id}-rl"`, th, land, th.hair, "left center", "") : ""}`).join("");

  // Landscape: the table fills the sheet, closing double rule on the foot margin.
  // Portrait: a 9:16 column is far too tall to spread 4 rows down — the table
  // would fall apart into disconnected lines — so it stays a centred block.
  const fillCol = land
    ? "flex:1 1 auto;min-height:0;display:flex;flex-direction:column;justify-content:space-between;"
    : "flex:0 0 auto;display:flex;flex-direction:column;";
  const html = `
    <div style="position:absolute;left:${m}cqw;right:${m}cqw;top:14%;bottom:13%;display:flex;flex-direction:column;justify-content:${land ? "flex-start" : "center"};">
      <div style="display:flex;align-items:center;gap:1.4cqw;">
        <span id="${id}-lab" style="opacity:0;flex:0 0 auto;">${caps(label || `Table ${String(ctx.i + 1).padStart(2, "0")}`, th, land, th.matAccent)}</span>
        ${hairline(`class="${id}-hr"`, th, land, th.hair, "left center", "flex:1 1 auto;")}
      </div>
      <div style="margin-top:${land ? 1.3 : 2.1}cqw;">${serifLines(lines, size, th.ink, `${id}-line`, th)}</div>
      <div style="${fillCol}margin-top:${land ? 2.2 : 3.4}cqw;">
        <div>
          ${hairline(`class="${id}-dbl"`, th, land, th.rule, "left center", `height:${r(HAIR(land) * 2.6)}cqw;`)}
          <div style="height:${land ? 0.5 : 0.8}cqw;"></div>
          ${hairline(`class="${id}-dbl"`, th, land, th.hair, "left center", "")}
        </div>
        ${rowsHtml}
        ${hairline(`class="${id}-dbl"`, th, land, th.rule, "right center", `height:${r(HAIR(land) * 2.6)}cqw;`)}
      </div>
    </div>`;
  const s = [
    `tl.fromTo("#${id}-lab",{opacity:0,y:8},{opacity:1,y:0,duration:0.7,ease:"power2.out"},${r(T + 0.15)});`,
    `tl.fromTo(".${id}-hr",{scaleX:0},{scaleX:1,duration:1.1,ease:"power2.inOut"},${r(T + 0.2)});`,
    `tl.fromTo(".${id}-dbl",{scaleX:0},{scaleX:1,duration:1,ease:"power2.inOut",stagger:0.1},${r(T + 0.65)});`,
    `tl.fromTo(".${id}-row",{opacity:0,y:${land ? 12 : 16}},{opacity:1,y:0,duration:0.8,ease:"power2.out",stagger:0.22},${r(T + 0.85)});`,
    rows.length > 1 ? `tl.fromTo(".${id}-rl",{scaleX:0},{scaleX:1,duration:0.85,ease:"power2.out",stagger:0.22},${r(T + 1)});` : "",
  ].concat(rows.map((row, k) => (row.st
    ? `countTxt("#${id}-n${k}",${r(row.st.v)},${r(T + 0.95 + k * 0.22)},${r(Math.min(1.8, Math.max(0.8, L * 0.5)))},${JSON.stringify(row.st.pre)},${JSON.stringify(row.st.suf)},${row.st.isFloat ? 10 : 1});`
    : "")));
  return { html, s };
}

function footnotes(scene, ctx) {
  const { id, T, theme: th, land } = ctx;
  const lines = headLines(scene, ctx, 2);
  const label = fit(String(scene.kicker || scene.purpose || ""), 22).toUpperCase();
  const m = M(land);
  const page = 100 - 2 * m;
  const size = serifSize(lines, page * (land ? 0.7 : 1), land ? 4.1 : 5.6, land ? 1.6 : 2.4);
  let items = (Array.isArray(scene.items) && scene.items.length ? scene.items : bullets(scene, 4))
    .map((x) => fit(String(x).trim(), land ? 56 : 40)).filter(Boolean).slice(0, 4);
  if (!items.length) {
    const one = fit(String(scene.subtext || scene.body || scene.headline || ""), 60);
    items = one ? [one] : [];
  }
  const itemSize = land ? Math.min(2.7, Math.max(1.35, 46 / Math.max(...items.map((x) => x.length), 1) * 1.6)) : 3.2;
  const rows = items.map((t, k) => `
      <div class="${id}-row" style="opacity:0;display:flex;align-items:flex-start;gap:${land ? 1.8 : 2.6}cqw;padding:${land ? 0.8 : 2.2}cqw 0;">
        <span style="flex:0 0 ${land ? 3 : 5}cqw;font-family:${th.bodyStack};font-size:${r(LAB(land) * 0.92)}cqw;letter-spacing:0.16em;color:${th.matAccent};padding-top:${land ? 0.35 : 0.6}cqw;">${String(k + 1).padStart(2, "0")}</span>
        <span style="font-family:${th.displayStack};font-size:${r(itemSize)}cqw;line-height:1.38;color:${th.ink};overflow-wrap:break-word;">${esc(t)}</span>
      </div>
      ${hairline(`class="${id}-rl"`, th, land, th.hair, "left center", "")}`).join("");
  // Landscape rules the list down the whole sheet; portrait keeps it a centred
  // block (spreading 4 entries over a 9:16 column reads as broken, not airy).
  const fillCol = land
    ? "flex:1 1 auto;min-height:0;display:flex;flex-direction:column;justify-content:space-between;"
    : "flex:0 0 auto;display:flex;flex-direction:column;";
  const html = `
    <div style="position:absolute;left:${m}cqw;right:${m}cqw;top:14%;bottom:13%;display:flex;flex-direction:column;justify-content:${land ? "flex-start" : "center"};">
      ${label ? `<div id="${id}-lab" style="opacity:0;margin-bottom:${land ? 1.3 : 2.1}cqw;">${caps(label, th, land, th.matAccent)}</div>` : ""}
      <div>${serifLines(lines, size, th.ink, `${id}-line`, th)}</div>
      <div style="${fillCol}margin-top:${land ? 2.2 : 3.4}cqw;">
        ${hairline(`class="${id}-top"`, th, land, th.rule, "left center", "")}
        ${rows}
      </div>
    </div>`;
  const s = [
    label ? `tl.fromTo("#${id}-lab",{opacity:0,y:8},{opacity:1,y:0,duration:0.7,ease:"power2.out"},${r(T + 0.15)});` : "",
    `tl.fromTo(".${id}-top",{scaleX:0},{scaleX:1,duration:1,ease:"power2.inOut"},${r(T + 0.6)});`,
    `tl.fromTo(".${id}-row",{opacity:0,y:${land ? 12 : 16}},{opacity:1,y:0,duration:0.8,ease:"power2.out",stagger:0.28},${r(T + 0.8)});`,
    `tl.fromTo(".${id}-rl",{scaleX:0},{scaleX:1,duration:0.8,ease:"power2.out",stagger:0.28},${r(T + 0.95)});`,
  ];
  return { html, s };
}

function pullquote(scene, ctx, a) {
  const { id, T, theme: th, land, brand } = ctx;
  const quote = fit(String(scene.quote || scene.subtext || scene.headline || ""), 150);
  const m = M(land);
  const colPct = land ? 68 : 96;
  const col = (100 - 2 * m) * (colPct / 100);
  const lines = wrapLines(quote, land ? 38 : 26, 4);
  const safe = lines.length ? lines : [String(brand || "")];
  const size = serifSize(safe, col, land ? 4.4 : 6, land ? 1.8 : 2.6);
  const author = fit(String(scene.author || scene.emphasis || ""), 30);
  const role = fit(String(scene.role || scene.purpose || ""), 34).toUpperCase();
  // Optional testimonial portrait — a small matted disc above the attribution.
  // Absent the asset the attribution stays exactly as before (text only).
  const portrait = a && a.path
    ? `<div style="width:${land ? 6 : 11}cqw;height:${land ? 6 : 11}cqw;border-radius:50%;overflow:hidden;background:${th.mat};box-shadow:0 0 0 ${r(HAIR(land) * 1.6)}cqw ${th.rule};margin-bottom:${land ? 1.2 : 1.8}cqw;">
        <img src="${esc(a.path)}" alt="${esc(a.alt || author || "")}" style="width:100%;height:100%;object-fit:cover;display:block;">
      </div>`
    : "";
  const html = `
    <div style="position:absolute;left:${m}cqw;right:${m}cqw;top:16%;bottom:16%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;">
      ${hairline(`class="${id}-rr"`, th, land, th.rule, "center", `width:${colPct}%;`)}
      <div style="margin:${land ? 2.6 : 4}cqw 0;width:${colPct}%;">
        ${safe.map((ln) => `<div class="${id}-q" style="opacity:0;font-family:${th.displayStack};font-style:italic;font-weight:400;font-size:${r(size)}cqw;line-height:1.36;letter-spacing:-0.01em;color:${th.ink};">${esc(ln)}</div>`).join("")}
      </div>
      ${hairline(`class="${id}-rr"`, th, land, th.rule, "center", `width:${colPct}%;`)}
      ${(author || role || portrait) ? `<div id="${id}-att" style="opacity:0;margin-top:${land ? 2 : 3.2}cqw;display:flex;flex-direction:column;align-items:center;gap:${land ? 0.6 : 1}cqw;">
        ${portrait}
        ${author ? `<span style="font-family:${th.displayStack};font-size:${r(COPY(land) * 1.02)}cqw;color:${th.ink};">${esc(author)}</span>` : ""}
        ${role ? caps(role, th, land, th.faint) : ""}
      </div>` : ""}
    </div>`;
  const s = [
    `tl.fromTo(".${id}-rr",{scaleX:0},{scaleX:1,duration:1.2,ease:"power2.inOut",stagger:0.12},${r(T + 0.15)});`,
    `tl.fromTo(".${id}-q",{opacity:0,y:${land ? 14 : 18}},{opacity:1,y:0,duration:0.9,ease:"power2.out",stagger:0.2},${r(T + 0.45)});`,
    (author || role || portrait) ? `tl.fromTo("#${id}-att",{opacity:0,y:12},{opacity:1,y:0,duration:0.85,ease:"power2.out"},${r(T + 1.3)});` : "",
  ];
  return { html, s };
}

function colophon(scene, ctx, a) {
  const { id, T, theme: th, land, url, brand } = ctx;
  const lines = headLines(scene, ctx, 2);
  const kicker = fit(String(scene.kicker || ""), 22).toUpperCase();
  const cta = fit(String(scene.cta || scene.emphasis || ""), 20).toUpperCase();
  const m = M(land);
  const size = serifSize(lines, (100 - 2 * m) * (land ? 0.74 : 1), land ? 6 : 8.2, land ? 2 : 3);
  // Optional site logo, set small and contained above the end-mark. When the
  // engine injects no logo asset (a), this degrades to nothing.
  const logo = a && a.path
    ? `<img id="${id}-logo" src="${esc(a.path)}" alt="${esc(a.alt || brand || "")}" style="opacity:0;max-height:${land ? 4 : 6}cqw;max-width:${land ? 24 : 42}cqw;object-fit:contain;margin-bottom:${land ? 2 : 3.2}cqw;display:block;">`
    : "";
  const html = `
    <div style="position:absolute;left:${m}cqw;right:${m}cqw;top:18%;bottom:18%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;">
      ${logo}
      <div id="${id}-mark" style="opacity:0;width:${land ? 1.1 : 1.8}cqw;height:${land ? 1.1 : 1.8}cqw;background:${th.accent};transform:rotate(45deg);margin-bottom:${land ? 2.2 : 3.4}cqw;"></div>
      ${kicker ? `<div id="${id}-kick" style="opacity:0;margin-bottom:${land ? 1.4 : 2.2}cqw;">${caps(kicker, th, land, th.faint)}</div>` : ""}
      <div style="max-width:100%;">${serifLines(lines, size, th.ink, `${id}-line`, th)}</div>
      ${cta ? `<div id="${id}-cta" style="opacity:0;margin-top:${land ? 2.4 : 3.6}cqw;padding:${land ? "0.9cqw 2.6cqw" : "1.5cqw 4cqw"};box-shadow:0 0 0 ${r(HAIR(land) * 1.6)}cqw ${th.rule};">${caps(cta, th, land, th.ink, "letter-spacing:0.26em;")}</div>` : ""}
      <div style="margin-top:${land ? 2.6 : 4}cqw;width:${land ? 44 : 74}%;">
        ${hairline(`id="${id}-frule"`, th, land, th.hair, "center", "")}
      </div>
      <div id="${id}-url" style="opacity:0;margin-top:${land ? 1.3 : 2.1}cqw;display:flex;align-items:baseline;gap:${land ? 1.6 : 2.4}cqw;">
        ${caps(String(brand || ""), th, land, th.faint)}
        ${caps(String(url || ""), th, land, th.accent)}
      </div>
    </div>`;
  const s = [
    logo ? `tl.fromTo("#${id}-logo",{opacity:0,y:${land ? 10 : 14}},{opacity:1,y:0,duration:0.8,ease:"power2.out"},${r(T + 0.05)});` : "",
    `tl.fromTo("#${id}-mark",{opacity:0,scale:0.4},{opacity:1,scale:1,duration:0.75,ease:"power2.out"},${r(T + 0.15)});`,
    kicker ? `tl.fromTo("#${id}-kick",{opacity:0,y:9},{opacity:1,y:0,duration:0.75,ease:"power2.out"},${r(T + 0.3)});` : "",
    cta ? `tl.fromTo("#${id}-cta",{opacity:0,y:12},{opacity:1,y:0,duration:0.85,ease:"power2.out"},${r(T + 1)});` : "",
    `tl.fromTo("#${id}-frule",{scaleX:0},{scaleX:1,duration:1,ease:"power2.inOut"},${r(T + 1.15)});`,
    `tl.fromTo("#${id}-url",{opacity:0,y:10},{opacity:1,y:0,duration:0.85,ease:"power2.out"},${r(T + 1.35)});`,
  ];
  return { html, s };
}

const SCENES = { titlespread, feature, plate, ledger, footnotes, pullquote, colophon };

// ---- persistent chrome (the printed page: masthead, margins, folio) ----------
function chrome({ theme: th, D, brand, url, count, land }) {
  const m = M(land);
  const wash = th.gradients
    ? `<div id="bd-wash" style="position:absolute;inset:0;background:radial-gradient(118% 88% at 50% 0%, ${rgba("#FFFFFF", th.isDark ? 0.06 : 0.4)}, rgba(0,0,0,0) 68%);"></div>`
    : "";
  return {
    html: `
  <div id="backdrop" class="clip" data-start="0" data-duration="__D__" data-track-index="0" data-layout-allow-occlusion style="opacity:0;background:${th.ground};">
    ${wash}
    <div style="position:absolute;inset:-2cqw;opacity:${th.isDark ? 0.16 : 0.22};background-image:radial-gradient(${rgba(th.ink, 0.5)} 0.6px, transparent 0.6px);background-size:0.44cqw 0.44cqw;"></div>
  </div>
  <div id="page" class="clip" data-start="0" data-duration="__D__" data-track-index="40" data-layout-allow-occlusion style="opacity:0;background:none;">
    <div style="position:absolute;left:${m}cqw;right:${m}cqw;top:5%;display:flex;align-items:baseline;justify-content:space-between;">
      ${caps(String(brand || ""), th, land, th.faint)}
      ${caps(String(url || ""), th, land, th.faint)}
    </div>
    <div id="hd-rule" style="position:absolute;left:${m}cqw;right:${m}cqw;top:9%;height:${r(HAIR(land))}cqw;background:${th.rule};transform-origin:left center;"></div>
    <div id="ft-rule" style="position:absolute;left:${m}cqw;right:${m}cqw;bottom:8.5%;height:${r(HAIR(land))}cqw;background:${th.hair};transform-origin:right center;"></div>
    <div style="position:absolute;left:0;right:0;bottom:4%;display:flex;justify-content:center;">
    </div>
  </div>`,
    script: `
  tl.fromTo("#backdrop",{opacity:0},{opacity:1,duration:0.5,ease:"power1.out"},0);
  tl.fromTo("#page",{opacity:0},{opacity:1,duration:0.9,ease:"power1.out"},0.1);
  tl.fromTo("#hd-rule",{scaleX:0},{scaleX:1,duration:1.4,ease:"power2.inOut"},0.2);
  tl.fromTo("#ft-rule",{scaleX:0},{scaleX:1,duration:1.4,ease:"power2.inOut"},0.35);${th.gradients ? `
  tl.fromTo("#bd-wash",{opacity:0.72},{opacity:1,duration:5,ease:"sine.inOut",yoyo:true,repeat:reps(${r(D)},5)},0);` : ""}`,
  };
}

// No per-scene chrome — the folio ("01 / 08") was removed: a page number ticking
// up is the same slideshow tell as the progress rail.

function styleBlock(th, land) {
  return `${th.fontFace}
  #root { font-family:${th.bodyStack}; }
  #caps { padding-bottom:12%; }
  #cap-pill { background:${rgba(th.ground, 0.9)} !important; border:0 !important; border-top:${r(HAIR(land) * 1.6)}cqw solid ${th.rule} !important; border-radius:0 !important; padding:${land ? "0.7cqw 1.8cqw" : "1.1cqw 2.4cqw"} !important; max-width:${land ? 66 : 82}% !important; }
  #cap-text { font-family:${th.bodyStack}; font-size:${land ? 1.15 : 1.8}cqw; letter-spacing:0.05em; color:${th.copy}; }`;
}

const family = {
  // ---- SCENE FILL (services/template_engine.js sceneFill) ---------------------
  // Measured 2026-08-04: scenes carried ~11 words over ~14% of the frame, so the
  // script's spare copy (supporting points, a figure, a subtext) never reached the
  // screen. It is drawn here as a chip row + broadcast ticker in the lower band.
  // Skipped on the closer, the pull-quote and the type whose own design owns that
  // band — furniture under a CTA or a quote costs more than the density gains.
  fill: (type, ctx, scene) => {
    if (["colophon","pullquote","plate"].includes(type)) return null;
    const land = ctx.land;
    return {
      left: land ? 7 : 6, right: land ? 7 : 6, bottom: land ? 7 : 10,
      font: land ? 1.12 : 1.95, max: 3,
      plate: ctx.theme.ground, ink: ctx.theme.ink, accent: ctx.theme.accent,
      used: bullets(scene || {}, 3),
    };
  },
  theme, styleBlock, chrome, SCENES, TEMPLATE_SCENES, route, mediaSlots, mediaFallback,
  // The engine injects the site logo into `a` for the closing colophon only —
  // no demand-math change (colophon keeps media:[]).
  wantsLogo: (t) => t === "colophon",
  fallbackType: "feature",
  variants: 3,
  // A quiet page turn: no whips, barely any blur, a push you feel rather than see.
  camera: { enabled: false,
    kinds: ["zoom", "zoom", "zoom", "zoom", "zoom", "zoom", "zoom", "zoom"],
    blur: 4, push: 0.02, zoomIn: 1.06, zoomOut: 1.05,
  },

  // ---- SHARED MOTION SYSTEM (services/motion_presets.js) ----------------------
  // This family publishes WHERE its headline, card and camera live; the engine
  // drives them from the one preset library. Its own entrance tweens for those
  // elements were removed in the same change — two timelines on one property
  // fight, and the loser is whichever the browser applies second.
  motion: {
    heroType: "titlespread",
    text: (id) => `.${id}-line`,
    card: (id) => `#${id}-plate, .${id}-plate`,
    camera: (id) => `#${id}-cami`,
    // The film's two hero moments carry the signature type treatments; the
    // middle stays on the house word stagger so the signatures stay signatures.
    tokens: (type, i, ctx, { hasCard } = {}) => ({
      text: type === "titlespread" ? "outlineFillReveal"
        : type === "colophon" ? "characterReveal" : "wordStaggerBlur",
      enter: hasCard ? "cardRise3D" : "none",
      idle: hasCard ? "floatSoft" : "none",
      camera: MOTION.CAMERA_MOVES[i % MOTION.CAMERA_MOVES.length],
      transition: MOTION.TRANSITIONS[i % MOTION.TRANSITIONS.length],
    }),
  },
};

function buildComposition(opts) { return E.buildFilm(family, opts); }
// This pack's media demand + what filled each slot, WITHOUT rendering. Runs the
// exact routing and slot-filling the renderer runs, so the manifest can never
// drift from the film that ships.
function planMedia(opts) { return E.planMedia(family, opts); }

module.exports = { buildComposition, planMedia, TEMPLATE_SCENES };
