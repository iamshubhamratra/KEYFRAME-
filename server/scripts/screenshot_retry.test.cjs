// A dropped capture must be RETRIED, not silently replaced by stock.
//
// Measured on a finished film: {"kept":2,"dropped":2,"problems":["login-wall",
// "scene-mismatch"]} — half the real product photography deleted, nothing tried
// again, and generic stock filled the hole. These checks pin the two halves of
// the fix: the gate still drops a bad capture AND reports which scene was
// orphaned, and the retry never makes things worse when it cannot help.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { qaGateScreenshots } = require("../src/services/screenshot_qa");
const { recaptureForScenes } = require("../src/services/screenshot_director");

let failed = 0;
const check = (name, cond, detail) => {
  if (cond) { console.log(`  ok    ${name}`); return; }
  failed++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
};

const jobDir = fs.mkdtempSync(path.join(os.tmpdir(), "kf-shot-retry-"));
fs.mkdirSync(path.join(jobDir, "assets", "images"), { recursive: true });
const shot = (n, sceneId) => {
  const rel = `assets/images/page_${n}_x.png`;
  fs.writeFileSync(path.join(jobDir, rel), "x");
  return {
    path: rel, type: "image", source: "website", sceneId,
    width: 2732, height: 1800, ratio: 1.518, sourceUrl: `https://example.com/p${n}`,
  };
};
const script = { scenes: [
  { id: "s1", start: 0, duration: 4, purpose: "hook", headline: "Scattered work" },
  { id: "s2", start: 4, duration: 4, purpose: "feature", headline: "One place" },
  { id: "s3", start: 8, duration: 4, purpose: "feature", headline: "Automation" },
] };

(async () => {
  // 1) A login-walled capture is dropped, and its scene is identifiable as lost.
  {
    const assets = [shot(0, "s1"), shot(1, "s2")];
    const drops = [];
    const kept = await qaGateScreenshots({
      assets, jobDir, subject: "Trello", script,
      log: { log() {}, warn() {} }, onDrop: (d) => drops.push(d),
      // shot 0 hits a login wall; shot 1 is clean and on-topic
      _inspect: async () => ([
        { pass: false, problem: "login-wall", sees: "sign in form" },
        { pass: true, matchesScene: true, sees: "product board" },
      ]),
    });
    check("a login-walled capture is dropped", kept.length === 1, `kept ${kept.length}`);
    check("the broken capture is reported as recoverable", drops.length === 1 && drops[0].sceneId === "s1" && drops[0].recoverable === true, JSON.stringify(drops));
  }


  // 1b) A clean capture with no free scene is UNPINNED, not deleted — it is still
  //     real product photography and the composer's free pool can use it.
  {
    const a0 = shot(2, "s1"), a1 = shot(3, "s2");
    const drops = [];
    const kept = await qaGateScreenshots({
      assets: [a0, a1], jobDir, subject: "Trello", script,
      log: { log() {}, warn() {} }, onDrop: (d) => drops.push(d),
      _inspect: async () => ([
        { pass: true, matchesScene: true, sees: "board" },
        // clean, but belongs to a scene already taken -> no free home
        { pass: true, matchesScene: false, bestSceneId: "s1", sees: "pricing" },
      ]),
    });
    const survivor = kept.find((x) => x.path === a1.path);
    check("a clean but unmatched shot survives", !!survivor, "it was deleted");
    check("...and is unpinned so the pool can use it", !!survivor && survivor.sceneId == null, JSON.stringify(survivor && survivor.sceneId));
    check("...and its file is not deleted", fs.existsSync(path.join(jobDir, a1.path)));
    check("...and it is NOT reported as recoverable work", drops.every((d) => !d.recoverable));
  }

  // 2) The retry is fail-safe: with no site to consult it returns nothing rather
  //    than throwing into the render.
  {
    const out = await recaptureForScenes({
      job: { intent: {} }, script, jobDir, sceneIds: ["s1"], avoidUrls: [], topic: "Trello",
    });
    check("retry returns [] when there is no website to re-shoot", Array.isArray(out) && out.length === 0);
  }

  // 3) No orphaned scenes => no work, no capture spend.
  {
    const out = await recaptureForScenes({
      job: { intent: { websiteUrl: "https://example.com" } }, script, jobDir,
      sceneIds: [], avoidUrls: [], topic: "Trello",
    });
    check("retry does nothing when nothing was dropped", Array.isArray(out) && out.length === 0);
  }

  try { fs.rmSync(jobDir, { recursive: true, force: true }); } catch { /* noop */ }
  console.log(failed ? `\n${failed} check(s) failed` : "\nscreenshot retry path holds");
  process.exit(failed ? 1 : 0);
})();
