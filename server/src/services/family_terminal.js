// RETRO-TERMINAL family template — the authored scene grammar for the CRT /
// command-line / Y2K-chrome packs (terminal-amber, terminal-green, vapor-chrome).
//
// These packs used to render through scene_kit's SHARED archetypes, so a phosphor
// terminal drew the same feature-card row as a risograph poster. This file gives
// the whole family its own grammar — seven scenes that only make sense on a glass
// CRT: a machine boot, a typed command line, a directory window, an instrument
// readout with a bar gauge, an incoming transmission, a monitor bezel and a final
// EXECUTE prompt. Every pack keeps its OWN skin: colours, fonts and text effects
// come from scene_kit.deriveTheme(pack), so terminal-amber stays amber-on-tar,
// terminal-green stays phosphor-on-black and vapor-chrome stays magenta-on-indigo.
// `variant` (hashed from the pack name) flips staging per pack, so two packs in
// the family never compose identically.
//
// The render contract (seek-safety, tracks, hard kills, caption node, camera) is
// the engine's — see template_engine.js. This module is design only.

const { deriveTheme } = require("./scene_kit");
const E = require("./template_engine");
const { esc, r, rgba, mix, statsOf, breakLines, bullets, fit, mineStat } = E;

// ---- theme -------------------------------------------------------------------
// The pack's own resolved identity + the terminal family's structural extras.
function theme(manifest, brandSkin, { framePack } = {}) {
  const t = deriveTheme(framePack, {}, brandSkin);
  const accents = (t.accents && t.accents.length ? t.accents : ["#3DF07E", "#F0B23D"]).slice(0, 4);
  const phos = accents[0];
  const alt = accents[1] || accents[0];
  const displayFamily = (t.manifest && t.manifest.typography && t.manifest.typography.display) || "";
  // Columnar chrome (gutters, gauges, listings) must sit on a real monospace grid.
  // A pack whose display face IS mono keeps its own face there; a proportional
  // display face (vapor-chrome's Space Grotesk) keeps the headlines and hands the
  // terminal furniture to the system mono.
  const monoish = /mono|code|courier|consol|term|matrix/i.test(displayFamily);
  return {
    ...t,
    phos,
    alt,
    accent3: accents[2] || alt,
    shell: mix(t.ground, t.isDark ? "#FFFFFF" : "#000000", 0.09),
    screen: mix(t.ground, phos, t.isDark ? 0.06 : 0.03),
    edge: rgba(phos, 0.45),
    faint: rgba(phos, 0.24),
    display: t.displayStack || t.fontStack || "system-ui, sans-serif",
    mono: monoish
      ? `${t.displayStack || t.fontStack}, ui-monospace, 'Courier New', monospace`
      : `ui-monospace, 'Courier New', monospace`,
    bodyStack: t.fontStack || "system-ui, sans-serif",
    fontFace: t.fontFace || "",
    bloom: t.gradients !== false,
  };
}

// ---- published vocabulary (Template Director casts onto these) ----------------
const TEMPLATE_SCENES = [
  {
    type: "boot",
    bestFor: "opening title, the film's cold open",
    look: "The screen powers on with a CRT squeeze and a phosphor flash: two system lines type themselves at the top, a rule wipes across, then the headline lands character by character, each one flaring in the accent before cooling to ink, with a blinking block cursor parked at the end.",
    slots: { headline: "1-3 short lines, max 26 chars each", subtext: "one sentence, max 78 chars", kicker: "one word, max 22 chars" },
    media: [],
  },
  {
    type: "prompt",
    bestFor: "one claim, a feature or a statement of what the product does",
    look: "A live command line: a prompt in the accent colour, the headline typed after it a character at a time with a blinking block cursor, then the supporting copy printing underneath as output against a bright gutter bar.",
    slots: { headline: "one line, max 64 chars", subtext: "one sentence, max 120 chars", items: "0-2 output lines, max 56 chars each", kicker: "max 18 chars" },
    media: [],
  },
  {
    type: "dirlist",
    bestFor: "a list of steps, features or capabilities",
    look: "A windowed directory listing: a titled panel unrolls, its path shown in the title bar with a live item count, and each entry slides in on its own numbered row while a highlight bar sweeps across it.",
    slots: { headline: "max 2 short lines", items: "2-5 entries, max 40 chars each", kicker: "max 18 chars" },
    media: [],
  },
  {
    type: "readout",
    bestFor: "one number that matters, a metric or proof point",
    look: "An instrument readout: a colossal counter racks up in the phosphor colour while a bracketed bar gauge fills cell by cell beneath it, the metric name stamped under the gauge and a second reading printed below.",
    slots: { stats: "1-2 of {v: number, suf: '%'|'X'|'K'|'M'|'', l: label max 24 chars}", headline: "max 1 short line", kicker: "max 18 chars" },
    media: [],
  },
  {
    type: "transmission",
    bestFor: "testimonial, a customer quote, a message from a person",
    look: "An incoming-message panel with a blinking record dot: the sender and role type into header fields, then the message body flares in word by word inside a double-ruled frame, signed off along the footer.",
    slots: { quote: "max 140 chars, verbatim", author: "person's name", role: "role and/or company" },
    media: [],
  },
  {
    type: "crtframe",
    bestFor: "a product screen, screenshot or photo shown on the machine",
    look: "The image mounted inside a heavy CRT monitor bezel: the screen powers on with a scanline squeeze, the picture drifts slowly under a moving scan band, the power LED blinks and the brand is etched into the chin, with the claim set in a column alongside.",
    slots: { headline: "max 2 short lines", body: "one sentence, max 130 chars", kicker: "max 18 chars" },
    media: ["desktop"],
  },
  {
    type: "execute",
    bestFor: "closing call to action, the last frame",
    look: "The final command: the closing line lands character by character, the call to action sits in a bracketed field whose border pulses next to a blinking cursor, and the address prints beneath on a rule that wipes across the screen.",
    slots: { headline: "max 2 short lines", cta: "button label, max 20 chars", kicker: "max 18 chars" },
    media: [],
  },
];

const mediaSlots = { crtframe: ["desktop"], transmission: ["photo"] };
// True when the PREVIOUS scene already carried imagery. Routers use it to keep
// media beats alternating instead of stacking, now that any spare asset (not
// just a pinned screenshot) is enough to earn one.
const mediaBeatJustPlayed = (ctx) => ((mediaSlots[ctx && ctx.prevType] || []).length > 0);

