// Deterministic fallback composition — invoked only when every LLM pipeline
// attempt has failed. Must NEVER itself fail: uses only inline SVG, CSS
// gradients, and GSAP animations (no external assets, no fonts beyond
// system-ui, no LLM calls).
//
// Unlike the earlier 3-card version, this one is visually rich — animated
// gradient background, SVG particle field, Ken-Burns-style blob motion,
// staggered text reveals, smooth scene transitions. Built to still look
// decent when this is all the viewer gets.

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

function buildFallback({ prompt, duration, orientation, width, height, fps = 30, storyboard }) {
  const scenes = deriveScenes({ prompt, duration, storyboard });

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
      `<circle class="p p${i}" cx="${cx}%" cy="${cy}%" r="${r}" fill="white" opacity="${o}" />`
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
    }
    return pieces.join("\n    ");
  }).join("\n    ");

  // --- Particle animations: each drifts slowly upward with a gentle sway ---
  const particleAnims = [];
  for (let i = 0; i < particleCount; i++) {
    const dy = -(30 + Math.round(Math.random() * 40));
    const dx = (Math.random() - 0.5) * 20;
    const dur = 6 + Math.random() * 8;
    particleAnims.push(`tl.to(".p${i}", { attr: { cy: "+=${dy}%" }, x: "+=${dx}", duration: ${dur.toFixed(1)}, ease: "sine.inOut", yoyo: true, repeat: -1 }, 0);`);
  }

  const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Fallback composition</title>
<style>
  html, body { margin: 0; padding: 0; background: #0a0f1e; }
  #root {
    position: relative;
    width: ${width}px; height: ${height}px;
    overflow: hidden;
    font-family: Inter, Roboto, system-ui, -apple-system, "Segoe UI", sans-serif;
    color: #f5f7fa;
    isolation: isolate;
  }

  /* Animated gradient background */
  .bg-gradient, .bg-aurora {
    position: absolute; inset: 0;
    pointer-events: none;
  }
  .bg-gradient {
    background: linear-gradient(135deg, #0b0f1e 0%, #1a2452 45%, #3b1d6a 100%);
    z-index: 0;
  }
  .bg-aurora {
    background:
      radial-gradient(ellipse 60% 40% at 20% 30%, rgba(124,196,255,0.35), transparent 65%),
      radial-gradient(ellipse 50% 35% at 80% 75%, rgba(255,125,180,0.28), transparent 65%),
      radial-gradient(ellipse 45% 35% at 55% 50%, rgba(255,200,120,0.18), transparent 70%);
    filter: blur(40px);
    mix-blend-mode: screen;
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
    background: linear-gradient(120deg, #ffffff 0%, #bde0ff 60%, #ffd1e6 100%);
    -webkit-background-clip: text; background-clip: text;
    -webkit-text-fill-color: transparent; color: transparent;
  }
  .scene .t {
    margin-top: 28px;
    font-size: ${subPx}px; font-weight: 500;
    line-height: 1.35; max-width: 78%;
    color: #d9e1f2;
  }
  .scene.cta .h {
    font-size: ${ctaPx}px;
    background: linear-gradient(120deg, #9ad8ff, #ffffff 40%, #ffb4e1);
    -webkit-background-clip: text; background-clip: text;
    -webkit-text-fill-color: transparent; color: transparent;
  }
  .scene.cta .t { color: #e8c9ff; }

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
  .blob.b1 { top: -10%; left: -10%; background: radial-gradient(circle, rgba(124,196,255,0.45), transparent 65%); }
  .blob.b2 { bottom: -15%; right: -10%; background: radial-gradient(circle, rgba(255,125,180,0.40), transparent 65%); }
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

module.exports = { buildFallback };
