// CINEMA family template — the authored scene grammar for the letterboxed,
// one-take, filmic packs (longshot-cinema, terminal-departures, premiere-night).
//
// These packs used to render through scene_kit's SHARED archetypes, so a
// departures board and a premiere house drew the same feature-card row as every
// other pack in the gallery. This file gives the whole family its own grammar —
// seven scenes that only make sense as TRAILER staging: a slate that fades up
// from black, a one-take plate with the copy low-left, beats cross-fading in the
// centre, a projected figure, a subtitle-style quote, a two-shot diptych and an
// end card. Every pack keeps its OWN skin: colours, fonts and text effects come
// from scene_kit.deriveTheme(pack), so longshot stays tungsten-on-graphite and
// premiere-night stays gold-on-house-dark. `variant` (hashed from the pack name)
// flips staging per pack so two packs never compose identically.
//
// IDENTITY (what makes this family unmistakable):
//   * PERSISTENT letterbox bars — drawn once in chrome(), never re-entering
//     between scenes — carrying a slate line (brand / shot / running timecode)
//     and a scene counter, so the whole film reads as one continuous take.
//   * slow, deliberate moves only: power2.out / sine, long holds, no slams.
//   * film grain, a drifting projector haze, a deep vignette, deep shadows.
//
// The render contract (seek-safety, tracks, hard kills, caption node, camera) is
// the engine's — see template_engine.js. This module is design only.

const { deriveTheme } = require("./scene_kit");
const E = require("./template_engine");
// The shared motion vocabulary — see services/motion_presets.js. Physics for
// headlines and cards lives there now, so every template moves alike.
const MOTION = require("./motion_presets");
const { esc, r, rgba, mix, statsOf, breakLines, bullets, fit, isScreenshot } = E;

// ---- theme -------------------------------------------------------------------
// The pack's own resolved identity + the cinema family's structural extras.
function theme(manifest, brandSkin, { framePack } = {}) {
  const t = deriveTheme(framePack, {}, brandSkin);
  const accents = (t.accents && t.accents.length ? t.accents : ["#FFB454", "#4D9FFF"]).slice(0, 4);
  // The letterbox bar is always near-black — even a light-ground pack gets real
  // scope bars, because a pale bar is a border, not a letterbox.
  const bar = mix(t.ground, "#000000", t.isDark ? 0.92 : 0.93);
  return {
    ...t,
    accent: accents[0],
    // Accents are tuned for FILLS. As small text they can sit at 2.9:1 on the
    // pack ground (measured across the gallery), so text use goes through a
    // guaranteed-AA variant while fills keep the raw hue.
    accentText: E.readable(t.ground, accents[0], 1, 4.5),
    accentText2: E.readable(t.ground, accents[1] || accents[0], 1, 4.5),
    accent2: accents[1] || accents[0],
    accent3: accents[2] || accents[1] || accents[0],
    bar,
    barInk: E.inkOn(bar, "#141210", "#EFEAE0"),
    // Copy laid over a photographic scrim is ALWAYS light: a light-ground pack's
    // ink is near-black and would vanish into the scrim.
    plateInk: "#F7F4EC",
    plateDeep: "#04060A",
    bgGrad: t.isDark
      ? `linear-gradient(178deg, ${mix(t.ground, "#000000", 0.34)} 0%, ${t.ground} 44%, ${mix(t.ground, "#000000", 0.52)} 100%)`
      : `linear-gradient(178deg, ${mix(t.ground, "#000000", 0.05)} 0%, ${t.ground} 46%, ${mix(t.ground, "#000000", 0.13)} 100%)`,
    displayStack: t.displayStack || t.fontStack || "system-ui, sans-serif",
    bodyStack: t.fontStack || "system-ui, sans-serif",
    fontFace: t.fontFace || "",
  };
}

// ---- published vocabulary (Template Director casts onto these) ----------------
// NOTE on naming: the director's opener/closer probes run over `type + bestFor`,
// so no other type may carry the words open/title/hook/intro/first, and only the
// closer may carry clos/cta/final. That is why the quote scene is `lowerthird`
// (not "subtitle") and the closer is `endcard` (not "endtitle").
const TEMPLATE_SCENES = [
  {
    type: "slate", bestFor: "opening title card, the film's very first frame",
    look: "A title card fading up out of black: a slate line (scene / take / brand) over a hairline rule that draws open, then the title lifting in line by line out of a soft blur.",
    slots: { lines: "1-3 stacked lines, 2-4 words each", kicker: "max 22 chars", subtext: "one line, max 92 chars" },
    media: [],
  },
  {
    type: "onetake", bestFor: "a product screen, a photograph or a hero shot carrying a claim",
    look: "One continuous wide plate: the image full-bleed behind a deep gradient scrim, slowly drifting, with the copy set low-left against an accent tick — the shot the narration talks over.",
    slots: { kicker: "max 24 chars", headline: "max 2 short lines", body: "one sentence, max 118 chars" },
    media: ["photo"], mediaMin: 0,
  },
  {
    type: "beats", bestFor: "a run of short lines, steps or points that build a rhythm",
    look: "A trailer beat sequence: each short line cross-fades up in the dead centre of frame, holds, then lifts away as the next arrives, with a row of beat dashes lighting underneath.",
    slots: { items: "2-4 lines, max 52 chars each", kicker: "max 28 chars" },
    media: [],
  },
  {
    type: "projection", bestFor: "one number that matters, a metric or a result",
    look: "A projector cone falls through the frame and a single colossal figure counts up inside the pool of light, its label stamped under a hairline rule.",
    slots: { stats: "1-2 of {v: number, suf: '%'|'X'|'K'|'M'|'', l: label max 26 chars}", headline: "max 46 chars" },
    media: [],
  },
  {
    type: "lowerthird", bestFor: "a testimonial or a customer quote, spoken words on screen",
    look: "The quote set as film subtitles low in frame — two lines arriving one after the other over a near-empty, spotlit plate — with the attribution stamped in mono beneath.",
    slots: { quote: "max 132 chars, verbatim", author: "person's name", role: "role and/or company" },
    media: [],
  },
  {
    type: "diptych", bestFor: "two visuals shown together, a comparison, a showcase",
    look: "A two-shot: two plates wiping open side by side across a drawn centre hairline, each with a mono slate caption strip along its foot.",
    slots: { kicker: "max 22 chars", headline: "max 2 short lines" },
    media: ["photo", "photo"], mediaMin: 1,
  },
  {
    type: "endcard", bestFor: "the closing call to action, the film's sign-off",
    look: "The end card: hairline rules draw above and below one last line, the action word settles into an outlined lozenge and the url fades up last in wide mono.",
    slots: { headline: "max 2 short lines", cta: "button label, max 22 chars", kicker: "max 22 chars" },
    media: [],
  },
];

