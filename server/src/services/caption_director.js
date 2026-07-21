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
const { buildCaptionStyle } = require("./caption_render");
const { translateLines } = require("./translate");
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
  return {
    enabled,
    language,
    voiceoverLanguage,
    // Derived, kept for any back-compat reader: is the VO in a non-source language?
    translateVoiceover: voiceoverLanguage !== SOURCE,
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
async function resolveCaptionPlan({ captionConfig, script, brief, job, tracker, signal } = {}) {
  const cfg = normalizeConfig(captionConfig);
  const mode = modeFor(cfg);
  const scenes = Array.isArray(script?.scenes) ? script.scenes : [];
  const meta = captionLang.langMeta(cfg.language);
  const direction = meta ? meta.dir : "ltr";

  const capLang = cfg.language;            // subtitle language
  const voLang = cfg.voiceoverLanguage;    // voiceover (spoken) language

  // Source per-scene voiceover lines.
  const voScenes = scenes.filter((s) => s.voiceover && String(s.voiceover).trim());
  const sourceById = Object.fromEntries(voScenes.map((s) => [String(s.id), String(s.voiceover)]));

  // Brand/product terms to keep verbatim in Latin: the site title, plus the
  // brief's subject WHEN it reads like a brand name (ASCII, no exotic chars) —
  // a subject like "golden retriever dog" is a common noun and should still be
  // translated, so the regex gate keeps only brand-ish subjects.
  const doNotTranslate = [
    job?.website_title,
    brief?.subject && /^[A-Za-z0-9 .\-&]+$/.test(brief.subject) ? brief.subject : null,
  ].filter(Boolean);
  const context = {
    subject: brief?.subject || "",
    tone: brief?.tone || script?.voice?.style || "",
    brand: job?.website_title || "",
    doNotTranslate,
  };
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

  // Style override for the composer (font + direction) — for the CAPTION language.
  // null for English/Latin or when burn-in is disabled.
  const captionStyle = cfg.enabled ? buildCaptionStyle(capLang) : null;

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
  const translationQuality = mode === "original" ? 100 : scoreTranslation(translate);

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

// Translation quality heuristic (0..100): fraction of lines translated AND in the
// correct target script, lightly penalizing any dropped lines.
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

module.exports = {
  normalizeConfig, resolveCaptionPlan, finalizeQuality, modeFor,
  buildEstimatedCues, estimateSpokenSec, SOURCE_LANG: SOURCE,
};
