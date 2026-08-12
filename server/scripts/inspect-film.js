// INSPECT A FINISHED FILM — the objective signals, in one place.
//
// Built because "the quality is 2/10" was only checkable by watching, and the
// gates that DID have the answer each held one piece of it: the QA verdict knew
// the film crashed, the job record knew every picture's topic-relevance score,
// the audio report knew which layers were actually mixed. This prints all of it
// for one job so a regression is a diff, not an argument.
//
//   node scripts/inspect-film.js <jobId>
//   node scripts/inspect-film.js --latest

const fs = require("node:fs");
const path = require("node:path");
const { runtimeCheck } = require("../src/services/runtime_check");

const JOBS = path.join(__dirname, "..", "jobs");
const arg = process.argv[2];

function loadJob(id) {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "jobs.json"), "utf8"));
  const arr = Array.isArray(raw) ? raw : (raw.jobs || Object.values(raw));
  if (id && id !== "--latest") return arr.find((j) => j.id === id);
  return arr.filter((j) => j.status === "done").sort((a, b) => (b.finished_at || 0) - (a.finished_at || 0))[0];
}

const job = loadJob(arg);
if (!job) { console.error("no such job"); process.exit(1); }
const dir = path.join(JOBS, job.id);
const line = (s) => console.log(s);
const rule = () => line("-".repeat(76));

