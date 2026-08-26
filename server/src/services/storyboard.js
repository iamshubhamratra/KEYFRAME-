// Pass 1: prompt + duration + orientation -> storyboard JSON.
// Validates structure and timing; retries LLM on validation failure.

const fs = require("node:fs");
const path = require("node:path");
const config = require("../config");
const openrouter = require("./openrouter");

const SYSTEM = fs.readFileSync(
  path.join(__dirname, "..", "prompts", "system_storyboard.md"),
  "utf8"
);

// Official HyperFrames pacing + beat-direction guides (local skills install)
// appended once; cached for the process lifetime.
const { getStoryboardSkills } = require("./skills");
let systemWithSkills = null;
async function getSystem() {
  if (systemWithSkills) return systemWithSkills;
  const skills = await getStoryboardSkills().catch(() => "");
  systemWithSkills = skills
    ? `${SYSTEM}\n\n---\n\n# Reference: HyperFrames pacing & beat direction\n\nOfficial guides — apply them when pacing scenes and writing beats[].\n\n${skills}`
    : SYSTEM;
  return systemWithSkills;
}

const ASPECT_BY_ORIENTATION = {
  horizontal: "16:9",
  vertical: "9:16",
  square: "1:1",
};

function buildUser({ prompt, duration, orientation, framePack }) {
  return [
    `User prompt: ${prompt}`,
    `Target duration: ${duration} seconds`,
    `Orientation: ${orientation}`,
    `Aspect ratio: ${ASPECT_BY_ORIENTATION[orientation]}`,
    framePack && framePack !== "auto"
      ? `Visual design system: "${framePack}". Design every scene's layout, visualMotif, and emphasis to suit THIS system's aesthetic — pick scene archetypes and motifs that show off its signature look. Keep adjacent scenes visually distinct (vary layout + animation + motif).`
      : "",
    "",
    "Produce the storyboard JSON now.",
  ].filter(Boolean).join("\n");
}

const { extractFirstJsonObject: parseJsonLenient } = require("./json_lenient");

const round2 = (n) => Math.round(n * 100) / 100;
const clampDur = (n) => Math.min(15, Math.max(2, n));

// TOO FEW SCENES TO COVER THE FILM: SPLIT THEM, DON'T STRETCH THEM.
//
// Scene durations are clamped to [2,15], so a storyboard of N scenes can cover at
// most N*15 seconds. The single-shot path (/api/generate -> runJob) has no script
// to set the count — it asks the director straight from the prompt, and the
// system prompt above used to cap that at 20 scenes. The arithmetic then decided
// what shipped:
//   300s / 20 scenes  -> every scene clamped to 15s. Legal, so it shipped: a
//                        five-minute film that cuts twenty times.
//   600s / 20 scenes  -> cannot reach the target at all. normalizeTimeline landed
//                        on 300s, validate() reported "durations sum to 300,
//                        expected 600", and after the retries generateStoryboard
//                        THREW. A ten-minute single-shot job could not be made.
//
// Scaling the count with the runtime (rule 1/4 of the prompt) is the real fix;
// this is the deterministic floor under it, so whatever the director returns, the
// film covers its runtime at a watchable pace. A split is not free — it divides
// one beat's narration between two frames — so it is loud in the log and it
// always hands the second half something new to say: the support line is promoted
// to the headline and the headline steps back, the same move the omelette adapter
// makes when it cuts inside a beat.
const SENTENCE = /[^.!?]+[.!?]*/g;
const sentencesOf = (vo) => (String(vo || "").match(SENTENCE) || []).map((s) => s.trim()).filter(Boolean);

function splitNarration(vo) {
  const list = sentencesOf(vo);
  if (list.length < 2) return [String(vo || "").trim(), ""];
  const mid = Math.ceil(list.length / 2);
  return [list.slice(0, mid).join(" "), list.slice(mid).join(" ")];
}

const key = (v) => String(v || "").toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();

// The line the second half would LEAD with, if it has one of its own. Never the
// scene's own headline: promoting that back into the headline slot is how a cut
// ends up showing the same words twice in a row, which reads as the picture
// having stopped rather than as a cut.
function secondLine(sc) {
  const own = Array.isArray(sc.onScreenText) ? sc.onScreenText.filter(Boolean) : [];
  const bullets = Array.isArray(sc.bullets) ? sc.bullets.filter(Boolean) : [];
  const head = key(sc.headline);
  return [String(sc.subtext || "").trim(), own[1], bullets[0]]
    .map((x) => String(x || "").trim())
    .find((x) => x && key(x) !== head) || "";
}

