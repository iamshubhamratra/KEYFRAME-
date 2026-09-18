// PROMPT MODERATION — deterministic, no network, no LLM, never throws.
//
// WHY TWO TIERS. A single-word term list is unappealable and demonstrably wrong on
// real work: "breast cancer awareness explainer", "suicide prevention hotline PSA",
// "preventing gun violence in schools" and "tobacco cessation programme" are all
// films someone is paying for. Substring matching adds the Scunthorpe class
// outright — "analysis" contains "anal", "therapist" contains "rapist". And
// "preventing gun violence" and "how to commit gun violence" share every keyword;
// only STANCE separates them, and stance is exactly what a matcher cannot see.
//
// So this module does the one job a matcher can do honestly:
//
//   TIER 1 — the only thing that stops a request. A handful of rules, each
//   requiring the CO-OCCURRENCE of two term classes inside a short window, matched
//   on whole-word boundaries. Never a bare single word. It runs at the route,
//   before a job row or a token of LLM spend exists, and it is the ONLY path to
//   classification DISALLOWED.
//
//   TIER 2 — everything else. `hints` are handed to the analysis model as EVIDENCE
//   ABOUT WORDING, never as a verdict; the model judges stance and returns
//   safety.verdict. A prevention/awareness/education framing is a legitimate film.
//
// FAIL-OPEN IS MANDATORY. If the analysis LLM fails and tier 1 did not fire, the
// verdict is `allow`. One provider outage must never mass-block every job.

// Word tokens with their character spans. Unicode-aware so non-Latin scripts are
// tokenised rather than swallowed whole — the product ships 8 caption languages.
function tokenize(text) {
  const out = [];
  const re = /[\p{L}\p{N}][\p{L}\p{N}'-]*/gu;
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push({ word: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length });
    if (out.length >= 4000) break; // bound the work on a 4000-char prompt
  }
  return out;
}

const cls = (...words) => new Set(words);

const MINOR = cls("child", "children", "kid", "kids", "minor", "minors", "toddler",
  "infant", "preteen", "preteens", "underage", "schoolgirl", "schoolboy");

// PRODUCED SEXUAL MEDIA only — not anatomy, not orientation, not crime names.
//
// The distinction is load-bearing. Words that name a CRIME ("molestation", "rape",
// "abuse") are exactly the words a safeguarding charity, a school training film or
// a journalism piece uses, so pairing them with a minor term blocks real customers:
// "child molestation prevention seminar" is a film someone needs made. Words that
// name produced sexual MEDIA have no such innocent reading beside a minor term.
// Crime names still reach the model as tier-2 hints, where stance can be judged.
// Likewise "sexual" is absent: "sexual health clinic explainer" is ordinary work.
const SEXUAL_ACT = cls("porn", "pornographic", "pornography", "erotic", "erotica",
  "nude", "nudes", "naked", "fetish", "incest", "xxx");

// WHY THESE LISTS ARE SHORT. Tier 1 is a HARD refusal with no model and no appeal, so
// every word here is a word that, beside its partner class, has no ordinary reading. An
// earlier version carried everyday verbs and dual-use nouns, and refused real work: a
// clinic's "radiological imaging" promo, "how nuclear plants produce electricity from
// uranium", a Lincoln-assassination history lesson. Removed for that reason: produce,
// obtain, acquire, enrich (verbs every brief uses); radiological, uranium, plutonium,
// smallpox (energy, medicine, public-health history); and the NOUN forms assassination,
// bombing, beheading (how history is written). Stance on anything left out is the scope
// model's to judge — see prompt_scope.js.
const SYNTH_VERB = cls("synthesize", "synthesise", "synthesizing", "synthesising",
  "manufacture", "manufacturing", "weaponize", "weaponise", "weaponizing", "weaponising");

const MASS_AGENT = cls("sarin", "vx", "novichok", "anthrax", "ricin", "botulinum",
  "tabun", "soman", "mustard-gas", "nerve-agent", "bioweapon", "bioweapons",
  "chemical-weapon", "dirty-bomb");

