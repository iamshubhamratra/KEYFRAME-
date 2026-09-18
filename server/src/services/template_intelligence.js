// TEMPLATE INTELLIGENCE — the layer that decides WHICH template an "auto" film
// gets, and can explain why.
//
// THE PROBLEM IT REPLACES. Auto used to be one LLM guess: all installed packs
// dumped into the brief prompt as {name, vibe} with a tone table, and three
// deterministic post-passes that could each overrule it — a hash-of-the-prompt
// pick when the suggestion did not resolve, a cross-family rotation that swapped
// a good match out purely for variety, and a media-capacity swap that picked
// hash(jobId) from a "rich" tier. None of them looked at ORIENTATION, and 178 of
// the 285 installed packs are portrait-native while omelette_adapter composes at
// the TEMPLATE's native canvas — so an auto 16:9 job could, and did, ship a
// 1080x1920 file. None looked at DURATION either, so a 45-beat five-minute film
// was a legal answer for a 15-second clip.
//
// THE SHAPE OF THE FIX. Three stages, in this order, and the order is the point:
//
//   1. HARD FILTER (this module, deterministic). Orientation is absolute.
//      Duration feasibility is absolute. Capability is absolute. Nothing
//      downstream can undo these, so a wrong-shaped film is unreachable rather
//      than unlikely.
//   2. SCORE + RANK (this module, deterministic). A weighted model over signals
//      extracted from the prompt/brief and a profile derived from each pack's
//      own manifest. Always produces an answer, with reasons.
//   3. SEMANTIC CHOICE (brief.js, the LLM that already runs). The top candidates
//      — a dozen, richly described — are handed to the brief model, which reads
//      the prompt's intent the way a table of keywords cannot. Its answer is
//      accepted ONLY if it is one of them; otherwise the top-scored candidate
//      stands. The model can refine the ranking; it can never leave the set of
//      templates that provably fit.
//
// So the LLM contributes judgement and the code contributes guarantees. There is
// no path to a random pick: `select()` with no signal at all still returns the
// highest-scoring compatible pack.
//
// METADATA WITHOUT A MIGRATION. Every field the matcher needs is DERIVED from
// what frames/<pack>/pack.json already holds (orientation from portraitNative,
// pacing from the authored beat length, density from the measured media
// capacity, style from the palette and fonts, topic from the vibe + keywords),
// so all 285 packs are matchable today with no hand-authoring. A pack that wants
// to state its own intent adds an `intent` block to its manifest and that wins,
// field by field — which is also how a generated template declares itself.

const fs = require("node:fs");
const path = require("node:path");
const frameRegistry = require("./frame_registry");
const frameManifest = require("./frame_manifest");
const lex = require("./template_lexicon");

// ---------------------------------------------------------------- constants

// The engine's own hard scene ceiling (pipeline.sceneCapFor / omelette
// ENGINE_MAX_SCENES). Past cap x authoredPace a template cannot cover a runtime
// without stretching every beat, which is what made long films read as sluggish.
const ENGINE_MAX_SCENES = 50;

// A pack that declares `longForm` is authored as a 2-5 minute film (40-50 beats).
// Cast onto a short clip it keeps three of them and is no longer that template,
// so short jobs do not see long-form packs at all. Set at 90s: below it a
// long-form film has lost more than two thirds of its authored beats.
const LONGFORM_MIN_SEC = 90;

// How close two candidates must be before variety is allowed to reorder them.
// Wider than any diversity penalty below, so a clear winner can never be
// displaced — variety only breaks near-ties.
const DIVERSITY_BAND = 6;

// Beat length when a pack states none anywhere. The median across the installed
// library; only reached by a pack with no manifest hints at all.
const DEFAULT_BEAT_SEC = 3.3;
const DEFAULT_LONGFORM_BEAT_SEC = 7.0;

// ---------------------------------------------------------------- capacity

// Measured per-pack rendered media capacity (server/framecheck/media-capacity.json,
// written by `npm run audit:capacity`): how many images a pack ACTUALLY paints
// when handed a full asset pool. Missing file -> empty map, and every consumer
// below degrades to "unknown", never to a wrong answer.
let _capacity = null;
function mediaCapacity() {
  if (_capacity) return _capacity;
  try {
    const p = path.join(__dirname, "..", "..", "framecheck", "media-capacity.json");
    _capacity = JSON.parse(fs.readFileSync(p, "utf8")).packs || {};
  } catch { _capacity = {}; }
  return _capacity;
}

// ---------------------------------------------------------------- profile

// "(15 authored beats, 44.6s as shipped)" and
// "45 authored beats, ~6.7s each, 5:02 as shipped" — the two forms the pack
// importer writes into `vibe`. Parsed rather than re-derived because it is the
// template's OWN authored pace, which is exactly what the duration model needs
// and what reading 199 template bundles at boot would cost real time to learn.
const RE_BEATS = /(\d{1,3})\s+authored\s+beats/i;
const RE_EACH = /~?\s*([\d.]+)\s*s\s+each/i;
const RE_SHIPPED_SEC = /([\d.]+)\s*s\s+as\s+shipped/i;
const RE_SHIPPED_MMSS = /(\d{1,2}):(\d{2})\s+as\s+shipped/i;
const RE_LOOSE_SEC = /,\s*([\d.]{2,6})\s*s\b/i;

function readAuthoredForm(manifest) {
  const vibe = String((manifest && manifest.vibe) || "");
  const beats = Number((RE_BEATS.exec(vibe) || [])[1]) || null;
  let seconds = null;
  const mm = RE_SHIPPED_MMSS.exec(vibe);
  if (mm) seconds = Number(mm[1]) * 60 + Number(mm[2]);
  else {
    const ss = RE_SHIPPED_SEC.exec(vibe) || RE_LOOSE_SEC.exec(vibe);
    if (ss) seconds = Number(ss[1]);
  }
  let beatSec = Number((RE_EACH.exec(vibe) || [])[1]) || null;
  if (!beatSec && beats && seconds) beatSec = seconds / beats;
  return { beats, seconds, beatSec };
}

