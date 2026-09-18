// PROMPT SCOPE — the gate in front of the whole pipeline.
//
// KEYFRAME makes template-based videos. Before this existed, every create request —
// a SaaS promo, a coding question, "write my essay" — got a job row, a 202, ingest,
// a brief, a script and (on autopilot) a render. The prompt analyser that ran inside
// the brief was a quality REFINER with a scope opinion bolted on: its prompt told it
// to convert non-video requests into videos, its coercion layer downgraded any refusal
// that lacked a creative alternative back into "proceed", and nothing downstream ever
// read its verdict to stop anything.
//
// This module asks ONE question, synchronously, before any of that: can KEYFRAME
// fulfil this request by making a video?
//
//   SUPPORTED            -> the create route inserts the job and the pipeline runs;
//                           normalisation happens inside it, automatically
//                           (prompt_analysis.js, called from generateBrief).
//   NEEDS_CLARIFICATION  -> no job. One concise question. At most one round.
//   OUT_OF_SCOPE         -> no job. A plain explanation plus what KEYFRAME can make
//                           and how — built from the live capability catalog. The
//                           request is NEVER rewritten into some other film.
//   DISALLOWED           -> no job. The deterministic tier-1 moderation rules, or the
//                           named content policy (sexually explicit, graphic gore,
//                           hateful) judged by the model under hard limits.
//
// ORDER OF DECISION — cheapest first, and no model call when code can decide:
//   1. tier-1 moderation            (prompt_moderation.js)          -> DISALLOWED
//   2. no prompt, but a source      (website / blog / reference)    -> SUPPORTED
//   3. empty or unmistakable nonsense                               -> NEEDS_CLARIFICATION
//   4. the model, under a hard wall-clock budget
//   5. model unavailable / over budget      -> SUPPORTED (fail-open), EXCEPT a request
//                                             that explicitly asks for a supplied photo to
//                                             be animated or for generated live-action
//                                             footage -> OUT_OF_SCOPE (asksForGeneratedImagery)
//
// WHY FAIL-OPEN. The gate runs on every submit. If the provider is down, refusing
// every request blocks every paying user to stop a few off-topic ones — the wrong
// trade. An out-of-scope request that slips through during an outage produces a
// wrong film; a gate that fails closed produces no films at all.
//
// WHERE FAIL-OPEN STOPS. That argument holds for requests KEYFRAME would merely make
// badly. It does not hold for requests KEYFRAME cannot make at all — animate this photo,
// generate footage of this person — where yes buys nothing and costs a render. Those are
// screened deterministically before step 5 says yes; see asksForGeneratedImagery.
//
// THE ONE CONTRACT: analyzeScope NEVER THROWS.

const fs = require("node:fs");
const path = require("node:path");
const { z } = require("zod");
const openrouter = require("./openrouter");
const moderation = require("./prompt_moderation");
const capabilities = require("./keyframe_capabilities");
const { extractFirstJsonObject: parseLenient } = require("./json_lenient");

const SYSTEM = fs.readFileSync(path.join(__dirname, "..", "prompts", "system_prompt_scope.md"), "utf8");

const SCHEMA_VERSION = 1;
const STATUSES = ["SUPPORTED", "NEEDS_CLARIFICATION", "OUT_OF_SCOPE", "DISALLOWED"];
// The model may now say all four — but DISALLOWED only under the content policy below.
const MODEL_STATUSES = ["SUPPORTED", "NEEDS_CLARIFICATION", "OUT_OF_SCOPE", "DISALLOWED"];

// THE CONTENT POLICY — the one content refusal a model is allowed to make.
//
// Tier-1 moderation (prompt_moderation.js) is deterministic and deliberately narrow: it
// refuses what word pairs can prove. Whether a request is sexually explicit, graphically
// gory or hateful is a judgement about MEANING that no word list can make without refusing
// sexual-health films, surgery explainers and anti-racism documentaries. So the scope
// model judges it — but inside hard walls, because a model free to say DISALLOWED could
// mass-refuse real work:
//
//   - only these named categories; any other DISALLOWED is downgraded to SUPPORTED;
//   - only at POLICY_MIN_CONFIDENCE or above; a hesitant policy refusal makes the video
//     (borderline is exactly where refusing wrongly is most likely);
//   - the refusal sentence is OURS, fixed per category. The model's reason is discarded,
//     so a refusal can never repeat explicit, gory or hateful detail back to the person.
//
// The policy was set by the product owner: sexually explicit content, graphic gore and
// hateful content are refused. Adding a category is one entry here plus the prompt.
const POLICY_CATEGORIES = {
  "sexual-explicit": "KEYFRAME doesn't make sexually explicit content.",
  "graphic-gore": "KEYFRAME doesn't make videos with graphic gore.",
  "hate": "KEYFRAME doesn't make content that attacks or demeans people for who they are.",
};
const POLICY_MIN_CONFIDENCE = 0.75;

function readPolicyCategory(v) {
  const key = str(v).trim().toLowerCase().replace(/[\s_]+/g, "-");
  return Object.prototype.hasOwnProperty.call(POLICY_CATEGORIES, key) ? key : null;
}

// Below this a refusal is a guess. A guessed refusal of a real video request is the
// failure this gate most needs to avoid, so it becomes one question instead.
const REFUSAL_MIN_CONFIDENCE = 0.6;