const mediaSlots = { onetake: ["photo"], diptych: ["photo", "photo"], lowerthird: ["photo"] };
// True when the PREVIOUS scene already carried imagery — keeps media beats
// alternating now that any spare asset, not just a pinned screenshot, earns one.
const mediaBeatJustPlayed = (ctx) => ((mediaSlots[ctx && ctx.prevType] || []).length > 0);

// ---- deterministic router (used when the director is off / uncast) -----------
function route(scene, i, total, ctx) {
  const k = String(scene.kind || "").toLowerCase();
  const p = String(scene.purpose || "").toLowerCase();
  if (i === 0 || k === "hook" || k === "title") return "slate";
  if (i === total - 1 || k === "cta" || p === "cta") return "endcard";
  if (k === "quote" || scene.quote || /testimonial/.test(p)) return "lowerthird";
  if (k === "stat" || k === "chart" || statsOf(scene, 1).length) return "projection";
  if (/gallery|showcase|portfolio|social|proof|compare/.test(`${k} ${p}`) && ctx.freeCount >= 2 && ctx.prevType !== "diptych") return "diptych";
  // MEDIA BEAT — ahead of the text branch, and satisfied by ANY spare asset:
  // the media branch only fired for a pinned shot or a real screenshot, so a
  // pool of stock photos went unshown in a family built on imagery.
  // Per-type alternation: consecutive media beats are allowed as long as they
  // are DIFFERENT shot types (onetake <-> diptych) — the SAME type never
  // repeats back-to-back, so no two identical shots ever chain.
  if (ctx.freeCount >= 3 && ctx.prevType !== "diptych") return "diptych";
  if ((ctx.pinned || ctx.hasShot || ctx.freeCount >= 1) && ctx.prevType !== "onetake") return "onetake";
  if (bullets(scene, 4).length >= 2 && ctx.prevType !== "beats") return "beats";
  return ctx.prevType === "onetake" ? "beats" : "onetake";
}
// `onetake` draws a DESIGNED plate when it has no image (see plateFor), so an
// asset-less film still gets its wide shot — only re-route when the scene is
// really a list.
const mediaFallback = (scene, ctx) => {
  // Keep a quote scene on its testimonial card (lowerthird monogram) when no photo
  // is free, instead of rerouting it to onetake and dropping the quote.
  if (scene && (scene.quote || String(scene.kind || "").toLowerCase() === "quote" || /testimonial|review/.test(String(scene.purpose || "").toLowerCase()))) return null;
  return bullets(scene, 3).length >= 2 && ctx.prevType !== "beats" ? "beats" : "onetake";
};

// ---- shared cinema furniture --------------------------------------------------
const pad2 = (n) => String(n).padStart(2, "0");
const upper = (s) => String(s == null ? "" : s).toUpperCase();
// Frame height expressed in cqw (cqw == 1% of the container WIDTH), so vertical
// geometry can be authored in the same container-relative unit as everything else.
const frameH = (ctx) => r(100 * ((ctx.dims.height || 1080) / (ctx.dims.width || 1920)));
const barH = (land) => (land ? 6.2 : 9);
// Everything a scene draws must clear the persistent letterbox bars.
const padY = (ctx) => r(barH(ctx.land) + (ctx.land ? 3.2 : 4.6));

const longestOf = (lines) => Math.max(...lines.map((l) => String(l).length), 1);
// Type size that keeps the longest line inside `avail` cqw. `em` is the face's
// rough advance width per character.
function sizeFor(len, avail, em, cap, min) {
  return r(Math.max(min || 1.2, Math.min(cap, avail / Math.max(1, len * em))));
}
function titleLines(scene, max, fallback) {
  const raw = Array.isArray(scene.lines) && scene.lines.length
    ? scene.lines
    : breakLines(scene.headline || scene.title || "", "");
  const out = raw.map((l) => upper(String(l).trim())).filter(Boolean).slice(0, max);
  return out.length ? out : [upper(String(fallback || "")).slice(0, 18)].filter(Boolean);
}
// Balanced two-line split — how a real subtitle renderer breaks a caption.
function splitTwo(text) {
  const w = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!w.length) return [];
  if (w.length < 5) return [w.join(" ")];
  let best = 1, diff = Infinity;
  for (let i = 1; i < w.length; i++) {
    const d = Math.abs(w.slice(0, i).join(" ").length - w.slice(i).join(" ").length);
    if (d < diff) { diff = d; best = i; }
  }
  return [w.slice(0, best).join(" "), w.slice(best).join(" ")];
}
const grainLayer = (th, op, cell) =>
  `<div style="position:absolute;inset:0;opacity:${op};background-image:radial-gradient(${rgba(th.ink, 0.3)} 0.7px, transparent 0.7px);background-size:${cell || 0.34}cqw ${cell || 0.34}cqw;"></div>`;

// A media scene with no media must never be a black void: a designed plate with
// the brand ghosted into a lit gradient reads as an authored title background.
function plateFor(asset, ctx, idSuffix) {
  const { id, theme: th, land, brand } = ctx;
  const FH = frameH(ctx);
  if (asset && asset.path) {
    return `<img id="${id}-${idSuffix}" src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:${isScreenshot(asset) ? "top center" : "center center"};display:block;">`;
  }
  const grad = `radial-gradient(122% 88% at 22% 15%, ${rgba(th.accent, 0.34)} 0%, transparent 56%), radial-gradient(96% 76% at 84% 95%, ${rgba(th.accent2, 0.26)} 0%, transparent 58%), linear-gradient(158deg, ${mix(th.ground, "#000000", 0.16)} 0%, ${mix(th.ground, "#000000", 0.68)} 100%)`;
  const wm = upper(String(brand).slice(0, 12));
  // The ghosted wordmark is sized to FIT (tracking included) — a display face at
  // a fixed 15cqw runs off the plate on any brand longer than seven letters.
  const wmSize = sizeFor(wm.length, land ? 76 : 84, 0.95, land ? 15 : 21, 3);
  return `<div id="${id}-${idSuffix}" style="position:absolute;inset:0;background:${grad};">
      <div style="position:absolute;left:-26cqw;top:${r(-FH * 0.35)}cqw;width:52cqw;height:${r(FH * 1.9)}cqw;transform:rotate(17deg);background:linear-gradient(90deg,transparent 0%,${rgba(th.accent, 0.14)} 50%,transparent 100%);"></div>
      <div style="position:absolute;inset:0;display:grid;place-items:center;"><div style="font-family:${th.displayStack};font-weight:700;font-size:${wmSize}cqw;line-height:1;letter-spacing:0.12em;text-transform:uppercase;white-space:nowrap;color:${rgba(th.plateInk, 0.09)};">${esc(wm)}</div></div>
      ${grainLayer(th, 0.5)}
    </div>`;
}

// ---- scenes -------------------------------------------------------------------

