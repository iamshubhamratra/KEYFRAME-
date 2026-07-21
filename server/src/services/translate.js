// Translation engine — one batched LLM call that localizes a film's per-scene
// lines into a target language, preserving meaning, brand terminology, product
// names, technical terms, and marketing tone (never literal word-for-word).
//
// Keyed by scene id: input [{ id, text }] -> output { [id]: translatedText }.
// The scene-keyed shape is what lets the rest of the pipeline stay simple — the
// caption cues, the SRT/VTT export, and (mode 3) the voiceover all just look up
// the translated text for their scene and keep their existing timing.
//
// Fail-open by contract: on ANY error (budget, bad JSON, model down) it returns
// the SOURCE lines flagged `ok:false`, so a translation failure degrades to
// source-language captions instead of failing the whole film.

const fs = require("node:fs");
const path = require("node:path");
const openrouter = require("./openrouter");
const captionLang = require("./caption_lang");
const { extractFirstJsonObject: parseLenient } = require("./json_lenient");

const SYSTEM = fs.readFileSync(path.join(__dirname, "..", "prompts", "system_caption_director.md"), "utf8");

// Does a string contain at least one character in the target language's script?
// A cheap, deterministic sanity check that the model actually translated (and did
// not echo English). Latin-script targets skip this (any text passes).
const SCRIPT_RANGES = {
  devanagari: /[ऀ-ॿ]/,
  arabic: /[؀-ۿݐ-ݿ]/,
  // Japanese: hiragana, katakana, or CJK ideographs.
  japanese: /[぀-ヿ㐀-䶿一-鿿ｦ-ﾝ]/,
};

function hasTargetScript(text, scriptKey) {
  const re = SCRIPT_RANGES[String(scriptKey || "").toLowerCase()];
  if (!re) return true; // Latin target — nothing to verify
  return re.test(String(text || ""));
}

// translateLines({ lines, targetLang, sourceLang, context, tracker, signal })
//   lines      : [{ id, text }]  (empty text is passed through untouched)
//   targetLang : language code ("hi") or name ("Hindi")
//   context    : { subject?, tone?, brand?, doNotTranslate?: string[] }
// Returns:
//   { ok, language, byId: { [id]: text }, translatedCount, totalCount,
//     scriptOkCount, notes, untranslatedIds: [] }
async function translateLines({ lines, targetLang, sourceLang = captionLang.SOURCE_LANG, context = {}, tracker, signal } = {}) {
  const code = captionLang.normalizeLang(targetLang);
  const meta = captionLang.langMeta(code);
  const items = (Array.isArray(lines) ? lines : [])
    .map((l) => ({ id: String(l.id), text: String(l.text == null ? "" : l.text) }))
    .filter((l) => l.id);

  const sourceById = Object.fromEntries(items.map((l) => [l.id, l.text]));
  const nonEmpty = items.filter((l) => l.text.trim());

  // Nothing to do — original language, unsupported target, or no text.
  if (!code || code === sourceLang || !nonEmpty.length) {
    return {
      ok: true, language: code || sourceLang, byId: sourceById,
      translatedCount: 0, totalCount: nonEmpty.length, scriptOkCount: nonEmpty.length,
      notes: "", untranslatedIds: [], skipped: true,
    };
  }

  const targetName = meta ? meta.name : code;
  const scriptKey = meta ? meta.font : null;
  const dnt = Array.isArray(context.doNotTranslate) ? context.doNotTranslate.filter(Boolean) : [];

  const user = JSON.stringify({
    targetLanguage: targetName,
    sourceLanguage: captionLang.langMeta(sourceLang)?.name || sourceLang,
    context: {
      subject: context.subject || "",
      tone: context.tone || "",
      brand: context.brand || "",
      doNotTranslate: dnt,
    },
    lines: nonEmpty.map((l) => ({ id: l.id, text: l.text })),
  });

  // One attempt: call the model, parse, map results back by scene id. Throws on
  // a parse failure so the retry loop can re-ask (json-mode replies are
  // occasionally truncated / trailing-junked, more so with multi-byte non-Latin
  // scripts — a single re-ask almost always recovers a clean object).
  async function attempt() {
    const { text, tokensIn, tokensOut } = await openrouter.chat({
      system: SYSTEM, user, jsonMode: true, stage: "caption_director", signal,
    });
    if (tracker) tracker.addLlm({ inputTokens: tokensIn, outputTokens: tokensOut, stage: "caption_director" });

    const raw = parseLenient(text); // throws on unparseable/truncated JSON
    const outLines = Array.isArray(raw?.lines) ? raw.lines : [];
    const byId = { ...sourceById };
    let translatedCount = 0, scriptOkCount = 0;
    const untranslatedIds = [];
    const seen = new Set();
    for (const row of outLines) {
      const id = String(row?.id ?? "");
      if (!id || !(id in sourceById) || seen.has(id)) continue;
      seen.add(id);
      const t = String(row?.text == null ? "" : row.text).trim();
      if (!t) { untranslatedIds.push(id); continue; }
      byId[id] = t;
      translatedCount++;
      if (hasTargetScript(t, scriptKey)) scriptOkCount++;
    }
    // Any non-empty source line the model dropped falls back to source text.
    for (const l of nonEmpty) if (!seen.has(l.id)) untranslatedIds.push(l.id);

    return {
      ok: translatedCount > 0, language: code, byId,
      translatedCount, totalCount: nonEmpty.length,
      scriptOkCount, notes: String(raw?.notes || "").slice(0, 300),
      untranslatedIds,
    };
  }

  // Up to 2 tries: an intermittent bad/truncated JSON reply must NOT drop the
  // whole film to source-language captions when a re-ask would have worked.
  let lastErr = null;
  for (let tryNo = 1; tryNo <= 2; tryNo++) {
    if (signal?.aborted) break;
    try {
      const res = await attempt();
      if (res.translatedCount > 0) return res;
      lastErr = new Error("model returned no usable translations");
    } catch (e) {
      lastErr = e;
      console.warn(`[translate] ${code} attempt ${tryNo}/2 failed (${String(e.message).slice(0, 140)})`);
    }
  }
  console.warn(`[translate] ${code} falling back to source text (${lastErr ? String(lastErr.message).slice(0, 120) : "unknown"})`);
  return {
    ok: false, language: code, byId: sourceById,
    translatedCount: 0, totalCount: nonEmpty.length, scriptOkCount: 0,
    notes: "", untranslatedIds: nonEmpty.map((l) => l.id), error: lastErr ? lastErr.message : "translation failed",
  };
}

module.exports = { translateLines, hasTargetScript };
