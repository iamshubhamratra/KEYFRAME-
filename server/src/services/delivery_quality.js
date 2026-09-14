// DELIVERY QUALITY — one honest verdict on a finished film, assembled from signals the
// pipeline already produced.
//
// WHY THIS EXISTS. The 9:16 audit found that every defect in the recent films had been
// DETECTED and RECORDED before delivery — `preflight.everySceneHasVisual`,
// `preflight.scenesRenderNoAsset`, `layout_review.emptyScenes`, and a QA verdict of
// `pass:false, score:4` on eight of eight films — and every one of them shipped silently.
// The signals existed; nothing turned them into something the viewer of the result could
// see. A repair lap only runs for the LLM composer (a deterministic pack would re-render
// byte-identically), so for most films "QA says 4/10" had nowhere to go.
//
// The chosen policy is DELIVER-AND-FLAG: the film is still handed over — a mediocre video
// beats a hard failure — but the job carries a verdict and the specific issues, and the
// Premiere screen shows them. The user decides whether to ship or regenerate; the system
// stops pretending everything is fine.
//
// Pure + fail-open: any missing input simply contributes no findings.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Issues are ranked so the panel leads with what a viewer would notice first.
const SEVERITY_RANK = { blocker: 0, major: 1, minor: 2 };

// The band the pacing report's own "cut cadence" check uses, repeated here (this
// function may not require the report builder — it runs inside db.shape()).
const PACE_DRIFT_PCT = 25;

function push(list, sev, area, detail, fix) {
  if (!detail) return;
  list.push({ severity: sev, area, detail: String(detail).slice(0, 240), fix: fix ? String(fix).slice(0, 200) : null });
}

/**
 * assessDelivery(job) → {
 *   verdict: "clean" | "review" | "weak",
 *   score,            // 0-100, deterministic
 *   headline,         // one sentence for the panel
 *   issues: [{severity, area, detail, fix}],
 *   signals: {...}    // the raw numbers behind the verdict
 * }
 */
