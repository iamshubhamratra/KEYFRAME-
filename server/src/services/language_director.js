// LANGUAGE DIRECTOR — the single authority for every language decision in the film.
//
// A Tier-1 director (peer of the Creative / Art / Audio / Visual-Layout directors), but
// DETERMINISTIC (no LLM, zero latency) so it can run at INTAKE, before the brief/script.
// It resolves ONE canonical `languagePlan` — the three axes (voiceover · captions ·
// on-screen video-text), the script font + text direction, the layout expansion factor,
// the do-not-translate glossary, and a localization-aware authoring directive — then that
// plan is PERSISTED and every downstream stage reads it. This ends the old split where the
// caption config was independently re-normalized in three places (resolveCaptionPlan, the
// frame selector, and the legacy production pipeline) and language had zero influence on
// script generation.
//
// It does NOT reimplement resolution or translation: it REUSES the battle-tested engines —
// caption_director.normalizeConfig (the 3-axis + "auto" resolution), caption_director.modeFor,
// caption_lang (names/dir/font/expansion), and caption_fonts (the actual @font-face family).
// The heavy per-scene translation still runs later in caption_director/translate under this
// plan's authority (they consume its resolved codes + glossary).

const captionDirector = require("./caption_director");
const captionLang = require("./caption_lang");
const captionFonts = require("../fonts/caption_fonts");

const SOURCE = captionLang.SOURCE_LANG; // "en"

// Terms that must NEVER be translated — kept verbatim in Latin so a Hindi/Arabic film still
// says "API", "Stripe", "SaaS". translate.js keeps a term only when it actually appears in a
// line, so a broad list is safe (it never forces a word that isn't there). This is a superset
// of the old caption_director.buildTranslateContext seed (site title + gated subject).
const TECH_TERMS = [
  "API", "REST API", "REST", "GraphQL", "CRM", "ERP", "SDK", "AI", "ML", "LLM", "GPT",
  "SaaS", "PaaS", "IaaS", "UI", "UX", "URL", "SEO", "SEM", "CTA", "B2B", "B2C", "SQL",
  "NoSQL", "HTML", "CSS", "OAuth", "SSO", "2FA", "MFA", "KPI", "ROI", "MVP", "SLA",
  "CDN", "DNS", "VPN", "IoT", "AR", "VR", "NFT", "QR code", "PDF", "CSV", "JSON", "API key",
];
const BRANDS = [
  "OpenAI", "ChatGPT", "Claude", "Gemini", "Anthropic", "Duolingo", "Stripe", "Notion",
  "Figma", "Slack", "Shopify", "Salesforce", "HubSpot", "Google", "Apple", "Microsoft",
  "Amazon", "Netflix", "Spotify", "Uber", "Airbnb", "PayPal", "Zoom", "GitHub", "GitLab",
  "Canva", "WhatsApp", "Instagram", "Facebook", "YouTube", "LinkedIn", "TikTok", "Snapchat",
  "Pinterest", "Reddit", "Discord", "Twitch", "Dropbox", "Trello", "Asana", "Jira", "Zapier",
  "Airtable", "Webflow", "Wix", "Squarespace", "WordPress", "Mailchimp", "Twilio", "Cloudflare",
  "AWS", "Azure", "Vercel",
];

// The do-not-translate glossary for THIS film: the fixed brand/tech set + the site title +
// the subject (only when it reads like a brand name — an ASCII, no-exotic-chars token; a
// common-noun subject like "golden retriever dog" is left OUT so it still translates).
function buildGlossary({ job, brief } = {}) {
  const out = [...TECH_TERMS, ...BRANDS];
  const title = job && job.website_title ? String(job.website_title).trim() : "";
  if (title) out.push(title);
  const subj = brief && brief.subject ? String(brief.subject) : "";
  if (subj && /^[A-Za-z0-9 .\-&]+$/.test(subj)) out.push(subj.trim());
  return [...new Set(out.filter(Boolean))];
}

