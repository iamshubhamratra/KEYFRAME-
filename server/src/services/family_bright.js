// BRIGHT-MINIMAL family template — the authored scene grammar for the light,
// product-keynote packs (nimbus-saas, mint-launch, liquid-glass,
// bloom-illustrated, lumen-motion, mono-corporate, prism-launch,
// summit-keynote).
//
// These packs all live on white/near-white paper and want the same thing a good
// SaaS keynote wants: soft shadows, rounded cards, generous air, crisp product
// chrome and motion that eases out instead of slamming. Routed through
// scene_kit's shared archetypes they drew the same feature-card row as a
// brutalist zine; this file gives the whole family its own staging — a floating
// browser card, pill feature cards, count-up metrics over hairline rails, a
// bordered testimonial card, a rounded CTA button — while every pack keeps its
// OWN skin: colours, fonts and text effects come from scene_kit.deriveTheme(pack),
// so mono-corporate stays cobalt-on-white and lumen-motion stays coral-on-cream.
// `variant` (hashed from the pack name) flips staging per pack so two packs in
// the family never compose identically.
//
// The render contract (seek-safety, tracks, hard kills, caption node, camera) is
// the engine's — see template_engine.js. This module is design only.

const { deriveTheme } = require("./scene_kit");
const E = require("./template_engine");
// The shared motion vocabulary. Scenes reach for a preset by name rather than
// writing tweens, so a card here and a card in any other template behave alike.
const M = require("./motion_presets");
const { esc, r, rgba, mix, statsOf, breakLines, bullets, fit, mineStat } = E;

// ---- theme -------------------------------------------------------------------
// The pack's own resolved identity + the bright family's surface extras (card
// fill, hairline, shadow ink). Nothing is hard-coded: a pack that resolves DARK
// (e.g. matchSiteTheme adopting a dark site ground) still gets a readable card
// and ink because every surface is derived from the resolved ground/ink.
function theme(manifest, brandSkin, { framePack } = {}) {
  const t = deriveTheme(framePack, {}, brandSkin);
  const accents = (t.accents && t.accents.length ? t.accents : ["#2B5BFF", "#8B7CF6"]).slice(0, 4);
  const ink = t.ink;
  return {
    ...t,
    accent: accents[0],
    accent2: accents[1] || accents[0],
    accent3: accents[2] || accents[1] || accents[0],
    // Cards sit a step closer to white than the paper they rest on (or a step
    // lighter than a dark ground), separated by a hairline + a soft shadow.
    card: t.isDark ? mix(t.ground, "#FFFFFF", 0.09) : mix(t.ground, "#FFFFFF", 0.78),
    cardLine: rgba(ink, t.isDark ? 0.18 : 0.10),
    hair: rgba(ink, 0.10),
    muted: rgba(ink, 0.6),
    faint: rgba(ink, 0.42),
    shade: t.isDark ? "#000000" : mix(ink, "#5A6472", 0.4),
    displayStack: t.displayStack || t.fontStack || "system-ui, sans-serif",
    bodyStack: t.fontStack || "system-ui, sans-serif",
    fontFace: t.fontFace || "",
  };
}

// ---- published vocabulary (Template Director casts onto these) ----------------
const TEMPLATE_SCENES = [
  {
    type: "keynote", bestFor: "the opening title, an intro statement, the film's first frame",
    look: "Keynote title card: a soft accent orb rises behind big dark type on light paper, with a small rounded eyebrow pill above and a gradient underline that wipes in.",
    slots: { kicker: "max 24 chars", lines: "1-3 headline lines, sentence case", subtext: "one sentence, max 96 chars" },
    media: [],
  },
  {
    type: "productframe", bestFor: "showing a product screen, dashboard, app UI or a photo of the work",
    look: "A floating rounded browser card with a soft shadow and address bar, holding the screen, drifting gently beside a short claim.",
    slots: { kicker: "max 22 chars", headline: "max 2 short lines", body: "one sentence, max 130 chars", items: "0-2 supporting lines, max 34 chars each" },
    media: ["desktop"], mediaMin: 0,
  },
  {
    type: "featuretrio", bestFor: "three features, benefits, steps or capabilities",
    look: "A row of rounded pill cards, each with a small drawn accent icon in a tinted square, lifting into place one after another.",
    slots: { kicker: "max 22 chars", headline: "max 2 short lines", items: "2-3 lines, max 40 chars each (use 'Title: detail' to get a subline)" },
    media: [],
  },
  {
    type: "metrics", bestFor: "numbers, results, traction, proof in figures",
    look: "Two or three figures counting up above thin rounded progress rails, each with a small caps label beneath.",
    slots: { kicker: "max 22 chars", headline: "max 2 short lines", stats: "1-3 of {v: number, suf: '%'|'X'|'K'|'M'|'', l: label max 24 chars}" },
    media: [],
  },
  {
    type: "voice", bestFor: "a customer testimonial, a quote, a review",
    look: "One centred card with a soft border and shadow: the quote set large and calm, a hairline divider, then a gradient avatar dot with the name and role.",
    slots: { quote: "max 150 chars, verbatim", author: "person's name", role: "role and/or company" },
    media: [],
  },
  {
    type: "showcase", bestFor: "a gallery, social proof, logos, several visuals at once",
    look: "Two rounded image cards side by side under a headline, with a strip of small proof pills beneath them.",
    slots: { kicker: "max 22 chars", headline: "max 2 short lines", items: "1-3 proof pills, max 26 chars each" },
    media: ["photo", "photo"], mediaMin: 1,
  },
  {
    type: "signoff", bestFor: "the closing call to action, the last frame",
    look: "A calm centred close: the ask in big type, a rounded gradient button with an arrow breathing softly, the url set small beneath.",
    slots: { headline: "max 2 short lines", cta: "button label, max 22 chars", kicker: "max 24 chars" },
    media: [],
  },
];

const mediaSlots = { productframe: ["desktop"], showcase: ["photo", "photo"], voice: ["photo"] };
// True when the PREVIOUS scene already carried imagery — keeps media beats
// alternating now that any spare asset, not just a pinned screenshot, earns one.
const mediaBeatJustPlayed = (ctx) => ((mediaSlots[ctx && ctx.prevType] || []).length > 0);

// ---- deterministic router (used when the director is off / uncast) -----------
function route(scene, i, total, ctx) {
  const k = String(scene.kind || "").toLowerCase();
  const p = String(scene.purpose || "").toLowerCase();
  if (i === 0 || k === "hook" || k === "title") return "keynote";
  if (i === total - 1 || k === "cta" || p === "cta") return "signoff";
  if (k === "quote" || scene.quote || /testimonial|review/.test(p)) return "voice";
  // Proof/gallery beats the stat check: a "social proof" scene usually carries
  // both figures AND visuals, and a wall of counters is the weaker read.
  if (/gallery|showcase|proof|social|logos|customers/.test(`${k} ${p}`) && ctx.freeCount >= 1 && ctx.prevType !== "showcase") return "showcase";
  if (k === "stat" || k === "chart" || statsOf(scene, 1).length) return "metrics";
  // MEDIA BEAT — ahead of the text branch, and satisfied by ANY spare asset.
  // `featuretrio` used to claim every middle scene (real storyboards nearly
  // always carry 2+ bullets) and the media branch only fired for a pinned shot
  // or a real screenshot, so films full of ordinary stock photos showed almost
  // none of them. Consecutive media beats are allowed as long as they are a
  // DIFFERENT type (prevType guard) — productframe↔showcase reads as edited
  // rhythm, not a slideshow — which lifts a film off the ~3/8 media floor toward
  // the density the dedicated composers already hit (the global "one media beat
  // then a forced text beat" gate is what starved these films of their assets).
  if (ctx.freeCount >= 3 && ctx.prevType !== "showcase") return "showcase";
  if ((ctx.pinned || ctx.hasShot || ctx.freeCount >= 1) && ctx.prevType !== "productframe") return "productframe";
  if (bullets(scene, 3).length >= 2) return "featuretrio";
  // One point or none: a statement plate reads far better than a single card
  // stretched across the frame (metrics degrades to exactly that when the scene
  // carries no figure).
  return ctx.prevType === "keynote" ? "metrics" : "keynote";
}
const mediaFallback = (scene) => {
  // A quote scene cast as the testimonial type but left with no free photo must
  // KEEP that type (it renders the monogram fallback) — rerouting it to a text
  // type silently drops the testimonial in asset-poor films. null = keep current.
  if (scene && (scene.quote || String(scene.kind || "").toLowerCase() === "quote" || /testimonial|review/.test(String(scene.purpose || "").toLowerCase()))) return null;
  return bullets(scene, 3).length >= 2 ? "featuretrio" : "keynote";
};

