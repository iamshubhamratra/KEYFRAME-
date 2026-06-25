// Deterministic fallback composition — invoked only when every LLM pipeline
// attempt has failed. Must NEVER itself fail and must follow the same render
// rules the hyperframes lint enforces (unique tracks, opacity-only hidden
// states, hard kills, finite repeats, object-fit cover) so it RENDERS cleanly.
//
// Two modes:
//   • buildAssetFallback   — when real assets were fetched: a polished Ken-Burns
//     slideshow of the actual images/video (+ a logo outro) with a caption/
//     title layer. This guarantees a failed LLM comp still ships a video that
//     USES the user's assets instead of a contentless gradient.
//   • buildProceduralFallback — no assets: animated gradient + particles + text.
//
// Both use only inline SVG, CSS gradients, system fonts, and GSAP (no external
// fonts, no LLM calls, no fetch).

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function wordSpans(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean)
    .map((w) => `<span class="w">${escapeHtml(w)}</span>`).join(" ");
}

// Break the user's free-form prompt into reasonable scene chunks.
// Prefers storyboard scenes if provided; otherwise splits prompt by
// blank lines / headline patterns.
function deriveScenes({ prompt, duration, storyboard }) {
  if (storyboard?.scenes?.length) {
    return storyboard.scenes.map((s) => ({
      start: s.start,
      duration: s.duration,
      headline: (s.headline || s.kind || "").slice(0, 80),
      subtext: (s.subtext || s.bullets?.[0] || "").slice(0, 160),
      accent: s.kind === "cta" ? "cta" : (s.kind === "title" ? "title" : "body"),
    }));
  }

  // Strip "Scene X (a–bs):" / "Hook (0-3s):" style markers and split by blank lines.
  const cleaned = String(prompt || "")
    .replace(/^[ \t]*(?:hook|scene\s*\d+|intro|outro|cta)\s*(?:\([^)]*\))?\s*:\s*/gim, "")
    .trim();
  const paragraphs = cleaned.split(/\n{2,}|\r\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const blocks = paragraphs.length ? paragraphs : [cleaned || "Your Video"];

  const n = Math.max(2, Math.min(blocks.length + 1, 6));
  const base = duration / n;
  const scenes = [];
  let cursor = 0;
  for (let i = 0; i < n; i++) {
    const text = i === 0
      ? (blocks[0]?.split(/[.?!]/)[0] || "Your Video").slice(0, 80)
      : (blocks[(i - 1) % blocks.length] || "").slice(0, 160);
    const isIntro = i === 0;
    const isOutro = i === n - 1;
    const dur = i === n - 1 ? (duration - cursor) : base;
    scenes.push({
      start: Math.round(cursor * 100) / 100,
      duration: Math.round(dur * 100) / 100,
      headline: isIntro ? text : "",
      subtext:  isIntro ? "" : text,
      accent:   isOutro ? "cta" : (isIntro ? "title" : "body"),
    });
    cursor += dur;
  }
  return scenes;
}

// Derive a fallback theme from frame-pack tokens (frame_registry.getPackTokens
// shape) so even the emergency composition looks art-directed: lightest token
// becomes the ground, darkest the ink, the rest accents. Null -> the original
// dark-studio default.
function themeFromTokens(packTokens) {
  const entries = packTokens && packTokens.colors ? Object.entries(packTokens.colors) : [];
  if (entries.length < 2) return null;
  const lum = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  };

  // Ground selection: prefer a token NAMED like a ground (pack authors name
  // them — offwhite/paper/midnight/abyss); dark packs would otherwise get a
  // white fallback from their lightest (fill) token. Ink = max contrast.
  const GROUND_NAMES = /^(ground|paper|paper-deep|offwhite|midnight|abyss|bg|base|night)$/i;
  const named = entries.find(([k]) => GROUND_NAMES.test(k));
  const colors = entries.map(([, v]) => v);
  const byLum = [...colors].sort((a, b) => lum(b) - lum(a));
  const ground = named ? named[1] : byLum[0];
  const ink = lum(ground) > 128 ? byLum[byLum.length - 1] : byLum[0];
  const accents = byLum.filter((c) => c !== ground && c !== ink);
  const rgba = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };
  return {
    bg1: ground, bg2: ground, bg3: accents[0] || ground,
    ink, sub: ink, acc1: accents[0] || ink, acc2: accents[1] || accents[0] || ink,
    particle: ink,
    aurora1: rgba(accents[0] || ink, 0.30),
    aurora2: rgba(accents[1] || accents[0] || ink, 0.22),
    aurora3: rgba(accents[2] || accents[0] || ink, 0.16),
    fonts: (packTokens.fonts || []).map((f) => `"${f}"`).join(", "),
    flatText: true, // pack systems get solid ink text, not gradient-clip text
  };
}