// 1. SLATE — the title card that fades up out of black.
function slate(scene, ctx) {
  const { id, T, L, theme: th, land, brand, variant, i } = ctx;
  const pd = padY(ctx);
  const lines = titleLines(scene, 3, brand);
  const size = sizeFor(longestOf(lines), land ? 78 : 84, 0.63, land ? 8.4 : 11.2, 2.2);
  const sub = fit(String(scene.subtext || scene.body || ""), 92);
  const kick = fit(String(scene.kicker || scene.purpose || ""), 22).toUpperCase();
  const left = variant % 2 === 1;
  const tag = `SC ${pad2(i + 1)}   /   ${kick || `TAKE ${pad2(1 + (i % 4))}`}   /   ${upper(String(brand).slice(0, 14))}`;
  const gateA = i === 0 ? 0.82 : 0.55;
  const gateD = i === 0 ? 0.7 : 0.45;
  const html = `
    <div style="position:absolute;left:${land ? 9 : 7}cqw;right:${land ? 9 : 7}cqw;top:${pd}cqw;bottom:${pd}cqw;display:flex;flex-direction:column;justify-content:center;align-items:${left ? "flex-start" : "center"};text-align:${left ? "left" : "center"};">
      <div id="${id}-tag" style="opacity:0;font-family:${th.bodyStack};font-size:${land ? 1 : 1.75}cqw;letter-spacing:0.4em;white-space:nowrap;color:${th.accentText};">${esc(tag)}</div>
      <div id="${id}-rule" style="width:${land ? 24 : 46}cqw;height:0.12cqw;margin-top:${land ? 1.5 : 2.4}cqw;background:${rgba(th.ink, 0.45)};transform-origin:${left ? "left" : "center"} center;"></div>
      <div style="margin-top:${land ? 2.1 : 3.4}cqw;font-family:${th.displayStack};font-weight:700;text-transform:uppercase;letter-spacing:0.05em;">
        ${lines.map((ln, k) => `<div id="${id}-ln${k}" class="${id}-ln" style="opacity:0;font-size:${size}cqw;line-height:1.06;color:${th.ink};">${esc(ln)}</div>`).join("")}
      </div>
      ${sub ? `<div id="${id}-sub" style="opacity:0;margin-top:${land ? 2 : 3}cqw;max-width:${land ? 58 : 84}cqw;font-family:${th.bodyStack};font-size:${land ? 1.32 : 2.2}cqw;line-height:1.6;letter-spacing:0.14em;color:${rgba(th.ink, 0.68)};">${esc(sub)}</div>` : ""}
    </div>
    <div id="${id}-gate" style="position:absolute;inset:0;background:#000000;"></div>`;
  const s = [
    `tl.fromTo("#${id}-pool",{opacity:0,scale:0.9},{opacity:1,scale:1,duration:1.1,ease:"power2.out"},${T});`,
    `tl.fromTo("#${id}-gate",{opacity:${gateA}},{opacity:0,duration:${gateD},ease:"power2.out"},${T});`,
    `tl.fromTo("#${id}-tag",{opacity:0,y:${land ? -10 : -14}},{opacity:1,y:0,duration:0.6,ease:"power2.out"},${r(T + 0.08)});`,
    `tl.fromTo("#${id}-rule",{scaleX:0},{scaleX:1,duration:0.85,ease:"power2.out"},${r(T + 0.18)});`,
    sub ? `tl.fromTo("#${id}-sub",{opacity:0,y:16},{opacity:1,y:0,duration:0.85,ease:"power2.out"},${r(T + 0.9)});` : "",
    `tl.to("#${id}-rule",{scaleX:${left ? 1.7 : 1.4},duration:${r(Math.max(0.8, L - 1.6))},ease:"sine.inOut"},${r(T + 1.45)});`,
  ];
  return { html, s };
}

// 2. ONETAKE — the continuous wide plate, copy low-left.
function onetake(scene, ctx, asset) {
  const { id, T, L, theme: th, land, brand, variant } = ctx;
  const pd = padY(ctx);
  const lines = titleLines(scene, 2, brand);
  const size = sizeFor(longestOf(lines), land ? 56 : 82, 0.63, land ? 5.2 : 7.2, 2);
  const kick = fit(String(scene.kicker || scene.purpose || ""), 24).toUpperCase();
  const body = fit(String(scene.body || scene.subtext || ""), 118);
  const dir = variant % 2 === 1 ? -1 : 1;
  const html = `
    ${plateFor(asset, ctx, "img")}
    <div style="position:absolute;inset:0;background:linear-gradient(0deg, ${rgba(th.plateDeep, 0.95)} 0%, ${rgba(th.plateDeep, 0.72)} ${land ? 26 : 22}%, ${rgba(th.plateDeep, 0.1)} ${land ? 58 : 52}%, ${rgba(th.plateDeep, 0.4)} 100%);"></div>
    <div style="position:absolute;inset:0;background:linear-gradient(90deg, ${rgba(th.plateDeep, 0.68)} 0%, ${rgba(th.plateDeep, 0.04)} ${land ? 54 : 72}%);"></div>
    <div style="position:absolute;left:${land ? 7 : 6}cqw;right:${land ? 7 : 6}cqw;bottom:${pd}cqw;display:flex;align-items:flex-end;gap:${land ? 1.8 : 2.4}cqw;">
      <div id="${id}-mark" style="flex:0 0 auto;width:0.32cqw;align-self:stretch;background:${th.accent};transform-origin:bottom center;"></div>
      <div style="flex:1 1 auto;min-width:0;">
        ${kick ? `<div id="${id}-kick" style="opacity:0;font-family:${th.bodyStack};font-size:${land ? 1 : 1.7}cqw;letter-spacing:0.4em;text-transform:uppercase;color:${th.accentText};">${esc(kick)}</div>` : ""}
        <div style="margin-top:${land ? 0.9 : 1.5}cqw;font-family:${th.displayStack};font-weight:700;text-transform:uppercase;letter-spacing:0.02em;">
          ${lines.map((ln, k) => `<div id="${id}-l${k}" class="${id}-ln" style="opacity:0;font-size:${size}cqw;line-height:1.08;color:${th.plateInk};text-shadow:0 0.2cqw 1.1cqw ${rgba(th.plateDeep, 0.85)};">${esc(ln)}</div>`).join("")}
        </div>
        ${body ? `<div id="${id}-body" style="opacity:0;margin-top:${land ? 1.1 : 1.8}cqw;max-width:${land ? 48 : 82}cqw;font-family:${th.bodyStack};font-size:${land ? 1.28 : 2.1}cqw;line-height:1.55;color:${rgba(th.plateInk, 0.82)};">${esc(body)}</div>` : ""}
      </div>
    </div>`;
  const s = [
    `tl.fromTo("#${id}-img",{scale:1.18,xPercent:${r(-dir)}},{scale:1.06,xPercent:${r(dir)},duration:${r(Math.max(1.4, L))},ease:"none"},${T});`,
    `tl.fromTo("#${id}-mark",{scaleY:0},{scaleY:1,duration:0.8,ease:"power2.out"},${r(T + 0.1)});`,
    kick ? `tl.fromTo("#${id}-kick",{opacity:0,x:-18},{opacity:1,x:0,duration:0.65,ease:"power2.out"},${r(T + 0.14)});` : "",
    body ? `tl.fromTo("#${id}-body",{opacity:0,y:14},{opacity:1,y:0,duration:0.8,ease:"power2.out"},${r(T + 0.82)});` : "",
  ];
  return { html, s };
}