// ---- shared bright furniture --------------------------------------------------
const softShadow = (th, k) => {
  const s = k || 1;
  return `box-shadow:0 ${r(0.3 * s)}cqw ${r(0.9 * s)}cqw ${rgba(th.shade, 0.05)},0 ${r(1.2 * s)}cqw ${r(3 * s)}cqw ${rgba(th.shade, 0.1)};`;
};
const cardCss = (th, radius, k) =>
  `background:${th.card};border:0.09cqw solid ${th.cardLine};border-radius:${r(radius)}cqw;${softShadow(th, k)}`;

// Type size that keeps the longest line inside the plate (sentence case, ~0.53em
// per char at weight 700).
const headSize = (lines, avail, cap) => {
  const longest = Math.max(...lines.map((l) => String(l).length), 1);
  return r(Math.max(cap * 0.42, Math.min(cap, (avail / longest) * 1.75)));
};

const headBlock = (id, th, lines, size, align) => lines
  .map((ln) => `<div class="${id}-line" style="opacity:0;font-family:${th.displayStack};font-weight:700;font-size:${r(size)}cqw;line-height:1.08;letter-spacing:-0.022em;color:${th.ink};text-align:${align || "left"};">${esc(ln)}</div>`)
  .join("");

// Small rounded eyebrow pill: accent dot + caps label on a white card.
const chip = (elId, th, land, text) => (text ? `
  <div id="${elId}" style="opacity:0;display:inline-flex;align-items:center;gap:${land ? 0.6 : 1.1}cqw;padding:${land ? "0.5cqw 1.2cqw" : "0.9cqw 2cqw"};${cardCss(th, 9, 0.5)}">
    <span style="width:${land ? 0.6 : 1.05}cqw;height:${land ? 0.6 : 1.05}cqw;border-radius:50%;background:${th.accent};"></span>
    <span style="font-family:${th.bodyStack};font-size:${land ? 0.98 : 1.8}cqw;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${th.muted};white-space:nowrap;">${esc(text)}</span>
  </div>` : "");

// The three drawn accent glyphs the feature cards use (check / spark / orbit).
function icon(kind, color, cls) {
  const common = `fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" pathLength="100" class="draw ${cls}"`;
  const body = kind === 0
    ? `<path d="M4 12.6 L9.6 18.2 L20 6.6" ${common}/>`
    : kind === 1
      ? `<path d="M12 2.4 L14.2 9.8 L21.6 12 L14.2 14.2 L12 21.6 L9.8 14.2 L2.4 12 L9.8 9.8 Z" ${common}/>`
      : `<circle cx="12" cy="12" r="8.6" ${common}/><circle cx="12" cy="12" r="2.6" fill="${color}" stroke="none"/>`;
  return `<svg viewBox="0 0 24 24" style="width:64%;height:64%;display:block;">${body}</svg>`;
}

// A product-UI skeleton for media scenes whose asset never arrived: sidebar,
// stat tiles and a small bar chart. Never an empty frame.
function uiMock(id, th, land) {
  const cols = [42, 66, 50, 82, 58, 94];
  const rails = [86, 64, 74, 52];
  return `<div style="position:absolute;inset:0;display:flex;background:${th.ground};">
    <div style="width:17%;height:100%;border-right:0.08cqw solid ${th.hair};padding:${land ? 1 : 1.8}cqw;display:flex;flex-direction:column;gap:${land ? 0.7 : 1.2}cqw;">
      ${rails.map((w, k) => `<div style="height:${land ? 0.55 : 0.95}cqw;width:${w}%;border-radius:9cqw;background:${rgba(th.ink, k === 0 ? 0.22 : 0.1)};"></div>`).join("")}
    </div>
    <div style="flex:1;padding:${land ? 1.2 : 2}cqw;display:flex;flex-direction:column;gap:${land ? 1 : 1.7}cqw;min-width:0;">
      <div style="display:flex;gap:${land ? 0.8 : 1.4}cqw;">
        ${[th.accent, th.accent2, th.accent3].map((c) => `<div style="flex:1;height:${land ? 4.2 : 7}cqw;border-radius:${land ? 0.7 : 1.2}cqw;background:${rgba(c, 0.13)};border:0.08cqw solid ${rgba(c, 0.3)};"></div>`).join("")}
      </div>
      <!-- The status the click changes. Its text is REPLACED by the morph preset
           (motion spec part 1.5): only this token moves, the panel around it
           holds still, which is what makes a UI look like it is working rather
           than like a slide advancing. -->
      <div style="display:flex;align-items:center;gap:${land ? 0.7 : 1.2}cqw;">
        <span style="width:${land ? 0.7 : 1.2}cqw;height:${land ? 0.7 : 1.2}cqw;border-radius:50%;background:${th.accent};display:block;flex:0 0 auto;"></span>
        <span id="${id}-status" style="font-family:${th.bodyStack};font-weight:600;font-size:${land ? 1 : 1.7}cqw;letter-spacing:0.04em;color:${th.ink};white-space:nowrap;"></span>
      </div>
      <div style="flex:1;display:flex;align-items:flex-end;gap:${land ? 0.7 : 1.2}cqw;">
        ${cols.map((h) => `<div class="${id}-bar" style="flex:1;height:${h}%;border-radius:${land ? 0.35 : 0.6}cqw;transform-origin:bottom center;background:linear-gradient(180deg,${rgba(th.accent, 0.55)},${rgba(th.accent2, 0.28)});"></div>`).join("")}
      </div>
    </div>
  </div>`;
}

// A rounded image plate; falls back to a soft branded gradient panel.
function plate(th, land, asset, brand, radius) {
  if (asset && asset.path) {
    const pos = E.isScreenshot(asset) ? "top center" : "center center";
    return `<img src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="width:100%;height:100%;object-fit:cover;object-position:${pos};display:block;border-radius:${r(radius)}cqw;">`;
  }
  return `<div style="width:100%;height:100%;display:grid;place-items:center;border-radius:${r(radius)}cqw;background:linear-gradient(140deg,${rgba(th.accent, 0.18)},${rgba(th.accent2, 0.08)} 60%,${rgba(th.accent3, 0.14)});">
    <div style="font-family:${th.displayStack};font-weight:700;font-size:${land ? 2.4 : 4}cqw;letter-spacing:0.04em;color:${rgba(th.ink, 0.5)};">${esc(String(brand).slice(0, 14))}</div>
  </div>`;
}

// The soft accent orb the title/close scenes rise out of. Deliberately OFF the
// type: it sits behind one shoulder of the frame so the headline still lands on
// clean paper (a centred orb washes the whole plate pink and kills the family's
// "light and calm" read).
const orb = (elId, th, size, opacity, x, y) => `
  <div id="${elId}" style="opacity:0;position:absolute;left:${x}%;top:${y}%;width:${r(size)}cqw;height:${r(size)}cqw;margin-left:${r(-size / 2)}cqw;margin-top:${r(-size / 2)}cqw;border-radius:50%;background:radial-gradient(circle at 44% 40%,${rgba(th.accent, opacity)} 0%,${rgba(th.accent2, opacity * 0.42)} 44%,${rgba(th.accent3, 0)} 70%);"></div>`;

