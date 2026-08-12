// SCENE AUTHOR — the agent writes NEW scenes, in HTML, instead of recycling the
// template's authored layouts.
//
// WHY THIS EXISTS
// A frame pack ships a fixed set of scene shapes. A 30s template asked for a 60s
// film reuses those shapes with new copy (see classifySlots in omelette_adapter),
// which is structurally correct but visually repetitive — the second half of a
// long film looks like the first half wearing different words. This module lets
// an LLM author genuinely new scenes IN THE PACK'S STYLE, so length adds variety
// instead of repetition.
//
// WHAT IT DOES NOT DO
// It cannot add a scene to a COMPILED template (the omelette packs are React
// bundles; window.OM_SCENES supplies data to components already in the bundle, so
// an unknown scene name renders nothing). For those packs an authored scene is
// played as its own full-frame layer inside #kf-comp-root — the same mechanism
// the script overlay uses — not as a bundle scene.
//
// THE CONTRACT AN AUTHORED SCENE MUST MEET
// A renderer captures frames by SEEKING a paused timeline, never by playing it.
// Everything below follows from that, and every one of these has shipped as a
// blank or flickering frame in this codebase before it was enforced:
//   * hidden state is `opacity:0` ONLY — never display/visibility, and every
//     from-state lives in gsap.fromTo so a backwards seek restores it
//   * NO infinite repeats — a seek can land mid-cycle and render a random phase
//   * NO Date.now/Math.random/setTimeout/requestAnimationFrame — a frame must be
//     a pure function of tl.time()
//   * no external assets: no webfonts, no CDN, no <img src> outside the pool
//   * one scene = one `.clip` on its own track, hard-killed at its end
//
// Authored scenes are VALIDATED before use (lintScene below) and any scene that
// fails falls back to the pack's own builder. A bad authored scene must never be
// able to blank a film.

const openrouter = require("./openrouter");
const { note } = require("./fallback_log");

const r = (n) => Math.round((Number(n) || 0) * 100) / 100;