// Hard ceiling on the whole decision, retries and model fallback included. Past it
// the gate fails open. Overridable in config for slower providers.
//
// IT MUST BE BIGGER THAN THE CHAIN IT BOUNDS. At 15s it was not, and the arithmetic made
// the retry decorative: one scope call is capped at requestTimeoutByStage.scope (10s),
// openrouter backs off 1.5s before trying the same model again, so the primary alone
// needs 21.5s to exhaust itself before the fallback model is even reached. A first call
// that hung therefore consumed the entire budget and the gate fell through to yes having
// asked exactly once. Measured over 45 live scope calls: p50 4.2s, p90 7.4s, max 9.6s —
// so 20s buys a full first attempt, the backoff, and a second attempt wider than p95.
function budgetMs() {
  try {
    const c = require("../config");
    return Math.max(3000, Number(c.llm && c.llm.scopeBudgetMs) || 15000);
  } catch { return 15000; }
}

const GENERIC_QUESTION = "What would you like your video to be about?";
const NONSENSE_QUESTION = "I couldn't make sense of that yet — what would you like your video to be about?";
// The end of an exchange whose one question was answered without a subject. It leads the
// out-of-scope guidance, so the person is shown how to describe a video, not just told no.
const SUBJECTLESS_ANSWER_REASON = "Your answer still doesn't say what the video should be about.";

// What a model writes where the contract says null. None of it describes a film.
// (Text with no letters at all — "-", "?" — is rejected before this list is consulted.)
const PLACEHOLDER_INTENTS = new Set(["null", "none", "nil", "n/a", "na", "unclear", "unknown", "undefined",
  "unspecified", "not specified", "tbd"]);

// Lenient on purpose: the model's JSON is normalised by coerce(), which is where every
// rule lives. A strict enum here would turn a slightly-off label into a repair lap.
//
// `confidence` and `unsupportedParts` take the near-misses models actually send. They
// used to be z.number() and z.array(z.string()): a perfectly clear refusal written as
// "confidence": null, "confidence": "0.95" or "unsupportedParts": "write the email"
// failed the schema, spent a repair lap, failed it again the same way — and fell open
// to SUPPORTED. The one wrong thing a malformed-but-readable reply must not do is turn
// a coding request into a job; coerce() reads every one of these shapes safely.
const ScopeReply = z.object({
  status: z.string(),
  confidence: z.union([z.number(), z.string()]).nullable().optional(),
  requestedDeliverable: z.string().nullable().optional(),
  videoIntent: z.string().nullable().optional(),
  videoType: z.string().nullable().optional(),
  reason: z.string().nullable().optional(),
  clarificationQuestion: z.string().nullable().optional(),
  unsupportedParts: z.union([z.array(z.string()), z.string()]).nullable().optional(),
  // DISALLOWED only; read against POLICY_CATEGORIES, so anything else is ignored.
  policyCategory: z.string().nullable().optional(),
});

// Text from an untrusted value, WITHOUT ever invoking its toString. coerce() is the
// defensive layer and is called directly on anything: String() throws on a
// null-prototype object or a Symbol, and a plain object would otherwise reach a
// person's screen as "[object Object]". Only real scalars become text.
function str(v) {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}
const clip = (s, n) => str(s).replace(/\s+/g, " ").trim().slice(0, n);

// Does the model's videoIntent actually describe a video? Letters, and not a placeholder.
function describesVideo(v) {
  const t = clip(v, 300);
  return /\p{L}/u.test(t) && !PLACEHOLDER_INTENTS.has(t.toLowerCase().replace(/[.!?]+$/, ""));
}

// A short, safe rendering of an arbitrary value for a coercion note. JSON.stringify
// throws on a BigInt or a cycle, and a note must never be the thing that fails.
function label(v) {
  try {
    const j = JSON.stringify(v);
    return j === undefined ? `<${typeof v}>` : j.slice(0, 60);
  } catch { return `<${typeof v}>`; }
}

// 0..1 is the contract. A model answering on a percentage scale ("confidence": 45)
// used to be CLAMPED to 1 — an unsure refusal read as a certain one, the single
// direction this layer must never fail in. So 1 < n <= 100 is read as a percentage,
// and anything missing, unparseable or outside every range is "unsure" (0.5, below
// the refusal floor).
function readConfidence(v, notes) {
  const n = typeof v === "number" ? v : (typeof v === "string" && v.trim() ? Number(v) : NaN);
  if (!Number.isFinite(n)) return 0.5;
  if (n >= 0 && n <= 1) return n;
  if (n > 1 && n <= 100) {
    const pct = Math.round(n * 100) / 10000;
    notes.push(`confidence ${n} read as a percentage -> ${pct}`);
    return pct;
  }
  notes.push(`confidence ${n} out of range -> 0.5`);
  return 0.5;
}

// ---------------------------------------------------------------- deterministic checks

// THE NONSENSE CHECK DECIDES IN CODE, SO IT MAY ONLY DECIDE WHAT CANNOT BE LANGUAGE.
//
// Its verdict is not advisory. true skips the model and answers "I couldn't make sense of
// that" — and the same verdict decides, in mergeClarification below (used by both create
// routes), whether the person's answer REPLACES their original prompt. So a false positive
// does not merely cost a question: it silently deletes the person's subject from the job
// that gets stored, or — when they retype that subject as the answer — ends the exchange
// OUT_OF_SCOPE for a request KEYFRAME makes every day.
//
// The previous version guessed at pronounceability, and real input proved it wrong:
//   - "a word with no vowel is junk" refused acronyms: "HTTP vs HTTPS", "HTML vs XHTML",
//     "HTTP/2 vs HTTP/3";
//   - "seven consonants in a row is junk" refused German compounds, and German is a shipped
//     language: Rechtsschutzversicherung, Geschichtsschreibung, Durchschnitt,
//     Kunstschmiede, Deutschschweiz;
//   - tokenising with /[a-z]+/ cut "wünsch" into "w" + "nsch", so every umlaut manufactured
//     a vowel-less fragment: "Dr. Wünsch GmbH", "Höchst GmbH".
// There is no pronounceability rule that is right across eight languages, brand names and
// acronyms, and the model reads every one of them correctly for a fraction of a cent. So
// the only junk left is the kind no language produces:
//   - no letters at all (digits, punctuation, emoji);
//   - one character typed four or more times running ("aaaa", "zzzzzz");
//   - a token that is nothing but 4+ adjacent keys along one QWERTY row, forwards or
//     backwards ("asdfghjkl", "lkjh"). The WHOLE token, never a run inside a word: German
//     "Mehrwert" contains w-e-r-t. Other layouts are not listed — mash typed on AZERTY or
//     QWERTZ goes to the model, which is the safe direction to be wrong in.
// and the text must be ENTIRELY that junk. One real word anywhere and the model decides.
const KEY_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const ROW_RUNS = [...KEY_ROWS, ...KEY_ROWS.map((r) => [...r].reverse().join(""))];
// Shorter tokens are not judged at all: "vs", "Dr", "&", "a" say nothing either way.
const MIN_JUDGED_LETTERS = 3;
const MIN_JUNK_LETTERS = 4;