// ---- scenes -------------------------------------------------------------------

function keynote(scene, ctx) {
  const { id, T, L, theme: th, land, variant, brand } = ctx;
  const raw = Array.isArray(scene.lines) && scene.lines.length ? scene.lines : breakLines(scene.headline, scene.subtext || brand);
  const lines = raw.map((l) => String(l)).filter(Boolean).slice(0, 3);
  const kicker = fit(String(scene.kicker || scene.purpose || brand || ""), 24);
  const sub = fit(String(scene.subtext || scene.body || ""), 96);
  const size = headSize(lines, land ? 74 : 78, land ? 6.8 : 9.2);
  const centred = variant % 2 === 0;
  const html = `
    ${orb(`${id}-orb`, th, land ? 44 : 62, 0.26, centred ? 68 : 74, 30)}
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:${centred ? "center" : "flex-start"};text-align:${centred ? "center" : "left"};padding:${land ? "11cqw 10cqw" : "22cqw 7cqw"};">
      ${chip(`${id}-kick`, th, land, kicker)}
      <div style="margin-top:${land ? 2 : 3.4}cqw;">${headBlock(id, th, lines, size, centred ? "center" : "left")}</div>
      <div id="${id}-rule" style="margin-top:${land ? 1.8 : 3}cqw;width:${land ? 9 : 16}cqw;height:${land ? 0.42 : 0.75}cqw;border-radius:9cqw;background:linear-gradient(90deg,${th.accent},${th.accent2});transform-origin:${centred ? "center" : "left"} center;"></div>
      ${sub ? `<div id="${id}-sub" style="opacity:0;margin-top:${land ? 1.8 : 3}cqw;max-width:${land ? 46 : 80}cqw;font-family:${th.bodyStack};font-size:${land ? 1.35 : 2.5}cqw;line-height:1.55;color:${th.muted};">${esc(sub)}</div>` : ""}
    </div>`;
  const s = [
    `tl.fromTo("#${id}-orb",{opacity:0,scale:0.7,y:70},{opacity:1,scale:1,y:0,duration:0.95,ease:"power3.out"},${T});`,
    `tl.to("#${id}-orb",{y:-16,scale:1.06,duration:2.3,ease:"sine.inOut",yoyo:true,repeat:reps(${r(Math.max(0.1, L - 1.2))},2.3)},${r(T + 1)});`,
    kicker ? `tl.fromTo("#${id}-kick",{opacity:0,y:20},{opacity:1,y:0,duration:0.5,ease:"power3.out"},${r(T + 0.2)});` : "",
    `tl.fromTo("#${id}-rule",{scaleX:0},{scaleX:1,duration:0.6,ease:"power3.out"},${r(T + 0.75)});`,
    sub ? `tl.fromTo("#${id}-sub",{opacity:0,y:20},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 0.85)});` : "",
  ];
  return { html, s };
}

function productframe(scene, ctx, asset) {
  const { id, T, L, theme: th, land, variant, brand, url } = ctx;
  const lines = breakLines(scene.headline, "").slice(0, 2);
  const kicker = fit(String(scene.kicker || scene.purpose || ""), 22);
  const body = fit(String(scene.body || scene.subtext || ""), 130);
  const hasList = Array.isArray(scene.chips) || Array.isArray(scene.onScreenText) || Array.isArray(scene.bullets);
  const ticks = hasList ? bullets(scene, 2).map((b) => fit(String(b), 34)) : [];
  // The tokens the mock's status line steps through. Short by necessity — this
  // is a UI label, not a sentence — so anything long is left out rather than
  // truncated into nonsense.
  const statusSteps = bullets(scene, 4).map((b) => fit(String(b), 18).toUpperCase()).filter((b) => b.length > 2);
  const cardLeft = variant % 2 === 1;
  const size = headSize(lines, land ? 36 : 76, land ? 3.6 : 6.4);
  const shot = asset && asset.path;
  const cardHtml = `
    <div style="position:relative;flex:${land ? "0 0 50cqw" : "0 0 auto"};width:${land ? "50cqw" : "100%"};">
      <div id="${id}-glow" style="opacity:0;position:absolute;left:6%;right:6%;top:12%;bottom:-6%;border-radius:${land ? 3 : 5}cqw;background:linear-gradient(120deg,${rgba(th.accent, 0.3)},${rgba(th.accent2, 0.18)});filter:blur(2.2cqw);"></div>
      <div id="${id}-card" style="opacity:0;position:relative;overflow:hidden;${cardCss(th, land ? 1.5 : 2.6, 1.4)}">
        <div style="display:flex;align-items:center;gap:${land ? 0.55 : 1}cqw;padding:${land ? "0.7cqw 1.1cqw" : "1.2cqw 1.8cqw"};border-bottom:0.08cqw solid ${th.hair};background:${mix(th.card, th.ground, 0.5)};">
          ${[0, 1, 2].map(() => `<span style="width:${land ? 0.55 : 0.95}cqw;height:${land ? 0.55 : 0.95}cqw;border-radius:50%;background:${rgba(th.ink, 0.14)};display:block;flex:0 0 auto;"></span>`).join("")}
          <span style="flex:1;margin-left:${land ? 0.8 : 1.4}cqw;height:${land ? 1.5 : 2.6}cqw;border-radius:9cqw;background:${rgba(th.ink, 0.06)};display:flex;align-items:center;padding:0 ${land ? 0.9 : 1.5}cqw;font-family:${th.bodyStack};font-size:${land ? 0.82 : 1.45}cqw;color:${rgba(th.ink, 0.45)};white-space:nowrap;overflow:hidden;">${esc(url)}</span>
        </div>
        <div style="position:relative;width:100%;height:${land ? 27 : 46}cqw;overflow:hidden;background:${th.ground};">
          ${shot
            ? `<img id="${id}-img" src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="width:100%;height:100%;object-fit:cover;object-position:${E.isScreenshot(asset) ? "top center" : "center center"};display:block;">`
            : uiMock(id, th, land)}
        </div>
      </div>
    </div>`;
  const textHtml = `
    <div style="flex:1;display:flex;flex-direction:column;align-items:flex-start;min-width:0;">
      ${chip(`${id}-kick`, th, land, kicker)}
      <div style="margin-top:${land ? 1.6 : 2.8}cqw;">${headBlock(id, th, lines, size, "left")}</div>
      ${body ? `<div id="${id}-body" style="opacity:0;margin-top:${land ? 1.4 : 2.4}cqw;max-width:${land ? 34 : 80}cqw;font-family:${th.bodyStack};font-size:${land ? 1.22 : 2.3}cqw;line-height:1.6;color:${th.muted};">${esc(body)}</div>` : ""}
      ${ticks.length ? `<div style="margin-top:${land ? 1.6 : 2.6}cqw;display:flex;flex-direction:column;gap:${land ? 0.9 : 1.6}cqw;">
        ${ticks.map((t) => `<div class="${id}-tick" style="opacity:0;display:flex;align-items:center;gap:${land ? 0.8 : 1.4}cqw;">
          <span style="width:${land ? 1.5 : 2.6}cqw;height:${land ? 1.5 : 2.6}cqw;border-radius:50%;background:${rgba(th.accent, 0.14)};display:grid;place-items:center;flex:0 0 auto;">${icon(0, th.accent, `${id}-ic`)}</span>
          <span style="font-family:${th.bodyStack};font-size:${land ? 1.15 : 2.1}cqw;color:${th.ink};">${esc(t)}</span>
        </div>`).join("")}
      </div>` : ""}
    </div>`;
  const html = `
    <div style="position:absolute;inset:0;display:flex;${land ? "flex-direction:row;align-items:center;gap:5cqw;" : "flex-direction:column;justify-content:center;gap:5cqw;"}padding:${land ? "10cqw 7cqw 7cqw" : "18cqw 6cqw"};">
      ${land && cardLeft ? cardHtml + textHtml : textHtml + cardHtml}
    </div>`;
  const s = [
    `tl.fromTo("#${id}-glow",{opacity:0,scale:0.9},{opacity:1,scale:1,duration:0.8,ease:"power2.out"},${r(T + 0.2)});`,
    kicker ? `tl.fromTo("#${id}-kick",{opacity:0,y:18},{opacity:1,y:0,duration:0.45,ease:"power3.out"},${r(T + 0.18)});` : "",
    body ? `tl.fromTo("#${id}-body",{opacity:0,y:18},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.6)});` : "",
    ticks.length ? `tl.fromTo(".${id}-tick",{opacity:0,x:-22},{opacity:1,x:0,duration:0.45,ease:"power3.out",stagger:0.12},${r(T + 0.8)});` : "",
    ticks.length ? `tl.fromTo(".${id}-ic",{strokeDashoffset:100},{strokeDashoffset:0,duration:0.4,ease:"power2.out",stagger:0.12},${r(T + 0.95)});` : "",
    shot ? `tl.fromTo("#${id}-img",{scale:1.07},{scale:1,duration:${r(Math.max(1, L - 0.8))},ease:"sine.out"},${r(T + 0.6)});` : "",
    shot ? "" : `tl.fromTo(".${id}-bar",{scaleY:0},{scaleY:1,duration:0.6,ease:"power3.out",stagger:0.07},${r(T + 0.7)});`,
    // ---- UI MICROINTERACTION (motion spec parts 2 & 6) -----------------------
    // A cursor travels into the product frame, presses, and leaves a ripple —
    // and only THEN does the UI answer. The order matters: a screen that reacts
    // before the click reads as animating itself, which is the "static
    // screenshot with effects on it" look the spec is trying to kill.
    ...M.cursorClickRipple(`#${id}-card`, r(T + 0.9), {
      x: land ? 250 : 300, y: land ? 150 : 240,
    }),
    // The answer to that click. A real screenshot scrolls (it is a long page in
    // a short frame); the drawn mock re-draws its chart bars.
    ...(shot
      ? M.scrollReveal(`#${id}-img`, r(T + 1.75), { dist: 0, to: land ? -46 : -70, dur: Math.max(1, L - 2.2) })
      : [`tl.fromTo(".${id}-bar",{scaleY:0.55},{scaleY:1,duration:0.5,ease:"back.out(2)",stagger:0.05},${r(T + 1.75)});`]),
    // …and the status token steps through the scene's own points as it works.
    // Only runs on the drawn mock: a real screenshot already has its own UI, and
    // a second status line floating over it would read as a bug.
    ...(!shot && statusSteps.length
      ? M.textMorph(`#${id}-status`, r(T + 1.7), statusSteps,
        { hold: Math.max(0.5, (L - 2.4) / statusSteps.length - 0.34) })
      : []),
  ];
  return { html, s };
}