const ATTACK_VERB = cls("assassinate", "assassinating", "murder", "murdering",
  "bomb", "massacre", "lynch", "behead");

// Real, identifiable human targets and soft civilian targets. NOT commercial nouns:
// "kill your churn" and "assassinate your competition" must pass untouched.
const HUMAN_TARGET = cls("president", "prime-minister", "senator", "congressman",
  "congresswoman", "governor", "mayor", "judge", "journalist", "activist",
  "school", "schools", "classroom", "hospital", "church", "mosque", "synagogue",
  "temple", "crowd", "worshippers", "commuters", "civilians");

const HARVEST_VERB = cls("steal", "stealing", "harvest", "harvesting", "phish",
  "phishing", "skim", "skimming", "exfiltrate", "exfiltrating", "keylog", "keylogging");

const CREDENTIAL = cls("password", "passwords", "credential", "credentials",
  "credit-card", "cvv", "ssn", "seed-phrase", "private-key", "otp");

const SOLICIT = cls("csam", "loli", "shota", "jailbait");

// Each rule needs BOTH classes inside `window` tokens. The structural invariant —
// every rule has a non-empty `a` AND `b` — is asserted by the test file, so no
// future edit can quietly introduce a single-word block.
// A request for HOW. Three of the rules below only refuse when the text asks to be shown
// how to do the thing — word co-occurrence alone is what a documentary, a news explainer
// or a history lesson looks like.
const INSTRUCTIONAL_FRAME = /\b(how to|how do i|step[\s-]by[\s-]step|steps to|instructions?|recipe|guide to|at home|home lab|diy|homemade|teach me|show me how|help me|plan to|planning to|i want to|i will|let'?s|we should)\b/;

// A request to recognise, prevent or remember. It exempts the violence and credential rules:
// "phishing awareness training: how to spot attempts to steal passwords" asks for HOW and
// names both classes, and is exactly the film a security team commissions. It deliberately
// does NOT exempt the mass-casualty rule, where no framing makes instructions acceptable.
const PROTECTIVE_FRAME = /\b(awareness|prevent|prevention|preventing|protect|protecting|protection|defend|defending|defen[cs]e|spot|spotting|detect|detecting|detection|recogni[sz]e|recogni[sz]ing|training|drills?|safety|security|scams?|warning|history|historical|documentary|explainer|memorial|remembrance|lesson)\b/;

// Each rule needs BOTH classes inside `window` tokens — a verb-object distance, not a
// sentence. The structural invariant (every rule has a non-empty `a` AND `b`) is asserted
// by the test file, so no future edit can quietly introduce a single-word block.
//
//   needsFrame        refuse only when the text asks for instructions (INSTRUCTIONAL_FRAME)
//   protectiveExempt  never refuse when the text is about recognising or preventing it
//
// The child-safety rules need neither: produced sexual media involving a minor has no
// framing that makes it a film KEYFRAME could make.
const TIER1_RULES = [
  { id: "minor-sexual", category: "child-safety", a: MINOR, b: SEXUAL_ACT, window: 12,
    needsFrame: false, protectiveExempt: false,
    reason: "This request appears to sexualise a minor, which KEYFRAME cannot produce under any framing." },
  { id: "csam-solicitation", category: "child-safety", a: SOLICIT, b: SEXUAL_ACT, window: 12,
    needsFrame: false, protectiveExempt: false,
    reason: "This request appears to seek sexual content involving minors, which KEYFRAME cannot produce." },
  { id: "mass-casualty-synthesis", category: "mass-casualty", a: SYNTH_VERB, b: MASS_AGENT, window: 3,
    needsFrame: true, protectiveExempt: false,
    reason: "This request asks for instructions to produce a weapon capable of mass casualties." },
  { id: "targeted-violence", category: "targeted-violence", a: ATTACK_VERB, b: HUMAN_TARGET, window: 3,
    needsFrame: true, protectiveExempt: true,
    reason: "This request appears to call for violence against real people." },
  { id: "credential-harvesting", category: "fraud", a: HARVEST_VERB, b: CREDENTIAL, window: 4,
    needsFrame: true, protectiveExempt: true,
    reason: "This request appears to ask for material that would help steal credentials or payment details." },
];

// Words worth telling the model about so it can judge STANCE. Never a verdict:
// "suicide prevention" and "how to suicide" both surface `suicide` here, and the
// model is the thing that can tell them apart.
const HINT_TERMS = {
  suicide: "self-harm", overdose: "self-harm",
  gun: "weapons", guns: "weapons", firearm: "weapons", firearms: "weapons",
  ammunition: "weapons", explosive: "weapons", explosives: "weapons",
  cocaine: "drugs", heroin: "drugs", meth: "drugs", methamphetamine: "drugs",
  fentanyl: "drugs", opioid: "drugs", opioids: "drugs",
  gambling: "regulated", casino: "regulated", betting: "regulated",
  vape: "regulated", vaping: "regulated", tobacco: "regulated", cigarette: "regulated",
  hack: "security", hacking: "security", malware: "security", ransomware: "security",
  exploit: "security", ddos: "security", botnet: "security",
  violence: "violence", violent: "violence", terrorist: "violence", terrorism: "violence",
  extremist: "violence", genocide: "violence", holocaust: "sensitive-history",
  abortion: "sensitive-civic", vaccine: "sensitive-civic", election: "sensitive-civic",
  immigration: "sensitive-civic",
};

// Hyphenated concepts above ("nerve-agent", "credit-card") also match as two
// adjacent words, so the class stays readable and the prompt can be written either way.
function hasIn(set, tok, nextTok) {
  if (set.has(tok.word)) return true;
  if (nextTok && set.has(`${tok.word}-${nextTok.word}`)) return true;
  return false;
}

/**
 * Screen a prompt. NEVER throws, NEVER returns a classification.
 * -> { tier1: null | {rule, category, reason}, hints: [{term, category, span}] }
 */
function screen(text) {
  const empty = { tier1: null, hints: [] };
  let s;
  try { s = String(text == null ? "" : text); } catch { return empty; }
  if (!s.trim()) return empty;

  let toks;
  try { toks = tokenize(s); } catch { return empty; }
  if (!toks.length) return empty;

  // Frames are read once, over the whole text: a request for instructions or a protective
  // purpose is a property of the request, not of the matched pair's neighbourhood.
  const low = s.toLowerCase();
  const instructional = INSTRUCTIONAL_FRAME.test(low);
  const protective = PROTECTIVE_FRAME.test(low);

  for (const rule of TIER1_RULES) {
    if (rule.needsFrame && !instructional) continue;
    if (rule.protectiveExempt && protective) continue;
    const aAt = [], bAt = [];
    for (let i = 0; i < toks.length; i++) {
      const nxt = toks[i + 1];
      if (hasIn(rule.a, toks[i], nxt)) aAt.push(i);
      if (hasIn(rule.b, toks[i], nxt)) bAt.push(i);
    }
    if (!aAt.length || !bAt.length) continue;
    for (const i of aAt) {
      for (const j of bAt) {
        // The reason never echoes the matched text back at the user.
        if (Math.abs(i - j) <= rule.window) {
          return { tier1: { rule: rule.id, category: rule.category, reason: rule.reason }, hints: [] };
        }
      }
    }
  }

  const hints = [];
  const seen = new Set();
  for (const t of toks) {
    const cat = HINT_TERMS[t.word];
    if (!cat || seen.has(t.word)) continue;
    seen.add(t.word);
    hints.push({ term: t.word, category: cat, span: [t.start, t.end] });
    if (hints.length >= 12) break;
  }
  return { tier1: null, hints };
}

module.exports = { screen, TIER1_RULES, HINT_TERMS };
