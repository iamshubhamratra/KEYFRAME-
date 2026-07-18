// SCREENSHOT QA AGENT — the last gate between a website capture and the screen.
//
// Runs AFTER all screenshots are collected (ingest landing shots + the
// Screenshot Director's topic captures) and BEFORE the creative director /
// composition ever sees them. Screenshots are "trusted owner content" so they
// skip the stock relevance gate — which meant a capture that came back as a
// 404, a Cloudflare bot-wall, a cookie-consent modal or a blank half-render
// went straight into the film as a full-screen hero shot. This agent looks at
// every capture and DROPS the broken ones.
//
// One batched vision pass (chunks of 6), same cheap flash model as the other
// directors. FAIL-OPEN by design: any error (dead budget, un-thumbnailable
// file, bad JSON, missing verdict) keeps that screenshot, so QA can only ever
// remove provably-bad captures — never block a job or strip a film of every
// product shot by accident.

const fs = require("node:fs");
const path = require("node:path");
const { thumbBase64 } = require("./asset_vision");
const openrouter = require("./openrouter");
const { extractFirstJsonObject } = require("./json_lenient");

const SYSTEM = fs.readFileSync(
  path.join(__dirname, "..", "prompts", "system_screenshot_qa.md"),
  "utf8",
);

const PROBLEMS = new Set([
  "error-page", "blocked", "consent-overlay", "login-wall",
  "blank", "loading", "broken-layout", "wrong-content",
]);

// -> array aligned 1:1 with `shots`, each {pass:boolean, problem?, sees?}.
//    Fail-open: {pass:true} wherever the model was silent or errored.
// `shots`: [{ absPath, label? }]
async function inspectScreenshots({ shots, subject, tracker, signal } = {}) {
  const out = (shots || []).map(() => ({ pass: true }));
  if (!Array.isArray(shots) || !shots.length) return out;

  const CHUNK = 6;
  for (let start = 0; start < shots.length; start += CHUNK) {
    const chunk = shots.slice(start, start + CHUNK);
    try {
      const thumbs = [];
      for (const s of chunk) thumbs.push(await thumbBase64(s.absPath, false));
      const usable = thumbs.map((b, i) => ({ b, i })).filter((x) => x.b);
      if (!usable.length) continue;

      const content = [{
        type: "text",
        text:
          `These ${usable.length} website screenshot(s) were captured for a short promo film about: "${subject || "a product"}". ` +
          `For EACH, return its verdict per the schema. ` +
          `The screenshots follow, each preceded by its number (1..${usable.length}).`,
      }];
      usable.forEach((x, n) => {
        const s = chunk[x.i] || {};
        content.push({ type: "text", text: `Screenshot ${n + 1}${s.label ? ` (${s.label})` : ""}:` });
        content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${x.b}` } });
      });

      const { text, tokensIn, tokensOut } = await openrouter.chat({
        system: SYSTEM,
        user: content,
        jsonMode: true,
        stage: "screenshotQa",
        temperature: 0,
        signal,
      });
      if (tracker) tracker.addLlm({ inputTokens: tokensIn, outputTokens: tokensOut, stage: "screenshotQa" });

      const parsed = extractFirstJsonObject(text);
      const arr = Array.isArray(parsed && parsed.shots) ? parsed.shots : [];
      const byN = new Map();
      for (const v of arr) { const n = Number(v && v.n); if (Number.isFinite(n)) byN.set(n, v); }
      usable.forEach((x, n) => {
        const v = byN.get(n + 1);
        if (!v) return;
        const fail = String(v.verdict || "").toLowerCase() === "fail";
        out[start + x.i] = {
          pass: !fail,
          problem: fail && PROBLEMS.has(v.problem) ? v.problem : (fail ? "broken-layout" : undefined),
          sees: typeof v.sees === "string" ? v.sees.slice(0, 80) : undefined,
        };
      });
    } catch {
      // fail-open: keep every screenshot in this chunk
    }
  }
  return out;
}

// Convenience wrapper used by the pipelines: takes the pinned screenshot asset
// objects (path relative to jobDir, source:"website"), inspects them, DELETES
// the failed captures from disk and returns only the survivors. Non-screenshot
// assets in the input are passed through untouched.
async function qaGateScreenshots({ assets, jobDir, subject, tracker, log = console } = {}) {
  const list = Array.isArray(assets) ? assets : [];
  const shotIdx = [];
  list.forEach((a, i) => { if (a && a.source === "website" && a.type === "image") shotIdx.push(i); });
  if (!shotIdx.length) return list;

  const verdicts = await inspectScreenshots({
    shots: shotIdx.map((i) => ({
      absPath: path.isAbsolute(list[i].path) ? list[i].path : path.join(jobDir, list[i].path),
      label: list[i].alt ? String(list[i].alt).slice(0, 70) : undefined,
    })),
    subject, tracker,
  });

  const dropped = new Set();
  verdicts.forEach((v, k) => {
    const i = shotIdx[k];
    if (v.pass) {
      if (v.sees) log.log?.(`[screenshot-qa] shot ok (${v.sees}) — ${path.basename(list[i].path)}`);
      return;
    }
    dropped.add(i);
    log.warn?.(`[screenshot-qa] shot REJECTED (${v.problem}${v.sees ? `: ${v.sees}` : ""}) — ${path.basename(list[i].path)}`);
    const abs = path.isAbsolute(list[i].path) ? list[i].path : path.join(jobDir, list[i].path);
    try { fs.unlinkSync(abs); } catch { /* noop */ }
  });

  if (!dropped.size) return list;
  // A broken capture full-screen is worse than no capture: when every shot
  // fails QA the film falls back to stock/vector art, which the composition
  // already handles for screenshot-less jobs.
  if (dropped.size === shotIdx.length) {
    log.warn?.(`[screenshot-qa] all ${shotIdx.length} screenshots failed QA — composition falls back to stock/vector art`);
  }
  return list.filter((_, i) => !dropped.has(i));
}

module.exports = { inspectScreenshots, qaGateScreenshots };
