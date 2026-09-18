// CONTENT DENSITY DIRECTOR — decides what belongs ON SCREEN, as distinct from
// what belongs in the VOICEOVER.
//
// WHY THIS EXISTS
//
// Pace was one dial driving two channels. `narrationDensity` shortened the
// script, and because every word that ever reached the frame had been mined out
// of that same script, a quicker film also got an emptier picture. Measured over
// the 39 shipped jobs in jobs.json:
//
//   pace        VO words/sec   on-screen words/sec   on-screen words/SCENE
//   relaxed        2.03              0.77                   3.29
//   normal         2.05              1.21                   4.05
//   fast           1.29              1.27                   4.17
//   very-fast      1.03              1.17                   3.39
//
// The narration halves — that is the feature working. The picture was supposed
// to take the information back and instead went thinner. Job 2vs0z2cpkv, a 90s
// very-fast film about LLM agents, ran 39 frames like this one:
//
//   VO "Start with brains."      on screen "1. The Brain: LLM"
//
// while its own brief was carrying "LangGraph orchestrates reliable multi-step
// agents as graphs" and four more messages like it. Nothing in the pipeline ever
// offered those words to the frame: services/storyboard.js's deterministic
// filler mines subtext and bullets out of the VOICEOVER, and the storyboard
// prompt (graph.js storyboardPromptFromScript) was handed the script's narration
// and nothing else — no `keyMessages`, no `mustIncludeFacts`.
//
// So the fix is not "more text". It is a SECOND SUPPLY, sized by its own budget:
//
//   VOICEOVER      what the narrator has time to SAY   (pacing.wordBudget)
//   ON-SCREEN      what the voice does NOT have time to say, drawn from the
//                  brief's own facts                   (pacing.text.charBudget)
//
// WHY MORE TEXT IS NOT LESS READABLE. services/pacing.js minSceneSec() takes the
// MAX of its lines' readability floors, never their sum, because lines sharing a
// frame are read at the same time. A frame's readable capacity is bounded by its
// LONGEST element, not by how many it carries. So density is bought the one way
// that costs nothing: MORE elements, each SHORTER. pacing.visualCapacity() is
// the oracle for how short, derived per scene from the real clock.
//
// WHAT IT WILL NOT DO
//
// - It never invents. Every line traces to the brief or the script; a film whose
//   brief is thin gets a thin frame, honestly.
// - It never overwrites. ADD-ONLY, exactly like services/text_director.js: the
//   storyboard model's own copy always wins, so the worst case is the film we
//   ship today and never a worse one.
// - It never echoes. A line that restates this scene's headline or its own
//   voiceover is dropped, because the frame exists to carry what the voice does
//   not — "do not print the narration on screen" is the whole point.
// - It is template-agnostic. It writes the five fields every composer already
//   reads (kicker / headline / subtext / bullets / emphasis) plus an OPTIONAL
//   `textReveal` a composer may ignore. No pack knows this module exists, and
//   nothing here is conditioned on a pack, a family or an orientation.
// - It cannot block a render. Every entry point is wrapped; on any error the
//   storyboard passes through untouched.

const pacing = require("./pacing");

// ---------------------------------------------------------------------------
// TEXT UTILITIES
// ---------------------------------------------------------------------------

const norm = (v) => String(v == null ? "" : v).replace(/\s+/g, " ").trim();
// Comparison key: what makes two lines "the same thing on screen twice".
const key = (v) => norm(v).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const words = (v) => (norm(v).match(/\S+/g) || []);

// Content words, for relevance. Stopwords are the ones that would otherwise make
// every line look related to every scene.
const STOP = new Set(("a an and are as at be but by for from has have how in into is it its of on or that the "
  + "their they this to was were what when where which who will with you your our we us can could would should "
  + "more most than then them these those there here about after all also any because been before being between "
  + "both did do does each few had he her him his if just me my no nor not now only other out over own same "
  + "she so some such too under up very via while why").split(" "));

function tokens(v) {
  return new Set(key(v).split(" ").filter((w) => w.length > 2 && !STOP.has(w)));
}

function overlap(a, b) {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  return n / Math.min(a.size, b.size);
}

// Does `line` just say what `other` already says? Guards the two failure modes
// the storyboard prompt names by hand: the subtext that reworded the headline,
// and the on-screen line that is the narration printed out.
function echoes(line, other) {
  const a = key(line), b = key(other);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  return overlap(tokens(line), tokens(other)) >= 0.6;
}

