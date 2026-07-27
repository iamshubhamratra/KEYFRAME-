#!/usr/bin/env node
// Re-price historical jobs against the corrected rate tables.
//
// WHY: until the usage fix, every stored cost was wrong three ways — the rate table
// was two model generations stale (gemini-3.5-flash priced at 0.30/2.50 when the real
// rate is 1.50/9.00), KIE spend was billed at OpenRouter rates, and the intake act's
// cost was overwritten by the production act. This re-prices what was recorded so the
// gallery's history is comparable with new runs.
//
// WHAT IT CAN AND CANNOT RECOVER
//
//   CAN   re-price every stored per-stage token count at the verified rates, and
//         attribute each stage to the provider that serves it.
//   CANNOT recover the brief/script tokens that markDone overwrote. Those bytes are
//         gone. Jobs missing them are flagged `intakeMissing: true` and their total
//         remains an under-count — an honest one, rather than a fabricated estimate.
//
// PROVIDER ATTRIBUTION is inferred, and the inference is recorded on each job:
//   • The four directors (creative/art/audio/caption) pass an explicit `model` to
//     chat(), which BYPASSES KIE by construction — so those rows are certainly
//     OpenRouter.
//   • Every other stage goes KIE-first with an OpenRouter fallback. Which one answered
//     was never recorded, so we assume KIE (the primary, and the usual winner). Where
//     that assumption is wrong the job is under-priced, since KIE is ~30% of
//     OpenRouter's rate.
//
// SAFETY: the DB is an in-memory Map that the server persists on a timer, so the
// server MUST be stopped before running this or its next write will clobber the
// result. The script refuses to run if it can reach the server, writes atomically via
// a temp file, and always leaves a timestamped backup.

const fs = require("node:fs");
const path = require("node:path");
const config = require("../src/config");
const { priceFor, ttsPrice } = require("../src/services/usage");

const DB = config.paths.dbFile;
const APPLY = process.argv.includes("--apply");
const RATES_VERIFIED = "2026-07-27";

// Stages whose caller passes an explicit model → never routed through KIE.
const OPENROUTER_ONLY = new Set(["creative_director", "art_director", "audio_director", "caption_director"]);
const providerFor = (stage) => (OPENROUTER_ONLY.has(stage) ? "openrouter" : "kie");

// The director's OWN configured model, which is what it actually called with.
//
// The stored `model` on a legacy row is whatever modelForStage() returned when the
// report was computed — but the directors have always passed `model: cd().model`
// explicitly, so they never ran on llm.model regardless of what got recorded. On jobs
// predating the stageModels registration the stored value is therefore wrong: one row
// claims gemini-3.5-flash for a creative_director call that really used flash-lite,
// which would over-price it 6x. For these four stages the director's configured model
// is the better evidence (1 of 225 rows differs).
const DIRECTOR_MODEL = {
  creative_director: (config.creativeDirector || {}).model,
  art_director:      (config.artDirector || {}).model,
  audio_director:    (config.audioDirector || {}).model,
  caption_director:  (config.captions || {}).model,
};
const modelFor = (b) => DIRECTOR_MODEL[b.stage] || b.model;

const r6 = (n) => Math.round(n * 1e6) / 1e6;