// 3. BEATS — the trailer title sequence: short lines cross-fading dead centre.
function beats(scene, ctx) {
  const { id, T, L, theme: th, land, brand } = ctx;
  const pd = padY(ctx);
  let items = bullets(scene, 4).map((b) => fit(String(b), 52)).filter(Boolean);
  if (items.length < 2) {
    items = [scene.headline, scene.subtext, scene.emphasis]
      .filter(Boolean).map((x) => fit(String(x), 52)).filter(Boolean);
  }
  if (items.length < 2) {
    items = breakLines(scene.headline || scene.subtext || "", "").map((x) => fit(x, 52)).filter(Boolean);
  }
  if (!items.length) items = [upper(String(brand).slice(0, 18))];
  const n = Math.max(1, Math.min(items.length, Math.floor((L - 0.5) / 0.8) || 1));
  items = items.slice(0, n).map(upper);
  const label = fit(String(scene.kicker || scene.purpose || ""), 28).toUpperCase();
  const size = sizeFor(longestOf(items), land ? 76 : 84, 0.6, land ? 6.2 : 8.2, 2);
  const html = `
    ${label ? `<div id="${id}-lab" style="opacity:0;position:absolute;left:0;right:0;top:${pd}cqw;text-align:center;font-family:${th.bodyStack};font-size:${land ? 1 : 1.75}cqw;letter-spacing:0.44em;text-transform:uppercase;color:${th.accentText};">${esc(label)}</div>` : ""}
    <div style="position:absolute;left:${land ? 8 : 6}cqw;right:${land ? 8 : 6}cqw;top:${pd}cqw;bottom:${pd}cqw;display:grid;place-items:center;">
      ${items.map((t, k) => `<div id="${id}-b${k}" style="grid-area:1/1;opacity:0;max-width:${land ? 80 : 88}cqw;font-family:${th.displayStack};font-weight:700;font-size:${size}cqw;line-height:1.12;letter-spacing:0.04em;text-transform:uppercase;text-align:center;color:${th.ink};">${esc(t)}</div>`).join("")}
    </div>
    <div style="position:absolute;left:0;right:0;bottom:${pd}cqw;display:flex;justify-content:center;gap:${land ? 1 : 1.5}cqw;">
      ${items.map((_, k) => `<div id="${id}-d${k}" style="opacity:0.3;width:${land ? 3.4 : 5}cqw;height:0.16cqw;background:${th.accent};transform-origin:left center;"></div>`).join("")}
    </div>`;
  // A beat has to HOLD to read, and two beats must never share the centre line:
  // overlapping one centred title with the next reads as a bug, not a dissolve.
  // So the exit lands exactly where the next entrance starts (a clean hand-off)
  // and travels far enough to clear the baseline on the way out.
  const step = r((L - 0.3) / n);
  const inD = r(Math.min(0.5, Math.max(0.26, step * 0.34)));
  const outD = r(Math.min(0.3, Math.max(0.18, step * 0.2)));
  const s = [label ? `tl.fromTo("#${id}-lab",{opacity:0,y:-12},{opacity:1,y:0,duration:0.65,ease:"power2.out"},${r(T + 0.08)});` : ""];
  items.forEach((_, k) => {
    const at = r(T + 0.15 + k * step);
    s.push(`tl.fromTo("#${id}-b${k}",{opacity:0,y:${land ? 22 : 28},filter:"blur(8px)"},{opacity:1,y:0,filter:"blur(0px)",duration:${inD},ease:"power2.out"},${at});`);
    s.push(`tl.fromTo("#${id}-d${k}",{scaleX:0.14,opacity:0.3},{scaleX:1,opacity:1,duration:0.5,ease:"power2.out"},${at});`);
    if (k < items.length - 1) {
      s.push(`tl.to("#${id}-b${k}",{opacity:0,y:${land ? -30 : -38},filter:"blur(7px)",duration:${outD},ease:"power2.in"},${r(at + step - outD)});`);
    }
  });
  return { html, s };
}

