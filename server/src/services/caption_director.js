// Caption Director — the agent that turns a film's approved script + the user's
// caption settings into a resolved CAPTION PLAN the rest of the pipeline executes.
//
// Responsibilities (per the feature spec):
//   • Subtitle generation      — per-scene caption text, keyed by scene id
//   • Subtitle translation      — via translate.js (meaning/brand/tone preserving)
//   • Timing synchronization    — reuses the measured per-scene VO clip timing
//   • Caption styling / fonts   — resolves the language font + text direction
//   • Language validation       — verifies the output is in the target script
//
// The three modes collapse to two variables — the VOICEOVER language and the
// CAPTION language:
//   original   (mode 1): VO source,  captions source   (today's English path)
//   translated (mode 2): VO source,  captions target   (translate captions only)
//   localized  (mode 3): VO target,  captions target   (translate VO too)
//
// It runs EARLY (on deterministic script text, before VO is synthesized) so its
// output can feed three consumers: the voice stage (mode 3 speaks the translated
// text), the composer (burns the translated captions), and the timeline (exports
// translated SRT/VTT). Fail-open everywhere: a translation failure degrades to
// source-language captions; it never blocks a render.

const captionLang = require("./caption_lang");
const { buildLanguageStyles } = require("./caption_render");
const { translateLines, didTranslate } = require("./translate");
const { buildCues } = require("./captions");

const SOURCE = captionLang.SOURCE_LANG;

// ---- config normalization -------------------------------------------------
// Accepts: a legacy boolean (`captions: true`), the new object, or nothing.
// Returns a fully-defaulted, validated config the pipelines can trust.
//   { enabled, language, translateVoiceover, exportSRT, exportVTT, style, highlightWords }
function normalizeConfig(input) {
  // Legacy boolean / undefined → English burn-in on/off, current behavior.
  if (input == null || typeof input === "boolean") {
    const on = input === true;
    return { enabled: on, language: SOURCE, voiceoverLanguage: SOURCE, translateVoiceover: false,
      exportSRT: true, exportVTT: true, style: null, highlightWords: false };
  }
  const o = typeof input === "object" ? input : {};
  const enabled = o.enabled !== false && o.enabled != null ? true
    : (o.enabled === false ? false : true);
  // language: accept code or name; default source; unsupported → source.
  const language = captionLang.normalizeLang(o.language) || SOURCE;
  // Voiceover language — now a FIRST-CLASS, INDEPENDENT choice (any supported
  // language, or the source). Precedence:
  //   1) explicit `voiceoverLanguage` (the new dropdown) wins;
  //   2) legacy `translateVoiceover:true` means "speak the CAPTION language"
  //      (the old full-localization toggle);
  //   3) otherwise the source language.
  // This decouples audio from subtitles: Hindi VO + English subs, Spanish VO +
  // Arabic subs, etc. are all valid combinations.
  let voiceoverLanguage;
  if (o.voiceoverLanguage != null) {
    voiceoverLanguage = captionLang.normalizeLang(o.voiceoverLanguage) || SOURCE;
  } else if (typeof o.translateVoiceover === "boolean") {
    voiceoverLanguage = (o.translateVoiceover && language !== SOURCE) ? language : SOURCE;
  } else {
    voiceoverLanguage = SOURCE;
  }
  // Video-text (ON-SCREEN text) language — the THIRD independent axis. Precedence:
  //   1) explicit `videoTextLanguage` (or alias `onScreenLanguage`), unless "auto";
  //   2) "Auto Match Voiceover" (the default) → follow the voiceover language, which
  //      itself defaults to the source, so an unset video-text language stays English.
  let videoTextLanguage;
  const rawVtl = o.videoTextLanguage != null ? o.videoTextLanguage : o.onScreenLanguage;
  if (rawVtl != null && String(rawVtl).toLowerCase() !== "auto") {
    videoTextLanguage = captionLang.normalizeLang(rawVtl) || voiceoverLanguage;
  } else {
    videoTextLanguage = voiceoverLanguage;
  }
  return {
    enabled,
    language,
    voiceoverLanguage,
    videoTextLanguage,
    // Derived, kept for any back-compat reader: is the VO in a non-source language?
    translateVoiceover: voiceoverLanguage !== SOURCE,
    // Derived: is on-screen text in a non-source language (needs the Localization Director)?
    translateVideoText: videoTextLanguage !== SOURCE,
    exportSRT: o.exportSRT !== false,
    exportVTT: o.exportVTT !== false,
    // Reserved for phase 2 — accepted and stored, not yet acted on.
    style: o.style || null,
    highlightWords: o.highlightWords === true,
  };
}

