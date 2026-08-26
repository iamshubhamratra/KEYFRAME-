#!/usr/bin/env node
// DOES THE FILM SHOW WHAT IT IS SAYING, ALL THE WAY TO THE END?
//
// Every renderer builds its composition from the storyboard's scene list, and
// several of them capped that list with a bare `slice(0, N)` written when a film
// was 30s long. The cap is silent and it is not a styling choice: the voiceover
// is synthesized per SCENE and mixed at that scene's own start (see
// pipeline.retimeScenesToVo), so a scene the renderer dropped is still narrated
// — over whatever frame happened to be on screen when the film ran out of beats.
//
// Measured before this gate existed, on a 300s / 50-scene script:
//   template_engine (15 families + 7 dedicated ports)  30 of 50 scenes drawn,
//                                                      picture ends at 176s
//   momentum, showcase                                 same 30-scene cap
//   genesis                                            14 of 50, picture ends at 84s
//   bauhaus / bloom / blueprint                        12 of 50 (short films too:
//                                                      a 60s script is ~17 scenes)
// The film still ENCODED to 300s because the renderer captures the job's length,
// so the tail was the last frame held under two minutes of narration. Nothing
// failed: lint, contrast, identity and the density gate all measure the
// composition, and the composition was internally consistent — just short.
//
// The invariant this gate holds: every scene's own copy reaches the screen, and
// the last scene's copy appears no earlier than the point where its narration
// starts. Renderers may MERGE adjacent scenes onto one clip (the boundaries and
// the running time survive) but may never drop the tail.
//
//   node scripts/check-scene-coverage.js            # every renderer, every length
//   node scripts/check-scene-coverage.js poster-loud
//
// Exit 1 on any renderer that loses a scene at a length it is allowed to run.

const { PACK_RENDERERS, LONGFORM_RENDERER_SEC, foldScriptToRenderer } = require("../src/services/pipeline");
const sceneKit = require("../src/services/scene_kit");

// Varied scene lengths on purpose: with equal-length scenes a truncation plus a
// rescale can land back in place and hide the loss.
function makeScenes(n, total) {
  const raw = [];
  let sum = 0;
  for (let i = 0; i < n; i++) { const d = 3 + ((i * 7) % 9); raw.push(d); sum += d; }
  const k = total / sum;
  const out = [];
  let t = 0;
  raw.forEach((d0, i) => {
    const d = Math.round(d0 * k * 100) / 100;
    const tag = `MARK${String(i + 1).padStart(3, "0")}`;
    out.push({
      id: `s${i + 1}`,
      start: Math.round(t * 100) / 100,
      duration: d,
      kind: i === 0 ? "hook" : i === n - 1 ? "cta" : "point",
      purpose: i === 0 ? "hook" : i === n - 1 ? "cta" : "point",
      headline: `${tag} headline`,
      title: `${tag} headline`,
      onScreenText: [`${tag} headline`],
      subtext: `${tag} supporting line for this beat.`,
      bullets: [`${tag} first point`, `${tag} second point`],
      voiceover: `${tag} narration for scene ${i + 1}.`,
    });
    t += d;
  });
  return out;
}

// A script's scene count is set by the script prompt's pacing, not by us — long
// films stretch scene LENGTH but still land near these counts (see
// prompts/system_script.md and script.normalizeScript).
const LENGTHS = [
  { total: 30, n: 9 },
  { total: 60, n: 17 },
  { total: 90, n: 26 },
  { total: 180, n: 36 },
  { total: 300, n: 50 },
  { total: 600, n: 70 },
];

