// TEMPLATE DIRECTOR agent — the editor's brain for TEMPLATE packs.
//
// A dedicated pack composer (momentum, and any composer that exports
// TEMPLATE_SCENES) ships a CLOSED set of authored scene types: each has its own
// animation, camera move, layout and media slots. The film must stay exactly
// that template — only the CONTENT changes per job. Deciding *which* authored
// scene each storyboard beat becomes, and *what* lands in each of its slots, is
// an editorial judgement: that is this agent.
//
// Two brains, layered:
//
//   1. CASTING (LLM, fail-open) — reads the storyboard + the pack's template
//      vocabulary + the asset inventory and returns, per scene: the template
//      scene type, slot copy shaped to that type's stated limits, and which
//      asset fills its media slot.
//
//   2. BEST-OF (deterministic, ALWAYS runs) — ranks every candidate against
//      every slot and takes the strongest: the best desktop screenshot for a
//      browser frame, the tallest real screen for a phone, the best photos for
//      a gallery, the strongest number for a counter, the best line for a pull
//      quote. It fills whatever casting left empty, replaces any asset that
//      does not fit its slot, and enforces the template's grammar (opener
//      first, CTA last, no media scene without media, no three identical
//      scenes in a row). With the LLM off or failing, this alone produces a
//      complete, template-true plan.
//
// FAIL-OPEN by design (mirrors text_director / art_director): any error returns
// a null plan and the composer falls back to its own deterministic router, so
// this can never block or break a render.

const fs = require("node:fs");
const path = require("node:path");
const config = require("../config");
const db = require("../db");
const openrouter = require("./openrouter");
const { extractFirstJsonObject } = require("./json_lenient");

const SYSTEM = fs.readFileSync(
  path.join(__dirname, "..", "prompts", "system_template_director.md"),
  "utf8"
);

function tdCfg() {
  return config.templateDirector || { enabled: true, model: "google/gemini-3.1-flash-lite" };
}

const clip = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
const STOP = new Set(["the", "and", "for", "with", "your", "our", "you", "that", "this", "from", "are", "was", "its", "into", "all", "any", "how", "why", "what", "who", "when"]);

function words(s) {
  return String(s || "").toLowerCase().match(/[a-z][a-z0-9]{2,}/g) || [];
}
function topicWords(scene, subject) {
  const set = new Set();
  for (const w of words(`${scene.headline || ""} ${scene.subtext || ""} ${subject || ""}`)) {
    if (!STOP.has(w)) set.add(w);
  }
  return set;
}

// ---- asset understanding -----------------------------------------------------

function ratioOf(a) {
  return Number(a && a.ratio) || (a && a.width && a.height ? a.width / a.height : 0);
}
function pixels(a) {
  return (Number(a && a.width) || 0) * (Number(a && a.height) || 0);
}
function isVideoOrVector(a) {
  const p = String((a && a.path) || "");
  return (a && a.type === "video") || /\.(mp4|webm|mov)($|\?)/i.test(p) || /\.svg($|\?)/i.test(p);
}
function isLogoAsset(a) {
  const k = String((a && a.kind) || "").toLowerCase();
  return k === "logo" || /\blogo\b/i.test(String((a && a.alt) || "")) || /logo\.[a-z]+($|\?)/i.test(String((a && a.path) || ""));
}
function isScreenshot(a) {
  const s = String((a && a.source) || "").toLowerCase();
  const k = String((a && a.kind) || "").toLowerCase();
  return s === "website" || s === "screenshot" || k === "screenshot" || /screenshot|peekshot/.test(s);
}

// Usable as a PROMINENT plate — same trust gate the composers and scene-kit use:
// the user's own site/blog captures, curated-library picks, or web stock the
// Creative Director approved. Vectors and videos are excluded (template plates
// are raster).
function plateOk(a) {
  if (!a || !a.path || isVideoOrVector(a)) return false;
  const src = String(a.source || "").toLowerCase();
  return src === "website" || src === "blog" || src === "website-image" || src.startsWith("library")
    || a.visionOk === true || a.cdProminence === "hero" || a.cdProminence === "support";
}