function featuretrio(scene, ctx) {
  const { id, T, theme: th, land } = ctx;
  let items = (Array.isArray(scene.items) && scene.items.length ? scene.items : bullets(scene, 3))
    .map((b) => String(b)).filter(Boolean).slice(0, 3);
  if (!items.length) items = [fit(String(scene.headline || ctx.brand), 40)].filter(Boolean);
  const parts = items.map((t) => {
    const m = /^(.{2,28}?)\s*[:—–-]\s+(.+)$/.exec(t);
    return m ? { t: fit(m[1], 28), d: fit(m[2], 60) } : { t: fit(t, 40), d: "" };
  });
  const lines = breakLines(scene.headline, "").slice(0, 2);
  const kicker = fit(String(scene.kicker || scene.purpose || ""), 22);
  const size = headSize(lines, land ? 62 : 76, land ? 4.4 : 6.6);
  const cols = [th.accent, th.accent2, th.accent3];
  // Landscape stacks icon over copy in a column card; portrait sets the icon
  // beside the copy so the stacked rows stay compact instead of tall and empty.
  const cards = parts.map((p, k) => `
    <div class="${id}-card" style="opacity:0;flex:1;min-width:0;display:flex;${land ? "flex-direction:column;" : "flex-direction:row;align-items:center;"}gap:${land ? 1.2 : 2.2}cqw;padding:${land ? "2cqw 1.9cqw" : "2.6cqw"};${cardCss(th, land ? 1.6 : 2.6, 1)}">
      <span style="width:${land ? 3.4 : 6.4}cqw;height:${land ? 3.4 : 6.4}cqw;border-radius:${land ? 1 : 1.9}cqw;background:${rgba(cols[k % 3], 0.13)};display:grid;place-items:center;flex:0 0 auto;">${icon(k % 3, cols[k % 3], `${id}-ic`)}</span>
      <span style="min-width:0;display:flex;flex-direction:column;gap:${land ? 0.9 : 0.7}cqw;">
        <span style="font-family:${th.displayStack};font-weight:700;font-size:${land ? 1.75 : 2.9}cqw;line-height:1.2;letter-spacing:-0.01em;color:${th.ink};">${esc(p.t)}</span>
        ${p.d ? `<span style="font-family:${th.bodyStack};font-size:${land ? 1.1 : 2}cqw;line-height:1.45;color:${th.muted};">${esc(p.d)}</span>` : ""}
      </span>
    </div>`).join("");
  // One card must not stretch the width of the frame — cap it so a single point
  // reads as a deliberate card, not a stray banner.
  const rowW = parts.length === 1 ? (land ? "46cqw" : "100%") : "100%";
  const html = `
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;padding:${land ? "10cqw 7cqw 7cqw" : "18cqw 6cqw"};">
      ${chip(`${id}-kick`, th, land, kicker)}
      <div style="margin-top:${land ? 1.5 : 2.6}cqw;">${headBlock(id, th, lines, size, "left")}</div>
      <div style="margin-top:${land ? 3 : 4.4}cqw;width:${rowW};display:flex;${land ? "flex-direction:row;" : "flex-direction:column;"}gap:${land ? 1.8 : 2.4}cqw;align-items:stretch;">${cards}</div>
    </div>`;
  const s = [
    kicker ? `tl.fromTo("#${id}-kick",{opacity:0,y:18},{opacity:1,y:0,duration:0.45,ease:"power3.out"},${r(T + 0.15)});` : "",
    `tl.fromTo(".${id}-ic",{strokeDashoffset:100},{strokeDashoffset:0,duration:0.55,ease:"power2.out",stagger:0.13},${r(T + 0.9)});`,
  ];
  return { html, s };
}