// Has this scene got a second half to give? It needs BOTH halves of a cut to
// stand on their own: narration that divides into two spoken halves, and a line
// of its own for the second frame to lead with. Requiring only one of the two
// produced exactly the failures a cut is supposed to avoid — a silent 8s frame
// where the narration ran out, or the same headline twice where the copy did.
// A scene with neither can still be cut to make the film REACH its runtime
// (that is arithmetic, not taste), but never for pace alone.
function divisible(s) {
  return sentencesOf(s.voiceover).length >= 2 && !!secondLine(s);
}

// Which scene to cut next: the one that can give its second half something of its
// own to say, and has the most narration to divide. Bookends go last — splitting
// the closer produces two CTAs and splitting the opener produces two hooks.
function nextToSplit(scenes, { onlyDivisible = false } = {}) {
  let best = -1, bestScore = -Infinity;
  scenes.forEach((s, i) => {
    if (onlyDivisible && !divisible(s)) return;
    const bookend = i === 0 || i === scenes.length - 1 || /^(cta|title|hook)$/i.test(String(s.kind || ""));
    const facets = (String(s.subtext || "").trim() ? 1 : 0)
      + (Array.isArray(s.bullets) && s.bullets.filter(Boolean).length >= 2 ? 1 : 0);
    const score = (bookend ? -100 : 0) + facets * 10 + sentencesOf(s.voiceover).length + (Number(s.duration) || 0) / 100;
    if (score > bestScore) { bestScore = score; best = i; }
  });
  return best;
}

function splitScene(sc, seq) {
  const [voA, voB] = splitNarration(sc.voiceover);
  const bullets = Array.isArray(sc.bullets) ? sc.bullets.filter(Boolean) : [];
  // The second half leads with a DIFFERENT line wherever the scene has one, so the
  // cut hands the viewer new information instead of the same words twice.
  const nextLine = secondLine(sc);
  const d = Math.max(4, Number(sc.duration) || 4);
  const a = { ...sc, duration: round2(d / 2), voiceover: voA };
  const b = {
    ...sc,
    id: `${sc.id || "s"}-${seq}`,
    duration: round2(d / 2),
    // A half with no sentence left to speak reads its OWN promoted line. Leaving
    // it blank is not silence: sceneVOText falls back to `headline + subtext`,
    // and this half's subtext is the line the first half already said — so the
    // narrator would repeat himself over a new frame. Speaking the promoted line
    // says exactly what is on screen, and nothing twice.
    voiceover: voB || nextLine || "",
    kind: /^(hook|title)$/i.test(String(sc.kind || "")) ? "point" : sc.kind,
    headline: nextLine || sc.headline,
    subtext: nextLine ? String(sc.headline || "") : sc.subtext,
    bullets: bullets.length > 1 ? bullets.slice(1) : bullets,
    // Beats are timed against the ORIGINAL window, so half of them now fall
    // outside this half's — validate() drops those silently, leaving a scene
    // whose exit cue never fires. Re-anchor them instead.
    beats: Array.isArray(sc.beats)
      ? sc.beats.filter((x) => x && typeof x.at === "number")
        .map((x) => ({ ...x, at: round2(Math.min(x.at, Math.max(0, d / 2 - 0.6))) }))
      : sc.beats,
  };
  return [a, b];
}

/**
 * Grow the scene list until it can cover `duration` at the [2,15] clamp.
 * Mutates sb.scenes; returns how many scenes were added (0 when it already fits).
 */
