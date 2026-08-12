// OVERNIGHT QA — generate a spread of real films, then MEASURE each one.
//
// The point is not to make 10 videos. It is to turn "is the video good?" into
// something a machine can answer while nobody is watching, so the morning starts
// from a list of named defects instead of from watching ten films.
//
// Every check here measures the RENDERED OUTPUT, because that is the only thing
// that has ever caught these bugs: this session's real defects (a slot type
// mismatch that blanked every scene, a board drawn with 2 of 3 columns, a scene
// body that resolved to an empty array) all passed the structural gates and were
// only visible in a frame.
//
//   node scripts/overnight-qa.js            # submit + wait + audit
//   node scripts/overnight-qa.js --audit    # re-audit whatever already finished
//   node scripts/overnight-qa.js --status   # progress only
//
// Writes framecheck/overnight/<run>/report.json and prints a ranked defect list.

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "framecheck", "overnight");
const PORT = (() => { try { return require("../config.json").server.port || 8080; } catch { return 8080; } })();

// Ten packs chosen to spread the RISK, not to look pretty: both orientations,
// every renderer family, and the specific packs this session found defects in
// (birdsong-field had the empty `cards` body, cadence-premium the short board row,
// teampulse the 3%-ink frame, blueprint-atelier the slow entrance).
const MATRIX = [
  { pack: "birdsong-field",    orientation: "vertical",   prompt: "A warm, friendly promo for Trello — the everyday board that keeps a small team in sync." },
  { pack: "cadence-premium",   orientation: "vertical",   prompt: "A calm, premium promo for Linear — issue tracking built for software teams that ship." },
  { pack: "teampulse",         orientation: "vertical",   prompt: "An energetic promo for a team status app that replaces the daily standup meeting." },
  { pack: "alchemy",           orientation: "vertical",   prompt: "A mystical, dark promo for a note-taking app that turns scattered thoughts into structure." },
  { pack: "nimbus-saas",       orientation: "horizontal", prompt: "A bright, clean promo for a cloud storage service for design teams." },
  { pack: "blueprint-atelier", orientation: "horizontal", prompt: "A technical promo for an API monitoring tool that shows latency across regions." },
  { pack: "sketchnote",        orientation: "horizontal", prompt: "A hand-drawn promo for an online course platform for illustrators." },
  { pack: "terminal-green",    orientation: "horizontal", prompt: "A retro-terminal promo for a command-line deployment tool for developers." },
  { pack: "bold-poster",       orientation: "vertical",   prompt: "A loud, poster-style promo for a music festival ticketing app." },
  { pack: "midnight-glass",    orientation: "vertical",   prompt: "A sleek, dark promo for a personal finance app that tracks subscriptions." },
];

const DURATION = Number(process.env.QA_DURATION) || 30;

function post(pathname, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({ host: "127.0.0.1", port: PORT, path: pathname, method: "POST",
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(data) } },
      (res) => { const c = []; res.on("data", (d) => c.push(d)); res.on("end", () => {
        const txt = Buffer.concat(c).toString();
        try { resolve({ status: res.statusCode, body: JSON.parse(txt) }); }
        catch { resolve({ status: res.statusCode, body: txt }); }
      }); });
    req.on("error", reject);
    req.write(data); req.end();
  });
}
function get(pathname) {
  return new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port: PORT, path: pathname }, (res) => {
      const c = []; res.on("data", (d) => c.push(d)); res.on("end", () => {
        const txt = Buffer.concat(c).toString();
        try { resolve(JSON.parse(txt)); } catch { resolve(txt); }
      });
    }).on("error", reject);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- the audit ------------------------------------------------------------------
function probe(mp4) {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v",
    "-show_entries", "stream=width,height:format=duration", "-of", "csv=p=0", mp4],
    { encoding: "utf8", windowsHide: true });
  const out = String(r.stdout || "").trim().split("\n");
  if (out.length < 2) return null;
  const [w, h] = out[0].split(",").map(Number);
  const dur = parseFloat(out[1]);
  return isFinite(dur) && dur > 0 ? { w, h, dur } : null;
}