function metrics(scene, ctx) {
  const { id, T, L, theme: th, land } = ctx;
  let stats = statsOf(scene, land ? 3 : 2);
  if (!stats.length) { const m = mineStat(scene.headline); if (m) stats = [m]; }
  const lines = breakLines(scene.headline, "").slice(0, 2);
  const kicker = fit(String(scene.kicker || scene.purpose || ""), 22);
  const size = headSize(lines, land ? 60 : 76, land ? 4.2 : 6.4);
  const cols = [th.accent, th.accent2, th.accent3];

  // No figure anywhere in the scene — never invent one. Show the claim big with
  // its supporting lines as pills instead.
  if (!stats.length) {
    // An authored list becomes pills; a plain sentence stays a sentence (a lone
    // pill scraped out of the subtext reads as a stray fragment).
    const listed = Array.isArray(scene.chips) || Array.isArray(scene.onScreenText)
      || Array.isArray(scene.bullets) || (Array.isArray(scene.items) && scene.items.length > 0);
    const pills = listed ? bullets(scene, 3).map((b) => fit(String(b), 32)) : [];
    const body = listed ? "" : fit(String(scene.body || scene.subtext || ""), 150);
    const html = `
      ${orb(`${id}-orb`, th, land ? 40 : 58, 0.22, 78, 32)}
      <div style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;padding:${land ? "11cqw 8cqw" : "20cqw 7cqw"};">
        ${chip(`${id}-kick`, th, land, kicker)}
        <div style="margin-top:${land ? 1.8 : 3}cqw;">${headBlock(id, th, lines, headSize(lines, land ? 70 : 78, land ? 6 : 8.4), "left")}</div>
        <div id="${id}-rule" style="margin-top:${land ? 1.6 : 2.8}cqw;width:${land ? 8 : 15}cqw;height:${land ? 0.4 : 0.7}cqw;border-radius:9cqw;background:linear-gradient(90deg,${th.accent},${th.accent2});transform-origin:left center;"></div>
        ${body ? `<div id="${id}-body" style="opacity:0;margin-top:${land ? 2.2 : 3.6}cqw;max-width:${land ? 44 : 80}cqw;font-family:${th.bodyStack};font-size:${land ? 1.5 : 2.6}cqw;line-height:1.55;color:${th.muted};">${esc(body)}</div>` : ""}
        ${pills.length ? `<div style="margin-top:${land ? 2.2 : 3.6}cqw;display:flex;flex-wrap:wrap;gap:${land ? 1 : 1.6}cqw;">
          ${pills.map((p) => `<div class="${id}-pill" style="opacity:0;display:inline-flex;align-items:center;gap:${land ? 0.7 : 1.2}cqw;padding:${land ? "0.7cqw 1.4cqw" : "1.2cqw 2.2cqw"};${cardCss(th, 9, 0.6)}">
            <span style="width:${land ? 0.55 : 1}cqw;height:${land ? 0.55 : 1}cqw;border-radius:50%;background:${th.accent2};"></span>
            <span style="font-family:${th.bodyStack};font-size:${land ? 1.1 : 2}cqw;color:${th.ink};white-space:nowrap;">${esc(p)}</span>
          </div>`).join("")}
        </div>` : ""}
      </div>`;
    return {
      html,
      s: [
        `tl.fromTo("#${id}-orb",{opacity:0,scale:0.85},{opacity:1,scale:1,duration:0.9,ease:"power2.out"},${T});`,
        kicker ? `tl.fromTo("#${id}-kick",{opacity:0,y:18},{opacity:1,y:0,duration:0.45,ease:"power3.out"},${r(T + 0.15)});` : "",
        `tl.fromTo("#${id}-rule",{scaleX:0},{scaleX:1,duration:0.55,ease:"power3.out"},${r(T + 0.7)});`,
        body ? `tl.fromTo("#${id}-body",{opacity:0,y:20},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 0.8)});` : "",
        pills.length ? `tl.fromTo(".${id}-pill",{opacity:0,y:22},{opacity:1,y:0,duration:0.5,ease:"power3.out",stagger:0.12},${r(T + 0.8)});` : "",
      ],
    };
  }

  const blocks = stats.map((st, k) => {
    const label = fit(String(st.l || ""), 24).toUpperCase();
    return `
    <div class="${id}-m" style="opacity:0;flex:1;min-width:0;">
      <div id="${id}-n${k}" style="font-family:${th.displayStack};font-weight:700;font-size:${land ? 5.2 : 8.6}cqw;line-height:1;letter-spacing:-0.035em;color:${th.ink};white-space:nowrap;">${esc(st.pre)}0${esc(st.suf)}</div>
      <div style="margin-top:${land ? 1.1 : 1.8}cqw;height:${land ? 0.42 : 0.75}cqw;border-radius:9cqw;background:${rgba(th.ink, 0.09)};overflow:hidden;">
        <div class="${id}-fill" style="height:100%;width:100%;border-radius:9cqw;transform-origin:left center;background:linear-gradient(90deg,${cols[k % 3]},${cols[(k + 1) % 3]});"></div>
      </div>
      ${label ? `<div style="margin-top:${land ? 0.9 : 1.5}cqw;font-family:${th.bodyStack};font-size:${land ? 1.08 : 1.95}cqw;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:${th.muted};">${esc(label)}</div>` : ""}
    </div>`;
  }).join("");
  // A single figure gets a measured column, not a rail stretched across the frame.
  const rowW = stats.length === 1 ? (land ? "40cqw" : "72cqw") : "100%";
  const html = `
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;padding:${land ? "10cqw 8cqw 7cqw" : "18cqw 7cqw"};">
      ${chip(`${id}-kick`, th, land, kicker)}
      <div style="margin-top:${land ? 1.5 : 2.6}cqw;">${headBlock(id, th, lines, size, "left")}</div>
      <div style="margin-top:${land ? 3.4 : 5}cqw;width:${rowW};display:flex;${land ? "flex-direction:row;" : "flex-direction:column;"}gap:${land ? 3.4 : 4}cqw;">${blocks}</div>
    </div>`;
  const s = [
    kicker ? `tl.fromTo("#${id}-kick",{opacity:0,y:18},{opacity:1,y:0,duration:0.45,ease:"power3.out"},${r(T + 0.15)});` : "",
    `tl.fromTo(".${id}-m",{opacity:0,y:34},{opacity:1,y:0,duration:0.6,ease:"power3.out",stagger:0.14},${r(T + 0.6)});`,
    `tl.fromTo(".${id}-fill",{scaleX:0},{scaleX:1,duration:0.9,ease:"power3.out",stagger:0.14},${r(T + 0.75)});`,
  ].concat(stats.map((st, k) => `countTxt("#${id}-n${k}",${r(st.v)},${r(T + 0.7 + k * 0.14)},${r(Math.min(1.5, Math.max(0.6, L * 0.45)))},${JSON.stringify(String(st.pre || ""))},${JSON.stringify(String(st.suf || ""))},${st.isFloat ? 10 : 1});`))
    // The figure is the keyword of a stat scene, so it takes the emphasis pulse
    // the moment the counter lands — scale 1→1.06→1 with a brightness lift, on
    // that number alone. Timed off the count's own settle, not off the scene.
    .concat(stats.flatMap((st, k) => M.headlineGlowPulse(`#${id}-n${k}`,
      r(T + 0.7 + k * 0.14 + Math.min(1.5, Math.max(0.6, L * 0.45))))));
  return { html, s };
}