function expandToCover(sb, duration, { max = 70, cap = 15, pace = 8.5, label = "storyboard" } = {}) {
  const scenes = (sb && Array.isArray(sb.scenes)) ? sb.scenes : null;
  if (!scenes || !scenes.length || !(duration > 0)) return 0;
  // Two bars, and they are not the same kind of claim.
  //
  // `need` is arithmetic: below it the durations physically cannot reach the
  // target, and the film either holds every frame at the 15s ceiling or fails
  // validation outright. Anything may be cut to reach it.
  //
  // `want` is editorial: the pace the scripted path produces for a film this long
  // (a 300s /projects film is ~50 scenes, a 600s one ~70). Reaching it is
  // best-effort — only scenes that have a second half to GIVE are cut, because
  // splitting a scene with one sentence and no support line just shows the same
  // words twice and reads worse than the hold it replaced.
  const need = Math.min(max, Math.ceil(duration / cap) + 1);
  const before = scenes.length;
  let seq = 2;
  const cut = (i) => {
    if (i < 0) return false;
    const [a, b] = splitScene(scenes[i], seq++);
    scenes.splice(i, 1, a, b);
    return true;
  };
  while (scenes.length < need) { if (!cut(nextToSplit(scenes))) break; }

  // Phase 2 works on PROJECTED length, not on the count. Counting alone leaves
  // the scenes it declined to cut — the opener and the closer — at twice the
  // length of everything around them, and the rescale that follows turns that
  // into exactly the 15s hold this is here to remove (measured: a 300s film
  // reached 36 scenes averaging 8.3s with its hook and its last three beats
  // still pinned at the ceiling). Cut whichever scene would end up longest,
  // until nothing that can be divided would run past the pace.
  while (scenes.length < max) {
    const sum = scenes.reduce((a, s) => a + Math.max(0, Number(s.duration) || 0), 0) || 1;
    const scale = duration / sum;
    let pick = -1, worst = pace;
    scenes.forEach((s, i) => {
      if (!divisible(s)) return;
      // A hair's preference for the interior, so an opener is cut only when it
      // really is the longest thing on screen.
      const bookend = i === 0 || i === scenes.length - 1;
      const projected = (Number(s.duration) || 0) * scale - (bookend ? 0.01 : 0);
      if (projected > worst) { worst = projected; pick = i; }
    });
    if (pick < 0) break;
    if (!cut(pick)) break;
  }

  // DE-ECHO. Each cut on its own hands the second half a line the first half did
  // not use, but cuts compound: splitting a scene into (headline, support) and
  // then splitting BOTH halves again interleaves them as
  // headline / support / support / headline — and the two support frames are
  // adjacent, so the film says the same words twice in a row while the narration
  // moves on. Walk the finished list and swap any repeat back with its own
  // support line. A scene with nothing else to say keeps the repeat; that only
  // happens where the director wrote one line and no second facet, and the
  // warning below says so.
  for (let i = 1; i < scenes.length; i++) {
    const prev = key(scenes[i - 1].headline);
    if (!prev || key(scenes[i].headline) !== prev) continue;
    const alt = String(scenes[i].subtext || "").trim();
    if (alt && key(alt) !== prev) {
      const head = String(scenes[i].headline || "");
      scenes[i].headline = alt;
      scenes[i].subtext = head;
    }
  }
  const added = scenes.length - before;
  if (added) {
    console.warn(
      `[${label}] the director returned ${before} scene(s) for a ${duration}s film — held at ${cap}s each that covers ` +
      `only ${before * cap}s. Split into ${scenes.length} (${(duration / scenes.length).toFixed(1)}s a scene) so the film ` +
      `covers its runtime at a watchable pace; each split divides one beat's narration between two frames.`
    );
  }
  return added;
}

