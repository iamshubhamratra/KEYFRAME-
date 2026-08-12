// What is QA actually objecting to? The verdict is logged as a COUNT and never
// written to disk, so re-run the same review against a finished film and print
// the issues verbatim.
const fs = require("fs");
const path = require("path");
const { reviewRender } = require("../src/agents/qa_agent");

const JOB = process.argv[2] || "dpqlsr1aoi";
const PACK = process.argv[3] || "fetch-vertical";
const dir = path.join(__dirname, "..", "jobs", JOB);

(async () => {
  const meta = JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8"));
  const video = ["best-lap.mp4", "video.mp4"].map((f) => path.join(dir, f)).find((f) => fs.existsSync(f));
  if (!video) { console.log("no video in", dir); process.exit(1); }

  // Same inputs the graph passes: effective (rendered) duration, real dims,
  // deterministic=true because a pinned template is not an LLM composition.
  const v = await reviewRender({
    videoPath: video,
    scenes: [],
    duration: meta.duration,
    framePack: PACK,
    workDir: path.join(dir, "qa_probe"),
    dims: { width: meta.width, height: meta.height },
    deterministic: true,
  });
  console.log(`\npass=${v.pass} score=${v.score} issues=${(v.issues || []).length}`);
  for (const i of v.issues || []) {
    console.log(`\n[${String(i.severity || "?").toUpperCase()}] ${i.title || i.type || ""}`);
    console.log(`  where: ${i.where || i.timestamp || i.t || "—"}`);
    console.log(`  ${String(i.detail || i.description || i.message || JSON.stringify(i)).slice(0, 400)}`);
    if (i.fix) console.log(`  suggested fix: ${String(i.fix).slice(0, 200)}`);
  }
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