// The localization-aware authoring directive fed to the script model. NULL for an English
// film (so English authoring is byte-identical). We author in English (asset search + subject
// anchoring need English queries) but tell the model to write copy that TRANSLATES CLEANLY.
function scriptDirectiveFor(plan) {
  const targets = [plan.videoTextLanguage, plan.voiceLanguage].filter((l) => l && l !== SOURCE);
  if (!targets.length) return null;
  const name = plan.names.videoText !== "English (US)" ? plan.names.videoText : plan.names.voice;
  return (
    `LOCALIZATION TARGET: ${name}. This film will be delivered in ${name}, so author the English ` +
    `voiceover and on-screen copy to TRANSLATE CLEANLY into ${name}: prefer plain, literal phrasing ` +
    `over idioms, puns, rhymes, or cultural wordplay that won't survive translation; keep on-screen ` +
    `text SHORT and punchy (translated ${name} text often renders wider/taller, so long headlines ` +
    `overflow); keep brand names, product names, and technical acronyms (API, SDK, AI, SaaS, URL, …) ` +
    `in Latin. Write in ENGLISH — the pipeline localizes it downstream; do NOT write in ${name}.`
  );
}

// Consistency guarantee: the "auto" rules (normalizeConfig) make on-screen text FOLLOW the
// voiceover, so a localized film's text is never accidentally left English. The only way to
// get mixed languages (e.g. Hindi voice + English text) is to EXPLICITLY force it — which we
// record here so it can be disclosed rather than silently shipped.
function buildConsistency(cfg) {
  const notes = [];
  if (cfg.voiceoverLanguage !== SOURCE && cfg.videoTextLanguage === SOURCE) {
    notes.push(`Voiceover is "${cfg.voiceoverLanguage}" but on-screen text is English (explicit override) — the film will mix languages.`);
  }
  if (cfg.language !== SOURCE && cfg.voiceoverLanguage !== SOURCE && cfg.language !== cfg.voiceoverLanguage) {
    notes.push(`Subtitles ("${cfg.language}") differ from the voiceover ("${cfg.voiceoverLanguage}") — dubbed mode.`);
  }
  const localized = [cfg.voiceoverLanguage, cfg.language, cfg.videoTextLanguage].some((l) => l && l !== SOURCE);
  return { synced: notes.length === 0, localized, notes };
}

// resolveLanguagePlan({ job, brief? }) → the canonical languagePlan. Deterministic; never
// throws for supported input (normalizeConfig fully defaults). This is THE resolution — run
// once at intake and persisted; downstream reads it via getPlan().
function resolveLanguagePlan({ job, brief } = {}) {
  const captionConfig = job && job.captions_config != null
    ? job.captions_config
    : (job && job.captions_enabled === 1);
  const cfg = captionDirector.normalizeConfig(captionConfig);
  const b = brief || (job && job.brief) || null;

  const voiceLanguage = cfg.voiceoverLanguage;
  const captionLanguage = cfg.language;
  // normalizeConfig's legacy BOOLEAN branch (captions:true/false) omits videoTextLanguage;
  // that path is English-only, so default it to source rather than leaving it undefined.
  const videoTextLanguage = cfg.videoTextLanguage || SOURCE;

  const vMeta = captionLang.langMeta(videoTextLanguage);
  const cMeta = captionLang.langMeta(captionLanguage);
  const voMeta = captionLang.langMeta(voiceLanguage);

  // On-screen (video-text) language drives what's BAKED into the frame: direction + font.
  const dir = (vMeta && vMeta.dir) || (cMeta && cMeta.dir) || "ltr";
  const fontKey = (vMeta && vMeta.font) || null;
  const fontRes = fontKey ? captionFonts.fontForScript(fontKey) : null;
  const font = fontRes ? { key: fontKey, family: fontRes.family, stack: fontRes.stack } : null;
  const expansion = (vMeta && vMeta.expansion) || (cMeta && cMeta.expansion) || 1.0;
  const lineHeight = (vMeta && vMeta.lineHeight) || null;

  const plan = {
    captionsEnabled: cfg.enabled,
    voiceLanguage, captionLanguage, videoTextLanguage,
    names: {
      voice: (voMeta && voMeta.name) || voiceLanguage,
      caption: (cMeta && cMeta.name) || captionLanguage,
      videoText: (vMeta && vMeta.name) || videoTextLanguage,
    },
    sourceLang: SOURCE,
    dir,
    font,            // { key, family, stack } | null
    expansion,       // layout length multiplier (consumed by the layout follow-up)
    lineHeight,      // per-script line-height floor | null
    mode: captionDirector.modeFor(cfg),   // original | translated | localized | dubbed
    strategy: "translate",                // authoring strategy (reserved for a future "direct")
    exportSRT: cfg.exportSRT,
    exportVTT: cfg.exportVTT,
    glossary: buildGlossary({ job, brief: b }),
    consistency: buildConsistency(cfg),
  };
  plan.scriptDirective = scriptDirectiveFor(plan);
  return plan;
}

