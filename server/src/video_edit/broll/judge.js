// VIDEO EDIT B-ROLL JUDGE — one vision call rates every contact-sheet cell for up to three slots.
//
// WHY THIS EXISTS. Tags say "business, office, laptop" for a clip of a cat on a keyboard; only looking
// tells relevance, watermarks, burned-in text, faces and cliché apart. The judge is the most expensive
// signal in scoring, so it is shaped for cheap and verifiable (ANALYSIS.md §8):
//   - `ve_broll_judge` on a flash-lite model (llm.brollJudge), ≤ 3 slot sheets per call (llm_guard: ≤ 8
//     images, ≤ 640 px, ≤ 1.5 MB), temperature 0, response cache by content hash (a resumed stage is free);
//   - LETTER ids in a deterministic shuffle seeded by the slot id, so position on the sheet carries no
//     prior-rank bias and a re-run shows the model the same sheet;
//   - a zod schema built per batch: strict objects, bounded numbers, the issues enum, and a superRefine
//     that demands exactly the requested slots and exactly each sheet's letters once — the failure text
//     goes into callJson's ONE repair re-ask; a reply still invalid escalates once to the stronger model;
//   - `privacy.allowCloudVision === false` means zero calls, and every non-cancel failure (breaker open,
//     budget, 5xx, invalid twice) degrades the affected slots to `unavailable` — scoring then falls back
//     to lexical + technical (`judge:'unavailable'`). Cancellation always propagates.
//
// CONTRACT:
//   assignLetters(slotId, items, keyOf = (x) => x.key) -> [{ letter, key, item }]  (seeded shuffle, A..)
//   buildJudgeSchema([{ slotId, letters:[...] }]) -> zod schema
//   judgeSlots({ slots:[{ slotId, sentenceText, queries, avoid?, layoutAspect?, brandPalette?, sheetFile,
//                         letters:[{ letter, key, type, durationSec }] | candidates:[{ key, type, durationSec }] }],
//                signal, tracker, callJson, model, escalationModel, cacheDir, allowCloudVision=true,
//                maxSlotsPerCall=3, concurrency=1, promptVersion, breaker, faults, onNotice, onCost, settings })
//     -> { status:'ok'|'partial'|'unavailable', reason, bySlot:{ [slotId]: { status:'ok'|'unavailable', reason, model,
//            byKey:{ [key]: { letter, relevance, literalMatch, quality, issues, composition, bestLayout } } } },
//          costUsd, calls, notices, models }
//   JUDGE_ISSUES · JUDGE_LAYOUTS · JUDGE_STAGE · SYSTEM_PROMPT

const fs = require("node:fs");
const { z } = require("zod");
const { EditError, isEditError } = require("../errors");
const { getBreaker } = require("../providers/breaker");
const { imageDimsFromBuffer } = require("../../services/asset_sources/util");
const { resolveScoringSettings } = require("./score_defaults");
const { seededShuffle, letterFor, round, num, isPlain, cancelledError, throwIfAborted } = require("./common");
const { mapLimit } = require("./contact_sheet");

const JUDGE_STAGE = "ve_broll_judge";
const JUDGE_ISSUES = Object.freeze(["watermark", "text", "faces", "offtopic", "low_quality", "cliche", "unsafe"]);
const JUDGE_LAYOUTS = Object.freeze(["FULL", "PIP", "SPLIT", "none"]);
const MAX_SHEET_BYTES = 400 * 1024;

const SYSTEM_PROMPT = [
  "You are a meticulous B-roll editor choosing stock footage to cut away to during a talking-head video.",
  "For each SLOT you receive the spoken sentence, the visual intent and ONE contact sheet image.",
  "Every cell of the sheet has a letter (A, B, C, ...) in its top-left corner. A video cell shows three frames",
  "of the same clip (a large middle frame, plus small frames from 25% and 75% of the clip); a photo cell shows one picture.",
  "Rate EVERY lettered cell of every sheet exactly once. Never skip a letter and never invent letters.",
  "Fields per candidate:",
  "- relevance 0-10: how well it illustrates what the sentence says (10 = exactly the subject, 0 = unrelated).",
  "- literalMatch: true when it literally shows the named subject.",
  "- quality 0-10: sharpness, lighting, professional look.",
  "- issues: any of watermark, text (prominent on-screen text or captions), faces (a recognisable person's face is the main subject),",
  "  offtopic, low_quality, cliche (generic staged stock such as handshakes or thumbs-up), unsafe (violence, nudity, drugs, disturbing).",
  "- composition 0-10: clear focal subject that still works when cropped to the output aspect.",
  "- bestLayout: FULL (full-screen cutaway), PIP (small picture-in-picture box), SPLIT (half screen) or none (unusable).",
  "Return ONLY a JSON object of this shape:",
  "{\"slots\":[{\"slotId\":\"<slot id>\",\"cands\":[{\"id\":\"A\",\"relevance\":0,\"literalMatch\":false,\"quality\":0,\"issues\":[],\"composition\":0,\"bestLayout\":\"FULL\"}]}]}",
].join("\n");