const DEFAULT_THEME = {
  bg1: "#0a0f1e", bg2: "#1a2452", bg3: "#3b1d6a",
  ink: "#f5f7fa", sub: "#d9e1f2", acc1: "#9ad8ff", acc2: "#ffb4e1",
  particle: "white",
  aurora1: "rgba(124,196,255,0.35)", aurora2: "rgba(255,125,180,0.28)", aurora3: "rgba(255,200,120,0.18)",
  fonts: "",
  flatText: false,
};

// System-only font stack — NEVER prepend pack fonts here. A pack token like
// "Space Grotesk" has no @font-face in a deterministic fallback, so the layout
// inspector's StaticGuard rejects the whole composition with a font-contract
// error ("font family used without @font-face"). The fallback must render with
// fonts that resolve offline without declaration. (theme arg kept for signature
// compatibility with callers.)
function fontStackFor(_theme) {
  return `Inter, "Segoe UI", system-ui, Roboto, Helvetica, Arial, sans-serif`;
}

// Always-on animated SVG vector layer: a drifting particle field + a slowly
// spinning dashed accent ring + two "drawing" accent lines. Every motion is a
// GSAP tween (so it animates under deterministic frame-seek capture) with
// FINITE repeats and lives on its own unique track. This is what guarantees a
// fallback composition still carries inline vectors instead of being a bare
// image slideshow. Returns { html, tweens }.
function vectorVfxLayer({ width, height, duration, theme, trackIndex = 350, count = 12 }) {
  const r2 = (n) => Math.round(n * 100) / 100;
  const particleEls = [];
  const tweens = [];
  for (let i = 0; i < count; i++) {
    const cx = Math.round(Math.random() * 100);
    const cy = Math.round(Math.random() * 100);
    const rad = 2 + Math.round(Math.random() * 5);
    const o = (0.14 + Math.random() * 0.3).toFixed(2);
    particleEls.push(`<circle class="vp vp${i}" cx="${cx}%" cy="${cy}%" r="${rad}" fill="${theme.particle}" opacity="${o}" />`);
    const dy = -(24 + Math.round(Math.random() * 40));
    const dx = (Math.random() - 0.5) * 18;
    const dur = 6 + Math.random() * 7;
    tweens.push(`  tl.to(".vp${i}", { attr: { cy: "+=${dy}%" }, x: "+=${r2(dx)}", duration: ${dur.toFixed(1)}, ease: "sine.inOut", yoyo: true, repeat: ${Math.max(0, Math.floor(duration / dur) - 1)} }, 0);`);
  }

  // Accent ring (dashed -> rotation makes the dashes orbit) + two lines that draw.
  const ringR = Math.round(Math.min(width, height) * 0.22);
  const cxPx = Math.round(width * 0.5), cyPx = Math.round(height * 0.5);
  const lineLen = Math.round(width * 0.9);
  const accentEls =
    `<circle id="vfx-ring" cx="${cxPx}" cy="${cyPx}" r="${ringR}" fill="none" stroke="${theme.acc1}" stroke-width="2" opacity="0.12" stroke-dasharray="6 14" />` +
    `<line id="vfx-line1" x1="0" y1="${Math.round(height * 0.3)}" x2="${lineLen}" y2="${Math.round(height * 0.3)}" stroke="${theme.acc1}" stroke-width="2" opacity="0.18" stroke-dasharray="${lineLen}" stroke-dashoffset="${lineLen}" />` +
    `<line id="vfx-line2" x1="${width}" y1="${Math.round(height * 0.72)}" x2="${width - lineLen}" y2="${Math.round(height * 0.72)}" stroke="${theme.acc2}" stroke-width="2" opacity="0.18" stroke-dasharray="${lineLen}" stroke-dashoffset="${lineLen}" />`;

  const spins = Math.max(1, Math.round(duration / 18));
  tweens.push(`  tl.to("#vfx-ring", { rotation: 360, svgOrigin: "${cxPx} ${cyPx}", duration: ${r2(duration / spins)}, ease: "none", repeat: ${Math.max(0, spins - 1)} }, 0);`);
  const lineDur = Math.min(2.2, Math.max(1.0, duration * 0.12));
  const lineRep = Math.max(0, Math.floor(duration / (lineDur * 2)) - 1);
  tweens.push(`  tl.fromTo("#vfx-line1", { strokeDashoffset: ${lineLen} }, { strokeDashoffset: 0, duration: ${r2(lineDur)}, ease: "power2.inOut", yoyo: true, repeat: ${lineRep} }, 0.4);`);
  tweens.push(`  tl.fromTo("#vfx-line2", { strokeDashoffset: ${lineLen} }, { strokeDashoffset: 0, duration: ${r2(lineDur)}, ease: "power2.inOut", yoyo: true, repeat: ${lineRep} }, ${r2(0.4 + lineDur * 0.5)});`);

  // Wrapper is a CLIP (full-duration, never opacity/transform-animated itself —
  // only its SVG children move) so it never trips the clip-hidden-state lint.
  // No z-index: DOM order places it above the image clips but below the title/
  // caption layers that follow it.
  const html =
`    <div id="vfx-wrap" class="clip" data-start="0" data-duration="${duration}" data-track-index="${trackIndex}"
         style="position:absolute; inset:0; pointer-events:none;">
      <svg class="vfx" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid slice" style="position:absolute; inset:0; width:100%; height:100%;">
        ${particleEls.join("")}${accentEls}
      </svg>
    </div>`;
  return { html, tweens };
}