// A line is WORTH a slot when it carries substance: a number, or two real words.
// Mirrors text_director.meaty so the two directors agree on what is renderable.
function meaty(line) {
  const t = norm(line);
  if (!t) return false;
  if (/\d/.test(t)) return true;
  return (t.match(/[A-Za-z]{2,}/g) || []).length >= 2;
}

// ---------------------------------------------------------------------------
// THE CONTENT POOL — everything the film KNOWS, classified for the frame.
// ---------------------------------------------------------------------------

// A standalone figure: "95% of Fortune 500", "$29/mo", "10x faster", "12k films".
// Numbers are the single most valuable thing a frame can carry and the thing a
// short narration drops first, so they are mined explicitly rather than left to
// survive inside a sentence that will not fit.
const METRIC_RE = /[$€£₹]\s?\d[\d,.]*\s*(?:k|m|b|bn|mn)?(?:\s*(?:\/|per)\s*\w{1,8})?|\d[\d,.]*\s*(?:%|x|k|m|b)\+?(?:\s+[A-Za-z][\w-]*){0,3}/g;

// Roughly, what this line is FOR on a frame. Drives which slot it lands in and
// how it is ranked — a metric outranks a benefit, because a number sells.
function classify(text) {
  const t = norm(text);
  const n = words(t).length;
  if (/\d/.test(t) && n <= 8) return "metric";
  if (/^(try|start|get|book|join|sign|see|explore|build|ship|download|request|claim|talk|learn)\b/i.test(t)) return "cta";
  if (n <= 3) return "keyword";
  if (n <= 8) return "callout";
  return "fact";
}

// Rank within the pool. Facts the brief marked MUST-INCLUDE outrank everything,
// then numbers, then the messages the brief chose to lead with.
const SOURCE_WEIGHT = { mustInclude: 100, keyMessage: 70, onScreen: 55, metric: 50, goal: 30, prompt: 20, voiceover: 8 };
const KIND_BONUS = { metric: 18, callout: 8, cta: 6, fact: 4, keyword: 0 };

/**
 * Everything the film knows, as a ranked, de-duplicated, classified pool.
 *
 * SOURCE ORDER IS THE POINT. `mustIncludeFacts` leads because it is the one
 * field the brief marks as non-negotiable and the one field that reached NOTHING
 * downstream before this module: it is absent from the storyboard prompt, absent
 * from the text director's LLM payload, and absent from its deterministic miner.
 * Up to twelve facts of up to 500 characters each were being collected at ingest
 * and thrown away.
 *
 * `voiceover` is last and deliberately cheap: mining the narration is what the
 * old filler did, and it is exactly what fails at a fast pace. It stays as a
 * floor so a film with a thin brief still fills its frames.
 */
function buildContentPool({ brief, script, storyboard } = {}) {
  const pool = [];
  const seen = new Set();

  // Never offer the frame a line that is already a headline somewhere in it.
  const headlines = new Set(
    ((storyboard && storyboard.scenes) || []).map((s) => key(s.headline)).filter(Boolean)
  );

  const add = (text, source, sceneId = null) => {
    const t = norm(text);
    if (!t || !meaty(t)) return;
    const k = key(t);
    if (!k || seen.has(k) || headlines.has(k)) return;
    seen.add(k);
    const kind = classify(t);
    pool.push({
      text: t,
      kind,
      source,
      sceneId,
      tokens: tokens(t),
      weight: (SOURCE_WEIGHT[source] || 10) + (KIND_BONUS[kind] || 0),
      used: false,
    });
  };

  const b = brief || {};
  // 1. The facts the brief said must appear. Highest value, previously unused.
  (b.mustIncludeFacts || []).forEach((f) => add(f, "mustInclude"));
  // 2. The messages the film is about.
  (b.keyMessages || []).forEach((m) => add(m, "keyMessage"));
  // 3. Numbers standing anywhere in the brief's prose, promoted to their own
  //    elements so a figure can land on a frame without its whole sentence.
  const prose = [b.improvedPrompt, b.goal, b.audience, b.subject].map(norm).join(" ");
  for (const m of prose.match(METRIC_RE) || []) add(m, "metric");
  // `brief.goal` is deliberately NOT pooled. It is an objective written about the
  // VIEWER ("Leave the viewer eager to build their first agent"), not copy about
  // the product, and pooling it put "Leave the viewer" and "Eager to build" on
  // screen as labels. The goal shapes the CTA the script writes; it is not itself
  // display text.

  // 5. The script's own display lines, kept scene-aligned so a writer's line
  //    lands on the scene they wrote it for.
  for (const sc of (script && script.scenes) || []) {
    for (const line of sc.onScreenText || []) add(line, "onScreen", String(sc.id));
  }
  // 6. Last resort: clauses of the narration. Cheap on purpose — see above.
  for (const sc of (script && script.scenes) || []) {
    for (const clause of splitClauses(sc.voiceover)) add(clause, "voiceover", String(sc.id));
  }

  pool.sort((a, z) => z.weight - a.weight);
  return pool;
}