// 4. PROJECTION — one figure thrown on the wall by a projector cone.
function projection(scene, ctx) {
  const { id, T, L, theme: th, land, variant, brand } = ctx;
  const pd = padY(ctx), FH = frameH(ctx);
  const stats = statsOf(scene, 2);
  const main = stats[0] || null;
  const second = stats[1] || null;
  // No usable number in the scene → project the scene's own key WORD instead of
  // inventing a figure.
  const word = main ? "" : upper(fit(String(scene.emphasis || bullets(scene, 1)[0] || scene.headline || brand), 18));
  const figure = main ? `${main.pre}${main.v}${main.suf}` : word;
  const label = fit(String((main && main.l) || scene.kicker || scene.purpose || ""), 26).toUpperCase();
  const head = fit(String(scene.headline || ""), 46).toUpperCase();
  const numSize = sizeFor(figure.length, land ? 74 : 84, 0.62, land ? 18 : 23, 3.4);
  const left = variant % 2 === 1;
  const coneW = land ? 56 : 82;
  const html = `
    <div id="${id}-cone" style="position:absolute;left:50%;top:${r(-FH * 0.1)}cqw;margin-left:${r(-coneW / 2)}cqw;width:${coneW}cqw;height:${r(FH * 1.14)}cqw;background:linear-gradient(180deg, ${rgba(th.accent, 0.22)} 0%, ${rgba(th.accent, 0.07)} 44%, ${rgba(th.accent, 0)} 84%);clip-path:polygon(40% 0%, 60% 0%, 100% 100%, 0% 100%);filter:blur(9px);"></div>
    ${head ? `<div id="${id}-head" style="opacity:0;position:absolute;left:0;right:0;top:${pd}cqw;text-align:${left ? "left" : "center"};padding:0 ${land ? 9 : 7}cqw;font-family:${th.bodyStack};font-size:${land ? 1.08 : 1.85}cqw;letter-spacing:0.4em;text-transform:uppercase;color:${rgba(th.ink, 0.66)};">${esc(head)}</div>` : ""}
    <div style="position:absolute;left:${land ? 9 : 7}cqw;right:${land ? 9 : 7}cqw;top:${pd}cqw;bottom:${pd}cqw;display:flex;flex-direction:column;justify-content:center;align-items:${left ? "flex-start" : "center"};">
      <div id="${id}-num" style="opacity:0;font-family:${th.displayStack};font-weight:700;font-size:${numSize}cqw;line-height:0.94;letter-spacing:-0.015em;white-space:nowrap;color:${th.ink};text-shadow:0 0 ${land ? 3 : 5}cqw ${rgba(th.accent, 0.4)};">${esc(main ? `${main.pre}0${main.suf}` : figure)}</div>
      <div id="${id}-r2" style="width:${land ? 20 : 38}cqw;height:0.12cqw;margin-top:${land ? 1.6 : 2.6}cqw;background:${rgba(th.accent, 0.8)};transform-origin:${left ? "left" : "center"} center;"></div>
      ${label ? `<div id="${id}-lab" style="opacity:0;margin-top:${land ? 1.3 : 2.2}cqw;font-family:${th.bodyStack};font-size:${land ? 1.28 : 2.15}cqw;letter-spacing:0.36em;text-transform:uppercase;color:${rgba(th.ink, 0.8)};">${esc(label)}</div>` : ""}
    </div>
    ${second ? `<div id="${id}-2nd" style="opacity:0;position:absolute;left:0;right:0;bottom:${pd}cqw;text-align:${left ? "left" : "center"};padding:0 ${land ? 9 : 7}cqw;font-family:${th.bodyStack};font-size:${land ? 1.15 : 1.95}cqw;letter-spacing:0.24em;text-transform:uppercase;color:${rgba(th.ink, 0.6)};"><span id="${id}-n2">${esc(second.pre)}0${esc(second.suf)}</span>&nbsp;&nbsp;${esc(fit(second.l, 24))}</div>` : ""}`;
  const s = [
    `tl.fromTo("#${id}-cone",{opacity:0,scaleY:0.72},{opacity:1,scaleY:1,duration:1,ease:"power2.out",transformOrigin:"top center"},${T});`,
    `tl.to("#${id}-cone",{rotation:${left ? -2.4 : 2.4},duration:${r(Math.max(0.9, L - 1.2))},ease:"sine.inOut",transformOrigin:"top center"},${r(T + 1.1)});`,
    head ? `tl.fromTo("#${id}-head",{opacity:0,y:-12},{opacity:1,y:0,duration:0.65,ease:"power2.out"},${r(T + 0.08)});` : "",
    `tl.fromTo("#${id}-num",{opacity:0,scale:0.9,filter:"blur(9px)"},{opacity:1,scale:1,filter:"blur(0px)",duration:0.75,ease:"power2.out"},${r(T + 0.12)});`,
    main ? `countTxt("#${id}-num",${main.v},${r(T + 0.2)},${r(Math.min(2.2, Math.max(0.8, L * 0.55)))},${JSON.stringify(main.pre)},${JSON.stringify(main.suf)},${main.isFloat ? 10 : 1});` : "",
    `tl.fromTo("#${id}-r2",{scaleX:0},{scaleX:1,duration:0.85,ease:"power2.out"},${r(T + 0.55)});`,
    label ? `tl.fromTo("#${id}-lab",{opacity:0,y:16},{opacity:1,y:0,duration:0.75,ease:"power2.out"},${r(T + 0.75)});` : "",
    second ? `tl.fromTo("#${id}-2nd",{opacity:0,y:14},{opacity:1,y:0,duration:0.75,ease:"power2.out"},${r(T + 1.15)});` : "",
    second ? `countTxt("#${id}-n2",${second.v},${r(T + 1.2)},${r(Math.min(1.4, Math.max(0.6, L * 0.35)))},${JSON.stringify(second.pre)},${JSON.stringify(second.suf)},${second.isFloat ? 10 : 1});` : "",
  ];
  return { html, s };
}

// 5. LOWERTHIRD — the testimonial as film subtitles, low in frame.
function lowerthird(scene, ctx, a) {
  const { id, T, L, theme: th, land } = ctx;
  const pd = padY(ctx), FH = frameH(ctx);
  // A testimonial reads far stronger with the speaker in frame: when a photo is
  // cast to this scene it becomes a spotlit circular avatar sitting in the pool
  // of light; with no asset it degrades to the original ghosted quote glyph.
  const hasAvatar = a && a.path;
  const avSize = land ? 12 : 20;
  const quote = fit(String(scene.quote || scene.subtext || scene.headline || ""), 132);
  const qlines = splitTwo(quote);
  const size = sizeFor(longestOf(qlines.length ? qlines : [""]), land ? 76 : 86, 0.55, land ? 3.9 : 5.6, 1.4);
  const author = fit(String(scene.author || scene.emphasis || ""), 32).toUpperCase();
  const role = fit(String(scene.role || scene.company || ""), 34).toUpperCase();
  const attrib = [author, role].filter(Boolean).join("   ·   ");
  const html = `
    <div id="${id}-pool" style="position:absolute;left:50%;top:${r(FH * 0.08)}cqw;margin-left:${land ? -34 : -46}cqw;width:${land ? 68 : 92}cqw;height:${r(FH * 0.56)}cqw;background:radial-gradient(ellipse 60% 54% at 50% 46%, ${rgba(th.accent, 0.26)} 0%, ${rgba(th.accent, 0.07)} 46%, transparent 74%);filter:blur(8px);"></div>
    ${hasAvatar
      ? `<div id="${id}-mark" style="opacity:0;position:absolute;left:50%;top:${r(FH * 0.09)}cqw;margin-left:${r(-avSize / 2)}cqw;width:${avSize}cqw;height:${avSize}cqw;border-radius:50%;overflow:hidden;border:0.16cqw solid ${rgba(th.plateInk, 0.55)};box-shadow:0 0.3cqw 1.4cqw ${rgba(th.plateDeep, 0.82)};">
           <img src="${esc(a.path)}" alt="${esc(a.alt || "")}" style="width:100%;height:100%;object-fit:cover;display:block;">
         </div>`
      : `<div id="${id}-mark" style="opacity:0;position:absolute;left:0;right:0;top:${r(FH * 0.11)}cqw;text-align:center;font-family:${th.displayStack};font-weight:700;font-size:${land ? 26 : 38}cqw;line-height:0.8;color:${rgba(th.ink, 0.14)};">&ldquo;</div>`}
    <div id="${id}-hz" style="position:absolute;left:${land ? 12 : 8}cqw;right:${land ? 12 : 8}cqw;top:${r(FH * 0.52)}cqw;height:0.1cqw;background:${rgba(th.ink, 0.22)};transform-origin:center center;"></div>
    <div style="position:absolute;left:${land ? 10 : 6}cqw;right:${land ? 10 : 6}cqw;bottom:${pd}cqw;text-align:center;">
      ${qlines.map((ln, k) => `<div id="${id}-q${k}" style="opacity:0;font-family:${th.bodyStack};font-weight:500;font-size:${size}cqw;line-height:1.4;letter-spacing:0.02em;color:${th.plateInk};text-shadow:0 0.16cqw 0.9cqw ${rgba(th.plateDeep, 0.92)};">${esc(ln)}</div>`).join("")}
      ${attrib ? `<div id="${id}-at" style="opacity:0;margin-top:${land ? 1.5 : 2.4}cqw;font-family:${th.bodyStack};font-size:${land ? 1.05 : 1.8}cqw;letter-spacing:0.36em;text-transform:uppercase;color:${th.accentText};">${esc(attrib)}</div>` : ""}
    </div>`;
  const s = [
    `tl.fromTo("#${id}-mark",{opacity:0,y:${land ? 18 : 24}},{opacity:1,y:0,duration:1,ease:"power2.out"},${r(T + 0.06)});`,
    `tl.fromTo("#${id}-hz",{scaleX:0},{scaleX:1,duration:1,ease:"power2.out"},${r(T + 0.15)});`,
  ];
  qlines.forEach((_, k) => {
    s.push(`tl.fromTo("#${id}-q${k}",{opacity:0,y:${land ? 14 : 18}},{opacity:1,y:0,duration:0.7,ease:"power2.out"},${r(T + 0.22 + k * 0.5)});`);
  });
  if (attrib) s.push(`tl.fromTo("#${id}-at",{opacity:0,y:12},{opacity:1,y:0,duration:0.75,ease:"power2.out"},${r(T + 0.32 + qlines.length * 0.5 + 0.2)});`);
  s.push(`tl.to("#${id}-pool",{y:${land ? -10 : -16},duration:${r(Math.max(1, L - 1.6))},ease:"sine.inOut"},${r(T + 1.4)});`);
  return { html, s };
}