// How well an asset fits a given media slot. Combines slot shape (a wide shot
// in a phone bezel is a crop disaster), provenance (the user's own product beats
// stock), the vision agents' verdicts, resolution, and topic overlap with the
// scene it would appear in. This is the "best thing in the video" ranking.
const SLOT_IDEAL = { desktop: 1.6, phone: 0.52, photo: 1.4, logo: 1.0, any: 1.4 };

function scoreAsset(a, slot, scene, subject) {
  if (!plateOk(a)) return -1;
  const wantLogo = slot === "logo";
  if (wantLogo !== isLogoAsset(a)) return -1; // a logo only in a logo slot, never elsewhere
  let score = 0;

  // Shape fit — how far the asset's aspect is from the slot's ideal (log scale
  // so 2x off is bad, 10% off is nothing).
  const rt = ratioOf(a);
  const ideal = SLOT_IDEAL[slot] || SLOT_IDEAL.any;
  if (rt > 0) {
    const dev = Math.abs(Math.log(rt / ideal));
    score += Math.max(0, 28 - dev * 34);
    if (slot === "phone" && rt >= 0.95) score -= 22; // a landscape shot in a bezel
    if (slot === "desktop" && rt < 0.85) score -= 18; // a tall shot in a browser frame
  }

  // Provenance — the user's own product/site outranks anything fetched.
  const src = String(a.source || "").toLowerCase();
  if (src === "website" || src === "blog") score += 26;
  else if (src === "website-image") score += 20;
  else if (src.startsWith("library")) score += 10;
  // A browser frame is for a real captured SCREEN; a stock photo in one reads as
  // a mistake, so it must lose to any genuine screenshot and usually to no-media.
  if (slot === "desktop") score += isScreenshot(a) ? 14 : -16;
  if (slot === "phone") score += isScreenshot(a) ? 10 : -6;
  if (slot === "photo" && !isScreenshot(a)) score += 8;

  // The vision agents' verdicts (asset_director / creative_director / screenshot_qa).
  if (a.visionOk === true) score += 10;
  if (a.cdProminence === "hero") score += 12;
  else if (a.cdProminence === "support") score += 6;
  score += Math.max(0, Math.min(14, (Number(a.cdScore) || 0) / 7));
  if (a.qaFlagged || a.screenshotQaDrop) score -= 40;

  // Resolution — a 320px thumbnail looks broken filling a 47cqw browser frame.
  const px = pixels(a);
  if (px) score += Math.max(-14, Math.min(12, (Math.log10(px) - 5.2) * 16));

  // Topic overlap with THIS scene: a pricing shot on the pricing scene.
  const topic = topicWords(scene || {}, subject);
  if (topic.size) {
    const alt = new Set(words(`${a.alt || ""} ${a.title || ""} ${a.sourceUrl || ""}`));
    let hits = 0;
    for (const w of alt) if (topic.has(w)) hits++;
    score += Math.min(18, hits * 6);
  }
  // The planner PINNED this asset to this scene — the strongest signal there is.
  if (scene && a.sceneId != null && String(a.sceneId) === String(scene.id)) score += 45;
  return score;
}

// ---- copy mining (best-of for text slots) ------------------------------------

// "240% faster ships" -> { value:240, suffix:"%", label:"FASTER SHIPS" }
// The suffix must not swallow the next word's first letter — see the note in
// template_engine.mineStat ("Free for 12 months" → "FREE FORONTHS" shipped).
function mineStat(str) {
  const s = String(str || "");
  const m = /([$₹€£]?)\s?(\d[\d,]*(?:\.\d+)?)(?:\s?(%|x|k|m|bn?|\+|★)(?![A-Za-z]))?/i.exec(s);
  if (!m) return null;
  const value = parseFloat(m[2].replace(/,/g, ""));
  if (!isFinite(value) || value > 10000000) return null;
  const label = clip(`${s.slice(0, m.index)} ${s.slice(m.index + m[0].length)}`.replace(/[^\w\s.%-]/g, " "), 24);
  return { pre: m[1] || "", v: value, suf: (m[3] || "").toUpperCase(), isFloat: String(m[2]).includes("."), l: label.toUpperCase() };
}