function assignLetters(slotId, items, keyOf = (x) => x.key) {
  return seededShuffle(Array.isArray(items) ? items : [], `broll-judge:${slotId}`)
    .map((item, i) => ({ letter: letterFor(i), key: keyOf(item), item }));
}

function buildJudgeSchema(batch) {
  const expected = new Map((batch || []).map((s) => [String(s.slotId), (s.letters || []).map(String)]));
  const Cand = z.object({
    id: z.string().min(1).max(4),
    relevance: z.number().min(0).max(10),
    literalMatch: z.boolean(),
    quality: z.number().min(0).max(10),
    issues: z.array(z.enum(JUDGE_ISSUES)).max(7),
    composition: z.number().min(0).max(10),
    bestLayout: z.enum(JUDGE_LAYOUTS),
    note: z.string().max(200).optional(),
  }).strict();
  const Slot = z.object({ slotId: z.string().min(1).max(60), cands: z.array(Cand).max(26) }).strict();
  return z.object({ slots: z.array(Slot).max(10) }).strict().superRefine((v, ctx) => {
    const seen = new Set();
    v.slots.forEach((s, si) => {
      const letters = expected.get(s.slotId);
      if (!letters) {
        ctx.addIssue({ code: "custom", path: ["slots", si, "slotId"], message: `unknown slotId; expected ${[...expected.keys()].join(", ")}` });
        return;
      }
      if (seen.has(s.slotId)) {
        ctx.addIssue({ code: "custom", path: ["slots", si, "slotId"], message: `slot ${s.slotId} appears twice` });
        return;
      }
      seen.add(s.slotId);
      const ids = s.cands.map((c) => String(c.id).trim().toUpperCase());
      const dup = [...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))];
      const unknown = [...new Set(ids.filter((x) => !letters.includes(x)))];
      const missing = letters.filter((l) => !ids.includes(l));
      if (dup.length || unknown.length || missing.length) {
        const parts = [];
        if (missing.length) parts.push(`missing ${missing.join(",")}`);
        if (unknown.length) parts.push(`unknown ${unknown.join(",").slice(0, 60)}`);
        if (dup.length) parts.push(`duplicated ${dup.join(",").slice(0, 60)}`);
        ctx.addIssue({ code: "custom", path: ["slots", si, "cands"], message: `slot ${s.slotId} must rate exactly the letters ${letters.join(",")} once each (${parts.join("; ")})` });
      }
    });
    for (const id of expected.keys()) {
      if (!seen.has(id)) ctx.addIssue({ code: "custom", path: ["slots"], message: `missing slot ${id}` });
    }
  });
}

const cleanText = (s, max) => String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/"/g, "'").replace(/\s+/g, " ").trim().slice(0, max);