function voice(scene, ctx, a) {
  const { id, T, theme: th, land, brand } = ctx;
  const quote = fit(String(scene.quote || scene.subtext || scene.headline || ""), 150);
  const words = quote.split(/\s+/).filter(Boolean);
  const author = fit(String(scene.author || scene.emphasis || ""), 30);
  const role = fit(String(scene.role || scene.purpose || brand), 36);
  const initial = String(author || brand || "•").trim().charAt(0).toUpperCase() || "•";
  const size = quote.length > 90 ? (land ? 2.5 : 4.2) : (land ? 3.1 : 5);
  // The disc is a gradient from accent → accent2, so ink chosen against ONE end
  // can vanish against the other (the WCAG audit measured this monogram at
  // 1.07:1). Pick against the gradient's midpoint and guarantee the ratio.
  const avaMid = E.mix(th.accent, th.accent2 || th.accent, 0.5);
  const avaInk = E.readable(avaMid, E.inkOn(avaMid), 1, 4.5);
  // A real portrait reads far better than a monogram — the avatar circle is a
  // pre-sized, text-isolated slot, so drop the testimonial's photo in when one
  // was cast (mediaSlots.voice=["photo"]); fall back to the gradient initial.
  const avaSz = land ? 3.2 : 5.6;
  const ava = (a && a.path)
    ? `<span style="width:${avaSz}cqw;height:${avaSz}cqw;border-radius:50%;flex:0 0 auto;overflow:hidden;display:block;background:${rgba(th.accent, 0.16)};"><img src="${esc(a.path)}" alt="${esc(a.alt || author || "portrait")}" style="width:100%;height:100%;object-fit:cover;display:block;"></span>`
    : `<span style="width:${avaSz}cqw;height:${avaSz}cqw;border-radius:50%;flex:0 0 auto;display:grid;place-items:center;background:linear-gradient(135deg,${th.accent},${th.accent2});font-family:${th.displayStack};font-weight:700;font-size:${land ? 1.5 : 2.6}cqw;color:${avaInk};">${esc(initial)}</span>`;
  const html = `
    ${orb(`${id}-orb`, th, land ? 42 : 60, 0.2, 22, 70)}
    <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:${land ? "9cqw" : "16cqw 6cqw"};">
      <div id="${id}-card" style="opacity:0;width:${land ? 64 : 88}cqw;padding:${land ? "3.6cqw 4cqw" : "6cqw 5cqw"};${cardCss(th, land ? 2 : 3.2, 1.5)}">
        <div id="${id}-mark" style="opacity:0;font-family:${th.displayStack};font-weight:700;font-size:${land ? 4.6 : 7.6}cqw;line-height:0.7;color:${rgba(th.accent, 0.42)};">&ldquo;</div>
        <div style="margin-top:${land ? 1.2 : 2}cqw;display:flex;flex-wrap:wrap;">
          ${words.map((w) => `<span class="${id}-w" style="opacity:0;font-family:${th.displayStack};font-weight:600;font-size:${r(size)}cqw;line-height:1.36;letter-spacing:-0.01em;color:${th.ink};margin-right:0.3em;">${esc(w)}</span>`).join("")}
        </div>
        <div id="${id}-div" style="margin-top:${land ? 2.2 : 3.6}cqw;height:0.08cqw;background:${th.hair};transform-origin:left center;"></div>
        <div id="${id}-by" style="opacity:0;margin-top:${land ? 1.6 : 2.6}cqw;display:flex;align-items:center;gap:${land ? 1.1 : 1.9}cqw;">
          ${ava}
          <span style="min-width:0;">
            ${author ? `<span style="display:block;font-family:${th.displayStack};font-weight:700;font-size:${land ? 1.4 : 2.5}cqw;color:${th.ink};">${esc(author)}</span>` : ""}
            <span style="display:block;font-family:${th.bodyStack};font-size:${land ? 1.05 : 1.95}cqw;letter-spacing:0.06em;color:${th.muted};">${esc(role)}</span>
          </span>
        </div>
      </div>
    </div>`;
  const s = [
    `tl.fromTo("#${id}-orb",{opacity:0,scale:0.82},{opacity:1,scale:1,duration:0.95,ease:"power2.out"},${T});`,
    `tl.fromTo("#${id}-mark",{opacity:0,scale:0.5},{opacity:1,scale:1,duration:0.45,ease:"back.out(2)",transformOrigin:"left top"},${r(T + 0.35)});`,
    `tl.fromTo(".${id}-w",{opacity:0,y:16},{opacity:1,y:0,duration:0.42,ease:"power2.out",stagger:0.035},${r(T + 0.45)});`,
    `tl.fromTo("#${id}-div",{scaleX:0},{scaleX:1,duration:0.6,ease:"power3.out"},${r(T + 1)});`,
    `tl.fromTo("#${id}-by",{opacity:0,y:18},{opacity:1,y:0,duration:0.5,ease:"power3.out"},${r(T + 1.1)});`,
  ];
  return { html, s };
}

function showcase(scene, ctx, a, b) {
  const { id, T, L, theme: th, land, brand } = ctx;
  const lines = breakLines(scene.headline, "").slice(0, 2);
  const kicker = fit(String(scene.kicker || scene.purpose || ""), 22);
  // Landscape has only ~40cqw of safe height once the deck chrome is clear, and
  // this type stacks head + two plates + a pill strip — so it runs a tighter
  // headline and shorter plates than the other types.
  const size = headSize(lines, land ? 60 : 76, land ? 3.8 : 6.4);
  const pills = (Array.isArray(scene.items) && scene.items.length ? scene.items : bullets(scene, 3))
    .map((p) => fit(String(p), 26)).filter(Boolean).slice(0, 3);
  const rad = land ? 1.4 : 2.4;
  const tile = (asset, cls) => `
    <div class="${cls}" style="opacity:0;flex:1;min-width:0;height:${land ? 22 : 36}cqw;overflow:hidden;${cardCss(th, rad, 1.1)}">
      ${plate(th, land, asset, brand, rad)}
    </div>`;
  const html = `
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;padding:${land ? "9cqw 7cqw" : "18cqw 6cqw"};">
      ${chip(`${id}-kick`, th, land, kicker)}
      <div style="margin-top:${land ? 1.4 : 2.6}cqw;">${headBlock(id, th, lines, size, "left")}</div>
      <div style="margin-top:${land ? 2.2 : 3.8}cqw;width:100%;display:flex;${land ? "flex-direction:row;" : "flex-direction:column;"}gap:${land ? 1.8 : 2.4}cqw;">
        ${tile(a, `${id}-t1`)}${tile(b, `${id}-t2`)}
      </div>
      ${pills.length ? `<div style="margin-top:${land ? 1.8 : 3}cqw;display:flex;flex-wrap:wrap;gap:${land ? 1 : 1.6}cqw;">
        ${pills.map((p) => `<div class="${id}-pill" style="opacity:0;display:inline-flex;align-items:center;gap:${land ? 0.65 : 1.15}cqw;padding:${land ? "0.6cqw 1.3cqw" : "1.1cqw 2cqw"};${cardCss(th, 9, 0.5)}">
          <span style="width:${land ? 0.55 : 1}cqw;height:${land ? 0.55 : 1}cqw;border-radius:50%;background:${th.accent2};"></span>
          <span style="font-family:${th.bodyStack};font-size:${land ? 1.05 : 1.95}cqw;color:${th.ink};white-space:nowrap;">${esc(p)}</span>
        </div>`).join("")}
      </div>` : ""}
    </div>`;
  const s = [
    kicker ? `tl.fromTo("#${id}-kick",{opacity:0,y:18},{opacity:1,y:0,duration:0.45,ease:"power3.out"},${r(T + 0.15)});` : "",
    `tl.fromTo(".${id}-t1",{opacity:0,y:44,scale:0.96},{opacity:1,y:0,scale:1,duration:0.68,ease:"power3.out"},${r(T + 0.55)});`,
    `tl.fromTo(".${id}-t2",{opacity:0,y:44,scale:0.96},{opacity:1,y:0,scale:1,duration:0.68,ease:"power3.out"},${r(T + 0.7)});`,
    `tl.to(".${id}-t1",{y:-9,duration:2.6,ease:"sine.inOut",yoyo:true,repeat:reps(${r(Math.max(0.1, L - 1.5))},2.6)},${r(T + 1.3)});`,
    pills.length ? `tl.fromTo(".${id}-pill",{opacity:0,y:20},{opacity:1,y:0,duration:0.45,ease:"power3.out",stagger:0.11},${r(T + 1)});` : "",
  ];
  return { html, s };
}