// Deterministically repair scene timing so the LLM is never retried for
// arithmetic it routinely gets slightly wrong: starts that don't equal the
// cumulative sum of prior durations, and durations that don't total the target.
// We clamp each duration to [2,15], rescale them to hit `duration` exactly,
// absorb residual rounding drift into a scene that can take it, then recompute
// gapless starts. A storyboard that was already correct passes through
// unchanged. Only timing is touched — content/kind/animation are left for
// validate() to flag and (if wrong) drive a real retry.
function normalizeTimeline(sb, duration) {
  if (!sb || !Array.isArray(sb.scenes) || !sb.scenes.length) return;
  // Before any timing arithmetic: make sure there ARE enough scenes to hold the
  // film. Rescaling a list that is too short can only pin every scene to the 15s
  // ceiling, and past 15s x N it cannot reach the target at all.
  expandToCover(sb, duration);
  const scenes = sb.scenes.filter(
    (s) => s && typeof s.duration === "number" && Number.isFinite(s.duration)
  );
  if (!scenes.length) return;

  for (const s of scenes) s.duration = clampDur(s.duration);

  let sum = scenes.reduce((a, s) => a + s.duration, 0);
  if (sum > 0 && Math.abs(sum - duration) > 0.01) {
    const scale = duration / sum;
    for (const s of scenes) s.duration = clampDur(s.duration * scale);
  }

  for (const s of scenes) s.duration = round2(s.duration);
  // Distribute any leftover drift (from clamping/rounding) across scenes that
  // have slack, so the total lands on `duration` without violating [2,15].
  let drift = round2(duration - scenes.reduce((a, s) => a + s.duration, 0));
  for (let guard = 0; Math.abs(drift) >= 0.01 && guard < scenes.length * 2; guard++) {
    const s = scenes.find((sc) =>
      drift > 0 ? sc.duration + drift <= 15 || sc.duration < 15
                : sc.duration + drift >= 2  || sc.duration > 2
    );
    if (!s) break;
    const next = clampDur(round2(s.duration + drift));
    drift = round2(drift - (next - s.duration));
    s.duration = next;
  }

  let cursor = 0;
  for (const s of scenes) {
    s.start = round2(cursor);
    cursor = round2(cursor + s.duration);
  }
  // durationSec is authoritative-from-request; align it so it never mis-trips
  // validate() once the scenes sum correctly.
  sb.durationSec = duration;
}

function validate(storyboard, { duration, orientation }) {
  const errs = [];
  const sb = storyboard;
  if (!sb || typeof sb !== "object") return ["storyboard is not an object"];

  if (typeof sb.title !== "string" || !sb.title.trim()) errs.push("missing title");
  if (sb.durationSec !== duration) errs.push(`durationSec ${sb.durationSec} != requested ${duration}`);
  if (sb.orientation !== orientation) errs.push(`orientation mismatch: ${sb.orientation} != ${orientation}`);
  if (!Array.isArray(sb.scenes) || sb.scenes.length < 2) errs.push("scenes must be an array of >=2");
  if (!sb.palette?.background || !sb.palette?.text) errs.push("palette missing background/text");

  if (Array.isArray(sb.scenes)) {
    let cursor = 0;
    sb.scenes.forEach((s, i) => {
      if (typeof s.start !== "number" || typeof s.duration !== "number") {
        errs.push(`scene[${i}] start/duration must be numbers`);
        return;
      }
      // Tolerant compare: cursor accumulates via += and drifts in floating
      // point (e.g. 6.8 -> 6.800000000000001), so a strict !== rejects valid
      // storyboards. Sub-frame tolerance is plenty.
      if (Math.abs(s.start - cursor) > 0.05) errs.push(`scene[${i}] start ${s.start} should be ${Math.round(cursor * 100) / 100}`);
      if (s.duration < 2 || s.duration > 15) errs.push(`scene[${i}] duration ${s.duration} out of [2,15]`);
      if (!s.kind) errs.push(`scene[${i}] missing kind`);
      if (!s.animation) errs.push(`scene[${i}] missing animation`);
      // Voiceover is optional (falls back to headline+subtext downstream) — never
      // block on it, just normalize to a trimmed string so the audio stage is safe.
      s.voiceover = typeof s.voiceover === "string" ? s.voiceover.trim().slice(0, 400) : "";
      // Beats are optional but, when present, sanitized rather than rejected:
      // keep only well-formed beats inside the scene's own time window.
      if (Array.isArray(s.beats)) {
        s.beats = s.beats
          .filter((b) => b && typeof b.at === "number" && b.at >= 0 && b.at < s.duration && typeof b.action === "string")
          .slice(0, 5)
          .map((b) => ({
            at: Math.round(b.at * 100) / 100,
            action: b.action.slice(0, 160),
            easing: typeof b.easing === "string" ? b.easing.slice(0, 40) : "power2.out",
          }));
      }
      cursor = Math.round((cursor + s.duration) * 1000) / 1000;
    });
    if (Math.abs(cursor - duration) > 0.01) {
      errs.push(`scene durations sum to ${cursor}, expected ${duration}`);
    }
    if (!["title", "hook"].includes(sb.scenes[0]?.kind)) errs.push("first scene kind must be 'title' or 'hook'");
  }
  return errs;
}