function isJunkToken(w) {
  if (w.length < MIN_JUNK_LETTERS) return false;
  if (/(.)\1{3,}/u.test(w)) return true;                 // "aaaa", "zzzzz"
  return ROW_RUNS.some((row) => row.includes(w));        // "asdfgh", "poiuy"
}

/**
 * True only when the text is unmistakably not language: no letters, or nothing but
 * repeated characters and keyboard-row mash. Anything else — however odd — goes to the
 * model. Text written mostly in a non-Latin script is never judged here: a Japanese
 * sentence is one unbroken letter run, and "すごーーーーい" is enthusiasm, not mash.
 */
function looksLikeNonsense(text) {
  // NFC first: a decomposed "u" + combining diaeresis must tokenise as the one letter a
  // person typed, not split a name the way the old ASCII tokeniser did.
  const s = String(text || "").normalize("NFC").trim();
  if (!s) return true;
  const letters = (s.match(/\p{L}/gu) || []).length;
  if (letters === 0) return true;                               // digits / punctuation / emoji only
  const latin = (s.match(/\p{Script=Latin}/gu) || []).length;  // ü, é, ß are Latin
  if (latin / letters < 0.6) return false;
  const judged = (s.toLowerCase().match(/[\p{L}\p{M}]+/gu) || []).filter((w) => w.length >= MIN_JUDGED_LETTERS);
  return judged.length > 0 && judged.every(isJunkToken);
}

// THE ONE THING THE FAIL-OPEN MAY STILL REFUSE.
//
// Step 5 hands every unjudged request to the pipeline, and that is the right default: a
// provider outage must not take the product down with it. But "fail open" was written as
// "say yes to everything", and one class of request makes that indefensible. KEYFRAME
// composes templates over stock media. It cannot generate footage, and it cannot take a
// photograph someone supplied and make its subject move. A request for that is not a film
// KEYFRAME renders badly — it is a film KEYFRAME cannot render at all, so accepting it
// spends real money to produce something nobody asked for. The Vifero corpus has five such
// requests in two weeks; four of them rendered, and one of those five is here only because
// the gate timed out and fell through to yes.
//
// So the degraded path screens for that ONE class before it says yes, and for nothing else.
// This is deliberately NOT the general scope test — whether a request is in scope is a
// judgement about meaning, which is why the model makes it and why no word list runs in
// front of it on the healthy path. This runs only where the model did not answer at all,
// and there the alternative is not a better judgement, it is a blind yes.
//
// PRECISION OVER RECALL, because a false positive here refuses a paying customer during an
// outage. Two things hold the precision:
//
//   1. NAMING A VIDEO STANDS THE WHOLE STILL-IMAGE FAMILY DOWN. Someone who writes "promo",
//      "explainer", "ad" or "video" is briefing a film, and a film may perfectly well be
//      built FROM photographs — product shots, listing photos, a team slideshow, an
//      animated title over a still. That is core KEYFRAME work. The requests this exists to
//      stop read as notes to an animator about a picture, and they never name a video at
//      all. This one guard removed every false positive the benign sweep found.
//   2. The uploadedImages flag is never a trigger. A logo upload is the most ordinary thing
//      in a promo, so what the REQUEST asks for has to carry the meaning, not what was
//      attached.
//
// Three languages, because the corpus is not English-only: the German and Spanish markers
// are here because real submitted requests used them.

// Fragments composed by .source, so every backslash means what it means in a regex and
// nothing has to survive a second round of string escaping.
const rx = (...parts) => new RegExp(parts.map((p) => (typeof p === "string" ? p : p.source)).join(""), "iu");

const IMAGE_NOUN = /(?:image|photo|photograph|picture|portrait|headshot|selfie|bild|foto|imagen|imágen)e?s?/;
const SUPPLIED = /(?:the|this|that|my|our|attached|uploaded|supplied|provided|given|dem|der|des|diesem|meinem|hochgeladenen|la|el|mi|adjunta|subida)/;
const PERSON = /(?:woman|man|person|character|guy|girl|boy|lady|model|subject|she|he|her|his|frau|mann|mädchen|junge|person|charakter|sie|er|ihre?|seine?|mujer|hombre|persona|chica|chico)/;
const ACTION = /(?:move|moving|walk|walking|turn|turning|blink|smile|smiling|wave|waving|run|running|raise|raising|touch|touching|reach|reaching|nod|nods|look|looks|lift|lifts|brush|brushes|gehen|geht|fahren|fährt|bewegen|bewegt|laufen|läuft|drehen|dreht|lächeln|lächelt|winken|winkt|greifen|greift|streichen|streicht|heben|hebt|mover|moverse|camina|caminar|girar|sonreír|saludar)/;
const DIRECTIVE = /(?:should|must|shall|needs?\s+to|has\s+to|have\s+to|soll|sollen|sollte|muss|müssen|debe|deben|debería)/;
const ANIMATE = /(?:animate|animates|animated|animating|animiere|animieren|animiert|animar|anima|bring(?:\s+\w+){1,4}\s+to\s+life|brought(?:\s+\w+){0,4}\s+to\s+life|come\s+alive|comes\s+alive|zum\s+leben\s+erwecken|dar\s+vida|make\s+(?:it|her|him|them|the\s+\w+)\s+(?:move|moving|walk|turn|blink|smile|wave))/;