// The single accessor every downstream stage uses: return the PERSISTED plan (resolved at
// intake) or resolve on the fly (back-compat for regenerate / the legacy pipeline / jobs
// created before this feature). Guarantees callers always see one consistent plan.
function getPlan(job) {
  if (job && job.languagePlan) return job.languagePlan;
  return resolveLanguagePlan({ job, brief: job && job.brief });
}

// ---------------------------------------------------------------- PRE-RENDER LANGUAGE QA
// A consolidated, DETERMINISTIC quality gate the Director owns — run post-compose on the
// finished index.html. It catches what numeric coverage misses: the FONT actually being
// embedded (else tofu) and English LEAKAGE in the on-screen DOM text (composer CTAs / labels
// that never went through translation — coverage counts only STORYBOARD elements, so a
// localized "Get Started" button reads 100% covered yet ships English). Fail-open by contract:
// a null/best-effort report NEVER touches the render (THE LAW) — it is disclosure only.

// Script-detection ranges (mirror translate.js) — used to measure how much on-screen text is
// actually in the target script vs unexpected Latin.
// Pure pack CHROME that is legitimately Latin even in a localized film (the studio mark, status
// pills, counters). These are not the film's MESSAGE, so they don't count as leakage.
const CHROME_LITERALS = new Set([
  "keyframe", "rec", "live", "preview", "sla", "gate", "terminal", "departures",
  "now", "boarding", "est", "on", "time", "the", "and", "for",
]);

// Strip everything that isn't rendered DOM text: script (GSAP/animation), style (the base64
// @font-face), and canvas (flagship/brightlife bake their dashboard labels there — a disclosed
// limitation, not a fixable DOM leak). What remains is the copy a viewer actually reads.
function visibleText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<canvas[\s\S]*?<\/canvas>/gi, " ")
    .replace(/<title[\s\S]*?<\/title>/gi, " ")   // the page <title>vid</title> is not on-screen
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// English words in the composed on-screen text that AREN'T allowed (brand/tech glossary, pure
// chrome, short initials). For a localized film these are LEAKS worth disclosing.
// Every script this check can tell apart from Latin at a glance: Greek, Cyrillic, Armenian,
// Hebrew, Arabic, Devanagari, Bengali, Tamil, Thai, Kana, CJK, Hangul.
const NON_LATIN_RE = /[Ͱ-ϿЀ-ӿ԰-֏֐-׿؀-ۿऀ-ॿঀ-৿஀-௿฀-๿぀-ヿ一-鿿가-힯]/g;