// ---- validation ----------------------------------------------------------------
// Cheap, deterministic, and run on EVERY authored scene. This is the gate that
// keeps a creative model from breaking the render contract.
const FORBIDDEN = [
  [/\brequestAnimationFrame\b/, "requestAnimationFrame — frames must be a pure function of tl.time()"],
  [/\bsetTimeout\b|\bsetInterval\b/, "setTimeout/setInterval — not seek-deterministic"],
  [/\bMath\.random\b/, "Math.random() — a seek must reproduce the same frame"],
  [/\bnew Date\b|\bDate\.now\b/, "Date — a seek must reproduce the same frame"],
  [/repeat\s*:\s*-1/, "repeat:-1 — an infinite repeat renders a random phase on seek"],
  [/https?:\/\//, "external URL — the render is offline"],
  [/@import\b/, "@import — the render is offline"],
  [/<script\b/i, "<script> tag — return js separately, not as markup"],
  [/\bfetch\s*\(|XMLHttpRequest/, "network access — the render is offline"],
  [/\bdisplay\s*:\s*none/, "display:none as hidden state — use opacity:0 so tweens interpolate"],
  [/visibility\s*:\s*hidden/, "visibility:hidden as hidden state — use opacity:0"],
];

/**
 * Validate one authored scene against the render contract.
 * @returns {string[]} problems; empty means the scene is safe to render
 */
function lintScene(scene, { assets = [], index = 0 } = {}) {
  const errs = [];
  if (!scene || typeof scene !== "object") return ["scene is not an object"];
  const html = String(scene.html || "");
  const css = String(scene.css || "");
  const js = String(scene.s || scene.js || "");

  if (!html.trim()) errs.push("empty html — the scene would render a blank frame");
  const body = `${html}\n${css}\n${js}`;
  for (const [re, why] of FORBIDDEN) if (re.test(body)) errs.push(why);

  // Every <img> must point at an asset we actually have on disk. A missing src is
  // an empty box in the film and a silent one — the frame still "looks plausible".
  const allowed = new Set((assets || []).map((a) => String(a && a.path || "")).filter(Boolean));
  const srcs = [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]);
  for (const s of srcs) {
    if (/^data:/.test(s)) continue;
    if (!allowed.has(s)) errs.push(`img src "${s}" is not in the asset pool`);
  }

  // THE JS MUST PARSE. This is the one failure that is not merely a bad scene:
  // the authored script is inlined into the composition's single <script>, so a
  // syntax error takes the WHOLE timeline down — window.__timelines.vid never
  // gets defined and every frame of the film renders blank, not just this scene.
  // Measured: a real authored scene did exactly this. Compile-only via Function;
  // the body is never executed here.
  if (js) {
    try { new Function("tl", "AT", "DUR", "gsap", js); }
    catch (e) { errs.push(`js does not parse (would blank the entire film): ${e.message}`); }
  }
  // Same class of break, one level up: a stray closing tag escapes the block it
  // is injected into and corrupts everything after it.
  if (/<\/style\s*>/i.test(css)) errs.push("css contains </style> — it would break out of the style block");
  if (/<\/script\s*>/i.test(js)) errs.push("js contains </script> — it would break out of the script block");

  // The scene must actually animate — a static frame held for 5s reads as a stall.
  if (js && !/\b(tl\.(from|fromTo|to|set)|gsap\.)/.test(js)) {
    errs.push("js adds no tweens — the scene would be static");
  }
  // Ids must be namespaced or two scenes collide and drive each other's elements.
  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map((m) => m[1]);
  for (const id of ids) {
    if (!id.startsWith(`sa${index}`)) errs.push(`id "${id}" must be prefixed "sa${index}" so scenes cannot collide`);
  }
  return errs;
}

// ---- prompt --------------------------------------------------------------------
function buildPrompt({ scenes, theme, dims, land, assets, framePack, packStyle }) {
  const W = dims.width, H = dims.height;
  const pool = (assets || []).slice(0, 14).map((a, i) =>
    `  ${i}. ${a.path}  (${a.width || "?"}x${a.height || "?"}${a.kind ? `, ${a.kind}` : ""}${a.alt ? ` — ${String(a.alt).slice(0, 60)}` : ""})`);

  return [
    `You are authoring NEW scenes for a ${land ? "LANDSCAPE" : "VERTICAL"} motion-graphics film, ${W}x${H}.`,
    `Frame pack: "${framePack}". You must stay inside its design system — this film has to look like it belongs to the pack, not like a generic template.`,
    ``,
    `DESIGN SYSTEM (use these exact values):`,
    JSON.stringify(theme, null, 1).slice(0, 1800),
    packStyle ? `Style notes: ${packStyle}` : ``,
    ``,
    `ORIENTATION RULES — this is ${land ? "16:9 landscape" : "9:16 vertical"}.`,
    land
      ? `Landscape: use the horizontal axis. Split-screen, side-by-side media + copy, wide rules, columns of 2-3. Headlines can run 3-6 words per line.`
      : `Vertical: stack everything. NEVER put two columns side by side — they end up ~40px wide. Big type is the hero: 2-4 words per line, stacked blocks, full-bleed media bands. Reserve the top 12% and bottom 12% (platform chrome).`,
    `Size type in cqw/cqh or % of the frame, never fixed px, so the scene holds at any render size.`,
    ``,
    `ASSETS you may use (exact paths, or none at all):`,
    pool.length ? pool.join("\n") : `  (no assets — author type-and-shape scenes)`,
    ``,
    `SCENES TO AUTHOR (${scenes.length}). Each must be VISUALLY DISTINCT from the others — different layout skeleton, different motion idea, different focal point. Repetition is the exact problem you are solving.`,
    // `i` MUST be the scene's index in the FILM, not in this filtered list — the
    // engine looks scenes up by storyboard index, and numbering them 0..n here
    // made every lookup miss silently (the film rendered the pack's scenes and
    // looked fine, so nothing failed; the authored work was simply discarded).
    JSON.stringify(scenes.map((s, i) => ({
      i: s._idx != null ? s._idx : i, seconds: r(s.duration), purpose: s.purpose || "", headline: s.headline || "",
      subtext: s.subtext || "", bullets: (s.chips || s.bullets || []).slice(0, 4), voiceover: s.voiceover || "",
    })), null, 1),
    ``,
    `HARD CONSTRAINTS — a violation makes the frame blank, and the renderer will reject the scene:`,
    `1. The renderer SEEKS a paused GSAP timeline. Every frame must be a pure function of tl.time(). No requestAnimationFrame, setTimeout, Math.random, or Date.`,
    `2. Hidden state is opacity:0 ONLY. Never display:none or visibility:hidden. Every from-state must live in gsap.fromTo so a backwards seek restores it.`,
    `3. No repeat:-1. Infinite loops render a random phase when seeked. Use a finite repeat count.`,
    `4. Offline render: no http(s) URLs, no @import, no webfonts. Use only the fonts named in the design system with a system fallback stack.`,
    `5. <img> src must be EXACTLY one of the asset paths above. Never invent a path.`,
    `6. Every id you write must start with "sa<index>" (scene 0 -> "sa0title"). Unprefixed ids collide across scenes.`,
    `7. Return html as a FRAGMENT — no <html>, <body>, or <script> tags.`,
    ``,
    `In "s", write GSAP calls against a timeline named tl, using the variables AT (this scene's start time, seconds) and DUR (its length). Example:`,
    `  tl.fromTo("#sa0title",{opacity:0,y:40},{opacity:1,y:0,duration:0.6,ease:"power3.out"},AT+0.1);`,
    `  tl.set("#sa0title",{opacity:0},AT+DUR);`,
    `Always hard-kill your elements at AT+DUR with tl.set(...,{opacity:0}) so the scene does not bleed into the next.`,
    ``,
    `Return STRICT JSON only, no prose, no code fences:`,
    `{"scenes":[{"i":0,"html":"<div id=\\"sa0wrap\\">…</div>","css":"#sa0wrap{…}","s":"tl.fromTo(…)"}]}`,
  ].filter(Boolean).join("\n");
}

// ---- main ----------------------------------------------------------------------
/**
 * Author new scenes for the slots a pack would otherwise have to repeat.
 *
 * ONE call authors the whole set rather than one call per scene: it is cheaper,
 * and it lets the model see the other scenes so it can make them differ from each
 * other, which is the entire point.
 *
 * @returns {Promise<Map<number, {html,css,s}>>} scene index -> authored scene.
 *          Missing entries mean "use the pack's own builder" — this NEVER throws
 *          and never returns a scene that failed the lint.
 */
async function authorScenes({ scenes, theme, dims, assets, framePack, packStyle, abortSignal, tracker }) {
  const out = new Map();
  // Carry each scene's FILM index through the filter, so prompt, lint prefixes and
  // the engine's lookup all agree on one numbering.
  const want = (scenes || []).map((s, i) => (s && s.authorNew ? { ...s, _idx: i } : null)).filter(Boolean);
  if (!want.length) return out;

  const land = dims.width >= dims.height;
  const prompt = buildPrompt({ scenes: want, theme, dims, land, assets, framePack, packStyle });

  let text;
  try {
    const res = await openrouter.chat({
      stage: "composer",                       // heavy creative work -> the premium model
      system: "You are a motion-graphics director who writes production HTML/CSS/GSAP scenes. You return STRICT JSON only — no prose, no code fences.",
      user: prompt,
      jsonMode: true,
      signal: abortSignal,
    });
    text = res && res.text;
    if (tracker && res) tracker.addLLM?.({ stage: "scene_author", ...res });
  } catch (e) {
    console.log(`[scene-author] LLM failed, falling back to pack scenes: ${e.message}`);
    note("scene_author", "author-llm-failed", { severity: "quality", detail: e.message });
    return out;
  }
  if (!text) return out;

  let parsed;
  try {
    const m = /\{[\s\S]*\}/.exec(String(text).replace(/```json|```/g, ""));
    parsed = JSON.parse(m ? m[0] : text);
  } catch (e) {
    console.log(`[scene-author] unparseable response, falling back: ${e.message}`);
    return out;
  }

  let ok = 0, rejected = 0;
  for (const sc of (parsed.scenes || [])) {
    const idx = Number(sc.i);
    if (!isFinite(idx)) continue;
    const errs = lintScene(sc, { assets, index: idx });
    if (errs.length) {
      rejected++;
      console.log(`[scene-author] scene ${idx} REJECTED: ${errs.join("; ")}`);
      note("scene_author", "authored-scene-rejected", { severity: "quality", scene: idx, detail: errs[0] });
      continue;                                 // the pack's own builder covers it
    }
    out.set(idx, { html: String(sc.html), css: String(sc.css || ""), s: String(sc.s || "") });
    ok++;
  }
  console.log(`[scene-author] ${ok} authored, ${rejected} rejected (fell back to pack scenes)`);
  return out;
}

module.exports = { authorScenes, lintScene, buildPrompt };
