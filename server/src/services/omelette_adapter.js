// OMELETTE ADAPTER — renders the USER'S film inside the ORIGINAL template.
//
// PLAYBACK BAR — FIXED 2026-07-31, do not re-chase. It reached the video because
// the renderer captures the PAGE, not the #root element, so keeping the bar
// outside #root was never enough on its own. hideChrome() (below) walks from
// #root up to <body> hiding every off-path sibling subtree and pins #root to
// (0,0); the two class/attribute hooks it replaced could never match — measured
// live, the bar node's className is "" and it matches neither [data-om-playback]
// nor .om-playbar/.om-playback-bar. Verified by re-render on all 15 omelette
// packs. The engine's auto-scale reads the VIEWPORT, not its siblings, so hiding
// them does not disturb the fit.
//
// KNOWN OPEN DEFECT (2026-07-30) — VERTICAL renders mis-fit.
// Landscape is verified good. In portrait the engine's own auto-scale leaves the
// stage at scale 0.64375 (464x824 inside a 720x1280 frame).
// MEASURED, so the next attempt need not re-derive it:
//   * the stage has NO viewBox — anything keyed off one silently no-ops;
//   * width/height/box-shadow set with !important DO persist on the stage;
//   * `transform` alone is reassigned back to scale(...) after every override,
//     including after a MutationObserver re-assert, so it is being recomputed
//     from engine state rather than written once;
//   * a document stylesheet cannot be relied on — the tree contains sc-host
//     shadow boundaries.
// SHARPENED (7th attempt, engine-side): the film is natively 1080x1920 and the
// engine solves scale = min(cw/1080, (ch-44)/1920). At a 720x1280 render it
// computes (1280-44)/1920 = 0.64375, so the film lands 695x1236 instead of the
// 720x1280 that would fill the frame — the correct scale is 1280/1920 = 0.6667.
// Resizing "the first ancestor with >1 child" to H+44 did NOT change the result,
// so that is NOT the element stageRef measures. Next step: identify the real
// stageRef container (instrument animations-v2.jsx's measure() directly, or find
// which ancestor's clientHeight equals 1280) and give THAT +44px.
//
// The alternative was hand-porting each template to native GSAP (as
// momentum_composer.js and showcase_composer.js do). That is ~700 lines per
// template, 17 templates, and every port is a reproduction that can drift from
// the source. This runs the source itself.
//
// It works because these templates already expose a frame-exact seek contract —
// proven by spike, not assumed:
//   * the stage carries data-om-exportable-video-with-duration-secs
//   * dispatching `data-om-seek-to-time-frame` with detail {time, sync:true}
//     applies the commit through ReactDOM.flushSync, so the DOM reflects that
//     frame the moment dispatchEvent returns (the stage advertises this as
//     data-om-sync-seek="true")
//   * verified: seeking forward then BACK to the same t yields a byte-identical
//     committed DOM, which is exactly what a frame-by-frame renderer needs
//
// So the adapter only has to:
//   1. swap window.OM_SCENES for the user's scenes (the template's own default
//      OM_SCENES tells us its authored scene names and content fields)
//   2. hide the engine's playback bar — it is drawn by animations-v2.jsx, NOT by
//      the film, which is why grepping the film sources for "PlaybackBar" found
//      nothing and the bar still rendered
//   3. install window.__timelines["vid"] as a GSAP-shaped shim over that seek
//   4. stamp the HyperFrames root contract (data-composition-id/width/height/
//      duration) — without it the renderer reports "Composition has zero
//      duration" even though the film is healthy

const fs = require("node:fs");
const path = require("node:path");
const config = require("../config");
const { note } = require("./fallback_log");

const TPL_DIR = path.join(config.paths.root, "public", "omelette-templates");

function templatePath(name) {
  const f = path.join(TPL_DIR, `${String(name).replace(/[^A-Za-z0-9]/g, "")}.html`);
  return fs.existsSync(f) ? f : null;
}

// Templates that are authored 1080x1920. Collected from the pack manifests so a
// newly imported template is portrait-native the moment its pack.json says so.
// The literals are the packs that predate `portraitNative` being read here, kept
// so a manifest-less call still resolves them correctly.
let _portraitCache = null;
function portraitTemplates() {
  if (_portraitCache) return _portraitCache;
  const set = new Set(["Reel", "FetchVertical", "FlightVertical", "ShowcaseVertical", "Teampulse", "Cadence", "Birdsong", "Stomp"]);
  try {
    const frameManifest = require("./frame_manifest");
    for (const name of frameManifest.listManifests()) {
      const m = frameManifest.getManifest(name);
      const tpl = m && (m.template || m.omeletteTemplate);
      if (tpl && m.portraitNative) set.add(String(tpl));
    }
  } catch {
    // Manifests unreadable — the literals above still cover the shipped packs.
  }
  _portraitCache = set;
  return set;
}

// ---- read the template's OWN authored scene list -------------------------------
// This is the key to being generic: every template ships its default OM_SCENES,
// which names its scene types in order and shows which content fields each uses.
function readTemplateScenes(html) {
  const m = /<script type="__bundler\/template"[^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (!m) return null;
  let page;
  try { page = JSON.parse(m[1]); } catch { return null; }
  return parseOmScenes(page);
}

// OM_SCENES is JSON *inside a single-quoted JS string*, so there are TWO layers
// of escaping and both have to come off before JSON.parse.
//
// The old reader did neither, which cost six templates. Any scene whose copy
// contains a quote — the `Code` beats print real source, e.g.
//   unlock(\\"TRUE ENDING\\");
// — survives the JS-string layer as \" but reaches JSON.parse as \\" , which is
// a literal backslash followed by an unterminated string. The parse threw, the
// catch returned null, and buildComposition reported the template as
// "exposes no OM_SCENES" — a message that points at the template rather than at
// the reader, which is why it reads as missing data instead of a parse bug.
//
// The pattern is also escape-aware now: '([\s\S]*?)'\s*; stops at the first
// "';" in the copy, which the same `Code` beats can easily contain.
function parseOmScenes(page) {
  const sm = /window\.OM_SCENES\s*=\s*'((?:[^'\\]|\\.)*)'/.exec(page);
  if (!sm) return null;
  const raw = sm[1].replace(/\\'/g, "'").replace(/\\\\/g, "\\");
  try { return JSON.parse(raw); } catch { return null; }
}

// Props the compiled components read but the authored OM_SCENES never declare.
// Because the demo-copy suppression is driven by the authored scene's own keys,
// anything listed here is INVISIBLE to it and keeps the template's demo content
// unless it is filled explicitly (see the UNDECLARED_DEMO pass in buildScenes).
//
// Derived by decoding the bundles and grepping the film source for `s.X || …`:
//   meta        a stat row  -> [{v:0.2,suf:'s',l:'to first result'}, {v:40,suf:'K',…}]
//   chips       a pill row  -> ['Fuzzy matching', 'Filters', 'Saved searches']
//   avatarLabel social proof-> 'and 4,000 more teams'
// NOT listed on purpose: `filters` (['All','Recent','Mine','Shared']) is generic
// UI furniture on a search control, not a claim about the product — the same
// reasoning that keeps Board's columns and Morph's states authored.
const UNDECLARED_DEMO = ["meta", "chips", "avatarLabel"];

// Scene names whose compiled component draws a MULTI-IMAGE rack (shot1..N).
// Module-scope because two places need it: the media assignment (which fills the
// rack) and the caster (which has to actually REACH the shape — see orderFor).
const MEDIA_WALL = /montage|gallery|fleet|wall|grid|explore|billboard|spread|cruise|deploy|sighting|line|assemble|showcase|surfaces|screens/i;

const isShot = (a) => {
  const s = String((a && a.source) || "").toLowerCase(), k = String((a && a.kind) || "").toLowerCase();
  return s === "website" || s === "screenshot" || k === "screenshot" || /screenshot|peekshot/.test(s);
};
const isLogo = (a) => a && (a.kind === "logo" || /logo/i.test(String(a.alt || "")));
const ratioOf = (a) => (a && Number(a.ratio) > 0 ? Number(a.ratio) : (a && a.width && a.height ? a.width / a.height : 0));
const isPortraitAsset = (a) => { const rt = ratioOf(a); return rt > 0 && rt < 0.9; };
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const plateOk = (a) => a && a.path && String(a.type) !== "video" && !/\.svg($|\?)/i.test(String(a.path));
// A topical VECTOR (Pixabay vector art / Iconify glyph / curated SVG). plateOk
// rejects these outright — a flat SVG cover-cropped into a photo card reads as a
// smear — which meant NO omelette film could ever show one: measured, 0 of 4
// supplied vectors reached the frame on every pack sampled, while the fetcher
// spent a vector budget on every job. They are admitted here as POST-photo fill
// and pinned to object-fit:contain at render time (vectorFitCss below), so they
// letterbox into the card instead of cropping — a real graphic beats the
// recycled screenshot or hatched placeholder that slot would otherwise draw.
const isVectorAsset = (a) => !!(a && a.path && String(a.type) !== "video"
  && /\.svg($|\?)/i.test(String(a.path)) && !isLogo(a));
// A THIRD-PARTY BRAND MARK — the logo of a product the NARRATION names ("Slack",
// "Chrome", "Edge"), fetched as flat art and pinned by the pipeline to the beat
// that says the word. Recognised by its own `brand` field and never by reading
// the name out of copy here: "Edge", "Linear" and "Notion" are ordinary English
// words, and a mark on the wrong beat is worse than no mark at all.
//
// Every pool above refuses it today — plateOk drops SVG, isVectorAsset drops
// anything isLogo() calls a logo (the alt reads "Slack logo") — so a supplied
// mark reached no tile in any of the 141 templates. It also must never satisfy
// `logo` below: that box is the CUSTOMER's mark, drawn on the closing frame, and
// a competitor's glyph in it rebrands the film.
const isBrandMark = (a) => !!(a && a.path && String(a.brand || "").trim()
  && (String(a.source || "").toLowerCase() === "iconify" || /\.svg($|\?)/i.test(String(a.path))));