// A descriptive label for the (voiceover language, caption language) pair.
//   original   — both source
//   translated — source VO, translated subtitles
//   localized  — VO and subtitles in the SAME target language (full localization)
//   dubbed     — VO in a non-source language whose language differs from the subs
function modeFor(cfg) {
  const capT = cfg.language !== SOURCE;
  const voT = cfg.voiceoverLanguage !== SOURCE;
  if (!capT && !voT) return "original";
  if (!voT) return "translated";
  if (cfg.voiceoverLanguage === cfg.language) return "localized";
  return "dubbed";
}

// Shared translation context — brand/product terms kept verbatim, subject, tone. Reused
// by the caption/voiceover translation here AND by the on-screen-text Localization
// Director, so all three axes protect the same terms. Brand terms to keep verbatim in
// Latin: the site title, plus the brief's subject WHEN it reads like a brand name (ASCII,
// no exotic chars) — a subject like "golden retriever dog" is a common noun and should
// still be translated, so the regex gate keeps only brand-ish subjects.
function buildTranslateContext(brief, job, script, glossary) {
  // The Language Director supplies a richer do-not-translate glossary (fixed brand/tech terms
  // + site title + gated subject) when present; fall back to the minimal seed otherwise so
  // callers that don't pass one behave exactly as before.
  const doNotTranslate = Array.isArray(glossary) && glossary.length
    ? glossary
    : [
        job?.website_title,
        brief?.subject && /^[A-Za-z0-9 .\-&]+$/.test(brief.subject) ? brief.subject : null,
      ].filter(Boolean);
  return {
    subject: brief?.subject || "",
    tone: brief?.tone || script?.voice?.style || "",
    brand: job?.website_title || "",
    doNotTranslate,
  };
}

// Language-aware spoken-time estimate for a line (compose-time caption timing,
// before VO is measured). Latin: words / rate. CJK (no spaces): chars / rate.
function estimateSpokenSec(text, langCode) {
  const t = String(text || "");
  const words = (t.match(/\S+/g) || []).length;
  const isCjk = langCode === "ja";
  if (isCjk) {
    const chars = (t.replace(/\s+/g, "").match(/./gu) || []).length;
    return chars / 7.0 + 0.4; // ~7 chars/sec conversational Japanese
  }
  return words / 2.6 + 0.4;
}

// Build the on-screen caption cues (ESTIMATED timing) from resolved caption text.
// Mirrors the timing model the composers expected before this feature, but reads
// the resolved (possibly translated) text and estimates duration per language.
function buildEstimatedCues({ scenes, textById, langCode }) {
  const src = (scenes || [])
    .filter((s) => {
      const t = textById[String(s.id)];
      return t && String(t).trim();
    })
    .map((s) => {
      const text = String(textById[String(s.id)]);
      return {
        sceneId: s.id,
        startSec: s.start,
        durationSec: Math.min(s.duration, estimateSpokenSec(text, langCode)),
        sceneDurationSec: s.duration,
        text,
      };
    });
  return buildCues(src).map((c) => ({
    start: Math.round(c.start * 10) / 10,
    end: Math.round(c.end * 10) / 10,
    text: c.text,
  }));
}