async function main() {
  // Refuse to race the server.
  const port = config.server.port;
  const live = await fetch(`http://localhost:${port}/health`, { signal: AbortSignal.timeout(1500) })
    .then((r) => r.ok).catch(() => false);
  if (live) {
    console.error(`REFUSING TO RUN: the server is up on :${port}. It holds the job store in memory and`);
    console.error("would overwrite this backfill on its next persist. Stop it, then re-run.");
    process.exit(1);
  }

  const jobs = JSON.parse(fs.readFileSync(DB, "utf8"));
  let repriced = 0, skipped = 0, intakeMissing = 0;
  let oldSum = 0, newSum = 0;
  const rows = [];

  for (const j of jobs) {
    const u = j.usage;
    if (!u || !Array.isArray(u.byStage) || !u.byStage.length) { skipped++; continue; }
    if (u.pricing && u.pricing.backfilledAt) { skipped++; continue; }   // idempotent

    let llmIn = 0, llmOut = 0;
    const byProvider = {};
    const byStage = u.byStage.map((b) => {
      const provider = b.provider || providerFor(b.stage);
      const model = modelFor(b);
      const pr = priceFor(model, provider);
      const inUsd = ((b.inputTokens || 0) * pr.in) / 1e6;
      const outUsd = ((b.outputTokens || 0) * pr.out) / 1e6;
      llmIn += inUsd; llmOut += outUsd;
      const acc = (byProvider[provider] ||= { inputTokens: 0, outputTokens: 0, callCount: 0, costUsd: 0 });
      acc.inputTokens += b.inputTokens || 0;
      acc.outputTokens += b.outputTokens || 0;
      acc.callCount += b.callCount || 0;
      acc.costUsd = r6(acc.costUsd + inUsd + outUsd);
      return { ...b, model, provider, rateInPerM: pr.in, rateOutPerM: pr.out, costUsd: r6(inUsd + outUsd) };
    }).sort((x, y) => y.costUsd - x.costUsd);

    // TTS token estimates were recorded correctly; only the rate lookup changes.
    const tp = ttsPrice();
    const ttsIn = ((u.tts && u.tts.inputTokensEst) || 0) * tp.in / 1e6;
    const ttsOut = ((u.tts && u.tts.outputTokensEst) || 0) * tp.out / 1e6;

    const total = r6(llmIn + llmOut + ttsIn + ttsOut);
    const before = u.totalCostUsd || 0;

    const stages = new Set(byStage.map((b) => b.stage));
    const lostIntake = j.kind === "project" && (j.status === "done" || j.status === "failed")
      && !stages.has("brief") && !stages.has("script");
    if (lostIntake) intakeMissing++;

    if (APPLY) {
      u.byStage = byStage;
      u.byProvider = byProvider;
      u.llm = { ...u.llm, inputCostUsd: r6(llmIn), outputCostUsd: r6(llmOut), totalCostUsd: r6(llmIn + llmOut) };
      u.tts = { ...u.tts, inputCostUsd: r6(ttsIn), outputCostUsd: r6(ttsOut), totalCostUsd: r6(ttsIn + ttsOut) };
      u.totalCostUsd = total;
      u.pricing = {
        backfilledAt: new Date().toISOString(),
        ratesVerified: RATES_VERIFIED,
        originalTotalCostUsd: r6(before),
        providerInferred: true,
        providerRule: "the four directors pass an explicit model and are certainly OpenRouter; every other stage is assumed KIE (the primary) because the serving provider was never recorded",
        intakeMissing: lostIntake,
        note: lostIntake
          ? "brief/script cost was overwritten by the production act before the merge fix and cannot be recovered — this total still excludes it"
          : undefined,
      };
    }

    oldSum += before; newSum += total; repriced++;
    rows.push({ id: j.id, kind: j.kind, before: r6(before), after: total, lostIntake });
  }

  if (APPLY) {
    const bak = `${DB}.bak-backfill-${Date.now()}`;
    fs.copyFileSync(DB, bak);
    const tmp = `${DB}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(jobs), "utf8");
    fs.renameSync(tmp, DB);
    console.log(`WROTE ${DB}  (backup: ${path.basename(bak)})`);
  } else {
    console.log("DRY RUN — pass --apply to write\n");
  }

  console.log(`re-priced   : ${repriced} job(s)`);
  console.log(`skipped     : ${skipped} (no usage report, or already backfilled)`);
  console.log(`intake lost : ${intakeMissing} job(s) still under-count (brief/script unrecoverable)`);
  console.log(`total spend : $${r6(oldSum)}  ->  $${r6(newSum)}   (x${(newSum / (oldSum || 1)).toFixed(2)})`);
  console.log("\nlargest corrections:");
  for (const r of rows.sort((a, b) => (b.after - b.before) - (a.after - a.before)).slice(0, 8)) {
    console.log(`  ${r.id}  $${r.before}  ->  $${r.after}${r.lostIntake ? "   (intake still missing)" : ""}`);
  }
}

main().catch((e) => { console.error("backfill failed:", e.message); process.exit(1); });