function slotText(s, maxChars) {
  const lines = [`SLOT ${s.slotId}`, `Sentence: "${cleanText(s.sentenceText, maxChars)}"`];
  const queries = (Array.isArray(s.queries) ? s.queries : []).map((q) => cleanText(q, 60)).filter(Boolean);
  if (queries.length) lines.push(`Visual intent: ${queries.join("; ")}`);
  const avoid = (Array.isArray(s.avoid) ? s.avoid : []).map((q) => cleanText(q, 60)).filter(Boolean);
  if (avoid.length) lines.push(`Avoid: ${avoid.join("; ")}`);
  if (typeof s.layoutAspect === "string" && /^\d{1,2}:\d{1,2}$/.test(s.layoutAspect)) lines.push(`Output aspect: ${s.layoutAspect}`);
  const palette = (Array.isArray(s.brandPalette) ? s.brandPalette : []).filter((p) => /^#[0-9a-f]{6}$/i.test(p));
  if (palette.length) lines.push(`Brand colours: ${palette.join(", ")}`);
  lines.push(`Letters on this sheet: ${s.letters.map((l) => {
    const d = num(l.durationSec);
    return `${l.letter} (${l.type === "video" ? `video${d ? ` ${d.toFixed(1)} s` : ""}` : "photo"})`;
  }).join(", ")}`);
  return lines.join("\n");
}

function readSheet(file) {
  if (typeof file !== "string" || !file) throw new Error("no sheet");
  const buf = fs.readFileSync(file);
  if (buf.length > MAX_SHEET_BYTES) throw new Error("sheet too large");
  if (!(buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)) throw new Error("sheet not jpeg");
  const dims = imageDimsFromBuffer(buf);
  if (!dims || Math.max(dims.width, dims.height) > 640) throw new Error("sheet dims");
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

function lettersOf(s) {
  if (Array.isArray(s.letters) && s.letters.length) {
    return s.letters.filter((l) => isPlain(l) && /^[A-Z]{1,2}$/.test(String(l.letter)) && l.key != null)
      .map((l) => ({ letter: String(l.letter), key: String(l.key), type: l.type === "image" ? "image" : "video", durationSec: num(l.durationSec) }));
  }
  if (Array.isArray(s.candidates) && s.candidates.length) {
    return assignLetters(s.slotId, s.candidates).map((l) => ({
      letter: l.letter, key: String(l.key), type: l.item && l.item.type === "image" ? "image" : "video", durationSec: num(l.item && l.item.durationSec),
    }));
  }
  return [];
}

const isCancel = (e, signal) => (signal && signal.aborted) || (isEditError(e) && e.errorClass === "cancelled");
const tripsBreaker = (e) => isEditError(e) && e.code !== "LLM_INVALID_JSON" && ["transient", "provider", "config", "budget"].includes(e.errorClass);
const reasonOf = (e) => (isEditError(e) ? (e.code === "LLM_CALL_FAILED" ? `call_failed_${e.errorClass}` : String(e.code).toLowerCase()) : "call_failed");

async function judgeSlots(opts = {}) {
  const cfg = resolveScoringSettings(opts.settings);
  const {
    slots = [], signal = null, tracker = null, callJson = null, cacheDir = null, allowCloudVision = true,
    faults = null, onNotice = null, onCost = null,
    blockedReason = null, // caller-side veto (e.g. 'cost_cap'): zero calls, every slot unavailable with this reason
  } = opts;
  const model = opts.model || cfg.judge.model;
  const escalationModel = opts.escalationModel === undefined ? cfg.judge.escalationModel : opts.escalationModel;
  const maxSlotsPerCall = Math.max(1, Math.min(3, Math.floor(opts.maxSlotsPerCall) || cfg.judge.maxSlotsPerCall));
  const concurrency = Math.max(1, Math.floor(opts.concurrency) || cfg.judge.concurrency);
  const promptVersion = opts.promptVersion == null ? cfg.judge.promptVersion : opts.promptVersion;
  const maxChars = cfg.judge.maxSentenceChars;
  const call = typeof callJson === "function" ? callJson : require("../ai/llm").callJson;
  const breaker = opts.breaker || getBreaker("openrouter_chat");

  const out = { status: "unavailable", reason: null, bySlot: {}, costUsd: 0, calls: 0, notices: [], models: [] };
  const notice = (n) => { out.notices.push(n); if (typeof onNotice === "function") { try { onNotice(n); } catch { /* noop */ } } };
  const unavailable = (slotId, reason) => { out.bySlot[slotId] = { status: "unavailable", reason, model: null, byKey: {} }; };

  throwIfAborted(signal);
  const ready = [];
  for (const s of Array.isArray(slots) ? slots : []) {
    if (!isPlain(s) || !s.slotId) continue;
    const slotId = String(s.slotId);
    if (!allowCloudVision) { unavailable(slotId, "no_vision_consent"); continue; }
    if (blockedReason) { unavailable(slotId, String(blockedReason).slice(0, 40)); continue; }
    const letters = lettersOf({ ...s, slotId });
    if (!letters.length) { unavailable(slotId, "no_candidates"); continue; }
    let dataUri;
    try { dataUri = readSheet(s.sheetFile); } catch { unavailable(slotId, "sheet_invalid"); continue; }
    ready.push({ ...s, slotId, letters, dataUri });
  }

  const batches = [];
  for (let i = 0; i < ready.length; i += maxSlotsPerCall) batches.push(ready.slice(i, i + maxSlotsPerCall));

  await mapLimit(batches, concurrency, async (batch) => {
    throwIfAborted(signal);
    if (!breaker.canRequest()) { batch.forEach((s) => unavailable(s.slotId, "breaker_open")); return; }
    const schema = buildJudgeSchema(batch.map((s) => ({ slotId: s.slotId, letters: s.letters.map((l) => l.letter) })));
    const user = [];
    for (const s of batch) {
      user.push({ type: "text", text: slotText(s, maxChars) });
      user.push({ type: "image_url", image_url: { url: s.dataUri } });
    }
    const injected = faults && typeof faults.faultFor === "function" ? faults.faultFor("llm") : null;
    const attempt = async (m) => {
      if (faults && typeof faults.maybeFail === "function") await faults.maybeFail("llm");
      if (injected && injected.mode === "invalid_json") {
        throw new EditError("LLM_INVALID_JSON", { errorClass: "provider", retryable: true, stage: JUDGE_STAGE, detail: "fault-injected" });
      }
      out.calls++;
      return call({
        stage: JUDGE_STAGE, system: SYSTEM_PROMPT, user, schema, model: m, temperature: 0, tracker, signal,
        promptVersion, cacheDir, onNotice: notice, onCost,
      });
    };

    let res = null;
    let used = model;
    let reason = null;
    try {
      res = await attempt(model);
    } catch (e) {
      if (isCancel(e, signal)) throw isEditError(e) && e.errorClass === "cancelled" ? e : cancelledError("judge aborted");
      if (isEditError(e) && e.code === "LLM_INVALID_JSON") {
        out.costUsd += Number(e.extra && e.extra.costUsd) || 0;
        reason = "invalid_json";
        if (escalationModel && escalationModel !== model) {
          notice({ code: "JUDGE_ESCALATED", stage: JUDGE_STAGE, requested: model, used: escalationModel });
          try {
            res = await attempt(escalationModel);
            used = escalationModel;
          } catch (e2) {
            if (isCancel(e2, signal)) throw isEditError(e2) && e2.errorClass === "cancelled" ? e2 : cancelledError("judge aborted");
            if (isEditError(e2) && e2.code === "LLM_INVALID_JSON") out.costUsd += Number(e2.extra && e2.extra.costUsd) || 0;
            else reason = reasonOf(e2);
            if (tripsBreaker(e2)) breaker.recordFailure(e2.errorClass);
          }
        }
      } else {
        reason = reasonOf(e);
        if (tripsBreaker(e)) breaker.recordFailure(e.errorClass);
      }
    }
    if (!res) { batch.forEach((s) => unavailable(s.slotId, reason || "invalid_json")); return; }

    breaker.recordSuccess();
    out.costUsd += Number(res.costUsd) || 0;
    const usedModel = res.model || used;
    if (!out.models.includes(usedModel)) out.models.push(usedModel);
    for (const s of batch) {
      const entry = res.value.slots.find((x) => x.slotId === s.slotId);
      const byKey = {};
      for (const c of entry ? entry.cands : []) {
        const letter = String(c.id).trim().toUpperCase();
        const l = s.letters.find((x) => x.letter === letter);
        if (!l) continue;
        byKey[l.key] = {
          letter, relevance: round(c.relevance, 2), literalMatch: !!c.literalMatch, quality: round(c.quality, 2),
          issues: [...new Set(c.issues)], composition: round(c.composition, 2), bestLayout: c.bestLayout,
        };
      }
      out.bySlot[s.slotId] = { status: "ok", reason: null, model: usedModel, byKey };
    }
  });

  const all = Object.values(out.bySlot);
  const ok = all.filter((x) => x.status === "ok").length;
  out.status = all.length && ok === all.length ? "ok" : (ok > 0 ? "partial" : "unavailable");
  if (out.status !== "ok") {
    const first = all.find((x) => x.status !== "ok");
    out.reason = first ? first.reason : "no_slots";
  }
  out.costUsd = Math.round(out.costUsd * 1e8) / 1e8;
  return out;
}

module.exports = { judgeSlots, assignLetters, buildJudgeSchema, slotText, JUDGE_ISSUES, JUDGE_LAYOUTS, JUDGE_STAGE, SYSTEM_PROMPT };