// ---- the director ---------------------------------------------------------
// resolveCaptionPlan({ captionConfig, script, brief, job, tracker, signal })
// Returns a plan (never throws):
//   {
//     enabled, language, mode, sourceLang, direction,
//     captionStyle,                 // font/dir override for the composer, or null
//     captionTextById, voTextById,  // per-scene resolved text
//     bakedCues,                    // estimated-timing cues for on-screen burn-in
//     translate,                    // translation result summary
//     exportSRT, exportVTT, style, highlightWords,
//     quality,                      // partial; finalized at timeline
//   }
async function resolveCaptionPlan({ captionConfig, script, brief, job, tracker, signal, languagePlan } = {}) {
  // The Language Director resolves the language triple ONCE (at intake) and persists it; when
  // it's handed in, use its resolved codes verbatim so this stage never re-normalizes config
  // independently. Fall back to normalizeConfig (unchanged) when no plan is supplied.
  const cfg = languagePlan
    ? {
        enabled: languagePlan.captionsEnabled,
        language: languagePlan.captionLanguage,
        voiceoverLanguage: languagePlan.voiceLanguage,
        videoTextLanguage: languagePlan.videoTextLanguage,
        translateVoiceover: languagePlan.voiceLanguage !== SOURCE,
        translateVideoText: languagePlan.videoTextLanguage !== SOURCE,
        exportSRT: languagePlan.exportSRT !== false,
        exportVTT: languagePlan.exportVTT !== false,
        style: null, highlightWords: false,
      }
    : normalizeConfig(captionConfig);
  const mode = modeFor(cfg);
  const scenes = Array.isArray(script?.scenes) ? script.scenes : [];
  const meta = captionLang.langMeta(cfg.language);
  const direction = meta ? meta.dir : "ltr";

  const capLang = cfg.language;            // subtitle language
  const voLang = cfg.voiceoverLanguage;    // voiceover (spoken) language

  // Source per-scene voiceover lines.
  const voScenes = scenes.filter((s) => s.voiceover && String(s.voiceover).trim());
  const sourceById = Object.fromEntries(voScenes.map((s) => [String(s.id), String(s.voiceover)]));

  const context = buildTranslateContext(brief, job, script, languagePlan?.glossary);
  const lines = voScenes.map((s) => ({ id: String(s.id), text: String(s.voiceover) }));
  const skipped = () => ({ ok: true, byId: sourceById, translatedCount: 0, totalCount: voScenes.length, scriptOkCount: voScenes.length, untranslatedIds: [], skipped: true });

  // Caption + voiceover are translated INDEPENDENTLY. Reuse one translation when
  // both target the same language (the common "full localization" case), so a
  // localized film pays for one translate call, not two.
  const capTranslate = capLang !== SOURCE
    ? await translateLines({ lines, targetLang: capLang, sourceLang: SOURCE, context, tracker, signal })
    : skipped();
  let voTranslate;
  if (voLang === SOURCE) voTranslate = skipped();
  else if (voLang === capLang) voTranslate = capTranslate;
  else voTranslate = await translateLines({ lines, targetLang: voLang, sourceLang: SOURCE, context, tracker, signal });

  // Per-scene resolved text — captions in capLang, spoken VO in voLang.
  const captionTextById = capLang === SOURCE ? sourceById : capTranslate.byId;
  const voTextById = voLang === SOURCE ? sourceById : voTranslate.byId;
  // `translate` (below) summarizes the CAPTION translation — the burned/exported
  // artifact — for logging and the disclosure panel.
  const translate = capTranslate;

  // Combined language style for the composer: the CAPTION-language font/direction (on
  // caption elements, only when burn-in is enabled) AND the VIDEO-TEXT-language font/
  // direction (on ALL on-screen text). null for all-Latin/English — English is unchanged.
  const captionStyle = buildLanguageStyles(capLang, cfg.videoTextLanguage, { captionsEnabled: cfg.enabled });

  // On-screen burn-in cues (estimated timing). Empty when burn-in is disabled.
  const bakedCues = cfg.enabled
    ? buildEstimatedCues({ scenes, textById: captionTextById, langCode: cfg.language })
    : [];

  // Partial quality — translation + font dimensions are known now; sync +
  // readability + coverage are finalized at the timeline with measured clips.
  const fontCompatibility = (() => {
    if (!meta) return 0;
    if (!meta.font) return 100; // Latin — always renders
    return captionStyle && captionStyle.fontFaceCss ? 100 : 40;
  })();
  // A source-language caption track (e.g. English captions on a Hindi-dubbed film) has
  // NOTHING to translate, so it scores 100 — not the 0% scoreTranslation would return for a
  // "skipped" translation (translatedCount 0 / totalCount N). translationQuality reflects the
  // CAPTION translation; when captions are the source language there is nothing to grade.
  const translationQuality = (mode === "original" || translate.skipped) ? 100 : scoreTranslation(translate);

  const quality = {
    captionLanguage: captionLang.langMeta(capLang)?.name || capLang,
    languageCode: capLang,
    voiceLanguage: captionLang.langMeta(voLang)?.name || voLang,
    voiceLanguageCode: voLang,
    mode,
    translationQuality,
    fontCompatibility,
    // finalized later:
    syncAccuracy: null,
    readabilityScore: null,
    subtitleCoverage: null,
  };

  return {
    enabled: cfg.enabled,
    language: capLang,
    voiceLanguage: voLang,
    voiceLanguageName: captionLang.langMeta(voLang)?.name || voLang,
    // On-screen (video-text) language — resolved by the Localization Director node.
    videoTextLanguage: cfg.videoTextLanguage,
    videoTextLanguageName: captionLang.langMeta(cfg.videoTextLanguage)?.name || cfg.videoTextLanguage,
    mode, sourceLang: SOURCE, direction,
    captionStyle,
    captionTextById, voTextById,
    bakedCues,
    translate: {
      ok: translate.ok, translatedCount: translate.translatedCount,
      totalCount: translate.totalCount, scriptOkCount: translate.scriptOkCount,
      untranslatedIds: translate.untranslatedIds || [], notes: translate.notes || "",
      error: translate.error || null,
    },
    // Separate summary for the VOICEOVER translation (may target a different
    // language than the captions). Equal object when both share a language.
    voiceTranslate: {
      ok: voTranslate.ok, translatedCount: voTranslate.translatedCount,
      totalCount: voTranslate.totalCount, untranslatedIds: voTranslate.untranslatedIds || [],
      error: voTranslate.error || null,
    },
    exportSRT: cfg.exportSRT, exportVTT: cfg.exportVTT,
    style: cfg.style, highlightWords: cfg.highlightWords,
    quality,
  };
}