function signoff(scene, ctx, a) {
  const { id, T, L, theme: th, land, url } = ctx;
  const lines = breakLines(scene.headline, "").slice(0, 2);
  const kicker = fit(String(scene.kicker || ""), 24);
  const cta = fit(String(scene.cta || scene.emphasis || ""), 22);
  const size = headSize(lines, land ? 70 : 78, land ? 6.2 : 8.6);
  const btnInk = E.inkOn(th.accent);
  // Close the film on brand identity: the engine injects the site's logo into `a`
  // for this scene via family.wantsLogo (no demand-math change). Small, contained,
  // above the kicker; degrades to nothing when no logo was found.
  const logoHtml = (a && a.path)
    ? `<img id="${id}-logo" src="${esc(a.path)}" alt="${esc(a.alt || "logo")}" style="opacity:0;max-height:${land ? 4 : 6}cqw;max-width:${land ? 20 : 44}cqw;object-fit:contain;margin-bottom:${land ? 1.6 : 2.6}cqw;">`
    : "";
  const html = `
    ${orb(`${id}-orb`, th, land ? 46 : 66, 0.26, 50, 62)}
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:${land ? "11cqw 9cqw" : "22cqw 7cqw"};">
      ${logoHtml}
      ${chip(`${id}-kick`, th, land, kicker)}
      <div style="margin-top:${land ? 2 : 3.4}cqw;">${headBlock(id, th, lines, size, "center")}</div>
      ${cta ? `<div id="${id}-btn" style="opacity:0;margin-top:${land ? 2.6 : 4.2}cqw;display:inline-flex;align-items:center;gap:${land ? 1 : 1.7}cqw;padding:${land ? "1.15cqw 2.6cqw" : "2cqw 4.2cqw"};border-radius:9cqw;background:linear-gradient(100deg,${th.accent},${th.accent2});box-shadow:0 ${land ? 1.2 : 2}cqw ${land ? 3 : 5}cqw ${rgba(th.accent, 0.32)};">
        <span style="font-family:${th.displayStack};font-weight:700;font-size:${land ? 1.7 : 3}cqw;letter-spacing:0.01em;color:${btnInk};white-space:nowrap;">${esc(cta)}</span>
        <svg viewBox="0 0 24 24" style="width:${land ? 1.6 : 2.8}cqw;height:${land ? 1.6 : 2.8}cqw;display:block;flex:0 0 auto;"><path d="M4 12h14M12.5 6l6 6-6 6" fill="none" stroke="${btnInk}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>` : ""}
      <div id="${id}-url" style="opacity:0;margin-top:${land ? 1.9 : 3.2}cqw;font-family:${th.bodyStack};font-size:${land ? 1.28 : 2.3}cqw;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;color:${th.muted};">${esc(url)}</div>
    </div>`;
  const s = [
    `tl.fromTo("#${id}-orb",{opacity:0,scale:0.72,y:60},{opacity:1,scale:1,y:0,duration:0.95,ease:"power3.out"},${T});`,
    `tl.to("#${id}-orb",{scale:1.07,duration:2.2,ease:"sine.inOut",yoyo:true,repeat:reps(${r(Math.max(0.1, L - 1.2))},2.2)},${r(T + 1)});`,
    logoHtml ? `tl.fromTo("#${id}-logo",{opacity:0,y:-14},{opacity:1,y:0,duration:0.55,ease:"power3.out"},${r(T + 0.1)});` : "",
    kicker ? `tl.fromTo("#${id}-kick",{opacity:0,y:18},{opacity:1,y:0,duration:0.45,ease:"power3.out"},${r(T + 0.2)});` : "",
    cta ? `tl.fromTo("#${id}-btn",{opacity:0,y:26,scale:0.88},{opacity:1,y:0,scale:1,duration:0.6,ease:"back.out(1.7)"},${r(T + 0.75)});` : "",
    // The CTA is pressed, not just breathed at (motion spec part 6). A cursor
    // arrives, the button takes the press, and the glow answers it — the film
    // ends on the action it is asking for rather than on a pulsing rectangle.
    ...(cta ? M.cursorClickRipple(`#${id}-btn`, r(T + 1.35), { x: 0, y: 0 }) : []),
    ...(cta ? M.buttonPress(`#${id}-btn`, r(T + 2.05), { glow: true }) : []),
    cta ? `tl.to("#${id}-btn",{scale:1.035,duration:1.5,ease:"sine.inOut",yoyo:true,repeat:reps(${r(Math.max(0.1, L - 3.6))},1.5)},${r(T + 2.4)});` : "",
    `tl.fromTo("#${id}-url",{opacity:0,y:16},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 1)});`,
  ];
  return { html, s };
}

const SCENES = { keynote, productframe, featuretrio, metrics, voice, showcase, signoff };

// The ambient bokeh field. Positions/drifts are a fixed table rather than a
// random scatter on purpose: the renderer captures by seeking, so anything drawn
// from Math.random() would place these motes differently on every capture and
// the film would not be reproducible.
const BOKEH = [
  { x: 12, y: 22, s: 6.5, dx: 14, dy: -18, d: 9.0, t: 0.0 },
  { x: 78, y: 16, s: 4.2, dx: -11, dy: 15, d: 11.0, t: 0.6 },
  { x: 63, y: 71, s: 8.0, dx: 9, dy: -13, d: 10.0, t: 1.2 },
  { x: 27, y: 78, s: 5.0, dx: -8, dy: -16, d: 12.0, t: 0.3 },
  { x: 90, y: 52, s: 3.4, dx: -13, dy: 10, d: 8.0, t: 1.8 },
  { x: 45, y: 38, s: 3.0, dx: 12, dy: 14, d: 13.0, t: 0.9 },
];

// ---- persistent chrome (keynote deck furniture) -------------------------------
function chrome({ theme: th, D, brand, count, land }) {
  return {
    html: `
  <div id="backdrop" class="clip" data-start="0" data-duration="__D__" data-track-index="0" data-layout-allow-occlusion style="opacity:0;background:${th.ground};">
    <div id="bd-wash1" style="position:absolute;left:-22%;top:-30%;width:${land ? 58 : 90}cqw;height:${land ? 58 : 90}cqw;border-radius:50%;background:radial-gradient(circle at 50% 50%,${rgba(th.accent, 0.11)} 0%,${rgba(th.accent, 0.035)} 45%,${rgba(th.accent, 0)} 70%);"></div>
    <div id="bd-wash2" style="position:absolute;right:-24%;bottom:-34%;width:${land ? 66 : 98}cqw;height:${land ? 66 : 98}cqw;border-radius:50%;background:radial-gradient(circle at 50% 50%,${rgba(th.accent2, 0.1)} 0%,${rgba(th.accent2, 0.03)} 48%,${rgba(th.accent2, 0)} 72%);"></div>
    <div style="position:absolute;inset:0;background-image:linear-gradient(${rgba(th.ink, 0.035)} 0.07cqw,transparent 0.07cqw),linear-gradient(90deg,${rgba(th.ink, 0.035)} 0.07cqw,transparent 0.07cqw);background-size:${land ? 5 : 8}cqw ${land ? 5 : 8}cqw;"></div>
    <!-- AMBIENT (motion spec part 5). The two washes above already drift; these
         add the depth cues a flat ground cannot give: a slowly rotating conic
         sheen, a sparse bokeh field, and a fixed grain plate. Grain is a static
         SVG turbulence (never animated) — animated noise reads as video
         compression artefacts, and it would also defeat frame caching. -->
    <div id="bd-sheen" style="position:absolute;left:50%;top:50%;width:${land ? 120 : 170}cqw;height:${land ? 120 : 170}cqw;margin-left:${land ? -60 : -85}cqw;margin-top:${land ? -60 : -85}cqw;border-radius:50%;background:conic-gradient(from 0deg,${rgba(th.accent, 0)} 0deg,${rgba(th.accent, 0.05)} 70deg,${rgba(th.accent2, 0)} 150deg,${rgba(th.accent3, 0.045)} 250deg,${rgba(th.accent, 0)} 360deg);"></div>
    ${BOKEH.map((b, k) => `<div class="bd-mote" id="bd-mote${k}" style="position:absolute;left:${b.x}%;top:${b.y}%;width:${r(b.s * (land ? 1 : 1.6))}cqw;height:${r(b.s * (land ? 1 : 1.6))}cqw;border-radius:50%;background:radial-gradient(circle at 40% 38%,${rgba(k % 2 ? th.accent2 : th.accent, 0.3)} 0%,${rgba(k % 2 ? th.accent2 : th.accent, 0)} 68%);"></div>`).join("")}
    <div style="position:absolute;inset:0;opacity:0.038;mix-blend-mode:multiply;background-image:url('data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3"/></filter><rect width="140" height="140" filter="url(%23n)"/></svg>`).replace(/'/g, "%27")}');background-size:${land ? 18 : 26}cqw ${land ? 18 : 26}cqw;"></div>
  </div>
  <div id="hud" class="clip" data-start="0" data-duration="__D__" data-track-index="40" data-layout-allow-occlusion style="opacity:0;background:none;">
    <div style="position:absolute;left:${land ? 4 : 5}cqw;top:${land ? 4 : 5}cqw;display:flex;align-items:center;gap:${land ? 0.8 : 1.4}cqw;">
      <span style="width:${land ? 1.7 : 3}cqw;height:${land ? 1.7 : 3}cqw;border-radius:${land ? 0.55 : 0.95}cqw;background:linear-gradient(135deg,${th.accent},${th.accent2});display:block;"></span>
      <span style="font-family:${th.displayStack};font-weight:700;font-size:${land ? 1.1 : 2}cqw;letter-spacing:0.01em;color:${th.ink};">${esc(brand)}</span>
    </div>
    <div style="position:absolute;left:0;right:0;bottom:0;height:${land ? 0.3 : 0.5}cqw;background:${rgba(th.ink, 0.07)};">
      <div id="hud-prog" style="height:100%;width:100%;transform-origin:left center;background:linear-gradient(90deg,${th.accent},${th.accent2});"></div>
    </div>
  </div>`,
    script: `
  tl.fromTo("#backdrop",{opacity:0},{opacity:1,duration:0.5,ease:"power2.out"},0);
  tl.fromTo("#hud",{opacity:0},{opacity:1,duration:0.5,ease:"power2.out"},0.2);
  tl.fromTo("#hud-prog",{scaleX:0},{scaleX:1,duration:${r(Math.max(1, D))},ease:"none"},0);
  tl.to("#bd-wash1",{x:${land ? 40 : 26},y:26,duration:6,ease:"sine.inOut",yoyo:true,repeat:reps(${r(Math.max(1, D))},6)},0);
  tl.to("#bd-wash2",{x:${land ? -34 : -22},y:-22,duration:7,ease:"sine.inOut",yoyo:true,repeat:reps(${r(Math.max(1, D))},7)},0);
  /* One full, very slow revolution across the film: the sheen never returns to
     the same angle, so the ground keeps changing without ever calling attention
     to itself. Linear, and exactly one rotation, so any seek is unambiguous. */
  tl.fromTo("#bd-sheen",{rotation:0},{rotation:360,duration:${r(Math.max(1, D))},ease:"none",transformOrigin:"50% 50%"},0);
${BOKEH.map((b, k) => `  tl.to("#bd-mote${k}",{y:${r(b.dy)},x:${r(b.dx)},duration:${r(b.d)},ease:"sine.inOut",yoyo:true,repeat:reps(${r(Math.max(1, D))},${r(b.d)})},${r(b.t)});`).join("\n")}`,
  };
}

// Per-scene: step the deck counter in the HUD as each scene opens.
// No per-scene chrome — the "01 / 08" scene counter was removed: a slide number
// ticking up is the same slideshow tell as the progress rail.

function styleBlock(th, land) {
  return `${th.fontFace}
  #root { font-family:${th.bodyStack}; -webkit-font-smoothing:antialiased; }
  #cap-pill { background:${rgba(th.card, 0.94)} !important; border:0.09cqw solid ${th.cardLine} !important; border-radius:${land ? 0.8 : 1.4}cqw; ${softShadow(th, 0.8)} }
  #cap-text { font-family:${th.bodyStack}; font-size:${land ? 1.25 : 2.2}cqw; font-weight:500; color:${th.ink}; letter-spacing:0.005em; }`;
}