// ---- deterministic router (used when the director is off / uncast) -----------
function route(scene, i, total, ctx) {
  const k = String(scene.kind || "").toLowerCase();
  const p = String(scene.purpose || "").toLowerCase();
  if (i === 0 || k === "hook" || k === "title") return "boot";
  if (i === total - 1 || k === "cta" || p === "cta") return "execute";
  if (k === "quote" || scene.quote || /testimonial/.test(p)) return "transmission";
  if (k === "stat" || k === "chart" || statsOf(scene, 1).length) return "readout";
  // MEDIA BEAT — ahead of the text branches, and satisfied by ANY spare asset.
  // Two defects kept this family at literally zero imagery: `dirlist` claimed
  // every middle scene first (real storyboards nearly always carry 2+ bullets),
  // and `crtframe` only ever fired for a pinned shot or a real screenshot — so a
  // film whose pool was ordinary stock photos showed none of them. The gate is
  // now PER-TYPE, not global: a crtframe never repeats back-to-back, but it may
  // follow a transmission's testimonial photo, so consecutive media beats of
  // DIFFERENT types read as rhythm rather than a slideshow.
  if ((ctx.pinned || ctx.hasShot || ctx.freeCount >= 1) && ctx.prevType !== "crtframe") return "crtframe";
  if (bullets(scene, 5).length >= 2) return "dirlist";
  return ctx.prevType === "prompt" ? "dirlist" : "prompt";
}
const mediaFallback = (scene) => {
  // Keep a quote scene on its transmission card (monogram fallback) when no photo
  // is free, instead of rerouting the testimonial away and dropping the quote.
  if (scene && (scene.quote || String(scene.kind || "").toLowerCase() === "quote" || /testimonial|review/.test(String(scene.purpose || "").toLowerCase()))) return null;
  return bullets(scene, 3).length >= 2 ? "dirlist" : "prompt";
};

// ---- terminal furniture -------------------------------------------------------
// Monospace advance width in em — every size below is solved against it so a long
// line can never run past the plate. A proportional display face is narrower than
// this, so the estimate stays conservative for vapor-chrome too.
const CH = 0.62;

const longestOf = (lines) => Math.max(...lines.map((l) => String(l).length), 1);
// Largest size that keeps the longest of `lines` inside `width` (cqw).
const monoSize = (lines, width, cap) => r(Math.min(cap, width / (CH * longestOf(lines))));
// Largest size that wraps `text` into at most `maxLines` lines inside `width`.
const wrapSize = (text, width, maxLines, cap) =>
  r(Math.min(cap, (width * maxLines) / (CH * Math.max(String(text || "").length, 1))));

const slugOf = (s, max) =>
  String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max || 22) || "index";