// Translation quality heuristic (0..100): blends line COVERAGE (how many came back)
// with the VERIFIED-translation ratio (scriptOkCount / translated — lines that are not
// an English echo and, for non-Latin, in the target script; see translate.didTranslate),
// lightly penalizing dropped lines. An English echo now scores low here, so the caption
// disclosure floor can catch it even for the Latin languages.
function scoreTranslation(t) {
  const total = t.totalCount || 0;
  if (!total) return 100;
  const translated = t.translatedCount || 0;
  const scriptOk = t.scriptOkCount != null ? t.scriptOkCount : translated;
  const coverage = translated / total;
  const scriptRatio = translated ? scriptOk / translated : 0;
  const raw = 100 * (0.4 * coverage + 0.6 * scriptRatio);
  if (!t.ok) return Math.min(raw, 50);
  return Math.round(raw);
}

// Finalize the quality report once VO clips are measured and the real (measured)
// cues exist. Returns a full report matching the spec's metrics shape.
//   voScenes  : the scenes that carry voiceover (for coverage denominator)
//   measuredCues : the cues built from measured VO clips (start/end/text)
//   voClips   : [{ sceneId, startSec, durationSec, sceneDurationSec }]
function finalizeQuality(plan, { voScenes = [], measuredCues = [], voClips = [] } = {}) {
  const q = { ...(plan.quality || {}) };

  // Subtitle coverage — fraction of voiceover SCENES that produced a subtitle.
  // Count DISTINCT covered scenes (via the measured VO clips' sceneId), NOT raw
  // cue chunks: buildCues splits a long line into 2 cues, so counting cues would
  // over-report (2 covered scenes with long lines = 4 cues = "100%" of 4 scenes).
  const denom = voScenes.length || 0;
  const coveredScenes = new Set(
    voClips.filter((c) => c && c.sceneId != null && String(c.text || "").trim()).map((c) => String(c.sceneId))
  ).size;
  const cueCount = measuredCues.filter((c) => c && c.text && String(c.text).trim()).length;
  q.subtitleCoverage = denom
    ? Math.round((Math.min(coveredScenes, denom) / denom) * 100)
    : (cueCount ? 100 : 0);

  // Sync accuracy — fraction of measured clips whose window sits inside its scene
  // (no early/late display beyond a small grace). A clean per-scene pipeline scores
  // high; overruns that had to be nudged pull it down.
  let synced = 0, total = 0;
  for (const clip of voClips) {
    total++;
    const start = Number(clip.startSec) || 0;
    const dur = Number(clip.durationSec) || 0;
    const sceneDur = Number(clip.sceneDurationSec) || dur;
    // The clip should start >= its scene start (it does, by construction) and not
    // overrun the scene by more than ~1s (vo_fit + anti-overlap keep this tight).
    const overrun = Math.max(0, dur - sceneDur - 1.0);
    if (overrun < 0.25) synced++;
  }
  q.syncAccuracy = total ? Math.round((synced / total) * 100) : (cueCount ? 100 : null);

  // Readability — fraction of cues that fit comfortably in the caption pill,
  // which wraps to ~2 lines. The budget is a TWO-LINE allowance per language
  // (chars/line × 2): Latin packs ~24/line, Arabic ~21/line, CJK ~16/line.
  // Japanese has no spaces so a whole sentence is ONE cue that wraps in the pill
  // via overflow-wrap — scoring it against a single-line cap wrongly reported ~0%
  // for captions that render perfectly, so the 2-line budget is the honest gate
  // (~18 JP chars/line × 2 ≈ 36 covers the typical 25–40-char localized line).
  const maxChars = plan.language === "ja" ? 36 : plan.language === "ar" ? 42 : 48;
  let readable = 0;
  for (const c of measuredCues) {
    const len = String(c.text || "").length;
    if (len <= maxChars) readable++;
  }
  q.readabilityScore = measuredCues.length ? Math.round((readable / measuredCues.length) * 100) : null;

  // DISCLOSURE — a requested translation that fell back to source English (ok:false)
  // or scored below the floor is a user-visible degradation, not a silent one. These
  // notes ride on caption_quality (persisted by both pipelines via db.setCaptions) and
  // render in Premiere's caption panel. NOTE: translationQuality is a target-SCRIPT
  // presence heuristic, so the floor catches hard failures / low coverage but NOT a
  // fluent-but-wrong translation, and (for Latin es/fr/de/pt) not an English echo —
  // real semantic verification is a separate follow-up.
  const TRANSLATION_QUALITY_FLOOR = 60;
  const notes = [];
  if (plan.language !== SOURCE && plan.translate && plan.translate.ok === false) {
    notes.push(`Captions fell back to English — translation to ${q.captionLanguage} failed.`);
  }
  if (plan.voiceLanguage !== SOURCE && plan.voiceTranslate && plan.voiceTranslate.ok === false) {
    notes.push(`Voiceover fell back to English — translation to ${q.voiceLanguage} failed.`);
  }
  if (plan.language !== SOURCE && plan.translate && plan.translate.ok !== false
      && typeof q.translationQuality === "number" && q.translationQuality < TRANSLATION_QUALITY_FLOOR) {
    notes.push(`Caption translation quality is low (${q.translationQuality}); some lines may be untranslated.`);
  }
  q.degraded = notes.length > 0;
  q.notes = notes;

  return q;
}