// 6. DIPTYCH — the two-shot: two plates wiping open across a centre hairline.
function diptych(scene, ctx, a, b) {
  const { id, T, L, theme: th, land, brand, variant } = ctx;
  const pd = padY(ctx);
  const lines = titleLines(scene, 2, brand);
  const kick = fit(String(scene.kicker || scene.purpose || ""), 22).toUpperCase();
  const headSize = sizeFor(longestOf(lines), land ? 68 : 82, 0.63, land ? 4.2 : 6, 1.8);
  const headH = r((kick ? (land ? 2.8 : 4.4) : 0) + lines.length * headSize * 1.14 + (land ? 2.4 : 3.6));
  const top = r(pd + headH);
  const side = land ? 7 : 6;
  const capOf = (asset, n) => {
    const t = fit(String((asset && (asset.caption || asset.alt)) || ""), 26).toUpperCase();
    return `PLATE ${pad2(n)}${t && /[A-Z0-9]/.test(t) ? `   ·   ${t}` : ""}`;
  };
  const panel = (asset, k, n) => `
      <div id="${id}-p${k}" style="flex:1 1 0;position:relative;overflow:hidden;min-width:0;min-height:0;border:0.1cqw solid ${rgba(th.ink, 0.22)};background:${th.panel || th.ground};">
        ${asset && asset.path
          ? `<img id="${id}-i${k}" src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:${isScreenshot(asset) ? "top center" : "center center"};display:block;">`
          : `<div id="${id}-i${k}" style="position:absolute;inset:0;background:linear-gradient(152deg, ${rgba(th.accent, 0.92)} 0%, ${mix(th.accent, th.ground, 0.68)} 100%);display:grid;place-items:center;">
               <div style="text-align:center;padding:1.4cqw;">
                 <div style="font-family:${th.displayStack};font-weight:700;font-size:${land ? 4 : 5.6}cqw;line-height:1;letter-spacing:0.1em;text-transform:uppercase;color:${E.inkOn(th.accent, "#141210", "#F7F4EC")};">${esc(upper(String(brand).slice(0, 12)))}</div>
                 <div style="margin-top:${land ? 0.8 : 1.3}cqw;font-family:${th.bodyStack};font-size:${land ? 0.92 : 1.5}cqw;letter-spacing:0.34em;text-transform:uppercase;color:${rgba(E.inkOn(th.accent, "#141210", "#F7F4EC"), 0.75)};">${esc(kick || "SECOND UNIT")}</div>
               </div>
             </div>`}
        <div style="position:absolute;left:0;right:0;bottom:0;padding:${land ? "0.5cqw 0.9cqw" : "0.9cqw 1.4cqw"};background:linear-gradient(0deg, ${rgba(th.plateDeep, 0.86)} 0%, ${rgba(th.plateDeep, 0)} 100%);">
          <span style="font-family:${th.bodyStack};font-size:${land ? 0.86 : 1.42}cqw;letter-spacing:0.28em;text-transform:uppercase;color:${rgba(th.plateInk, 0.82)};white-space:nowrap;">${esc(capOf(asset, n))}</span>
        </div>
      </div>`;
  const first = variant % 2 === 1 ? b : a;
  const secondA = variant % 2 === 1 ? a : b;
  const html = `
    <div style="position:absolute;left:${side}cqw;right:${side}cqw;top:${pd}cqw;">
      ${kick ? `<div id="${id}-kick" style="opacity:0;font-family:${th.bodyStack};font-size:${land ? 1 : 1.72}cqw;letter-spacing:0.4em;text-transform:uppercase;color:${th.accentText};">${esc(kick)}</div>` : ""}
      <div style="margin-top:${kick ? (land ? 1 : 1.7) : 0}cqw;font-family:${th.displayStack};font-weight:700;text-transform:uppercase;letter-spacing:0.03em;">
        ${lines.map((ln, k) => `<div id="${id}-h${k}" class="${id}-hd" style="opacity:0;font-size:${headSize}cqw;line-height:1.14;color:${th.ink};">${esc(ln)}</div>`).join("")}
      </div>
    </div>
    <div style="position:absolute;left:${side}cqw;right:${side}cqw;top:${top}cqw;bottom:${pd}cqw;display:flex;flex-direction:${land ? "row" : "column"};gap:${land ? 1.4 : 2}cqw;">
      ${panel(first, 0, 1)}
      ${panel(secondA, 1, 2)}
    </div>
    <div id="${id}-div" style="position:absolute;${land
      ? `left:50%;top:${top}cqw;bottom:${pd}cqw;width:0.1cqw;transform-origin:top center;`
      : `left:${side}cqw;right:${side}cqw;top:${r(top + (frameH(ctx) - top - pd) / 2)}cqw;height:0.1cqw;transform-origin:left center;`}background:${rgba(th.ink, 0.4)};"></div>`;
  const s = [
    kick ? `tl.fromTo("#${id}-kick",{opacity:0,x:-18},{opacity:1,x:0,duration:0.65,ease:"power2.out"},${r(T + 0.08)});` : "",
    `tl.fromTo(".${id}-hd",{opacity:0,y:${land ? 20 : 24}},{opacity:1,y:0,duration:0.8,ease:"power2.out",stagger:0.14},${r(T + 0.16)});`,
    `tl.fromTo("#${id}-p0",{opacity:0,clipPath:"${land ? "inset(0 100% 0 0)" : "inset(0 0 100% 0)"}"},{opacity:1,clipPath:"inset(0 0% 0% 0)",duration:0.9,ease:"power2.out"},${r(T + 0.24)});`,
    `tl.fromTo("#${id}-p1",{opacity:0,clipPath:"${land ? "inset(0 0 0 100%)" : "inset(100% 0 0 0)"}"},{opacity:1,clipPath:"inset(0% 0 0 0%)",duration:0.9,ease:"power2.out"},${r(T + 0.46)});`,
    `tl.fromTo("#${id}-div",{${land ? "scaleY" : "scaleX"}:0},{${land ? "scaleY" : "scaleX"}:1,duration:0.95,ease:"power2.out"},${r(T + 0.3)});`,
    `tl.fromTo("#${id}-i0",{scale:1.12},{scale:1.02,duration:${r(Math.max(1.4, L))},ease:"none"},${T});`,
    `tl.fromTo("#${id}-i1",{scale:1.02},{scale:1.12,duration:${r(Math.max(1.4, L))},ease:"none"},${T});`,
  ];
  return { html, s };
}