(async () => {
  line(`\nFILM ${job.id}  —  ${job.status}  ·  pack "${job.frame_pack}"  ·  ${job.orientation} ${job.duration}s  ·  ${job.compose_mode || "default"}`);
  if (job.prompt) line(`prompt: ${String(job.prompt).slice(0, 90)}`);
  rule();

  // ---- 1. did it actually render? -------------------------------------------
  let verdict = null;
  try { verdict = JSON.parse(fs.readFileSync(path.join(dir, "qa", "verdict.json"), "utf8")); } catch { /* no QA */ }
  if (verdict) {
    const blockers = (verdict.issues || []).filter((i) => String(i.severity).toLowerCase() === "blocker");
    line(`QA        : ${verdict.pass ? "PASS" : "FAIL"}  score ${verdict.score}/100  ·  ${blockers.length} blocker(s)${verdict.unverified ? "  (UNVERIFIED)" : ""}`);
    for (const b of blockers.slice(0, 6)) line(`            [${b.atSec}s] ${String(b.issue).slice(0, 92)}`);
  } else line("QA        : (no verdict written)");

  if (fs.existsSync(path.join(dir, "index.html"))) {
    const rt = await runtimeCheck(dir).catch((e) => ({ ok: true, skipped: e.message }));
    line(`RUNTIME   : ${rt.ok ? "clean across the timeline" : "BROKEN — " + rt.error}${rt.skipped ? ` (skipped: ${rt.skipped})` : ""}`);
  }
  rule();

  // ---- 2. do the pictures match the words? ----------------------------------
  const scenes = new Map(((job.script && job.script.scenes) || []).map((s) => [String(s.id), s]));
  const assets = job.assets || [];
  const pinned = assets.filter((a) => a.sceneId != null);
  line(`ASSETS    : ${assets.length} kept  ·  ${pinned.length} pinned to a scene  ·  ${assets.filter((a) => /pixabay|openverse|pexels/.test(String(a.source))).length} stock  ·  ${assets.filter((a) => String(a.source) === "website").length} screenshot(s)`);
  const needs = ((job.script && job.script.scenes) || []).reduce((n, s) => n + ((s.assetNeeds || []).length), 0);
  line(`            script requested ${needs} asset(s)`);
  let offTopic = 0;
  for (const a of pinned) {
    const sc = scenes.get(String(a.sceneId));
    const rel = typeof a.clipRelevance === "number" ? a.clipRelevance : null;
    const flag = rel != null && rel < 0.10 ? " <== OFF-TOPIC" : "";
    if (flag) offTopic++;
    line(`   ${String(path.basename(a.path)).padEnd(28)} rel=${(rel == null ? "  -  " : rel.toFixed(3)).padStart(5)}  ${a.sceneId}: "${String(sc && sc.voiceover || "").slice(0, 44)}"${flag}`);
  }
  line(`            ${offTopic} pinned asset(s) below the 0.10 relevance floor`);
  rule();

  // ---- 3. does the audio move with the film? --------------------------------
  let rep = null;
  try { rep = JSON.parse(fs.readFileSync(path.join(dir, "audio", "audio-report.json"), "utf8")); } catch { /* mixed away */ }
  if (rep) {
    line(`AUDIO     : ${rep.integratedLufs ?? "?"} LUFS (target ${rep.targetLufs})  ·  peak ${rep.truePeakDb ?? "?"} dBTP  ·  layers ${JSON.stringify(rep.layers)}`);
    // The mixer reports this nested under `layers`, not at the top level — reading
    // it from the root said "FLAT bed" on a film whose bed demonstrably moved.
    const envOn = !!(rep.layers && rep.layers.musicEnvelope);
    line(`            music envelope applied: ${envOn ? "YES (bed moves with the scenes)" : "no — FLAT bed for the whole film"}`);
    line(`            ducking active: ${rep.duckingActive ? "yes" : "no"}`);
  } else line("AUDIO     : (no audio report)");
  const cues = ((job.script && job.script.scenes) || []).map((s) => s.musicCue).filter(Boolean);
  if (cues.length) line(`            script music curve: ${cues.join(" > ")}`);
  if (job.script && job.script.music) line(`            bed query: "${job.script.music.query}" (mood "${job.script.music.mood}")`);
  rule();

  // ---- 4. where did the time go? --------------------------------------------
  const st = job.stage_timings || {};
  if (st.nodes) {
    const rows = Object.entries(st.nodes)
      .map(([node, v]) => ({ node, ms: typeof v === "number" ? v : v.ms, calls: typeof v === "number" ? 1 : v.calls }))
      .sort((a, b) => b.ms - a.ms);
    const total = Number(st.productionMs) || rows.reduce((a, r) => a + r.ms, 0);
    const sum = rows.reduce((a, r) => a + r.ms, 0);
    line(`TIME      : ${(total / 1000).toFixed(1)}s production  (ingest ${((st.ingestMs || 0) / 1000).toFixed(0)}s · script ${((st.scriptMs || 0) / 1000).toFixed(0)}s · brief ${((st.briefMs || 0) / 1000).toFixed(0)}s)`);
    for (const r of rows.slice(0, 8)) {
      const pct = total > 0 ? ((r.ms / total) * 100).toFixed(0) : "?";
      line(`   ${r.node.padEnd(24)} ${(r.ms / 1000).toFixed(1).padStart(7)}s  ${String(pct).padStart(3)}%${r.calls > 1 ? `  x${r.calls}` : ""}`);
    }
    // Node time summing above the total is the fan-out doing its job; summing
    // BELOW it means most of the run was spent outside the graph nodes entirely.
    line(`            node sum ${(sum / 1000).toFixed(1)}s vs ${(total / 1000).toFixed(1)}s total — ${sum > total * 1.15 ? "fan-out is overlapping work" : "work is essentially SERIAL"}`);
    rule();
  } else if (st.productionMs) {
    line(`TIME      : ${(st.productionMs / 1000).toFixed(1)}s production — no per-node breakdown (job predates node timing)`);
    rule();
  }

  // A JOB THAT DIED IS NOT A CLEAN FILM.
  //
  // Every check below asks "is this film good?", and each one answers "nothing
  // wrong here" when the artefact it inspects is simply ABSENT. On a failed run
  // that is every check at once, so the tool printed "clean on every signal" for a
  // job with no video, no assets and no audio — the most confident possible
  // reading of a total failure. Status is checked first and short-circuits.
  const notes = [];
  if (job.status !== "done") {
    line(`VERDICT   : JOB ${String(job.status).toUpperCase()} — no film was produced${job.error ? `: ${String(job.error).slice(0, 120)}` : ""}`);
    line(`            (the checks above are blank because the artefacts do not exist, not because they passed)`);
    line("");
    return;
  }
  if (verdict && !verdict.pass) notes.push("QA failed");
  if (offTopic) notes.push(`${offTopic} off-topic picture(s)`);
  if (rep && !(rep.layers && rep.layers.musicEnvelope)) notes.push("flat music bed");
  if (needs && assets.filter((a) => /pixabay|openverse|pexels/.test(String(a.source))).length < needs / 2) notes.push("fewer than half the requested stock assets landed");
  line(notes.length ? `VERDICT   : ${notes.join(" · ")}` : "VERDICT   : clean on every signal this tool can measure");
  line("");
})();