// Naming any of these means a film is being briefed. See guard 1 above.
const VIDEO_NOUN = /\b(?:video|videos|film|films|movie|clip|clips|ad|ads|advert|advertisement|commercial|promo|explainer|trailer|reel|short|shorts|animation|spot|story|presentation|tutorial|demo|montage|intro|teaser|slideshow|showcase|werbung|werbespot|kurzfilm|kurzgeschichte|geschichte|anuncio|comercial|presentación|historia|video promocional)\b/iu;

const NEAR = /(?:\W+\w+){0,12}?\W+/;
const SUPPLIED_STILL = rx(/\b/, SUPPLIED, /\s+(?:\w+\s+){0,2}/, IMAGE_NOUN, /\b/);
const PERSON_ACTION = [
  rx(/\b/, PERSON, /\b/, NEAR, ACTION, /\b/),
  rx(/\b/, ACTION, /\b/, NEAR, PERSON, /\b/),
];
// The still named as the SOURCE of who appears on screen — "use the uploaded image as the
// starting appearance of the character" — which is the same request with the verb left out.
const STILL_AS_SUBJECT = rx(
  /\b(?:use|uses|used|using|from|based\s+on|starting\s+from)\s+/, SUPPLIED, /\s+(?:\w+\s+){0,2}/, IMAGE_NOUN, /\b/,
  NEAR, /\b(?:as|for|to)\b/, NEAR, /\b(?:character|person|subject|appearance|likeness|face|model|avatar)\b/
);

/**
 * A. A supplied still, and an instruction about what it should do — in a request that never
 * once names a video.
 */
function asksToAnimateAStill(s) {
  if (VIDEO_NOUN.test(s)) return false;
  if (!SUPPLIED_STILL.test(s)) return STILL_AS_SUBJECT.test(s);
  return ANIMATE.test(s)
    || PERSON_ACTION.some((re) => re.test(s))
    || rx(DIRECTIVE, /\b/, NEAR, ACTION, /\b/).test(s)
    || STILL_AS_SUBJECT.test(s);
}

// B. Generated live action. Each phrase is specific enough to stand on its own, so these
// hold even inside a long brief that does name a video.
const FOOTAGE_RULES = [
  rx(/\bphotorealistic\b(?:\W+\w+){0,4}?\W+\b(?:video|footage|shot|clip|render|scene)\b/),
  rx(/\b(?:video|footage|shot|clip|render|scene)\b(?:\W+\w+){0,4}?\W+\bphotorealistic\b/),
  rx(/\b(?:facial\s+identity|identity\s+mapping|facial\s+accuracy|face[-\s]?accurate|same\s+person\s+throughout|remain\s+the\s+same\s+person|preserve\s+(?:her|his|their)\s+face)\b/),
  rx(/\bcontinuation\s+of\s+the\s+same\b(?:\W+\w+){0,4}?\W+\bshot\b/),
  rx(/\b(?:ai[-\s]generated|ai\s+generated)\s+(?:footage|video|actor|avatar)\b/),
  rx(/\bdeep\s?fakes?\b/),
  rx(/\b(?:avatar|talking\s+head|digital\s+twin)\s+(?:of|from)\s+(?:me|myself|my\s+\w+|this|the)\b/),
];

// C. The shape that arrives with no image word at all: a short directive telling a person to
//    perform a physical action, in a request that never names a video. "Die frau soll mit
//    einer Hand durch Ihre Haare fahren" is not a brief for a film — it is a note to an
//    animator about a picture the sender believes we are already holding. Every condition is
//    required, and the word limit carries real weight: a genuine brief that directs someone
//    on camera ("our founder should smile as the logo lands") is long enough to also say
//    what it is.
const SHORT_DIRECTIVE_WORDS = 25;
function isSubjectDirection(s) {
  const words = (s.match(/[\p{L}\p{M}\p{N}]+/gu) || []).length;
  if (words === 0 || words > SHORT_DIRECTIVE_WORDS) return false;
  if (VIDEO_NOUN.test(s)) return false;
  return rx(/\b/, PERSON, /\b/, NEAR, DIRECTIVE, /\b/, NEAR, ACTION, /\b/).test(s)
    || rx(/\b/, PERSON, /\b/, NEAR, ACTION, /\b/, NEAR, DIRECTIVE, /\b/).test(s);
}

/**
 * The degraded path's one refusal. Returns a short reason when the request explicitly asks
 * KEYFRAME to animate a supplied still or to generate live-action footage, and null for
 * everything else — including everything it is merely unsure about.
 *
 * @param {string} text  the prompt, with any clarification answer already merged in
 * @returns {{reason: string, requestedDeliverable: string} | null}
 */