// Break a spoken line into standalone display fragments. A comma fragment reads
// as a cut-off line under a headline, so only sentence-ish splits are kept and
// each piece must still stand alone.
function splitClauses(text) {
  const t = norm(text);
  if (!t) return [];
  return t.split(/(?:(?<=[.!?])\s+)|(?:\s+[—–-]\s+)/)
    .map((s) => s.replace(/^[,;:\s]+|[,;:\s]+$/g, ""))
    .filter((s) => words(s).length >= 2);
}

// ---------------------------------------------------------------------------
// CONDENSATION — making a long fact fit a short slot without breaking it.
// ---------------------------------------------------------------------------
//
// THE PROBLEM THIS SOLVES. A brief's facts are written as sentences —
// "LangChain connects LLMs to tools, memory and data" is 49 characters — and a
// 2.3s very-fast frame gives a label 17 of them. Clipping is not an option: a
// hard slice produces "LangChain connect", which reads as a broken renderer, and
// pacing.fitVisualLine() now refuses to do it at all.
//
// So a long fact is CONDENSED rather than cut. The ladder below tries the
// cheapest faithful shortening first and stops at the first rung that fits:
//
//   1. it already fits
//   2. drop a leading article/filler ("The dashboard shows..." -> "Dashboard shows...")
//   3. the clause before the first comma or colon — usually the claim itself
//   4. the leading content words, whole — "LangGraph orchestrates reliable
//      multi-step agents as graphs" -> "LangGraph orchestrates" -> "LangGraph"
//
// Rung 4 is what makes a fast film work: the same fact is a support LINE on a
// relaxed 4.3s frame and a scannable LABEL on a very-fast 2.3s one, and both are
// true to the brief. That is capacity-driven editing, not truncation.

const LEAD_FILLER = /^(?:the|a|an|our|your|their|its|this|that|these|those|it\s+is|there\s+(?:is|are)|we\s+(?:offer|provide|help|make|built)|you\s+can)\s+/i;