// ---------- Asset-aware fallback: Ken-Burns slideshow of the real assets ----------
function buildAssetFallback({ prompt, duration, orientation, width, height, fps, storyboard, packTokens, assets, captionCues }) {
  const theme = themeFromTokens(packTokens) || DEFAULT_THEME;
  const isVertical = orientation === "vertical";
  const fontStack = fontStackFor(theme);

  const isLogo = (a) => /\b(logo|wordmark|brand)\b/i.test(a.alt || "");
  // A REAL product/website screenshot is the most credible asset — never stretch
  // it full-bleed (distorts the UI, crops text). Present it in a browser-chrome
  // frame, centered on a design-system ground, with a Ken Burns push. This is the
  // fallback's answer to the "CLEAR SCREENSHOTS" requirement.
  const isScreenshot = (a) => a && (a.source === "website" || /screenshot/i.test(a.alt || ""));
  const slideGround =
    `radial-gradient(62% 55% at 22% 26%, ${theme.aurora1}, transparent 60%), ` +
    `radial-gradient(55% 50% at 80% 80%, ${theme.aurora2}, transparent 62%), ${theme.bg1}`;
  // Vector/icon SVGs are decorative (often transparent, non-rectangular) — a
  // full-bleed object-fit:cover Ken-Burns slide would stretch an icon across the
  // whole frame. Keep them OUT of the photo slideshow; the always-on
  // vectorVfxLayer below carries the vector cadence in this fallback.
  const isVectorFile = (a) => /\.svg(\?|#|$)/i.test(a.path || "");
  const arr = (assets || []).filter((a) => a && a.path);
  const mains = arr.filter((a) => !isLogo(a) && !isVectorFile(a));
  const logos = arr.filter(isLogo);
  const ordered = [...mains, ...logos]; // logo(s) become the outro
  const N = ordered.length;
  // No photographic/logo material to slideshow (e.g. only SVGs were fetched):
  // let the dispatcher fall through to the procedural look rather than divide by 0.
  if (N === 0) throw new Error("no raster assets for slideshow fallback");

  const slice = duration / N;
  const XF = Math.max(0.3, Math.min(0.7, slice * 0.25)); // crossfade seconds
  const r2 = (n) => Math.round(n * 100) / 100;

  const clipEls = [];
  const tl = [];

  ordered.forEach((a, i) => {
    const start = i === 0 ? 0 : r2(i * slice - XF);
    const end = i === N - 1 ? duration : r2((i + 1) * slice);
    const dur = r2(end - start);
    const id = `a${i}`;
    const track = i; // UNIQUE track per asset -> overlapping_clips_same_track impossible
    const logo = isLogo(a);
    const driftX = (i % 2 === 0) ? -3 : 3;
    const driftY = (i % 2 === 0) ? 2 : -3;

    if (a.type === "video") {
      clipEls.push(
        `    <video id="${id}" class="clip" src="${a.path}"
         data-start="${start}" data-duration="${dur}" data-track-index="${track}"
         muted playsinline autoplay loop
         style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover; object-position:center; opacity:0;"></video>`
      );
      tl.push(`  tl.fromTo("#${id}", { scale: 1.0 }, { scale: 1.08, xPercent: ${driftX}, yPercent: ${driftY}, duration: ${dur}, ease: "sine.inOut" }, ${start});`);
    } else if (logo) {
      clipEls.push(
        `    <div id="${id}" class="clip logo-stage"
         data-start="${start}" data-duration="${dur}" data-track-index="${track}"
         style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:${theme.bg1}; opacity:0;">
      <img src="${a.path}" alt="${escapeHtml(a.alt || "logo")}" style="max-width:46%; max-height:46%; object-fit:contain;">
    </div>`
      );
      tl.push(`  tl.fromTo("#${id} img", { scale: 0.82 }, { scale: 1, duration: 0.9, ease: "expo.out" }, ${r2(start + 0.1)});`);
    } else if (isScreenshot(a)) {
      const barH = isVertical ? 46 : 40;
      const dotR = isVertical ? 13 : 11;
      clipEls.push(
        `    <div id="${id}" class="clip"
         data-start="${start}" data-duration="${dur}" data-track-index="${track}"
         style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; padding:${isVertical ? "7%" : "5%"}; box-sizing:border-box; background:${slideGround}; opacity:0;">
      <div style="width:100%; max-width:${isVertical ? "94%" : "80%"}; max-height:84%; border:3px solid ${theme.ink}; border-radius:16px; box-shadow:0 32px 70px rgba(0,0,0,0.45); overflow:hidden; background:#fff;">
        <div style="height:${barH}px; background:#eef0f4; display:flex; align-items:center; gap:8px; padding:0 16px; border-bottom:2px solid rgba(0,0,0,0.10);">
          <span style="width:${dotR}px; height:${dotR}px; border-radius:50%; background:#ff5f57;"></span>
          <span style="width:${dotR}px; height:${dotR}px; border-radius:50%; background:#febc2e;"></span>
          <span style="width:${dotR}px; height:${dotR}px; border-radius:50%; background:#28c840;"></span>
        </div>
        <img src="${a.path}" alt="${escapeHtml(a.alt || "")}" style="width:100%; display:block;">
      </div>
    </div>`
      );
      tl.push(`  tl.fromTo("#${id} img", { scale: 1.0 }, { scale: 1.08, duration: ${dur}, ease: "sine.inOut" }, ${start});`);
    } else {
      clipEls.push(
        `    <img id="${id}" class="clip" src="${a.path}" alt="${escapeHtml(a.alt || "")}"
         data-start="${start}" data-duration="${dur}" data-track-index="${track}"
         style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover; object-position:center; opacity:0;">`
      );
      tl.push(`  tl.fromTo("#${id}", { scale: 1.0 }, { scale: 1.12, xPercent: ${driftX}, yPercent: ${driftY}, duration: ${dur}, ease: "sine.inOut" }, ${start});`);
    }

    // Fade in (opacity is the ONLY hidden state we touch on a clip element).
    tl.push(`  tl.fromTo("#${id}", { opacity: 0 }, { opacity: 1, duration: ${r2(XF)}, ease: "power1.out" }, ${start});`);
    // Fade out + hard kill at the boundary (all but the last asset).
    if (i < N - 1) {
      tl.push(`  tl.to("#${id}", { opacity: 0, duration: ${r2(XF)}, ease: "power1.in" }, ${r2(end - XF)});`);
      tl.push(`  tl.set("#${id}", { opacity: 0 }, ${end});`);
    }
  });

  // --- Always-on animated vector layer (particles + accent ring + draw lines) ---
  // Sits above the image/video clips and below the title/captions, so even this
  // emergency composition ships with the inline-SVG vector cadence. Its track is
  // offset above the asset clips (which use tracks 0..N-1) so it can never
  // collide even if the upstream asset cap is ever raised.
  const vfx = vectorVfxLayer({ width, height, duration, theme, trackIndex: N + 50 });
  clipEls.push(vfx.html);
  vfx.tweens.forEach((t) => tl.push(t));

  // --- Title card on the first slice (centered, word-stagger) ---
  const titleText = (storyboard?.title
    || storyboard?.scenes?.[0]?.headline
    || deriveScenes({ prompt, duration, storyboard })[0]?.headline
    || "").toString().slice(0, 80);
  const titleEnd = r2(Math.min(slice, duration));
  if (titleText) {
    clipEls.push(
      `    <div id="title" class="clip title-wrap"
         data-start="0.2" data-duration="${r2(titleEnd - 0.2)}" data-track-index="500"
         style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; opacity:0;">
      <div class="title-card">${wordSpans(titleText)}</div>
    </div>`
    );
    tl.push(`  tl.set("#title", { opacity: 1 }, 0.2);`);
    tl.push(`  tl.fromTo("#title .w", { yPercent: 70, opacity: 0, filter: "blur(8px)" }, { yPercent: 0, opacity: 1, filter: "blur(0px)", duration: 0.7, stagger: 0.06, ease: "power3.out" }, 0.3);`);
    tl.push(`  tl.to("#title", { opacity: 0, duration: 0.4, ease: "power1.in" }, ${r2(titleEnd - 0.45)});`);
    tl.push(`  tl.set("#title", { opacity: 0 }, ${titleEnd});`);
  }

  // --- Caption track (one full-duration container, children toggled by opacity) ---
  const cues = Array.isArray(captionCues) ? captionCues.filter((c) => c && c.text) : [];
  if (cues.length) {
    const capEls = cues.map((c, j) =>
      `      <div class="cap" id="cap${j}" style="opacity:0;">${escapeHtml(String(c.text))}</div>`
    ).join("\n");
    clipEls.push(
      `    <div id="captions" class="clip"
         data-start="0" data-duration="${duration}" data-track-index="900"
         style="position:absolute; inset:0; pointer-events:none;">
${capEls}
    </div>`
    );
    cues.forEach((c, j) => {
      const s = r2(Math.max(0, Number(c.start) || 0));
      const e = r2(Math.min(duration, Number(c.end) || (s + 2)));
      if (e <= s) return;
      tl.push(`  tl.set("#cap${j}", { opacity: 1 }, ${s});`);
      tl.push(`  tl.set("#cap${j}", { opacity: 0 }, ${e});`);
    });
  }

  const titlePx = isVertical ? 92 : 84;
  const capPx = isVertical ? 46 : 40;
  const metaJson = JSON.stringify({ compositionId: "vid", width, height, fps, duration });

  const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Composition</title>
<style>
  html, body { margin: 0; padding: 0; background: ${theme.bg1}; }
  #root {
    position: relative;
    width: ${width}px; height: ${height}px;
    overflow: hidden;
    font-family: ${fontStack};
    color: ${theme.ink};
    isolation: isolate;
  }
  .title-wrap { padding: ${isVertical ? "16%" : "8%"}; box-sizing: border-box; }
  .title-card {
    text-align: center;
    font-size: ${titlePx}px; font-weight: 800; line-height: 1.06; letter-spacing: -0.02em;
    max-width: 88%;
    color: ${theme.ink};
    text-shadow: 0 6px 28px rgba(0,0,0,0.55);
  }
  .title-card .w { display: inline-block; }
  .cap {
    position: absolute;
    left: 50%; bottom: 6%;
    transform: translateX(-50%);
    max-width: 86%;
    text-align: center;
    font-size: ${capPx}px; font-weight: 600; line-height: 1.3;
    color: #ffffff;
    background: linear-gradient(180deg, rgba(0,0,0,0.0), rgba(0,0,0,0.55));
    padding: 0.4em 0.9em; border-radius: 12px;
    text-shadow: 0 2px 10px rgba(0,0,0,0.7);
  }
</style>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>
</head>
<body>
  <div id="root" class="composition"
       data-composition-id="vid"
       data-width="${width}" data-height="${height}"
       data-start="0" data-duration="${duration}">

${clipEls.join("\n")}

  </div>
<script>
(function(){
  const tl = gsap.timeline({ paused: true, defaults: { ease: "power2.out" } });

${tl.join("\n")}

  window.__timelines = window.__timelines || {};
  window.__timelines["vid"] = tl;
})();
</script>
</body>
</html>`;

  return { indexHtml, metaJson };
}

// ---------- Procedural fallback (no assets): gradient + particles + text ----------
function buildProceduralFallback({ prompt, duration, orientation, width, height, fps, storyboard, packTokens }) {
  const scenes = deriveScenes({ prompt, duration, storyboard });
  const theme = themeFromTokens(packTokens) || DEFAULT_THEME;

  const isVertical = orientation === "vertical";
  const headlinePx = isVertical ? 108 : 136;
  const subPx      = isVertical ? 48  : 56;
  const ctaPx      = isVertical ? 120 : 148;

  const metaJson = JSON.stringify({
    compositionId: "vid", width, height, fps, duration,
  });

  // --- SVG particles (18 small circles floating in the background) ---
  const particleCount = 18;
  const particleEls = [];
  for (let i = 0; i < particleCount; i++) {
    const cx = Math.round(Math.random() * 100);
    const cy = Math.round(Math.random() * 100);
    const r  = 2 + Math.round(Math.random() * 5);
    const o  = (0.15 + Math.random() * 0.35).toFixed(2);
    particleEls.push(
      `<circle class="p p${i}" cx="${cx}%" cy="${cy}%" r="${r}" fill="${theme.particle}" opacity="${o}" />`
    );
  }
  const particlesSvg = `<svg class="particles" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid slice">${particleEls.join("")}</svg>`;

  // --- Scene clip divs ---
  const clipDivs = scenes.map((s, i) => {
    const h = escapeHtml(s.headline);
    const t = escapeHtml(s.subtext);
    const cls = s.accent === "cta" ? "scene cta" : s.accent === "title" ? "scene title" : "scene body";
    return `
    <div id="s${i}" class="clip ${cls}"
         data-start="${s.start}" data-duration="${s.duration}" data-track-index="3">
      ${h ? `<div class="h h${i}">${h}</div>` : ""}
      ${t ? `<div class="t t${i}">${t}</div>` : ""}
    </div>`;
  }).join("\n");

  // --- GSAP timeline entries per scene ---
  const timelineEntries = scenes.map((s, i) => {
    const enterAt = s.start;
    const fadeOutAt = s.start + s.duration - 0.6;
    const pieces = [];
    pieces.push(`tl.fromTo("#s${i}", { opacity: 0 }, { opacity: 1, duration: 0.45 }, ${enterAt});`);
    if (s.headline) {
      pieces.push(`tl.fromTo("#s${i} .h${i}", { yPercent: 30, opacity: 0, filter: "blur(6px)" }, { yPercent: 0, opacity: 1, filter: "blur(0)", duration: 0.9, ease: "expo.out" }, ${enterAt});`);
    }
    if (s.subtext) {
      pieces.push(`tl.fromTo("#s${i} .t${i}", { yPercent: 25, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.8, ease: "power2.out" }, ${enterAt + 0.25});`);
    }
    if (i < scenes.length - 1) {
      pieces.push(`tl.to("#s${i}", { opacity: 0, duration: 0.6, ease: "power1.in" }, ${fadeOutAt});`);
      pieces.push(`tl.set("#s${i}", { opacity: 0 }, ${Math.round((s.start + s.duration) * 100) / 100});`);
    }
    return pieces.join("\n    ");
  }).join("\n    ");

  // --- Particle animations: each drifts slowly upward with a gentle sway ---
  const particleAnims = [];
  for (let i = 0; i < particleCount; i++) {
    const dy = -(30 + Math.round(Math.random() * 40));
    const dx = (Math.random() - 0.5) * 20;
    const dur = 6 + Math.random() * 8;
    particleAnims.push(`tl.to(".p${i}", { attr: { cy: "+=${dy}%" }, x: "+=${dx}", duration: ${dur.toFixed(1)}, ease: "sine.inOut", yoyo: true, repeat: ${Math.max(0, Math.floor(duration / dur) - 1)} }, 0);`);
  }

  const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Fallback composition</title>
<style>
  html, body { margin: 0; padding: 0; background: ${theme.bg1}; }
  #root {
    position: relative;
    width: ${width}px; height: ${height}px;
    overflow: hidden;
    font-family: ${fontStackFor(theme)};
    color: ${theme.ink};
    isolation: isolate;
  }

  /* Animated gradient background */
  .bg-gradient, .bg-aurora {
    position: absolute; inset: 0;
    pointer-events: none;
  }
  .bg-gradient {
    background: linear-gradient(135deg, ${theme.bg1} 0%, ${theme.bg2} 45%, ${theme.bg3} 100%);
    z-index: 0;
  }
  .bg-aurora {
    background:
      radial-gradient(ellipse 60% 40% at 20% 30%, ${theme.aurora1}, transparent 65%),
      radial-gradient(ellipse 50% 35% at 80% 75%, ${theme.aurora2}, transparent 65%),
      radial-gradient(ellipse 45% 35% at 55% 50%, ${theme.aurora3}, transparent 70%);
    filter: blur(40px);
    ${theme.flatText ? "" : "mix-blend-mode: screen;"}
    z-index: 1;
  }

  .particles { position: absolute; inset: 0; z-index: 2; pointer-events: none; }

  /* Scene text */
  .scene {
    position: absolute; inset: 0;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: ${isVertical ? "18%" : "10%"};
    box-sizing: border-box;
    text-align: center;
    z-index: 3;
    opacity: 0;
  }
  .scene .h {
    font-size: ${headlinePx}px; font-weight: 800;
    line-height: 1.05; letter-spacing: -0.02em;
    max-width: 92%;
    text-shadow: 0 4px 24px rgba(0,0,0,0.5);
  }
  .scene.title .h {
    ${theme.flatText
      ? `color: ${theme.ink};`
      : `background: linear-gradient(120deg, #ffffff 0%, #bde0ff 60%, #ffd1e6 100%);
    -webkit-background-clip: text; background-clip: text;
    -webkit-text-fill-color: transparent; color: transparent;`}
  }
  .scene .t {
    margin-top: 28px;
    font-size: ${subPx}px; font-weight: 500;
    line-height: 1.35; max-width: 78%;
    color: ${theme.sub};
  }
  .scene.cta .h {
    font-size: ${ctaPx}px;
    ${theme.flatText
      ? `color: ${theme.ink};`
      : `background: linear-gradient(120deg, #9ad8ff, #ffffff 40%, #ffb4e1);
    -webkit-background-clip: text; background-clip: text;
    -webkit-text-fill-color: transparent; color: transparent;`}
  }
  .scene.cta .t { color: ${theme.flatText ? theme.sub : "#e8c9ff"}; }

  /* Subtle moving blob behind text for depth */
  .blob {
    position: absolute;
    width: ${isVertical ? "70%" : "50%"};
    aspect-ratio: 1;
    border-radius: 50%;
    filter: blur(50px);
    opacity: 0.6;
    z-index: 1;
    pointer-events: none;
  }
  .blob.b1 { top: -10%; left: -10%; background: radial-gradient(circle, ${theme.aurora1}, transparent 65%); }
  .blob.b2 { bottom: -15%; right: -10%; background: radial-gradient(circle, ${theme.aurora2}, transparent 65%); }