// 7. ENDCARD — the sign-off, url fading up last.
function endcard(scene, ctx, a) {
  const { id, T, theme: th, land, url, brand } = ctx;
  const pd = padY(ctx);
  const lines = titleLines(scene, 2, brand);
  const size = sizeFor(longestOf(lines), land ? 76 : 84, 0.63, land ? 7.8 : 10.2, 2.2);
  const cta = fit(String(scene.cta || scene.emphasis || ""), 22).toUpperCase();
  const kick = fit(String(scene.kicker || ""), 22).toUpperCase();
  // The site's own logo signs the film off above the last line when the engine
  // injects it (wantsLogo); with no logo the card is unchanged.
  const logo = a && a.path
    ? `<img id="${id}-logo" src="${esc(a.path)}" alt="${esc(a.alt || "")}" style="opacity:0;display:block;max-height:${land ? 4 : 6}cqw;max-width:${land ? 26 : 44}cqw;object-fit:contain;margin-bottom:${land ? 1.9 : 3}cqw;">`
    : "";
  const html = `
    <div style="position:absolute;left:${land ? 9 : 7}cqw;right:${land ? 9 : 7}cqw;top:${pd}cqw;bottom:${pd}cqw;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;">
      ${logo}
      ${kick ? `<div id="${id}-kick" style="opacity:0;margin-bottom:${land ? 1.6 : 2.6}cqw;font-family:${th.bodyStack};font-size:${land ? 1.05 : 1.8}cqw;letter-spacing:0.44em;text-transform:uppercase;color:${th.accentText};">${esc(kick)}</div>` : ""}
      <div id="${id}-rt" style="width:${land ? 30 : 52}cqw;height:0.1cqw;background:${rgba(th.ink, 0.3)};transform-origin:center center;"></div>
      <div style="margin:${land ? 2.2 : 3.4}cqw 0;font-family:${th.displayStack};font-weight:700;text-transform:uppercase;letter-spacing:0.05em;">
        ${lines.map((ln, k) => `<div id="${id}-e${k}" class="${id}-ln" style="opacity:0;font-size:${size}cqw;line-height:1.08;color:${th.ink};">${esc(ln)}</div>`).join("")}
      </div>
      <div id="${id}-rb" style="width:${land ? 30 : 52}cqw;height:0.1cqw;background:${rgba(th.ink, 0.3)};transform-origin:center center;"></div>
      ${cta ? `<div id="${id}-cta" style="opacity:0;margin-top:${land ? 2.4 : 3.6}cqw;padding:${land ? "0.9cqw 2.6cqw" : "1.5cqw 3.6cqw"};border:0.12cqw solid ${th.accent};font-family:${th.bodyStack};font-size:${land ? 1.35 : 2.25}cqw;letter-spacing:0.34em;text-transform:uppercase;color:${th.accentText};">${esc(cta)}</div>` : ""}
      <div id="${id}-url" style="opacity:0;margin-top:${land ? 1.8 : 2.8}cqw;font-family:${th.bodyStack};font-size:${land ? 1.15 : 1.95}cqw;letter-spacing:0.4em;text-transform:uppercase;color:${rgba(th.ink, 0.66)};">${esc(url)}</div>
    </div>`;
  const s = [
    a && a.path ? `tl.fromTo("#${id}-logo",{opacity:0,y:${land ? -14 : -18}},{opacity:1,y:0,duration:0.7,ease:"power2.out"},${T});` : "",
    kick ? `tl.fromTo("#${id}-kick",{opacity:0,y:-14},{opacity:1,y:0,duration:0.7,ease:"power2.out"},${r(T + 0.06)});` : "",
    `tl.fromTo("#${id}-rt",{scaleX:0},{scaleX:1,duration:1,ease:"power2.out"},${r(T + 0.12)});`,
    `tl.fromTo("#${id}-rb",{scaleX:0},{scaleX:1,duration:1,ease:"power2.out"},${r(T + 0.24)});`,
    cta ? `tl.fromTo("#${id}-cta",{opacity:0,scale:0.94},{opacity:1,scale:1,duration:0.8,ease:"power2.out"},${r(T + 1)});` : "",
    `tl.fromTo("#${id}-url",{opacity:0,y:14},{opacity:1,y:0,duration:0.9,ease:"power2.out"},${r(T + 1.35)});`,
  ];
  return { html, s };
}

const SCENES = { slate, onetake, beats, projection, lowerthird, diptych, endcard };