function probe(composer, framePack, { total, n }) {
  const raw = makeScenes(n, total);
  // The fold the pipeline applies before the storyboard and the voiceover exist
  // (pipeline.foldScriptToRenderer). Two scenes that must share a frame are
  // merged into one scene here, so they also share one narration clip — which is
  // why a merged scene still counts as covered below: its copy IS on the frame
  // while its narration plays. Skipping this would measure a path production no
  // longer takes.
  const scenes = foldScriptToRenderer({ scenes: raw }, framePack, "coverage").scenes;
  const storyboard = {
    title: "Coverage probe", brand: "Probe", url: "probe.example",
    durationSec: total, orientation: "horizontal", scenes,
  };
  let html = "";
  try {
    const built = composer.buildComposition({
      storyboard,
      dims: { width: 1920, height: 1080, fps: 30 },
      framePack, assets: [], captionCues: [], scriptCues: null, scriptOverlay: false,
      brandSkin: null, templatePlan: null, authoredScenes: null, layoutPlan: null,
      seedKey: "coverage", dressing: null,
    });
    html = String((built && (built.indexHtml || built.html)) || "");
  } catch (e) {
    return { error: String((e && e.message) || e).slice(0, 90) };
  }
  // A kinetic family animates its display type PER CHARACTER, so the headline
  // reaches the DOM as `<span>M</span><span>A</span>…` and a raw search finds
  // nothing. Read the tag-stripped, whitespace-squashed text too — the same
  // reading av_align.js had to learn for exactly this reason.
  const flat = html.replace(/<[^>]*>/g, "").replace(/\s+/g, "");
  const shown = new Set(
    [...(html.match(/MARK(\d\d\d)/g) || []), ...(flat.match(/MARK(\d\d\d)/g) || [])]
      .map((s) => parseInt(s.slice(4), 10))
  );
  const missing = [];
  for (let i = 1; i <= n; i++) if (!shown.has(i)) missing.push(i);
  const last = shown.size ? Math.max(...shown) : 0;
  // When does the picture stop advancing? The last scene whose copy is anywhere
  // in the composition; after its window nothing new can appear.
  const lastEnd = last ? raw[last - 1].start + raw[last - 1].duration : 0;
  return { n, shown: shown.size, missing, lastEnd: Math.round(lastEnd), total };
}

// WHAT A RENDERER IS ALLOWED TO LOSE, and why. Zero everywhere except the
// bundled-template engine, which refuses an OM_SCENES list over 50 entries
// outright (it draws a full-frame error slate for the whole film). A 70-scene
// script therefore cannot give every scene its own beat there; the ones that
// share a beat still have their words on the frame in a supporting slot, but a
// few lose them to the shape's own copy budget. A ratchet, not a target.
const ALLOWED_LOST = { omelette: { 600: 5 } };

const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const rows = [];
const entries = Object.entries(PACK_RENDERERS).concat([["scene-kit", { composer: sceneKit, longFormOk: true, desc: "scene-kit (control)" }]]);

for (const [name, R] of entries) {
  if (only.length && !only.includes(name)) continue;
  if (!R || !R.composer || typeof R.composer.buildComposition !== "function") continue;
  for (const L of LENGTHS) {
    // A renderer without longFormOk never SEES a film past the hand-off length —
    // pipeline routes those jobs to scene-kit — so measuring it there would
    // report a defect that cannot reach a viewer.
    if (!R.longFormOk && L.total > LONGFORM_RENDERER_SEC) continue;
    const packFor = name === "omelette" ? "field-notes" : name === "scene-kit" ? "poster-loud" : name;
    const res = probe(R.composer, packFor, L);
    rows.push({ name, ...L, ...res });
  }
}

let bad = 0;
let lastName = "";
console.log("\n  renderer              film   scenes  drawn  never-shown  picture ends");
for (const r of rows) {
  if (r.error) { console.log(`  ${r.name.padEnd(20)} ${String(r.total + "s").padStart(5)}   BUILD FAILED: ${r.error}`); bad++; continue; }
  const lost = r.missing.length;
  const allowed = ((ALLOWED_LOST[r.name] || {})[r.total]) || 0;
  const flag = lost > allowed ? "  <-- LOSES COPY" : (lost ? `  (${lost} share a beat, engine cap)` : "");
  if (lost > allowed) bad++;
  const nm = r.name === lastName ? "" : r.name;
  lastName = r.name;
  console.log(
    `  ${nm.padEnd(20)} ${String(r.total + "s").padStart(5)}   ${String(r.n).padStart(6)}  ${String(r.shown).padStart(5)}  ${String(lost).padStart(11)}  ${String(r.lastEnd + "s").padStart(12)}${flag}`
  );
}

console.log("");
if (bad) {
  console.error(`${bad} renderer/length combination(s) drop a narrated scene — that copy is spoken over a held frame.\n`);
  process.exit(1);
}
console.log(`every renderer draws every narrated scene (${rows.length} combinations)\n`);
