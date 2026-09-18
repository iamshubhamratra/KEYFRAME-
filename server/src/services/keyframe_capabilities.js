// WHAT KEYFRAME CAN ACTUALLY MAKE — read from the app, not written as marketing copy.
//
// Two readers depend on this being TRUE rather than aspirational:
//
//   - the scope analyser (prompt_scope.js), which is shown this catalog so its
//     judgement of "can KEYFRAME make this?" is anchored to the real product;
//   - the out-of-scope response, which tells a person what they CAN make instead
//     and how. A reply that promises a capability the pipeline does not have is
//     worse than no reply: the person follows the steps and hits a wall.
//
// So every number and list below is derived at call time from the module that
// owns it — config for durations/orientations/resolutions, caption_lang for the
// shipped languages, pacing for pace modes, frame_registry for the template count,
// template_lexicon for the kinds of film the matcher understands. Adding a language
// or a template changes the message with no edit here.
//
// Presentation labels are the one hand-written part, and they are keyed BY the
// lexicon: a content type removed from template_lexicon disappears from the list,
// and a new one appears under a title-cased fallback label until it is given a
// better one.

// Kinds of FILM, in the order a person scanning the list is most likely to want
// them. Keys are template_lexicon CONTENT_TYPES. Types that are really TOPICS rather
// than formats (finance, technology, ecommerce) are deliberately absent — any film
// kind below can be about them.
const VIDEO_TYPE_LABELS = [
  ["product-demo", "Product and service explainers", "show how something works and why it matters"],
  ["marketing", "Promotional and marketing videos", "ads, offers and campaigns with a clear call to action"],
  ["saas", "Software and app explainers", "walk through a platform, dashboard or app"],
  ["social", "Social media videos", "short, punchy reels and shorts"],
  ["education", "Educational and informational videos", "explain a concept, process or idea"],
  ["tutorial", "Tutorials and how-to videos", "step-by-step instructions"],
  ["storytelling", "Brand and storytelling videos", "narratives, journeys and case studies"],
  ["documentary", "Documentary-style explainers", "a topic told through narration, imagery and key facts"],
  ["launch", "Launch and announcement films", "reveal a product, feature or release"],
  ["brand-promotion", "Brand films", "mission, values and identity"],
  ["news", "News-style updates", "announcements and briefings"],
  ["event", "Event promos and invitations", "conferences, webinars and launches"],
  ["recruiting", "Hiring and careers videos", "roles, culture and why to join"],
  // Not "showreel": a reel is cut from footage the person filmed, which is exactly the
  // editing KEYFRAME does not do (see CANNOT). This is a body of work presented through
  // images and highlights.
  ["portfolio", "Portfolio videos", "present a body of work through images and highlights"],
];

// Short labels for config keys, so "horizontal" reads as the shape a person picks.
const ORIENTATION_LABELS = { horizontal: "16:9 widescreen", vertical: "9:16 vertical", square: "1:1 square" };

// Things the pipeline genuinely does not do. Kept here — beside the list of things it
// does — so the two cannot drift apart. The scope analyser treats a request whose CORE
// is one of these as out of scope; an incidental mention is not.
const CANNOT = [
  "write code, software, essays, articles, emails or other text documents as the deliverable",
  "answer general questions or look up live or real-time information",
  "edit, cut or colour-grade footage you have filmed",
  "generate AI images or AI video footage — KEYFRAME's pictures are sourced (stock libraries, website screenshots, your uploads) and animated",
  "create talking avatars, lip-synced presenters or deepfakes of real people",
  // The content policy (prompt_scope.js POLICY_CATEGORIES), stated here so the model is told
  // the same boundary the gate enforces.
  "make sexually explicit content, graphic gore, or content that attacks or demeans people for who they are",
  "produce anything other than an MP4 video (plus an optional .srt subtitle file)",
];

const safe = (fn, fallback) => { try { const v = fn(); return v == null ? fallback : v; } catch { return fallback; } };