const family = {
  theme, styleBlock, chrome, SCENES, TEMPLATE_SCENES, route, mediaSlots, mediaFallback,
  wantsLogo: (t) => t === "signoff",
  fallbackType: "keynote",
  variants: 2,
  // Bright keynote packs glide — soft push-ins, light blur, never a whip slam.
  //
  // enabled:false hands the scene ARRIVAL to the motion system: the engine's
  // camo whip/zoom is replaced by the transition presets (depthWipe, panelSlide,
  // maskWipe, lightPass, cameraPush, rotating so no two consecutive scenes share
  // one), and the continuous camera move rides .cami through `motion.camera`.
  // The zoom parameters are kept for reference and for any pack that re-enables it.
  camera: { enabled: false, kinds: ["zoom"], dirs: [0], blur: 9, push: 0.04, zoomIn: 1.1, zoomOut: 1.07 },
  // ---- SHARED MOTION SYSTEM (services/motion_presets.js) ----------------------
  // This family no longer authors its own physics. It publishes WHERE its
  // headline, card and camera live in a scene, and the engine drives them from
  // the one preset library: word-stagger blur→sharp on type, 3D rise + float +
  // light sweep on cards, a continuous camera move per scene.
  //
  // ---- SCENE FILL (services/template_engine.js sceneFill) ---------------------
  // Measured: this family carried ~10 words over ~7% of the frame, so most of the
  // canvas was bare paper. The scenes' own spare copy (supporting points, a
  // figure, the subtext) is drawn as a chip row + slow marquee in the lower band.
  //
  // Zone per TYPE, because the safe band differs: the text scenes leave the
  // bottom third empty, the card scenes do not (the card occupies it), and the
  // closer must stay clean — a CTA with furniture under it stops being a CTA.
  fill: (type, ctx, scene) => {
    if (type === "signoff" || type === "voice") return null;      // closer + quote stay bare
    if (type === "productframe" || type === "showcase") return null; // card owns the band
    const land = ctx.land;
    return {
      left: land ? 7 : 6, right: land ? 7 : 6, bottom: land ? 7 : 10,
      font: land ? 1.15 : 2.0, max: 3, plate: ctx.theme.ground, ink: ctx.theme.ink,
      accent: ctx.theme.accent,
      // featuretrio already prints the bullets as cards — don't repeat them.
      used: type === "featuretrio" ? bullets(scene || {}, 3) : [],
    };
  },
  // Every scene function's own `.line` / `-card` entrance tweens were removed
  // when this was added — two timelines on one property fight, and the loser is
  // whichever the browser applies second.
  motion: {
    heroType: "keynote",
    // Per-scene tokens. The defaults rotate camera and transition by index; this
    // adds the two treatments that are design decisions rather than mechanics:
    // the hero opens on the outline→fill headline, and only scenes that actually
    // own a card get the card entrance/idle (a text scene given a card token
    // animates nothing and silently loses its camera slot).
    tokens: (type, i) => {
      const hasCard = type === "productframe" || type === "featuretrio"
        || type === "voice" || type === "showcase";
      return {
        // The film's two hero moments get the two signature type treatments —
        // the opener fills its first word from an outline, the close builds
        // character by character. Everything between is the house word stagger,
        // so the signatures stay signatures.
        text: type === "keynote" ? "outlineFillReveal"
          : type === "signoff" ? "characterReveal" : "wordStaggerBlur",
        enter: hasCard ? "cardRise3D" : "none",
        idle: hasCard ? "floatSoft" : "none",
        camera: M.CAMERA_MOVES[i % M.CAMERA_MOVES.length],
        transition: M.TRANSITIONS[i % M.TRANSITIONS.length],
      };
    },
    // headBlock() emits one .{id}-line div per headline line; the runtime word
    // splitter turns their text into per-word spans without the family having to
    // change its markup.
    text: (id) => `.${id}-line`,
    // Scenes use #id-card for a single card and .id-card for a row of them; one
    // selector covers both, and the stagger only shows when there are several.
    card: (id) => `#${id}-card, .${id}-card`,
    // The engine's own .camo owns the entry whip/zoom, so the continuous move
    // rides the inner layer and the two never contend.
    camera: (id) => `#${id}-cami`,
  },
};

function buildComposition(opts) { return E.buildFilm(family, opts); }
// This pack's media demand + what filled each slot, WITHOUT rendering. Runs the
// exact routing and slot-filling the renderer runs, so the manifest can never
// drift from the film that ships.
function planMedia(opts) { return E.planMedia(family, opts); }

module.exports = { buildComposition, planMedia, TEMPLATE_SCENES };