function candidateLines(scene) {
  const out = [];
  if (Array.isArray(scene.onScreenText)) out.push(...scene.onScreenText);
  if (Array.isArray(scene.bullets)) out.push(...scene.bullets);
  if (scene.subtext) out.push(...String(scene.subtext).split(/[.;\n•]|\s—\s/));
  if (scene.emphasis) out.push(scene.emphasis);
  return out.map((l) => clip(l, 120)).filter((l) => l.length > 1);
}

// Strongest numbers in a scene, best first (a percentage/multiplier beats a
// bare count; a labelled number beats an unlabelled one).
function bestStats(scene, limit = 3) {
  const seen = new Set();
  return candidateLines(scene)
    .filter((l) => /\d/.test(l))
    .map(mineStat)
    .filter(Boolean)
    .filter((s) => { const k = `${s.v}${s.suf}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => ((b.suf ? 1 : 0) - (a.suf ? 1 : 0)) || ((b.l ? 1 : 0) - (a.l ? 1 : 0)))
    .slice(0, limit);
}

// ---- plan validation + repair (the template's grammar) -----------------------

function vocabIndex(templateScenes) {
  const byType = new Map();
  for (const t of templateScenes || []) if (t && t.type) byType.set(String(t.type), t);
  return byType;
}

// Fill/repair one scene entry so it is always renderable.
function repairEntry(entry, scene, ctx) {
  const { byType, pool, used, subject } = ctx;
  const spec = byType.get(entry.type) || null;
  if (!spec) return null;
  const slots = entry.slots && typeof entry.slots === "object" ? { ...entry.slots } : {};

  // Media slot: verify the chosen asset is real, unused and actually fits;
  // otherwise take the best remaining candidate for that slot.
  // `mediaMin` = how many media slots MUST be filled for the type to render
  // (a gallery works with one strong tile; a feature without its screenshot is
  // an empty browser frame). Defaults to "all of them".
  const mediaSlots = Array.isArray(spec.media) ? spec.media : (spec.media ? [spec.media] : []);
  const mediaMin = Number.isInteger(spec.mediaMin) ? spec.mediaMin
    : (spec.mediaRequired === false ? 0 : mediaSlots.length);
  const picked = [];
  for (const slot of mediaSlots) {
    let chosen = null;
    const proposed = slot === mediaSlots[0] ? entry.asset : entry.assetB;
    if (proposed && !used.has(proposed) && scoreAsset(proposed, slot, scene, subject) > 0) chosen = proposed;
    if (!chosen) {
      let best = null, bestScore = 0;
      for (const a of pool) {
        if (used.has(a)) continue;
        const sc = scoreAsset(a, slot, scene, subject);
        if (sc > bestScore) { best = a; bestScore = sc; }
      }
      chosen = best;
    }
    if (chosen) { used.add(chosen); picked.push(chosen); }
  }
  if (picked.length < mediaMin) {
    for (const a of picked) used.delete(a); // release what we claimed — this type can't run here
    return null;
  }
  return { type: entry.type, slots, assets: picked, why: clip(entry.why, 60) };
}

// ---- deterministic casting (the always-on fallback brain) --------------------

// Does this vocabulary entry describe the film's opener / closer?
const OPENER = /open|title|brand reveal|hook|intro|first/i;
const CLOSER = /clos|call to action|\bcta\b|final|sign ?off/i;
const isOpener = (spec) => OPENER.test(`${spec.type} ${spec.bestFor || ""}`);
const isCloser = (spec) => CLOSER.test(`${spec.type} ${spec.bestFor || ""}`);

// GENERIC deterministic caster — scores every published scene type against the
// scene using only the vocabulary's own metadata (bestFor prose, slot names,
// media needs). It must stay family-agnostic: a hard-coded list of type names
// silently cast every scene of a differently-named family as its first type.
function deterministicType(scene, i, total, ctx, prevType) {
  const { byType, pool, used, subject } = ctx;
  const k = String(scene.kind || "").toLowerCase();
  const p = String(scene.purpose || "").toLowerCase();
  const text = `${k} ${p} ${scene.headline || ""} ${scene.subtext || ""}`.toLowerCase();
  const sceneWords = new Set(words(text).filter((w) => !STOP.has(w)));
  const bulletCount = candidateLines(scene).filter((l) => l.length <= 60).length;
  const numbers = bestStats(scene, 3).length;
  const hasQuote = !!(scene.quote || k === "quote" || /testimonial/.test(p));
  const bestSlot = (slot) => {
    let best = 0;
    for (const a of pool) { if (used.has(a)) continue; best = Math.max(best, scoreAsset(a, slot, scene, subject)); }
    return best;
  };

  let bestType = null, bestScore = -Infinity;
  for (const [type, spec] of byType) {
    const bf = `${type} ${spec.bestFor || ""} ${spec.look || ""}`.toLowerCase();
    const slots = spec.slots || {};
    let score = 0;

    // Position in the film — an opener mid-film (or a closer at the top) is wrong
    // however well its content matches.
    if (i === 0) score += isOpener(spec) ? 70 : -30;
    else if (i === total - 1) score += isCloser(spec) ? 70 : -30;
    else score += (isOpener(spec) ? -45 : 0) + (isCloser(spec) ? -45 : 0);
    if (i > 0 && i < total - 1 && (k === "cta" || p === "cta") && isCloser(spec)) score += 60;

    // Content the type is built to carry.
    if ("stats" in slots) score += numbers >= 1 ? 34 + numbers * 6 : -34;
    if ("quote" in slots) score += hasQuote ? 52 : -34;
    // An `items` slot IS a list scene — a scene carrying real points belongs
    // there ahead of a media type that merely has a photo spare. `lines` (short
    // stacked display words) is a much weaker signal for the same content.
    if ("items" in slots) score += bulletCount >= 3 ? 40 : (bulletCount === 2 ? 28 : -8);
    if ("lines" in slots) score += bulletCount >= 2 ? 8 : 0;
    if ("chips" in slots && bulletCount >= 2) score += 10;

    // Media: a type with a media slot is only viable with an asset that fits it.
    const media = Array.isArray(spec.media) ? spec.media : (spec.media ? [spec.media] : []);
    const min = Number.isInteger(spec.mediaMin) ? spec.mediaMin : (spec.mediaRequired === false ? 0 : media.length);
    if (media.length) {
      const scores = media.map(bestSlot);
      const viable = scores.filter((s) => s > 30).length;
      if (viable < min) score -= 90;
      else score += 18 + Math.min(20, (scores[0] - 30) * 0.5);
    }

    // Vocabulary prose vs the scene's own words. Matching must be word-bounded:
    // a substring test let purpose "how" match "showcase" and hand a photo-grid
    // scene type a bonus that belonged to the list scene.
    const bfWords = new Set(words(bf));
    let hits = 0;
    for (const w of bfWords) if (sceneWords.has(w)) hits++;
    score += Math.min(26, hits * 7);
    if (k && bfWords.has(k)) score += 14;
    if (p && bfWords.has(p)) score += 16;

    // Variety — the family's grammar should not stutter.
    if (type === prevType) score -= 26;

    if (score > bestScore) { bestScore = score; bestType = type; }
  }
  return bestType || byType.keys().next().value || null;
}

// ---- LLM casting -------------------------------------------------------------

function buildUser({ storyboard, scenes, templateScenes, inventory, subject }) {
  return [
    `FILM: "${clip(storyboard.title, 80)}" — ${storyboard.durationSec || "?"}s, ${scenes.length} scenes. Subject: ${clip(subject, 120) || "unknown"}.`,
    "",
    "TEMPLATE SCENE TYPES (the closed set — cast every scene as one of these):",
    JSON.stringify(templateScenes),
    "",
    "ASSET INVENTORY (reference an asset by its index; null = no asset):",
    JSON.stringify(inventory),
    "",
    "STORYBOARD SCENES (their text is the ONLY source of facts):",
    JSON.stringify(scenes),
    "",
    `Return JSON: {"scenes":{"<sceneId>":{"type":"...","slots":{...},"asset":<index|null>,"assetB":<index|null>,"why":"..."}}}. Every scene id, only listed types, only that type's slots, only assets that truly fit the slot. JSON only.`,
  ].join("\n");
}

async function castWithLlm({ storyboard, scenes, templateScenes, inventory, subject, tracker, signal }) {
  const { text, tokensIn, tokensOut, costUsd } = await openrouter.chat({
    system: SYSTEM,
    user: buildUser({ storyboard, scenes, templateScenes, inventory, subject }),
    jsonMode: true,
    stage: "template_director",
    model: tdCfg().model,
    temperature: 0.25,
    signal,
  });
  if (tracker) tracker.addLlm({ inputTokens: tokensIn, outputTokens: tokensOut, stage: "template_director", costUsd: costUsd });
  const raw = extractFirstJsonObject(text);
  return raw && raw.scenes && typeof raw.scenes === "object" ? raw.scenes : {};
}

// ---------------------------------------------------------------- main
// Returns { plan, report }. plan.byScene["<sceneId>"] = { type, slots, assets[], why }
// or plan = null when the pack has no template vocabulary (nothing to direct).
async function directTemplate({ jobId, storyboard, assets, framePack, templateScenes, subject, tracker, signal } = {}) {
  const sb = storyboard || {};
  const scenes = Array.isArray(sb.scenes) ? sb.scenes : [];
  if (!scenes.length || !Array.isArray(templateScenes) || !templateScenes.length) {
    return { plan: null, report: null };
  }
  const byType = vocabIndex(templateScenes);
  const pool = (Array.isArray(assets) ? assets : []).filter(plateOk);
  const used = new Set();
  const ctx = { byType, pool, used, subject };

  // Compact scene + inventory views for the model.
  const sceneView = scenes.map((s, i) => ({
    id: s.id != null ? String(s.id) : `s${i + 1}`,
    kind: s.kind, purpose: s.purpose,
    headline: clip(s.headline, 120),
    subtext: clip(s.subtext, 160) || undefined,
    bullets: (s.bullets || s.onScreenText || []).filter(Boolean).map((b) => clip(b, 60)).slice(0, 4),
    quote: clip(s.quote, 160) || undefined,
    voiceover: clip(s.voiceover, 180) || undefined,
  }));
  const inventory = pool.map((a, i) => ({
    i,
    kind: isLogoAsset(a) ? "logo" : (isScreenshot(a) ? "screenshot" : "photo"),
    shape: ratioOf(a) >= 1.2 ? "wide" : (ratioOf(a) && ratioOf(a) < 0.9 ? "tall" : "square"),
    source: clip(a.source, 20),
    alt: clip(a.alt, 90),
    pinnedToScene: a.sceneId != null ? String(a.sceneId) : undefined,
  }));

  let llmCast = {};
  let source = "deterministic";
  if (tdCfg().enabled && scenes.length > 1) {
    try {
      llmCast = await castWithLlm({ storyboard: sb, scenes: sceneView, templateScenes, inventory, subject, tracker, signal });
      source = "llm";
    } catch (e) {
      console.warn(`[template_director] LLM casting failed (${String((e && e.message) || e).slice(0, 140)}) — deterministic casting`);
    }
  }

  // Resolve the cast scene by scene, repairing anything unrenderable. Assets are
  // claimed in order, so an earlier scene never steals a later scene's pin: pinned
  // scenes are resolved FIRST.
  const order = scenes
    .map((s, i) => ({ s, i }))
    .sort((a, b) => {
      const pin = (x) => pool.some((p) => p.sceneId != null && String(p.sceneId) === String(x.s.id)) ? 0 : 1;
      return pin(a) - pin(b) || a.i - b.i;
    });

  const byScene = {};
  let llmUsed = 0, repaired = 0, invented = 0;
  for (const { s, i } of order) {
    const sid = s.id != null ? String(s.id) : `s${i + 1}`;
    const cast = llmCast[sid] || llmCast[`s${i + 1}`] || null;
    let entry = null;
    if (cast && byType.has(String(cast.type))) {
      const asset = Number.isInteger(cast.asset) ? pool[cast.asset] : null;
      const assetB = Number.isInteger(cast.assetB) ? pool[cast.assetB] : null;
      entry = repairEntry({ type: String(cast.type), slots: cast.slots, asset, assetB, why: cast.why }, s, ctx);
      if (entry) llmUsed++;
    }
    if (!entry) {
      const prevId = i > 0 ? (scenes[i - 1].id != null ? String(scenes[i - 1].id) : `s${i}`) : null;
      const prevType = prevId && byScene[prevId] ? byScene[prevId].type : null;
      const type = deterministicType(s, i, scenes.length, ctx, prevType);
      if (type) entry = repairEntry({ type, slots: {}, why: "deterministic" }, s, ctx);
      // Media type unrenderable (no asset left) → the best media-free type.
      if (!entry) {
        for (const t of ["statement", "stats", "quote", "cta", "intro"]) {
          if (!byType.has(t)) continue;
          entry = repairEntry({ type: t, slots: {}, why: "no media available" }, s, ctx);
          if (entry) break;
        }
      }
      if (entry) repaired++;
    }
    if (entry) byScene[sid] = entry;
  }

  // Template grammar: opener first, closer last, and never three identical
  // scenes in a row (variety is part of the template, not decoration).
  // Opener/closer are identified from the vocabulary's own prose, never by type
  // name — family grammars name their scenes whatever they like.
  const ids = scenes.map((s, i) => (s.id != null ? String(s.id) : `s${i + 1}`));
  const typeWhere = (pred) => [...byType.entries()].find(([, spec]) => pred(spec));
  if (scenes.length > 2) {
    const opener = typeWhere(isOpener), closer = typeWhere(isCloser);
    if (opener && byScene[ids[0]] && !isOpener(byType.get(byScene[ids[0]].type))) {
      const fixed = repairEntry({ type: opener[0], slots: byScene[ids[0]].slots, why: "template opener" }, scenes[0], ctx);
      if (fixed) byScene[ids[0]] = fixed;
    }
    const lastId = ids[ids.length - 1];
    if (closer && byScene[lastId] && !isCloser(byType.get(byScene[lastId].type))) {
      const fixed = repairEntry({ type: closer[0], slots: byScene[lastId].slots, why: "template closer" }, scenes[scenes.length - 1], ctx);
      if (fixed) byScene[lastId] = fixed;
    }
  }
  // No three identical scenes running — swap the third for the best alternative
  // the vocabulary offers that is neither an opener nor a closer.
  const middleTypes = [...byType.entries()].filter(([, s]) => !isOpener(s) && !isCloser(s)).map(([t]) => t);
  for (let i = 2; i < ids.length; i++) {
    const a = byScene[ids[i - 2]], b = byScene[ids[i - 1]], c = byScene[ids[i]];
    if (!a || !b || !c || a.type !== b.type || b.type !== c.type) continue;
    for (const alt of middleTypes) {
      if (alt === c.type) continue;
      const swap = repairEntry({ type: alt, slots: {}, why: "variety" }, scenes[i], ctx);
      if (swap) { byScene[ids[i]] = swap; break; }
    }
  }

  // FACT GUARD — a casting model will occasionally "improve" a number ("4.9 stars
  // from 10k reviews" cast as a 10/10 badge). Numbers are claims: every numeric
  // slot value must trace back to that scene's own words, or it is replaced with
  // a mined one / dropped. Authored LABELS (eyebrow, kicker) are fine — they
  // assert nothing.
  const numbersOf = (s) => new Set((String(s).match(/\d+(?:\.\d+)?/g) || []).map((n) => String(parseFloat(n))));
  for (let i = 0; i < scenes.length; i++) {
    const entry = byScene[ids[i]];
    if (!entry) continue;
    const source = numbersOf([scenes[i].headline, scenes[i].subtext, scenes[i].emphasis, scenes[i].quote,
      ...(scenes[i].bullets || []), ...(scenes[i].onScreenText || [])].join(" "));
    const sourced = (v) => [...numbersOf(v)].every((n) => source.has(n));
    if (Array.isArray(entry.slots.stats)) {
      const kept = entry.slots.stats.filter((st) => st && source.has(String(parseFloat(st.v))));
      if (kept.length !== entry.slots.stats.length) {
        const mined = bestStats(scenes[i], 3);
        entry.slots.stats = kept.length ? kept : mined;
        if (!entry.slots.stats.length) delete entry.slots.stats;
        invented++;
      }
    }
    for (const key of ["badge", "headline", "body", "tagline", "cta", "badgeLabel"]) {
      const v = entry.slots[key];
      if (v == null || !/\d/.test(String(v)) || sourced(v)) continue;
      delete entry.slots[key]; // the composer falls back to the scene's real copy
      invented++;
    }
  }

  // Best-of text: fill counter/quote slots the cast left empty, from the scene's
  // own words — never invented.
  for (let i = 0; i < scenes.length; i++) {
    const entry = byScene[ids[i]];
    if (!entry) continue;
    const scene = scenes[i];
    if (entry.type === "stats" && !Array.isArray(entry.slots.stats)) {
      const stats = bestStats(scene, 3);
      if (stats.length) entry.slots.stats = stats;
    }
    if (entry.type === "quote" && !clip(entry.slots.quote, 1)) {
      const q = clip(scene.quote || scene.subtext || scene.headline, 140);
      if (q) entry.slots.quote = q;
    }
  }

  const typeCounts = {};
  for (const id of Object.keys(byScene)) typeCounts[byScene[id].type] = (typeCounts[byScene[id].type] || 0) + 1;
  const withMedia = Object.values(byScene).filter((e) => e.assets && e.assets.length).length;
  const report = {
    source, framePack: framePack || null,
    scenes: Object.keys(byScene).length,
    llmCast: llmUsed, deterministic: repaired, unsourcedNumbers: invented,
    withMedia, assetsUsed: used.size, assetPool: pool.length,
    types: typeCounts,
    cast: Object.entries(byScene).map(([id, e]) => ({ id, type: e.type, media: (e.assets || []).length, why: e.why })),
  };
  if (jobId) { try { db.setTemplateReview(jobId, report); } catch { /* best effort */ } }
  console.log(`[template_director] job ${jobId || "?"}: ${framePack || "?"} cast ${report.scenes} scene(s) — ${llmUsed} llm / ${repaired} deterministic, ${withMedia} with media (${used.size}/${pool.length} assets)${invented ? `, ${invented} unsourced number(s) dropped` : ""}, types: ${Object.entries(typeCounts).map(([t, n]) => `${t}×${n}`).join(" ")}`);
  return { plan: { byScene, source }, report };
}

module.exports = { directTemplate, scoreAsset, bestStats, plateOk };