function assessDelivery(job) {
  const j = job || {};
  const issues = [];

  // ---- 1) QA's pixel verdict (the only check that looks at the finished frames) ----
  const qa = j.qa || null;
  if (qa && qa.pass === false && !qa.skipped) {
    for (const i of (qa.issues || []).slice(0, 6)) {
      push(issues,
        String(i.severity || "").toLowerCase() === "blocker" ? "blocker" : "minor",
        "picture",
        `${Number.isFinite(i.atSec) ? `${i.atSec}s — ` : ""}${i.issue}`,
        i.fix);
    }
    if (!(qa.issues || []).length) {
      push(issues, "major", "picture", `The frame review scored this ${qa.score ?? "?"}/10 without naming a specific fault.`);
    }
  }

  // ---- 2) Scenes with nothing in them (the audit's primary defect) ----
  const layout = j.layout_review || null;
  const vr = j.validation_report || null;
  const emptyScenes = layout && Number.isFinite(layout.emptyScenes) ? layout.emptyScenes : null;
  const sceneCount = layout && Array.isArray(layout.scenes) ? layout.scenes.length : null;
  if (emptyScenes) {
    push(issues, emptyScenes >= 3 ? "blocker" : "major", "composition",
      `${emptyScenes}${sceneCount ? ` of ${sceneCount}` : ""} scene(s) carry no visual — they render as a template panel with only text.`,
      "Add a website URL with more product screens, upload product images, or shorten the film so every scene earns a visual.");
  }
  // preflight raises the same class of finding from a different angle; keep whichever the
  // pipeline actually recorded, without double-reporting the scene count.
  for (const w of (vr && vr.warnings) || []) {
    if (w.id === "everySceneHasVisual" && emptyScenes) continue;   // already stated above
    if (w.id === "noBrokenPaths") continue;                        // self-healed, not user-facing
    push(issues, w.id === "scenesRenderNoAsset" ? "major" : "minor", "assets", w.detail, w.fix);
  }

  // ---- 2b) THE FILE ITSELF ----
  //
  // Every other signal here describes what the pipeline INTENDED. This one describes what it
  // actually wrote to disk, and it is the only one that can catch a film delivered at the
  // wrong resolution, cut short, or silent after a voiceover was synthesised — three faults
  // that leave no trace anywhere in the plan. Produced once at finalize by
  // video_probe.recordDeliveryProbe; read here, never computed here, because this function
  // runs synchronously on every job read.
  const dp = j.delivery_probe || null;
  for (const i of (dp && Array.isArray(dp.issues) ? dp.issues : []).slice(0, 4)) {
    push(issues, i.severity === "blocker" ? "blocker" : (i.severity === "major" ? "major" : "minor"),
      "delivery", i.detail, i.fix);
  }

  // ---- 3) Audio ----
  const ar = j.audio_report || null;
  if (ar && Array.isArray(ar.issues)) {
    for (const s of ar.issues.slice(0, 3)) push(issues, "minor", "audio", s);
  }
  for (const n of (j.audio_notes || []).slice(0, 2)) push(issues, "major", "audio", n);

  // ---- 4) Language / localization degradation ----
  const lq = j.language_qa || null;
  if (lq && lq.degraded) {
    for (const n of (lq.notes || []).slice(0, 2)) push(issues, "major", "language", n);
  }

  // ---- 5) Motion ----
  const ma = j.motion_audit || null;
  if (ma && Array.isArray(ma.staticScenes) && ma.staticScenes.length) {
    push(issues, "major", "motion",
      `${ma.staticScenes.length} scene(s) have no timeline activity (${ma.staticScenes.join(", ")}) — they hold as a still frame.`);
  }

  // ---- 6) Pacing ----
  //
  // The film's cadence against the one the user picked. Read off the row, never
  // computed here: graph.buildPacingReport measured it once at finalize, and this
  // function runs synchronously inside db.shape() on every single job read, so it
  // must not touch the disk.
  //
  // MINOR, and at most one line, deliberately. The score subtracts per issue and
  // the panel shows ten of them, so a chatty pace check would depress every
  // film's number and push the faults a viewer would actually notice off the
  // list. A pace miss is not one of those faults: the film is the right length,
  // in sync, and watchable — it is simply not the film that was ordered.
  const pr = j.pacing_report || null;
  // Only a CHOSEN pace can miss. At 1.0x the target cadence is just today's
  // default, which retimeScenesToVo has always overshot (15s→18.8s in this
  // repo's own logs) — charging every neutral film for that is not a finding.
  if (pr && Number(pr.multiplier) !== 1) {
    const label = String(pr.label || pr.mode || "the requested pace");
    const want = Number(pr.target && pr.target.beatSec);
    const got = Number(pr.actual && pr.actual.avgBeatSec);
    // got === 0 is "no measurable cadence", a different and already-loud failure.
    const driftPct = (want > 0 && got > 0) ? Math.round(((got - want) / want) * 100) : null;
    if (driftPct != null && Math.abs(driftPct) > PACE_DRIFT_PCT) {
      push(issues, "minor", "pacing",
        `${label} asks for a cut every ${want}s; this film cuts every ${got}s (${driftPct > 0 ? "+" : ""}${driftPct}%).`,
        driftPct > 0
          ? "Shorten the script or ask for a longer runtime — narration holding each scene open is what stops the picture cutting sooner."
          : "The template's own rhythm is quicker than this pace asks for; a slower pace only loosens what the pack authored.");
    } else if (Array.isArray(pr.clamped) && pr.clamped.length) {
      // A clamp is the engine refusing to go further, recorded rather than
      // silently absorbed — the user asked for a density this runtime cannot hold.
      push(issues, "minor", "pacing",
        `${label} was capped by the engine: ${pr.clamped.slice(0, 2).join("; ")}.`,
        "A shorter runtime keeps the requested density inside the engine's scene and cut floors.");
    }
  }

  issues.sort((a, b) => (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3));

  if (j.used_fallback) push(issues, "major", "composition", "The film fell back to the emergency template — the designed composition failed its checks.");

  const blockers = issues.filter((i) => i.severity === "blocker").length;
  const majors = issues.filter((i) => i.severity === "major").length;
  const minors = issues.filter((i) => i.severity === "minor").length;

  // ---- score ----
  //
  // BUILT UP FROM WHAT THE FILM HAS, then charged for what is wrong — not the other way
  // round. A pure penalty model (start at 100, subtract per blocker) collapsed every
  // reviewed film to roughly zero and could not tell a composition-90 film from a
  // composition-41 one, which makes the number worse than no number: a user looking at a
  // watchable video labelled 0/100 stops believing the panel.
  const coverage = (Number.isFinite(emptyScenes) && sceneCount)
    ? clamp((sceneCount - emptyScenes) / sceneCount, 0, 1) : 0.7;   // unknown ⇒ neutral
  const comp = layout && layout.score && Number.isFinite(layout.score.compositionQuality)
    ? layout.score.compositionQuality : 70;
  const aud = ar && Number.isFinite(ar.qualityScore) ? ar.qualityScore : 80;
  let score = comp * 0.5 + aud * 0.2 + coverage * 100 * 0.3;
  score -= blockers * 8;
  score -= majors * 4;
  score -= minors * 1.5;
  if (j.used_fallback) score -= 12;
  score = clamp(Math.round(score), 5, 100);

  // A blocker means something a viewer would notice, so it caps the verdict regardless of
  // how well the deterministic signals score.
  const verdict = (blockers >= 3 || score < 45) ? "weak"
    : (blockers || issues.length) ? "review"
      : "clean";
  const headline = verdict === "clean"
    ? "No quality issues detected."
    : verdict === "review"
      ? `Delivered with ${issues.length} thing${issues.length === 1 ? "" : "s"} worth checking.`
      : `Delivered, but the automated review flagged ${blockers ? `${blockers} blocking issue${blockers === 1 ? "" : "s"}` : "significant problems"}. Consider regenerating.`;

  return {
    verdict, score, headline,
    issues: issues.slice(0, 10),
    counts: { blockers, majors, minors },
    signals: {
      qaScore: qa && Number.isFinite(qa.score) ? qa.score : null,
      qaPass: qa ? qa.pass !== false : null,
      qaSkipped: !!(qa && qa.skipped),
      emptyScenes, sceneCount,
      compositionQuality: layout && layout.score ? layout.score.compositionQuality : null,
      audioQuality: ar ? ar.qualityScore : null,
      // null on every film made before the pacing engine, and on any film whose
      // report never got written.
      pace: pr ? (pr.mode || null) : null,
      usedFallback: !!j.used_fallback,
      // The artifact's own numbers, so the panel can state them rather than imply them.
      delivered: dp && dp.ok ? {
        width: dp.width, height: dp.height, durationSec: dp.durationSec,
        fps: dp.fps, bitrateKbps: dp.bitrateKbps, hasAudio: dp.hasAudio,
      } : null,
    },
  };
}

module.exports = { assessDelivery };