// Relative luminance of #RRGGBB, 0..1. Used to classify a pack's ground as light
// or dark without anyone hand-labelling 285 palettes.
function luminance(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ""));
  if (!m) return null;
  const [r, g, b] = m.slice(1).map((h) => parseInt(h, 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

const SERIF_FONTS = /(serif|bodoni|didone|garamond|fraunces|playfair|lora|merriweather|libre baskerville|crimson|spectral|source serif|dm serif|eb garamond|cormorant|newsreader|petrona|literata|rye|abril)/i;
const MONO_FONTS = /(mono|code|courier|consolas|inconsolata|space mono|ibm plex mono|jetbrains)/i;
const HAND_FONTS = /(caveat|patrick|indie|shadows into|permanent marker|gloria|kalam|architects|handlee|rock salt|amatic)/i;

// Structural style labels a palette + font set imply, folded in alongside the
// lexical ones so a pack that never says "dark" in prose is still known to be dark.
function structuralStyle(manifest) {
  const visual = new Set();
  const typography = new Set();
  const surface = manifest.surface || {};
  const ground = surface.ground || (manifest.colors && manifest.colors.ground);
  const lum = luminance(ground);
  if (lum != null) visual.add(lum < 0.22 ? "dark" : lum > 0.62 ? "light" : "muted");
  if (surface.flat) visual.add("textured"); // flat packs are print/poster grounds, not glassy
  else visual.add("glassy");                // gradient/glow grounds read as glass + bloom
  const accents = (manifest.skin && manifest.skin.accents) || [];
  const vivid = accents.some((h) => {
    const l = luminance(h);
    return l != null && l > 0.25 && l < 0.8;
  });
  if (vivid && accents.length >= 2) visual.add("vivid");
  if (accents.length <= 1) visual.add("monochrome");

  const fonts = (manifest.fonts || []).join(" ");
  const display = (manifest.typography && manifest.typography.display) || (manifest.fonts || [])[0] || "";
  if (SERIF_FONTS.test(fonts)) typography.add("serif");
  if (MONO_FONTS.test(fonts)) typography.add("mono");
  if (HAND_FONTS.test(fonts)) typography.add("handwritten");
  if (!SERIF_FONTS.test(display) && !MONO_FONTS.test(display) && display) typography.add("sans");
  const tfx = manifest.textfx || {};
  if (tfx.case === "upper" || (tfx.weight && tfx.weight >= 800) || (tfx.sizeScale || 1) > 1.05) typography.add("display");
  return { visual, typography };
}

// Motion labels the pack's own cut/entrance/FX tokens imply.
const CUT_ANIM = {
  whip: "kinetic", zap: "kinetic", cut: "kinetic", flux: "kinetic", stomp: "kinetic",
  zoom: "camera", glide: "camera", push: "camera", dolly: "camera", pan: "camera",
  glow: "particle", shimmer: "particle", bloom: "particle",
  panel: "restrained", fade: "restrained", soft: "restrained", shutter: "restrained",
  glitch: "glitch", scan: "glitch",
};
const ENTER_ANIM = {
  glitch: "glitch", typewriter: "kinetic", "char-pop": "kinetic", zap: "kinetic", pop: "kinetic",
  "mask-reveal": "camera", "line-wipe": "camera", slide: "camera", drift: "restrained",
  "blur-up": "restrained", rise: "restrained", fade: "restrained", reveal: "restrained",
};
function structuralAnimation(manifest) {
  const out = new Set();
  const cut = String((manifest.motion && manifest.motion.cut) || "");
  const enter = String((manifest.textfx && manifest.textfx.enter) || "");
  if (CUT_ANIM[cut]) out.add(CUT_ANIM[cut]);
  if (ENTER_ANIM[enter]) out.add(ENTER_ANIM[enter]);
  const fx = manifest.fx || {};
  if (fx.three) out.add("dimensional");
  if (/sprinkle|bokeh|dust|snow|spark|grain|confetti/i.test(String(fx.canvas || ""))) out.add("particle");
  if (/clay|paper|ink|sketch/i.test(String(fx.canvas || ""))) out.add("drawn");
  if ((manifest.motion && Number(manifest.motion.drift) >= 1.06)) out.add("camera");
  return out;
}

// A pack's own name carries real topical signal ("bull-run", "chalk-talk",
// "abyss-dive") and it is the one field that exists for every pack ever added.
function nameWords(name) {
  return String(name || "").replace(/[-_]+/g, " ");
}

/**
 * The machine-readable profile of one template. Derived from its manifest; any
 * field the manifest's optional `intent` block states wins over the derivation.
 *
 * Cached per pack and invalidated the same way frame_manifest caches — by the
 * manifest object identity, which that loader re-derives on mtime change.
 */
const _profiles = new Map();
function profileOf(name) {
  const manifest = frameManifest.getManifest(name);
  const hit = _profiles.get(name);
  if (hit && hit.manifest === manifest) return hit.profile;
  const profile = buildProfile(name, manifest);
  _profiles.set(name, { manifest, profile });
  return profile;
}

function buildProfile(name, manifest) {
  const m = manifest || {};
  const authored = (m.intent && typeof m.intent === "object") ? m.intent : {};

  // ---- orientation (HARD). portraitNative is authored per pack and agrees with
  // every rendered poster in the library, so it is the trustworthy source.
  const orientation = authored.orientation
    || (m.portraitNative === true ? "9:16" : "16:9");

  // ---- duration. The template's authored form, then the range it still reads
  // as itself over.
  const form = readAuthoredForm(m);
  const cap = mediaCapacity()[name] || null;
  const longForm = authored.longForm != null ? !!authored.longForm : !!m.longForm;
  const beats = Number(authored.beats) || form.beats || (cap && cap.beats) || (longForm ? 42 : 9);
  const beatSec = Number(authored.beatSec) || form.beatSec
    || (longForm ? DEFAULT_LONGFORM_BEAT_SEC : DEFAULT_BEAT_SEC);
  const nativeSec = Number(authored.nativeSec) || form.seconds || Math.round(beats * beatSec);
  // Past ENGINE_MAX_SCENES x the authored pace the engine cannot hold enough
  // beats and every one of them stretches — pipeline.js says so in its own
  // warning. That is the honest ceiling, not a guess.
  const maxSec = Number(authored.maxSec) || Math.round(ENGINE_MAX_SCENES * beatSec);
  const minSec = Number(authored.minSec) || (longForm ? LONGFORM_MIN_SEC : Math.max(5, Math.round(3 * beatSec)));

  // ---- text projection, SPLIT BY AXIS.
  //
  // One blob per pack does not work: a font called "Space Grotesk" put the
  // flagship product-launch pack in the `science` industry, and a cut token
  // called "whip" is not a topic. So each axis reads only the fields that can
  // legitimately carry it — topic from the pack's name, blurb and asset
  // keywords; feel from the blurb and its sonic character; look from the palette
  // and the fonts; motion from the cut/entrance/FX tokens.
  //
  // FRAME.md's own `description` is folded in where it differs from the manifest
  // blurb: for the 49 hand-authored core packs it is materially richer (it is
  // where "a handcrafted product-launch film" lives), while for the imported
  // packs it is the same sentence and adds nothing.
  const desc = (() => {
    try {
      const d = frameRegistry.getPackVibe(name);
      return d && d.slice(0, 60) !== String(m.vibe || "").slice(0, 60) ? d : "";
    } catch { return ""; }
  })();
  const slug = nameWords(name);
  const blurb = `${m.vibe || ""} ${desc}`;
  const topicText = [slug, slug, blurb, ((m.assets && m.assets.keywords) || []).join(" "), (m.assets && m.assets.photoMod) || ""].join(" ");
  const feelText = [blurb, (m.assets && m.assets.photoMod) || "",
    (m.audio && m.audio.music && m.audio.music.mood) || "",
    (m.audio && m.audio.sfx && m.audio.sfx.style) || ""].join(" ");
  const lookText = [blurb, (m.fonts || []).join(" "),
    (m.typography && m.typography.display) || "", (m.typography && m.typography.body) || ""].join(" ");
  const motionText = [blurb, (m.motion && m.motion.cut) || "", (m.textfx && m.textfx.enter) || "",
    (m.fx && m.fx.canvas) || "", (m.fx && m.fx.three) || ""].join(" ");

  const topicP = lex.profileText(topicText);
  const lexical = {
    contentTypes: topicP.contentTypes,
    industries: topicP.industries,
    tokens: topicP.tokens,
    vibes: lex.labelsFor(feelText, "vibes"),
    tones: lex.labelsFor(feelText, "tones"),
    visualStyles: lex.labelsFor(lookText, "visualStyles"),
    typographyStyles: lex.labelsFor(lookText, "typographyStyles"),
    animationStyles: lex.labelsFor(motionText, "animationStyles"),
  };
  const struct = structuralStyle(m);
  const anim = structuralAnimation(m);

  const mergeAuthored = (derivedMap, authoredList) => {
    const out = new Set(derivedMap.keys ? derivedMap.keys() : derivedMap);
    for (const v of authoredList || []) out.add(String(v));
    return out;
  };

  // ---- density + assets. The MEASURED capacity outranks anything declared:
  // it is what the pack actually paints when handed a full pool.
  const images = cap ? Number(cap.images) || 0 : null;
  const density = authored.density
    || (images == null ? "balanced" : images >= 8 ? "media-first" : images <= 2 ? "text-first" : "balanced");
  const preferredAssetTypes = authored.preferredAssetTypes || (m.assets && m.assets.prefer) || [];

  // ---- pacing. The authored beat length IS the cut rate, so the modes a
  // template sits comfortably in fall straight out of it.
  const pacingCompatibility = authored.pacingCompatibility || pacingBandsFor(beatSec);

  // ---- quality. Manifest completeness + whether the pack has been measured.
  // A tie-breaker only (4 of 100), never a reason to pick a wrong-topic pack.
  const qualityScore = Number(authored.qualityScore) || completeness(m, cap);

  return {
    templateId: name,
    name: (m.name || name),
    orientation,
    portrait: orientation === "9:16",
    renderer: m.renderer || null,
    longForm,
    beats,
    beatSec: Math.round(beatSec * 100) / 100,
    supportedDurations: { nativeSec, minSec, maxSec },
    contentTypes: mergeAuthored(lexical.contentTypes, authored.contentTypes),
    categories: mergeAuthored(lexical.contentTypes, authored.categories),
    industries: mergeAuthored(lexical.industries, authored.industries),
    vibes: mergeAuthored(lexical.vibes, authored.vibes),
    tones: mergeAuthored(lexical.tones, authored.tones),
    visualStyle: mergeAuthored(new Set([...struct.visual, ...lexical.visualStyles.keys()]), authored.visualStyle),
    typographyStyle: mergeAuthored(new Set([...struct.typography, ...lexical.typographyStyles.keys()]), authored.typographyStyle),
    animationStyle: mergeAuthored(new Set([...anim, ...lexical.animationStyles.keys()]), authored.animationStyle),
    // Raw topical tokens — the literal subject words ("rodeo", "jellyfish",
    // "chalk"). The lexicon cannot enumerate every subject on earth; this is how
    // a pack about bull riding is found by a prompt about bull riding.
    topicTokens: new Set(lexical.tokens.uni),
    assetRequirements: { images, mediaBeats: cap ? cap.mediaBeats : null, measured: !!cap },
    preferredAssetTypes,
    density,
    pacingCompatibility,
    colorAdaptability: authored.colorAdaptability != null ? !!authored.colorAdaptability : brandAdaptive(name, m),
    featureSupport: {
      vectors: frameManifest.packAcceptsVectors(name),
      longFormOk: authored.longFormOk != null ? !!authored.longFormOk : !!m.longFormOk,
      // Whether the film past LONGFORM_RENDERER_SEC is still drawn by THIS
      // template rather than rerouted to the scene-kit wearing its colours.
      rendererLongFormOk: rendererLongFormOk(name, m),
    },
    qualityScore,
    vibeText: String(m.vibe || "").replace(/\s+/g, " ").trim(),
  };
}

// Which pace modes a template sits comfortably in, from its authored beat
// length. services/pacing.js multiplies the cut rate, so a template authored at
// 7.5s a beat can be pushed fast but never reads as a very-fast film, and one
// authored at 2s a beat cannot be slowed into a relaxed one.
function pacingBandsFor(beatSec) {
  const out = new Set(["normal"]);
  if (beatSec >= 3.2) out.add("relaxed");
  if (beatSec <= 6.5) out.add("fast");
  if (beatSec <= 4.2) out.add("very-fast");
  return out;
}

// Does this pack's renderer actually recolour to a brand palette? Detected the
// same way pipeline.js reports a dropped brand skin — by whether the composer's
// buildComposition names the parameter. Lazy + cached: requiring pipeline.js at
// module load would be a cycle (pipeline -> brief -> here).
const _brandAdaptive = new Map();
function brandAdaptive(name, manifest) {
  if (_brandAdaptive.has(name)) return _brandAdaptive.get(name);
  let ok = true; // scene-kit (the default composer) is fully brand-adaptive
  try {
    const { PACK_RENDERERS } = require("./pipeline");
    const R = PACK_RENDERERS[manifest && manifest.renderer];
    if (R && R.composer) ok = /\bbrandSkin\b/.test(String(R.composer.buildComposition || ""));
  } catch { /* unknown -> assume adaptive, which is the historical behaviour */ }
  _brandAdaptive.set(name, ok);
  return ok;
}

// WILL THE FILM ACTUALLY BE RENDERED BY THIS TEMPLATE PAST ~75s?
//
// pipeline.attemptLlmComposition reroutes a pack whose renderer is not
// long-form-capable to the scene-kit past LONGFORM_RENDERER_SEC — the sparse
// GSAP composers draw a handful of plates and leave the rest of a long film as
// background. The result still carries the pack's colours, but it is NOT that
// template, so selecting one for a 90s auto film hands the user a design system
// where they were promised a design. Three of the installed packs are in this
// state today; on an explicit pin the reroute stays exactly as it is.
const LONGFORM_RENDERER_SEC_DEFAULT = 75;
let _longformSec = null;
function longformRendererSec() {
  if (_longformSec != null) return _longformSec;
  try { _longformSec = require("./pipeline").LONGFORM_RENDERER_SEC || LONGFORM_RENDERER_SEC_DEFAULT; }
  catch { _longformSec = LONGFORM_RENDERER_SEC_DEFAULT; }
  return _longformSec;
}
const _rendererLongForm = new Map();
function rendererLongFormOk(name, manifest) {
  if (_rendererLongForm.has(name)) return _rendererLongForm.get(name);
  let ok = true; // scene-kit fills any length; an unknown renderer keeps that assumption
  try {
    const { PACK_RENDERERS } = require("./pipeline");
    const R = PACK_RENDERERS[manifest && manifest.renderer];
    // The pack's own manifest outranks the renderer default — same precedence
    // pipeline.js applies, so the two cannot disagree about the same film.
    if (R) ok = !!R.longFormOk || !!(manifest && manifest.longFormOk);
  } catch { /* unknown -> assume capable */ }
  _rendererLongForm.set(name, ok);
  return ok;
}

// 0..1 manifest completeness. Every field here is one a renderer reads, so a
// pack scoring low genuinely has less identity to render, not just less prose.
function completeness(m, cap) {
  const checks = [
    Object.keys(m.colors || {}).length >= 3,
    (m.fonts || []).length >= 1,
    !!(m.typography && m.typography.display),
    !!(m.surface && m.surface.ground),
    !!(m.motion && m.motion.cut),
    !!(m.textfx && m.textfx.enter),
    ((m.skin && m.skin.accents) || []).length >= 1,
    ((m.assets && m.assets.keywords) || []).length >= 3,
    !!(m.audio && m.audio.music && m.audio.music.query),
    !!(m.layout && Object.keys(m.layout).length),
    !!cap,
  ];
  return checks.filter(Boolean).length / checks.length;
}

// ---------------------------------------------------------------- corpus / IDF

// HOW RARE IS THIS LABEL IN THE LIBRARY?
//
// Raw label overlap treats "cinematic" and "brutalist" as equally informative.
// Measured across the installed packs they are not remotely equal: `cinematic`
// describes 48% of the library and `corporate` 4%. A prompt matching the first
// has learned almost nothing; matching the second has found its shelf. So every
// overlap below is weighted by inverse document frequency — the standard fix,
// and the one that keeps working as the library grows, because it is measured
// from the library rather than tuned against it.
//
// Recomputed whenever the installed pack COUNT changes, which covers publish and
// unpublish; a pack edited in place keeps its slot, and one blurb moving a
// frequency by 1/285 cannot change a ranking.
const IDF_AXES = ["contentTypes", "industries", "vibes", "tones", "visualStyle", "typographyStyle", "animationStyle"];
// The profile field a signal axis is scored against (signals use the plural
// lexicon names, profiles use the singular manifest-ish names).
const SIGNAL_TO_PROFILE = {
  contentTypes: "contentTypes", industries: "industries", vibes: "vibes", tones: "tones",
  visualStyles: "visualStyle", typographyStyles: "typographyStyle", animationStyles: "animationStyle",
};
// Re-validated on a TTL, NOT on every lookup. frameRegistry.listPacks() is a
// live readdirSync + one existsSync per pack by design; idfFor() runs a few
// thousand times per selection, and calling through to the filesystem on each
// one turned a 200ms rank into a hang. Thirty seconds keeps a newly published
// pack arriving on its own without putting the disk in the scoring loop.
const CORPUS_TTL_MS = 30_000;
let _corpus = null;
let _corpusAt = 0;
function corpus() {
  const now = Date.now();
  if (_corpus && now - _corpusAt < CORPUS_TTL_MS) return _corpus;
  const packs = frameRegistry.listPacks();
  _corpusAt = now;
  if (_corpus && _corpus.n === packs.length) return _corpus;
  const df = {};
  for (const axis of IDF_AXES) df[axis] = new Map();
  for (const name of packs) {
    let p;
    try { p = profileOf(name); } catch { continue; }
    for (const axis of IDF_AXES) {
      const set = p[axis];
      if (!set) continue;
      for (const label of set) df[axis].set(label, (df[axis].get(label) || 0) + 1);
    }
  }
  _corpus = { n: Math.max(1, packs.length), df };
  return _corpus;
}

function idfFor(axis, label) {
  const c = corpus();
  const m = c.df[axis];
  if (!m) return 1;
  const freq = m.get(label) || 0;
  // Smoothed IDF, clamped so a label unique to one pack cannot outweigh the
  // rest of the model by itself.
  return Math.min(3, Math.max(0.35, Math.log((c.n + 1) / (freq + 1))));
}

/**
 * lex.overlap, weighted by how rare each demanded label is in the library.
 * `signalAxis` names the axis on the SIGNAL side; the profile field it scores
 * against comes from SIGNAL_TO_PROFILE.
 */
// One matched label on an axis the prompt only stated once is a coincidence
// away from being noise, and without this a single rare hit scored a perfect 1.0
// — which is how a boxing template won a climate-change brief on the strength of
// the words "impact bursts". The constant sits in the denominator so agreement
// has to be CORROBORATED to approach full marks: one rare label reaches ~0.75,
// two reach ~0.85, and a lone common label barely registers.
const CORROBORATION = 1.0;

function idfOverlap(demand, supply, signalAxis) {
  if (!demand || !demand.size) return 0;
  const axis = SIGNAL_TO_PROFILE[signalAxis] || signalAxis;
  let total = 0, hit = 0;
  for (const [label, n] of demand) {
    const w = Math.min(3, n) * idfFor(axis, label);
    total += w;
    if (supply && supply.has(label)) hit += w;
  }
  return total ? hit / (total + CORROBORATION) : 0;
}

// ---------------------------------------------------------------- signals

/**
 * Extract the structured signals a prompt (plus whatever the brief and the job
 * already know) carries. Everything is optional — a bare prompt still produces a
 * usable signal set, which is what keeps the fallback path from ever needing a
 * random pick.
 */
function analyze({ prompt, brief, orientation, durationSec, pace, assets } = {}) {
  const b = brief || {};
  // Trust-weighted text: the concrete SUBJECT is the strongest topical evidence
  // there is, the raw prompt next, the model's expansion last. Repetition is the
  // weighting, because the matcher counts hits.
  // The analysis stage's refined prompt is the model's cleaned-up restatement of
  // what the person asked for, so it earns exactly ONE repetition — the same trust
  // weight as improvedPrompt, below the raw prompt (two) and the subject (three).
  //
  // WHY TEXT AND NOT A LABEL MERGE. The analysis also emits explicit lexicon labels,
  // and injecting them straight into the demand map looks like the obvious win. It
  // is the opposite: idfOverlap (:492-502) adds every demand label's weight to the
  // DENOMINATOR whether or not the candidate supplies it, so a declared label the
  // winning pack does not serve LOWERS its score, and a label outside AXES can never
  // appear in any pack's supply map and is therefore a pure penalty on every
  // candidate. Appending the text moves labels AND topicTokens together, through the
  // repetition-weighting this function is already built around, with no new code and
  // no denominator distortion.
  const topicText = [
    b.subject || "", b.subject || "", b.subject || "",
    prompt || "", prompt || "",
    b.improvedPrompt || "",
    (b.analysis && b.analysis.refinedPrompt) || "",
    (b.keyMessages || []).join(" "),
    b.goal || "", b.audience || "",
  ].join(" ");
  // Tone/vibe reads off the fields that describe FEEL, plus the prompt (a user
  // who types "cinematic" means it).
  const toneText = [
    b.tone || "", b.tone || "",
    prompt || "",
    b.voProfile || "", b.musicMood || "",
    b.improvedPrompt || "",
    (b.analysis && b.analysis.refinedPrompt) || "",
  ].join(" ");

  const topic = lex.profileText(topicText);
  const feel = lex.profileText(toneText);

  const wantPortrait = String(orientation || "").toLowerCase() === "vertical";
  const a = assets || {};
  const screenshots = Number(a.screenshots) || 0;
  const userAssets = Number(a.userAssets) || 0;
  const expectedAssets = screenshots + userAssets + (a.images ? 4 : 0) + (a.video ? 2 : 0);

  return {
    orientation: wantPortrait ? "9:16" : "16:9",
    requestedOrientation: orientation || null,
    durationSec: Number(durationSec) || null,
    pace: pace || "normal",
    contentTypes: topic.contentTypes,
    industries: topic.industries,
    vibes: feel.vibes,
    tones: feel.tones,
    visualStyles: feel.visualStyles,
    typographyStyles: feel.typographyStyles,
    animationStyles: feel.animationStyles,
    topicTokens: new Set(topic.tokens.uni),
    expectedAssets,
    hasScreenshots: screenshots >= 3,
    brandPalette: !!a.brandPalette,
    subject: b.subject || null,
  };
}

// ---------------------------------------------------------------- hard filter

/**
 * Constraints a candidate must satisfy to be considered AT ALL. Returns null when
 * the pack passes, or the reason string when it does not — the reason is counted
 * and reported, so "no candidates" is always explicable.
 */
function rejectionFor(profile, signals) {
  // ORIENTATION IS ABSOLUTE. omelette_adapter composes at the template's native
  // canvas and renderer.js refuses to rescale across a ratio change, so a
  // portrait pack on a landscape job does not look wrong — it ships the wrong
  // file. Square jobs are treated as landscape-compatible, matching the gallery's
  // own split (vertical vs everything else).
  if (profile.orientation !== signals.orientation) return "orientation";

  const d = signals.durationSec;
  if (d) {
    const { minSec, maxSec } = profile.supportedDurations;
    // Cannot cover the runtime at the authored pace: every beat stretches.
    if (d > maxSec) return "duration-too-long";
    // A long-form template cast onto a short clip keeps three of forty beats and
    // is no longer that template.
    if (d < minSec) return "duration-too-short";
    // CAPABILITY. Past this length the pipeline reroutes a sparse renderer to
    // the scene-kit, so the film would carry the pack's colours but none of its
    // design. Choosing it in auto mode promises a template it will not deliver.
    if (d > longformRendererSec() && !profile.featureSupport.rendererLongFormOk) return "renderer-not-long-form";
  }
  return null;
}

// ---------------------------------------------------------------- scoring

// Post-filter weights, summing to 100.
//
// ORIENTATION CARRIES NO WEIGHT ON PURPOSE. The brief asked for 15% there, but
// orientation is a hard gate one step above: every survivor already matches it
// exactly, so points spent on it would be identical for all candidates and would
// only dilute the axes that can actually discriminate. Duration is the same
// shape — feasibility is gated, and what is left (how close the runtime is to
// the template's authored form) is a real gradient worth 6.
//
// TOPIC outweighs everything because of what this library IS: 285 packs, most of
// them authored around a literal subject (rodeo, deep sea, chess, chalk board,
// bakehouse). When a prompt names a subject a pack was built for, that is the
// single strongest "designed for this content" signal available, and ignoring it
// is exactly what made auto feel random.
const W = {
  topic: 26,        // industries + literal subject overlap
  contentType: 18,  // is the template SHAPED for this kind of film
  vibe: 22,         // vibes + tones
  visual: 10,       // ground/palette/typography character
  animation: 6,     // motion grammar + pace feel
  asset: 8,         // measured media capacity vs the pictures this job has
  duration: 6,      // how close the runtime is to the authored form
  quality: 4,       // manifest completeness + measured capacity (tie-break only)
};

// Literal token overlap, normalised against the DEMAND side (see lex.overlap for
// why asymmetric). Capped contribution so one shared common word cannot carry a
// pack; it is a bonus on top of the lexicon, not a substitute for it.
// IS THE TEMPLATE *ABOUT* THIS, or does it merely also cover it?
//
// `idfOverlap` is asymmetric on purpose — a versatile pack must not be punished
// for breadth. But on the two "aboutness" axes that leaves a pack whose whole
// identity is `news` tied with one that happens to mention it: both served the
// one label the prompt asked for. This is the symmetric half, added back at low
// weight — the share of the template's OWN labels the prompt actually wanted.
// Enough to break that tie toward the specialist, too small to shut a
// general-purpose template out.
function focus(demand, supply) {
  if (!supply || !supply.size || !demand || !demand.size) return 0;
  let matched = 0;
  for (const label of supply) if (demand.has(label)) matched++;
  return matched / supply.size;
}

function tokenOverlap(demand, supply) {
  if (!demand || !demand.size || !supply || !supply.size) return 0;
  let hit = 0;
  for (const t of demand) if (supply.has(t)) hit++;
  return Math.min(1, hit / Math.min(12, Math.max(4, demand.size)));
}

function durationFit(profile, durationSec) {
  if (!durationSec) return 0.6; // unknown runtime: neutral, never a discriminator
  const { nativeSec, maxSec } = profile.supportedDurations;
  if (!nativeSec) return 0.6;
  // Log-ratio distance so 2x off costs the same either side of the authored
  // length, and a 10% difference costs almost nothing.
  const dev = Math.abs(Math.log(durationSec / nativeSec));
  let fit = Math.max(0, 1 - dev / 1.6);
  // Approaching the engine ceiling means beats are already stretching.
  if (durationSec > maxSec * 0.85) fit *= 0.75;
  return fit;
}

function assetFit(profile, signals) {
  const images = profile.assetRequirements.images;
  if (images == null) return 0.55; // unmeasured: neutral
  const want = signals.expectedAssets;
  if (want >= 6) return Math.min(1, images / 8);            // a picture-heavy job wants a picture-heavy pack
  if (want <= 1) return profile.density === "text-first" ? 1 : images <= 5 ? 0.8 : 0.5;
  return images >= 3 ? 0.85 : 0.6;
}

function pacingFit(profile, signals) {
  return profile.pacingCompatibility.has(signals.pace) ? 1 : 0.45;
}

/**
 * Score one compatible template against the signals. 0..100, plus the reasons
 * that produced it — the reasons are generated FROM the score components, so
 * they can never drift out of sync with the number they explain.
 */
function scoreTemplate(profile, signals) {
  const parts = {};
  const reasons = [];

  const industryHit = idfOverlap(signals.industries, profile.industries, "industries");
  const tokenHit = tokenOverlap(signals.topicTokens, profile.topicTokens);
  const industryFocus = focus(signals.industries, profile.industries);
  parts.topic = W.topic * (0.55 * industryHit + 0.30 * tokenHit + 0.15 * industryFocus);
  const industries = lex.matchedLabels(signals.industries, profile.industries);
  if (industries.length) reasons.push(`Built for ${industries.slice(0, 2).join(" / ")} subject matter`);
  else if (tokenHit > 0.25) reasons.push(`Subject vocabulary overlaps the template's own (${[...profile.topicTokens].filter((t) => signals.topicTokens.has(t)).slice(0, 3).join(", ")})`);

  const ctHit = idfOverlap(signals.contentTypes, profile.contentTypes, "contentTypes");
  parts.contentType = W.contentType * (0.8 * ctHit + 0.2 * focus(signals.contentTypes, profile.contentTypes));
  const cts = lex.matchedLabels(signals.contentTypes, profile.contentTypes);
  if (cts.length) reasons.push(`Shaped for ${cts.slice(0, 2).join(" / ")} films`);

  const vibeHit = idfOverlap(signals.vibes, profile.vibes, "vibes");
  const toneHit = idfOverlap(signals.tones, profile.tones, "tones");
  parts.vibe = W.vibe * (0.72 * vibeHit + 0.28 * toneHit);
  const vibes = lex.matchedLabels(signals.vibes, profile.vibes);
  if (vibes.length) reasons.push(`${vibes.slice(0, 2).join(" + ")} vibe matches the prompt`);

  const visHit = idfOverlap(signals.visualStyles, profile.visualStyle, "visualStyles");
  const typoHit = idfOverlap(signals.typographyStyles, profile.typographyStyle, "typographyStyles");
  parts.visual = W.visual * (0.6 * visHit + 0.4 * typoHit);
  const vis = lex.matchedLabels(signals.visualStyles, profile.visualStyle);
  if (vis.length) reasons.push(`${vis.slice(0, 2).join(", ")} surface as requested`);

  const animHit = idfOverlap(signals.animationStyles, profile.animationStyle, "animationStyles");
  const pace = pacingFit(profile, signals);
  parts.animation = W.animation * (0.55 * animHit + 0.45 * pace);
  if (pace === 1 && signals.pace !== "normal") reasons.push(`Authored at ${profile.beatSec}s a beat — sits in ${signals.pace} pace`);

  const af = assetFit(profile, signals);
  parts.asset = W.asset * af;
  if (signals.hasScreenshots && profile.assetRequirements.images >= 8) {
    reasons.push(`Paints ~${profile.assetRequirements.images} images — carries this job's screenshots`);
  }

  const df = durationFit(profile, signals.durationSec);
  parts.duration = W.duration * df;
  if (df > 0.75 && signals.durationSec) {
    reasons.push(`Authored as a ${Math.round(profile.supportedDurations.nativeSec)}s film — close to the ${signals.durationSec}s requested`);
  }

  parts.quality = W.quality * profile.qualityScore;

  const score = Object.values(parts).reduce((a, b) => a + b, 0);
  // Orientation is stated in every explanation even though it scores nothing:
  // it is the constraint the old system broke, and a reader of the log needs to
  // see that it held.
  reasons.unshift(`Correct ${profile.orientation} orientation`);
  return { score: Math.round(score * 10) / 10, parts, reasons };
}

// ---------------------------------------------------------------- diversity

// Family of a pack, for the anti-repeat band. Reuses the existing classifier so
// there is one notion of "the same look" in the codebase, not two.
function familyOf(name) {
  try {
    const packFamilies = require("./pack_families");
    return packFamilies.familyOf(name, profileOf(name).vibeText);
  } catch { return `solo:${name}`; }
}

/**
 * Reorder candidates that are within DIVERSITY_BAND of the leader so a run of
 * films does not repeat one look. Penalties are all strictly smaller than the
 * band, so a candidate that leads by more than the band CANNOT be displaced:
 * relevance always wins, variety only breaks near-ties.
 */
function applyDiversity(ranked, recentPacks) {
  if (!ranked.length || !recentPacks || !recentPacks.length) return ranked;
  const top = ranked[0].score;
  const band = ranked.filter((c) => top - c.score <= DIVERSITY_BAND);
  if (band.length < 2) return ranked;

  const lastPack = recentPacks[0];
  const lastFamily = lastPack ? familyOf(lastPack) : null;
  const recent = new Set(recentPacks);

  for (const c of band) {
    let penalty = 0;
    const notes = [];
    if (c.templateId === lastPack) { penalty += 5; notes.push("styled the previous film"); }
    else if (recent.has(c.templateId)) { penalty += 3; notes.push("used recently"); }
    if (lastFamily && familyOf(c.templateId) === lastFamily) { penalty += 2.5; notes.push("repeats the previous film's visual family"); }
    c.diversityPenalty = penalty;
    c.adjusted = c.score - penalty;
    if (notes.length) c.diversityNote = notes.join(", ");
  }
  const rest = ranked.slice(band.length);
  band.sort((a, b) => (b.adjusted ?? b.score) - (a.adjusted ?? a.score));
  return [...band, ...rest];
}

// ---------------------------------------------------------------- select

/**
 * Pick the best-matching template for a film.
 *
 * @param {object}   o
 * @param {string}   o.prompt          raw user prompt (may be empty)
 * @param {object}   o.brief           the creative brief, when one exists
 * @param {string}   o.orientation     "vertical" | "horizontal" | "square"
 * @param {number}   o.durationSec     requested runtime
 * @param {string}   o.pace            pacing mode id
 * @param {object}   o.assets          { screenshots, userAssets, images, video, brandPalette }
 * @param {string[]} o.recentPacks     recently used packs, most recent first
 * @param {string[]} o.pool            restrict to these packs (default: all installed)
 * @param {number}   o.shortlist       how many candidates to return (default 12)
 *
 * @returns {{pack:string|null, score:number, reasons:string[], profile:object|null,
 *            candidates:Array, rejected:object, poolSize:number, signals:object}}
 *
 * NEVER returns a random pack: with no signal at all the ranking is driven by the
 * duration/asset/quality components alone, which is still a reasoned order.
 */
function select({
  prompt = "", brief = null, orientation = "horizontal", durationSec = null,
  pace = "normal", assets = null, recentPacks = [], pool = null, shortlist = 12,
} = {}) {
  const signals = analyze({ prompt, brief, orientation, durationSec, pace, assets });
  const packs = pool && pool.length ? pool : frameRegistry.listPacks();

  const rejected = {};
  const compatible = [];
  for (const name of packs) {
    let profile;
    try { profile = profileOf(name); } catch { rejected.unreadable = (rejected.unreadable || 0) + 1; continue; }
    const why = rejectionFor(profile, signals);
    if (why) { rejected[why] = (rejected[why] || 0) + 1; continue; }
    compatible.push(profile);
  }

  // FALLBACK LADDER (Phase 7), still never random. If the hard filter empties the
  // pool, relax ONLY the duration constraints — orientation never relaxes,
  // because a wrong-orientation film is a broken deliverable, not a compromise.
  let relaxed = null;
  if (!compatible.length) {
    for (const name of packs) {
      let profile;
      try { profile = profileOf(name); } catch { continue; }
      if (profile.orientation !== signals.orientation) continue;
      compatible.push(profile);
    }
    relaxed = compatible.length ? "duration" : null;
  }

  if (!compatible.length) {
    return {
      pack: null, score: 0, reasons: [], profile: null, candidates: [],
      rejected, poolSize: packs.length, signals, relaxed: null,
    };
  }

  const ranked = compatible
    .map((profile) => {
      const s = scoreTemplate(profile, signals);
      return {
        templateId: profile.templateId, score: s.score, parts: s.parts,
        reasons: s.reasons, profile,
      };
    })
    .sort((a, b) => b.score - a.score || a.templateId.localeCompare(b.templateId));

  const ordered = applyDiversity(ranked, recentPacks);
  const winner = ordered[0];
  const reasons = winner.reasons.slice();
  if (relaxed) reasons.push(`No template matched the ${durationSec}s runtime exactly — duration constraint relaxed, orientation held`);
  if (winner.diversityNote) reasons.push(`Chosen over a near-equal candidate that ${winner.diversityNote}`);

  return {
    pack: winner.templateId,
    score: winner.score,
    reasons,
    profile: winner.profile,
    candidates: ordered.slice(0, shortlist).map((c) => ({
      templateId: c.templateId,
      score: c.score,
      adjusted: c.adjusted ?? c.score,
      reasons: c.reasons,
      vibe: c.profile.vibeText,
      orientation: c.profile.orientation,
      nativeSec: c.profile.supportedDurations.nativeSec,
      density: c.profile.density,
      images: c.profile.assetRequirements.images,
    })),
    rejected,
    poolSize: packs.length,
    compatibleCount: compatible.length,
    // Every template that cleared the hard constraints, not just the shortlist.
    // The brief model is shown the top few but is allowed to name any of these —
    // its judgement can beat the ranking, it just cannot leave the compatible set.
    compatibleIds: compatible.map((p) => p.templateId),
    signals,
    relaxed,
  };
}

// ---------------------------------------------------------------- job policy

// Templates the user's OTHER recent films used, newest first — the input to the
// ranking's tie-break so two films in a row do not come out on the same look.
// `exceptJobId` matters on a regenerate: without it a film counts as its own
// predecessor and gets pushed off a template the user may have been happy with.
// Best-effort; an empty list simply means no tie-break, never a failure.
function recentlyUsedPacks(exceptJobId = null, limit = 3) {
  try {
    const db = require("../db");
    return [...new Set(
      db.listRecent({ limit: 10 })
        .filter((j) => j && j.id !== exceptJobId)
        .map((j) => j.framePack)
        .filter(Boolean)
    )].slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * WHICH TEMPLATE DOES THIS JOB GET? The one place that answers it.
 *
 * Both the production graph's frame_selector node and project_pipeline's
 * production entry need this answer, and they need the SAME answer: the pipeline
 * folds the script to the pack's scene ceiling before the graph runs, so if the
 * two disagreed the film would be cut for one template and rendered on another.
 *
 * The policy, in precedence order:
 *   1. A pin the USER made is honoured verbatim, always. It is measured against
 *      the constraints and any mismatch is reported, but never overridden —
 *      manual selection behaves exactly as it always has.
 *   2. The brief's pick stands if it still clears the hard constraints. The model
 *      earned it, and re-ranking a valid choice would make the template shown in
 *      the Script Room differ from the one rendered.
 *   3. Otherwise the highest-ranked compatible template.
 *   4. Only if the registry yields nothing at all: the registry default, so the
 *      job renders instead of failing over template selection.
 *
 * `job.frame_pack` is NOT evidence of a user pick: intake writes the brief's
 * suggestion into that same column. `frame_pack_user` is the flag that records
 * an actual choice, and reading the wrong one is what made every auto job look
 * explicit to the graph.
 */
function resolveForJob({ job, brief = null, recentPacks = null } = {}) {
  const j = job || {};
  const recent = recentPacks || recentlyUsedPacks(j.id);
  const orientation = j.orientation || "horizontal";
  const durationSec = Number(j.duration) || null;
  const wantOrientation = String(orientation).toLowerCase() === "vertical" ? "9:16" : "16:9";
  const userPinned = j.frame_pack_user === 1 || j.frame_pack_user === true;
  const explicit = (j.frame_pack && j.frame_pack !== "auto" && userPinned)
    ? frameRegistry.resolvePack(j.frame_pack)
    : null;

  if (explicit) {
    const warnings = [];
    try {
      const p = profileOf(explicit);
      const why = rejectionFor(p, { orientation: wantOrientation, durationSec });
      if (why === "orientation") {
        warnings.push(`"${explicit}" is authored ${p.orientation} but this job is ${orientation} — the delivered file may not match the requested aspect`);
      } else if (why) {
        warnings.push(`"${explicit}" is authored as a ${Math.round(p.supportedDurations.nativeSec)}s film (${why.replace(/-/g, " ")}) for this ${durationSec}s job`);
      }
    } catch { /* unknown pack: nothing to check, the pin still stands */ }
    return { pack: explicit, via: "user", score: null, reasons: ["Explicitly chosen by the user"], warnings, selection: null };
  }

  let selection = null;
  try {
    selection = select({
      prompt: j.prompt || "",
      brief,
      orientation, durationSec,
      pace: (brief && brief.pacing && brief.pacing.mode) || j.pace || "normal",
      assets: {
        screenshots: (j.website_screenshots || []).length,
        userAssets: (j.user_assets || []).filter((u) => u && u.role === "asset").length,
        images: !!(j.website_images || []).length,
        video: !!j.upload_path,
        brandPalette: !!j.brand_palette,
      },
      recentPacks: recent,
    });
  } catch (e) {
    return {
      pack: frameRegistry.resolvePack((brief && brief.suggestedFramePack)) || frameRegistry.resolvePack("auto"),
      via: "brief (matcher unavailable)", score: null, reasons: [],
      warnings: [`template matcher unavailable: ${String(e && e.message).slice(0, 140)}`], selection: null,
    };
  }

  const briefPick = frameRegistry.resolvePack(brief && brief.suggestedFramePack);
  const compatible = new Set(selection.compatibleIds || []);
  // A template can be COMPATIBLE without being SHORTLISTED — the model is shown
  // the top dozen but may name any of the survivors, and on a real 16:9 run it
  // did exactly that. Reporting `selection.score` for those printed the LEADER's
  // score and the LEADER's reasons beside a different template's name, which is
  // worse than no explanation: it looks authoritative and describes the wrong
  // film. Score the chosen template itself instead.
  const summarize = (pack, via) => {
    let c = selection.candidates.find((x) => x.templateId === pack);
    if (!c && compatible.has(pack)) {
      try {
        const s = scoreTemplate(profileOf(pack), selection.signals);
        c = { score: s.score, reasons: s.reasons };
      } catch { /* fall through to the selection-level summary */ }
    }
    return {
      pack, via,
      score: c ? c.score : selection.score,
      reasons: c ? c.reasons : selection.reasons,
      warnings: [],
      selection,
    };
  };

  if (briefPick && compatible.has(briefPick)) return summarize(briefPick, "brief");

  if (selection.pack) {
    const out = summarize(selection.pack, briefPick ? "re-selected" : "ranking");
    if (briefPick) {
      let detail = "";
      try {
        const p = profileOf(briefPick);
        detail = ` (${p.orientation}, authored ${Math.round(p.supportedDurations.nativeSec)}s)`;
      } catch { /* unreadable pack: the name alone is enough */ }
      out.warnings.push(`the brief chose "${briefPick}"${detail} but this job is ${orientation} / ${durationSec}s`);
    }
    return out;
  }

  return {
    pack: briefPick || frameRegistry.resolvePack("auto"),
    via: "registry default", score: null, reasons: [],
    warnings: ["no compatible template found — falling back to the registry default"],
    selection,
  };
}

/** The record persisted on the job so the UI and the logs can show the reasoning. */
function selectionRecord(resolved) {
  const s = resolved.selection;
  return {
    pack: resolved.pack,
    via: resolved.via,
    score: resolved.score ?? null,
    reasons: resolved.reasons || [],
    ...(s ? {
      orientation: s.signals.orientation,
      durationSec: s.signals.durationSec,
      compatibleCount: s.compatibleCount,
      poolSize: s.poolSize,
      rejected: s.rejected,
      topCandidates: s.candidates.slice(0, 3).map((c) => ({ pack: c.templateId, score: c.score })),
    } : {}),
    ...(resolved.warnings && resolved.warnings.length ? { warnings: resolved.warnings } : {}),
  };
}

/**
 * One-line audit trail for the logs. Deliberately compact — this line is printed
 * on every auto job, so it has to be readable in a scrolling log.
 */
function explain(result) {
  if (!result || !result.pack) return "[template] no compatible template found";
  const alts = result.candidates.slice(1, 4)
    .map((c) => `${c.templateId} ${c.score}`).join(", ");
  const rej = Object.entries(result.rejected || {}).map(([k, v]) => `${v} ${k}`).join(", ");
  return `[template] ${result.pack} ${result.score}/100 — ${result.reasons.slice(0, 4).join(" · ")}`
    + `\n[template]   ${result.compatibleCount}/${result.poolSize} compatible${rej ? ` (rejected: ${rej})` : ""}`
    + (alts ? `\n[template]   runners-up: ${alts}` : "");
}

module.exports = {
  select, resolveForJob, selectionRecord, explain,
  analyze, profileOf, scoreTemplate, rejectionFor,
  applyDiversity, mediaCapacity, pacingBandsFor, idfOverlap, corpus, recentlyUsedPacks,
  W, DIVERSITY_BAND, LONGFORM_MIN_SEC, ENGINE_MAX_SCENES,
};