</style>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>
</head>
<body>
  <div id="root" class="composition"
       data-composition-id="vid"
       data-width="${width}" data-height="${height}"
       data-start="0" data-duration="${duration}">

    <div id="bg-gradient" class="bg-gradient clip"
         data-start="0" data-duration="${duration}" data-track-index="0"></div>
    <div id="bg-aurora" class="bg-aurora clip"
         data-start="0" data-duration="${duration}" data-track-index="1"></div>

    <div id="blob1" class="blob b1 clip"
         data-start="0" data-duration="${duration}" data-track-index="2"></div>
    <div id="blob2" class="blob b2 clip"
         data-start="0" data-duration="${duration}" data-track-index="2"></div>

    <div id="particles-wrap" class="clip"
         data-start="0" data-duration="${duration}" data-track-index="2"
         style="position:absolute; inset:0;">
      ${particlesSvg}
    </div>

${clipDivs}

  </div>
<script>
(function(){
  const tl = gsap.timeline({ paused: true, defaults: { ease: "power2.out" } });

  // Background aurora slow pan
  tl.fromTo("#bg-aurora", { xPercent: -5, yPercent: -5 }, { xPercent: 5, yPercent: 5, duration: ${duration}, ease: "sine.inOut" }, 0);

  // Blobs drift (Ken-Burns-ish)
  tl.fromTo("#blob1", { xPercent: 0, yPercent: 0, scale: 1 }, { xPercent: 8, yPercent: 6, scale: 1.15, duration: ${duration}, ease: "sine.inOut" }, 0);
  tl.fromTo("#blob2", { xPercent: 0, yPercent: 0, scale: 1 }, { xPercent: -6, yPercent: -8, scale: 1.12, duration: ${duration}, ease: "sine.inOut" }, 0);

  // Particles drift
  ${particleAnims.join("\n  ")}

  // Scenes
  ${timelineEntries}

  window.__timelines = window.__timelines || {};
  window.__timelines["vid"] = tl;
})();
</script>
</body>
</html>`;

  return { indexHtml, metaJson };
}

// Dispatcher: use the real assets when we have them, else the procedural look.
function buildFallback(opts) {
  const assets = (opts.assets || []).filter((a) => a && a.path);
  if (assets.length) {
    try {
      return buildAssetFallback({ ...opts, assets });
    } catch (e) {
      console.warn(`[fallback] asset slideshow build failed (${e.message}); using procedural fallback`);
    }
  }
  return buildProceduralFallback(opts);
}

module.exports = { buildFallback, buildAssetFallback, buildProceduralFallback };