// ---- persistent chrome (the letterbox, drawn ONCE for the whole film) ---------
// The bars, the slate line, the grain and the vignette live here so they never
// re-enter or reset between scenes — that continuity IS the family's identity.
function chrome({ theme: th, D, brand, url, count, land, dims }) {
  const bar = barH(land);
  const FH = r(100 * ((dims.height || 1080) / (dims.width || 1920)));
  const mono = (sz, col, tr) => `font-family:${th.bodyStack};font-size:${sz}cqw;letter-spacing:${tr}em;text-transform:uppercase;color:${col};white-space:nowrap;`;
  const fs = land ? 0.9 : 1.5;
  // Running timecode. Stamped with tl.set() at fixed times (never an onUpdate
  // closure) so every seeked frame resolves to the same value.
  const step = Math.max(0.25, r(D / 240));
  const tc = [];
  for (let k = 0; k <= 400; k++) {
    const t = r(k * step);
    if (t > D) break;
    const mm = Math.floor(t / 60), ss = Math.floor(t % 60), ff = Math.round((t % 1) * 30) % 30;
    tc.push(`tl.set("#lb-tc",{textContent:"01:${pad2(mm)}:${pad2(ss)}:${pad2(ff)}"},${t});`);
  }
  return {
    html: `
  <div id="backdrop" class="clip" data-start="0" data-duration="__D__" data-track-index="0" data-layout-allow-occlusion style="background:${th.bgGrad};">
    <div id="bd-haze" style="position:absolute;left:-24cqw;top:${r(-FH * 0.3)}cqw;width:150cqw;height:${r(FH * 1.7)}cqw;background:linear-gradient(102deg, transparent 30%, ${rgba(th.accent, 0.13)} 46%, transparent 62%);"></div>
    <div id="bd-vig" style="position:absolute;inset:0;background:radial-gradient(ellipse 80% 70% at 50% 46%, transparent 32%, ${rgba("#000000", 0.5)} 100%);"></div>
    <div id="bd-grain" style="position:absolute;inset:-2cqw;opacity:0.34;background-image:radial-gradient(${rgba(th.ink, 0.26)} 0.7px, transparent 0.7px);background-size:0.34cqw 0.34cqw;"></div>
  </div>
  <div id="lbox" class="clip" data-start="0" data-duration="__D__" data-track-index="42" data-layout-allow-occlusion style="background:none;">
    <div id="lb-top" style="position:absolute;left:0;right:0;top:0;height:${bar}cqw;background:${th.bar};display:flex;align-items:center;justify-content:space-between;padding:0 ${land ? 2.8 : 3.6}cqw;">
      <div style="display:flex;align-items:center;gap:${land ? 0.9 : 1.4}cqw;">
        <span id="lb-rec" style="display:block;width:${land ? 0.6 : 1}cqw;height:${land ? 0.6 : 1}cqw;border-radius:50%;background:${th.accent};"></span>
        <span style="${mono(fs, th.barInk, 0.34)}">${esc(upper(String(brand).slice(0, 16)))}</span>
        <span style="${mono(fs, rgba(th.barInk, 0.3), 0)}">/</span>
        <span id="lb-shot" style="${mono(fs, rgba(th.barInk, 0.62), 0.28)}">WIDE</span>
      </div>
      <span id="lb-tc" style="${mono(fs, rgba(th.barInk, 0.72), 0.22)}">01:00:00:00</span>
    </div>
    <div id="lb-line" style="position:absolute;left:0;right:0;top:${bar}cqw;height:0.12cqw;background:${rgba(th.accent, 0.62)};transform-origin:left center;"></div>
    <div id="lb-line2" style="position:absolute;left:0;right:0;bottom:${bar}cqw;height:0.12cqw;background:${rgba(th.barInk, 0.22)};transform-origin:right center;"></div>
    <div id="lb-bot" style="position:absolute;left:0;right:0;bottom:0;height:${bar}cqw;background:${th.bar};display:flex;align-items:center;justify-content:space-between;padding:0 ${land ? 2.8 : 3.6}cqw;">
      <span style="${mono(fs, rgba(th.barInk, 0.72), 0.3)}">${esc(String(url).slice(0, 38))}</span>
    </div>
  </div>`,
    script: `
  tl.fromTo("#lb-line",{scaleX:0},{scaleX:1,duration:1.3,ease:"power2.out"},0);
  tl.fromTo("#lb-line2",{scaleX:0},{scaleX:1,duration:1.3,ease:"power2.out"},0.1);
  tl.to("#lb-rec",{opacity:0.16,duration:0.6,yoyo:true,repeat:reps(${D},0.6),ease:"none"},0);
  tl.to("#bd-grain",{opacity:0.19,duration:0.7,yoyo:true,repeat:reps(${D},0.7),ease:"sine.inOut"},0);
  tl.fromTo("#bd-haze",{xPercent:-5,opacity:0.9},{xPercent:5,opacity:1,duration:${r(Math.max(4, D))},ease:"sine.inOut"},0);
  ${tc.join("\n  ")}`,
  };
}

// Per-scene: re-stamp the slate line in the letterbox as each shot opens.
const SHOT = {
  slate: "SLATE", onetake: "WIDE", beats: "MONTAGE",
  projection: "INSERT", lowerthird: "CLOSE", diptych: "TWO SHOT", endcard: "END",
};
function perScene(scene, ctx) {
  // The "SC 01/08" slate counter was removed (slideshow tell); the SHOT label is
  // a cinema-slate flourish, not a progress indicator, so it stays.
  const at = ctx.i === 0 ? 0 : r(ctx.T);
  return `tl.set("#lb-shot",{textContent:${JSON.stringify(SHOT[ctx.type] || "WIDE")}},${at});`;
}

function styleBlock(th, land) {
  const bar = barH(land);
  return `${th.fontFace}
  #root { font-family:${th.bodyStack}; }
  /* Captions are film subtitles: no pill, and lifted clear of the letterbox bar. */
  #caps { padding-bottom:${r(bar + (land ? 2.4 : 3.2))}%; }
  #cap-pill { background:none !important; border:0 !important; border-radius:0; padding:0; max-width:80%; }
  #cap-text { font-family:${th.bodyStack}; font-size:${land ? 1.5 : 2.5}cqw; line-height:1.4; letter-spacing:0.02em; color:${th.plateInk}; text-shadow:0 0.18cqw 0.7cqw ${rgba(th.plateDeep, 0.92)}; }`;
}

const family = {
  // ---- SCENE FILL (services/template_engine.js sceneFill) ---------------------
  // Measured 2026-08-04: scenes carried ~11 words over ~14% of the frame, so the
  // script's spare copy (supporting points, a figure, a subtext) never reached the
  // screen. It is drawn here as a chip row + broadcast ticker in the lower band.
  // Skipped on the closer, the pull-quote and the type whose own design owns that
  // band — furniture under a CTA or a quote costs more than the density gains.
  fill: (type, ctx, scene) => {
    if (["endcard","lowerthird","diptych"].includes(type)) return null;
    const land = ctx.land;
    return {
      left: land ? 7 : 6, right: land ? 7 : 6, bottom: land ? 9 : 12,
      font: land ? 1.12 : 1.95, max: 3,
      plate: ctx.theme.ground, ink: ctx.theme.ink, accent: ctx.theme.accent,
      used: bullets(scene || {}, 3),
    };
  },
  theme, styleBlock, chrome, perScene, SCENES, TEMPLATE_SCENES, route, mediaSlots, mediaFallback,
  wantsLogo: (t) => t === "endcard",
  fallbackType: "slate",
  variants: 2,
  // Cinema never whips: every transition is a slow push with a focus pull, and
  // the shot keeps creeping for its whole length.
  camera: { enabled: false,
    kinds: ["zoom", "zoom", "zoom", "zoom", "zoom", "zoom", "zoom", "zoom"],
    blur: 15, push: 0.045, zoomIn: 1.09, zoomOut: 1.07,
  },

  // ---- SHARED MOTION SYSTEM (services/motion_presets.js) ----------------------
  // This family publishes WHERE its headline, card and camera live; the engine
  // drives them from the one preset library. Its own entrance tweens for those
  // elements were removed in the same change — two timelines on one property
  // fight, and the loser is whichever the browser applies second.
  motion: {
    heroType: "slate",
    text: (id) => `.${id}-ln`,
    card: (id) => `#${id}-card, .${id}-card`,
    camera: (id) => `#${id}-cami`,
    // The film's two hero moments carry the signature type treatments; the
    // middle stays on the house word stagger so the signatures stay signatures.
    tokens: (type, i, ctx, { hasCard } = {}) => ({
      text: type === "slate" ? "outlineFillReveal"
        : type === "endcard" ? "characterReveal" : "wordStaggerBlur",
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