// Translate a storyboard's ON-SCREEN text (title, and per-scene headline/subtext/
// emphasis/bullets/onScreenText) into `videoTextLanguage`, MUTATING the storyboard in
// place (it flows by reference into the composers), and return a coverage report. Reuses
// the batched translator + the shared brand-term context + P1's echo/script verification.
// Fail-open: any failure leaves English text. Returns null when target === source.
//   report: { videoTextLanguage, videoTextLanguageName, translatedElements, elementCount,
//             localizationCoverage, fontCompatibility, degraded, notes[] }
async function localizeStoryboardText({ storyboard, videoTextLanguage, videoTextLanguageName, textStyle, extraStrings = null, brief, job, script, tracker, signal, glossary } = {}) {
  const vtl = videoTextLanguage;
  const sb = storyboard;
  if (!vtl || vtl === SOURCE || !sb || !Array.isArray(sb.scenes)) return null;

  const lines = [];
  const push = (key, text) => { if (text != null && String(text).trim()) lines.push({ id: key, text: String(text) }); };
  push("title", sb.title);
  sb.scenes.forEach((sc, i) => {
    push(`s${i}.headline`, sc.headline);
    push(`s${i}.subtext`, sc.subtext);
    push(`s${i}.emphasis`, sc.emphasis);
    (Array.isArray(sc.bullets) ? sc.bullets : []).forEach((b, j) => push(`s${i}.bl.${j}`, b));
    (Array.isArray(sc.onScreenText) ? sc.onScreenText : []).forEach((t, j) => push(`s${i}.ost.${j}`, t));
  });
  // Fold the chosen composer's FIXED strings (KICK kickers, fallback CTAs) into the SAME
  // batch under `str.<key>` ids — no extra LLM call. Verified translations become a
  // localizedStrings map the composer overlays on its English defaults.
  const extraKeys = extraStrings && typeof extraStrings === "object" ? Object.keys(extraStrings) : [];
  for (const k of extraKeys) push(`str.${k}`, extraStrings[k]);

  const meta = captionLang.langMeta(vtl);
  const needsFont = !!(meta && meta.font);
  const fontCompatibility = !needsFont ? 100 : (textStyle && textStyle.fontFaceCss ? 100 : 40);
  const base = { videoTextLanguage: vtl, videoTextLanguageName: videoTextLanguageName || meta?.name || vtl, fontCompatibility };
  if (!lines.length) return { ...base, translatedElements: 0, elementCount: 0, localizationCoverage: 0, degraded: false, notes: [] };

  const context = buildTranslateContext(brief, job, script, glossary);
  const res = await translateLines({ lines, targetLang: vtl, sourceLang: SOURCE, context, tracker, signal }).catch(() => null);

  const sk = needsFont ? meta.font : null;
  let verified = 0;
  const localizedStrings = {}; // verified composer-string translations (English fallback otherwise)
  if (res && res.byId) {
    const byId = res.byId;
    const apply = (key, orig) => {
      const t = byId[key];
      if (t == null) return orig;                // model dropped it → keep source
      if (didTranslate(orig, t, sk)) verified++;  // real translation (not an English echo)
      return t;
    };
    if (byId.title != null) sb.title = apply("title", sb.title);
    sb.scenes.forEach((sc, i) => {
      if (byId[`s${i}.headline`] != null) sc.headline = apply(`s${i}.headline`, sc.headline);
      if (byId[`s${i}.subtext`] != null) sc.subtext = apply(`s${i}.subtext`, sc.subtext);
      // emphasis is a substring of headline (the accent word); translate it too — if it no
      // longer matches the translated headline, headlineSpans just skips the highlight.
      if (byId[`s${i}.emphasis`] != null) sc.emphasis = apply(`s${i}.emphasis`, sc.emphasis);
      if (Array.isArray(sc.bullets)) sc.bullets = sc.bullets.map((b, j) => apply(`s${i}.bl.${j}`, b));
      if (Array.isArray(sc.onScreenText)) sc.onScreenText = sc.onScreenText.map((t, j) => apply(`s${i}.ost.${j}`, t));
    });
    // Composer fixed strings — keep only VERIFIED translations so unverified keys fall
    // back to the composer's English defaults.
    for (const k of extraKeys) {
      const t = byId[`str.${k}`];
      if (t != null && didTranslate(extraStrings[k], t, sk)) { localizedStrings[k] = t; verified++; }
    }
  }

  const total = lines.length;
  const coverage = total ? Math.round((verified / total) * 100) : 0;
  const notes = [];
  if (!res || !res.ok) notes.push(`On-screen text fell back to English — translation to ${base.videoTextLanguageName} failed.`);
  else if (coverage < 60) notes.push(`On-screen localization is partial (${coverage}%); some titles may remain English.`);
  return { ...base, translatedElements: verified, elementCount: total, localizationCoverage: coverage, degraded: notes.length > 0, notes, localizedStrings };
}

module.exports = {
  normalizeConfig, resolveCaptionPlan, finalizeQuality, modeFor,
  buildEstimatedCues, estimateSpokenSec, buildTranslateContext, localizeStoryboardText,
  SOURCE_LANG: SOURCE,
};