async function auditFilm(job) {
  const defects = [];
  const jobDir = path.join(ROOT, "jobs", job.id);
  const mp4 = [path.join(ROOT, "public", "videos", `${job.id}.mp4`),
    path.join(jobDir, "final.mp4"), path.join(jobDir, "best-lap.mp4")].find((f) => fs.existsSync(f));

  if (!mp4) return { id: job.id, pack: job.pack, defects: [{ kind: "no-output", severity: "critical", detail: "no rendered mp4 found" }] };

  const meta = probe(mp4);
  if (!meta) return { id: job.id, pack: job.pack, defects: [{ kind: "unplayable", severity: "critical", detail: "ffprobe cannot decode the file" }] };

  // 1. Orientation actually matches what was asked for.
  const wantPortrait = job.orientation === "vertical";
  if (wantPortrait !== (meta.h > meta.w)) {
    defects.push({ kind: "wrong-orientation", severity: "critical", detail: `asked ${job.orientation}, got ${meta.w}x${meta.h}` });
  }
  // 2. Duration is close to what was requested (a truncated render is silent).
  if (meta.dur < DURATION * 0.6) {
    defects.push({ kind: "short-render", severity: "critical", detail: `${meta.dur.toFixed(1)}s of a requested ${DURATION}s` });
  }

  // 3. EMPTY SLIDES, measured in pixels, using the film's own scene boundaries.
  try {
    const { scanFilm } = require("../src/services/frame_density");
    let scenes = [];
    try {
      const rec = (await get(`/api/projects/${job.id}`)) || {};
      let s = rec.script; if (typeof s === "string") s = JSON.parse(s);
      scenes = ((s && s.scenes) || []).map((x, i) => ({ id: x.id ?? i + 1, start: +x.start, duration: +x.duration }))
        .filter((x) => isFinite(x.start) && isFinite(x.duration));
    } catch { /* fall back to blind sampling */ }
    const dens = await scanFilm(mp4, { scenes, portrait: wantPortrait, durationSec: meta.dur });
    for (const f of dens.findings) {
      defects.push({ kind: f.kind, severity: "major", detail: `scene ${f.sceneId} @${f.t}s — ${f.why}` });
    }
  } catch (e) {
    defects.push({ kind: "density-scan-failed", severity: "minor", detail: String(e.message).slice(0, 120) });
  }

  // 4. What the pipeline itself admitted to substituting.
  try {
    const fb = JSON.parse(fs.readFileSync(path.join(jobDir, "fallbacks.json"), "utf8"));
    if (fb.bySeverity && fb.bySeverity.content > 0) {
      defects.push({ kind: "content-fallbacks", severity: "major", detail: `${fb.bySeverity.content} content slot(s) resolved to nothing (score ${fb.score})` });
    }
  } catch { /* the graph path does not write this yet — see the audit note */ }

  // 5. Off-topic imagery, from the relevance scores already on the assets.
  try {
    const rec = (await get(`/api/projects/${job.id}`)) || {};
    const assets = Array.isArray(rec.assets) ? rec.assets : [];
    const scored = assets.filter((a) => typeof a.clipRelevance === "number");
    const weak = scored.filter((a) => a.clipRelevance < 0.15);
    if (weak.length) {
      defects.push({ kind: "off-topic-assets", severity: "major",
        detail: `${weak.length}/${scored.length} assets below 0.15 relevance: ` +
          weak.slice(0, 4).map((a) => `${a.source || "?"} "${String(a.alt || "").slice(0, 30)}" ${a.clipRelevance.toFixed(2)}`).join("; ") });
    }
    if (scored.length === 0 && assets.length) {
      defects.push({ kind: "assets-unscored", severity: "minor", detail: `${assets.length} assets carry no relevance score at all` });
    }
  } catch { /* record nothing rather than guess */ }

  return { id: job.id, pack: job.pack, orientation: job.orientation, mp4, meta, defects };
}