// ---- deterministic copy floor ------------------------------------------------
// MEASURED on shipped job agmoif2udy: every scene came back headline-only —
// `subtext: ""` on all of them and no `bullets` at all — so packs that lay out a
// kicker chip, a support line and a 2-4 item pill/stat row per scene printed 2-4
// words over 50-70% empty frame. The prompt now demands the whole copy set, but
// frame density must not depend on model compliance, so whatever is STILL missing
// is derived here from the scene's own `voiceover` — the one text field a scene
// never ships without, since the audio stage depends on it.
// ADD-ONLY: copy the model wrote always wins. Fail-open: a missing pill label must
// never cost a paid render, so every scene is repaired inside its own try.

const norm = (v) => String(v == null ? "" : v).replace(/\s+/g, " ").trim();
const keyOf = (v) => norm(v).toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

// Two lines "echo" when one contains the other: a support line that repeats the
// headline renders as the same sentence printed twice, one row below itself. The
// keys are space-padded so the match is on whole words — unpadded, "one sentence
// in" matched "one sentence into a finished film" and threw away a good line.
function echoes(a, b) {
  const x = keyOf(a), y = keyOf(b);
  if (!x || !y) return false;
  return ` ${x} `.includes(` ${y} `) || ` ${y} `.includes(` ${x} `);
}

// Word-boundary clip — a raw slice lands half a word on screen, which reads as a
// rendering bug rather than an edit.
function clipWords(v, n) {
  const t = norm(v);
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  const sp = cut.lastIndexOf(" ");
  return (sp > n * 0.5 ? cut.slice(0, sp) : cut).replace(/[\s,;:.–—-]+$/, "");
}

// A clause that opens or closes on a function word is a STUMP, and pills render
// each label ALONE: "Slack & Teams in" or "and the whole team" ship as visibly
// broken copy. Dropping the fragment costs one pill; shipping it costs the frame.
const STUMP_HEAD = new Set((
  "and or but so yet nor then than that which who because though although while when if as "
  + "of to in on at for with from by into over about after before per via "
  + "is are was were be been it its this these those there"
).split(" "));
const STUMP_TAIL = new Set([...STUMP_HEAD, ...(
  "a an the your our their my his her no not do does did has have had "
  + "will would can could should may might must up out more most very just"
).split(" ")]);