function asksForGeneratedImagery(text) {
  const s = String(text || "").normalize("NFC");
  if (!s.trim()) return null;
  if (asksToAnimateAStill(s) || isSubjectDirection(s)) {
    return {
      reason: "You asked for a picture to be animated so its subject moves, which needs AI image animation rather than a template-based video.",
      requestedDeliverable: "an animation made from a supplied photograph",
    };
  }
  if (FOOTAGE_RULES.some((re) => re.test(s))) {
    return {
      reason: "You asked for photorealistic generated footage of a specific person or scene, which needs an AI video generator rather than a template-based video.",
      requestedDeliverable: "generated live-action footage",
    };
  }
  return null;
}

// THE ANSWER TO THE ONE QUESTION JOINS THE PROMPT — before the gate reads it and before the
// job stores it — so every downstream stage (brief, script, the prompt the person sees
// beside our rewrite) works from what they actually meant, and nothing downstream has to
// learn that a second field exists.
//
// It REPLACES the original only when the original was unmistakable junk (looksLikeNonsense
// above): then the question was "what is this about?", the answer IS the request, and
// appending would hand the brief model keyboard mash as its opening line. Anything else is
// the person's own words and is KEPT, with the answer after it. Replacing on a guess is how
// "Rechtsschutzversicherung" + an answer used to become a job that never mentioned
// Rechtsschutzversicherung.
//
// It lives here, beside the check it depends on, rather than in a route: both create routes
// use it, and the offline gate tests exercise the real function instead of a hand-copied
// twin that could drift from it (the tests cannot require a route — routes load db.js).
function mergeClarification(prompt, clarification) {
  const original = String(prompt == null ? "" : prompt).trim();
  const answer = clarification && typeof clarification.answer === "string" ? clarification.answer.trim() : "";
  if (!answer) return original;
  return looksLikeNonsense(original) ? answer : `${original}\n\n${answer}`;
}

// ---------------------------------------------------------------- coercion

/**
 * Normalise a model reply into a decision every consumer can trust.
 * PURE. NEVER THROWS. Every rule fails toward making the person's video: no
 * coercion may turn an uncertain or malformed reply into a refusal — with ONE
 * exception, and it is not about scope: once the one question has been answered, a
 * model that still cannot say what to make (NEEDS_CLARIFICATION, no described video)
 * ends the exchange OUT_OF_SCOPE, because a job with no subject is not a video either.
 *
 * ctx: { clarificationGiven }
 * -> { scope (without userMessage/guidance/meta), coercions }
 *
 * NEVER THROWS is enforced, not hoped for. It used to throw on ctx === null (a default
 * parameter only covers undefined), on a BigInt or cyclic status (JSON.stringify in a
 * coercion note), on a Symbol confidence and on a null-prototype text field. The model
 * path is shielded by zod, but the contract is the function's, so every reader below is
 * safe and a last guard turns anything else into the fail-open answer.
 */
function coerce(raw, ctx) {
  try {
    return coerceReply(raw, ctx && typeof ctx === "object" ? ctx : {});
  } catch (e) {
    let why = "";
    try { why = clip(e && e.message, 80); } catch { /* a hostile error object */ }
    return {
      scope: {
        status: "SUPPORTED", confidence: 0, requestedDeliverable: null, videoIntent: null, videoType: null,
        reason: "KEYFRAME can make this video.", clarificationQuestion: null, unsupportedParts: [],
        policyCategory: null,
      },
      coercions: [`unreadable reply (${why || "unknown"}) -> SUPPORTED`],
    };
  }
}

