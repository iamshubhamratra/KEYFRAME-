// VIDEO EDIT STAGE HANDLER REGISTRY — registers every phase's stage handlers that exist in this checkout.
//
// WHY THIS EXISTS. The pipeline is built phase by phase, and the runner must work at every step: a
// checkout where only phases 2–3 exist runs those stages and reports PIPELINE_PARTIAL; one where the
// B-roll or plan phases landed runs them too — without anyone editing the runner. So handler modules are
// discovered by file name (`phase<N>.js` next to this file) and required only when the file exists. A
// module that exists but throws while loading (or registering) is a real bug and must never silently shrink
// the pipeline: it is logged and re-thrown.
// Order matters for one reason: phase4 (BUILDING_EDIT_PLAN) derives its dependency list from the stages
// already registered (SEARCHING_BROLL / SCORING_ASSETS are optional), so it registers after phase5.
//
// CONTRACT:
//   registerAll(registry = stages.defaultRegistry, deps = {}, { dir = __dirname, log = console }) -> registry
//     deps: { phase2?: {...}, phase3?: {...}, … } — passed as the second argument of each module's register().
//   phasesIn(dir = __dirname) -> ['phase2', 'phase3', 'phase5', 'phase4', …later phases ascending]
//   REGISTER_ORDER

const fs = require("node:fs");
const path = require("node:path");
const stagesModule = require("../stages");

const REGISTER_ORDER = Object.freeze(["phase2", "phase3", "phase5", "phase4"]);

function phasesIn(dir = __dirname) {
  const found = fs.readdirSync(dir)
    .map((f) => /^phase(\d+)\.js$/.exec(f))
    .filter(Boolean)
    .map((m) => ({ name: `phase${m[1]}`, n: Number(m[1]) }));
  const names = new Set(found.map((f) => f.name));
  const known = REGISTER_ORDER.filter((n) => names.has(n));
  const rest = found.filter((f) => !REGISTER_ORDER.includes(f.name)).sort((a, b) => a.n - b.n).map((f) => f.name);
  return [...known, ...rest];
}

function registerAll(registry = stagesModule.defaultRegistry, deps = {}, { dir = __dirname, log = console } = {}) {
  const say = (msg) => { try { (log && (log.error || log.log) || console.error).call(log, msg); } catch { /* noop */ } };
  for (const name of phasesIn(dir)) {
    const file = path.join(dir, `${name}.js`);
    let mod;
    try {
      mod = require(file);
    } catch (e) {
      say(`[video-edit] stage handlers ${name} failed to load: ${e && e.message ? e.message : e}`);
      throw e;
    }
    if (!mod || typeof mod.register !== "function") {
      const err = new TypeError(`video_edit/handlers/${name}.js does not export register(registry)`);
      say(`[video-edit] stage handlers ${name} failed to load: ${err.message}`);
      throw err;
    }
    try {
      mod.register(registry, deps && typeof deps === "object" && deps[name] ? deps[name] : {});
    } catch (e) {
      say(`[video-edit] stage handlers ${name} failed to register: ${e && e.message ? e.message : e}`);
      throw e;
    }
  }
  return registry;
}

module.exports = { registerAll, phasesIn, REGISTER_ORDER };