function fit(text, max) {
  const t = String(text || "").trim();
  if (t.length <= max) return t;
  let out = "";
  for (const w of t.split(/\s+/)) { if ((out + " " + w).trim().length > max) break; out = (out + " " + w).trim(); }
  return out || t.slice(0, max);
}
// A LABEL, or nothing. fit() is word-bounded, which stops mid-WORD damage but
// not mid-THOUGHT damage: "75% of organizations report that Trello delivers
// value within 30 days" fitted to an 18-char pill becomes "75% of", and
// "Sign up — it's free!" becomes "Sign up — it's". Measured live — a finished
// film slammed "75% OF | SIGN UP — IT'S" across the frame as its headline.
//
// A short slot is for a LABEL. If fitting throws away most of the sentence, the
// sentence was never a label, and a blank slot is better than a stump: the
// blanking pass already renders missing slots as nothing.
const DANGLING = /^(of|the|a|an|and|or|to|for|with|in|on|at|by|from|as|but|so|is|are|was|were|be|it|its|it'?s|that|this|these|those|your|our|their|my|no|not|can|will|has|have|had|do|does|you|we|they)$/i;
function fitLabel(text, max) {
  const t = String(text || "").trim();
  if (!t) return "";
  let out = fit(t, max);
  if (out === t) return out;
  const total = t.split(/\s+/).filter(Boolean).length;
  // Trim the dangle. "Sign up — it's free!" cut to 22 chars is "Sign up — it's",
  // which still reads mid-thought. Peel trailing function words and orphaned
  // punctuation until it lands clean.
  let w = out.split(/\s+/).filter(Boolean);
  while (w.length && (DANGLING.test(w[w.length - 1].replace(/[^\w']/g, "")) || !/[\w%$)]$/.test(w[w.length - 1]))) w.pop();
  if (!w.length) return "";
  out = w.join(" ");

  // Did the cut land on a CLAUSE BOUNDARY? That is what separates a good short
  // label from a stump, and word-count alone cannot tell them apart:
  //   "Sign up — it's free!"        -> "Sign up"      cut before "—"  = a label
  //   "Inbox: pull in ideas fast"   -> "Inbox: pull"  cut mid-clause  = a stump
  // Both keep two words; only the first is a complete thought. ("Inbox: pull"
  // shipped in a finished film, in a pill next to "No-code automation".)
  let i = 0;
  for (let n = 0; n < w.length && i < t.length; n++) {
    while (i < t.length && /\s/.test(t[i])) i++;
    while (i < t.length && !/\s/.test(t[i])) i++;
  }
  while (i < t.length && /\s/.test(t[i])) i++;
  if (i >= t.length || /[—–\-:;,.!?)]/.test(t[i])) return out;

  // Mid-clause means incomplete, and no word-count ratio rescues that: "81% chose
  // ease of use" cut to "81% chose ease" keeps 60% of the words and still shipped
  // as a pill that says nothing. Drop it — the slot renders as nothing, which is
  // what a blank label should look like.
  return total <= 2 ? out : "";
}
function bullets(scene, n) {
  let list = Array.isArray(scene.chips) ? scene.chips.filter(Boolean) : [];
  if (!list.length && Array.isArray(scene.onScreenText)) list = scene.onScreenText.filter(Boolean);
  if (!list.length && Array.isArray(scene.bullets)) list = scene.bullets.filter(Boolean);
  if (!list.length && scene.subtext) list = String(scene.subtext).split(/[.;\n•]|\s—\s/).map((s) => s.trim()).filter((s) => s.length > 2);
  // LAST RESORT: THE LINE THE NARRATOR IS SPEAKING. Every list slot a template
  // declares — pills, sign racks, meta rows, feature cards — draws from here, so
  // a scene with no authored list and no subtext left the whole body of its
  // shape empty (measured on a shipped film: nine beats, one two-word headline
  // each, the rest of the frame bare). The voiceover is the one line guaranteed
  // to exist and guaranteed to be about THIS beat, so its clauses are honest
  // material for those slots. Still last: a real list always reads better.
  if (!list.length && scene.voiceover) list = phrases(scene.voiceover);
  return list.slice(0, n).map(String);
}

// A slot whose authored default is CONFIGURATION, not copy. Pouring a sentence
// into `variant: "dark"` or `icon: "bolt"` does not fill the frame, it breaks
// the component — so the fill below is deliberately conservative and only ever
// speaks into something that already looks like a written phrase.
const CONFIG_KEY = /^(url|href|src|img|image|icon|logo|color|colour|bg|background|accent|fill|stroke|align|variant|theme|mode|size|type|kind|id|key|cls|class|style|font|ease|anim|animation|dir|side|pos|position|fit|focus|ratio|seed|shape|pattern)$/i;

// The engine's own hard ceiling on the scene list (animations-v2.jsx rejects a
// list over 50 entries, or a serialized payload over 16KB, by rendering an error
// slate for the whole film).
const ENGINE_MAX_SCENES = 50;
// Which SCRIPT scene a built beat came from. A Symbol on purpose: the byte shed
// below needs it, and JSON.stringify skips symbol keys, so it can never reach
// OM_SCENES and spend bytes against the very cap the shed is fighting.
const SCENE_OF = Symbol("omelette.sceneIndex");

/**
 * Cast a script's scenes onto exactly `want` beats, preserving the film's
 * bookends.
 *
 * The opener and the closer are the two beats a template authors as bookends (a
 * title card and a CTA), so they are kept exactly once and never repeated — a
 * film that opens or closes twice reads as a mistake. Only the interior is
 * resampled:
 *
 *   too few  -> cycle the interior. Cycling (rather than repeating a fixed
 *               offset) puts the maximum possible distance between a beat and
 *               its next appearance: every other interior beat plays before any
 *               beat comes round again.
 *   too many -> drop evenly across the whole interior, so the film keeps its
 *               beginning, middle and end rather than losing its tail.
 *
 * Returns a new array; the input is not mutated.
 */
// Fold a run of consecutive scenes into ONE, spanning their combined time.
//
// The merged beat leads with the first member's headline and carries the others'
// headlines as promotable lines, so when buildScenes splits it back into
// sub-beats (partView promotes a fresh line per part) the film still says each
// member's own words instead of holding one headline over all of their narration.
function mergeRun(run) {
  if (run.length === 1) return run[0];
  const head = run[0];
  const dur = run.reduce((a, s) => a + (Math.max(0, Number(s.duration)) || 0), 0);
  const heads = run.slice(1).map((s) => String(s.headline || s.title || "").trim()).filter(Boolean);
  const bullets = Array.isArray(head.bullets) ? head.bullets.slice() : [];
  return {
    ...head,
    duration: Math.round(dur * 100) / 100,
    // Later members' headlines become promotable lines, ahead of the scene's own
    // bullets: partView pulls a fresh line per sub-beat, so a merged beat that
    // splits says each member's own words instead of holding one headline over
    // all of their narration.
    //
    // Tried and REVERTED: putting the next member's headline straight into
    // `subtext` instead. It reads better in principle — subtext renders on nearly
    // every shape, bullets only on list shapes — but it displaces the survivor's
    // own support line, and measured worse on the runtime that actually matches
    // its narration (600s: 61% -> 40%). The promotion path already surfaces these
    // where there is a beat to carry them.
    bullets: [...heads, ...bullets],
    voiceover: run.map((s) => String(s.voiceover || "").trim()).filter(Boolean).join(" "),
    __merged: run.length,
    // The members themselves, in order, so a beat that CAN afford a cut puts it
    // on the boundary between two scenes instead of at the arithmetic middle of
    // their combined time. An even split is the wrong place by construction
    // whenever the two scenes are different lengths: a 7.1s scene merged with a
    // 5.7s one cuts at 6.4s, so the second scene's headline is the biggest type
    // on the frame for the last 0.7s of the FIRST scene's narration. Measured on
    // a 300s / 60-scene script, that mis-placed cut was most of the runtime where
    // the screen showed a scene other than the one being spoken.
    __members: run.slice(),
  };
}

// A cut inside a merged beat needs time to land, exactly as a pace split does:
// below this the eye is still arriving when the next cut comes, which reads as
// the picture racing the voice.
const MIN_CUT_SEC = 2.0;

function cutsFrom(groups) {
  return groups.map((g) => ({
    mem: g,
    dur: Math.round(g.reduce((a, s) => a + Math.max(0, Number(s.duration) || 0), 0) * 100) / 100,
    view: mergeRun(g),
  }));
}

// Fold the two adjacent cuts whose COMBINED length is smallest. Folding always at
// the tail piles every concession in one place — the same mistake that grew a
// single beat to 68.6s during the byte shed.
function foldCuts(cuts) {
  if (!Array.isArray(cuts) || cuts.length < 2) return cuts || [];
  let bi = 1, best = Infinity;
  for (let i = 1; i < cuts.length; i++) {
    const d = (cuts[i].dur || 0) + (cuts[i - 1].dur || 0);
    if (d < best) { best = d; bi = i; }
  }
  const groups = cuts.map((c) => c.mem);
  groups.splice(bi - 1, 2, [...groups[bi - 1], ...groups[bi]]);
  return cutsFrom(groups);
}

/**
 * The cuts a merged beat should make: one per member scene, each carrying that
 * member's own copy for exactly its own share of the beat.
 *
 * Returns null when the beat carries a single scene (nothing to cut on) or when
 * the members are too short to give every cut time to land — the beat then plays
 * whole, leading with the scene that is spoken first.
 */
function memberCuts(sc) {
  const members = Array.isArray(sc && sc.__members) ? sc.__members.filter(Boolean) : null;
  if (!members || members.length < 2) return null;
  let cuts = cutsFrom(members.map((m) => [m]));
  while (cuts.length > 1 && cuts.some((c) => c.dur < MIN_CUT_SEC)) {
    const next = foldCuts(cuts);
    if (next.length >= cuts.length) break;
    cuts = next;
  }
  return cuts.length > 1 ? cuts : null;
}

// Reduce a script to at most `want` beats WITHOUT LOSING ANY OF IT.
//
// This used to force the script into the count the template's pace wanted:
// too many scenes were dropped by an even stride, too few were CYCLED
// (`mid[i % mid.length]`). Both are silent — the dropped scene's narration is
// still synthesized and mixed at its own `start`, because voiceAgent reads the
// SCRIPT, not the beat list — so the film narrated one scene while showing
// another. Measured on a 600s/70-scene job: 37 scenes never reached the screen
// and 94% of the runtime showed copy from a scene that was not being spoken.
//
// The rule now is a PARTITION, not a pace: every beat boundary falls on a scene
// boundary. A scene may be SPLIT into sub-beats (buildScenes already does that,
// and the parts sum to the scene) or whole adjacent scenes may be MERGED into
// one beat that spans their combined time. Nothing is dropped and nothing
// repeats, so the picture and the voiceover stay on the same clock by
// construction rather than by luck.
//
// Under budget we return the script untouched: buildScenes splits long scenes to
// reach the beat count, which adds cuts without moving a single boundary. That is
// the honest way to hit the template's pace, and it is why the cycle is gone.
function fitBeats(scenes, want) {
  const list = Array.isArray(scenes) ? scenes.slice() : [];
  const n = list.length;
  if (!n || !(want > 0)) return list;
  if (n <= want) return list;

  // The opener and the closer are the film's authored form — never merged away
  // while there is any interior left to absorb the reduction.
  if (want <= 2) return [mergeRun(list)];
  const first = list[0];
  const last = list[n - 1];
  const mid = list.slice(1, n - 1);
  const needMid = want - 2;
  if (!mid.length) return [first, last];
  if (needMid >= mid.length) return list;

  // Even partition of the interior by COUNT: contiguous runs, every scene in
  // exactly one run, run lengths differing by at most one.
  const out = [first];
  const base = Math.floor(mid.length / needMid);
  const extra = mid.length % needMid;          // the first `extra` runs take one more
  let at = 0;
  for (let g = 0; g < needMid; g++) {
    const size = base + (g < extra ? 1 : 0);
    out.push(mergeRun(mid.slice(at, at + size)));
    at += size;
  }
  out.push(last);
  return out;
}

// Words a film TITLE opens with that are not the film's brand. Used only for the
// last-resort brand guess (see brandSrc): an explicit brand or a real harvested
// domain always wins. Articles, prepositions, question words and the imperative
// verbs a headline habitually starts with ("Turn raw earth into…", "From bare
// soil to…", "Make your first…").
const TITLE_STOP = new Set([
  "a", "an", "the", "and", "or", "but", "for", "from", "to", "of", "in", "on", "at", "by", "with",
  "your", "our", "my", "their", "its", "this", "that", "these", "those", "you", "we", "us", "it",
  "how", "why", "what", "when", "where", "who", "which",
  "turn", "make", "get", "build", "start", "stop", "grow", "learn", "meet", "see", "find", "try",
  "why", "into", "onto", "over", "under", "after", "before", "every", "all", "one", "two", "three",
  "five", "ten", "new", "best", "top", "more", "less", "very", "just", "now", "then", "here",
  "introducing", "welcome", "inside", "behind", "beyond", "about",
]);
const CONFIG_VALUE = /^(#[0-9a-f]{3,8}|(https?:)?\/\/|\/|[a-z-]+\(|data:)/i;
// The authored default is the design's own width budget and case. "MILE 038"
// asks for a short stamp; "Every good boy delivers." asks for a sentence.
// A row cell that holds a FIGURE — a price, a percentage, a bar fraction. The
// adapter must never write one: the authored value belongs to the template's
// demo, and copying it onto the user's film states their rent is $60.
const FIGURE_CELL = /^[£$€¥]?\s*\d[\d.,]*\s*(%|x|k|m|bn|hrs?|min|s)?$/i;
function isFigureCell(cell) {
  if (typeof cell === "number") return true;
  const t = String(cell == null ? "" : cell).trim();
  return t !== "" && FIGURE_CELL.test(t);
}

// A CALENDAR OR COUNTER TOKEN — a day, a month, a quarter. Not copy: it is what
// a tear-off calendar prints on its leaves and what a countdown counts down.
const SEQ_TOKEN = /^(mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december|q[1-4])\.?$/i;

// A RACK OF FIGURES IS NOT OURS TO WRITE. This is the rule isFigureCell already
// applies to one cell of a ROW ("filling a receipt's $60 turns the template
// demo's number into a claim about the user's brand"), applied to a FLAT list —
// where nothing enforced it, because the flat-string branch of asSlot has no
// figure guard at all.
//
// Two shapes in the long-form kit are counting, not speaking:
//   Countdown  authors ["3","2","1","GO"] and draws ONE entry at a time at
//              400px. The generic rack fill replaced it with up to four
//              30-character sentence fragments — at 400px, per fragment.
//   TearOff    authors ["MARCH","MAY","AUGUST","NOVEMBER"] as the dates on its
//              calendar leaves.
// Measured across the 58 long-form films: 56 of 1530 authored list slots are
// sequences (12 Countdown, 44 TearOff) and no other slot matches, so the guard
// costs nothing elsewhere. The authored sequence stands, exactly as the authored
// `cols`/`states` labels already do — universal furniture, not another brand's
// words.
function isFigureRack(list) {
  if (!Array.isArray(list) || list.length < 2) return false;
  if (!list.every((x) => typeof x === "string" || typeof x === "number")) return false;
  const seq = list.filter((x) => isFigureCell(x) || SEQ_TOKEN.test(String(x).trim())).length;
  return seq > list.length / 2;
}

// ONE WORD OFF A LINE. Some slots are a single hero token, not a label: Kaleido
// mirrors `word` six ways, LongShadow throws a sun-arc shadow off it,
// ZoomThrough flies it past the camera. fitLabel is the wrong tool for those —
// it refuses a mid-clause cut, which is precisely what lifting one word out of a
// sentence is, so it returns "" every time. Take the longest word that fits,
// scanning left to right and keeping ties later: the object of a sentence
// carries its meaning more often than the subject does.
function keyWord(text, max) {
  const room = Math.max(3, Number(max) || 22);
  const words = String(text || "").trim().split(/\s+/)
    .map((w) => w.replace(/^[^\w£$€¥%]+/, "").replace(/[^\w%]+$/, ""))
    .filter((w) => w && w.length <= room && !DANGLING.test(w));
  let best = "";
  for (const w of words) if (w.length >= best.length) best = w;
  return best;
}

// The width budget for one authored cell. Same principle asSlot applies to
// racks: when the authored entry is a string, THAT is the budget — a 7-char
// ledger label must not be topped up with a 30-char sentence.
function cellRoom(cell, max) {
  const wide = typeof cell === "string" ? cell.trim().length : 0;
  if (!wide) return max || 22;
  return Math.min(max || 22, wide + Math.min(6, Math.ceil(wide * 0.25)));
}

function fillFor(key, authored, bank, { copyOnly = false } = {}) {
  const demo = String(authored == null ? "" : authored);
  const body = demo.trim();
  if (!body || body.length < 4) return "";                 // a spacer, not a text element
  if (CONFIG_KEY.test(key) || CONFIG_VALUE.test(body)) return "";
  if (!/[a-z]/i.test(body)) return "";                     // "01", "—", "038"
  // Single bare token ("dark", "bolt", "left") reads as an enum far more often
  // than as copy. A phrase — anything with a space, or capitalised/punctuated —
  // is text the design means to be read.
  if (!/\s/.test(body) && !/[.!?:—–,]/.test(body) && body.length < 12) return "";
  const upper = body === body.toUpperCase() && /[A-Z]/.test(body);
  // THE DESIGN'S MEASURE IS ITS WIDEST LINE, NOT ITS STRING LENGTH. 695 of the
  // 1334 slots this fill lands in are authored as display type broken on "|"
  // ("Begin with|empty paper.", "END OF|SHIFT."), and budgeting on the joined
  // string handed them roughly twice the width the layout draws — then wrote it
  // back as ONE line, because nothing put the breaks in. Measured across the
  // fleet: every one of those 695 came out single-line, 67% of them wider than
  // the widest authored line by half again and 33% more than double. Seen on a
  // rendered InkBrush hook: two half-width lines of authored copy became "Still
  // juggling five tools" running 55px to 1000px of a 1080px frame, straight
  // through the brush ornament.
  const rows = body.split("|").map((s) => s.trim()).filter(Boolean);
  const wide = Math.max(...rows.map((s) => s.length));
  // …and stay near that measure. "+6" is a rounding error on a 40-character
  // sentence and a 75% raise on an eight-character stamp, which is exactly where
  // it went wrong: authored defaults of 12 characters or less ran 34% over 1.5x
  // their own width and 20% over 2x, while 13+ ran 4% and 0%. A quarter longer,
  // capped at the six characters the old budget allowed, keeps the long case
  // identical and tightens only the short one.
  const per = Math.max(6, Math.min(110, wide + Math.min(6, Math.ceil(wide * 0.25))));
  const cut = bank.take(per * rows.length, { upper, copyOnly });
  if (!cut) return "";
  return rows.length > 1 ? breakTo(cut, per, rows.length) : cut;
}

// ---------------------------------------------------------------- copy bank
// Split a sentence into standalone clauses: "Design, code and AI — all
// disconnected." -> ["Design, code and AI", "all disconnected"]. Each piece has
// to survive on its own in a label slot, so the split points are the ones a
// writer would break on.
function phrases(text) {
  return String(text || "")
    .split(/[.;!?•\n]|\s[—–]\s|\s-\s|,\s(?=and\b|but\b|so\b|then\b)/)
    .map((s) => s.replace(/^[\s,:;—–-]+|[\s,:;—–-]+$/g, "").trim())
    .filter((s) => s.length > 2);
}

// WHY THIS EXISTS. The suppression passes below blank every authored slot this
// adapter has no mapping for — kicker, footer, odometer, sign descriptions,
// meta values, caption labels — because the authored default is the DEMO
// brand's words ("and 4,000 more teams"). That is right about the demo copy and
// wrong about the frame: a shipped 30s film (job agmoif2udy, pack "motorway")
// played nine beats as a two-word headline over 50-70% empty ground, because
// every supporting text element the design has was blanked to a single space.
//
// There was never a third option. This is it: write the FILM'S OWN words there.
// The bank collects every true line this scene can say — its bullets, its
// support line, the sentence the narrator speaks over it, the film's title —
// and hands each blank slot the longest one that still reads as a clean label
// at that slot's authored width. Nothing is invented (so the no-fabricated-
// claims rule below is untouched) and nothing repeats inside a scene.
function copyBank(sc, brand, filmTitle) {
  const seen = new Set();
  const out = [];
  // `chrome` = the film's furniture (its title, the brand). Fine as a stamp in a
  // corner slot the design draws small; NOT fine padding a rack of feature
  // pills, where three entries reading "Figma / Figma Ships Together / Figma"
  // is worse than two honest ones.
  const push = (v, chrome = false) => {
    const s = String(v || "").replace(/\s+/g, " ").trim();
    if (s.length < 3) return;
    const k = s.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push({ s, chrome });
  };
  for (const b of bullets(sc, 6)) push(b);
  push(sc.emphasis);
  push(sc.kicker);
  for (const p of phrases(sc.subtext)) push(p);
  push(sc.subtext);
  for (const p of phrases(sc.body)) push(p);
  for (const p of phrases(sc.voiceover)) push(p);
  push(sc.headline || sc.title);
  push(filmTitle, true);
  push(brand, true);
  return out;
}

// OM_COPY_FILL=0 restores the old blank-everything behaviour — the A/B switch
// the density harness measures against.
const COPY_FILL = process.env.OM_COPY_FILL !== "0";
// OM_TOPIC_MATCH=0 restores the old picture ranking (filename+alt word overlap
// only — no vision description, no section affinity, no repeat penalty).
const TOPIC_MATCH = process.env.OM_TOPIC_MATCH !== "0";

// A per-scene dispenser. `take(max)` returns the longest unused line that still
// reads clean at `max` characters (fitLabel returns "" for a mid-thought stump,
// so a slot never fills with "Inbox: pull"), and remembers what it handed out so
// one beat never says the same thing twice.
function makeBank(sc, brand, filmTitle, filmSpent) {
  const lines = copyBank(sc, brand, filmTitle);
  const spent = new Set();
  const norm = (s) => String(s || "").toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
  return {
    // Mark copy already written into the scene by the mapping pass, so a blank
    // slot never echoes the headline that is already on the frame.
    spend(v) { const k = norm(v); if (k) spent.add(k); },
    take(max, { upper = false, minChars = 3, copyOnly = false } = {}) {
      if (!COPY_FILL) return "";
      const budget = Math.max(4, Math.min(120, Number(max) || 0));
      // Two passes: everything this FILM has not said yet, then — only if the
      // beat would otherwise go blank — lines it has. Without the film-level
      // pass every beat reaches for the same strongest line and the title ends
      // up stamped on all nine frames.
      for (const fresh of [true, false]) {
        let best = "", bestKey = "";
        for (const { s: line, chrome } of lines) {
          if (chrome && copyOnly) continue;
          const key = norm(line);
          if (!key || spent.has(key)) continue;
          // CHROME MAY REPEAT — measured both ways. Barring the film's title and
          // brand from the relaxed pass sent every corner slot back to blank and
          // cost the fleet a third of its copy (64.0 -> 45.5 chars per beat), and
          // the slots it lands in are the ones a designer authored as a PERSISTENT
          // STAMP ("MILE 038", "CAM 01", "ROUTE 66") — a title sitting there every
          // beat reads as branding, not as repetition. The case that genuinely
          // read as padding was a RACK of pills filled with the brand three times,
          // and `copyOnly` already refuses chrome there.
          if (fresh && filmSpent && filmSpent.has(key)) continue;
          const cut = fitLabel(line, budget);
          if (!cut || cut.length < minChars) continue;
          if (cut.length > best.length) { best = cut; bestKey = key; }
        }
        if (best) {
          spent.add(bestKey); spent.add(norm(best));
          if (filmSpent) { filmSpent.add(bestKey); filmSpent.add(norm(best)); }
          return upper ? best.toUpperCase() : best;
        }
      }
      return "";
    },
  };
}
// The templates break headlines on "|" — give them the same two-line shape the
// authored copy has, or a long script line overruns its column.
function twoLines(text, max) {
  const t = fit(text, max);
  const w = t.split(/\s+/);
  if (w.length < 4) return t;
  const mid = Math.ceil(w.length / 2);
  return `${w.slice(0, mid).join(" ")}|${w.slice(mid).join(" ")}`;
}
// PORTRAIT slam headlines need SHORT lines. The reel/vertical templates draw the
// headline at a fixed ~190px inside a ~960px column with NO fit-to-width, so a
// long "|" segment (twoLines makes 12-16 char lines) runs straight off the edge
// and crops ("WAITING DAYS FOR MOTION" -> "WAITII"/"MOTIO"). Break portrait copy
// into up to 3 short lines instead — matching the authored "YOUR APP|GOES|VIRAL."
// shape — while the runtime autofit in the harness guarantees whatever is left
// still fits. Landscape columns are wide, so keep the original midpoint split.
function breakHeadline(text, max, land) {
  if (land) return twoLines(text, max);
  const t = fit(text, max);
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return t;
  const perLine = 9, maxLines = 3;   // ~9 char lines keep the slam BIG (short lines need little/no autofit shrink)
  const lines = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur.length + 1 + w.length) <= perLine) cur += ` ${w}`;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const head = lines.slice(0, maxLines - 1);
    head.push(lines.slice(maxLines - 1).join(" "));
    return head.join("|");
  }
  return lines.join("|");
}
// Give a filled slot the SHAPE its authored default has: `n` lines of at most
// `per` characters. Same "|" contract as breakHeadline, but the widths come from
// the design's own string instead of a portrait constant — and it never returns
// more than `n` lines, because the extra row is what pushes a block into
// whatever the layout draws beneath it.
function breakTo(text, per, n) {
  const words = String(text).split(/\s+/).filter(Boolean);
  if (words.length < 2 || n < 2) return String(text);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if (cur.length + 1 + w.length <= per) cur += ` ${w}`;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length <= n) return lines.join("|");
  const head = lines.slice(0, n - 1);
  head.push(lines.slice(n - 1).join(" "));
  return head.join("|");
}
function statsFor(scene) {
  const raw = Array.isArray(scene.stats) ? scene.stats : [];
  const out = [];
  for (const s of raw) {
    const v = Number(s && (s.v != null ? s.v : s.value));
    if (!isFinite(v)) continue;
    out.push({ v, suf: String(s.suf || s.suffix || ""), l: String(s.l || s.label || "").toUpperCase().slice(0, 20) });
    if (out.length >= 3) break;
  }
  return out;
}
// Numbers mined from the scene's OWN text (onScreenText/subtext), so a stats
// slide can only ever show figures the script actually stated. The suffix
// lookahead mirrors template_engine.mineStat: a unit must not steal the first
// letter of the next word ("12 months" is 12, not 12m-onths).
function minedStats(scene) {
  // The HEADLINE first: it is where a script puts the figure it wants shown
  // ("95% of Fortune 500"), and it was not being read at all — so a stat scene
  // mined the supporting sentence instead and shipped the wrong number.
  const lines = []
    .concat(scene.headline ? [String(scene.headline).replace(/\|/g, " ")] : [])
    .concat(Array.isArray(scene.onScreenText) ? scene.onScreenText : [])
    .concat(scene.subtext ? String(scene.subtext).split(/[.;\n]/) : []);
  const out = [];
  const seen = new Set();
  for (const raw of lines) {
    const s = String(raw || "");
    // TAKE THE MEASURED FIGURE, NOT THE FIRST DIGITS IN THE SENTENCE. The regex
    // is unanchored, so "Ninety five percent of the Fortune 500 use it" matched
    // 500 — and the label is built from the words AROUND the match, so the card
    // rendered "500" over "NINETY FIVE PERCENT". A number carrying a unit (%, x,
    // k, m, bn, +) is the claim; a bare number is usually part of a name
    // ("Fortune 500", "Studio 54", "G2"). Prefer the one with a unit and fall
    // back to the first bare number only when the line has none.
    const NUM = /([$₹€£]?)\s?(\d[\d,]*(?:\.\d+)?)(?:\s?(%|x|k|m|bn?|\+|★)(?![A-Za-z]))?/gi;
    let m = null;
    for (const cand of s.matchAll(NUM)) {
      if (cand[3] || cand[1]) { m = cand; break; }       // a unit or a currency mark = a real figure
      if (!m) m = cand;                                  // remember the first bare number as the fallback
    }
    if (!m) continue;
    const v = parseFloat(m[2].replace(/,/g, ""));
    if (!isFinite(v) || v > 10000000) continue;
    const key = `${v}${m[3] || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const label = `${s.slice(0, m.index)} ${s.slice(m.index + m[0].length)}`
      .replace(/[^\w\s.%-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 20);
    out.push({ v, suf: (m[3] || "").toUpperCase(), l: label.toUpperCase(), unit: !!(m[3] || m[1]) });
    if (out.length >= 3) break;
  }
  // A film that stated a real measurement shows measurements ONLY. Mixing
  // "95%" with the "500" scraped out of "Fortune 500" puts a meaningless card
  // next to the true one, labelled with the leftovers of the sentence it came
  // from ("NINETY FIVE PERCENT OF THE").
  const measured = out.filter((x) => x.unit);
  return (measured.length ? measured : out).map(({ v, suf, l }) => ({ v, suf, l }));
}

// ---- scene-slot casting ---------------------------------------------------------
// A template's scene list is a GRAMMAR, not a fixed reel: an opener, some content
// shapes, a closer. Classify each authored slot so the user's film keeps that
// dramatic arc at any length.
function classifySlots(tplScenes) {
  const isOutro = (t, i) =>
    i === tplScenes.length - 1 &&
    (Object.prototype.hasOwnProperty.call(t, "cta") || Object.prototype.hasOwnProperty.call(t, "url") ||
     /cta|outro|end|close/i.test(String(t.name)));
  const isIntro = (t, i) =>
    i === 0 &&
    (Object.prototype.hasOwnProperty.call(t, "brand") || Object.prototype.hasOwnProperty.call(t, "tagline") ||
     /title|intro|open|brand|logo|hook/i.test(String(t.name)));
  let intro = null, outro = null;
  const middle = [];
  tplScenes.forEach((t, i) => {
    if (!intro && isIntro(t, i)) { intro = t; return; }
    if (!outro && isOutro(t, i)) { outro = t; return; }
    middle.push(t);
  });
  if (!middle.length) middle.push(...tplScenes);   // degenerate template — never starve
  return { intro, outro, middle };
}

/**
 * Merge the user's storyboard into the template's authored scene sequence.
 *
 * The template's ARC is preserved — opener first, closer last — while its
 * CONTENT scenes repeat as needed to cover the user's storyboard. The previous
 * mapping was a plain modulo over the whole list, and on a 6-slot template an
 * 8-scene film re-ran the Title mid-film (it read as "the template restarted"),
 * fired the CTA at 17s, and ENDED on a content scene instead of the close.
 */
// DEMO FIGURES A COMPILED FILM FALLS BACK TO.
// The suppression pass below can only blank props the authored OM_SCENES
// DECLARE. A compiled film may also read props its scene data never mentions —
// `stats={s.meta || [{v:0.2,suf:'s',l:'to first result'},{v:40,suf:'K',l:'items
// indexed'}…]}` in Cadence — and those fall straight through to the demo value.
// That ships ANOTHER product's figures as if they were the customer's: a film
// for Trello claiming "40K items indexed". The bundle is gzipped, so this cannot
// be detected at runtime; each entry below was read from that template's source.
// An empty array is truthy, so it suppresses the `||` without drawing anything.
const HIDDEN_FALLBACK_PROPS = {
  // Audited against every template's source (2026-08-04). The line drawn here:
  // suppress anything that makes a CLAIM about the customer's product — a
  // statistic, a feature, a testimonial, another brand's voice — and KEEP pure
  // UI chrome, because chrome reads as design furniture while a claim reads as
  // a fact the customer is asserting.
  //
  // Kept on purpose: Cadence.filters (All/Recent/Mine/Shared tabs), Hacker's
  // boot/cmds/bars (a terminal with no text is not a terminal), Stomp.rows and
  // .lines (the type wall IS the design), Stomp.footer ("— AND THAT IS IT.",
  // generic and claim-free).
  Cadence: {
    meta: [],           // "0.2s to first result / 40K items indexed / 3 exact matches"
    chips: [],          // "Fuzzy matching / Filters / Saved searches" — feature claims
    avatarLabel: " ",   // "and 4,000 more teams" — a social-proof number that is not theirs
  },
  Showcase:         { spots: [] },   // numbered callouts: "One-click actions"
  ShowcaseVertical: { spots: [] },
  Launch:           { sub: " " },    // "Delivered — tail wags included." — the Fetch demo brand's voice
  FetchVertical:    { kicker: " " }, // "A GOOD BOY STORY" — ditto
};

function buildScenes({ tplScenes, scenes, assets, brand, url, tfx, land, accent, tplName, filmTitle }) {
  const { intro, outro, middle } = classifySlots(tplScenes);
  // Uppercase the COPY rather than relying on a CSS rule. These films are React
  // components that set type inline on their own elements, so a stylesheet hook
  // means guessing at their markup — and a guess that misses fails silently, with
  // the frame still looking plausible. Transforming the text is exact.
  const UP = String((tfx || {}).case || "").toLowerCase() === "upper";
  const up = (v) => (UP && typeof v === "string" ? v.toUpperCase() : v);
  // Same relevance order the family engine uses: a real product shot first, then
  // the director's own verdict (prominence + score + CLIP pixel-relevance).
  // Sorting on cdScore alone left every unscored asset tied at 0, which put
  // arrival order back in charge of what lands in the picture cards.
  const omRank = (a) => (isShot(a) ? 60 : 0)
    + (a.cdProminence === "hero" ? 25 : a.cdProminence === "support" ? 12 : 0)
    + (Number(a.cdScore) || 0)
    + (typeof a.clipRelevance === "number" ? a.clipRelevance * 30 : 0);
  // STOCK IS A FALLBACK, NOT AN INGREDIENT — but a fallback still has to EXIST.
  //
  // The rule used to be enforced by DELETION: four or more site assets and every
  // Pixabay/Pexels image was filtered out of the pool entirely. That is a cliff,
  // not a preference — measured on an 8-scene film with 6 screenshots + 9 stock
  // photos + 4 vectors supplied, the finished composition carried 6 assets, all
  // screenshots, ZERO stock, ZERO vectors; the same film with 3 screenshots
  // carried 11. The 4th capture was DELETING nine fetched photos, and the scenes
  // that lost them did not go quiet — they recycled the same screenshot again or
  // drew the hatched placeholder, and `picturesLeft()` below stopped casting
  // media shapes at all, so the film also lost its picture-carrying beats.
  //
  // Rank instead of delete. Tiers keep the original intent exactly — a real
  // capture or the site's own image is always chosen before a stock photo, so
  // stock can still never outbid owned material for a hero card — while leaving
  // the stock underneath as fresh material for the slots owned assets don't
  // reach. Vectors sit in the last tier: after every photograph, ahead of a
  // repeat.
  const all = (Array.isArray(assets) ? assets : []).filter((a) => plateOk(a) && !isBrandMark(a));
  const isSiteAsset = (a) => {
    const s = String((a && a.source) || "").toLowerCase();
    return isShot(a) || s === "website-image" || s === "blog";
  };
  const isStock = (a) => /pixabay|pexels|openverse|unsplash|stock/.test(String((a && a.source) || "").toLowerCase());
  // THE USER'S OWN UPLOADS OUTRANK EVERYTHING — including a site capture.
  //
  // This tier ladder put an upload at 2, BELOW a screenshot at 3, and the pool is
  // sorted tier-first. So on any job that had screenshots, the images the user
  // deliberately supplied through BRAND ASSETS were the last photographs the walk
  // would reach — and with a template whose slots the screenshots already filled,
  // they were never drawn at all. Measured: two uploads, both admitted, both
  // drawn zero times, while one screenshot was drawn twenty.
  //
  // asset_priority is the single source of truth for this hierarchy (upload 100 >
  // website-brand 90 > website 80 > curated 60 > stock 40) and it exists exactly
  // so this ordering stops being re-derived, differently, in each renderer.
  // Scoped to uploads so a job without them sorts byte-identically to before.
  const isUpload = (a) => String((a && a.source) || "").toLowerCase() === "upload";
  const tierOf = (a) => (isUpload(a) ? 4 : isSiteAsset(a) ? 3 : isStock(a) ? 1 : 2);
  const pool = all.slice().sort((a, b) => (tierOf(b) - tierOf(a)) || (omRank(b) - omRank(a)));
  // Vectors are kept in their OWN pool rather than appended to this one. Ranked
  // last inside a single pool they are unreachable in practice — a real job
  // supplies more photographs than the film has picture slots, so the walk never
  // gets to them (measured on a live render: 6 photos + 2 vectors supplied, both
  // vectors unused). They are drawn instead from a reserved cadence below, which
  // guarantees graphic art a place without letting it outbid a photograph.
  // A brand mark is graphic art too, but it is owed to ONE beat — the one that
  // says its name — so it is kept out of a cadence that would spend it on
  // whichever wall comes next.
  const vecPool = (Array.isArray(assets) ? assets : []).filter((a) => isVectorAsset(a) && !isBrandMark(a));
  let vi = 0;
  const takeVec = () => (vi < vecPool.length ? vecPool[vi++] : null);
  // Which media wall we are on, for the one-in-three vector cadence.
  let wallNo = 0;
  // …and nothing fetched from the icon CDN is the customer's mark, whatever its
  // alt says — the film's logo comes from its own site or its own upload.
  const logo = (Array.isArray(assets) ? assets : [])
    .find((a) => isLogo(a) && !isBrandMark(a) && String(a.source || "").toLowerCase() !== "iconify") || null;
  // THE BEAT THAT SAYS THE NAME IS THE BEAT THAT SHOWS THE MARK. Pinned by
  // sceneId, like the screenshot director's captures; an UNPINNED mark is dropped
  // rather than guessed onto a beat. Marks are spent per scene, so a narrated
  // beat that CUTS into two template beats (see the pace splitter) draws its row
  // of marks once instead of stamping the same logos on both halves.
  const marksByScene = new Map();
  for (const a of (Array.isArray(assets) ? assets : [])) {
    if (!isBrandMark(a) || a.sceneId == null) continue;
    const sid = String(a.sceneId);
    const list = marksByScene.get(sid) || [];
    if (list.length >= 3 || list.some((x) => x.path === a.path)) continue;
    list.push(a);
    marksByScene.set(sid, list);
  }
  const markSpent = new Set();
  const marksFor = (sc) => {
    const sid = sc && sc.id != null ? String(sc.id) : null;
    return sid && !markSpent.has(sid) ? (marksByScene.get(sid) || []) : [];
  };
  const byScene = new Map();
  const free = [];
  for (const a of pool) {
    if (a === logo) continue;
    const sid = a.sceneId != null ? String(a.sceneId) : null;
    if (sid && !byScene.has(sid)) byScene.set(sid, a); else free.push(a);
  }
  let fi = 0;
  // Every asset actually placed in a slot, in placement order — the recycle
  // pool for scenes/walls that outnumber the supply.
  const used = [];
  let recycleAt = 0;
  // The picture the PREVIOUS beat drew. Two consecutive cuts on the same capture
  // read as a stall — the voice moves on, the frame does not.
  let lastShot = null;
  // Every line the copy bank has already put on a frame, film-wide. Without it
  // each beat reaches for the same strongest line and the film's title ends up
  // stamped in the corner of all nine.
  const filmSpent = new Set();
  // Prominent candidates first: an asset the director demoted to "background"
  // is one it judged weak or off-topic, and these templates have no dim scrim
  // rung — whatever this returns is shown full-bleed in a picture card.
  const omDemoted = (a) => a.cdProminence === "background" || a.visionOk === false;
  const take = (pred) => {
    for (const strict of [true, false]) {
      for (let k = fi; k < free.length; k++) {
        const a = free[k];
        if (strict && omDemoted(a)) continue;
        if (!pred || pred(a)) { free.splice(k, 1); return a; }
      }
    }
    return null;
  };

  // RELEVANCE, not just rank. `take` walks the pool in quality order, so a beat
  // about automation could be handed the pricing capture purely because it
  // scored higher — the "irrelevant screenshot" in a finished film. The
  // screenshot director already names each capture ("…the automation page"), and
  // the file keeps that name, so the page a scene is TALKING about is
  // recoverable. Pick the best-matching candidate; fall back to plain order when
  // nothing overlaps, so this can only ever improve on the previous choice.
  const STOP = new Set(["the", "a", "an", "and", "or", "for", "with", "your", "our", "this",
    "that", "page", "of", "to", "in", "on", "it", "is", "are", "you", "we", "all", "every",
    // Boilerplate that appears in EVERY caption on a website job, so matching on
    // it scores every asset identically and the ranking collapses to pool order.
    "real", "website", "screenshot", "image", "photo", "product", "present", "styled",
    "browser", "frame", "hero", "treatment", "matches", "scene", "topic", "unpinned",
    // Prepositions and filler carry no subject, and leaving one out is enough to
    // score a decorative image onto a beat: an alt reading "testimonials from
    // Zoom" matched a line containing "from", and that single word was the whole
    // match. Kept in step with asset_sources-side scene_match.js.
    "from", "into", "onto", "over", "under", "after", "before", "than", "then",
    "its", "their", "them", "they", "was", "were", "been", "being", "have", "has",
    "had", "will", "would", "can", "could", "should", "more", "most", "just", "also"]);
  const wordsOf = (s) => String(s || "").toLowerCase().match(/[a-z0-9]{3,}/g) || [];
  // WHAT THE BEAT IS ABOUT. The narration was missing from this list, which is
  // most of the reason a scene and its picture could disagree: on a website film
  // the headline is 2-4 words ("SHARED CONTEXT") while the voiceover carries the
  // subject in full ("One workspace for your entire product development
  // process."). Match on what the film is SAYING, not just what it is shouting.
  const sceneTerms = (sc) => new Set([
    ...wordsOf(sc.headline), ...wordsOf(sc.title), ...wordsOf(sc.subtext),
    ...bullets(sc, 4).flatMap(wordsOf), ...wordsOf(sc.kicker), ...wordsOf(sc.purpose),
    ...(TOPIC_MATCH ? [...wordsOf(sc.voiceover), ...wordsOf(sc.body), ...wordsOf(sc.emphasis)] : []),
  ].filter((w) => !STOP.has(w)));
  // WHAT THE PICTURE ACTUALLY SHOWS. Scoring used the FILENAME and `alt` only —
  // and on the project path every capture is written as `site_0.png`…`site_5.png`
  // with a boilerplate alt, so both sources carried no topic at all and every
  // candidate tied at zero. Ties fall back to pool order, which is arrival order:
  // that is precisely the "random screenshots" complaint. The asset director
  // already records what it SAW in the image (`sees`), which section of the site
  // it came from (`sectionType`), and the query it was fetched for — all of it
  // topical, none of it used until now.
  const WEIGHTS = TOPIC_MATCH
    ? [["sees", 1.6], ["alt", 1.2], ["query", 1.2], ["sectionType", 1.0], ["url", 0.9], ["file", 0.7]]
    : [["alt", 1], ["file", 1]];
  const assetTermWeights = (a) => {
    const src = {
      sees: a.sees,
      alt: a.alt,
      query: a.query || a.searchQuery,
      sectionType: a.sectionType,
      url: String(a.pageUrl || a.sourceUrl || "").replace(/https?:\/\/[^/]+/, "").replace(/[/_-]+/g, " "),
      file: String(a.path || "").split("/").pop().replace(/^page_\d+_/, "").replace(/\.\w+$/, ""),
    };
    const m = new Map();
    for (const [k, w] of WEIGHTS) {
      for (const t of wordsOf(src[k])) {
        if (STOP.has(t)) continue;
        if ((m.get(t) || 0) < w) m.set(t, w);
      }
    }
    return m;
  };
  const assetTerms = (a) => new Set(assetTermWeights(a).keys());
  // A beat's PURPOSE says which part of a site belongs on it — proof beats want
  // the logo wall and the testimonial, the close wants the sign-up, the opener
  // wants the hero. This is the topical link a word overlap cannot make (the
  // testimonial capture rarely repeats the narrator's nouns).
  const SECTION_FOR = {
    hook: /hero|home|landing/i, title: /hero|home|landing/i,
    context: /hero|features|about/i, problem: /hero|features|about/i,
    feature: /features|product|how|solution/i, demo: /features|product|how/i,
    proof: /testimonial|logos|customers|social|stats/i, testimonial: /testimonial|logos|customers|social/i,
    stat: /stats|testimonial|logos|customers/i,
    pricing: /pricing|plans/i,
    cta: /cta|signup|sign-up|footer|pricing/i, close: /cta|signup|footer/i,
  };
  const sectionBonus = (sc, a) => {
    const want = SECTION_FOR[String(sc.purpose || sc.kind || "").toLowerCase()];
    return want && want.test(String(a.sectionType || "")) ? 1.5 : 0;
  };
  // One number every picture decision now shares. `used` is the repeat penalty:
  // a fresh, weaker asset beats showing the same capture a third time, which is
  // how one screenshot ended up on six of fourteen beats in a shipped film.
  const matchScore = (sc, a, { penalizeUsed = true } = {}) => {
    const terms = sceneTerms(sc);
    let score = 0;
    if (terms.size) for (const [t, w] of assetTermWeights(a)) if (terms.has(t)) score += w;
    if (!TOPIC_MATCH) return score;                         // OM_TOPIC_MATCH=0 — the pre-fix ranking, for A/B
    score += sectionBonus(sc, a);
    if (typeof a.clipRelevance === "number") score += a.clipRelevance * 0.8;
    if (penalizeUsed && used.includes(a)) score -= 2.5;
    if (a === lastShot) score -= 1.5;                       // never twice in a row when anything else exists
    return score;
  };
  const takeFor = (sc, pred) => {
    let best = 0, bestI = -1;
    for (let k = fi; k < free.length; k++) {
      const a = free[k];
      if (omDemoted(a)) continue;
      if (pred && !pred(a)) continue;
      const score = matchScore(sc, a, { penalizeUsed: false });   // `free` is unplaced by definition
      if (score > best) { best = score; bestI = k; }
    }
    if (bestI >= 0) { const a = free[bestI]; free.splice(bestI, 1); return a; }
    return take(pred);
  };

  // Which authored slot renders user scene i:
  //   first  -> the opener (when the template has one)
  //   last   -> the closer (when the template has one)  — the film always ENDS
  //             on the CTA; it never fires mid-film and Title never re-runs
  //   middle -> the content shapes, cycled — but only shapes the scene can FILL.
  //             A statless scene on the Stats slide (or a bulletless one on a
  //             chips slide) renders acres of nothing; walk forward to the first
  //             shape whose demands the scene's own copy meets.
  // `soft` relaxes the LIST/STAT requirements while keeping every guard that
  // prevents a blank frame (media walls, picture-only shapes, headline-primary
  // shapes). It exists because strictness starves variety: FlightVertical offers
  // four middle shapes, but against a sparse scene only "Takeoff" qualified, so
  // the rotation reset once per beat and the film spent 7 of 12 beats on it.
  // A Climb with blank chips still shows its eyebrow and headline — far better
  // than a seventh Takeoff.
  const canFill = (t, sc, soft) => {
    const hasK = (k) => Object.prototype.hasOwnProperty.call(t, k);
    // A MEDIA WALL WITH NO MEDIA IS AN EMPTY FRAME. These shapes draw two to six
    // picture cards and, with nothing to put in them, the compiled film paints
    // its hatched "DROP IMAGE TO REPLACE" placeholder — the empty screenshot
    // cards seen in finished films. A wall is only castable while real pictures
    // are still unclaimed; when the pool is dry the scene takes a text shape
    // instead, which is always better than a frame of empty boxes.
    const picturesLeft = () => (free.length - fi) + (byScene.size ? 1 : 0);
    // A wall can also be filled by RECYCLING a picture already placed earlier —
    // the wall loop below does exactly that (`place(take()) || recycle()`). The
    // old test only counted FRESH pictures, so the moment the pool ran dry every
    // wall-named shape became permanently uncastable. That is not a small loss:
    // MEDIA_WALL matches on the shape's NAME, and names like Fleet, Billboards,
    // Line, Assemble and Deploy match it, so on a six-shape template it removed
    // half the vocabulary mid-film and casting collapsed onto whatever was left.
    // Measured: Drive cast "Intro > Fleet > Billboards > Feature > Feature >
    // Feature > Feature > Feature > CTA" — the same slide five times running.
    //
    // So a dry pool only blocks a wall in the STRICT tier. Under `soft` — which is
    // only reached when every other shape has already been refused — a wall that
    // can recycle a real picture is allowed, because a second look at a picture
    // the film has already shown reads far better than the identical slide again.
    const canRecycle = () => used.length > 0;
    if (MEDIA_WALL.test(String(t.name || "")) && picturesLeft() < 1 && !(soft && canRecycle())) return false;
    // …and the same for a shape that is a PICTURE plus a caption and nothing
    // else. Reel's `Show` declares only `caption`, so with the pool dry it casts
    // happily and renders a frame containing one blank line — the "empty slide"
    // in a finished film. A shape with no substantive text slot of its own has
    // nothing to say without a picture.
    const TEXT_SLOTS = ["headline", "title", "words", "lines", "body", "sub", "subtext", "quote",
      "eyebrow", "kicker", "lead", "cta", "stats", "value", "items", "chips", "tags",
      "rows", "steps", "tools", "notes", "msgs", "cols", "states", "results", "cards", "blocks"];
    const carriesText = Object.keys(t).some((k) => TEXT_SLOTS.includes(k));
    if (!carriesText && picturesLeft() < 1) return false;
    // NEVER relaxed by `soft`. A number card without a number can only fabricate
    // one or break: relaxing this cast a Stats shape onto a scene with no figures,
    // asSlot filled its label and dropped the numeric field, and the film rendered
    // a giant red "NaN". The other soft relaxations degrade to a blank row; this
    // one degrades to garbage on screen.
    if (hasK("stats") && !(statsFor(sc).length || minedStats(sc).length)) return false;
    // …AND THE SAME SHAPE WITHOUT THE ARRAY. A gauge/dial/ring declares its
    // figure as a SCENE-LEVEL NUMBER (SteamSpring's Ring is {to:41, unit:"°",
    // label:"AT THE ROCK POOL"}), which this guard did not look at, so a
    // figure-less scene was cast onto it and the ring counted up to whatever the
    // compiled component falls back to — a number about another product,
    // captioned with this film's words. Measured on a shipped film: a ring
    // reading "100" labelled "AND PRIORITY SET".
    if (numberSlots(t).length && !(statsFor(sc).length || minedStats(sc).length)) return false;
    if (!soft && (hasK("chips") || hasK("items")) && bullets(sc, 2).length < 2) return false;
    // LIST-DRIVEN SHAPES (Cadence: Search results, Onboard steps, Connect tools,
    // Board columns, Morph states, Notify notes, Thread messages, Digest rows).
    // Each draws a rack of rows and nothing else — cast a scene with no list of
    // its own and the frame is an empty card. Two bullets is the floor.
    for (const k of ["results", "steps", "tools", "notes", "rows", "msgs", "cols", "states"]) {
      if (!soft && hasK(k) && bullets(sc, 2).length < 2) return false;
    }
    // A METRIC slide is a single huge number. Without a TRUE one it would either
    // render 0 or borrow the demo's figure, so it only accepts a scene that
    // carries a real stat.
    if (hasK("value") && !(statsFor(sc).length || minedStats(sc).length)) return false;
    // A shape whose PRIMARY slot is a headline cannot be filled by a scene with
    // no headline, title or bullets to make one from — it renders a blank
    // column. (Measured: a quote-only testimonial cast onto Cadence's `Live`
    // shape produced an empty headline AND empty meters, because a quote is not
    // a headline.) Shapes that carry their own primary slot — words / quote /
    // eyebrow — are exempt; they are handled below.
    const canLine = () => !!(sc.headline || sc.title || bullets(sc, 1).length);
    if (hasK("headline") && !canLine()) return false;
    // A pull-quote shape needs something quotable.
    if (hasK("quote") && !(sc.quote || sc.subtext || sc.voiceover)) return false;
    // LABELLED meters ([label, fraction] pairs, e.g. Cadence's `Live`) draw one
    // row per bullet — with none they render an empty card. An abstract
    // sparkline (a flat array of numbers) needs nothing and is exempt.
    if (!soft && hasK("bars") && Array.isArray(t.bars) && Array.isArray(t.bars[0]) && bullets(sc, 1).length < 1) return false;
    // A PRICING rack needs tier names AND prices. Nothing in a generic storyboard
    // supplies those, and inventing them would put fabricated prices on screen —
    // so it is cast only for a scene that is genuinely about pricing and carries
    // its own numbers.
    if (hasK("plans")) {
      const txt = `${sc.headline || ""} ${sc.subtext || ""} ${sc.body || ""} ${bullets(sc, 4).join(" ")}`.toLowerCase();
      if (!/\bprice|pricing|plan|tier|\$|\/mo|per month|per seat|per person|free\b/.test(txt)) return false;
      if (bullets(sc, 2).length < 2) return false;
    }
    return true;
  };
  // THE TEMPLATE IS A REFERENCE, NOT A LOOP.
  //
  // This used to be a plain modulo over the content shapes, so a film longer
  // than the template simply replayed it: a 6-shape template under a 14-scene
  // film ran 1-2-3-4-5-6-1-2-3-4-5-6-… and the second half was visibly the first
  // half again. That is the single loudest "cheap" tell in a long film.
  //
  // Instead: exhaust every distinct shape the scene can actually fill before ANY
  // shape comes back, and when the template's vocabulary genuinely runs out,
  // continue in the same visual language rather than restarting it — each new
  // pass walks the shapes from a different offset and in the opposite direction,
  // so the recurrence never lands on the same beat or in the same order, and the
  // copy/media in it are this scene's own. The look stays the template's; the
  // sequence does not repeat.
  const shotCount = pool.filter(isShot).length;
  const orderFor = (p) => {
    const idx = middle.map((_, n) => n);
    if (p <= 0) {
      // REACH THE SCREENSHOT SHAPE. Pass 0 walks the shapes as authored, so a
      // media rack sitting late in a long template is never reached by a film
      // with fewer scenes than the template has shapes — Cadence's Showcase is
      // authored 13th, so an 11-scene film cast Search/Onboard/Board/… and the
      // ONE shape that puts real product screenshots on screen was never used.
      // Measured on a real film: six Linear screenshots captured and scored
      // 84-92, zero of them on screen.
      //
      // So when the film HAS real screenshots to show, pull the first media rack
      // forward to just after the opening two content beats — early enough to be
      // reached, late enough that the film still opens the way it was authored.
      // Everything else keeps its authored order.
      if (shotCount >= 2) {
        const w = idx.find((n) => MEDIA_WALL.test(String(middle[n].name)));
        if (w != null && idx.indexOf(w) > 2) {
          const rest = idx.filter((n) => n !== w);
          return [...rest.slice(0, 2), w, ...rest.slice(2)];
        }
      }
      return idx;                                            // pass 0 = as authored
    }
    // Rotate by ONE per pass (a stride that shares no factor with the list
    // length, so consecutive passes can't land on the same rotation) and flip
    // direction on odd passes — together that gives 2×len distinct orders,
    // more than the 30-scene ceiling can consume.
    const off = p % middle.length;
    const rot = idx.slice(off).concat(idx.slice(0, off));
    return p % 2 ? rot.reverse() : rot;
  };
  let pass = 0;
  let passUsed = new Set();
  let passOrder = orderFor(0);
  let lastName = null;
  // Set to the real beat count before mapping. The arc is anchored to the film's
  // FIRST and LAST cut, and a cut is no longer one-per-narrated-scene, so
  // counting source scenes here would fire the closer partway through.
  let totalBeats = scenes.length;
  const slotFor = (i, sc) => {
    const last = totalBeats - 1;
    if (i === 0 && intro) return intro;
    if (i === last && outro) return outro;
    // RESPECT THE TEMPLATE'S OWN PACING. Each authored shape carries the `dur`
    // its animation was designed to play at (and, on the opening beats, a `nat`
    // = its natural full length). Our films override every duration with the
    // script's, so a shape authored to breathe over 4s can be handed a 2s slot
    // and play truncated. Prefer, on the first sweeps, a shape whose authored
    // pace actually fits the slot the script gives it.
    //
    // A PREFERENCE, never a requirement: the sweeps below relax it before
    // anything else, so this can reorder casting but can never starve it.
    const slotSec = Math.max(1.2, Number(sc.duration) || 4);
    const pacesOk = (t) => {
      const authored = Number(t.dur) || 0;
      if (!authored) return true;                 // shape declares no pace — no opinion
      return authored <= slotSec * 1.35;          // 35% compression is the most we ask of an animation
    };
    // Sweeps per pass, each dropping one preference. ORDER MATTERS, and it was
    // wrong: "allow a back-to-back twin" (noTwin:false) used to be tried BEFORE
    // "relax the fill requirements" (soft:true). So the moment a scene's copy
    // could satisfy only ONE shape, casting preferred showing that shape AGAIN
    // over trying a different shape with its optional slots relaxed — and since
    // the pass then resets with the same scene shapes still unfillable, it did it
    // again, and again. Measured across the bundle: Drive cast the SAME "Feature"
    // slide FIVE TIMES IN A ROW, Pipeline four, Hacker three.
    //
    // A different shape with a thinner row beats the identical slide twice. So
    // every no-twin option — strict and soft — is exhausted before a twin is
    // allowed at all:
    //   1. pace fits, fills strictly, not a twin
    //   2. fills strictly, not a twin
    //   3. fills SOFTLY, not a twin        <- was #4, now ahead of any twin
    //   4. fills strictly, twin allowed
    //   5. fills softly, twin allowed      — a scene always lands somewhere
    // `guard` bounds the walk to one extra pass.
    // WITHIN A SWEEP, GIVE THE COPY THE ROOM IT HAS. Every candidate in a sweep
    // is already legal — same pass, same fill rules, same anti-twin guard — so
    // taking the FIRST one in rotation order was an arbitrary choice between
    // equals, and it routinely picked the thinnest. A scene arriving with a
    // support line, three labels and a figure would land on a two-slot Statement
    // (title + sub) while a Toggle or Feature sat unused later in the same
    // rotation, and the copy it could not show simply never appeared: measured on
    // a shipped film, 48% of the frame height carrying nothing while the scene
    // held three unused labels.
    //
    // Rotation is still what ORDERS the sweep (passUsed keeps a shape to one use
    // per pass, so variety is unchanged across the film) — this only decides
    // which of the equally-legal shapes in THIS sweep gets the beat.
    const roomFor = (t) => {
      let score = 0;
      for (const [k, v] of Object.entries(t)) {
        if (k === "name" || k === "dur" || k === "nat") continue;
        if (typeof v === "string") score += 1;
        else if (Array.isArray(v)) score += Math.min(v.length, 4) * 1.5;   // a rack shows several lines at once
        else if (typeof v === "number") score += 1;
      }
      return score;
    };
    // …AND A BEAT THAT NAMES PRODUCTS WANTS THE SHAPE THAT CAN SHOW THEM. The
    // only surface in these templates that can hold a mark is a media wall's
    // trailing tiles: the lone `shot` is drawn inside browser chrome on most
    // shapes, and a logo in a URL bar claims the mark IS the product's screen.
    // So when this beat has marks pinned to it, a wall wins the tie — same
    // mechanism roomFor uses, and on the same terms: every candidate scored here
    // has already passed canFill, the pace rule and the anti-twin guard, so this
    // only reorders shapes the template was equally willing to cast. A template
    // with no wall shape simply never has a candidate to prefer, and the marks go
    // unshown rather than displacing the beat's picture.
    const wantsMarks = marksFor(sc).length > 0;
    const marksBonus = (t) => (wantsMarks && MEDIA_WALL.test(String(t.name || "")) ? 1000 : 0);
    for (let guard = 0; guard <= middle.length + 1; guard++) {
      for (const [wantPace, noTwin, soft] of [[true, true, false], [false, true, false], [false, true, true], [false, false, false], [false, false, true]]) {
        let pick = -1, pickScore = -1;
        for (const n of passOrder) {
          if (passUsed.has(n)) continue;
          const t = middle[n];
          if (!canFill(t, sc, soft)) continue;
          if (wantPace && !pacesOk(t)) continue;
          if (noTwin && lastName && t.name === lastName) continue;
          const score = roomFor(t) + marksBonus(t);
          if (score > pickScore) { pickScore = score; pick = n; }
        }
        if (pick >= 0) {
          passUsed.add(pick);
          lastName = middle[pick].name;
          return middle[pick];
        }
      }
      // Nothing left in this pass that this scene can fill — open a new one.
      pass += 1;
      passUsed = new Set();
      passOrder = orderFor(pass);
    }
    return middle[passOrder[0]] || tplScenes[0] || {};
  };

  // ---- PACE: CUT ON THE TEMPLATE'S OWN RHYTHM --------------------------------
  // These films key every animation to progress WITHIN a scene, so holding a
  // scene longer than it was authored for plays its motion in slow motion.
  // Measured against the authored decks: Birdsong runs 1.91s per scene, Stomp
  // 2.56s, Cadence 3.33s — while a 30s film with six narrated beats hands each
  // scene 5s. That is 1.5x-2.6x slower than designed, which is exactly why the
  // films drag.
  //
  // The fix is the one an editor would reach for: keep the narration untouched
  // and CUT MORE OFTEN. A long narrated beat becomes two or three template beats
  // of native length, each on a different shape (slotFor already refuses to
  // repeat a shape). Total duration is unchanged, so audio stays in sync — the
  // film simply stops sitting on a held frame while the voice keeps going.
  const nativeDurs = tplScenes.map((t) => Number(t.dur) || 0).filter((d) => d > 0);
  const nativePace = nativeDurs.length
    ? nativeDurs.reduce((a, b) => a + b, 0) / nativeDurs.length
    : 3;
  // Never below 1.6s — under that a beat reads as a flicker rather than a cut.
  //
  // And, in VERTICAL, never above 3s. Some templates are authored at a ~5s stroll
  // (Showcase, Reel, Fetch, Flight); matching that pace faithfully still yields a
  // 5s-per-cut film, which is the "the templates are very slow" complaint even
  // though every scene plays exactly as authored. Capping the target splits those
  // strolls in two, so an authored 4.4-5.2s scene plays in 2.5s — 1.7-2x quicker,
  // on two different shapes instead of one held frame. Total duration is
  // untouched, so the narration stays in sync.
  //
  // Landscape keeps the authored pace: the brief was to speed up the vertical
  // templates, and a wider frame carries a held shot far better than a phone does.
  const beatTarget = land
    ? Math.max(1.6, nativePace)
    : Math.min(3, Math.max(1.6, nativePace));
  // What the NEXT scene will headline — used to stop a beat pre-empting it.
  const nextHeadOf = (sc) => {
    const idx = scenes.indexOf(sc);
    const nx = idx >= 0 ? scenes[idx + 1] : null;
    return nx ? (nx.headline || nx.title || "") : "";
  };

  // ADVANCE THE THOUGHT, DON'T REPEAT IT. Splitting a narrated sentence into two
  // cuts gave both cuts the SAME copy: a film read "CHAOS? / CHAOS? / SCATTERED
  // WORK / SCATTERED WORK". The picture stops moving with the voice — a new shape
  // arrives carrying no new information, which is what "the slides don't match the
  // voiceover" looks like from the outside.
  //
  // So each part of a split shows a different FACET of the same scene: the
  // headline lands first, then its supporting line. Everything stays inside the
  // scene's own copy, so the screen still says what the narrator is saying.
  const partView = (sc, part, of, nextHeadline) => {
    if (!of || of < 2 || !part) return sc;
    // The support line becomes a HEADLINE, and a headline slot truncates: feeding
    // it the whole subtext produced "EMAIL, CHATS AND LISTS PULL YOUR TEAM". Only
    // short, self-contained lines qualify — bullets first, then the subtext's
    // opening clause if it stands alone.
    const SHORT = 38;
    // A promoted line becomes a HEADLINE — the biggest type on the frame — so it
    // has to be a whole thought. Mined bullets are not always: "Slack & Teams in"
    // and "into your calendar" both reached finished films as headlines, one
    // ending mid-phrase and one starting mid-phrase. Reject either.
    const EDGE = /^(of|the|a|an|and|or|to|into|onto|for|with|within|in|on|at|by|from|as|but|so|is|are|was|were|be|it|its|it'?s|that|this|your|our|their|per|via|plus)$/i;
    const whole = (s) => {
      const w = String(s).trim().split(/\s+/).filter(Boolean);
      if (w.length < 2) return false;
      const bare = (x) => x.replace(/[^\w']/g, "");
      return !EDGE.test(bare(w[0])) && !EDGE.test(bare(w[w.length - 1]));
    };
    const alt = [];
    for (const b of bullets(sc, 4)) {
      const s = String(b).trim();
      if (s && s.length <= SHORT && whole(s)) alt.push(s);
    }
    const sub = String(sc.subtext || "").trim();
    if (sub) {
      const clause = sub.split(/[.;:—]|,\s(?=and\b|but\b)/)[0].trim();
      if (clause && clause.length <= SHORT && whole(clause)) alt.push(clause);
    }
    // Never promote a line the NEXT scene is about to headline, or this scene's
    // own headline: either way the film says the same words twice in a row, which
    // is the echo the de-duplication above cannot see (it happens ACROSS scenes).
    const key = (x) => String(x || "").toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
    const taken = new Set([key(sc.headline), key(nextHeadline)].filter(Boolean));
    const usable = alt.filter((x) => !taken.has(key(x)));
    const lead = usable[(part - 1) % Math.max(1, usable.length)];
    if (!lead) return sc;
    const view = { ...sc };
    // The support line becomes this beat's headline; the original headline steps
    // back to the sub so the beat still reads as part of the same thought.
    view.headline = lead;
    view.title = lead;
    view.subtext = sc.headline || sc.subtext;
    // Rotate the list so a later beat's pills aren't the earlier beat's pills.
    if (Array.isArray(sc.bullets) && sc.bullets.length > 1) {
      view.bullets = sc.bullets.slice(part).concat(sc.bullets.slice(0, part));
    }
    if (Array.isArray(sc.chips) && sc.chips.length > 1) {
      view.chips = sc.chips.slice(part).concat(sc.chips.slice(0, part));
    }
    return view;
  };

  // A CUT IS ONLY WORTH MAKING IF IT LANDS ON A FRESH SHAPE. FetchVertical ships
  // six authored scenes; splitting a 9-scene narration into 17 beats used its
  // "Fetch" shape seven times, and that shape reveals its copy in the last fifth
  // of its authored 4.5s window — so at 2s a beat it read as empty park scenery
  // with the headline flashing by at the very end. Faster cutting has to stay
  // inside what the shape pool can carry, or it manufactures the empty slides it
  // was meant to remove.
  // Count the shapes this NARRATION can actually cast, not the shapes the
  // template ships. FlightVertical offers four middles, but against a storyboard
  // with no figures its Instruments (a number card) and Cruise (a picture wall)
  // are both unfillable, leaving two — and budgeting for four then forced the
  // rotation to reuse one of them five times.
  const castable = middle.filter((t) => scenes.some((sc) => canFill(t, sc, true))).length;
  const shapePool = Math.max(1, castable || (tplScenes.length - 2));
  const beatBudget = Math.max(scenes.length, Math.round(shapePool * 2.5) + 2);
  const beats = [];
  const plan = scenes.map((sc) => {
    const dur = Math.max(1.2, Number(sc.duration) || 4);
    // Round UP, not to nearest. Rounding to nearest left the common case unsplit:
    // real narration lands near 4.1s per scene, and round(4.1/3) is 1, so a film
    // kept a 4.1s held frame while the target said 3s. Cap at 3 splits — past that
    // one narrated sentence turns into a montage.
    // Two parts, never three. A narrated sentence has a point and a supporting
    // detail; cutting it into three means the third cut repeats, and three cuts
    // per sentence is what made the picture feel like it was racing the voice.
    let n = Math.max(1, Math.min(2, Math.ceil(dur / beatTarget)));
    // ...and each part needs 2s to land. Below that the eye is still arriving
    // when the cut comes, which reads as the visuals being out of step even
    // though the timing is exact.
    while (n > 1 && dur / n < 2.0) n--;
    // ONLY CUT IF THERE IS SOMETHING NEW TO CUT TO. A stat scene carries one
    // figure and no supporting line, so splitting it just showed "75% VALUE IN 30
    // DAYS" twice in a row — a cut that hands the viewer nothing.
    if (n > 1 && partView(sc, 1, n, nextHeadOf(sc)) === sc) n = 1;
    // A MERGED BEAT CUTS ON THE SCENE BOUNDARY, NOT IN THE MIDDLE.
    //
    // fitBeats folds adjacent scenes when a script has more scenes than the
    // engine can hold beats. Such a beat spans two narrations, and the ONE place
    // its cut belongs is the instant the second narration starts — every other
    // split point puts one scene's headline on screen over the other scene's
    // voice. `cuts` carries that split explicitly; everything below treats each
    // cut as a whole beat with its own copy, so partView never has to guess.
    const cuts = memberCuts(sc);
    if (cuts) return { sc, dur, n: cuts.length, cuts, boundary: true };
    return { sc, dur, n };
  });
  // Give splits back until the film fits the pool — surrendering the one that
  // leaves the SHORTEST merged beat. Surrendering the longest scene's split
  // instead produces a single 5s held frame, which is the very thing being fixed.
  let planned = plan.reduce((a, p) => a + p.n, 0);
  while (planned > beatBudget) {
    // PACE OUTRANKS VARIETY. Only give a split back if the merged beat still cuts
    // inside the target — a shape repeating at 2.5s reads far better than the same
    // film holding one frame for 5s, which is the complaint this all started from.
    // A BOUNDARY CUT IS SURRENDERED LAST. Giving back a pace split costs variety;
    // giving back a boundary split costs SYNC — the beat then holds one scene's
    // headline through the next scene's narration, which is the defect this whole
    // path exists to prevent. Only reach for those once nothing else is left.
    const pick = (list) => list
      .filter((p) => p.n > 1 && p.dur / (p.n - 1) <= beatTarget + 0.35)
      .sort((a, b) => (a.dur / (a.n - 1)) - (b.dur / (b.n - 1)))[0];
    // ONLY PACE SPLITS ARE ON THE TABLE HERE. beatBudget is a VARIETY guard — it
    // keeps a film from reusing the same shape every few seconds — and a repeated
    // shape is a much smaller price than a beat that holds one scene's headline
    // through the next scene's narration. Boundary cuts therefore survive this
    // loop entirely; the engine's own 50-beat / 16KB ceiling is the real limit,
    // and the shed that enforces it folds inside a scene before across one.
    const give = pick(plan.filter((p) => !p.boundary));
    if (!give) break;
    give.n--;
    planned--;
  }
  plan.forEach(({ sc, dur, n, cuts }, i) => {
    if (cuts) { cuts.forEach((c) => beats.push({ sc: c.view, i, dur: c.dur, part: 0, of: 1 })); return; }
    const each = dur / n;
    for (let k = 0; k < n; k++) beats.push({ sc, i, dur: each, part: k, of: n });
  });

  totalBeats = beats.length;

  // ...and one more echo escapes the split logic: consecutive SCENES whose copy
  // converges (the text director likes to restate the key phrase), so beat N's
  // support line equals beat N+1's headline. Compare what actually lands on the
  // frame and step to the next facet when it repeats.
  let prevLead = null;
  const leadOf = (v) => String(v.headline || v.title || "").replace(/\|/g, " ").trim().toLowerCase();

  return beats.map((beat, bi) => {
    let sc = partView(beat.sc, beat.part, beat.of, nextHeadOf(beat.sc));
    if (prevLead && leadOf(sc) && leadOf(sc) === prevLead) {
      const alt = partView(beat.sc, (beat.part || 0) + 1, Math.max(2, beat.of || 2), nextHeadOf(beat.sc));
      if (leadOf(alt) && leadOf(alt) !== prevLead) sc = alt;
    }
    prevLead = leadOf(sc) || prevLead;
    const i = bi;                       // slotFor walks BEATS, so every cut gets its own shape
    const tpl = slotFor(i, sc);
    const sid = sc.id != null ? String(sc.id) : `s${beat.i + 1}`;
    const out = { name: tpl.name, dur: r2(beat.dur) };
    out[SCENE_OF] = beat.i;
    // Everything true this beat could say, for the slots the mapping below has
    // no rule for (see copyBank). Built per beat, so a split scene's two halves
    // draw different lines instead of echoing each other.
    const bank = makeBank(sc, brand, filmTitle, filmSpent);
    // The headline is on the frame no matter which shape this beat lands on, so
    // it is spent before anything can draw from the bank — otherwise a rack
    // top-up below could echo it one line lower.
    bank.spend(sc.headline || sc.title);

    // Copy — only fields THIS template's scene actually uses, so we never invent
    // furniture the design does not have.
    //
    // NEVER fall back to the template's own demo copy (`tpl.X`). Those defaults
    // are another product's words: a real film shipped its opener as
    // "FETCH — Every good boy delivers." and its CTA button as "GET FETCH"
    // because the user scene lacked those fields. A thinner slide in the user's
    // own words always beats a full slide in the demo brand's.
    const has = (k) => Object.prototype.hasOwnProperty.call(tpl, k);
    // A scene whose only copy is a LIST reads as one line joined with dots —
    // "Mobiles · Fashion · Groceries" — not as its first entry alone.
    const line1 = () => {
      if (sc.headline || sc.title) return sc.headline || sc.title;
      const b = bullets(sc, 3);
      return b.length >= 2 ? b.join(" · ") : (b[0] || "");
    };
    if (has("brand")) out.brand = up(fit(brand, 18));
    if (has("tagline")) out.tagline = fit(line1() || sc.subtext || "", 40);
    // "|" is a LINE BREAK only in fields whose film splits on it — and the only
    // reliable evidence is the field's own authored default. FlightVertical's
    // Cruise headline renders pipes LITERALLY, which put
    // "MOBILES ·|FASHION ·|GROCERIES" on screen as "MOBILES ·I FASHION".
    const splitsPipes = (k) => typeof tpl[k] === "string" && tpl[k].includes("|");
    if (has("headline")) out.headline = up(splitsPipes("headline") ? breakHeadline(line1(), 52, land) : fit(line1(), 40));
    // `title` IS the headline slot on the whole kit family (every authored kit
    // scene leads with `title:"SERVICE|TICKET 3391."`), and it had NO mapping —
    // it fell through to the generic bank fill, whose order tries bullets first
    // and the headline LAST… which `bank.spend(sc.headline)` below has already
    // marked as used. Net effect: the narrator speaks the scene's line while a
    // CHIP is promoted to display type — a film said "the balance never rests"
    // under a giant "BALANCE WHEEL". The beat's main statement now lands in the
    // slot the design built for it.
    if (has("title") && out.title === undefined) {
      out.title = up(splitsPipes("title") ? breakHeadline(line1(), 52, land) : fit(line1(), 40));
    }
    if (has("kicker")) out.kicker = fit(sc.kicker || purposeLabel(sc, bi), 20).toUpperCase();
    // Some shapes carry NO headline slot at all (Cadence's Morph is eyebrow +
    // prefix + states + body). On those the scene's main line has nowhere to go
    // and was silently dropped, so the frame showed a rack of bullets with no
    // statement over it. When there is no headline-ish slot, the eyebrow IS the
    // headline, and body picks up whatever line is left.
    const headlineSlot = has("headline") || has("words") || has("tagline") || has("quote") || has("text");
    let eyebrowTookLine = false;
    if (has("eyebrow")) {
      const own = sc.eyebrow || sc.kicker || purposeLabel(sc, bi);
      eyebrowTookLine = !own && !headlineSlot;
      out.eyebrow = fit(own || (eyebrowTookLine ? line1() : ""), 26).toUpperCase();
    }
    // …and body must not then echo the same sentence back one line lower.
    if (has("body")) out.body = fit(sc.body || sc.subtext || (headlineSlot || eyebrowTookLine ? "" : line1()), 120);
    if (has("sub")) out.sub = fit(sc.subtext || sc.body || "", 120);
    if (has("callout")) out.callout = up(fitLabel(bullets(sc, 1)[0] || sc.callout || "", 22));
    if (has("calloutNum")) out.calloutNum = tpl.calloutNum || "1";   // a slide number, not copy
    // "GET <brand>" only reads as a call to action when there IS a brand; with an
    // unbrandable title it printed "GET FROM". Fall back to a real CTA instead.
    if (has("cta")) out.cta = fit(sc.cta || sc.ctaLabel || (brand ? `GET ${brand}` : "GET STARTED"), 20).toUpperCase();
    if (has("url")) out.url = url;
    if (has("quote")) out.quote = fit(sc.quote || sc.subtext || sc.voiceover || "", 140);
    if (has("author")) out.author = fit(sc.author || brand, 24);
    if (has("chips")) out.chips = bullets(sc, 4).map((x) => fitLabel(x, 22)).filter(Boolean);
    if (has("items")) out.items = bullets(sc, 4).map((x) => fitLabel(x, 26)).filter(Boolean);
    // Template-specific text props discovered in the compiled films — each is
    // demo-brand copy if left authored (Drive's CTA road sign, Flight's Gate
    // lead line, Fight's combo list, Hacker's terminal stamp/command).
    if (has("lead")) out.lead = fit(sc.subtext || sc.body || line1(), 90);
    if (has("sign")) out.sign = up(fit(brand, 16));
    if (has("combos")) { const bl = bullets(sc, 3); if (bl.length) out.combos = bl; }
    if (has("stamp")) out.stamp = fit(sc.kicker || purposeLabel(sc, bi) || "ACCESS GRANTED", 24).toUpperCase();
    if (has("cmd")) out.cmd = `> get ${brand.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
    // Stats must be TRUE. The demo numbers are another product's figures, so a
    // scene with no numbers of its own renders none rather than borrowing them.
    if (has("stats")) { const st = statsFor(sc); out.stats = st.length ? st : minedStats(sc); }
    // A RING/GAUGE COUNTS TO A NUMBER THIS FILM STATED. The scene-level figure
    // slots were mapped nowhere at all, so the compiled component fell back to
    // its own demo value and animated to it — measured on a shipped film, a ring
    // counting to "100" under the label "AND PRIORITY SET", a figure the script
    // never said. `canFill` now refuses these shapes to a figure-less scene, so
    // reaching here means the scene really does have one.
    for (const nk of numberSlots(tpl)) {
      const st = statsFor(sc)[0] || minedStats(sc)[0];
      if (!st) break;
      out[nk] = st.v;
      // Its siblings: the unit is a short symbol ("°", "%", "x"), the caption is
      // the longest authored string on the scene.
      const unitK = Object.keys(tpl).find((k) => typeof tpl[k] === "string" && tpl[k].trim().length <= 2 && tpl[k].trim() && !/^[a-z]+$/i.test(tpl[k].trim()));
      if (unitK && out[unitK] === undefined && st.suf) out[unitK] = st.suf;
      if (has("label") && out.label === undefined && st.l) out.label = fitLabel(st.l, 24) || st.l.slice(0, 24);
    }

    // TEMPLATE-SPECIFIC COPY SLOTS. Films name them differently — words / pains /
    // feats / tags / caps / roster / ticker / pill / text — and anything left
    // unmapped is blanked by the suppression pass below, so an unmapped slot is
    // an EMPTY frame, not demo copy.
    //
    // CRITICAL: the slots differ in TYPE. `words` is a "|"-separated STRING
    // ("WORK|SHOULD|SLAP.") while `pains`/`feats`/`tags`/`caps`/`roster` are
    // ARRAYS. Passing the wrong one throws inside the compiled component
    // ("pains.map is not a function") and every scene from that point renders
    // BLANK. So the authored default's own type decides the shape.
    const asSlot = (key, n, max) => {
      const b = bullets(sc, n).map((x) => fitLabel(x, max || 22)).filter(Boolean);
      // TOP THE RACK UP. These slots are RACKS — three signs, four pills, a row
      // of cards — and the design draws the ones it is given. A scene whose only
      // list source is one sentence filled ONE of three signs, so two thirds of
      // the shape rendered as empty ground (measured on the shipped motorway
      // film: a single green sign, then 60% of the frame bare). The bank holds
      // the rest of what this beat says; fitLabel still refuses anything that
      // would land as a stump, so a rack only grows with lines that read.
      // …including a rack with NOTHING in it, which is the common case: the only
      // list source a sparse scene has is its one support sentence, and fitLabel
      // rightly refuses to cut that into a pill ("Design, code and AI all pull"),
      // so the whole rack came back empty and the shape drew bare ground.
      // …at the width of the ROW, not of the slot name. `max` is a literal picked
      // per slot ("tags" 16, "pains" 26, unmapped lists 30) and is the same for
      // every template, so a Transit departure board authored "PROOF / HOOK /
      // SHOT" was topped up with "Still juggling five tools" — five times the
      // width of the row it sits in. Measured across the fleet: 58 rack entries
      // filled this way, 12 of them over twice the authored entry and 8 over
      // three times. When the authored entries are strings, THEY are the budget.
      if (b.length < n) {
        const rowWide = Array.isArray(tpl[key])
          ? Math.max(0, ...tpl[key].map((x) => (typeof x === "string" ? x.trim().length : 0)))
          : 0;
        const room = rowWide
          ? Math.min(max || 22, rowWide + Math.min(6, Math.ceil(rowWide * 0.25)))
          : (max || 22);
        const seen = new Set(b.map((x) => x.toLowerCase()));
        for (let g = b.length; g < n; g++) {
          const more = bank.take(room, { copyOnly: true });
          if (!more || seen.has(more.toLowerCase())) break;
          seen.add(more.toLowerCase());
          b.push(more);
        }
      }
      if (!b.length) return undefined;
      if (!Array.isArray(tpl[key])) return b.join("|");
      // Element shape matters too: `feats` is [{n,t,b}], `roster` is [{n,r,q}] —
      // the compiled component reads f.t / f.n on each element, so an array of
      // plain STRINGS renders as blank rows. Clone the authored element's key
      // shape and pour the user's bullet into its longest text key.
      const proto = tpl[key][0];
      if (proto && typeof proto === "object" && !Array.isArray(proto)) {
        // A NUMERIC field in the authored element means the component COUNTS it.
        // Cloning only the string keys drops it, and the compiled film renders
        // `undefined` as "NaN" — measured, in 96pt red type, on a shipped film.
        // We will not invent a figure to fill it either (that is how demo numbers
        // become claims about the customer), so a shape that wants a number is
        // simply not a shape this scene's bullets can fill.
        if (Object.values(proto).some((v) => typeof v === "number")) return undefined;
        const keys = Object.keys(proto).filter((kk) => typeof proto[kk] === "string");
        const textKey = keys.sort((x, y) => String(proto[y]).length - String(proto[x]).length)[0];
        return b.map((val, bi) => {
          const el = {};
          for (const kk of keys) {
            if (kk === textKey) { el[kk] = val; continue; }
            if (/^\d+$/.test(String(proto[kk])) || kk === "n") { el[kk] = String(bi + 1).padStart(2, "0"); continue; }
            // A SECOND text key is usually the row's description — the line under
            // a sign, the caption under a card. Blanking it stripped half of every
            // list row on the frame; the bank fills it with another true line from
            // this beat (and returns nothing when there isn't one).
            el[kk] = fillFor(kk, proto[kk], bank, { copyOnly: true }) || " ";
          }
          return el;
        });
      }
      // …and the third authored element shape: a ROW, i.e. an ARRAY of cells.
      // 122 slots across 79 templates author one (`notes` [title, body],
      // `pairs` [objection, answer], `rows` [label, "$60"], `bars` [label,
      // 0.86]), and both this function and conformToAuthored used to test
      // `!Array.isArray(proto)` and fall straight through — handing the
      // component an array of plain STRINGS. A component that draws cells reads
      // row[0] and row[1], and indexing a string by position yields CHARACTERS,
      // so a ledger card rendered one letter per cell ("C … u" over "l … n")
      // while the film's real copy went nowhere. Clone the row instead.
      if (Array.isArray(proto) && proto.length) {
        // A cell holding a FIGURE is not ours to write. Same rule the object
        // branch above applies to numeric fields: filling a receipt's "$60" or a
        // bar's 0.86 turns the template demo's number into a claim about the
        // user's brand. A shape that wants a figure is simply not a shape this
        // scene's bullets can fill, so the authored row stands.
        if (proto.some(isFigureCell)) return undefined;
        // A row draws ACROSS: [title, body], [objection, answer]. So spend the
        // beat's lines ACROSS the row before starting a new one — two lines make
        // one COMPLETE row, not two rows each half empty. Measured on the
        // shipped chalk film: the beat had exactly two lines, and filling them
        // down the first column drew an empty second column beside every entry.
        const wide = bullets(sc, Math.max(n, 2) * proto.length)
          .map((x, i) => fitLabel(x, cellRoom(proto[i % proto.length], max)))
          .filter(Boolean);
        const src = wide.length >= proto.length ? wide : b;
        const rows = [];
        for (let i = 0; i + proto.length <= src.length && rows.length < n; i += proto.length) {
          rows.push(proto.map((cell, ci) => src[i + ci]));
        }
        if (rows.length) return rows;
        // Fewer lines than one row needs — fill what we have, bank the rest.
        return b.slice(0, n).map((val) => proto.map((cell, ci) => (
          ci === 0 ? (fitLabel(val, cellRoom(cell, max)) || val)
                   : (fillFor(key, cell, bank, { copyOnly: true }) || " ")
        )));
      }
      return b;
    };
    // `words` is a SLAM — one word (or two) per line ("WORK|SHOULD|SLAP.").
    // With 2+ bullets each bullet is a line; with a single line of copy, break
    // IT into slam lines rather than truncating it to one 14-char stump.
    // ...and when the bullets are sentences, fitLabel drops them all rather than
    // slam a stump across the frame — the headline is then the honest source.
    if (has("words")) {
      const wb = bullets(sc, 3);
      const slam = wb.length >= 2 ? asSlot("words", 3, 14) : "";
      out.words = up(slam || breakHeadline(line1(), 40, false));
    }
    // `word` is a SINGLE HERO TOKEN, and five kit scenes declare one — Kaleido
    // (six mirrored copies at 96px plus one at 150px), LongShadow, ZoomThrough,
    // Emboss, Perimeter. Ninety scenes across the 58 long-form films author one
    // ("PATIENCE", "TURN SIX", "SNIP."), and it was mapped NOWHERE: `words` is a
    // different key, so `word` fell through to the generic string fill, which
    // rejects a bare token under 12 characters as an enum and returns "". The
    // slot blanked to a space and Kaleido drew six mirrored blanks around a
    // blank. The authored default is the width budget and the case, as
    // everywhere else.
    if (has("word")) {
      const room = cellRoom(tpl.word, 22);
      const caps = tpl.word === String(tpl.word).toUpperCase() && /[A-Z]/.test(String(tpl.word));
      // NEVER CUT THIS ONE IN HALF. fit() falls back to a hard slice for a single
      // token longer than the slot, and on a slot this size that is not a shorter
      // word, it is a typo — a Kaleido authored 4 characters wide rendered the
      // emphasis "TENTHS" as "TENTH", six times over, mirrored. So a candidate is
      // taken only if it already fits; otherwise pick a whole word off the beat.
      const whole = (v) => { const x = String(v || "").trim(); return x && x.length <= room ? x : ""; };
      // fitLabel is word-bounded except for its last-resort slice, so accept its
      // answer only when the cut landed on a space or at the end of the source.
      const noCut = (v) => {
        const src = String(v || "").trim();
        const r = fitLabel(src, room);
        return r && (r === src || !src[r.length] || /\s/.test(src[r.length])) ? r : "";
      };
      const pick = whole(sc.emphasis)
        || whole(bullets(sc, 1)[0])
        || noCut(line1())
        || keyWord(sc.emphasis || "", room)
        || keyWord(line1(), room)
        || keyWord(sc.subtext || sc.voiceover || "", room);
      out.word = pick ? (caps ? pick.toUpperCase() : pick) : " ";
      if (out.word === " ") note("omelette_adapter", "blanked-string-slot", { severity: "visual", slot: "word", scene: tpl.name });
    }
    if (has("pains")) out.pains = asSlot("pains", 3, 26);
    if (has("feats")) out.feats = asSlot("feats", 4, 26);
    if (has("tags")) out.tags = asSlot("tags", 4, 16);
    if (has("caps")) out.caps = asSlot("caps", 4, 22);
    if (has("roster")) out.roster = asSlot("roster", 4, 18);
    if (has("text")) out.text = fit(sc.headline || sc.subtext || "", 90);
    if (has("quoteBy")) out.quoteBy = fit(sc.author || sc.by || brand, 24);
    if (has("by")) out.by = fit(sc.author || sc.by || brand, 24);
    if (has("brand")) out.brand = brand;
    if (has("pill")) out.pill = fit(bullets(sc, 1)[0] || sc.subtext || sc.kicker || purposeLabel(sc, bi), 22).toUpperCase();
    if (has("ticker")) out.ticker = fit(String(brand), 40).toUpperCase();

    // ---- CADENCE slots (premium SaaS, 9:16) ------------------------------------
    // This template is the most content-hungry of the bundle: 16 distinct scene
    // shapes, most of them racks of real rows (search results, setup steps, a
    // kanban board, a chat thread, a weekly digest). Left unmapped they blank to
    // empty furniture, so each is filled from the scene's own copy here.
    //
    // STRING slots — product-card chrome. Each is the demo brand's words when
    // authored, so every one is re-derived from the user's scene.
    if (has("keyword")) out.keyword = fit(sc.emphasis || bullets(sc, 1)[0] || line1(), 22);
    if (has("query")) out.query = (fitLabel(sc.emphasis || bullets(sc, 1)[0] || sc.kicker || "", 24) || fitLabel(line1(), 24)).toLowerCase();
    if (has("cardKicker")) out.cardKicker = fit(sc.kicker || sc.eyebrow || purposeLabel(sc, bi), 20).toUpperCase();
    if (has("cardTitle")) out.cardTitle = fitLabel(sc.subtext, 34) || fitLabel(line1(), 34) || fit(line1(), 34);
    if (has("cardCta")) out.cardCta = fit(sc.cta || sc.ctaLabel || "", 18);
    if (has("card")) out.card = fit(bullets(sc, 1)[0] || sc.subtext || "", 22);
    // "Status:" — a generic UI label, not brand copy, so the authored one stands
    // unless the scene offers its own kicker.
    if (has("prefix")) out.prefix = fit(sc.kicker || tpl.prefix || "", 14);
    // The Onboard card's completion caption. NOT playback chrome — it is a label
    // inside the film's own setup card — but it still must speak the user's film.
    if (has("progressLabel")) out.progressLabel = fitLabel(sc.emphasis || sc.cta || bullets(sc, 1)[0] || "", 22);

    // LIST slots — asSlot() already clones the authored element shape, so an
    // array of plain strings (results/steps/tools/notes/rows/cols/states) and an
    // array of objects (plans) both land in the right form.
    for (const k of ["results", "steps", "tools", "notes", "rows"]) {
      if (!has(k)) continue;
      // A sequence the design COUNTS stays as authored — see isFigureRack.
      if (isFigureRack(tpl[k])) { out[k] = tpl[k].slice(); continue; }
      out[k] = asSlot(k, Array.isArray(tpl[k]) ? tpl[k].length : 4, 30);
    }
    // Board columns and Morph states are generic WORKFLOW labels ("To do /
    // Doing / Shipped", "Draft / In review / Live") — furniture, not another
    // brand's copy — so the authored set stands when the scene has none of its
    // own, exactly as `calloutNum` keeps its slide number.
    // FIXED ARITY: the Board draws one column per entry and Morph one state per
    // entry, so the layout is authored for EXACTLY tpl[k].length of them. Handing
    // back fewer leaves a hole — measured on a Cadence "Board" scene, which is
    // authored with 3 columns ("To do / Doing / Shipped"): the film's scene had
    // only 2 bullets, `b.length >= 2` accepted them, and the third column
    // rendered EMPTY. Pad from the authored labels so the count is always whole;
    // they are generic workflow furniture, not another brand's copy, so a mixed
    // row reads fine.
    for (const k of ["cols", "states"]) {
      if (!has(k)) continue;
      const need = Array.isArray(tpl[k]) ? tpl[k].length : 3;
      const b = bullets(sc, need).map((x) => fit(x, 16));
      out[k] = b.length >= 2
        ? (b.length < need && note("omelette_adapter", "padded-fixed-slot", { severity: "visual", slot: k, scene: tpl.name, detail: `${b.length}/${need} from the film, rest from authored labels` }), Array.from({ length: need }, (_, ci) => b[ci] || (Array.isArray(tpl[k]) ? tpl[k][ci] : b[b.length - 1])))
        : tpl[k];
    }
    // Thread bubbles carry a BOOLEAN `me` that decides which side each message
    // hangs on. asSlot only clones string keys, so it would drop it and stack
    // every bubble on one side — map this one explicitly and alternate.
    if (has("msgs")) {
      const b = bullets(sc, 3).map((x) => fit(x, 34));
      out.msgs = b.length ? b.map((m, mi) => ({ m, me: mi % 2 === 1 })) : [];
    }
    // A single huge number. canFill guarantees a true stat exists by here.
    if (has("value")) {
      const st = statsFor(sc)[0] || minedStats(sc)[0] || null;
      if (st) { out.value = st.v; if (has("suffix")) out.suffix = st.suf || ""; }
    }
    // `bars` has TWO shapes in this template: Metric draws an abstract sparkline
    // of 0..1 numbers (a shape, not copy — the authored one stands), while Live
    // draws LABELLED meters as [label, fraction] pairs, where the label is copy.
    if (has("bars") && Array.isArray(tpl.bars) && Array.isArray(tpl.bars[0])) {
      const b = bullets(sc, tpl.bars.length).map((x) => fit(x, 22));
      if (b.length) out.bars = b.map((lab, bi) => [lab, (tpl.bars[bi] && tpl.bars[bi][1]) || 0.9]);
    }
    // Pricing tiers — canFill only casts this for a genuine pricing scene. Names
    // come from the scene's bullets; the price is mined from that bullet's own
    // digits, never from the demo's, and an unpriced tier shows no number.
    if (has("plans")) {
      const b = bullets(sc, 3);
      out.plans = b.map((raw, bi) => {
        const proto = tpl.plans[bi] || tpl.plans[0] || {};
        const num = /(\d+(?:\.\d+)?)/.exec(String(raw));
        return {
          ...Object.fromEntries(Object.keys(proto).map((kk) => [kk, " "])),
          n: fit(String(raw).replace(/[\s—-]*\$?\d+(?:\.\d+)?.*$/, "").trim() || raw, 12),
          p: num ? num[1] : " ",
          d: fit(sc.subtext || "", 16),
        };
      });
    }

    // CHAR-SPLIT REVEALS EAT THEIR SPACES. A scene whose authored `anim.text` is
    // a per-CHARACTER reveal (Cadence's Hero + Close use "charReveal") renders
    // its display line as one <span> per character inside a flex row. Under the
    // renderer every span holding a plain " " collapses to zero width, so
    // "Find your cadence" is captured as "Findyourcadence" — measured on both a
    // wrapping and a single-line headline, so it is not a shrink or wrap effect.
    // Plain Chromium lays the same DOM out correctly (space spans measure 30px),
    // which is why this is invisible until you inspect the MP4.
    //
    // Non-breaking spaces survive it: U+00A0 is not collapsible whitespace, and
    // because the row wraps between CHAR spans (not between words) the headline
    // still breaks exactly where it did before. Scoped to char-split scenes only
    // — the word-splitting reveals ("wordStaggerBlur", every other Cadence
    // scene) already keep their spaces, and NBSP there would block wrapping.
    if (/char/i.test(String((tpl.anim && tpl.anim.text) || ""))) {
      for (const k of ["headline", "tagline", "text", "keyword"]) {
        if (typeof out[k] === "string") out[k] = out[k].replace(/ /g, " ");
      }
    }

    // SUPPRESS COMPILED FALLBACKS. The films read fields as `s.X || <authored
    // demo copy>` INSIDE the compiled components, so a mapped-but-EMPTY string
    // still surfaces the demo brand's line (verified live: a statless scene's
    // empty `sub` rendered "…a leaderboard for the goodest boys"). A single
    // space is truthy, renders as nothing, and costs one byte of the 16KB cap.
    for (const k of Object.keys(out)) {
      if (typeof out[k] === "string" && out[k] === "") out[k] = " ";
      if (Array.isArray(out[k]) && out[k].length === 0) delete out[k];   // let the ARRAY suppression below decide
    }
    // Whatever the mapping already put on this frame is SPENT — otherwise the
    // fills below would hand a kicker the same words the headline is shouting.
    for (const v of Object.values(out)) {
      if (typeof v === "string") bank.spend(v.replace(/\|/g, " "));
      else if (Array.isArray(v)) {
        for (const el of v) {
          if (typeof el === "string") bank.spend(el);
          else if (el && typeof el === "object") for (const x of Object.values(el)) if (typeof x === "string") bank.spend(x);
        }
      }
    }
    // ARRAY fields need the same suppression: an unmapped/unfilled authored
    // array keeps the demo product's content — a roster of FAKE PEOPLE
    // ("ANA — Ops lead") shipped in a user's film exactly this way. An empty
    // array is truthy, so the compiled `s.roster || demo` fallback cannot
    // resurrect the demo either.
    for (const k of Object.keys(tpl)) {
      if (k === "name" || k === "dur" || k === "nat") continue;
      if (!Array.isArray(tpl[k]) || out[k] !== undefined) continue;
      // TRY THE FILM'S OWN COPY FIRST. Blanking outright is right for a slot we
      // cannot speak to, but it was being applied to EVERY unmapped list — and a
      // list is usually the whole body of its scene. Birdsong's `Cards` scene is
      // {headline, sub, cards[4]}; `cards` appeared in no mapping branch, so it
      // blanked to [] and the film shipped a title band over an empty frame for
      // four seconds (measured: 79% of the frame height empty). Naming each new
      // slot by hand is what let this through, so fill by SHAPE instead — every
      // list a template declares now gets the scene's bullets, and only a slot
      // with genuinely nothing to say ends up empty.
      // …except a rack the design COUNTS rather than speaks (see isFigureRack):
      // blanking a countdown's digits leaves the scene drawing nothing at all,
      // and filling them puts a sentence on screen at 400px.
      if (isFigureRack(tpl[k])) { out[k] = tpl[k].slice(); continue; }
      out[k] = asSlot(k, tpl[k].length, 30) || [];
      if (!out[k].length) note("omelette_adapter", "empty-list-slot", { severity: "content", slot: k, scene: tpl.name, detail: `${tpl.name}.${k} has no copy — that scene body draws empty` });
    }
    // …and any authored STRING field this scene declares that we did not map at
    // all: SPEAK IN THE FILM'S OWN WORDS, and only blank when it has nothing
    // left to say. Blanking every unmapped string is what emptied the frame —
    // the design's kickers, footers, odometers, camera stamps and slot labels
    // are the elements that make a beat look composed, and they were all being
    // set to a single space. The bank only ever hands back copy this video
    // genuinely says (see copyBank), so the "never another brand's words" rule
    // that motivated the blank is kept exactly.
    //
    // The authored default also tells us the slot's intended SHAPE: its length
    // is the design's own width budget, and an all-caps default means the slot
    // is drawn in caps.
    for (const k of Object.keys(tpl)) {
      if (k === "name" || k === "dur" || k === "nat") continue;
      if (typeof tpl[k] === "string" && out[k] === undefined) {
        out[k] = fillFor(k, tpl[k], bank) || " ";
        if (out[k] === " ") note("omelette_adapter", "blanked-string-slot", { severity: "visual", slot: k, scene: tpl.name });
      }
      // An ARRAY slot blanked to a string would throw the same .map error, so an
      // unmapped list becomes an EMPTY LIST — renders nothing, crashes nothing.
      if (Array.isArray(tpl[k]) && out[k] === undefined) out[k] = [];
    }

    // UNDECLARED PROPS THAT SHIP FABRICATED DATA. The suppression above walks
    // `Object.keys(tpl)` — the AUTHORED scene — so a prop the compiled component
    // reads but OM_SCENES never lists is invisible to it, and its `s.X || demo`
    // fallback survives into the user's film forever.
    //
    // Found by decoding the bundle and grepping for `s.X ||` (see UNDECLARED_DEMO
    // below). These are not stray labels: they are NUMBERS AND CLAIMS ABOUT THE
    // SUBJECT. A real Linear film shipped the Search stat row as "0.2s to first
    // result · 40K items indexed · 3 exact matches" and a social-proof line
    // reading "and 4,000 more teams" — none of it true, all of it presented as
    // the customer's own data. Nothing downstream can catch this: the frames look
    // deliberately designed, so lint, the vision QA and A/V alignment all pass.
    //
    // Rule: a figure ships ONLY if the film's own script supports it.
    for (const k of UNDECLARED_DEMO) {
      if (out[k] !== undefined) continue;                 // already mapped above
      if (k === "meta") {
        // A stat row. Use the scene's TRUE numbers; with none, render no row at
        // all rather than borrow the template's.
        const st = statsFor(sc).length ? statsFor(sc) : minedStats(sc);
        out.meta = st.length ? st.slice(0, 3).map((s) => ({ v: s.v, suf: s.suf || "", l: String(s.l || "").toLowerCase().slice(0, 22) })) : [];
      } else if (k === "chips") {
        // Pills are SHORT LABELS. bullets() falls back to splitting the subtext
        // into sentences, which at an 18-char pill width ships a mid-sentence
        // stump ("Issues, cycles and"). Only a real list becomes pills.
        // ...and a real list still yields a stump when its entries are sentences,
        // so fitLabel drops anything that lost most of its words.
        const list = [sc.chips, sc.bullets, sc.onScreenText].find((x) => Array.isArray(x) && x.length) || [];
        out.chips = list.filter(Boolean).slice(0, 3).map((x) => fitLabel(String(x), 18)).filter(Boolean);
      } else {
        // Unverifiable claims (avatarLabel = "and 4,000 more teams"). The demo
        // line can never ship — but the ELEMENT is real design, so give it one
        // of the film's own lines instead of leaving the frame short of it. The
        // bank invents nothing, so nothing unverifiable can reach the frame; a
        // single space (truthy, so the compiled `||` fallback stays suppressed)
        // remains the fallback when this beat has nothing more to say.
        out[k] = bank.take(22) || " ";
      }
    }

    // Media — a scene-pinned asset wins, then the pool. Every compiled film
    // reads `shot` (verified across all 17 decoded bundles) and its walls read
    // shot1..N — but the authored OM_SCENES never DECLARE media fields, so
    // has("shotN") is always false and only the scene NAME can tell us a wall
    // is present. The name list below is the full set discovered in the
    // compiled code (the old /montage|gallery|fleet/ regex missed eight of
    // them, which is one way gallery walls shipped as placeholder hatching).
    const pinned = byScene.get(sid) || null;
    const wantsPhone = /mobile|phone|pocket/i.test(String(tpl.name));
    // RECYCLE when the pool runs dry (user directive: repeat a real asset rather
    // than ship a placeholder). A fresh asset always wins; a repeat of the
    // product's own screenshot always beats a hatched "DROP IMAGE TO REPLACE"
    // frame. Round-robin over everything already placed, screenshots first.
    // …and a REPEAT should still be RELEVANT. Once `free` is dry, every later
    // beat came through here and got the same first screenshot, so a beat about
    // automation showed the pricing page — measured ten times in one film. If a
    // picture has to appear twice, show the one that matches what this beat is
    // saying; with no overlap, rotate so the film at least varies.
    const bestMatch = (list, sc2) => {
      if (!list.length) return null;
      let best = 0, pick = null;
      for (const a of list) {
        const score = matchScore(sc2, a);
        if (score > best) { best = score; pick = a; }
      }
      return pick;
    };
    const recycle = () => {
      if (!used.length) return null;
      const shotsFirst = used.filter(isShot);
      const src = shotsFirst.length ? shotsFirst : used;
      return bestMatch(src, sc) || src[recycleAt++ % src.length];
    };
    const place = (a) => { if (a && !used.includes(a)) used.push(a); return a; };
    // A REAL SCREENSHOT OUTRANKS A PINNED STOCK PHOTO IN A DEVICE FRAME.
    // Every one of these slots is drawn INSIDE BrowserChrome — a browser window
    // with a URL bar — so a stock photo in it is wrong by construction, not just
    // weaker. The Creative Director's per-scene pin is advisory on this path
    // anyway (scene_kit ignores `sceneId` entirely), and a real Linear film hit
    // exactly this: six product screenshots scored 84-92, and the hero slot still
    // drew a generic laptop photo because the pin outranked them. So when the pin
    // is not a screenshot and one is available, the screenshot wins.
    const pinnedOk = pinned && (isShot(pinned) || !pool.some(isShot));
    // …AND A PIN IS NOT A LICENCE TO BE OFF-TOPIC. The pin comes from a vision
    // pass that scored each image against the whole film, so it can land an image
    // on a beat it has nothing to do with — a shipped film pinned a moody
    // silhouette (CLIP relevance 0.12, vision verdict "not ok") to the beat
    // saying "Design. Code. AI. All disconnected." Honour the pin when it is on
    // topic; when it plainly is not, let a clearly better candidate take the slot.
    const pinOrBetter = () => {
      if (!pinnedOk) return null;
      const pinScore = matchScore(sc, pinned, { penalizeUsed: false });
      if (pinScore >= 1.2) return pinned;
      let best = null, bestScore = pinScore + 1;             // "clearly better", not "a hair better"
      for (let k = fi; k < free.length; k++) {
        const a = free[k];
        if (omDemoted(a)) continue;
        if (!wantsPhone && isPortraitAsset(a)) continue;
        const s = matchScore(sc, a, { penalizeUsed: false });
        if (s > bestScore) { bestScore = s; best = a; }
      }
      if (!best) return pinned;
      free.splice(free.indexOf(best), 1);
      return best;
    };
    // Every screenshot carries its OWN sceneId, so they all land in `byScene`
    // reserved for their own beat and `free` holds none — which is why `take`
    // could not rescue the hero slot and it kept drawing the stock photo. When
    // the slot is a browser frame and nothing free is a screenshot, BORROW one
    // from the reserved set. Re-showing a real product screenshot is explicitly
    // preferred over a wrong-but-fresh asset (same rule `recycle` follows), and
    // its own scene still gets it later.
    const borrowShot = () => {
      const wide = pool.filter((a) => isShot(a) && !isPortraitAsset(a));
      const any = wide.length ? wide : pool.filter(isShot);
      if (!any.length) return null;
      return bestMatch(any, sc) || any[recycleAt++ % any.length];
    };
    const primary = place(
      pinOrBetter()
      || (wantsPhone ? takeFor(sc, isPortraitAsset) : takeFor(sc, (a) => isShot(a) && !isPortraitAsset(a)))
      || (pinned && !isShot(pinned) ? borrowShot() : null)
      || pinned
      || take((a) => !isPortraitAsset(a))
      || take()
      // Nothing FREE is left. Every screenshot carries its own sceneId, so on a
      // film where each beat pinned one, `free` is empty from the very first
      // scene — and the opening Hero (which has no pin of its own) fell through
      // to `recycle()`, which is also empty at scene 0, and drew the hatched
      // "DESKTOP SCREENSHOT — DROP IMAGE" card. Measured: a real Linear film
      // opened on that placeholder. Borrowing a reserved screenshot is the same
      // trade `recycle` already makes — a real asset shown twice beats a
      // placeholder shown once — and its own scene still gets it later.
      || borrowShot()
      // A VECTOR BEATS A REPEAT. Only reached once every photograph, capture and
      // borrowable shot is spent — at which point the alternatives are showing the
      // same screenshot for the third time or the hatched placeholder.
      || takeVec()
    ) || recycle();
    // Never leave a picture slot unset — the compiled film paints its own
    // "DROP IMAGE TO REPLACE" placeholder when it is missing.
    out.shot = primary ? primary.path : "__kfplate__";   // sentinel — see the 16KB-cap note; harness swaps the plate in
    if (primary) lastShot = primary;
    // THE KIT FAMILY NAMES ITS MEDIA SLOTS DIFFERENTLY.
    //
    // The 80 templates built on film-kit.js (mega-pack-*/world-pack-*) render
    // every picture through MediaSlot reading `scene.image`, `(scene.images||[])[i]`
    // and `scene.logo` — NOT `shot`/`shot1..N`. Only `logo` overlapped, so before
    // this every one of those films drew hatched "DROP IMAGE TO REPLACE" boxes no
    // matter how many screenshots the job captured. The authored scenes never
    // DECLARE these fields either (a Montage declares only name/dur/title/tiles),
    // so the demo-copy suppression could not see them and nothing downstream
    // flagged it. Mirror onto both namings; a film that reads neither ignores the
    // extra key, which is the same trade shotA/shotB already makes below.
    // Never leave the kit's single-image slot empty either — an unset `image`
    // draws a bare dark frame (measured on the zero-asset escapement bench,
    // beats 4/8: an empty rectangle where the picture goes). Same branded plate
    // the shot slot uses.
    // The plate is a ~2KB data-URI; inside OM_SCENES it blew the engine's hard
    // 16KB cap (a 12-beat field-notes cast truncated to 6 — the CTA froze for
    // 36s). Emit a 12-byte sentinel; the harness swaps in the real plate on
    // every seek, outside the capped string.
    out.image = primary ? primary.path : "__kfplate__";
    // `showcase`/`surfaces`/`screens` draw stacked BROWSER CARDS reading
    // shot1..N — the most screenshot-forward shape any of these templates has.
    // Cadence's Showcase was absent from this list, so its two browser cards
    // never received an asset and would have drawn "DROP IMAGE" placeholders.
    const WALL = MEDIA_WALL;
    if (WALL.test(String(tpl.name))) {
      const wall = [];
      // How many slots this wall ACTUALLY draws. The kit family's Montage lays a
      // fixed grid of one tile per authored `tiles` entry (4), and every slot it
      // draws without an image paints the placeholder — so guaranteeing only 3
      // left the last tile hatched on every kit film. Where the authored scene
      // tells us the count, honour it; otherwise keep the previous floor of 3.
      // PORTRAIT WALLS ARE TWO BIG CARDS, ALWAYS. A 2x2 grid of quarter-frame
      // tiles was designed for a supply of 4 on-topic images that real films
      // rarely have — scarce pools recycled duplicates into it, and an empty
      // pool shipped four hatched "DROP IMAGE TO REPLACE" placeholders
      // (user-reported on escapement). Two full-width cards read better at
      // 9:16 AND halve the demand. Landscape keeps the authored count — its
      // walls were designed wide. (kfBigCards in the harness restacks the
      // compiled grid to a single column; this cap is the data half.)
      const slots = Array.isArray(tpl.tiles) && tpl.tiles.length
        ? Math.min(land ? 6 : 2, tpl.tiles.length)
        : (land ? 3 : 2);
      // VECTOR CADENCE — one tile in every OTHER wall is reserved for graphic art.
      //
      // Without a reservation vectors are decorative in theory only: they sit at
      // the back of the queue and a film with more photographs than tiles never
      // reaches them. Reserving the LAST tile (never the first, never a lone
      // picture) means the reservation can only ever convert the tile most likely
      // to be a recycled repeat, so photography keeps every prominent slot.
      //
      // Every OTHER wall, not every third: most of these templates draw ONE media
      // wall in a 30s film (measured on lift-off — 11 beats, a single 4-tile
      // Montage), so a one-in-three cadence never fired at all and the film went
      // out with no graphic art again. Starting the cycle at the first wall keeps
      // the short film honest while a long one still alternates.
      const vecTile = (wallNo++ % 2 === 0 && slots >= 3 && vi < vecPool.length) ? slots : 0;
      // THE MARKS OF THE PRODUCTS THIS BEAT NAMES, AS A ROW — and ahead of the
      // vector cadence above, which is a rotation over the film while these are
      // owed to this one beat.
      //
      // They take the TRAILING tiles, never tile 1: the first tile is the wall's
      // lead picture and a beat with a real capture must still show it. Left to
      // right in the order the narration says the names, so "Slack · Chrome ·
      // Edge" reads across the wall as a strip of marks rather than as one
      // unexplained icon among photographs. Never more than slots-1 of them, so
      // the wall can never become logos alone.
      const marks = marksFor(sc).slice(0, Math.max(0, slots - 1));
      const markFrom = marks.length ? slots - marks.length + 1 : 0;
      const markAt = (n) => (markFrom && n >= markFrom && n <= slots ? marks[n - markFrom] : null);
      if (marks.length) markSpent.add(sid);
      for (let n = 1; n <= (land ? 6 : slots); n++) {
        // Slots the wall really draws are guaranteed (recycled if needed);
        // beyond that, only fresh assets extend the wall — landscape only: a
        // portrait wall is capped hard at its 2 big cards, extending it would
        // re-create the small-tile grid this whole block removes.
        // A mark is deliberately NOT `place`d: `used` is the recycle pool, and a
        // logo repeated onto a later beat claims the film is about Slack.
        const a = markAt(n)
          || (n === vecTile ? place(takeVec()) : null)
          || place(take()) || (n <= slots ? recycle() : null);
        if (!a) break;
        out[`shot${n}`] = a.path;
        wall.push(a.path);
      }
      // NEVER A HATCHED PLACEHOLDER. When even recycling could not fill the two
      // portrait cards (an assetless film), the remaining card gets the branded
      // tonal plate — the same stand-in every single-shot slot already uses.
      while (!land && wall.length < slots) {
        out[`shot${wall.length + 1}`] = "__kfplate__";   // sentinel (16KB cap) — the harness swaps the plate in
        wall.push("__kfplate__");
      }
      // Momentum's Gallery reads shotA/shotB instead of shot1/shot2 — feed both
      // namings; unread fields are ignored by every other film.
      if (wall[0]) out.shotA = wall[0];
      if (wall[1]) out.shotB = wall[1];
      // The kit family's Montage iterates `scene.images[i]` across its tile grid,
      // so the same wall has to be published as a plain array too.
      if (wall.length) out.images = wall.slice(0, slots);
      // …and label those tiles with the USER's words. The suppression pass empties
      // the authored `tiles` (they are the demo brand's captions), but the kit
      // renderer treats an empty array as "unset" and falls back to its own
      // ["One","Two","Three","Four"] — so a blanked wall shipped counting words
      // under the screenshots. Caption from the scene's own bullets, blank where
      // it has none (a mid-sentence stump reads as a broken caption).
      // A MARK'S CAPTION IS ITS NAME. Captioning the Slack tile with the next
      // clause of the scene's copy labels the logo with a sentence about
      // something else; the product's name is the one caption that is both true
      // and the label a designer would set under a mark.
      if (Array.isArray(tpl.tiles) && tpl.tiles.length) {
        const caps = bullets(sc, slots);
        out.tiles = Array.from({ length: slots }, (_, n) => {
          const mk = markAt(n + 1);
          if (mk) return up(fit(String(mk.brand), 22));
          return caps[n] ? (up(fitLabel(caps[n], 22)) || " ") : " ";
        });
      }

      // INDEXED WALLS. Some films do not read shot1..N directly — they iterate a
      // LIST that names the keys: Birdsong's Gallery declares
      // `shots: [{k:"shot1",cap:"THE DASHBOARD"}, …]` and draws whatever that list
      // points at. The blanking pass above empties that list (it is an authored
      // array, and its captions are the demo brand's words), so the wall rendered
      // nothing even though shot1..3 were filled — measured live: 8 screenshots
      // captured, 0 on screen. Rebuild the list from the shots actually placed,
      // and caption it from the USER's own copy rather than the template's.
      for (const key of Object.keys(tpl)) {
        const authored = tpl[key];
        if (!Array.isArray(authored) || !authored.length) continue;
        if (!authored.every((e) => e && typeof e === "object" && /^shot\d+$/i.test(String(e.k || "")))) continue;
        const caps = bullets(sc, wall.length);
        out[key] = wall.map((_, n) => ({
          ...authored[n],
          k: `shot${n + 1}`,
          // A caption is only added when the scene has its own words for it; the
          // authored one names another product's screen.
          // A caption is a LABEL: a mid-sentence stump under a screenshot reads
          // as a broken caption, so blank beats blank rather than truncating —
          // and a mark is labelled with the name the narrator just said.
          cap: markAt(n + 1) ? up(fit(String(markAt(n + 1).brand), 22))
            : (caps[n] ? (up(fitLabel(caps[n], 22)) || " ") : " "),
        }));
      }
    }
    // The CTA logo box renders UNCONDITIONALLY: with no s.logo it draws a
    // hatched "LOGO / DROP IMAGE TO REPLACE" placeholder in the middle of the
    // user's closing frame. A real logo asset wins; otherwise a generated brand
    // monogram — never the placeholder.
    // SENTINEL, NOT THE IMAGE — the same reason `shot`/`image` carry one. The
    // generated monogram is a ~500-byte data-URI and this prop is emitted on
    // EVERY beat, so it alone consumed most of the engine's 16KB scene budget:
    // a 50-beat cast shed to 20 beats, and 600s over 20 beats is a 30-SECOND
    // hold per beat. That is the "why is the film so slow" report. The page
    // HTML has no size cap, so the monogram is built once out there and swapped
    // in per seek (see KF_MONO below).
    out.logo = logo ? logo.path : "__kfmono__";
    // …and the props the compiled film reads but its scene data never declares,
    // which otherwise fall through to that template's own demo figures.
    const hidden = HIDDEN_FALLBACK_PROPS[String(tplName || "")] || null;
    if (hidden) {
      for (const [k, v] of Object.entries(hidden)) {
        if (out[k] === undefined) out[k] = Array.isArray(v) ? v.slice() : v;
      }
    }
    // SAY IT ONCE. The pill list and the prose slots are filled from the same
    // mined copy, so a beat could show "81% ease of use" as its subheadline AND
    // again in a pill directly beneath it. Drop the pill, never the sentence —
    // the sentence carries the meaning and the pill is the echo.
    const said = new Set();
    for (const k of ["headline", "title", "words", "sub", "subtext", "body", "lead", "quote"]) {
      const v = out[k];
      if (typeof v === "string" && v.trim()) {
        for (const part of v.split("|")) {
          const n = part.trim().toLowerCase().replace(/[^\w%\s]/g, "").replace(/\s+/g, " ").trim();
          if (n.length > 3) said.add(n);
        }
      }
    }
    if (said.size) {
      for (const k of ["chips", "tags", "items"]) {
        if (!Array.isArray(out[k])) continue;
        const kept = out[k].filter((x) => {
          if (typeof x !== "string") return true;
          const n = x.trim().toLowerCase().replace(/[^\w%\s]/g, "").replace(/\s+/g, " ").trim();
          return !n || !said.has(n);
        });
        // Only apply when something survives: an empty pill row is a worse frame
        // than a repeated word.
        if (kept.length) out[k] = kept;
      }
    }
    // TYPE CONFORMANCE — THE LAST GATE BEFORE A FILM CAN CRASH.
    //
    // A compiled scene component reads its props with no guard: a slot the
    // template authored as an array is consumed with `.map()`, and handing it a
    // string throws INSIDE React, so that scene and EVERY scene after it render
    // the engine's error slate — a flat coloured frame with a red
    // "words.map is not a function" pill. Measured on a shipped 36s Flipkart
    // film: it ran correctly to 21.9s and was that error slate for the last 14
    // seconds, and every structural gate passed it.
    //
    // The individual writers above mostly ask `Array.isArray(tpl[key])` (asSlot
    // does), but any FALLBACK path that bypasses asSlot re-introduces the bug —
    // which is exactly what happened: `words` fell back to breakHeadline()'s
    // string on a scene whose bullets were too long to slam, and Bluesite is one
    // of the two templates that author `words` as an array.
    //
    // So the type is enforced once, here, against the authored scene itself.
    // Auditing 141 templates found three slots authored BOTH ways across the
    // bundle (`words` 2 array/6 string, `rows` 8/1, `keys` 7/1) — a fixed
    // assumption is wrong for somebody no matter which one is chosen, and the
    // next import can add more. A blank slot is always survivable; a thrown
    // component is not.
    conformToAuthored(out, tpl);
    return out;
  });
}

// Coerce every value written for `out` to the TYPE the template authored for it.
// Only touches keys the authored scene declares — injected media/logo props have
// no authored counterpart and are left alone.
function conformToAuthored(out, tpl) {
  if (!tpl || typeof tpl !== "object") return out;
  for (const key of Object.keys(out)) {
    const authored = tpl[key];
    if (authored === undefined || authored === null) continue;
    const v = out[key];
    if (v === undefined || v === null) continue;
    const wantArray = Array.isArray(authored);
    const isArray = Array.isArray(v);
    if (wantArray === isArray) {
      // Same container, but an array of OBJECTS cannot be fed plain strings:
      // the component reads r.t / r.n off each element and renders blank rows.
      if (!wantArray) continue;
      const proto = authored[0];
      if (proto && typeof proto === "object" && !Array.isArray(proto)) {
        out[key] = v.map((x, i) => (typeof x === "string" ? intoProto(proto, x, i) : reshapeToProto(proto, x, i)));
        continue;
      }
      // A ROW proto (array of cells) has the same failure mode as the object
      // proto above, one level down: a component that draws row[0]/row[1] gets
      // CHARACTERS when handed a plain string. Reshape to the authored arity.
      // A row with a figure cell is dropped rather than half-filled — see
      // isFigureCell; the authored row then stands, exactly as it does when
      // asSlot declines a numeric object shape.
      if (Array.isArray(proto) && proto.length) {
        if (proto.some(isFigureCell)) { delete out[key]; continue; }
        out[key] = v.map((x) => {
          if (Array.isArray(x)) {
            // Right container, wrong arity — pad/trim to what the row draws.
            return proto.map((cell, ci) => (x[ci] == null ? " " : String(x[ci])));
          }
          const parts = String(x).split("|").map((t) => t.trim()).filter(Boolean);
          return proto.map((cell, ci) => (parts[ci] == null ? (ci === 0 ? String(x) : " ") : parts[ci]));
        });
      }
      continue;
    }
    if (wantArray) {
      // STRING -> ARRAY. These slam slots are authored "|"-separated, which is
      // the same split the string-typed templates use, so one rule covers both.
      const parts = String(v).split("|").map((x) => x.trim()).filter(Boolean);
      if (!parts.length) { delete out[key]; continue; }
      const proto = authored[0];
      out[key] = (proto && typeof proto === "object" && !Array.isArray(proto))
        ? parts.map((x, i) => intoProto(proto, x, i))
        : parts;
      continue;
    }
    // ARRAY -> STRING. Objects have no honest one-line form, so an array of them
    // is dropped rather than stringified into "[object Object]".
    const flat = v.filter((x) => typeof x === "string" || typeof x === "number").map(String);
    if (flat.length) out[key] = flat.join("|"); else delete out[key];
  }
  return out;
}

// `purpose`/`kind` are the SCRIPT'S OWN VOCABULARY — "hook", "cta", "feature",
// "context". They are the last-resort filler for eyebrow/kicker/stamp slots, and
// they were being printed to screen verbatim: measured across the bundle, 297
// eyebrow chips reading "HOOK" or "CTA". Nobody labels a slide "HOOK". Same
// words, written the way a designer would set them.
// Several per purpose, because a long film is mostly ONE purpose: a 20-scene
// storyboard is 18 "feature" beats, and a single label per purpose stamped the
// same eyebrow on 33 frames (measured). Rotated by beat index — same words a
// designer would use, never the same chip twice running.
const PURPOSE_LABEL = {
  hook: ["Why it matters", "The reality", "Start here"],
  title: ["Overview", "The short version"],
  context: ["The reality", "Where we are", "The backdrop"],
  problem: ["The problem", "The cost", "What breaks"],
  pain: ["The cost", "What it costs you", "The problem"],
  feature: ["What it does", "In practice", "The capability", "Built in"],
  demo: ["See it work", "In practice", "Walkthrough"],
  how: ["How it works", "Under the hood", "The mechanism"],
  benefit: ["What you get", "The payoff", "The result"],
  proof: ["The proof", "Receipts", "In the field"],
  testimonial: ["In their words", "From the team"],
  stat: ["By the numbers", "Measured"],
  chart: ["By the numbers", "Measured"],
  pricing: ["What it costs", "Plans"],
  cta: ["Start here", "Next step"],
  close: ["Start here", "Next step"],
  quote: ["In their words", "From the team"],
  bullet: ["What you get", "The list"],
  caption: ["How it works", "In practice"],
  countdown: ["Counting down"],
  "shape-motion": ["In motion"],
};
const purposeLabel = (sc, i = 0) => {
  const raw = String(sc.purpose || sc.kind || "").trim().toLowerCase();
  if (!raw) return "";
  const set = PURPOSE_LABEL[raw];
  return set ? set[Math.abs(i) % set.length] : raw;
};

// The figures a template asks for at SCENE level (a ring's `to`, a gauge's
// `value`) — as opposed to inside a `stats` array. `dur` is timing, not content.
function numberSlots(tpl) {
  return Object.keys(tpl || {}).filter((k) => k !== "dur" && k !== "nat" && typeof tpl[k] === "number");
}

// SAME ROW, DIFFERENT KEY NAMES. This adapter writes one canonical stat shape
// — {v, suf, l} — but the templates do not agree on it: SteamSpring authors its
// Stats rows as {to, suffix, label}, others use {n, unit, t}. The compiled
// component reads its OWN names, so a correct figure written under a name that
// film does not read is simply absent, and a count-up on `undefined` paints
// **"NaN" in display type** — measured on a shipped film, in the closing frame,
// under "GET STARTED FREE". Type conformance could not see it: both sides are an
// array of objects, so nothing was wrong to check.
//
// Match by ROLE instead of by name: the authored value's own type says what each
// key is for — a number is the figure, a short symbol string is the unit, the
// longest string is the label.
function reshapeToProto(proto, el, i) {
  if (!el || typeof el !== "object" || Array.isArray(el)) return el;
  const pk = Object.keys(proto);
  // Already speaks this film's language (or shares enough of it) — leave it be.
  if (pk.some((k) => Object.prototype.hasOwnProperty.call(el, k))) return el;
  const isSuffixy = (s) => typeof s === "string" && s.length <= 3 && s.trim() && !/^[a-z]{2,}$/i.test(s.trim());
  const numKey = pk.find((k) => typeof proto[k] === "number");
  const sufKey = pk.find((k) => isSuffixy(proto[k]));
  const textKeys = pk.filter((k) => typeof proto[k] === "string" && k !== sufKey)
    .sort((a, b) => String(proto[b]).length - String(proto[a]).length);
  const vals = Object.values(el);
  const num = [el.v, el.to, el.value, el.n, ...vals].find((x) => typeof x === "number" && isFinite(x));
  const suf = [el.suf, el.suffix, el.unit].find((x) => typeof x === "string" && x.trim());
  const label = [el.l, el.label, el.t, ...vals.filter((x) => typeof x === "string")]
    .find((x) => typeof x === "string" && x.trim().length > 2);
  const out = {};
  for (const k of pk) {
    if (k === numKey) out[k] = num != null ? num : proto[k];
    else if (k === sufKey) out[k] = suf || " ";
    else if (k === textKeys[0]) out[k] = label || " ";
    else if (typeof proto[k] === "number") out[k] = num != null ? num : proto[k];
    else out[k] = /^\d+$/.test(String(proto[k])) || k === "n" ? String(i + 1).padStart(2, "0") : " ";
  }
  return out;
}

// Pour one string into a clone of the authored element's key shape. Mirrors
// asSlot's element handling: a numeric field means the component COUNTS it, so
// it is filled with the row's own index rather than invented or dropped.
function intoProto(proto, val, i) {
  const keys = Object.keys(proto).filter((k) => typeof proto[k] === "string");
  const textKey = keys.sort((x, y) => String(proto[y]).length - String(proto[x]).length)[0];
  const el = {};
  for (const k of Object.keys(proto)) {
    if (typeof proto[k] === "number") el[k] = i + 1;
    else if (k === textKey) el[k] = val;
    else el[k] = (/^\d+$/.test(String(proto[k])) || k === "n") ? String(i + 1).padStart(2, "0") : " ";
  }
  return el;
}

// A tiny inline SVG mark — the brand's initial on the accent colour. Kept
// minimal on purpose: OM_SCENES must stay under the engine's 16KB cap, and this
// is ~250 chars.
function monogram(brand, accent) {
  const ch = (String(brand || "").trim()[0] || "K").toUpperCase();
  const bg = /^#[0-9a-f]{3,8}$/i.test(String(accent || "")) ? accent : "#1A1A1A";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="${bg}"/><text x="50" y="50" font-family="Arial,Helvetica,sans-serif" font-size="58" font-weight="800" fill="#FFFFFF" text-anchor="middle" dominant-baseline="central">${ch}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// A branded stand-in for an image slot we could not fill.
//
// These templates draw their picture frames UNCONDITIONALLY: with no `s.shot`
// the compiled film paints its own editor placeholder — a hatched panel reading
// "DROP IMAGE TO REPLACE" with a dashed + button. That is authoring chrome, and
// it shipped into gallery previews (which build with no assets at all) and into
// any film whose asset pool ran short. `monogram` was already doing this job for
// the logo box; nothing did it for the picture plates.
//
// Wide rather than square, because these are 16:9-ish frames, and quiet on
// purpose — it should read as an intentional tonal panel, never as a broken
// image. Same data-URI approach as the monogram: no file, no network.
function fillPlate(brand, accent, ground) {
  const a = /^#[0-9a-f]{3,8}$/i.test(String(accent || "")) ? accent : "#6C5CE7";
  const g = /^#[0-9a-f]{3,8}$/i.test(String(ground || "")) ? ground : "#141018";
  const word = String(brand || "").trim().slice(0, 18).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice">`
    + `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">`
    + `<stop offset="0" stop-color="${a}" stop-opacity="0.34"/>`
    + `<stop offset="0.55" stop-color="${g}" stop-opacity="0.96"/>`
    + `<stop offset="1" stop-color="${a}" stop-opacity="0.20"/></linearGradient></defs>`
    + `<rect width="640" height="360" fill="${g}"/>`
    + `<rect width="640" height="360" fill="url(#g)"/>`
    + `<circle cx="500" cy="86" r="150" fill="${a}" opacity="0.12"/>`
    + (word ? `<text x="320" y="188" font-family="Arial,Helvetica,sans-serif" font-size="34" font-weight="800"`
      + ` letter-spacing="6" fill="#FFFFFF" fill-opacity="0.42" text-anchor="middle">${word.replace(/&/g,"&amp;").replace(/</g,"&lt;")}</text>` : "")
    + `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Build a composition that renders `storyboard` inside the named template.
 * Returns the same { indexHtml, metaJson, mediaPlan } shape every dedicated
 * composer returns, so composeWithPackRenderer needs no special-casing.
 */
// ---- BRAND RECOLOUR FOR BUNDLED TEMPLATES ------------------------------------
//
// THE DEFECT THIS FIXES. The Art Director resolves the user's brand palette into
// a skin and persists it as `brand_review` — and for the 139 bundled packs it was
// then thrown away. `composeWithPackRenderer` even detects it (it greps the
// composer's parameter list for `brandSkin` and logs "that direction has NO
// effect on this film"), then composes anyway. So a user could pick their brand
// colours, watch the pipeline log that it understood them, and get a film with
// none of them in it. Measured on a real job: accents resolved to #ff6a3c/#2b5bff,
// occurrences in the rendered HTML — zero.
//
// WHY A HEX SUBSTITUTION AND NOT A THEME PARAMETER. These templates are AUTHORED
// bundles; each one names its colours whatever it likes (ember-roast's OM_TWEAKS
// carries `roast` and `ember`, not `accent`), and nothing reads a shared token.
// There is no theme contract to pass a skin through. What every pack DOES have is
// a manifest stating which hex plays which ROLE, and those exact hexes appear
// literally in the template HTML (verified across the pack set). So the mapping is
// role -> hex -> replacement.
//
// ACCENT-ONLY, DELIBERATELY. Only the accent roles are remapped; `ground` and
// `ink` are never touched. That is the Art Director's own contract (a brand skin
// is an accent skin), and it is what keeps the pack's character and its contrast
// intact — repainting a ground with an arbitrary brand colour is how you get
// unreadable type.
const HEXRE = /^#[0-9a-fA-F]{6}$/;
const lumOf = (hex) => {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/**
 * Rewrite a bundled template's ACCENT hexes to the user's brand accents.
 * Returns the html unchanged when there is no skin, no manifest colours, or no
 * accent survives the contrast guard — so the un-branded path is byte-identical.
 */
function applyBrandSkin(html, framePack, brandSkin) {
  const accents = (brandSkin && Array.isArray(brandSkin.accents) ? brandSkin.accents : [])
    .filter((c) => HEXRE.test(String(c || "")));
  if (!accents.length) return { html, applied: [] };

  let man = null;
  try { man = require("./frame_manifest").getManifest(framePack) || null; } catch { /* no manifest */ }
  const colors = (man && man.colors) || null;
  if (!colors) return { html, applied: [] };

  // IDENTIFY THE SURFACE BY VALUE, NOT BY ROLE NAME.
  //
  // Packs do NOT agree on what to call their colours. The canonical set is
  // ground/ink/accent/a2, but a regenerated pack names them after its own
  // subject — ember-roast ships {roast, cream, ember, gold, ink}, where `roast`
  // IS the ground and `cream` IS the text. A name-based exclusion silently
  // repainted both, which is how a recolour turns into an unreadable film.
  // `surface.ground` / `surface.ink` are the authoritative fields every pack
  // fills regardless of what it names its palette entries, so match on the HEX.
  const surface = (man && man.surface) || {};
  const groundHex = [surface.ground, colors.ground].find((v) => HEXRE.test(String(v || ""))) || null;
  const inkHex = [surface.ink, colors.ink].find((v) => HEXRE.test(String(v || ""))) || null;
  const reserved = new Set([groundHex, inkHex].filter(Boolean).map((h) => h.toLowerCase()));
  const ground = groundHex;

  // Everything the pack declares that is neither its surface nor its text is an
  // accent, in authored order. De-duplicated: a pack may use one hex for two
  // roles, and replacing it twice would map the second occurrence off the first
  // result.
  const accentHexes = [...new Set(
    Object.values(colors)
      .map((v) => String(v))
      .filter((v) => HEXRE.test(v) && !reserved.has(v.toLowerCase())),
  )];
  if (!accentHexes.length) return { html, applied: [] };

  const applied = [];
  let out = html;
  accentHexes.forEach((from, i) => {
    const to = accents[i % accents.length];
    if (to.toLowerCase() === from.toLowerCase()) return;
    // CONTRAST GUARD. A brand accent that sits on top of the pack's own ground
    // disappears — the same |luminance delta| floor the scene-kit applies when it
    // admits a brand accent. Keep the pack's colour rather than paint an
    // invisible one.
    if (ground && Math.abs(lumOf(to) - lumOf(ground)) < 45) return;
    // Case-insensitive, all occurrences: the bundles mix #E0662C and #e0662c.
    const re = new RegExp(from.replace("#", "#"), "gi");
    const before = out;
    out = out.replace(re, to);
    if (out !== before) applied.push(`${from}->${to}`);
  });
  return { html: out, applied };
}

function buildComposition({ storyboard, dims, framePack, assets, template, manifest, captionCues, scriptCues, scriptOverlay = false, brandSkin = null } = {}) {
  // composeWithPackRenderer passes framePack (the SLUG, e.g. "reel"); the
  // template file is named by the manifest ("Reel"). Resolve through the
  // manifest so a pack only has to declare `template` once, in pack.json.
  let tplName = template || (manifest && manifest.template) || null;
  if (!tplName && framePack) {
    try { tplName = (require("./frame_manifest").getManifest(framePack) || {}).template || null; }
    catch { /* fall through to the slug */ }
  }
  tplName = tplName || framePack;
  // Per-pack typographic treatment. Resolved here rather than trusted from opts:
  // neither pipeline.composeWithPackRenderer nor the preview generator passes a
  // manifest, so an opts-only read yields nothing on every real path.
  let tfx = (manifest && manifest.textfx) || null;
  if (!tfx && framePack) {
    try { tfx = ((require("./frame_manifest").getManifest(framePack) || {}).textfx) || null; }
    catch { /* no manifest — render the template's own type unchanged */ }
  }
  const file = templatePath(tplName);
  if (!file) throw new Error(`omelette: template "${tplName}" not found in ${TPL_DIR}`);
  let html = fs.readFileSync(file, "utf8");

  // The user's brand accents, applied to the authored bundle BEFORE anything else
  // reads a colour out of it (the `accent` extraction below pulls from OM_TWEAKS,
  // so recolouring first means the monogram and fill plates inherit the brand too).
  if (brandSkin) {
    const skinned = applyBrandSkin(html, framePack, brandSkin);
    if (skinned.applied.length) {
      html = skinned.html;
      console.log(`[omelette] ${framePack || tplName}: brand skin applied — ${skinned.applied.join(", ")}`);
    } else {
      console.log(`[omelette] ${framePack || tplName}: brand skin had no applicable accent (kept the pack's own)`);
    }
  }

  const sb = storyboard || {};
  const reqW = (dims && dims.width) || 1920, reqH = (dims && dims.height) || 1080;
  // COMPOSE AT THE TEMPLATE'S NATIVE CANVAS (1920x1080 / 1080x1920).
  //
  // These films lay type out in absolute px against their authored canvas, and
  // the engine fits them with scale = min(cw/filmW, (ch - 44)/filmH), reserving
  // 44px for its playback bar. At any OTHER size that reserve makes the film
  // land short — measured: a 720x1280 render of a 1080x1920 film scaled to
  // 0.64375, filling 695x1236 of a 720x1280 frame, with the bar in shot.
  // Overriding the engine's scale afterwards never held (React recomputes it),
  // and resizing its container did not reach the element it measures.
  //
  // At native, that same arithmetic solves to exactly 1 — no override, no fight.
  // The page is sized 44px taller so the reserve cancels and the bar renders
  // BELOW #root, which is clipped to the native canvas. The finished video is
  // simply encoded at native resolution, which is never worse than the request.
  // Native canvas is a property of the TEMPLATE, not of what the caller asked
  // for. Deriving it from the requested aspect meant a portrait template asked
  // for at 1280x720 composed landscape (and vice versa) — the film would then be
  // cropped into the wrong frame.
  //
  // It is now read from the pack manifest's `portraitNative`, and otherwise from
  // the set of templates every OTHER manifest declares portrait-native. A literal
  // list here did not survive contact with a 120-template import: it is the one
  // registration site with no failure signal — a template missing from it renders
  // the whole film in the wrong frame and every gate still passes.
  //
  // The old second clause was dead: `!/Vertical|Reel/.test(name) === false`
  // reduces to "the name contains Vertical or Reel", which the set already held,
  // so it never widened anything. Dropped rather than carried forward.
  const nativePortrait =
    manifest && typeof manifest.portraitNative === "boolean"
      ? manifest.portraitNative
      : portraitTemplates().has(String(tplName));
  const W = nativePortrait ? 1080 : 1920;
  const H = nativePortrait ? 1920 : 1080;
  // Beat COUNT is chosen against the template's authored pace further down (see
  // fitBeats) — not by truncating here. This only guards against a pathological
  // storyboard; ENGINE_MAX_SCENES is the engine's own hard ceiling.
  let scenes = Array.isArray(sb.scenes) && sb.scenes.length ? sb.scenes.slice() : [{ id: "s1", duration: 4, headline: sb.title || "" }];
  // THE FILM MUST SPAN THE WHOLE VIDEO, however many beats survive the caps.
  //
  // `durationSec` is authoritative-from-request (storyboard.js sets it from the
  // job); the scene list is not, because it gets truncated here and shed again
  // below to fit the engine's 16KB/50-scene limits. Deriving the composition's
  // length from the SURVIVING scenes is what left a 300s job declaring ~165s of
  // film: hyperframes then captured a short composition, the mixer laid 300s of
  // voiceover over it, and the picture froze at 2:45 while the narrator kept
  // talking. Keep the requested length as the target and make the beats fit it
  // (see the rescale after the shed), rather than letting dropped beats shorten
  // the film.
  const requestedD = Math.max(1, Number(sb.durationSec) || 0)
    || Math.round((scenes.reduce((a, s) => a + Math.max(1.2, Number(s.duration) || 4), 0)) * 100) / 100;
  let D = requestedD;

  // OWNER sources only. topic-screenshots are captures of OTHER products'
  // reference sites, so deriving the film's URL from one printed a COMPETITOR'S
  // domain on the CTA — a real Lumen film closed on "reflect.app" because its
  // topic shots were of reflect/notion/mem.
  const host = (Array.isArray(assets) ? assets : [])
    .filter((a) => a && a.sourceUrl && /^(website|website-image|blog)$/.test(String(a.source)))
    .map((a) => { try { return new URL(a.sourceUrl).hostname.replace(/^www\./, ""); } catch { return null; } })
    .find(Boolean);
  // A film TITLE is often a sentence ("Teampulse ends the busywork") — slicing
  // it to 18 chars branded a real film "Teampulse Ends the" with the URL
  // teampulseendsthe.com. When the fallback is a multi-word title, the brand is
  // its FIRST word. An explicit sb.brand is taken as authored — UNLESS it is
  // itself a slogan ("One App For Everything" shipped as "ONE APP FOR EVERYT")
  // while the client's own domain was sitting in the assets; the domain label is
  // the truest brand there is ("flipkart.com" -> "Flipkart").
  const hostBrand = host ? host.split(".")[0].replace(/^./, (c) => c.toUpperCase()) : "";
  const brandSrc = (() => {
    const explicit = String(sb.brand || "").trim();
    const isSlogan = (s) => s.split(/\s+/).length >= 3 && s.length > 16;
    if (explicit && !(isSlogan(explicit) && hostBrand)) return explicit;
    if (hostBrand) return hostBrand;
    if (explicit) return explicit;
    const t = String(sb.title || "").trim();
    if (!t) return "";
    const words = t.split(/\s+/);
    if (words.length < 3) return t;
    // THE FIRST WORD OF A SENTENCE IS NOT A BRAND. A title like "From bare soil
    // to first harvest" branded the film "From" and closed it on "from.com" — a
    // domain that exists and belongs to someone else. Take the first word that
    // could plausibly BE a name; a title made only of function words yields no
    // brand at all, which is handled below.
    const w = words.map((x) => x.replace(/[^A-Za-z0-9'&-]/g, "")).find((x) => x.length >= 3 && !TITLE_STOP.has(x.toLowerCase()));
    return w || "";
  })();
  const brand = brandSrc.slice(0, 18);
  // NEVER INVENT A DOMAIN. This used to fall back to `${brand}.com`, which is not
  // a guess — it is an assertion, printed in the corner of every frame and on the
  // CTA, about a domain we do not own and have never checked. "from.com",
  // "turn.com" and friends all resolve to real businesses. Show a URL only when
  // one was actually supplied or harvested from the film's own site; otherwise
  // show none and let the CTA carry the call to action on its own.
  const url = String(sb.url || host || "").slice(0, 40);

  const tplScenes = readTemplateScenes(html);
  if (!tplScenes || !tplScenes.length) throw new Error(`omelette: template "${tplName}" exposes no OM_SCENES`);

  // PACE: MATCH THE TEMPLATE'S OWN BEAT LENGTH, DON'T STRETCH TO FILL.
  //
  // Covering the requested duration by stretching whatever beats survived made a
  // 10-minute film crawl: 50 beats over 600s is 12s a beat against an authored
  // 7.5s, so every animation played at ~0.6x and the film read as sluggish.
  //
  // The beat COUNT is the free variable, not the beat LENGTH. Pick the count that
  // lands closest to the template's authored pace, then cast the script onto it:
  //   - too few script scenes for that count -> REPEAT interior beats (the film's
  //     shapes are what repeat; the opener and the closer are never reused, so the
  //     film still starts and ends in its authored form)
  //   - too many -> drop interior beats evenly, keeping first and last
  // Cast durations then come out at the authored pace by construction.
  const authoredPace = (() => {
    const ds = tplScenes.map((s) => Number(s && s.dur)).filter((n) => n > 0).sort((a, b) => a - b);
    return ds.length ? ds[Math.floor(ds.length / 2)] : 7.5;      // median beat of the film itself
  })();
  const idealBeats = Math.max(2, Math.round(requestedD / authoredPace));
  // PACE MAY ADD CUTS; IT MAY NOT TAKE COPY AWAY.
  //
  // This used to be `min(ENGINE_MAX_SCENES, idealBeats)`, which merged a script
  // down to whatever the template's pace wanted — a 60-scene script became 40
  // beats, and the 20 scenes folded away were still being narrated. Merging is a
  // concession to the ENGINE's hard 50-scene ceiling, not a styling choice, so
  // never ask for fewer beats than the script has scenes. When the script is
  // SHORTER than the pace wants, fitBeats returns it untouched and buildScenes
  // splits long scenes to reach the pace — cuts added inside a scene, which move
  // no boundary and lose nothing.
  const targetBeats = Math.min(ENGINE_MAX_SCENES, Math.max(idealBeats, scenes.length));
  scenes = fitBeats(scenes, targetBeats);
  if (idealBeats > ENGINE_MAX_SCENES) {
    // Say it out loud rather than quietly shipping a slow film: past
    // ENGINE_MAX_SCENES x authoredPace the engine simply cannot hold enough beats,
    // so the only way to cover the duration is longer beats.
    console.warn(
      `[omelette] ${tplName}: ${requestedD}s at this template's ${authoredPace}s pace wants ${idealBeats} beats, ` +
      `but the engine caps the scene list at ${ENGINE_MAX_SCENES} — beats run ${(requestedD / targetBeats).toFixed(1)}s ` +
      `(${(requestedD / targetBeats / authoredPace).toFixed(2)}x the authored pace). ` +
      `Films up to ${Math.floor(ENGINE_MAX_SCENES * authoredPace)}s hold the authored pace.`
    );
  }
  // The template's accent colour (for the monogram fallback) lives in its
  // OM_TWEAKS — either form (quoted string or EDITMODE object literal).
  const accent = (() => {
    const m = /window\.OM_TWEAKS\s*=\s*(?:'([\s\S]*?)'|\/\*EDITMODE-BEGIN\*\/([\s\S]*?)\/\*EDITMODE-END\*\/)/.exec(html);
    if (!m) return null;
    try { return (JSON.parse(m[1] || m[2]) || {}).accent || null; } catch { return null; }
  })();

  let omScenes = buildScenes({ tplScenes, scenes, assets, brand, url, tfx, land: W > H, accent, tplName, filmTitle: String(sb.title || "").trim() });

  // HARD ENGINE LIMIT: ssParse rejects an OM_SCENES string over 16KB (or >50
  // scenes) by rendering a full-frame ERROR SLATE for the whole film — worse
  // than any trimmed field could ever be. Shed weight in quality order until it
  // fits: gallery walls first, then long copy, then whole tail scenes.
  // BOTH engine limits, not just the byte one. ssParse rejects a list over
  // ENGINE_MAX_SCENES entries exactly as hard as an oversized payload, and
  // buildScenes can SPLIT a scene into two beats — so a cast fitted to 50 scenes
  // legitimately arrives here as 54 beats and has to come back down.
  const fits = () => omScenes.length <= ENGINE_MAX_SCENES
    && JSON.stringify(JSON.stringify(omScenes)).length < 15500;
  if (!fits()) {
    for (const s of omScenes) { for (let n = 1; n <= 6; n++) delete s[`shot${n}`]; delete s.shotA; delete s.shotB; delete s.images; if (fits()) break; }
  }
  // PACE OUTRANKS COPY LENGTH. Dropping a beat costs a cut and lengthens every
  // surviving beat (the film gets slower); shortening a supporting line costs a
  // few words nobody re-reads. Trim copy in tiers down to a hard floor BEFORE
  // sacrificing a single beat — a 50-beat cast used to shed to ~20 here, which is
  // what made a long film crawl once the survivors were stretched to cover it.
  for (const cap of [80, 60, 44, 32, 24]) {
    if (fits()) break;
    for (const s of omScenes) {
      for (const k of ["body", "sub", "quote", "callout"]) {
        if (typeof s[k] === "string" && s[k].length > cap) s[k] = fit(s[k], cap);
      }
      if (fits()) break;
    }
  }
  // Then the list-valued props, which are the next largest payload after prose.
  //
  // …but not a SEQUENCE (see isFigureRack). Cutting ["3","2","1","GO"] to
  // ["3","2"] saves about twenty bytes and leaves a countdown that counts to two
  // and stops; the same cut on a tear-off calendar drops half its leaves. These
  // racks are a handful of one- to four-character tokens, so they were never
  // where the payload is — trim the prose racks, which are.
  if (!fits()) {
    for (const s of omScenes) {
      for (const k of ["items", "chips", "rows", "pairs", "words", "steps", "stats", "plans"]) {
        if (!Array.isArray(s[k]) || s[k].length <= 2) continue;
        if (isFigureRack(s[k])) continue;
        s[k] = s[k].slice(0, 2);
      }
      if (fits()) break;
    }
  }
  // Only now give up beats — and give them up by MERGING, never by deleting.
  //
  // This used to `splice` a beat straight out of the list, which threw away
  // whatever that beat was going to say and handed its seconds to the rescale
  // below, sliding every later boundary off the scene it belonged to. On a long
  // film the byte cap bites hardest exactly where there is most to lose: a 600s
  // job shed to 44 beats here and lost 27 scenes' copy, after fitBeats had
  // carefully preserved all of it. Folding the beat into its neighbour keeps the
  // running time exactly where it was and keeps the copy on the frame, because
  // the surviving beat inherits what fits of the absorbed one.
  // MERGE THE CHEAPEST PAIR, WHEREVER IT IS — never always at the tail.
  //
  // Taking the penultimate beat every time puts every merge in the same place:
  // eleven passes over a 60-scene script grew one beat to 68.6s, a full minute of
  // held frame while the narration ran through eleven scenes. That is the frozen
  // tail again wearing a different hat — the time is accounted for, so the
  // duration guard stays green and nothing reports it. Picking the pair whose
  // MERGED length is smallest spreads the loss across the film and keeps every
  // beat near the pace the rest of the film is cutting at.
  //
  // AND FOLD INSIDE A SCENE BEFORE FOLDING ACROSS ONE. Two beats cut from the SAME
  // script scene are two views of one narration: merging them costs a cut and
  // nothing else, because the surviving beat still says that scene's words while
  // that scene is being spoken. Merging ACROSS a scene boundary is what puts one
  // scene's copy under another scene's voice — the defect this file keeps
  // relitigating — so those pairs are the last resort, not the cheapest option.
  while (!fits() && omScenes.length > 2) {
    let i = -1, best = Infinity, bestSame = false;
    for (let k = 1; k < omScenes.length - 1; k++) {   // never fold the opener or the closer
      const merged = (Number(omScenes[k].dur) || 0) + (Number(omScenes[k - 1].dur) || 0);
      const same = omScenes[k][SCENE_OF] !== undefined && omScenes[k][SCENE_OF] === omScenes[k - 1][SCENE_OF];
      if (same && !bestSame) { best = merged; i = k; bestSame = true; continue; }
      if (same === bestSame && merged < best) { best = merged; i = k; }
    }
    if (i < 0) break;
    const gone = omScenes.splice(i, 1)[0];
    const into = omScenes[i - 1];
    into.dur = r2((Number(into.dur) || 0) + (Number(gone.dur) || 0));
    // Carry the absorbed beat's lead line as a supporting line where the shape
    // has room for one. Only into an EMPTY slot: overwriting the survivor's own
    // copy would trade one lost line for another.
    const lead = String(gone.title || gone.headline || "").trim();
    if (lead) {
      for (const k of ["sub", "body", "callout"]) {
        if (!String(into[k] || "").trim()) { into[k] = lead; break; }
      }
    }
  }

  // RESCALE THE SURVIVORS ONTO THE REQUESTED LENGTH.
  //
  // Everything above sheds beats: the 50-scene slice, the gallery/copy trims and
  // this splice loop. Each dropped beat took its seconds with it, so the film
  // ended early and held its last frame for the remainder — the "video got stuck
  // at 2:45" report. Stretch what survived to cover the full duration instead, so
  // fewer beats simply means longer beats, never a frozen tail.
  //
  // The engine's PACE warp re-reveals inside each beat, so a stretched beat reads
  // as a slower beat rather than a stalled one. A floor of 1.2s keeps a very long
  // script from producing flash-frames when it survives intact.
  {
    const sum = omScenes.reduce((a, s) => a + Math.max(0, Number(s.dur) || 0), 0);
    if (sum > 0 && omScenes.length) {
      const k = requestedD / sum;
      let acc = 0;
      omScenes.forEach((s, i) => {
        const v = i === omScenes.length - 1
          ? Math.max(1.2, requestedD - acc)                    // last beat absorbs rounding
          : Math.max(1.2, Math.round((Number(s.dur) || 0) * k * 100) / 100);
        s.dur = Math.round(v * 100) / 100;
        acc = Math.round((acc + s.dur) * 100) / 100;
      });
    }
    D = Math.round(omScenes.reduce((a, s) => a + (Number(s.dur) || 0), 0) * 100) / 100 || requestedD;
  }

  // 1 — swap the scene list. It lives in a plain inline <script> in the page
  // HTML, which the bundler stores JSON-encoded inside __bundler/template.
  const payload = JSON.stringify(JSON.stringify(omScenes));      // the film reads a STRING
  html = html.replace(/<script type="__bundler\/template"[^>]*>([\s\S]*?)<\/script>/i, (full, body) => {
    let page;
    try { page = JSON.parse(body); } catch { return full; }
    // Escape-aware for the same reason the reader is (a "';" in authored copy
    // would end the match early and leave a fragment of the demo scenes behind),
    // and replaced via a FUNCTION so a "$&" or "$'" in the user's own copy is
    // inserted literally instead of being read as a substitution pattern.
    page = page.replace(
      /window\.OM_SCENES\s*=\s*'(?:[^'\\]|\\.)*'\s*;/,
      () => `window.OM_SCENES = ${payload};`,
    );
    // OM_TWEAKS drives the PERSISTENT chrome — the brand mark and URL pinned to
    // every frame — and ships in TWO forms. Some templates store it as a quoted
    // JSON string; others (Fetch et al) as a raw object literal wrapped in
    // /*EDITMODE-BEGIN*/…/*EDITMODE-END*/ markers. The old quoted-only regex
    // silently missed the second form, so the demo brand ("Fetch" / fetch.dog)
    // stayed in the corner of every frame of the user's film. MERGE rather than
    // replace: the object also carries template-specific knobs (accent,
    // dogColor, …) that the design needs.
    const mergeTweaks = (raw) => {
      let cur = {};
      try { cur = JSON.parse(raw) || {}; } catch { /* keep {} — still brand-correct */ }
      return { ...cur, brandName: brand, url };
    };
    page = page.replace(
      /window\.OM_TWEAKS\s*=\s*'([\s\S]*?)'\s*;/,
      (_, raw) => `window.OM_TWEAKS = ${JSON.stringify(JSON.stringify(mergeTweaks(raw)))};`,
    );
    page = page.replace(
      /window\.OM_TWEAKS\s*=\s*\/\*EDITMODE-BEGIN\*\/([\s\S]*?)\/\*EDITMODE-END\*\//,
      (_, raw) => `window.OM_TWEAKS = /*EDITMODE-BEGIN*/${JSON.stringify(mergeTweaks(raw))}/*EDITMODE-END*/`,
    );
    // `/` MUST be escaped on the way back in. The page HTML contains literal
    // "</script>" sequences; JSON.stringify does not escape the slash, so the
    // re-embedded JSON would close this very <script> tag early and the block
    // would parse as truncated garbage (the film then never mounts). The bundler
    // itself writes them as </script> for exactly this reason — `\/` is a
    // valid JSON escape, so this stays parseable.
    return `<script type="__bundler/template">${JSON.stringify(page).replace(/<\//g, "<\\/")}</script>`;
  });

  // 2/3/4 — the render harness. Injected at the very end of <body> so it runs
  // after the bundler has mounted the film.
  const tfxCss = (() => {
    if (!tfx) return "";
    const rules = [];
    if (String(tfx.case).toLowerCase() === "upper") rules.push("text-transform:uppercase !important");
    const w = Number(tfx.weight);
    if (Number.isFinite(w) && w >= 100 && w <= 900) rules.push(`font-weight:${Math.round(w)} !important`);
    const tr = Number(tfx.tracking);
    if (Number.isFinite(tr) && Math.abs(tr) <= 0.5) rules.push(`letter-spacing:${tr}em !important`);
    if (!rules.length) return "";
    // Headlines only: the templates draw them at >=34px, while eyebrows, URLs and
    // callout labels are small mono runs that are already styled deliberately.
    return `
#root [style*="font-size"]{}
#root h1,#root h2,#root [style*="font-weight:700"],#root [style*="font-weight: 700"]{${rules.join(";")};}
`;
  })();

  // The narration in display type, over the film. Seeked by the same hook that
  // drives the subtitle node, so scrubbing lands on the exact spoken phrase.
  let overlay = null;
  try {
    // These are COMPILED films: their palette lives inside a bundled React tree
    // we cannot introspect, so unlike the family engine there is no pack ink to
    // borrow. A neutral near-black plate with white type is the safe read over
    // any of them — the same lower-third convention the films' own subtitle node
    // uses — and it clears AA by construction rather than by luck.
    // OPT-IN (2026-08-11). This layer used to be mandatory — "every spoken word
    // goes on screen", self-deriving its cues from the storyboard so it could not
    // be switched off — and on a real film that is what it looked like: a Flipkart
    // render carried the pack's own headline "INDIA'S ULTIMATE DESTINATION" in the
    // template's display face AND, stamped across the product screenshot beneath
    // it, "INDIA'S ULTIMATE ONE-STOP DESTINATION" in the overlay's. The same words
    // twice, in two faces, one of them covering the picture. QA logged it as an
    // ELEMENT COLLISION blocker and the user's first note on the finished video
    // was "why am I getting the script caption text on the video".
    //
    // The mined headline slots already put the film's copy on screen in the
    // template's own typography, which is the version that reads as designed. So
    // the layer now renders only when a caller explicitly asks for it, and never
    // derives its own cues — the caller's silence means off, not "figure it out".
    // Enabling subtitles must not turn it on either: `captionCues` drives the
    // small #cap-pill node, which is a different, deliberately modest thing.
    const cues = (scriptOverlay && Array.isArray(scriptCues) && scriptCues.length) ? scriptCues : null;
    if (!cues) throw new Error("script overlay not requested");
    // Set the spoken line in the TEMPLATE'S OWN display face. The layer used a
    // generic Anton/system stack, which read as a subtitle pasted over the film
    // rather than as the film's typography. The manifest's display font is now
    // measured from the template itself (npm run fonts:sync), so it is safe to
    // trust — and the template already ships that @font-face, so no webfont is
    // fetched at render time.
    let dispFont = "";
    try {
      const mf = manifest || (framePack ? require("./frame_manifest").getManifest(framePack) : null);
      const d = mf && mf.typography && mf.typography.display;
      if (d) dispFont = `'${d}',system-ui,sans-serif`;
    } catch { /* fall back to the layer's own stack */ }
    overlay = require("./script_overlay").buildScriptOverlay(cues, W, H, {
      // coverage 1 — each phrase holds its whole share of the cue instead of
      // leaving a gap, so the spoken line is on screen continuously rather than
      // blinking out between phrases.
      ground: "#0B0B0C", ink: "#FFFFFF", coverage: 1,
      font: dispFont,
      // Burned-in subtitles and this layer used to be mutually exclusive by
      // construction — the overlay's CSS display:none'd #cap-pill outright. When
      // the user explicitly asked for captions, keep them; the two occupy
      // different bands (placeScript stays out of the bottom strip).
      suppressCaptions: !(Array.isArray(captionCues) && captionCues.length),
    });
  } catch { /* no VO, nothing to show */ }

  // SCREENSHOT FIT. The compiled films place captures with object-fit:cover and
  // object-position:50% 50%. Measured on showcase-vertical: a 2732x1800 capture
  // in a 907x669 frame is scaled to fill the height, so ~5% is cut from EACH
  // side — and a web page puts its logo and headline hard against the left edge,
  // so that 5% is exactly the words. Frames read "…nbox" instead of "Trello
  // Inbox", and "…ate your workflow" instead of "Automate your workflow".
  //
  // Anchoring to the top-left keeps the part of a page that carries the meaning
  // (mark, nav, headline, hero) and spends the crop on the bottom-right, which is
  // whitespace or below-the-fold content. Only SCREENSHOTS are re-anchored —
  // photos and logos keep the film's own centring, so a portrait or product shot
  // the template deliberately centres is left alone.
  const shotFiles = [...new Set((Array.isArray(assets) ? assets : [])
    .filter(isShot).map((a) => String(a.path || "").split("/").pop()).filter(Boolean))];
  // ...and PIN object-fit while we are here. The comment above assumed every film
  // places captures with `cover`; not all do, and CSS defaults object-fit to
  // `fill`, which STRETCHES the image to the box instead of cropping it. A
  // 2732x1800 desktop capture dropped into a tall phone bezel then renders
  // horizontally squashed — QA reported exactly that ("IMAGE DISTORTION: the
  // screenshot inside the mobile device frame appears horizontally squashed").
  // `cover` crops instead of distorting; `left top` decides what the crop keeps.
  const shotFitCss = shotFiles.length
    ? `  ${shotFiles.map((f) => `img[src$="${f}"]`).join(",\n  ")} { object-fit: cover !important; object-position: left top !important; }`
    : "";
  // VECTORS LETTERBOX, THEY DO NOT CROP. Flat art has no spare margin to spend on
  // a cover-crop: filling a 16:9 card with an icon centres one enlarged limb of it
  // and reads as a smear, which is why these were barred from the pool outright.
  // `contain` + inset padding keeps the whole glyph inside the card at a sane size
  // — the same trade template_engine makes with its `fitContain` flag.
  // A BRAND MARK LETTERBOXES for the same reason and one more: half a
  // competitor's logo is not a crop, it is the wrong logo. These are listed
  // separately because they also need the inline pass below — the wall tiles that
  // draw them can sit inside a shadow root, which a document stylesheet cannot
  // reach (see kfFitShots).
  const vectorFiles = [...new Set((Array.isArray(assets) ? assets : [])
    .filter((a) => isVectorAsset(a) || isBrandMark(a)).map((a) => String(a.path || "").split("/").pop()).filter(Boolean))];
  const brandFiles = [...new Set((Array.isArray(assets) ? assets : [])
    .filter(isBrandMark).map((a) => String(a.path || "").split("/").pop()).filter(Boolean))];
  const vectorFitCss = vectorFiles.length
    ? `  ${vectorFiles.map((f) => `img[src$="${f}"]`).join(",\n  ")} { object-fit: contain !important; object-position: center !important; padding: 6% !important; box-sizing: border-box !important; }`
    : "";

  const harness = `
<div id="cap-pill" style="position:absolute;left:8%;right:8%;bottom:6%;text-align:center;font-family:system-ui,sans-serif;font-weight:700;font-size:${Math.round(H * 0.028)}px;line-height:1.3;color:#fff;text-shadow:0 2px 12px rgba(0,0,0,.75);opacity:0;z-index:60;"></div>
${overlay ? overlay.html : ""}
<style>
${overlay ? overlay.css : ""}
${shotFitCss}
${vectorFitCss}
  /* The playback bar is drawn by the ENGINE (animations-v2.jsx), not the film —
     which is why grepping the film sources for "PlaybackBar" found nothing while
     the bar still appeared in every export.
     It cannot simply be display:none'd: the engine's auto-scale reserves exactly
     44px for it (barH = 44; scale = min(w/W, (h - barH)/H)), so hiding it alone
     leaves the film letterboxed by that reserve.
     So instead the PAGE is made 44px TALLER than the film. The engine then solves
     scale = min(W/W, (H+44-44)/H) = 1 — a pixel-exact fit — and the bar renders
     BELOW the film, outside #root, which is clipped to exactly H. The renderer
     captures #root, so the bar can never reach the video. */
  html,body { margin:0; padding:0; overflow:hidden; background:#000; width:${W}px; height:${H + 44}px; }
  /* Neutralise the engine's auto-scale outright. It solves
     scale = min(w/W, (h - 44)/H) against the VIEWPORT, reserving 44px for its
     playback bar — so the film shrinks and letterboxes whenever the host sizes
     the page to exactly WxH (which the preview renderer does). Pinning the stage
     to WxH at scale 1 makes the fit independent of however the host measures. */
  /* The engine reserves 44px for its playback bar when auto-scaling
     (scale = min(w/W, (h - 44)/H)), so the page is sized 44px taller than the
     film: the fit then lands at 1 and the bar renders BELOW #root, outside the
     captured element. Verified good for LANDSCAPE. Vertical still mis-fits —
     see the note at the top of this file. */
  #kf-comp-root { overflow:hidden !important; }
  #kf-comp-root { overflow:hidden !important; }
  ${tfxCss}
  /* Belt and braces for builds that mark the transport explicitly. */
  [data-om-playback], .om-playbar, .om-playback-bar { display:none !important; }
</style>
<script>
(function(){
  var W=${W}, H=${H}, D=${D};
  // Walk from #root up to <body>, hiding every sibling subtree along the way.
  // The stage's ancestors stay untouched (the engine's auto-scale reads the
  // VIEWPORT, not its siblings), so the film keeps its scale-1 fit while the
  // transport bar — and any other engine chrome — stops painting. Re-applied on
  // every seek because the film is React and re-commits its tree each frame.
  function hideChrome(){
    try{
      var node=document.getElementById('kf-comp-root');
      if(!node) return;
      node.style.setProperty('position','absolute','important');
      node.style.setProperty('left','0','important');
      node.style.setProperty('top','0','important');
      while(node && node.parentElement && node.parentElement!==document.documentElement){
        var par=node.parentElement, kids=par.children;
        for(var i=0;i<kids.length;i++){
          if(kids[i]!==node) kids[i].style.setProperty('display','none','important');
        }
        node=par;
      }
    }catch(e){}
  }
  function boot(){
    var el=document.querySelector('[data-om-exportable-video-with-duration-secs]');
    if(!el){ return setTimeout(boot, 120); }
    // THE COMPOSITION ROOT MUST BE BUILT HERE, NOT IN THE STATIC HTML.
    // The bundler replaces document.body's contents when it mounts the film, so
    // a <div id="root"> written into the source markup is destroyed before the
    // renderer ever looks for it — HyperFrames then finds no composition and
    // reports "Composition has zero duration" despite a perfectly healthy film.
    // Wrapping the mounted stage AFTER boot survives, and wrapping the stage
    // ONLY (not its container) leaves the engine's playback bar outside the
    // captured element, where it can never reach the video.
    if(!document.getElementById('kf-comp-root')){
      var wrap=document.createElement('div');
      wrap.id='kf-comp-root'; wrap.className='composition';
      wrap.setAttribute('data-composition-id','vid');
      wrap.setAttribute('data-width',W); wrap.setAttribute('data-height',H);
      wrap.setAttribute('data-start','0'); wrap.setAttribute('data-duration',D);
      wrap.style.cssText='position:relative;width:'+W+'px;height:'+H+'px;overflow:hidden;';
      el.parentElement.insertBefore(wrap, el);
      // The compensating transform must NOT sit on the composition root: the
      // renderer measures that element, and scaling it inflated its box to
      // 2002x1126 for a 1920x1080 composition — which is what made the output
      // aspect wrong. Root keeps its exact declared box; an inner layer carries
      // the fit.
      var fitLayer=document.createElement('div');
      fitLayer.id='kf-fit';
      fitLayer.style.cssText='position:absolute;left:0;top:0;width:'+W+'px;height:'+H+'px;transform-origin:0 0;';
      wrap.appendChild(fitLayer);
      fitLayer.appendChild(el);
      // Subtitle node — required by the render contract (check:templates looks
      // for #cap-pill) and by baked-caption jobs. Lives INSIDE #root so it is
      // captured with the film; driven by the seeked cue lookup below.
      // The engine replaces the document body when it mounts, so ANY node authored
      // in the page markup is gone by the time this runs — measured: #cap-pill and
      // #kf-script are both present in the served HTML and both absent from the
      // live DOM. (This is also why __KF_CUES never showed a subtitle.) The markup
      // above stays for check:templates, which lints the file, not the DOM; the
      // live nodes are BUILT here, after the engine has finished with the body.
      var cap=document.getElementById('cap-pill');
      if(!cap){ cap=document.createElement('div'); cap.id='cap-pill'; cap.style.cssText=${JSON.stringify(`position:absolute;left:8%;right:8%;bottom:6%;text-align:center;font-family:system-ui,sans-serif;font-weight:700;font-size:${Math.round(H * 0.028)}px;line-height:1.3;color:#fff;text-shadow:0 2px 12px rgba(0,0,0,.75);opacity:0;z-index:60;`)}; }
      wrap.appendChild(cap);           // INSIDE the captured root
      // Same for the display-type script layer. It sits OUTSIDE #kf-fit so the
      // engine's auto-scale never shrinks the type.
      var kfs=document.getElementById('kf-script');
      if(!kfs && ${overlay ? "true" : "false"}){
        var holder=document.createElement('div');
        holder.innerHTML=${JSON.stringify(overlay ? overlay.html : "")};
        kfs=holder.firstChild;
      }
      if(kfs) wrap.appendChild(kfs);
      // …and its stylesheet, into <head>, for the same reason.
      if(kfs && !document.getElementById('kf-script-css')){
        var st=document.createElement('style');
        st.id='kf-script-css';
        st.textContent=${JSON.stringify(overlay ? overlay.css : "")};
        document.head.appendChild(st);
      }
      // The engine's playback bar is a SIBLING of the stage inside its container.
      // Hiding it by class name is guesswork (verified: the bar node carries
      // className "" and matches none of the data-om-playback/.om-playbar hooks
      // below); hiding every sibling that is not on the path to our wrapper is
      // exact. It has to happen even though the bar sits OUTSIDE #root — the
      // renderer captures the PAGE, not the #root element, so anything left
      // painted above or below the film lands in the video.
      hideChrome();
    }
    // AUTOFIT — these templates draw headlines at a FIXED px (e.g. 190 in a 960px
    // column) with no fit-to-width, so long copy overruns and crops. Shrink any
    // headline-scale run to fit its column. Must run AFTER every seek: the film is
    // React and re-commits the authored font-size on each frame, wiping our value —
    // so we re-measure from the authored size each frame (cheap, a few nodes).
    // Layout metrics (scroll/clientWidth) are pre-transform, so the stage's
    // scale() does not skew the math.
    // FIT THE FRAME by MEASUREMENT, on OUR OWN wrapper.
    // Controlling the engine's scale never held: it recomputes the stage
    // transform on every React commit, the container it measures sits behind
    // sc-host shadow boundaries, and its 44px playback-bar reserve leaves the
    // film short even at native size (measured 0.977083 = (1920-44)/1920).
    // #root is ours and React never writes to it — so rather than dictate the
    // engine's scale, measure what it produced and map that rect onto the frame.
    // Correct for any scale the engine picks, and it also pulls the film flush to
    // 0,0 (the engine centres it, which is where the offsets came from).
    function fitFrame(){
      try{
        var wrapEl=document.getElementById('kf-comp-root');
        var fitEl=document.getElementById('kf-fit');
        if(!wrapEl||!fitEl||!el) return;
        fitEl.style.transform='none';                // measure the true rect first
        var wr=wrapEl.getBoundingClientRect(), sr=el.getBoundingClientRect();
        if(sr.width<2||sr.height<2) return;
        var k=Math.min(W/sr.width,H/sr.height);
        if(!isFinite(k)||k<=0) return;
        var dx=sr.left-wr.left, dy=sr.top-wr.top;
        fitEl.style.transformOrigin='0 0';
        fitEl.style.transform='translate('+(-dx*k).toFixed(2)+'px,'+(-dy*k).toFixed(2)+'px) scale('+k.toFixed(6)+')';
      }catch(e){}
    }
    function autofit(){
      try{
        var canvasW=el.clientWidth||el.getBoundingClientRect().width||0;
        if(!canvasW) return;
        var thr=canvasW*0.075;                 // headline-scale text only (~80px @1080)
        var nodes=el.querySelectorAll('[style]');
        for(var i=0;i<nodes.length;i++){
          var n=nodes[i];
          var fs=parseFloat(getComputedStyle(n).fontSize)||0;
          if(fs<thr) continue;
          var p=n.parentElement;
          if(p && (parseFloat(getComputedStyle(p).fontSize)||0)>=thr) continue; // topmost big-font node only
          if(!(n.textContent||'').replace(/\s+/g,'')) continue;
          // Keep each authored "|" segment on ONE line so an over-long line shrinks
          // rather than wrapping into extra rows; measure the widest segment.
          var kids=n.children,need=0,k;
          if(kids.length){ for(k=0;k<kids.length;k++){ kids[k].style.whiteSpace='nowrap'; need=Math.max(need,kids[k].scrollWidth);} }
          else { n.style.whiteSpace='nowrap'; need=n.scrollWidth; }
          // Kinetic-type films animate PER-LETTER spans, so the widest CHILD is
          // one glyph and the line never registered as overflowing — field-notes'
          // CTA title clipped at both frame edges. The container's own
          // scrollWidth covers that case; for block children (multi-line "|"
          // headlines) it equals the widest row, so this is a strict superset.
          need=Math.max(need,n.scrollWidth);
          var cw=n.clientWidth||0;
          var avail=(cw>0 && cw<canvasW)?cw:canvasW*0.92;   // bounded column, else canvas w/ margin
          if(need>avail && avail>0){
            var target=Math.max(canvasW*0.03, fs*(avail/need)*0.97);
            n.style.setProperty('font-size',target.toFixed(1)+'px','important');
            var need2=0;                                     // one correction pass for non-linear residue
            if(kids.length){ for(k=0;k<kids.length;k++){ need2=Math.max(need2,kids[k].scrollWidth);} } else { need2=n.scrollWidth; }
            if(need2>avail){ n.style.setProperty('font-size',Math.max(canvasW*0.03,target*(avail/need2)*0.97).toFixed(1)+'px','important'); }
          }
        }
      }catch(e){}
    }
    // PORTRAIT UNDERSIZE. autofit() only ever SHRINKS — it exists to stop a long
    // headline running off the edge. The opposite defect is just as common on a
    // phone frame: a template's title lockup, authored to sit inside a wider
    // composition, renders as small type marooned in a tall frame. Measured on a
    // finished film: the opening card set "Trello" at ~60px in a 1920-tall frame
    // with 55% of the picture empty sky, and QA called it a blocker
    // ("LANDSCAPE-SHRUNK LAYOUT: content clustered in a small horizontal band").
    //
    // So grow the beat's leading text toward headline scale. Runs AFTER autofit,
    // so shrink still wins on genuinely long copy, and every growth is bounded by
    // the room actually available.
    var PORTRAIT=${nativePortrait ? "true" : "false"};
    function portraitBoost(){
      if(!PORTRAIT) return;
      try{
        var canvasW=el.clientWidth||el.getBoundingClientRect().width||0;
        var canvasH=el.clientHeight||el.getBoundingClientRect().height||0;
        if(!canvasW||!canvasH) return;
        var want=canvasW*0.085;               // ~92px @1080 — reads as a headline
        var lead=null, leadFs=0;
        var nodes=el.querySelectorAll('*');
        for(var i=0;i<nodes.length;i++){
          var n=nodes[i];
          var txt=(n.textContent||'').replace(/\\s+/g,'');
          if(!txt) continue;
          // Only leaf-ish text: a wrapper reports its child's text as its own.
          var hasTextChild=false;
          for(var c=0;c<n.childNodes.length;c++) if(n.childNodes[c].nodeType===3 && n.childNodes[c].textContent.trim()) hasTextChild=true;
          if(!hasTextChild) continue;
          var cs=getComputedStyle(n);
          if(cs.visibility==='hidden'||parseFloat(cs.opacity)<0.05) continue;
          // Absolutely-placed text has no flow to push siblings out of the way,
          // so growing it is how you get a collision. Leave it alone.
          if(cs.position==='absolute'||cs.position==='fixed') continue;
          var fs=parseFloat(cs.fontSize)||0;
          if(fs>leadFs){ leadFs=fs; lead=n; }
        }
        if(!lead||!leadFs||leadFs>=want) return;
        var r=lead.getBoundingClientRect();
        if(r.width<8||r.height<8) return;
        // Bound the growth by the width its own line can take...
        lead.style.whiteSpace='nowrap';
        var need=lead.scrollWidth||r.width;
        var avail=canvasW*0.92;
        var kW=need>0?(avail/need):1;
        // ...and never more than doubles, so a deliberately small kicker stays a
        // kicker rather than becoming a second headline.
        var k=Math.min(want/leadFs, kW, 2);
        if(k<=1.05) return;
        lead.style.setProperty('font-size',(leadFs*k).toFixed(1)+'px','important');
        lead.style.setProperty('line-height','1.05','important');
      }catch(e){}
    }
    // WHERE THE SPOKEN LINE GOES. It belongs high on the frame, as display type —
    // but every template puts its OWN headline somewhere different, so any fixed
    // offset collides on some pack: measured at top:20%, showcase cleared its
    // headline while Stomp landed straight on top of the word "Trello".
    //
    // So choose per frame. Measure what is already drawn, then drop the line into
    // the emptiest band, preferring the top of the frame — which is what the
    // brief asked for, and which also fills the dead middle these portrait
    // templates leave.
    function placeScript(){
      try{
        var kfs=document.getElementById('kf-script');
        if(!kfs) return;
        var vis=null, phs=kfs.querySelectorAll('.kf-ph');
        for(var i=0;i<phs.length;i++) if(phs[i].style.display==='block'){ vis=phs[i]; break; }
        if(!vis){ return; }
        var W=el.clientWidth||1080, H=el.clientHeight||1920;
        // Reset before measuring so a previous placement never biases this one.
        kfs.style.top='0px'; kfs.style.bottom='auto';
        var mine=vis.getBoundingClientRect();
        var need=Math.max(40, mine.height);
        var root=el.getBoundingClientRect();
        // Everything already on the frame that must not be covered — and every
        // word the frame is already saying, for the dedup below.
        var boxes=[], drawn='';
        (function walk(node){
          var kids=node.querySelectorAll('*');
          for(var j=0;j<kids.length;j++){
            var n=kids[j];
            if(n.shadowRoot) walk(n.shadowRoot);
            if(kfs.contains(n)) continue;
            var tag=n.tagName;
            var isImg=(tag==='IMG'||tag==='SVG'||tag==='VIDEO'||tag==='CANVAS');
            var hasText=false;
            for(var c=0;c<n.childNodes.length;c++) if(n.childNodes[c].nodeType===3&&n.childNodes[c].textContent.trim()) hasText=true;
            if(!isImg&&!hasText) continue;
            var cs=getComputedStyle(n);
            if(cs.visibility==='hidden'||parseFloat(cs.opacity)<0.12) continue;
            var r=n.getBoundingClientRect();
            if(r.width<40||r.height<18) continue;
            if(r.bottom<root.top||r.top>root.bottom) continue;
            // Covering another TEXT block is far worse than sitting over a
            // picture: outlined display type over imagery is the look we want,
            // two headlines on top of each other is never readable.
            boxes.push([r.top-root.top, r.bottom-root.top, hasText?6:1]);
            if(hasText) drawn+=' '+n.textContent.toLowerCase().replace(/[^a-z0-9' ]+/g,' ');
          }
        })(document);
        // DON'T PRINT WHAT THE FILM IS ALREADY SAYING. The defect that got this
        // layer switched off was duplication, not presence: the pack's headline
        // and this phrase carrying the SAME words, one stamped across the
        // screenshot (job 5i94yvz5fv — "INDIA'S ULTIMATE ONE-STOP DESTINATION"
        // twice, QA ELEMENT COLLISION @7.6s). Measured on the fixtures, only
        // 2-4 of 22 phrases per film are full duplicates and they are always the
        // hook and the CTA — exactly the frames QA flagged; incidental overlap
        // sits at 23-35%, so 0.6 separates the two cleanly. Stay off this frame
        // when the film already says it; the other ~18 phrases still render,
        // which is where the coverage comes from. Per-frame and stateless:
        // __kfScript(t) re-sets every phrase's display on each seek, so hiding
        // never leaks across frames and seek-safety holds.
        drawn=(' '+drawn+' ').replace(/\s+/g,' ');
        var mw=(vis.textContent||'').toLowerCase().replace(/[^a-z0-9' ]+/g,' ')
          .split(/\s+/).filter(function(w){return w.length>2;});
        if(mw.length){
          var dup=0;
          for(var q=0;q<mw.length;q++) if(drawn.indexOf(' '+mw[q]+' ')>=0) dup++;
          if(dup/mw.length>=0.6){ vis.style.display='none'; return; }
        }
        // Score candidate bands by how much occupied area they would cover.
        var best=null;
        for(var p=0.10;p<=0.72;p+=0.02){
          var top=p*H, bot=top+need;
          var hit=0;
          for(var b=0;b<boxes.length;b++){
            var o=Math.min(bot,boxes[b][1])-Math.max(top,boxes[b][0]);
            if(o>0) hit+=o*(boxes[b][2]||1);
          }
          // Ties go to the higher band: the brief is "up where the headline is".
          if(!best||hit<best.hit-0.5) best={p:p,hit:hit};
        }
        if(best) kfs.style.top=Math.round(best.p*H)+'px';
      }catch(e){}
    }
    // SCREENSHOT ANCHOR. The stylesheet rule above cannot reach these images —
    // the film's tree contains shadow roots, and a document stylesheet does not
    // cross a shadow boundary (the same reason noted at the top of this file).
    // So the anchor is applied as an inline style, walking shadow roots, and
    // re-applied after every seek because the film re-renders on each frame.
    var SHOT_FILES=${JSON.stringify(shotFiles)};
    // The brand marks, which take the OPPOSITE fit: contain, centred, inset. Same
    // walker for the same reason — the stylesheet rule above stops at a shadow
    // boundary, and a cover-cropped logo is the one failure a mark cannot survive.
    var MARK_FILES=${JSON.stringify(brandFiles)};
    function kfFitShots(root){
      try{
        var imgs=(root||document).querySelectorAll('img');
        for(var i=0;i<imgs.length;i++){
          var src=imgs[i].getAttribute('src')||'';
          var done=false;
          for(var b=0;b<MARK_FILES.length;b++){
            if(src.indexOf(MARK_FILES[b])>=0){
              imgs[i].style.setProperty('object-fit','contain','important');
              imgs[i].style.setProperty('object-position','center','important');
              imgs[i].style.setProperty('padding','6%','important');
              imgs[i].style.setProperty('box-sizing','border-box','important');
              done=true;
              break;
            }
          }
          if(done) continue;
          for(var k=0;k<SHOT_FILES.length;k++){
            if(src.indexOf(SHOT_FILES[k])>=0){
              // cover, not the CSS default fill — fill squashes the capture.
              imgs[i].style.setProperty('object-fit','cover','important');
              imgs[i].style.setProperty('object-position','left top','important');
              break;
            }
          }
        }
        var all=(root||document).querySelectorAll('*');
        for(var j=0;j<all.length;j++) if(all[j].shadowRoot) kfFitShots(all[j].shadowRoot);
      }catch(e){}
    }
    // The engine's own duration governs the film; ours governs the render.
    var cur=0;
    function seek(t){
      cur=Math.max(0,Math.min(D,Number(t)||0));
      el.dispatchEvent(new CustomEvent('data-om-seek-to-time-frame',{detail:{time:cur,sync:true}}));
      if(SHOT_FILES.length||MARK_FILES.length) kfFitShots();
    }
    var tl={
      duration:function(){return D;},
      time:function(t){ if(t===undefined) return cur; seek(t); return tl; },
      seek:function(t){ seek(t); return tl; },
      progress:function(p){ if(p===undefined) return D?cur/D:0; seek((Number(p)||0)*D); return tl; },
      pause:function(){return tl;}, play:function(){return tl;}, kill:function(){}, totalDuration:function(){return D;}
    };
    window.__timelines=window.__timelines||{};
    window.__timelines["vid"]=tl;
    ${overlay ? overlay.js : ""}
    // Caption cues, seeked exactly like the film.
    var CUES=window.__KF_CUES||[];
    var capEl=document.getElementById('cap-pill');
    var _seek=seek;
    // SELF-HEAL broken media. A referenced file can vanish between compose and
    // render (a curation pass deleted 0.jpg after the scene list was written and
    // the wall drew a broken-image glyph). Any img that finished loading with
    // naturalWidth 0 is swapped for a sibling that DID load — a repeat of a real
    // screenshot always beats a broken-image icon. Re-run per seek: the film is
    // React and remounts scene layers as it plays.
    // THE BRANDED PLATE, built ONCE out here — the page HTML has no size cap,
    // while OM_SCENES does (hard 16KB engine limit: 2KB of data-URI per slot
    // truncated a 12-beat field-notes cast to 6 beats). Scene data carries the
    // 12-byte "__kfplate__" sentinel; every seek swaps the real image in.
    var KF_PLATE=${JSON.stringify(fillPlate(brand, accent, null))};
    // The CTA monogram, out here for the same reason as the plate above.
    var KF_MONO=${JSON.stringify(monogram(brand, accent))};
    function kfSwapPlates(root){
      try{
        var imgs=(root||document).querySelectorAll('img');
        for(var i=0;i<imgs.length;i++){
          var s=imgs[i].getAttribute('src')||'';
          if(s.indexOf('__kfplate__')>=0) imgs[i].setAttribute('src',KF_PLATE);
          else if(s.indexOf('__kfmono__')>=0) imgs[i].setAttribute('src',KF_MONO);
        }
        var all=(root||document).querySelectorAll('*');
        for(var j=0;j<all.length;j++) if(all[j].shadowRoot) kfSwapPlates(all[j].shadowRoot);
      }catch(e){}
    }
    function healImgs(){
      try{
        kfSwapPlates(document);
        var root=document.getElementById('kf-comp-root'); if(!root) return;
        var imgs=root.querySelectorAll('img'), good=null, i;
        for(i=0;i<imgs.length;i++){ if(imgs[i].complete && imgs[i].naturalWidth>0){ good=imgs[i].getAttribute('src'); break; } }
        if(window.__kfGoodSrc===undefined) window.__kfGoodSrc=null;
        if(good) window.__kfGoodSrc=good;
        var fallback=good||window.__kfGoodSrc; if(!fallback) return;
        for(i=0;i<imgs.length;i++){
          var im=imgs[i];
          if(im.complete && im.naturalWidth===0 && im.getAttribute('src')!==fallback) im.setAttribute('src',fallback);
        }
      }catch(e){}
    }
    // PORTRAIT WALLS RESTACK TO TWO BIG CARDS. The compiled templates lay their
    // media walls as fixed 2-column grids (2x2 on the kit Montage); the adapter
    // now supplies at most two images at 9:16, which would leave one small row —
    // or, on templates whose markup draws four boxes regardless, two hatched
    // placeholders. This pass finds every container whose children carry wall
    // media and forces a single column: two full-width, screenshot-shaped cards.
    // Runtime and per-seek (the film is React and recommits each frame), same as
    // autofit/kfFitShots; detection is anchored on OUR OWN shot files and plates,
    // so a text grid can never be caught.
    ${W >= H ? "function kfBigCards(){}" : `
    function kfBigCards(){
      try{
        var isWallImg=function(img){
          var src=img.getAttribute('src')||'';
          if(src.indexOf('data:image/svg')===0) return true;      // branded plate
          for(var k=0;k<SHOT_FILES.length;k++) if(src.indexOf(SHOT_FILES[k])>=0) return true;
          return false;
        };
        var carriesMedia=function(el){
          var imgs=el.querySelectorAll('img');
          for(var i=0;i<imgs.length;i++) if(isWallImg(imgs[i])) return 1;
          if(/drop image to replace/i.test(el.textContent||'')) return 2;  // placeholder box
          return 0;
        };
        var seen=[];
        (function walk(root){
          var all=root.querySelectorAll('*');
          for(var j=0;j<all.length;j++){
            var el=all[j];
            if(el.shadowRoot) walk(el.shadowRoot);
            if(el.children.length<2||el.children.length>8) continue;
            var media=0, kinds=[];
            for(var c=0;c<el.children.length;c++){ var m=carriesMedia(el.children[c]); kinds.push(m); if(m) media++; }
            if(media<2) continue;
            var cs=getComputedStyle(el);
            if(cs.display!=='grid'&&cs.display!=='flex') continue;
            seen.push({el:el,kinds:kinds});
          }
        })(document);
        for(var s2=0;s2<seen.length;s2++){
          var w=seen[s2];
          // Keep two cards — real images before placeholder boxes — hide the rest.
          var quota=2;
          for(var pass2=1;pass2<=2;pass2++){
            for(var c4=0;c4<w.el.children.length;c4++){
              if(w.kinds[c4]!==pass2) continue;
              if(quota>0){ quota--; w.el.children[c4].style.removeProperty('display'); w.el.children[c4].style.setProperty('width','100%','important'); }
              else { w.el.children[c4].style.setProperty('display','none','important'); }
            }
          }
          // One column: two cards stack into big horizontal frames.
          if(getComputedStyle(w.el).display==='grid'){
            w.el.style.setProperty('grid-template-columns','1fr','important');
          } else {
            w.el.style.setProperty('flex-direction','column','important');
          }
        }
      }catch(e){}
    }`}
    seek=function(t){
      _seek(t);
      fitFrame();
      autofit();
      portraitBoost();
      hideChrome();
      healImgs();
      kfBigCards();
      if(window.__kfScript) window.__kfScript(t);
      placeScript();
      if(!capEl) return;
      var cur=null;
      for(var i=0;i<CUES.length;i++){ if(cur===null && t>=CUES[i].t && t<CUES[i].e) cur=CUES[i]; }
      if(cur){ if(capEl.textContent!==cur.x) capEl.textContent=cur.x; capEl.style.opacity='1'; }
      else { capEl.style.opacity='0'; }
    };
    seek(0);
    fitFrame();
    hideChrome();
    document.documentElement.setAttribute('data-om-ready','1');
  }
  boot();
})();
</script>`;

  // The LIVE root contract is stamped by the harness AFTER the film mounts (see
  // boot()) — a static wrapper does not survive the bundler replacing
  // document.body, so it cannot be the thing that gets captured.
  //
  // But the RENDER DIMENSIONS are resolved from the markup HyperFrames parses,
  // NOT from the live DOM. Measured on drive-highway (a 1920x1080 pack): with
  // the runtime contract deliberately stamped 800x600 and meta.json saying
  // 1920x1080, it still rendered 1080x1920 — the template's native portrait
  // canvas — so BOTH were being ignored. Every omelette pack therefore rendered
  // 9:16 regardless of its declared size, which is why the 11 landscape packs
  // came out as a small letterboxed film floating in a portrait frame (and read
  // as a mostly-black card in the Templates gallery). Scene-kit packs declare
  // #root statically and have always rendered at their declared size — that
  // difference is the whole bug.
  //
  // So: declare the contract STATICALLY too, purely so the parse-time dimension
  // lookup finds the right numbers. The bundler wipes it moments later and
  // boot() builds the real captured root, so this node never has to render.
  // Verified: drive-highway 1080x1920 -> 1920x1080, film filling the frame.
  const staticContract =
    `<div class="composition" data-composition-id="vid" data-width="${W}" data-height="${H}" ` +
    `data-start="0" data-duration="${D}" ` +
    `style="position:absolute;left:0;top:0;width:${W}px;height:${H}px;overflow:hidden;"></div>`;
  // ANCHOR ON THE DOCUMENT'S OWN <body>, NOT THE FIRST ONE IN THE FILE.
  //
  // The template block holds a whole HTML page as a JSON string, `<body>` and
  // all. In the 142 shipped bundles that block sits inside the body, so a plain
  // first-match replace lands correctly by luck of layout. It is not luck worth
  // relying on: a bundle carrying the block in <head> had this contract div
  // spliced INTO the JSON string instead, raw quotes and all, which broke the
  // JSON at the injected `<div class="composition"`, left the film unmounted,
  // and reported nothing — lint, contrast, identity and the render all passed on
  // a black video.
  //
  // The rule is not "before the block" or "after it" — either can be right: the
  // shipped bundles carry the block INSIDE their body, a generated one may carry
  // it in <head>. The real body is simply the first <body> that is not inside it.
  const blockSpan = (() => {
    const m = /<script type="__bundler\/template"[^>]*>[\s\S]*?<\/script>/i.exec(html);
    return m ? [m.index, m.index + m[0].length] : [-1, -1];
  })();
  // FIRST match outside the block only — the bundles carry further literal
  // "<body>" runs inside their encoded resource blobs, and stamping those would
  // corrupt the very payload the film is built from.
  let stamped = false;
  html = html.replace(/<body([^>]*)>/gi, (full, attrs, at) => {
    if (stamped || (at >= blockSpan[0] && at < blockSpan[1])) return full;
    stamped = true;
    return `<body${attrs}>${staticContract}`;
  });
  html = html.replace(/<\/body>/i, `${harness}</body>`);

  const metaJson = JSON.stringify({ compositionId: "vid", width: W, height: H, fps: (dims && dims.fps) || 30, duration: D });
  // Media coverage: one demand per scene that carries a shot, filled when the
  // path is real. Keeps the same stamp shape the other composers report.
  const plan = omScenes.map((s, i) => {
    const wall = Object.keys(s).filter((k) => /^shot([1-6]|A|B)$/.test(k)).length;
    const n = (s.shot ? 1 : 0) + wall;
    return {
      sceneIndex: i, sceneId: (scenes[i] && scenes[i].id) || `s${i + 1}`, sceneType: s.name,
      need: n ? Array(n).fill("desktop") : [], filled: n,
    };
  });
  const totals = plan.reduce((t, p) => ({ demand: t.demand + p.need.length, filled: t.filled + p.filled, empty: 0, scenes: plan.length }), { demand: 0, filled: 0, empty: 0, scenes: plan.length });
  totals.empty = totals.demand - totals.filled;

  return { indexHtml: html, metaJson, mediaPlan: { plan, totals } };
}

function planMedia(opts) { return buildComposition(opts).mediaPlan; }
function listTemplates() {
  try { return fs.readdirSync(TPL_DIR).filter((f) => f.endsWith(".html")).map((f) => f.replace(/\.html$/, "")); }
  catch { return []; }
}

module.exports = { buildComposition, planMedia, listTemplates, readTemplateScenes, templatePath, TPL_DIR };