function coerceReply(raw, ctx) {
  const c = [];
  const r = raw && typeof raw === "object" ? raw : {};

  let status = str(r.status).trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (!MODEL_STATUSES.includes(status)) {
    c.push(`unrecognised status ${label(r.status)} -> SUPPORTED`);
    status = "SUPPORTED";
  }

  const confidence = readConfidence(r.confidence, c);

  // CONTENT POLICY (see POLICY_CATEGORIES). Decided first and returned early: a policy
  // refusal is final, and nothing below — questions, sub-requests, a described video — may
  // soften it. Everything the model wrote besides the category is dropped.
  if (status === "DISALLOWED") {
    const policyCategory = readPolicyCategory(r.policyCategory);
    if (policyCategory && confidence >= POLICY_MIN_CONFIDENCE) {
      return {
        scope: {
          status: "DISALLOWED", confidence, requestedDeliverable: null, videoIntent: null, videoType: null,
          reason: POLICY_CATEGORIES[policyCategory], clarificationQuestion: null, unsupportedParts: [],
          policyCategory,
        },
        coercions: c,
      };
    }
    c.push(policyCategory
      ? `policy refusal (${policyCategory}) below ${POLICY_MIN_CONFIDENCE} confidence (${confidence}) -> SUPPORTED`
      : "model returned DISALLOWED without a content-policy category -> SUPPORTED (only tier-1 moderation and the named content policy may disallow)");
    status = "SUPPORTED";
  }
  let clarificationQuestion = clip(r.clarificationQuestion, 200) || null;
  let forcedReason = "";

  // A guessed refusal becomes one question — unless we already asked, in which case
  // the person answered and deserves their video rather than a second interrogation.
  //
  // This branch does NOT apply the subjectless-answer rule below, on purpose. A
  // low-confidence OUT_OF_SCOPE is the model guessing that the deliverable is not a video,
  // and the refusal floor exists so that a guess never refuses. The contract also has an
  // OUT_OF_SCOPE reply carry videoIntent: null, so demanding a described video here would
  // turn every hesitant refusal after an answer into a real one — "the quarterly report for
  // the board" answered to "what should the video be about?" would be refused as a document.
  if (status === "OUT_OF_SCOPE" && confidence < REFUSAL_MIN_CONFIDENCE) {
    if (ctx.clarificationGiven) {
      status = "SUPPORTED";
      c.push(`low-confidence refusal (${confidence}) after a clarification -> SUPPORTED`);
    } else {
      status = "NEEDS_CLARIFICATION";
      c.push(`low-confidence refusal (${confidence}) -> NEEDS_CLARIFICATION`);
    }
  }

  // AT MOST ONE QUESTION — but an answer that still names nothing is not a video either.
  //
  // This used to force every second question to SUPPORTED. So "idk", "whatever" or "just
  // make something" as the answer created a job with no subject, and the whole pipeline —
  // brief, script, stock search, narration, render — ran to produce a film about nothing.
  // The model saying NEEDS_CLARIFICATION after an answer is the model saying the answer did
  // not tell it what to make. It still may not ask again, so the exchange ends one of two
  // ways: SUPPORTED when the model nonetheless described the video it would make (the answer
  // carried a subject and the model was merely over-cautious), otherwise OUT_OF_SCOPE with
  // the how-to guidance — the same ending the code path gives an unreadable answer.
  if (status === "NEEDS_CLARIFICATION" && ctx.clarificationGiven) {
    clarificationQuestion = null;
    if (describesVideo(r.videoIntent)) {
      status = "SUPPORTED";
      c.push("second clarification request, but the model described the video -> SUPPORTED (at most one question per request)");
    } else {
      status = "OUT_OF_SCOPE";
      forcedReason = SUBJECTLESS_ANSWER_REASON;
      c.push("second clarification request with no described video -> OUT_OF_SCOPE (at most one question, and the answer named nothing to make)");
    }
  }
  if (status === "NEEDS_CLARIFICATION" && !clarificationQuestion) {
    clarificationQuestion = GENERIC_QUESTION;
    c.push("clarification with no question -> generic question");
  }

  // Video type must name a kind the catalog actually lists, or it is dropped.
  let videoType = clip(r.videoType, 80) || null;
  if (videoType) {
    const kinds = capabilities.catalog().videoTypes;
    const hit = kinds.find((k) => k.label.toLowerCase() === videoType.toLowerCase() || k.key === videoType.toLowerCase());
    if (!hit) { c.push(`videoType ${JSON.stringify(videoType)} not in the catalog -> null`); videoType = null; }
    else videoType = hit.label;
  }

  const requestedDeliverable = clip(r.requestedDeliverable, 140) || null;
  // The model's own reason was written for a question it is no longer allowed to ask.
  let reason = forcedReason || clip(r.reason, 300);
  let videoIntent = clip(r.videoIntent, 300) || null;
  // A lone string is one sub-request, not a malformed list (see ScopeReply).
  const partsIn = typeof r.unsupportedParts === "string" ? [r.unsupportedParts]
    : Array.isArray(r.unsupportedParts) ? r.unsupportedParts : [];
  let unsupportedParts = partsIn.map((p) => clip(p, 140)).filter(Boolean).slice(0, 3);

  if (status === "OUT_OF_SCOPE") {
    // The response explains and stops. It never carries a rewritten film.
    videoIntent = null; videoType = null; unsupportedParts = []; clarificationQuestion = null;
    if (!reason) {
      reason = requestedDeliverable
        ? `You asked for ${requestedDeliverable}, which isn't a video.`
        : "This request isn't for a video.";
      c.push("refusal with no reason -> reason built from the deliverable");
    }
  }
  if (status === "SUPPORTED") {
    clarificationQuestion = null;
    if (!reason) reason = "KEYFRAME can make this video.";
  }
  if (status === "NEEDS_CLARIFICATION") {
    videoIntent = null; videoType = null; unsupportedParts = [];
    if (!reason) reason = "Your request doesn't say what the video should be about yet.";
  }

  return {
    scope: { status, confidence, requestedDeliverable, videoIntent, videoType, reason, clarificationQuestion, unsupportedParts,
      policyCategory: null },
    coercions: c,
  };
}

// ---------------------------------------------------------------- assembly

// Sentences are joined into one message below. A model reason without its full stop, or
// a sub-request that already ends in one, used to read "…your bakery KEYFRAME will…"
// and "…the newsletter.." on the person's screen.
const asSentence = (t) => { const x = String(t || "").trim(); return !x || /[.!?]$/.test(x) ? x : `${x}.`; };
const asFragment = (t) => String(t || "").trim().replace(/[\s.;,:]+$/, "");

// `surface` is where the request came from (keyframe_capabilities SURFACES), so the
// "To create a video" steps describe the inputs THAT endpoint accepts.
function finish(base, { via, ms, usage, coercions, surface }) {
  const s = { v: SCHEMA_VERSION, ...base };
  s.isSupported = s.status === "SUPPORTED";
  s.guidance = s.status === "OUT_OF_SCOPE" ? capabilities.outOfScopeGuidance({ reason: s.reason, surface }) : null;
  s.userMessage = s.status === "OUT_OF_SCOPE" ? capabilities.guidanceText(s.guidance)
    : s.status === "NEEDS_CLARIFICATION" ? `${asSentence(s.reason)} ${s.clarificationQuestion}`.trim()
      : s.status === "DISALLOWED" ? s.reason
        : s.unsupportedParts.length
          ? `${asSentence(s.reason)} KEYFRAME will make the video, but won't: ${s.unsupportedParts.map(asFragment).join("; ")}.`
          : s.reason;
  s.via = via;
  s.ms = ms;
  s.usage = usage || { tokensIn: 0, tokensOut: 0, costUsd: null };
  s.coercions = coercions || [];
  return s;
}

function decided(status, fields, meta) {
  return finish({
    status,
    confidence: fields.confidence == null ? 1 : fields.confidence,
    requestedDeliverable: fields.requestedDeliverable || null,
    videoIntent: fields.videoIntent || null,
    videoType: fields.videoType || null,
    reason: fields.reason || "",
    clarificationQuestion: fields.clarificationQuestion || null,
    unsupportedParts: fields.unsupportedParts || [],
    policyCategory: fields.policyCategory || null,
  }, meta);
}