function condense(text, max) {
  const t = norm(text).replace(/[.]+$/, "");
  if (!t) return "";
  if (t.length <= max) return t;

  // 2. shed a leading article or filler opener
  const shed = t.replace(LEAD_FILLER, "");
  if (shed !== t && shed.length <= max) return capFirst(shed);

  // 3. the clause before the first comma / colon / dash
  const head = shed.split(/\s*[,:;]\s*|\s+[—–-]\s+/)[0];
  if (head && head.length <= max && words(head).length >= 2) return capFirst(head);

  // 4. leading whole words, dropping one at a time until it fits. Stops at two
  //    words: below that a fragment has lost the noun it was about, EXCEPT when
  //    the single remaining word is a real name (capitalised or ≥6 chars), which
  //    is exactly the "LangGraph" case and a perfectly good label.
  const w = words(shed);
  for (let n = w.length - 1; n >= 1; n--) {
    const cand = w.slice(0, n).join(" ").replace(/[\s,;:.–—-]+$/, "");
    if (cand.length > max) continue;
    if (n >= 2) return capFirst(cand);
    const solo = cand.replace(/[^\w'-]/g, "");
    if (solo.length >= 6 || /^[A-Z]/.test(solo)) return solo;
    return "";
  }
  return "";
}

const capFirst = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * Split one fact into the short scannable LABELS hiding inside it.
 *
 * "LangChain connects LLMs to tools, memory and data" carries four screen-worthy
 * things — LangChain, tools, memory, data — and a label row is exactly where
 * they belong. This is the "extract keywords and supporting details" half of the
 * brief: at a fast pace the frame stops trying to show sentences and starts
 * showing the nouns, which is both denser AND more readable.
 *
 * Returns [] when nothing survives at this width, so a caller never renders a
 * fragment it would be embarrassed by.
 */
function keyphrases(text, max) {
  const t = norm(text);
  if (!t) return [];
  const out = [];
  const seen = new Set();
  for (let part of t.split(/\s*[,;:]\s*|\s+(?:and|or|plus)\s+|\s+[—–-]\s+/i)) {
    part = part.replace(/^\s*(?:to|for|with|from|into|as|of|on|in|by)\s+/i, "").replace(/[.]+$/, "").trim();
    if (!part) continue;
    const fitted = part.length <= max ? part : condense(part, max);
    if (!fitted) continue;
    const k = key(fitted);
    // A single stopword or a bare number with no unit is not a label.
    if (!k || seen.has(k) || (!/\d/.test(fitted) && words(fitted).every((w) => STOP.has(key(w))))) continue;
    seen.add(k);
    out.push(capFirst(fitted));
  }
  return out;
}

// ---------------------------------------------------------------------------
// ALLOCATION — which of those lines belongs on WHICH frame.
// ---------------------------------------------------------------------------

// How related a line must be to a scene before it may land on it.
//
// WITHOUT THIS the allocator front-loads: pool items are ranked by weight, so
// scene 1 takes the four most valuable facts in the film whether or not they
// have anything to do with its beat, and every later frame starves. Measured on
// job 2vs0z2cpkv that produced a hook frame carrying "future agentic AI" beside
// "Fast but messy." while eleven downstream frames got nothing.
//
// Relevance therefore GATES on the first pass and only ranks on the second. A
// film whose brief simply has less to say ends with emptier late frames, which
// is honest; it never ends with one stuffed frame and a dozen bare ones.
const MIN_RELEVANCE = 0.15;

/**
 * Pick the best unused pool item for a scene: relevant first, then valuable.
 *
 * @param {object} opts .kinds    restrict to these classifications
 *                      .gated    require MIN_RELEVANCE (pass 1) or not (pass 2)
 *                      .maxChars the slot's ceiling — an item that cannot be
 *                                condensed into it is not a candidate at all,
 *                                so a long fact never consumes a label slot it
 *                                would only be truncated into.
 */
function pickFor(pool, ctx, { kinds = null, gated = true, maxChars = Infinity } = {}) {
  let best = null, bestScore = -1, bestText = "";
  for (const item of pool) {
    if (item.used) continue;
    if (kinds && !kinds.includes(item.kind)) continue;
    // A display line the script pinned to a scene stays on that scene.
    if (item.source === "onScreen" && item.sceneId && ctx.sceneId && item.sceneId !== ctx.sceneId) continue;
    // NARRATION NEVER TRAVELS. A voiceover clause is what the narrator says over
    // ITS OWN scene; printing it over a different one is incoherent — it put
    // "Brains can't click." on the frame whose line was "Start with brains."
    // On its own scene it is still barred as an echo (ctx.avoid holds the VO),
    // so in practice this retires narration-mining wherever the brief has
    // anything at all to say, which is the whole point of the second supply.
    if (item.source === "voiceover" && item.sceneId !== ctx.sceneId) continue;
    if (ctx.avoid.some((a) => echoes(item.text, a))) continue;

    const rel = overlap(item.tokens, ctx.tokens);
    const pinned = item.sceneId != null && item.sceneId === ctx.sceneId;
    if (gated && !pinned && rel < MIN_RELEVANCE) continue;

    // Must survive the slot at its full or condensed length.
    const text = item.text.length <= maxChars ? item.text : condense(item.text, maxChars);
    if (!text || !meaty(text)) continue;
    if (ctx.avoid.some((a) => echoes(text, a))) continue;

    // Weight dominates; relevance breaks ties and can promote a strong match.
    const score = item.weight + rel * 60 + (pinned ? 30 : 0);
    if (score > bestScore) { bestScore = score; best = item; bestText = text; }
  }
  return best ? { item: best, text: bestText } : null;
}

/**
 * Plan ONE scene's on-screen copy.
 *
 * ADD-ONLY: every slot the scene already fills is left exactly as it is, and
 * only genuinely empty ones are offered a line. Returns the lines it would add
 * plus the capacity it planned against, without mutating the scene —
 * `directDensity` applies it.
 *
 * @param {object} scene   a storyboard scene
 * @param {Array}  pool    from buildContentPool (items are marked `used`)
 * @param {object} opts    .pacing   resolved pacing config
 *                         .sceneSec the scene's REAL duration (post-retime)
 */
function planSceneContent(scene, pool, { pacing: P = null, sceneSec = null, gated = true, prevKicker = "", roles = null } = {}) {
  const wants = (role) => !roles || roles.includes(role);
  const sec = Number(sceneSec) > 0 ? Number(sceneSec) : Number(scene && scene.duration) || 3.5;
  const cap = pacing.visualCapacity(P, sec);
  const add = {};

  const vo = norm(scene.voiceover);
  const head = norm(scene.headline);

  // TYPEWRITER SCENES ARE NOT TEXT SLOTS. On a `typewriter` scene the composer
  // TYPES `subtext` and `bullets` into a terminal window as literal command
  // lines (system_storyboard.md's tech-topic rule; services/storyboard.js
  // ensureCopyFloor carves out the same case). Filling them with marketing copy
  // prints "99.4% extraction accuracy" as a fake shell command — a worse frame
  // than an empty one, and an instantly obvious fake to the exact audience a
  // terminal scene is there to impress. Only the kicker, which is a chip
  // OUTSIDE the window, is safe to add here.
  const typed = String(scene.animation || "").toLowerCase() === "typewriter";
  // Everything a new line must NOT duplicate: this scene's own copy and its
  // narration. The frame carries what the voice does not say.
  const ctx = {
    sceneId: scene.id != null ? String(scene.id) : null,
    tokens: tokens([head, vo, scene.kind, scene.purpose, norm(scene.visualMotif)].join(" ")),
    avoid: [head, vo, norm(scene.subtext), ...(scene.bullets || []).map(norm)].filter(Boolean),
  };

  // Items are marked `used` OPTIMISTICALLY so a single scene cannot pick the
  // same line twice, and released again if the slot they were taken for ends up
  // discarded. Without the release, a label row that never reached two entries
  // still consumed its candidates — the brief's facts were spent on frames that
  // then rendered without them, and a 39-frame film left a third of its pool
  // permanently unavailable to the frames that could have used it.
  const take = (role, kinds, ledger = null) => {
    const hit = pickFor(pool, ctx, { kinds, gated, maxChars: cap.roles[role] });
    if (!hit) return null;
    hit.item.used = true;
    ctx.avoid.push(hit.text);
    if (ledger) ledger.push(hit.item);
    return hit.text;
  };
  const release = (ledger) => ledger.forEach((it) => { it.used = false; });

  // 1. SUBTEXT — the support line: the fact, number or mechanism that PROVES the
  //    headline. Prefers real facts over keywords, because this is the slot with
  //    the most room and the one a headline-only frame is missing.
  if (wants("subtext") && !norm(scene.subtext) && !typed) {
    const line = take("subtext", ["fact", "callout", "metric"]) || take("subtext", null);
    if (line) add.subtext = line;
  }

  // 2. BULLETS — the scannable row. THE density slot, and the one pace used to
  //    cut: it was `maxOnScreenLines - 1`, i.e. 3 at normal but 2 at fast. It is
  //    now `bulletsPerScene`, which RISES with pace (3/3/3/4).
  //
  //    Two sources, in order. First whole pool items short enough to be labels.
  //    Then — and this is what makes a very-fast frame work — the KEYPHRASES
  //    inside the one fact this scene is already about: "LangChain connects LLMs
  //    to tools, memory and data" is one 49-char sentence no 17-char label slot
  //    can hold, and four labels that fit it perfectly.
  //    TOPS UP, rather than all-or-nothing. text_director's gate treats a scene
  //    with even ONE bullet as filled, so a frame that got a single label was
  //    never brought up to its budget. Here the existing labels are kept and the
  //    row is completed around them.
  const existing = (scene.bullets || []).map(norm).filter(Boolean);
  if (wants("bullets") && !typed && existing.length < cap.bullets) {
    const out = [...existing];
    const ledger = [];
    existing.forEach((b) => ctx.avoid.push(b));
    while (out.length < cap.bullets) {
      // Short, label-shaped material first; then ANY remaining item, which
      // pickFor condenses into the slot ("LangGraph orchestrates reliable
      // multi-step agents as graphs" -> "LangGraph"). Without the second call a
      // pool that is mostly long `fact` items leaves most of the brief unspent
      // while frames sit thin — measured at 13 of 21 items used on a 39-frame
      // very-fast film, with 16 frames still carrying a single line.
      const line = take("bullet", ["metric", "keyword", "callout"], ledger) || take("bullet", null, ledger);
      if (!line) break;
      out.push(line);
    }
    if (out.length < cap.bullets) {
      const donor = pickFor(pool, ctx, { kinds: ["fact"], gated, maxChars: Infinity });
      if (donor) {
        const phrases = keyphrases(donor.item.text, cap.roles.bullet)
          .filter((p) => meaty(p) && !ctx.avoid.some((a) => echoes(p, a)));
        // Only spend the fact if it yields a real ROW; a single phrase is not
        // worth consuming a whole key message for.
        if (out.length + phrases.length >= 2 && phrases.length >= 2) {
          donor.item.used = true;
          for (const p of phrases) {
            if (out.length >= cap.bullets) break;
            out.push(p);
            ctx.avoid.push(p);
          }
        }
      }
    }
    // Only write when something was actually gained — an unchanged row must not
    // be reported as an edit, and must never be demoted into the subtext slot.
    if (out.length > existing.length && out.length >= 2) {
      add.bullets = out;
    } else if (out.length > existing.length && !add.subtext && !norm(scene.subtext)) {
      // A single label is a stray chip, not a row - promote it to the support
      // line instead, where one line reads correctly.
      add.subtext = out[out.length - 1];
    } else {
      // Nothing renderable came of it: hand the material back to the pool so a
      // later frame can still use it.
      release(ledger);
    }
  }

  // 3. KICKER — the eyebrow chip. Cheap, and the difference between a floating
  //    headline and a frame that looks laid out. Never a sentence, and never the
  //    same word as the frame before it: a run of identical chips ("CONTEXT" /
  //    "CONTEXT" / "FEATURE" / "FEATURE") reads as a template artefact rather
  //    than a section label, so a repeat is dropped instead of printed.
  if (wants("kicker") && !norm(scene.kicker)) {
    const src = norm(scene.purpose) || norm(scene.kind);
    const line = pacing.fitVisualLine(src, sec, "kicker", P);
    if (line && line.length >= 3 && key(line) !== key(prevKicker)) add.kicker = line.toUpperCase();
  }

  // 4. EMPHASIS — one word of the headline to accent. scene_kit highlights it
  //    INSIDE the headline, so a non-substring emphasis renders nothing: the
  //    word is taken FROM the headline verbatim rather than chosen and matched.
  if (wants("emphasis") && !norm(scene.emphasis) && head) {
    const cand = words(head)
      .map((w) => w.replace(/^[^\w]+|[^\w]+$/g, ""))
      .filter((w) => w.length >= 4 && !STOP.has(w.toLowerCase()));
    const pick = cand.sort((a, b) => b.length - a.length)[0];
    if (pick && head.includes(pick)) add.emphasis = pick;
  }

  return { add, capacity: cap };
}

// ---------------------------------------------------------------------------
// REVEAL — WHEN each element appears inside its own scene.
// ---------------------------------------------------------------------------

/**
 * Stagger a frame's elements instead of dropping them all at once.
 *
 * A dense frame that lands whole is a wall; the same frame revealed in order
 * reads as choreography — and it is how the copy stays synchronized with the
 * narration rather than racing it. Offsets are RELATIVE to the scene start, in
 * the order the eye should travel: kicker, headline, subtext, then the labels.
 *
 * Every element is guaranteed its own readability floor INSIDE the scene: the
 * last one to arrive still has minReadableSec() left before the cut, and if the
 * scene cannot afford the stagger the whole plan collapses to 0 (everything
 * enters together) rather than pushing a line past the point it can be read.
 * Readability is precedence rule 1; the reveal is a nicety and always yields.
 *
 * Motion scale is the mode's own `stagger` factor, so a faster film reveals
 * quicker — the same dial services/pacing.js scaleTiming() gives the renderer.
 */
function planReveal(elements, sceneSec, P = null) {
  const list = (elements || []).filter((e) => e && norm(e.text));
  if (list.length <= 1) return list.map((e) => ({ ...e, at: 0 }));

  const sec = Number(sceneSec) || 3.5;
  const stagger = (P && P.motion && Number(P.motion.stagger)) || 1;
  // The entrance a composer needs before a line is legible at all.
  const ENTRANCE = 0.18;
  // Base gap between elements, quickened by the mode.
  const gap = Math.max(0.12, 0.34 / stagger);

  // The last element must still be readable before the cut.
  const lastNeed = list.reduce((m, e) => Math.max(m, pacing.minReadableSec(e.text)), 0);
  const room = sec - lastNeed - ENTRANCE;
  if (room <= 0.05) return list.map((e) => ({ ...e, at: 0 }));

  const step = Math.min(gap, room / Math.max(1, list.length - 1));
  // A stagger this tight is not a reveal, it is a rounding error — seven
  // elements 0.02s apart land as one block anyway, and emitting the offsets
  // would tell a composer it was choreographing something when it was not. Below
  // the threshold the frame honestly enters together.
  if (step < 0.08) return list.map((e) => ({ ...e, at: 0 }));
  return list.map((e, i) => ({ ...e, at: Math.round(i * step * 100) / 100 }));
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

/**
 * Fill every frame in the film, in place.
 *
 * Runs AFTER services/text_director.js (which asks an LLM for the same slots) so
 * it only ever sees what the model left empty — the two compose, they do not
 * compete. Deterministic and offline: no LLM call, no network, no per-template
 * knowledge.
 *
 * @returns {{storyboard: object, report: object|null}}
 */
function directDensity({ jobId, brief, script, storyboard, pacing: pacingCfg } = {}) {
  const sb = storyboard;
  if (!sb || !Array.isArray(sb.scenes) || !sb.scenes.length) return { storyboard: sb, report: null };

  // The film's own pace, or the one already attached to the storyboard by
  // compositionAgent, or the default — never a crash.
  const P = pacingCfg || sb.paceConfig || pacing.defaults({ durationSec: sb.durationSec || 30 });

  const before = frameStats(sb);
  let pool = [];
  try { pool = buildContentPool({ brief, script, storyboard: sb }); }
  catch { pool = []; }

  // TWO PASSES, and the order matters.
  //
  // Pass 1 is RELEVANCE-GATED: a fact only lands on a frame it is actually
  // about. That is what stops the hook frame from eating the film's four best
  // messages and leaving every later frame bare — the front-loading the first
  // cut of this module produced.
  //
  // Pass 2 then revisits whatever is STILL empty with the gate off, so leftover
  // material fills the frames no fact matched rather than being thrown away. A
  // film always ends up as full as its brief can make it, and in the right
  // order.
  const secOf = (s) => (Number(s.duration) > 0 ? Number(s.duration) : P.scene.targetSec);
  let added = 0;
  const touched = new Set();

  // ROLE ORDER MATTERS AS MUCH AS SCENE ORDER. The support line is the widest
  // slot on the frame — 39 characters at normal against a label's 27 — so it has
  // to get first claim on the long facts film-wide. Filling a whole scene at a
  // time instead let scene 1's LABEL row condense "LangChain connects LLMs to
  // tools, memory and data" down to "LangChain" before scene 2's support line
  // ever saw it, and the film lost the sentence for good: measured, that cost
  // ~150 characters of on-screen copy across a 90s film.
  //
  // So: every subtext first, then every label row, then the free chrome (kicker
  // and emphasis are derived from the scene's own copy, not from the pool, so
  // they cost nothing and go last).
  const PASSES = [
    { gated: true, roles: ["subtext"] },
    { gated: true, roles: ["bullets"] },
    { gated: false, roles: ["subtext"] },
    { gated: false, roles: ["bullets"] },
    { gated: false, roles: ["kicker", "emphasis"] },
  ];

  for (const pass of PASSES) {
    let prevKicker = "";
    for (const scene of sb.scenes) {
      try {
        const { add } = planSceneContent(scene, pool, {
          pacing: P, sceneSec: secOf(scene), gated: pass.gated, roles: pass.roles, prevKicker,
        });
        for (const [k, v] of Object.entries(add)) {
          if (v == null || (Array.isArray(v) && !v.length)) continue;
          scene[k] = v;
          added++;
          touched.add(scene.id != null ? String(scene.id) : scene);
        }
      } catch { /* one bad scene never costs the film */ }
      prevKicker = norm(scene.kicker);
    }
  }

  // The reveal order, for composers that honour it. Non-enumerable so it can
  // never leak into an LLM prompt that JSON-stringifies the scene (the same
  // reason services/pacing.js attaches the pace non-enumerably), and purely
  // additive: a composer that ignores it renders exactly as it does today.
  for (const scene of sb.scenes) {
    try {
      const elements = [
        { role: "kicker", text: norm(scene.kicker) },
        { role: "headline", text: norm(scene.headline) },
        { role: "subtext", text: norm(scene.subtext) },
        ...(scene.bullets || []).map((b) => ({ role: "bullet", text: norm(b) })),
      ].filter((e) => e.text);
      Object.defineProperty(scene, "textReveal", {
        value: planReveal(elements, secOf(scene), P), enumerable: false, configurable: true, writable: true,
      });
    } catch { /* reveal is a nicety; never fatal */ }
  }
  const framesTouched = touched.size;

  const after = frameStats(sb);
  const report = {
    mode: P.mode,
    poolSize: pool.length,
    poolUnused: pool.filter((p) => !p.used).length,
    added,
    framesTouched,
    sceneCount: sb.scenes.length,
    elementsPerSceneTarget: P.text.elementsPerScene,
    charBudget: P.text.charBudget,
    before,
    after,
  };
  console.log(`[content_density] job ${jobId || "?"} (${P.mode}): +${added} element(s) on ${framesTouched}/${sb.scenes.length} frames `
    + `— ${before.elementsPerScene} -> ${after.elementsPerScene} elements/frame, ${before.charsPerScene} -> ${after.charsPerScene} chars/frame `
    + `(${pool.length - report.poolUnused}/${pool.length} pool items used)`);
  return { storyboard: sb, report };
}

// What the frames actually carry — the number the whole feature is judged on.
function frameStats(sb) {
  const scenes = (sb && sb.scenes) || [];
  if (!scenes.length) return { elementsPerScene: 0, charsPerScene: 0, framesWithOneElement: 0 };
  let els = 0, chars = 0, thin = 0;
  for (const s of scenes) {
    const parts = [norm(s.kicker), norm(s.headline), norm(s.subtext), ...(s.bullets || []).map(norm)].filter(Boolean);
    els += parts.length;
    chars += parts.reduce((a, p) => a + p.length, 0);
    if (parts.length <= 1) thin++;
  }
  const r1 = (n) => Math.round(n * 10) / 10;
  return {
    elementsPerScene: r1(els / scenes.length),
    charsPerScene: r1(chars / scenes.length),
    framesWithOneElement: thin,
  };
}

/**
 * Re-plan the reveal offsets against the film's FINAL scene lengths.
 *
 * directDensity runs in the text-director node; retimeScenesToVo runs four nodes
 * later, in composition, and only ever GROWS a scene (it stretches each one to
 * contain its measured narration plus a tail). So every offset planned earlier
 * was computed against a duration the film no longer has — always shorter than
 * the delivered one, which is the safe direction for readability but leaves the
 * stagger bunched into the front of a scene that has since gained a second.
 *
 * Copy is deliberately NOT re-planned here. The per-role character ceilings were
 * also computed against the shorter duration, but a line that fits a 2.3s frame
 * fits the 2.8s frame it became; re-cutting the copy at this point would change
 * what the film says after the narration has already been recorded against it.
 * Only the timing moves.
 */
function replanReveal(storyboard, pacingCfg = null) {
  const sb = storyboard;
  if (!sb || !Array.isArray(sb.scenes)) return sb;
  const P = pacingCfg || sb.paceConfig || null;
  for (const scene of sb.scenes) {
    try {
      const elements = [
        { role: "kicker", text: norm(scene.kicker) },
        { role: "headline", text: norm(scene.headline) },
        { role: "subtext", text: norm(scene.subtext) },
        ...(scene.bullets || []).map((b) => ({ role: "bullet", text: norm(b) })),
      ].filter((e) => e.text);
      if (!elements.length) continue;
      const sec = Number(scene.duration) > 0 ? Number(scene.duration) : null;
      if (!sec) continue;
      Object.defineProperty(scene, "textReveal", {
        value: planReveal(elements, sec, P), enumerable: false, configurable: true, writable: true,
      });
    } catch { /* the reveal is a nicety; never fatal */ }
  }
  return sb;
}

module.exports = {
  directDensity,
  replanReveal,
  buildContentPool,
  planSceneContent,
  planReveal,
  frameStats,
  // exported for tests
  _internals: { classify, echoes, meaty, splitClauses, tokens, overlap, METRIC_RE },
};