// ---- run ------------------------------------------------------------------------
(async () => {
  const args = process.argv.slice(2);
  const runDir = path.join(OUT, "run");
  fs.mkdirSync(runDir, { recursive: true });
  const statePath = path.join(runDir, "jobs.json");
  let jobs = [];
  try { jobs = JSON.parse(fs.readFileSync(statePath, "utf8")); } catch { /* new run */ }

  if (!args.includes("--audit") && !args.includes("--status") && !jobs.length) {
    console.log(`[qa] submitting ${MATRIX.length} job(s) to :${PORT}`);
    for (const m of MATRIX) {
      try {
        const r = await post("/api/projects", {
          prompt: m.prompt, framePack: m.pack, orientation: m.orientation,
          duration: DURATION, tts: true, music: true, captions: false, autopilot: true,
        });
        const id = r.body && (r.body.projectId || r.body.id || (r.body.project && r.body.project.id));
        if (id) { jobs.push({ ...m, id }); console.log(`[qa]   ${m.pack.padEnd(20)} -> ${id}`); }
        else console.log(`[qa]   ${m.pack.padEnd(20)} -> REJECTED ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
        if (!id && r.status === 429) {
          console.log(`[qa]   rate limited — waiting 1h then retrying ${m.pack}`);
          await sleep(1000 * 60 * 61);
          const r2 = await post("/api/projects", { prompt: m.prompt, framePack: m.pack, orientation: m.orientation, duration: DURATION, tts: true, music: true, captions: false, autopilot: true });
          const id2 = r2.body && (r2.body.projectId || r2.body.id);
          if (id2) { jobs.push({ ...m, id: id2 }); console.log(`[qa]   ${m.pack.padEnd(20)} -> ${id2}`); }
          fs.writeFileSync(statePath, JSON.stringify(jobs, null, 2), "utf8");
        }
      } catch (e) { console.log(`[qa]   ${m.pack}: ${e.message}`); }
      await sleep(1500);
    }
    fs.writeFileSync(statePath, JSON.stringify(jobs, null, 2), "utf8");
  }
  if (!jobs.length) { console.log("[qa] no jobs — is the server up?"); process.exit(1); }

  if (!args.includes("--audit")) {
    console.log(`[qa] waiting for ${jobs.length} render(s)`);
    const deadline = Date.now() + 1000 * 60 * 60 * 6;
    for (;;) {
      let done = 0, failed = 0;
      for (const j of jobs) {
        try {
          const rec = await get(`/api/projects/${j.id}`);
          const st = rec && rec.status;
          if (st === "done" || rec.video_url) done++;
          else if (st === "script_review") { await post(`/api/projects/${j.id}/approve`, {}); console.log(`[qa] approved ${j.pack} (was parked at script_review)`); }
          else if (st === "error" || st === "failed") { failed++; j.failed = true; }
        } catch { /* server busy */ }
      }
      console.log(`[qa] ${done}/${jobs.length} done, ${failed} failed`);
      if (done + failed >= jobs.length || Date.now() > deadline || args.includes("--status")) break;
      await sleep(60000);
    }
    if (args.includes("--status")) return;
  }

  console.log(`[qa] auditing`);
  const reports = [];
  for (const j of jobs) reports.push(await auditFilm(j));
  fs.writeFileSync(path.join(runDir, "report.json"), JSON.stringify(reports, null, 2), "utf8");

  const rank = { critical: 0, major: 1, minor: 2 };
  const withDefects = reports.filter((r) => r.defects.length)
    .sort((a, b) => (rank[a.defects[0].severity] ?? 3) - (rank[b.defects[0].severity] ?? 3));
  console.log(`\n[qa] ${reports.length} film(s); ${withDefects.length} with defects\n`);
  for (const r of withDefects) {
    console.log(`${r.pack} (${r.id})`);
    for (const d of r.defects) console.log(`   [${d.severity}] ${d.kind}: ${d.detail}`);
  }
  const clean = reports.filter((r) => !r.defects.length).map((r) => r.pack);
  if (clean.length) console.log(`\nclean: ${clean.join(", ")}`);
  console.log(`\nreport: ${path.join(runDir, "report.json")}`);
})();