// The budget is a HARD ceiling, so the gate stops waiting the moment the signal fires
// rather than whenever the transport next looks. openrouter honours the signal on the
// wire, but its retry backoff (up to 3s) sleeps without watching it, and an injected
// transport may not watch it at all — either way the create request, which holds the
// daily-cap window open for as long as this awaits, overran the budget it was promised.
// Promise.race subscribes to the losing promise too, so a transport that rejects after
// the gate has moved on is a handled rejection, never a process-level one.
function untilAborted(work, sig) {
  if (sig.aborted) return Promise.reject(sig.reason || new Error("aborted"));
  let onAbort;
  const stop = new Promise((_, reject) => {
    onAbort = () => reject(sig.reason || new Error("aborted"));
    sig.addEventListener("abort", onAbort, { once: true });
  });
  return Promise.race([work, stop]).finally(() => sig.removeEventListener("abort", onAbort));
}

function normaliseClarification(c) {
  if (!c || typeof c !== "object") return null;
  const question = clip(c.question, 300);
  const answer = clip(c.answer, 1000);
  return answer ? { question, answer } : null;
}

/**
 * Decide whether a request is something KEYFRAME can make.
 *
 * @param {object}  o
 * @param {string} [o.prompt]
 * @param {object} [o.sources]        { websiteUrl, blogUrl, referenceVideo, uploadedImages } — truthy flags
 * @param {object} [o.preferences]
 * @param {object} [o.clarification]  { question, answer } from a previous NEEDS_CLARIFICATION round
 * @param {string} [o.surface]         "create-screen" (default) | "api-generate" — which
 *                                     endpoint's steps an out-of-scope answer describes
 * @param {AbortSignal} [o.signal]     e.g. the HTTP request closing
 * @param {Function} [o.chat]          injectable transport, for tests
 * @returns {Promise<{scope}>}         never rejects
 */
async function analyzeScope({ prompt, sources, preferences, clarification, surface, signal, chat } = {}) {
  const t0 = Date.now();
  const text = String(prompt == null ? "" : prompt).trim();
  const src = sources || {};
  const hasSource = !!(src.websiteUrl || src.blogUrl || src.referenceVideo);
  const clar = normaliseClarification(clarification);
  const ms = () => Date.now() - t0;
  // Every decision below carries the surface to finish(), whichever path reaches it.
  const on = (status, fields, meta) => decided(status, fields, { ...meta, surface });

  try {
    // 1. Tier-1 moderation. Free, and the only DETERMINISTIC path to DISALLOWED (the model
    //    may also refuse, but only under the named content policy — see coerceReply).
    //
    // EACH DISTINCT TEXT ON ITS OWN, never joined. The create routes merge the answer INTO
    // the prompt before calling the gate (mergeClarification), so `text` normally already
    // ends with the answer. Joining it to the answer again put the answer's last words
    // directly in front of its own first words — and tier 1 is co-occurrence inside a short
    // window, so it matched across that seam. A security-awareness answer that opened
    // "…banking passwords" and closed "a guide to phishing" read, at the seam, as a guide to
    // phishing for passwords, and a legitimate training film was refused as fraud. The
    // answer is still screened by itself because a direct caller may pass it beside a prompt
    // that does not contain it; when the answer replaced the prompt the two are one text.
    let mod = { tier1: null, hints: [] };
    for (const piece of new Set([text, clar && clar.answer].filter(Boolean))) {
      try { mod = moderation.screen(piece); } catch { /* fail-open */ }
      if (mod && mod.tier1) break;
    }
    if (mod && mod.tier1) {
      return { scope: on("DISALLOWED", { reason: mod.tier1.reason, policyCategory: mod.tier1.category }, { via: "moderation", ms: ms() }) };
    }

    // 2. A website, article or reference film with no prompt is a video request by
    //    construction — there is nothing for a model to judge.
    if (!text && hasSource) {
      return { scope: on("SUPPORTED", {
        reason: "KEYFRAME can make a video from the source you provided.",
        requestedDeliverable: "a video made from the supplied source",
      }, { via: "input-mode", ms: ms() }) };
    }

    // 3. Nothing to go on.
    if (!text) {
      return { scope: on("NEEDS_CLARIFICATION", {
        reason: "There's no description of the video yet.",
        clarificationQuestion: GENERIC_QUESTION,
      }, { via: "heuristic", ms: ms() }) };
    }
    if (!hasSource && looksLikeNonsense(text) && !(clar && !looksLikeNonsense(clar.answer))) {
      // AT MOST ONE QUESTION, on this path too. coerce() enforces it for the model, but
      // this branch decides in code before coerce() ever runs — so an unreadable answer
      // to the unreadable-prompt question used to get the same question a second time,
      // and a third, for as long as the person kept typing. Once a question has been
      // answered the exchange ends: there is still nothing to make, so the person gets
      // the one thing that actually helps — what KEYFRAME makes and how to describe it.
      if (clar) {
        return { scope: on("OUT_OF_SCOPE", {
          reason: "Your prompt and your answer don't describe a video KEYFRAME can make yet.",
          requestedDeliverable: "unclear",
        }, { via: "heuristic", ms: ms() }) };
      }
      return { scope: on("NEEDS_CLARIFICATION", {
        reason: "That doesn't read as a description of a video yet.",
        clarificationQuestion: NONSENSE_QUESTION,
      }, { via: "heuristic", ms: ms() }) };
    }

    // 4. The model, under one hard wall-clock budget. The signal reaches openrouter,
    //    which stops retrying and stops escalating to a fallback model once it fires.
    const budget = new AbortController();
    const timer = setTimeout(() => budget.abort(new Error("scope analysis over budget")), budgetMs());
    const sig = signal ? AbortSignal.any([signal, budget.signal]) : budget.signal;
    const send = chat || openrouter.chat;

    const user = JSON.stringify({
      prompt: text,
      sources: {
        websiteUrl: !!src.websiteUrl, blogUrl: !!src.blogUrl,
        referenceVideo: !!src.referenceVideo, uploadedImages: !!src.uploadedImages,
      },
      preferences: preferences && typeof preferences === "object" ? preferences : {},
      ...(clar ? { clarification: clar } : {}),
      capabilities: capabilities.forModel(),
    }, null, 2);

    let tokensIn = 0, tokensOut = 0, costUsd = null;
    let lastErr = "";
    try {
      for (let attempt = 1; attempt <= 2; attempt++) {
        if (sig.aborted) break;
        let res;
        try {
          res = await untilAborted(send({
            system: SYSTEM,
            user: attempt === 1 ? user : `${user}\n\nYour previous reply was not valid JSON in the required shape (${lastErr}). Return ONLY the JSON object.`,
            jsonMode: true,
            stage: "scope",
            // A gate should give the same answer twice. An explicit temperature always
            // wins over config (openrouter.js), so it is pinned here.
            temperature: 0.1,
            signal: sig,
          }), sig);
        } catch (e) {
          lastErr = String(e && e.message).slice(0, 160);
          break; // transport failure or budget: openrouter already retried; fail open below
        }
        tokensIn += res.tokensIn || 0;
        tokensOut += res.tokensOut || 0;
        if (typeof res.costUsd === "number") costUsd = (costUsd || 0) + res.costUsd;
        try {
          const parsed = ScopeReply.parse(parseLenient(res.text));
          const { scope, coercions } = coerce(parsed, { clarificationGiven: !!clar });
          return { scope: finish(scope, { via: `model (attempt ${attempt})`, ms: ms(), usage: { tokensIn, tokensOut, costUsd }, coercions, surface }) };
        } catch (e) {
          lastErr = e && e.issues ? "schema mismatch" : String(e && e.message).slice(0, 120);
        }
      }
    } finally {
      clearTimeout(timer);
    }

    // 5. Fail open.
    if (signal && signal.aborted) {
      // The client went away; the caller will not use this, but it must still be valid.
      return { scope: on("SUPPORTED", { confidence: 0, reason: "Scope analysis was cancelled." }, { via: "cancelled", ms: ms() }) };
    }
    // The model did not answer. Everything still goes through EXCEPT the one class of
    // request KEYFRAME structurally cannot render — see asksForGeneratedImagery above.
    const impossible = asksForGeneratedImagery(text);
    if (impossible) {
      return { scope: on("OUT_OF_SCOPE", impossible,
        { via: `fallback-refused (${lastErr || "no usable reply"})`, ms: ms(), usage: { tokensIn, tokensOut, costUsd } }) };
    }
    return { scope: on("SUPPORTED", {
      confidence: 0,
      reason: "KEYFRAME will make this video.",
    }, { via: `fallback (${lastErr || "no usable reply"})`, ms: ms(), usage: { tokensIn, tokensOut, costUsd } }) };
  } catch (e) {
    return { scope: on("SUPPORTED", { confidence: 0, reason: "KEYFRAME will make this video." },
      { via: `fallback (unexpected: ${String(e && e.message).slice(0, 80)})`, ms: ms() }) };
  }
}