function titleCase(key) {
  return String(key).split(/[-_\s]+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// EXACT, never rounded. The steps promise this range to a person who then picks a
// length, and the create routes reject anything outside config's bounds with a 400.
// This used to round to whole minutes, so a 90-second cap read "2 minutes" and a
// 150-second cap "3 minutes" — a promise the route then refuses. Whole minutes only
// when the value is one; otherwise seconds.
function formatDuration(sec) {
  const s = Math.max(0, Number(sec) || 0);
  const unit = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (s < 60 || s % 60 !== 0) return unit(s, "second");
  return unit(s / 60, "minute");
}

// The registry scans ~285 pack directories. The catalog is read on every scope
// decision, so hold it briefly rather than re-scanning the disk per request.
const TTL_MS = 60 * 1000;
let cached = null;
let cachedAt = 0;

/**
 * The capability catalog. Never throws — a missing module degrades a field to a
 * conservative default rather than failing a create request.
 */
function catalog({ now = Date.now() } = {}) {
  if (cached && now - cachedAt < TTL_MS) return cached;

  const config = safe(() => require("../config"), {});
  const lex = safe(() => require("./template_lexicon"), null);
  const captionLang = safe(() => require("./caption_lang"), null);
  const pacing = safe(() => require("./pacing"), null);
  const frameRegistry = safe(() => require("./frame_registry"), null);

  const contentTypeKeys = new Set(safe(() => Object.keys(lex.CONTENT_TYPES), []));
  const known = new Set(VIDEO_TYPE_LABELS.map(([k]) => k));
  const videoTypes = [
    ...VIDEO_TYPE_LABELS.filter(([k]) => contentTypeKeys.has(k)).map(([key, label, detail]) => ({ key, label, detail })),
    // A film kind added to the lexicon later still shows up, under a plain label.
    ...[...contentTypeKeys]
      .filter((k) => !known.has(k) && !["finance", "technology", "ecommerce"].includes(k))
      .map((key) => ({ key, label: `${titleCase(key)} videos`, detail: "" })),
  ];

  const orientations = safe(() => Object.keys(config.orientations), ["horizontal", "vertical"]);
  const languages = safe(() => captionLang.listLanguages().map((l) => ({ code: l.code, name: l.name || l.label || l.code })), [{ code: "en", name: "English" }]);

  cached = {
    videoTypes,
    output: {
      format: "MP4",
      minDurationSec: safe(() => config.server.minDurationSec, 5),
      maxDurationSec: safe(() => config.server.maxDurationSec, 600),
      orientations: orientations.map((key) => ({ key, label: ORIENTATION_LABELS[key] || key })),
      resolutions: safe(() => Object.keys(config.qualities), ["1080p"]),
      fps: safe(() => config.allowedFps.slice(), [30]),
    },
    templates: { count: safe(() => frameRegistry.listPacks().length, 0) },
    language: {
      shipped: languages,
      axes: ["voiceover", "subtitles", "on-screen text"],
    },
    audio: { voiceover: true, voiceoverOptional: true, music: true, soundEffects: true, // SRT only. caption_director carries an exportVTT flag and captions.js has a
    // writeVtt(), but nothing calls it — graph.js writes the .srt and no .vtt is ever
    // produced. A catalog that says VTT promises a file nobody receives.
    captions: true, subtitleFiles: ["SRT"] },
    pace: { modes: safe(() => pacing.listModes().map((m) => (typeof m === "string" ? m : m.key || m.mode)), ["normal"]) },
    inputs: {
      prompt: true,
      websiteUrl: true,
      blogUrl: true,
      referenceVideo: true,
      logo: true,
      maxImages: 12,
    },
    imagery: ["stock photo and video libraries", "icons", "screenshots of a website you link", "images from an article you link", "your own uploaded logo and images"],
    review: { scriptCheckpoint: true, autopilot: true },
    cannot: CANNOT.slice(),
  };
  cachedAt = now;
  return cached;
}

/**
 * A compact, factual summary for the scope model's user message. Kept short: the
 * analyser needs to know the SHAPE of the product, not read a brochure.
 */
function forModel() {
  const c = catalog();
  return {
    makes: "one template-based motion-graphics video per request",
    videoKinds: c.videoTypes.map((t) => t.label),
    output: `MP4, ${c.output.minDurationSec}-${c.output.maxDurationSec} seconds, ${c.output.orientations.map((o) => o.label).join(" / ")}`,
    builtFrom: [
      `one of ${c.templates.count} authored design templates`,
      "scenes of animated text, sourced imagery and icons",
      "optional narration and on-screen text in " + c.language.shipped.map((l) => l.name).join(", "),
      "burnt-in captions (optional), stock music and sound effects",
    ],
    inputs: "a written prompt, a website URL, a blog/article URL, a reference video, a logo and up to 12 images",
    imagery: c.imagery,
    cannot: c.cannot,
  };
}

// WHERE THE PERSON WILL FOLLOW THE STEPS FROM.
//
// The out-of-scope answer ends with "To create a video:" and a numbered list, and a
// person reads it standing in front of the thing that sent the request. There are two
// such things and they do not accept the same request:
//
//   "create-screen"  POST /api/projects — the create screen and its API. A prompt, a
//                    website or blog link, a reference video, a logo and images; eight
//                    languages; a script-review checkpoint or Autopilot.
//   "api-generate"   POST /api/generate — a single-shot endpoint. A prompt and a set of
//                    flags, nothing else: no link, no upload, no language choice, no
//                    script review (pipeline.runJob renders straight through).
//
// Both routes used to get the create screen's steps, so an API caller refused by
// /api/generate was told to paste a website link, review the script and switch on
// Autopilot — three things that endpoint has no field for. An unknown surface falls back
// to the create screen, which is what every caller before this parameter received.
const SURFACES = Object.freeze(["create-screen", "api-generate"]);
const DEFAULT_SURFACE = "create-screen";

// POST /api/generate's prompt length, in ONE place both readers can require. The route's
// validateBody enforces it and the api-generate steps state it. It lives here rather than
// in routes/generate.js because this module cannot require a route: the routes require
// db.js, which loads — and on boot recovery REWRITES — the job store at require time, and
// the catalog is read by the offline scope tests that must never open that store.
const GENERATE_PROMPT_CHARS = Object.freeze({ min: 10, max: 2000 });

// "a, b or c" — the API steps name the literal values a request may carry.
function orList(xs) {
  const items = xs.map(String);
  return items.length > 1 ? `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}` : (items[0] || "");
}

// THE CREATE SCREEN (and POST /api/projects). Unchanged from before surfaces existed.
function createScreenSteps(c) {
  const maxLabel = formatDuration(c.output.maxDurationSec);
  const shapes = c.output.orientations.map((o) => o.label).join(", ");
  const langCount = c.language.shipped.length;
  const inputsLine = [c.inputs.websiteUrl && "paste a website link", c.inputs.blogUrl && "a blog article", c.inputs.referenceVideo && "upload a reference video"]
    .filter(Boolean);

  return [
    "Describe what the video is about — a product, a service, a topic, an idea or a story."
      + (inputsLine.length ? ` You can also ${inputsLine.join(", ").replace(/, ([^,]*)$/, " or $1")}.` : ""),
    "List the points or scenes you want covered, in order if the order matters.",
    // The MAXIMUM only. The API accepts config's minimum, but the create screen's slider
    // starts higher, and these steps are read by someone standing in front of that slider:
    // "5 seconds" would send them to a control that cannot do it. The ceiling is true in
    // both places.
    `Choose the length (up to ${maxLabel}), the shape (${shapes}) and the narration`
      + (langCount > 1 ? ` — in any of ${langCount} languages.` : "."),
    c.templates.count
      ? `KEYFRAME matches your request to one of its ${c.templates.count} templates — or you pick one — and writes the script.`
      : "KEYFRAME matches your request to a template and writes the script.",
    c.review.scriptCheckpoint
      ? "Review and edit the script before anything is rendered" + (c.review.autopilot ? " — or switch on Autopilot to skip the review." : ".")
      : "KEYFRAME plans the scenes from your script.",
    // Narration and captions are OPTIONAL (voiceover can be switched off, burnt-in
    // captions are opt-in), so they are not promised as a given.
    "KEYFRAME gathers the visuals, adds music, animation and your optional narration and captions, and renders your MP4.",
  ];
}

// POST /api/generate. Every step names a field routes/generate.js validateBody actually
// reads, and describes what pipeline.runJob actually does with it. What is deliberately
// NOT here, and why:
//   - website / blog links and uploads: the endpoint has no such fields;
//   - languages: there is no language field, and narration is a named voice;
//   - script review and Autopilot: runJob goes brief -> storyboard -> render with no
//     checkpoint, so there is nothing to review and nothing to skip;
//   - captions: validateBody accepts a `captions` boolean and the row stores it, but runJob
//     composes with no caption cues and writes no subtitle file, so promising captions
//     would send the caller after a file this endpoint never produces;
//   - "in order if the order matters": the order lock reaches the brief, but runJob builds
//     the storyboard from the brief's prose and has no script stage to carry a
//     NARRATIVE DIRECTIVE, so the order is asked for, not guaranteed;
//   - the duration MINIMUM is stated here, unlike on the create screen: there is no slider
//     in front of an API caller, and config's minimum is exactly what the route accepts.
function apiGenerateSteps(c) {
  const shapes = c.output.orientations.map((o) => `${o.key} (${o.label})`);
  const pace = c.pace.modes.length ? ` — and optionally set pace to ${orList(c.pace.modes)}` : "";
  return [
    `Send a prompt of ${GENERATE_PROMPT_CHARS.min} to ${GENERATE_PROMPT_CHARS.max} characters that says what the video is about — a product, a service, a topic, an idea or a story — and the points or scenes to cover. This endpoint reads the prompt only.`,
    `Set duration, which this endpoint requires: ${formatDuration(c.output.minDurationSec)} to ${formatDuration(c.output.maxDurationSec)}. Optionally set orientation to ${orList(shapes)}; quality to ${orList(c.output.resolutions)}; and fps to ${orList(c.output.fps)}.`,
    "Narration, music and sound effects are off unless you ask for them: tts: true (optionally with a voice), music: true and sound_effect: true.",
    "Stock pictures are off unless you ask for them: images: true for photos and video: true for clips.",
    (c.templates.count
      ? `Leave framePack as auto to have KEYFRAME match one of its ${c.templates.count} templates, or name one`
      : "Leave framePack as auto to have KEYFRAME match a template, or name one")
      + `${pace}.`,
    "KEYFRAME writes the storyboard and renders your MP4 straight through — this endpoint has no script review step — so poll the statusUrl it returns until the job is done.",
  ];
}

/**
 * The out-of-scope response: the analyser's one-sentence reason, then what the person
 * CAN make and how — every fact read from the catalog, the steps written for the surface
 * the request came from (see SURFACES).
 */
function outOfScopeGuidance({ reason, surface } = {}) {
  const c = catalog();
  const steps = surface === "api-generate" ? apiGenerateSteps(c) : createScreenSteps(c);

  const reasonLine = String(reason || "").trim()
    || "This request isn't for a video.";

  return {
    headline: "KEYFRAME can't make this one",
    reason: reasonLine,
    framing: "KEYFRAME is designed for template-based video generation, so it can't create this type of content directly.",
    canCreate: c.videoTypes.slice(0, 8).map((t) => ({ label: t.label, detail: t.detail })),
    steps,
  };
}

/** Plain-text rendering, for API clients and logs. The UI renders the structure. */
function guidanceText(g) {
  if (!g) return "";
  return [
    `${g.reason} ${g.framing}`,
    "",
    "With KEYFRAME you can create:",
    ...g.canCreate.map((t) => `• ${t.label}${t.detail ? ` — ${t.detail}` : ""}`),
    "",
    "To create a video:",
    ...g.steps.map((s, i) => `${i + 1}. ${s}`),
  ].join("\n");
}

function _resetCacheForTests() { cached = null; cachedAt = 0; }

module.exports = {
  catalog, forModel, outOfScopeGuidance, guidanceText, formatDuration,
  CANNOT, VIDEO_TYPE_LABELS, SURFACES, DEFAULT_SURFACE, GENERATE_PROMPT_CHARS, _resetCacheForTests,
};