const bareWords = (text) => (norm(text).toLowerCase().match(/[a-z0-9][a-z0-9'&$%./+-]*/g) || [])
  .map((w) => w.replace(/[^a-z0-9]/g, ""))
  .filter(Boolean);

function isStump(text) {
  const w = bareWords(text);
  if (!w.length) return true;
  // ONE WORD CAN BE A LABEL — if it is a word with content in it. Rejecting
  // every single-word clause threw away exactly the copy these racks are for:
  // "Design. Code. AI." is three perfect pills, and all three were dropped, so
  // the sign rack rendered one entry and two empty slots. A function word on its
  // own ("So", "And", "It") is still the leftover of a bad split.
  if (w.length < 2) return !/\d/.test(text) && (STUMP_TAIL.has(w[0]) || w[0].length < 3);
  return STUMP_HEAD.has(w[0]) || STUMP_TAIL.has(w[w.length - 1]);
}

// A support LINE is a whole sentence, so opening on "It costs $29 a month" or
// "That is 4.9x cheaper" is fine prose — only a dangling function word at the END
// gives it away as a cut-off fragment.
function endsOnStump(text) {
  const w = bareWords(text);
  return !w.length || STUMP_TAIL.has(w[w.length - 1]);
}

// `\.(?!\d)` keeps "4.9" and "$29.99" whole — the same guard the composers use
// when they mine a subtext for list items.
const trimEdges = (c) => c.replace(/^[\s"'(\[]+|[\s"')\]]+$/g, "").trim();
const splitOn = (text, re) => norm(text).split(re).map(trimEdges).filter(Boolean);
const splitSentences = (text) => splitOn(text, /[;!?]|\.(?!\d)/);
const splitClauses = (text) => splitOn(text, /[;:,!?]|\.(?!\d)|\s[–—-]\s/);
const wordsOf = (t) => (norm(t).match(/[A-Za-z0-9][A-Za-z0-9'&$%./+-]*/g) || []).length;

// The conjunction that joined a clause to the one before it is what makes the
// clause read as a fragment: drop it and "but the work never syncs" becomes a
// label that stands on its own.
const LEAD_STRIP = new Set("and or but so yet nor then plus which that".split(" "));
function stripLead(text) {
  let t = norm(text);
  for (let i = 0; i < 2; i++) {
    const m = t.match(/^([A-Za-z']+)\s+(.+)$/);
    if (!m || !LEAD_STRIP.has(m[1].toLowerCase())) break;
    t = m[2];
  }
  return t;
}

// Mid-sentence clauses start lowercase; a pill reads as a label, so lift the first
// letter — but never on a code-ish line, where a typed command must stay verbatim.
const capFirst = (t) => (/^[a-z]/.test(t) && !/[$_<>={}\\\/]|--/.test(t) ? t[0].toUpperCase() + t.slice(1) : t);

// 28 chars is the label budget templates lay out for a pill/card row. The cut is
// what has to be policed, not the length: "Slack & Teams in" is exactly what a
// 28-char cut of "Slack & Teams in one inbox" leaves on screen, so a clipped label
// ships only when the clipped form still ends on a real word.
function clauseLabels(text, max) {
  const out = [];
  const seen = new Set();
  for (const raw of splitClauses(text)) {
    let label = capFirst(stripLead(raw));
    // A LONG CLAUSE IS STILL A LABEL ONCE IT IS CUT. Dropping everything over 28
    // chars is what left the racks empty: measured on the film that produced this
    // complaint, 8 scenes yielded ZERO pill labels, because narration clauses run
    // long ("One workspace for your entire product development process"). Clip on
    // a word boundary and keep it only if the clipped form still reads whole.
    if (label && label.length > 28) {
      const cut = clipWords(label, 28);
      label = cut && !endsOnStump(cut) ? cut : "";
    }
    if (!label || isStump(label)) continue;
    const k = keyOf(label);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(label);
    if (out.length >= max) break;
  }
  return out;
}

// Kicker of last resort: the scene's own purpose, else a section label for its
// kind. Written in sentence case because the composers uppercase it themselves.
const KIND_KICKER = {
  title: "Overview",
  hook: "Why it matters",
  bullet: "What you get",
  caption: "How it works",
  quote: "In their words",
  chart: "By the numbers",
  countdown: "Counting down",
  "shape-motion": "In motion",
  cta: "Start here",
};

function ensureCopyFloor(sb) {
  if (!sb || !Array.isArray(sb.scenes)) return;
  sb.scenes.forEach((scene, i) => {
    if (!scene || typeof scene !== "object") return;
    try {
      const vo = norm(scene.voiceover);
      // A `typewriter` scene's subtext and bullets are TYPED into the terminal as
      // literal command/output lines, so a clause of narration would print there as
      // a fake command. Only its kicker (a chip outside the window) is safe to fill.
      const typed = norm(scene.animation).toLowerCase() === "typewriter";

      // subtext: one SENTENCE of the narration first (a comma fragment reads as a
      // cut-off line under the headline); its clauses, longest first, are the
      // fallback when the sentence overruns the slot. The support row exists to
      // land a SECOND fact, so a line that already contains the headline is only
      // taken when nothing else survives — better a near-echo than an empty row.
      if (!norm(scene.subtext) && vo && !typed) {
        const usable = (min) => splitSentences(vo)
          .concat(splitClauses(vo).map(stripLead).sort((a, b) => b.length - a.length))
          .filter((c) => wordsOf(c) >= min && c.length <= 120 && !endsOnStump(c)
            && keyOf(c) !== keyOf(scene.headline));
        // Three words is the bar for a support LINE, but a short narration
        // ("Design. Code. AI. All disconnected.") has no clause that long, and
        // holding out for one left the row empty on exactly the beats that were
        // already thinnest. Take a two-word line rather than nothing.
        const cands = usable(3).length ? usable(3) : usable(2);
        const pick = cands.find((c) => !echoes(c, scene.headline)) || cands[0];
        if (pick) scene.subtext = capFirst(pick);
      }

      // A model that writes `bullets` as a bare string would otherwise be replaced
      // wholesale below; promote its copy to the one-item row templates expect.
      if (typeof scene.bullets === "string" && norm(scene.bullets)) scene.bullets = [norm(scene.bullets)];
      const hasBullets = Array.isArray(scene.bullets) && scene.bullets.some((b) => norm(b));
      if (!hasBullets && !typed) {
        const labels = clauseLabels(`${vo}. ${norm(scene.subtext)}`, 8)
          .filter((c) => !echoes(c, scene.headline) && keyOf(c) !== keyOf(scene.subtext))
          .slice(0, 3);
        if (labels.length) scene.bullets = labels;
      }

      // The opener is left alone on purpose: with no `kicker` the packs fall back
      // to something better than a section label there (family_bright's hero chip
      // is `scene.kicker || scene.purpose || brand` — the BRAND name).
      if (!norm(scene.kicker) && i > 0) {
        const label = norm(scene.purpose) || KIND_KICKER[norm(scene.kind).toLowerCase()] || "";
        if (label) scene.kicker = clipWords(label, 18);
      }
    } catch { /* fail-open: ship the scene as authored */ }
  });
}

async function generateStoryboard({ prompt, duration, orientation, framePack }) {
  const user = buildUser({ prompt, duration, orientation, framePack });
  const maxTries = (config.llm.storyboardMaxRetries || 2) + 1;

  let totalIn = 0, totalOut = 0;
  // Actual charges reported by the provider, summed across retries/laps.
  let totalCost = 0, costCalls = 0;
  let lastErrors = [];
  let lastParseError = null;
  let augmentedUser = user;

  const system = await getSystem();
  for (let i = 1; i <= maxTries; i++) {
    const { text, tokensIn, tokensOut, costUsd } = await openrouter.chat({
      system,
      user: augmentedUser,
      jsonMode: true,
      stage: "storyboard",
    });
    totalIn += tokensIn;
    totalOut += tokensOut;
    if (typeof costUsd === "number") { totalCost += costUsd; costCalls++; }

    let storyboard;
    try {
      storyboard = parseJsonLenient(text);
    } catch (e) {
      lastParseError = e.message;
      augmentedUser = `${user}\n\nPrevious attempt returned invalid JSON: ${e.message}\nReturn ONLY the JSON object.`;
      continue;
    }

    // Repair mechanical timing drift before validating, so the model is only
    // ever retried for genuine content problems — not arithmetic.
    normalizeTimeline(storyboard, duration);
    const errs = validate(storyboard, { duration, orientation });
    if (errs.length === 0) {
      // Last stop before the composition: fill the text slots this storyboard
      // still leaves empty, so the frame has something to lay out.
      ensureCopyFloor(storyboard);
      return { storyboard, tokensIn: totalIn, tokensOut: totalOut, costUsd: costCalls ? totalCost : null };
    }
    lastErrors = errs;
    augmentedUser = `${user}\n\nPrevious attempt had these validation errors — fix them and try again:\n${errs.map(e => `- ${e}`).join("\n")}`;
  }

  const err = new Error(
    `storyboard generation failed after ${maxTries} attempts: ${lastErrors.join("; ") || lastParseError || "unknown"}`
  );
  err.tokensIn = totalIn;
  err.tokensOut = totalOut;
  err.costUsd = costCalls ? totalCost : null;
  throw err;
}


// THE STORYBOARD MUST STAND ON THE SCRIPT'S SCENE LIST, NOT ITS OWN.
//
// The narration is synthesized PER SCRIPT SCENE and mixed at that script scene's
// own start (voiceAgent -> audio_mix). The picture is built from the STORYBOARD's
// scenes. Those two lists were never reconciled: retimeScenesToVo matches them by
// id and simply skips whatever does not pair up.
//
// And they routinely disagree. The system prompt above tells the director
// "Number of scenes: ceil(durationSec / 4) +/- 1. Minimum 2, MAXIMUM 20" with
// "durations 2-7 seconds", while the user payload built from an approved script
// says "FOLLOW these timings exactly - same number of scenes". A 300s film is 60
// script scenes; the storyboard cannot legally hold more than 20. normalizeTimeline
// then quietly stretched those 20 to 15s each to reach 300s, so the film played 20
// long slides while 60 narration clips were laid down on the SCRIPT's clock — 40 of
// them at offsets no scene boundary had ever agreed to. That is the whole-film
// version of "the voiceover has nothing to do with what is on screen": not a beat
// out of step, two different films.
//
// Reconciled deterministically here instead of asking the model again: the script
// is the contract the user approved and the thing the narrator actually reads, so
// the script's ids, starts and durations are law. Everything the director
// contributed that ISN'T timing — kind, layout, animation, motif, palette, beats —
// is carried across from whichever storyboard scene covers that moment of the film.
function alignToScript(sb, script, label = "storyboard") {
  const scScenes = (script && Array.isArray(script.scenes)) ? script.scenes.filter(Boolean) : [];
  const sbScenes = (sb && Array.isArray(sb.scenes)) ? sb.scenes.filter(Boolean) : [];
  if (!scScenes.length || !sbScenes.length) return sb;

  const sameShape = sbScenes.length === scScenes.length && sbScenes.every((s, i) =>
    String(s.id) === String(scScenes[i].id != null ? scScenes[i].id : `s${i + 1}`) &&
    Math.abs((Number(s.duration) || 0) - (Number(scScenes[i].duration) || 0)) <= 0.12);
  if (sameShape) return sb;

  // Where each storyboard scene sits on ITS OWN clock, and the factor that maps
  // a script second onto that clock (the two totals rarely match).
  const win = []; let t = 0;
  for (const s of sbScenes) { const d = Math.max(0, Number(s.duration) || 0); win.push({ s, a: t, b: t + d }); t += d; }
  const sbTotal = t || 1;
  const scTotal = scScenes.reduce((a, s) => a + Math.max(0, Number(s.duration) || 0), 0) || 1;
  const k = sbTotal / scTotal;

  const used = new Set();
  const out = [];
  let cursor = 0;
  scScenes.forEach((sc, i) => {
    const d = Math.max(0, Number(sc.duration) || 0);
    const mid = (cursor + d / 2) * k;
    const donor = (win.find((w) => mid >= w.a && mid < w.b) || win[win.length - 1]).s;
    const firstForDonor = !used.has(donor);
    used.add(donor);
    const id = String(sc.id != null ? sc.id : `s${i + 1}`);
    // The SCRIPT's own display line wins. `onScreenText` is the script's display
    // typography by contract ("the keyword, the number, the imperative"), so a
    // scene that has one shows it; only a scene with none borrows the director's
    // headline, and only if no earlier scene has already used that same one —
    // otherwise a donor covering four script scenes stamps its headline on all
    // four and the picture stops advancing with the voice.
    const own = Array.isArray(sc.onScreenText) ? sc.onScreenText.filter(Boolean) : [];
    const headline = String(own[0] || (firstForDonor ? donor.headline : "") || "").slice(0, 120);
    const scene = {
      ...donor,
      id,
      start: round2(cursor),
      duration: round2(d),
      headline,
      // Everything below the headline: the script's remaining display lines are
      // this scene's own; the director's supporting copy only fills a scene that
      // brought none, and only the first time it is used.
      subtext: own.length > 1 ? own.slice(1).join(" ") : (firstForDonor ? donor.subtext : ""),
      bullets: own.length > 2 ? own.slice(1) : (firstForDonor && Array.isArray(donor.bullets) ? donor.bullets : []),
      voiceover: String(sc.voiceover || "").trim(),
    };
    // A donor's beats are timed against the donor's own (usually longer) window;
    // validate() drops any beat at or past the scene's end, so trim them here
    // rather than shipping a scene whose exit cue never fires.
    if (Array.isArray(scene.beats)) scene.beats = scene.beats.filter((b) => b && typeof b.at === "number" && b.at < d);
    out.push(scene);
    cursor = round2(cursor + d);
  });

  console.log(
    `[${label}] storyboard aligned to the script: ${sbScenes.length} directed scene(s) -> ${out.length} ` +
    `(the narration is cut per SCRIPT scene, so any scene the storyboard does not carry is spoken over someone else's frame)`
  );
  sb.scenes = out;
  sb.durationSec = round2(scTotal);
  return sb;
}

module.exports = { generateStoryboard, normalizeTimeline, validate, ensureCopyFloor, alignToScript, expandToCover };