/**
 * What the create routes return to a client. No usage, no coercion trail — those
 * are for the log and the job record.
 */
function forClient(s) {
  if (!s) return null;
  return {
    status: s.status,
    isSupported: s.isSupported,
    confidence: s.confidence,
    reason: s.reason,
    userMessage: s.userMessage,
    requestedDeliverable: s.requestedDeliverable,
    videoIntent: s.videoIntent,
    videoType: s.videoType,
    clarificationQuestion: s.clarificationQuestion,
    unsupportedParts: s.unsupportedParts,
    guidance: s.guidance,
  };
}

/** What is stored on the job for audit: the decision, how it was reached, what it cost. */
function reduce(s) {
  if (!s) return null;
  return {
    v: s.v, status: s.status, confidence: s.confidence,
    requestedDeliverable: s.requestedDeliverable, videoIntent: s.videoIntent, videoType: s.videoType,
    reason: s.reason, unsupportedParts: s.unsupportedParts, policyCategory: s.policyCategory || null,
    via: s.via, ms: s.ms, usage: s.usage, coercions: s.coercions,
  };
}

/** One structured log line per decision, so "why was this refused?" is answerable. */
function logDecision(s, extra = {}) {
  try {
    const logger = require("./logger").child({ tag: "scope" });
    const line = {
      status: s.status, confidence: s.confidence, via: s.via, ms: s.ms,
      deliverable: s.requestedDeliverable, videoType: s.videoType,
      policyCategory: s.policyCategory || undefined,
      unsupportedParts: s.unsupportedParts.length || undefined,
      coercions: s.coercions.length ? s.coercions : undefined,
      ...extra,
    };
    (s.status === "SUPPORTED" ? logger.info : logger.warn)(`scope ${s.status}`, line);
  } catch { /* logging must never fail a request */ }
}

module.exports = {
  analyzeScope, coerce, forClient, reduce, logDecision, looksLikeNonsense, mergeClarification,
  asksForGeneratedImagery,
  SCHEMA_VERSION, STATUSES, MODEL_STATUSES, REFUSAL_MIN_CONFIDENCE, POLICY_CATEGORIES, POLICY_MIN_CONFIDENCE,
};