const hostOf = (url) => String(url || "").replace(/^https?:\/\//, "").split("/")[0];

// Block cursor — a CSS box, so it never depends on a glyph the pack's face lacks.
const cursor = (id, w, h, color) =>
  `<span id="${id}" style="opacity:0;display:inline-block;width:${r(w)}cqw;height:${r(h)}cqw;background:${color};margin-left:${r(w * 0.45)}cqw;vertical-align:-0.12em;"></span>`;

// immediateRender:false is load-bearing — a fromTo whose FROM state is visible
// (opacity:1) would otherwise be applied at build time, so the cursor/LED would
// sit lit on screen from the film's first frame instead of from its own cue.
const blink = (sel, at, span, cycle) =>
  `tl.fromTo("${sel}",{opacity:1},{opacity:0,duration:${r(cycle)},ease:"steps(1)",yoyo:true,repeat:reps(${r(span)},${r(cycle)}),immediateRender:false},${r(at)});`;

// Characters as individual spans — the typewriter/phosphor-flare unit.
const chars = (line, cls) =>
  Array.from(String(line)).map((c) => `<span class="${cls}" style="opacity:0;white-space:pre;">${esc(c)}</span>`).join("");

const glow = (th, color, amt) => (th.bloom ? `text-shadow:0 0 ${r(amt)}cqw ${rgba(color, 0.45)};` : "");

// ---- scenes -------------------------------------------------------------------

function boot(scene, ctx) {
  const { id, T, L, theme: th, land, brand, url } = ctx;
  const lines = (Array.isArray(scene.lines) && scene.lines.length ? scene.lines : breakLines(scene.headline, scene.subtext))
    .map((l) => String(l)).filter(Boolean).slice(0, 3);
  const kicker = fit(String(scene.kicker || scene.purpose || ""), 22);
  const sub = fit(String(scene.subtext || scene.body || ""), land ? 78 : 52);
  const chatter = [`$ boot ${slugOf(brand, 18)}`, `$ link ${hostOf(url)}`];
  if (kicker) chatter.push(`$ mode ${slugOf(kicker, 20)}`);
  // Portrait is 177cqw tall against landscape's 56 — the same cqw size fills a
  // third of the frame there, so 9:16 gets its own (much larger) scale, not a nudge.
  const cs = land ? 1.4 : 3.1;
  const hs = monoSize(lines, land ? 80 : 86, land ? 7.4 : 12);
  const ss = land ? 1.5 : 3.2;
  const nChars = lines.reduce((a, l) => a + l.length, 0) || 1;
  const stg = r(Math.min(0.05, 1.15 / nChars));

  const chatterHtml = chatter.map((c, k) =>
    `<div id="${id}-c${k}" style="opacity:0;font-family:${th.mono};font-size:${r(cs)}cqw;line-height:1.7;letter-spacing:0.04em;color:${rgba(th.phos, 0.85)};${glow(th, th.phos, 0.5)}"></div>`).join("");

  const headHtml = lines.map((ln, k) =>
    `<div style="font-family:${th.display};font-weight:700;font-size:${hs}cqw;line-height:1.14;letter-spacing:-0.01em;color:${th.ink};white-space:nowrap;">${chars(ln, `${id}-ch`)}${k === lines.length - 1 ? cursor(`${id}-cur`, hs * 0.5, hs * 0.82, th.phos) : ""}</div>`).join("");

  const html = `
    <div id="${id}-scr" style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:${land ? "7cqw 7cqw" : "14cqw 7cqw"};">
      <div style="margin-bottom:${land ? 2 : 5}cqw;">${chatterHtml}</div>
      <div id="${id}-rule" style="height:${land ? 0.26 : 0.5}cqw;background:${th.edge};transform-origin:left center;margin-bottom:${land ? 2.4 : 6}cqw;"></div>
      <div>${headHtml}</div>
      ${sub ? `<div id="${id}-sub" style="opacity:0;margin-top:${land ? 2.2 : 6}cqw;font-family:${th.mono};font-size:${r(ss)}cqw;line-height:1.6;letter-spacing:0.03em;color:${rgba(th.ink, 0.7)};max-width:${land ? 68 : 86}cqw;">${esc(sub)}</div>` : ""}
    </div>
    <div id="${id}-flash" style="position:absolute;inset:0;background:${th.phos};opacity:0;mix-blend-mode:screen;"></div>`;

  const s = [
    `tl.fromTo("#${id}-scr",{scaleY:0.04,opacity:0.3},{scaleY:1,opacity:1,duration:0.36,ease:"expo.out",transformOrigin:"center center"},${T});`,
    `tl.fromTo("#${id}-flash",{opacity:0.5},{opacity:0,duration:0.5,ease:"power2.out"},${T});`,
  ];
  chatter.forEach((c, k) => {
    const at = r(T + 0.42 + k * 0.3);
    s.push(`tl.fromTo("#${id}-c${k}",{opacity:0},{opacity:1,duration:0.01,ease:"none"},${at});`);
    s.push(`type("#${id}-c${k}",${JSON.stringify(c)},${at},0.26);`);
  });
  s.push(`tl.fromTo("#${id}-rule",{scaleX:0},{scaleX:1,duration:0.42,ease:"expo.out"},${r(T + 0.42 + chatter.length * 0.3)});`);
  if (nChars > 1) {
    s.push(`tl.fromTo(".${id}-ch",{opacity:0,x:${land ? -7 : -10},skewX:16,color:"${th.phos}"},{opacity:1,x:0,skewX:0,color:"${th.ink}",duration:0.34,ease:"power2.out",stagger:${stg}},${r(T + 0.7 + chatter.length * 0.28)});`);
  }
  const curAt = r(Math.min(T + L - 0.5, T + 1.2 + chatter.length * 0.28 + nChars * stg));
  s.push(`tl.fromTo("#${id}-cur",{opacity:0},{opacity:1,duration:0.01,ease:"none"},${curAt});`);
  s.push(blink(`#${id}-cur`, curAt, Math.max(0.9, T + L - curAt), 0.42));
  if (sub) s.push(`tl.fromTo("#${id}-sub",{opacity:0,y:${land ? 16 : 26}},{opacity:1,y:0,duration:0.42,ease:"power2.out"},${r(Math.min(T + L - 0.4, curAt + 0.1))});`);
  return { html, s };
}

function prompt(scene, ctx) {
  const { id, T, L, theme: th, land, brand, url, variant, i } = ctx;
  const cmd = fit(String(scene.headline || scene.subtext || ""), 64);
  const kicker = fit(String(scene.kicker || scene.purpose || ""), 18).toUpperCase();
  const outs = (Array.isArray(scene.items) && scene.items.length ? scene.items : [])
    .map((x) => fit(String(x), 56)).filter(Boolean).slice(0, 2);
  const body = fit(String(scene.subtext || scene.body || ""), 120);
  const outLines = outs.length ? outs : (body && body !== cmd ? [body] : []);
  const hot = (i + variant) % 2 === 0 ? th.phos : th.alt;
  const ps1 = `${slugOf(brand, 12)}@${hostOf(url)}:~$`;
  const cs = land ? 1.45 : 3;
  const cmdSize = wrapSize(cmd, land ? 74 : 84, 2, land ? 5 : 8.4);
  const outSize = land ? 1.55 : 3.2;

  const html = `
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:${land ? "8cqw 8cqw" : "14cqw 7cqw"};">
      ${kicker ? `<div id="${id}-tag" style="opacity:0;align-self:flex-start;font-family:${th.mono};font-size:${r(cs)}cqw;letter-spacing:0.24em;color:${hot};border:${land ? 0.16 : 0.3}cqw solid ${rgba(hot, 0.5)};padding:${land ? "0.4cqw 1cqw" : "0.9cqw 1.8cqw"};margin-bottom:${land ? 2.4 : 5.5}cqw;">${esc(kicker)}</div>` : ""}
      <div id="${id}-ps1" style="opacity:0;font-family:${th.mono};font-size:${r(cs)}cqw;letter-spacing:0.06em;color:${rgba(hot, 0.9)};${glow(th, hot, 0.55)}margin-bottom:${land ? 1.1 : 2.6}cqw;">${esc(ps1)}</div>
      <div style="font-family:${th.display};font-weight:700;font-size:${cmdSize}cqw;line-height:1.2;letter-spacing:-0.01em;color:${th.ink};max-width:${land ? 76 : 84}cqw;">
        <span style="color:${hot};${glow(th, hot, 0.6)}">&gt;&nbsp;</span><span id="${id}-cmd"></span>${cursor(`${id}-cur`, cmdSize * 0.5, cmdSize * 0.8, hot)}
      </div>
      ${outLines.length ? `<div id="${id}-out" style="opacity:0;margin-top:${land ? 3 : 7}cqw;border-left:${land ? 0.36 : 0.8}cqw solid ${rgba(hot, 0.7)};padding-left:${land ? 1.6 : 3.4}cqw;max-width:${land ? 70 : 84}cqw;">
        ${outLines.map((o) => `<div class="${id}-o" style="opacity:0;font-family:${th.mono};font-size:${r(outSize)}cqw;line-height:1.62;letter-spacing:0.02em;color:${rgba(th.ink, 0.78)};">${esc(o)}</div>`).join("")}
      </div>` : ""}
    </div>`;

  const typeAt = r(T + 0.4);
  const typeDur = r(Math.min(1.5, Math.max(0.5, L * 0.34)));
  const s = [
    kicker ? `tl.fromTo("#${id}-tag",{opacity:0,x:-24},{opacity:1,x:0,duration:0.36,ease:"power3.out"},${r(T + 0.15)});` : "",
    `tl.fromTo("#${id}-ps1",{opacity:0,x:-18},{opacity:1,x:0,duration:0.3,ease:"power2.out"},${r(T + 0.28)});`,
    `tl.fromTo("#${id}-cur",{opacity:0},{opacity:1,duration:0.01,ease:"none"},${typeAt});`,
    `type("#${id}-cmd",${JSON.stringify(cmd)},${typeAt},${typeDur});`,
    blink(`#${id}-cur`, r(typeAt + typeDur), Math.max(0.9, L - typeDur - 0.5), 0.42),
  ];
  if (outLines.length) {
    const outAt = r(Math.min(T + L - 0.5, typeAt + typeDur + 0.18));
    s.push(`tl.fromTo("#${id}-out",{opacity:0},{opacity:1,duration:0.01,ease:"none"},${outAt});`);
    s.push(`tl.fromTo(".${id}-o",{opacity:0,x:-20},{opacity:1,x:0,duration:0.34,ease:"power2.out",stagger:0.14},${outAt});`);
  }
  return { html, s };
}

function dirlist(scene, ctx) {
  const { id, T, theme: th, land, variant, brand } = ctx;
  const items = (Array.isArray(scene.items) && scene.items.length ? scene.items : bullets(scene, 5))
    .map((b) => fit(String(b), 40)).filter(Boolean).slice(0, land ? 4 : 5);
  const lines = breakLines(scene.headline, "").filter(Boolean).slice(0, 2);
  const kicker = fit(String(scene.kicker || scene.purpose || ""), 18).toUpperCase();
  const path = `~/${slugOf(scene.kicker || scene.purpose || scene.headline || brand, 20)}`;
  const headSize = monoSize(lines, land ? 76 : 84, land ? 3.6 : 7.4);
  const rowSize = monoSize(items.length ? items : ["x"], land ? 58 : 66, land ? 2.35 : 4.4);
  const pad = land ? 1.5 : 3.4;
  const hot = variant % 2 === 0 ? th.phos : th.alt;

  const rows = items.map((t, k) => `
        <div class="${id}-row" style="opacity:0;position:relative;display:flex;align-items:center;gap:${land ? 1.4 : 2.4}cqw;padding:${r(pad * 0.62)}cqw ${r(pad)}cqw;">
          <span class="${id}-hl" style="position:absolute;left:0;top:0;bottom:0;width:100%;background:${rgba(hot, 0.5)};transform-origin:left center;"></span>
          <span style="position:relative;font-family:${th.mono};font-size:${r(rowSize * 0.72)}cqw;letter-spacing:0.1em;color:${rgba(hot, 0.9)};">${String(k + 1).padStart(2, "0")}</span>
          <span style="position:relative;display:inline-block;width:${r(rowSize * 0.42)}cqw;height:${r(rowSize * 0.42)}cqw;background:${hot};flex:0 0 auto;"></span>
          <span style="position:relative;font-family:${th.mono};font-size:${r(rowSize)}cqw;line-height:1.3;letter-spacing:0.01em;color:${th.ink};">${esc(t)}</span>
        </div>`).join(`<div class="${id}-sep" style="height:${land ? 0.12 : 0.2}cqw;background:${rgba(th.ink, 0.12)};"></div>`);

  const html = `
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:${land ? "7cqw 8cqw" : "13cqw 7cqw"};">
      ${kicker ? `<div id="${id}-kick" style="opacity:0;font-family:${th.mono};font-size:${land ? 1.25 : 2.8}cqw;letter-spacing:0.3em;color:${hot};margin-bottom:${land ? 1 : 2.4}cqw;">${esc(kicker)}</div>` : ""}
      <div style="font-family:${th.display};font-weight:700;font-size:${headSize}cqw;line-height:1.16;color:${th.ink};margin-bottom:${land ? 2.4 : 5.5}cqw;">
        ${lines.map((l) => `<div class="${id}-head" style="opacity:0;">${esc(l)}</div>`).join("")}
      </div>
      <div id="${id}-win" style="border:${land ? 0.2 : 0.4}cqw solid ${th.edge};background:${rgba(th.screen, 0.9)};transform-origin:top center;">
        <div id="${id}-bar" style="display:flex;align-items:center;justify-content:space-between;gap:2cqw;background:${hot};padding:${r(pad * 0.5)}cqw ${r(pad)}cqw;">
          <span style="font-family:${th.mono};font-size:${land ? 1.3 : 2.7}cqw;letter-spacing:0.1em;color:${E.inkOn(hot, "#0B0A06", th.ground)};">${esc(path)}</span>
          <span id="${id}-cnt" style="font-family:${th.mono};font-size:${land ? 1.3 : 2.7}cqw;letter-spacing:0.1em;color:${E.inkOn(hot, "#0B0A06", th.ground)};"></span>
        </div>
        <div style="padding:${r(pad * 0.5)}cqw 0;">${rows}</div>
      </div>
    </div>`;

  const s = [
    kicker ? `tl.fromTo("#${id}-kick",{opacity:0,x:-18},{opacity:1,x:0,duration:0.34},${r(T + 0.15)});` : "",
    `tl.fromTo(".${id}-head",{opacity:0,y:${land ? 22 : 34}},{opacity:1,y:0,duration:0.4,ease:"expo.out",stagger:0.09},${r(T + 0.22)});`,
    `tl.fromTo("#${id}-win",{scaleY:0.02,opacity:0.2},{scaleY:1,opacity:1,duration:0.4,ease:"expo.out"},${r(T + 0.34)});`,
    `tl.fromTo("#${id}-bar",{scaleX:0},{scaleX:1,transformOrigin:"left center",duration:0.34,ease:"expo.out"},${r(T + 0.4)});`,
    `type("#${id}-cnt",${JSON.stringify(`${items.length} items`)},${r(T + 0.7)},0.3);`,
  ];
  if (items.length) {
    s.push(`tl.fromTo(".${id}-row",{opacity:0,x:${land ? -34 : -46}},{opacity:1,x:0,duration:0.38,ease:"power3.out",stagger:0.14},${r(T + 0.68)});`);
    s.push(`tl.fromTo(".${id}-hl",{scaleX:0,opacity:0.55},{scaleX:1,opacity:0,duration:0.5,ease:"power2.out",stagger:0.14},${r(T + 0.72)});`);
    s.push(`tl.fromTo(".${id}-sep",{scaleX:0},{scaleX:1,transformOrigin:"left center",duration:0.4,ease:"power2.out",stagger:0.14},${r(T + 0.8)});`);
  }
  return { html, s };
}

function readout(scene, ctx) {
  const { id, T, L, theme: th, land } = ctx;
  const stats = statsOf(scene, 2);
  const main = stats[0] || { pre: "", v: 100, suf: "%", isFloat: false, l: "" };
  const second = stats[1] || null;
  const label = fit(String(main.l || scene.headline || ""), 24).toUpperCase();
  const head = fit(String(scene.headline || ""), 42);
  const kicker = fit(String(scene.kicker || scene.purpose || ""), 18).toUpperCase();
  const n = land ? 24 : 14;
  const numSize = land ? 15 : 29;
  const gaugeW = land ? 60 : 80;
  const cellH = land ? 2.4 : 6;
  const fillDur = r(Math.min(1.6, Math.max(0.7, L * 0.45)));

  const cellsHtml = Array.from({ length: n }, () =>
    `<span class="${id}-cell" style="opacity:0;flex:1 1 auto;height:${r(cellH)}cqw;background:${th.phos};${th.bloom ? `box-shadow:0 0 ${r(cellH * 0.5)}cqw ${rgba(th.phos, 0.4)};` : ""}"></span>`).join("");
  const bracket = (side) =>
    `<span style="display:inline-block;width:${land ? 0.9 : 1.5}cqw;height:${r(cellH * 1.5)}cqw;border:${land ? 0.22 : 0.36}cqw solid ${th.edge};border-${side}:0;flex:0 0 auto;"></span>`;

  const html = `
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:${land ? "6cqw" : "12cqw 6cqw"};">
      ${kicker ? `<div id="${id}-kick" style="opacity:0;font-family:${th.mono};font-size:${land ? 1.3 : 2.9}cqw;letter-spacing:0.34em;color:${rgba(th.alt, 0.9)};margin-bottom:${land ? 1.4 : 3.4}cqw;">${esc(kicker)}</div>` : ""}
      <div id="${id}-num" style="opacity:0;font-family:${th.display};font-weight:700;font-size:${numSize}cqw;line-height:1;letter-spacing:-0.03em;color:${th.phos};${glow(th, th.phos, numSize * 0.16)}">${esc(main.pre)}0${esc(main.suf)}</div>
      <div style="display:flex;align-items:center;gap:${land ? 0.6 : 1}cqw;width:${gaugeW}cqw;margin-top:${land ? 2 : 4.6}cqw;">
        ${bracket("right")}
        <span style="flex:1 1 auto;display:flex;gap:${land ? 0.34 : 0.55}cqw;">${cellsHtml}</span>
        ${bracket("left")}
      </div>
      ${label ? `<div id="${id}-lab" style="opacity:0;margin-top:${land ? 1.8 : 4.2}cqw;font-family:${th.mono};font-size:${land ? 1.55 : 3.3}cqw;letter-spacing:0.3em;color:${rgba(th.ink, 0.85)};text-align:center;">${esc(label)}</div>` : ""}
      ${head && head.toUpperCase() !== label ? `<div id="${id}-head" style="opacity:0;margin-top:${land ? 1.4 : 3.4}cqw;font-family:${th.display};font-weight:700;font-size:${monoSize([head], land ? 66 : 82, land ? 3 : 6)}cqw;line-height:1.2;color:${th.ink};text-align:center;max-width:${land ? 74 : 86}cqw;">${esc(head)}</div>` : ""}
      ${second ? `<div id="${id}-2nd" style="opacity:0;margin-top:${land ? 1.6 : 4}cqw;font-family:${th.mono};font-size:${land ? 1.4 : 3}cqw;letter-spacing:0.14em;color:${rgba(th.ink, 0.7)};"><span id="${id}-n2" style="color:${th.alt};">${esc(second.pre)}0${esc(second.suf)}</span> ${esc(fit(second.l, 22))}</div>` : ""}
    </div>`;

  const s = [
    kicker ? `tl.fromTo("#${id}-kick",{opacity:0,y:-16},{opacity:1,y:0,duration:0.34},${r(T + 0.15)});` : "",
    `tl.fromTo("#${id}-num",{opacity:0,scaleY:0.2},{opacity:1,scaleY:1,duration:0.42,ease:"expo.out"},${r(T + 0.22)});`,
    `countTxt("#${id}-num",${main.v},${r(T + 0.3)},${fillDur},${JSON.stringify(main.pre)},${JSON.stringify(main.suf)},${main.isFloat ? 10 : 1});`,
    `tl.fromTo(".${id}-cell",{opacity:0.1},{opacity:1,duration:0.18,ease:"none",stagger:${r(fillDur / n)}},${r(T + 0.32)});`,
    label ? `tl.fromTo("#${id}-lab",{opacity:0,y:18},{opacity:1,y:0,duration:0.38,ease:"power2.out"},${r(T + 0.75)});` : "",
    head && head.toUpperCase() !== label ? `tl.fromTo("#${id}-head",{opacity:0,y:18},{opacity:1,y:0,duration:0.38,ease:"power2.out"},${r(T + 0.95)});` : "",
    second ? `tl.fromTo("#${id}-2nd",{opacity:0,y:14},{opacity:1,y:0,duration:0.36},${r(T + 1.15)});` : "",
    second ? `countTxt("#${id}-n2",${second.v},${r(T + 1.15)},${r(Math.min(1.1, L * 0.32))},${JSON.stringify(second.pre)},${JSON.stringify(second.suf)},${second.isFloat ? 10 : 1});` : "",
  ];
  return { html, s };
}

function transmission(scene, ctx, asset) {
  const { id, T, L, theme: th, land, brand } = ctx;
  const quote = fit(String(scene.quote || scene.subtext || scene.headline || ""), 140);
  const words = quote.split(/\s+/).filter(Boolean);
  const author = fit(String(scene.author || scene.emphasis || ""), 28);
  const role = fit(String(scene.role || scene.purpose || brand), 32);
  const qSize = wrapSize(quote, land ? 66 : 76, land ? 3 : 4, land ? 4.6 : 7);
  const fSize = land ? 1.4 : 2.9;
  const pad = land ? 2.8 : 4.6;
  const avSize = land ? 3.4 : 6.6;
  // Sender portrait rides the message footer when the plan supplies a photo; the
  // record-dot header stays the fallback when it doesn't (no monogram in this family).
  const avatar = asset && asset.path
    ? `<span style="display:inline-block;width:${r(avSize)}cqw;height:${r(avSize)}cqw;border-radius:50%;overflow:hidden;flex:0 0 auto;margin-right:${land ? 1 : 1.8}cqw;border:${land ? 0.14 : 0.24}cqw solid ${rgba(th.phos, 0.55)};"><img src="${esc(asset.path)}" alt="${esc(asset.alt || author || "")}" style="width:100%;height:100%;object-fit:cover;display:block;"></span>`
    : "";

  const html = `
    <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:${land ? "6cqw" : "12cqw 5cqw"};">
      <div id="${id}-panel" style="width:${land ? 78 : 88}cqw;border:${land ? 0.22 : 0.36}cqw solid ${th.edge};background:${rgba(th.screen, 0.92)};box-shadow:inset 0 0 0 ${land ? 0.1 : 0.16}cqw ${rgba(th.phos, 0.18)};transform-origin:center center;">
        <div id="${id}-hdr" style="display:flex;align-items:center;gap:${land ? 1.2 : 2}cqw;padding:${r(pad * 0.5)}cqw ${r(pad)}cqw;border-bottom:${land ? 0.14 : 0.24}cqw solid ${rgba(th.phos, 0.35)};background:${rgba(th.phos, 0.1)};">
          <span id="${id}-dot" style="opacity:0;display:inline-block;width:${land ? 0.9 : 1.5}cqw;height:${land ? 0.9 : 1.5}cqw;background:${th.alt};border-radius:50%;${th.bloom ? `box-shadow:0 0 ${land ? 1 : 1.6}cqw ${rgba(th.alt, 0.7)};` : ""}"></span>
          <span id="${id}-hd" style="font-family:${th.mono};font-size:${r(fSize)}cqw;letter-spacing:0.26em;color:${th.phos};"></span>
        </div>
        <div style="padding:${r(pad)}cqw ${r(pad)}cqw ${r(pad * 0.8)}cqw;">
          <div style="display:flex;flex-wrap:wrap;align-items:baseline;">
            <span class="${id}-w" style="opacity:0;font-family:${th.display};font-weight:700;font-size:${r(qSize * 1.15)}cqw;line-height:1.34;color:${th.phos};margin-right:${land ? 0.7 : 1.1}cqw;">&quot;</span>
            ${words.map((w) => `<span class="${id}-w" style="opacity:0;font-family:${th.display};font-weight:600;font-size:${qSize}cqw;line-height:1.34;color:${th.ink};margin-right:${land ? 0.7 : 1.1}cqw;">${esc(w)}</span>`).join("")}
          </div>
        </div>
        <div id="${id}-foot" style="opacity:0;display:flex;align-items:center;justify-content:space-between;gap:2cqw;padding:${r(pad * 0.55)}cqw ${r(pad)}cqw;border-top:${land ? 0.14 : 0.24}cqw solid ${rgba(th.phos, 0.35)};">
          <span style="display:flex;align-items:center;font-family:${th.mono};font-size:${r(fSize)}cqw;letter-spacing:0.1em;color:${rgba(th.ink, 0.9)};">${avatar}${author ? `${esc(author)}` : esc(role)}</span>
          <span style="font-family:${th.mono};font-size:${r(fSize * 0.92)}cqw;letter-spacing:0.16em;color:${rgba(th.phos, 0.85)};">${author ? esc(role.toUpperCase()) : ""}</span>
        </div>
      </div>
    </div>`;

  const s = [
    `tl.fromTo("#${id}-panel",{opacity:0,scaleY:0.06},{opacity:1,scaleY:1,duration:0.4,ease:"expo.out"},${T});`,
    `tl.fromTo("#${id}-dot",{opacity:0},{opacity:1,duration:0.01,ease:"none"},${r(T + 0.26)});`,
    blink(`#${id}-dot`, r(T + 0.26), Math.max(0.9, L - 0.36), 0.55),
    `type("#${id}-hd",${JSON.stringify(`TRANSMISSION / ${slugOf(brand, 14).toUpperCase()}`)},${r(T + 0.28)},0.32);`,
    words.length ? `tl.fromTo(".${id}-w",{opacity:0,y:${land ? 12 : 18},color:"${th.phos}"},{opacity:1,y:0,color:"${th.ink}",duration:0.32,ease:"power2.out",stagger:${r(Math.min(0.06, 1.5 / Math.max(words.length, 1)))}},${r(T + 0.5)});` : "",
    `tl.fromTo("#${id}-foot",{opacity:0,y:12},{opacity:1,y:0,duration:0.36,ease:"power2.out"},${r(Math.min(T + L - 0.4, T + 1.25))});`,
  ];
  return { html, s };
}

function crtframe(scene, ctx, asset) {
  const { id, T, L, theme: th, land, variant, brand } = ctx;
  const lines = breakLines(scene.headline, "").filter(Boolean).slice(0, 2);
  const body = fit(String(scene.body || scene.subtext || ""), 130);
  const kicker = fit(String(scene.kicker || scene.purpose || ""), 18).toUpperCase();
  const right = variant % 2 === 0;
  const colW = land ? 32 : 86;
  const headSize = monoSize(lines.length ? lines : ["x"], colW, land ? 3.3 : 7.2);
  const monW = land ? 52 : 86;
  const monH = land ? 40 : 64;
  const bez = land ? 1.5 : 2.8;

  const screenBody = asset && asset.path
    ? `<img id="${id}-img" src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="width:100%;height:100%;object-fit:cover;object-position:top center;display:block;">`
    : `<div style="position:absolute;inset:0;display:flex;">
          ${[th.phos, mix(th.phos, th.ink, 0.45), th.alt, mix(th.alt, th.ground, 0.35), th.accent3, mix(th.ink, th.ground, 0.45), th.shell]
            .map((c) => `<span style="flex:1 1 auto;background:${c};"></span>`).join("")}
        </div>
        <div style="position:absolute;left:0;right:0;top:38%;height:24%;background:${rgba(th.ground, 0.86)};display:grid;place-items:center;">
          <span style="font-family:${th.display};font-weight:700;font-size:${land ? 3.4 : 5.4}cqw;letter-spacing:0.16em;color:${th.ink};">${esc(String(brand).toUpperCase().slice(0, 14))}</span>
        </div>`;

  const monitor = `
      <div id="${id}-mon" style="opacity:0;position:relative;flex:0 0 auto;width:${monW}cqw;height:${monH}cqw;background:${th.shell};border-radius:${land ? 1.6 : 2.6}cqw;padding:${r(bez)}cqw ${r(bez)}cqw ${r(bez * 2.4)}cqw;box-shadow:inset 0 0 0 ${land ? 0.18 : 0.3}cqw ${rgba(th.phos, 0.28)};">
        <div style="position:relative;width:100%;height:100%;overflow:hidden;border-radius:${land ? 0.8 : 1.3}cqw;background:${th.screen};">
          <div id="${id}-scr" style="position:absolute;inset:0;overflow:hidden;transform-origin:center center;">${screenBody}</div>
          <div style="position:absolute;inset:0;pointer-events:none;background-image:repeating-linear-gradient(to bottom, ${rgba("#000000", 0.3)} 0 0.14cqw, transparent 0.14cqw 0.4cqw);"></div>
          <div id="${id}-sweep" style="position:absolute;left:0;right:0;height:24%;background:linear-gradient(to bottom, transparent, ${rgba(th.phos, 0.16)}, transparent);"></div>
          <div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 0 ${land ? 5 : 8}cqw ${rgba(th.ground, 0.8)};"></div>
        </div>
        <div style="position:absolute;left:${r(bez * 1.4)}cqw;right:${r(bez * 1.4)}cqw;bottom:${r(bez * 0.5)}cqw;height:${r(bez * 1.6)}cqw;display:flex;align-items:center;justify-content:space-between;">
          <span style="font-family:${th.mono};font-size:${land ? 1 : 1.7}cqw;letter-spacing:0.28em;color:${rgba(th.ink, 0.5)};">${esc(String(brand).toUpperCase().slice(0, 14))}</span>
          <span id="${id}-led" style="opacity:0;display:inline-block;width:${land ? 0.7 : 1.1}cqw;height:${land ? 0.7 : 1.1}cqw;border-radius:50%;background:${th.phos};${th.bloom ? `box-shadow:0 0 ${land ? 0.9 : 1.5}cqw ${rgba(th.phos, 0.8)};` : ""}"></span>
        </div>
      </div>`;

  const column = `
      <div style="flex:1 1 auto;display:flex;flex-direction:column;justify-content:center;max-width:${colW}cqw;">
        ${kicker ? `<div id="${id}-kick" style="opacity:0;font-family:${th.mono};font-size:${land ? 1.2 : 2.8}cqw;letter-spacing:0.3em;color:${th.phos};margin-bottom:${land ? 1 : 2.4}cqw;">${esc(kicker)}</div>` : ""}
        <div style="font-family:${th.display};font-weight:700;font-size:${headSize}cqw;line-height:1.18;color:${th.ink};">
          ${lines.map((l) => `<div class="${id}-head" style="opacity:0;">${esc(l)}</div>`).join("")}
        </div>
        ${body ? `<div id="${id}-body" style="opacity:0;margin-top:${land ? 1.6 : 3.4}cqw;font-family:${th.mono};font-size:${land ? 1.35 : 3}cqw;line-height:1.6;color:${rgba(th.ink, 0.72)};">${esc(body)}</div>` : ""}
      </div>`;

  const html = `
    <div style="position:absolute;inset:0;display:flex;flex-direction:${land ? (right ? "row" : "row-reverse") : "column"};align-items:center;gap:${land ? 3 : 5}cqw;padding:${land ? "6cqw 6cqw" : "12cqw 7cqw"};">
      ${column}
      ${monitor}
    </div>`;

  const s = [
    kicker ? `tl.fromTo("#${id}-kick",{opacity:0,x:-18},{opacity:1,x:0,duration:0.34},${r(T + 0.2)});` : "",
    `tl.fromTo(".${id}-head",{opacity:0,y:${land ? 22 : 30}},{opacity:1,y:0,duration:0.4,ease:"expo.out",stagger:0.09},${r(T + 0.28)});`,
    body ? `tl.fromTo("#${id}-body",{opacity:0,y:16},{opacity:1,y:0,duration:0.38,ease:"power2.out"},${r(T + 0.6)});` : "",
    `tl.fromTo("#${id}-mon",{opacity:0,y:${land ? 26 : 34}},{opacity:1,y:0,duration:0.44,ease:"power3.out"},${r(T + 0.25)});`,
    `tl.fromTo("#${id}-scr",{scaleY:0.05,opacity:0.25},{scaleY:1,opacity:1,duration:0.46,ease:"expo.out"},${r(T + 0.45)});`,
    `tl.fromTo("#${id}-led",{opacity:0},{opacity:1,duration:0.01,ease:"none"},${r(T + 0.5)});`,
    blink(`#${id}-led`, r(T + 0.5), Math.max(0.9, L - 0.6), 0.62),
    `tl.fromTo("#${id}-sweep",{yPercent:-120},{yPercent:460,duration:${r(Math.max(1.4, L * 0.6))},ease:"none",repeat:reps(${r(L)},${r(Math.max(1.4, L * 0.6))})},${r(T + 0.5)});`,
    asset && asset.path
      ? `tl.fromTo("#${id}-img",{scale:1.1},{scale:1,duration:${r(Math.max(1, L - 0.7))},ease:"sine.out"},${r(T + 0.6)});`
      : "",
  ];
  return { html, s };
}

function execute(scene, ctx, asset) {
  const { id, T, L, theme: th, land, url, brand } = ctx;
  const lines = breakLines(scene.headline, "").filter(Boolean).slice(0, 2);
  const cta = fit(String(scene.cta || scene.emphasis || ""), 20);
  const kicker = fit(String(scene.kicker || ""), 18).toUpperCase();
  const hs = monoSize(lines.length ? lines : ["x"], land ? 76 : 86, land ? 7 : 11);
  const cs = land ? 2.6 : 5.4;
  const nChars = lines.reduce((a, l) => a + l.length, 0) || 1;
  const stg = r(Math.min(0.05, 1.05 / nChars));
  const runLine = `$ run ${slugOf(cta || brand, 20)}`;
  // Closing brand mark — the engine injects the site logo into `asset` for this
  // scene (wantsLogo); it degrades to nothing when no logo is available.
  const logo = asset && asset.path
    ? `<img id="${id}-logo" src="${esc(asset.path)}" alt="${esc(asset.alt || brand || "")}" style="opacity:0;display:block;max-height:${land ? 4 : 6}cqw;max-width:${land ? 26 : 52}cqw;object-fit:contain;margin-bottom:${land ? 2 : 3.6}cqw;">`
    : "";

  const html = `
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:${land ? "7cqw" : "13cqw 6cqw"};">
      ${logo}
      ${kicker ? `<div id="${id}-kick" style="opacity:0;font-family:${th.mono};font-size:${land ? 1.3 : 2.9}cqw;letter-spacing:0.34em;color:${th.alt};margin-bottom:${land ? 1.6 : 3.6}cqw;">${esc(kicker)}</div>` : ""}
      <div id="${id}-run" style="opacity:0;font-family:${th.mono};font-size:${land ? 1.4 : 3}cqw;letter-spacing:0.06em;color:${rgba(th.phos, 0.9)};${glow(th, th.phos, 0.55)}margin-bottom:${land ? 1.6 : 3.6}cqw;"></div>
      <div style="font-family:${th.display};font-weight:700;font-size:${hs}cqw;line-height:1.14;letter-spacing:-0.01em;color:${th.ink};text-align:center;">
        ${lines.map((l) => `<div style="white-space:nowrap;">${chars(l, `${id}-ch`)}</div>`).join("")}
      </div>
      ${cta ? `<div id="${id}-box" style="opacity:0;margin-top:${land ? 3 : 6.5}cqw;display:flex;align-items:center;border:${land ? 0.3 : 0.6}cqw solid ${th.phos};padding:${land ? "1.1cqw 2.6cqw" : "2.4cqw 4.4cqw"};background:${rgba(th.phos, 0.08)};">
        <span style="font-family:${th.display};font-weight:700;font-size:${r(cs)}cqw;letter-spacing:0.06em;color:${th.phos};${glow(th, th.phos, cs * 0.22)}">${esc(cta)}</span>
        ${cursor(`${id}-cur`, cs * 0.48, cs * 0.86, th.phos)}
      </div>` : ""}
      <div id="${id}-rule" style="height:${land ? 0.22 : 0.4}cqw;width:${land ? 42 : 78}cqw;background:${th.edge};transform-origin:left center;margin-top:${land ? 2.6 : 5.6}cqw;"></div>
      <div id="${id}-url" style="opacity:0;margin-top:${land ? 1.4 : 3.2}cqw;font-family:${th.mono};font-size:${land ? 1.35 : 3}cqw;letter-spacing:0.24em;color:${rgba(th.ink, 0.75)};">${esc(String(url).toUpperCase())}</div>
    </div>`;

  const s = [
    asset && asset.path ? `tl.fromTo("#${id}-logo",{opacity:0,y:${land ? -12 : -18}},{opacity:1,y:0,duration:0.4,ease:"power2.out"},${r(T + 0.1)});` : "",
    kicker ? `tl.fromTo("#${id}-kick",{opacity:0,y:-16},{opacity:1,y:0,duration:0.34},${r(T + 0.15)});` : "",
    `tl.fromTo("#${id}-run",{opacity:0},{opacity:1,duration:0.01,ease:"none"},${r(T + 0.2)});`,
    `type("#${id}-run",${JSON.stringify(runLine)},${r(T + 0.2)},0.34);`,
    nChars > 1 ? `tl.fromTo(".${id}-ch",{opacity:0,y:${land ? 18 : 26},color:"${th.phos}"},{opacity:1,y:0,color:"${th.ink}",duration:0.34,ease:"power2.out",stagger:${stg}},${r(T + 0.5)});` : "",
    cta ? `tl.fromTo("#${id}-box",{opacity:0,scale:0.86},{opacity:1,scale:1,duration:0.42,ease:"back.out(1.6)"},${r(T + 0.9)});` : "",
    cta ? `tl.fromTo("#${id}-cur",{opacity:0},{opacity:1,duration:0.01,ease:"none"},${r(T + 1.2)});` : "",
    cta ? blink(`#${id}-cur`, r(T + 1.2), Math.max(0.9, L - 1.3), 0.42) : "",
    cta ? `tl.to("#${id}-box",{borderColor:"${th.alt}",duration:0.6,ease:"sine.inOut",yoyo:true,repeat:reps(${r(Math.max(1.2, L - 1.3))},0.6)},${r(T + 1.3)});` : "",
    `tl.fromTo("#${id}-rule",{scaleX:0},{scaleX:1,duration:0.44,ease:"expo.out"},${r(T + 1.1)});`,
    `tl.fromTo("#${id}-url",{opacity:0,y:14},{opacity:1,y:0,duration:0.36},${r(T + 1.35)});`,
  ];
  return { html, s };
}

const SCENES = { boot, prompt, dirlist, readout, transmission, crtframe, execute };

// ---- persistent chrome (the glass, the grid, the status bars) -----------------
function chrome({ theme: th, D, brand, url, count, land }) {
  const barH = land ? 2.3 : 4.2;
  const barF = land ? 1.15 : 2.2;
  return {
    html: `
  <div id="backdrop" class="clip" data-start="0" data-duration="__D__" data-track-index="0" data-layout-allow-occlusion style="opacity:0;background:${th.ground};">
    <div style="position:absolute;inset:0;background-image:linear-gradient(${th.faint} 0.09cqw, transparent 0.09cqw),linear-gradient(90deg, ${th.faint} 0.09cqw, transparent 0.09cqw);background-size:${land ? 4 : 6}cqw ${land ? 4 : 6}cqw;opacity:0.62;"></div>
    <div id="bd-horizon" style="position:absolute;left:-10%;right:-10%;bottom:-14cqw;height:34cqw;background:radial-gradient(ellipse at 50% 100%, ${rgba(th.phos, 0.3)}, transparent 70%);"></div>
    <div style="position:absolute;inset:0;box-shadow:inset 0 0 ${land ? 16 : 26}cqw ${rgba(th.ground, 0.9)};"></div>
  </div>
  <div id="crt" class="clip" data-start="0" data-duration="__D__" data-track-index="39" data-layout-allow-occlusion style="opacity:0;background:none;">
    <div id="crt-lines" style="position:absolute;inset:0;background-image:repeating-linear-gradient(to bottom, ${rgba("#000000", 0.26)} 0 0.14cqw, transparent 0.14cqw 0.42cqw);"></div>
    <div id="crt-sweep" style="position:absolute;left:0;right:0;height:14cqw;background:linear-gradient(to bottom, transparent, ${rgba(th.phos, 0.09)}, transparent);"></div>
  </div>
  <div id="edge" class="clip" data-start="0" data-duration="__D__" data-track-index="40" data-layout-allow-occlusion style="opacity:0;background:none;">
    <div style="position:absolute;left:0;right:0;top:0;height:${r(barH)}cqw;display:flex;align-items:center;justify-content:space-between;padding:0 2cqw;background:${rgba(th.ground, 0.85)};border-bottom:0.1cqw solid ${rgba(th.phos, 0.3)};">
      <span style="font-family:${th.mono};font-size:${r(barF)}cqw;letter-spacing:0.2em;color:${th.phos};">${esc(String(brand).toLowerCase())}@${esc(hostOf(url))}</span>
      <span style="font-family:${th.mono};font-size:${r(barF)}cqw;letter-spacing:0.2em;color:${rgba(th.ink, 0.55)};">TTY/1</span>
    </div>
    <div style="position:absolute;left:0;right:0;bottom:0;height:${r(barH)}cqw;display:flex;align-items:center;justify-content:space-between;padding:0 2cqw;background:${rgba(th.ground, 0.85)};border-top:0.1cqw solid ${rgba(th.phos, 0.3)};">
      <span style="font-family:${th.mono};font-size:${r(barF)}cqw;letter-spacing:0.2em;color:${rgba(th.alt, 0.9)};">${esc(String(url).toUpperCase())}</span>
    </div>
  </div>`,
    script: `
  tl.fromTo("#backdrop",{opacity:0},{opacity:1,duration:0.4},0);
  tl.fromTo("#crt",{opacity:0},{opacity:1,duration:0.4},0.1);
  tl.fromTo("#edge",{opacity:0},{opacity:1,duration:0.4},0.2);
  tl.fromTo("#crt-sweep",{yPercent:-160},{yPercent:${r(100 * (land ? 5 : 12))},duration:3.2,ease:"none",repeat:reps(${r(D)},3.2)},0);
  tl.to("#crt-lines",{opacity:0.55,duration:0.7,ease:"sine.inOut",yoyo:true,repeat:reps(${r(D)},0.7)},0);
  tl.to("#bd-horizon",{opacity:0.6,duration:2.1,ease:"sine.inOut",yoyo:true,repeat:reps(${r(D)},2.1)},0);`,
  };
}

// Per-scene: step the scene counter in the bottom status bar.
// No per-scene chrome — the "SCN 01/08" counter was removed: a scene number
// ticking up is the same slideshow tell as the progress rail.

function styleBlock(th, land) {
  return `${th.fontFace}
  #root { font-family:${th.mono}; }
  #cap-pill { background:${rgba(th.ground, 0.9)}; border:${land ? 0.12 : 0.2}cqw solid ${rgba(th.phos, 0.5)} !important; border-radius:0; }
  #cap-text { font-family:${th.mono}; color:${th.phos}; letter-spacing:0.05em; }`;
}

const family = {
  theme, styleBlock, chrome, SCENES, TEMPLATE_SCENES, route, mediaSlots, mediaFallback,
  wantsLogo: (t) => t === "execute",
  fallbackType: "prompt",
  variants: 2,
  // Terminals cut like a channel change — short hard moves, almost no drift, so
  // the scanline grid never smears.
  camera: { kinds: ["zoom", "whip", "zoom", "whip", "whip", "zoom", "whip", "zoom"], blur: 12, push: 0.02, zoomIn: 1.1, zoomOut: 1.08 },
};

function buildComposition(opts) { return E.buildFilm(family, opts); }
// This pack's media demand + what filled each slot, WITHOUT rendering. Runs the
// exact routing and slot-filling the renderer runs, so the manifest can never
// drift from the film that ships.
function planMedia(opts) { return E.planMedia(family, opts); }

module.exports = { buildComposition, planMedia, TEMPLATE_SCENES };