// THIS CHECK ONLY WORKS WHEN THE TWO LANGUAGES USE DIFFERENT ALPHABETS.
//
// It finds "English" by looking for Latin characters — which is sound for Hindi or Japanese and
// meaningless for French. Job po0ltq31c4 (deep, videoText=fr) is the demonstration: a correctly
// localized French film was reported as "61 English word(s) remain ... e.g. Fini, chasse, aux,
// cherchez" — four French words — in the same report that put localization coverage at 92%.
// Every translated word matched [A-Za-z] and was counted as a leak.
//
// The score was worse. `targetChars` came from SCRIPT_RANGES, which holds only devanagari,
// arabic and japanese, so for French the denominator was zero and the score pinned at 100% —
// and `degraded` fires at 10. Russian had the same fault for the opposite reason: Cyrillic is
// absent from that table, so a genuine leak scored against a zero denominator too.
//
// So the script is now read from the TEXT rather than from a font table that never listed every
// alphabet. When the composed copy carries no non-Latin content there is nothing to compare
// against: a French film and an un-localized English one look identical to a character class,
// and the honest answer is that this instrument cannot tell. It stands down and says so —
// localization COVERAGE (counted against the source strings, reported alongside) is the signal
// that does work for those languages.
function scanLeakage(indexHtml, plan) {
  const text = visibleText(indexHtml);
  const targetChars = (text.match(NON_LATIN_RE) || []).length;
  // A handful of stray glyphs is not a localized film; require enough to be the copy itself.
  if (targetChars < 12) {
    return { ok: true, applicable: false, count: 0, score: 0, samples: [], reason: "same-script target — Latin characters cannot distinguish the target language from the source" };
  }
  const glossary = new Set((plan.glossary || []).map((g) => String(g).toLowerCase()));
  const words = text.match(/[A-Za-z][A-Za-z'’&.\-]{2,}/g) || [];
  const leaked = [];
  for (const w of words) {
    const lc = w.toLowerCase().replace(/[.'’&\-]+$/, "");
    if (lc.length < 3) continue;
    if (glossary.has(lc) || CHROME_LITERALS.has(lc)) continue;
    leaked.push(w);
  }
  const uniq = [...new Set(leaked)];
  const leakChars = leaked.join("").length;
  const denom = targetChars + leakChars;   // targetChars is measured above, from the text itself
  const score = denom ? Math.round((leakChars / denom) * 100) : 0; // % of content that's unexpected Latin
  return { ok: uniq.length === 0, applicable: true, count: uniq.length, score, samples: uniq.slice(0, 15) };
}

// runLanguageQa({ plan, indexHtml, localization?, captionQuality? }) -> report | null.
// Returns null for an English (source video-text) film — nothing to verify.
function runLanguageQa({ plan, indexHtml, localization, captionQuality } = {}) {
  const vtl = plan && plan.videoTextLanguage;
  if (!vtl || vtl === SOURCE) return null;
  const meta = captionLang.langMeta(vtl);

  // Font embedded? (only meaningful for a non-Latin script that needs an injected face.)
  const fontFamily = plan.font && plan.font.family;
  const fontLoaded = !fontFamily ? true : String(indexHtml || "").includes(fontFamily);

  const leakage = scanLeakage(indexHtml, plan);
  const cov = localization && localization.localizationCoverage != null ? localization.localizationCoverage : null;

  const notes = [];
  if (!fontLoaded) notes.push(`The ${meta ? meta.name : vtl} font (${fontFamily}) is not embedded — on-screen text may render as blank boxes; regenerate to re-inject it.`);
  if (leakage.applicable && leakage.count) notes.push(`${leakage.count} English word(s) remain in on-screen text (e.g. ${leakage.samples.slice(0, 5).join(", ")}) — some template labels/CTAs did not localize.`);
  if (cov != null && cov < 100) notes.push(`On-screen localization coverage ${cov}% (${localization.translatedElements}/${localization.elementCount}) — some strings kept their source text (often protected brand terms).`);
  for (const n of (plan.consistency && plan.consistency.notes) || []) notes.push(n);

  // "degraded" = something a viewer would actually notice: missing font (tofu) or SIGNIFICANT
  // leakage. A couple of English CTA labels (low char ratio) are noted but not "degraded".
  // `leakage.score` is only a fact when the scan could run; an inapplicable check must never
  // mark a correctly localized film degraded (it used to pin at 100% for every Latin-script
  // target, because the denominator was zero).
  const degraded = !fontLoaded || (leakage.applicable && leakage.score >= 10) || !!(plan.consistency && plan.consistency.synced === false);

  return {
    localized: true,
    language: { voice: plan.voiceLanguage, caption: plan.captionLanguage, videoText: vtl, mode: plan.mode, dir: plan.dir },
    fontLoaded,
    leakage,
    coverage: cov != null ? { localizationCoverage: cov, translatedElements: localization.translatedElements, elementCount: localization.elementCount } : null,
    captionQuality: captionQuality || null,
    consistency: plan.consistency || null,
    degraded,
    notes,
  };
}

module.exports = { resolveLanguagePlan, getPlan, buildGlossary, scriptDirectiveFor, runLanguageQa };
