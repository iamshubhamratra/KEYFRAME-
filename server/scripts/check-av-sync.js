#!/usr/bin/env node
// IS THE SCREEN SAYING WHAT THE NARRATOR IS SAYING, SECOND BY SECOND?
//
// This walks the production path end to end for a set of film shapes: a script
// of N scenes is folded to the chosen pack's beat ceiling exactly as
// pipeline.foldScriptToRenderer does it, the pack's renderer builds the
// composition, and then every second of runtime is checked against the scene
// whose narration is playing at that moment. The voiceover is synthesized per
// scene and mixed at that scene's own start (pipeline.retimeScenesToVo), so the
// scene being spoken at time T is a fact about the script, not a guess.
//
// Three numbers per case:
//   in-sync        the frame carries the copy of the scene being spoken
//   shared frame   it carries that scene AND a neighbour's (a merged beat)
//   OFF            it carries only some OTHER scene's copy — the defect
//
// Measured before the 2026-08-24 repair, on the bundled-template path (the
// LONG FORM shelf): a 300s / 60-scene film was in sync for 33% of its runtime
// and off for 9%; a 600s film was in sync for 17%. The family renderers were
// worse in a way this gate cannot even score — they stopped drawing at scene 30,
// so the last two minutes were one held frame (see check:coverage).
//
//   node scripts/check-scene-coverage.js   # does every scene reach the screen
//   node scripts/check-av-sync.js          # does it reach it AT THE RIGHT TIME

const { PACK_RENDERERS, foldScriptToRenderer } = require("../src/services/pipeline");
const sceneKit = require("../src/services/scene_kit");
const frameManifest = require("../src/services/frame_manifest");

function makeScript(n, total) {
  const raw = []; let sum = 0;
  for (let i = 0; i < n; i++) { const d = 3 + ((i * 7) % 9); raw.push(d); sum += d; }
  const k = total / sum;
  const scenes = []; let t = 0;
  raw.forEach((d0, i) => {
    const d = Math.round(d0 * k * 100) / 100;
    const tag = `MARK${String(i + 1).padStart(3, "0")}`;
    scenes.push({
      id: `s${i + 1}`, start: Math.round(t * 100) / 100, duration: d,
      kind: i === 0 ? "hook" : i === n - 1 ? "cta" : "point",
      purpose: i === 0 ? "hook" : i === n - 1 ? "cta" : "point",
      headline: `${tag} headline`, title: `${tag} headline`,
      onScreenText: [`${tag} headline`],
      subtext: `${tag} supporting line for this beat.`,
      bullets: [`${tag} first point`, `${tag} second point`],
      voiceover: `${tag} narration for scene ${i + 1}.`,
    });
    t += d;
  });
  return { title: "Sync probe", scenes };
}

const OM_RE = new RegExp("window\\.OM_SCENES\\s*=\\s*('(?:[^'\\\\]|\\\\.)*'|\"(?:[^\"\\\\]|\\\\.)*\")\\s*;");
const BLK_RE = new RegExp("<script type=\"__bundler/template\"[^>]*>([\\s\\S]*?)</script>", "i");
const tagsOf = (v) => {
  const raw = typeof v === "string" ? v : JSON.stringify(v == null ? "" : v);
  const flat = raw.replace(/<[^>]*>/g, "").replace(/\s+/g, "");
  return [...new Set([...(raw.match(/MARK(\d\d\d)/g) || []), ...(flat.match(/MARK(\d\d\d)/g) || [])].map((s) => parseInt(s.slice(4), 10)))];
};

// What is on screen during each window of the film. Bundled templates publish a
// scene LIST (durations, no absolute times); every other renderer emits clips
// carrying their own start + duration.
function windowsOf(html) {
  const blk = BLK_RE.exec(html);
  if (blk) {
    let page; try { page = JSON.parse(blk[1]); } catch { page = ""; }
    const m = OM_RE.exec(page || "");
    if (m) {
      const lit = m[1];
      const beats = JSON.parse(lit[0] === '"' ? JSON.parse(lit) : lit.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, "\\"));
      const out = []; let t = 0;
      for (const b of beats) {
        const d = Number(b.dur) || 0;
        out.push({ start: t, end: t + d, tags: tagsOf(b) });
        t = Math.round((t + d) * 100) / 100;
      }
      return out;
    }
  }
  // clip divs: <div class="clip …" data-start="12.3" data-duration="4.5">…</div>
  const out = [];
  const re = /<div[^>]*class="[^"]*\bclip\b[^"]*"[^>]*data-start="([\d.]+)"[^>]*data-duration="([\d.]+)"[^>]*>/g;
  let m;
  const opens = [];
  while ((m = re.exec(html))) opens.push({ at: m.index, start: parseFloat(m[1]), dur: parseFloat(m[2]) });
  opens.forEach((o, i) => {
    const body = html.slice(o.at, i + 1 < opens.length ? opens[i + 1].at : html.length);
    out.push({ start: o.start, end: o.start + o.dur, tags: tagsOf(body) });
  });
  return out;
}

function run(label, renderer, pack, { total, n }) {
  const R = renderer === "scene-kit" ? { composer: sceneKit } : PACK_RENDERERS[renderer];
  if (!R) return null;
  const script = makeScript(n, total);
  const folded = foldScriptToRenderer(script, pack, "sync-probe");
  const scenes = folded.scenes;
  // JUDGE AGAINST THE SCENES THE SCRIPT WROTE, NOT THE ONES THE FOLD LEFT.
  //
  // When two scenes are folded into one they also share one narration clip — but
  // the narrator still reads both sentences, in order, across that clip. So the
  // words being spoken at time T are still the ORIGINAL scene's, and the frame is
  // in sync only if it carries THAT scene's copy. Scoring against the folded list
  // would call a merged beat correct for its whole window and quietly reward the
  // fold for erasing the boundary it was supposed to preserve.
  const orig = script.scenes;
  let html = "";
  try {
    const built = R.composer.buildComposition({
      storyboard: { title: script.title, brand: "Probe", durationSec: total, orientation: "horizontal", scenes },
      dims: { width: 1920, height: 1080, fps: 30 },
      framePack: pack, assets: [], captionCues: [],
      template: (frameManifest.getManifest(pack) || {}).template,
    });
    html = String((built && (built.indexHtml || built.html)) || "");
  } catch (e) {
    console.log(`  ${label.padEnd(26)} BUILD FAILED: ${String(e.message).slice(0, 70)}`);
    return null;
  }
  const win = windowsOf(html);
  if (!win.length) { console.log(`  ${label.padEnd(26)} no clips found`); return null; }
  const spokenAt = (T) => {
    for (let i = 0; i < orig.length; i++) if (T >= orig[i].start && T < orig[i].start + orig[i].duration) return i;
    return orig.length - 1;
  };
  const marksOf = orig.map((sc) => tagsOf(sc.headline));
  // Everything whose window contains T is ON SCREEN at T — a film layers a
  // full-length background clip under its scene clips, so taking the first match
  // reads the backdrop and reports every frame as empty.
  const at = (T) => {
    const hits = win.filter((w) => T >= w.start && T < w.end);
    const src = hits.length ? hits : [win[win.length - 1]];
    return { tags: [...new Set(src.flatMap((w) => w.tags))] };
  };
  const secs = Math.floor(total);
  let ok = 0, shared = 0, off = 0;
  const bad = [];
  for (let T = 0; T < secs; T++) {
    const want = marksOf[spokenAt(T)] || [];
    const have = at(T).tags;
    const hit = want.some((x) => have.includes(x));
    if (!hit) { off++; if (bad.length < 4) bad.push(`t=${T}s voice=${want.join("/")} screen=${have.join("/") || "(nothing)"}`); }
    else if (have.some((x) => !want.includes(x))) shared++;
    else ok++;
  }
  const p = (x) => String(Math.round(100 * x / secs) + "%").padStart(5);
  console.log(`  ${label.padEnd(26)} ${String(n).padStart(3)} scenes -> ${String(scenes.length).padStart(3)} beats   in-sync ${p(ok + shared)}  (sole ${p(ok)} shared ${p(shared)})   OFF ${p(off)}`);
  if (bad.length) console.log(`      ${bad.join(" | ")}`);
  return { off: off / secs };
}

// One representative pack per renderer style, at the lengths that actually ship.
//
// `maxOff` is a RATCHET at what has been measured, so the numbers can only
// improve. It is not zero on the long bundled-kit films and cannot be: that
// engine refuses an OM_SCENES list over 50 entries, so a 60-70 scene script has
// to put some scenes on a shared beat, and a shared beat can only lead with one
// of them. Every other renderer draws a beat per scene and is held at zero.
const CASES = [
  ["bundled kit 90s", "omelette", "field-notes", { total: 90, n: 26 }, 0.00],
  ["bundled kit 300s", "omelette", "field-notes", { total: 300, n: 60 }, 0.11],
  ["bundled kit 600s", "omelette", "field-notes", { total: 600, n: 70 }, 0.11],
  ["family 90s", "poster-loud", "poster-loud", { total: 90, n: 26 }, 0.00],
  ["family 300s", "poster-loud", "poster-loud", { total: 300, n: 50 }, 0.00],
  ["family 600s", "poster-loud", "poster-loud", { total: 600, n: 70 }, 0.00],
  ["scene-kit 300s", "scene-kit", "poster-loud", { total: 300, n: 50 }, 0.00],
  ["scene-kit 600s", "scene-kit", "poster-loud", { total: 600, n: 70 }, 0.00],
];

console.log("\n  case                       script -> beats            screen matches the voice");
const results = CASES.map(([l, r, pk, c, maxOff]) => {
  const res = run(l, r, pk, c);
  return res ? { ...res, label: l, maxOff } : null;
}).filter(Boolean);
console.log("");

// The bar: a film may share a frame between two scenes (a merged beat is honest —
// both scenes' words are on it), but it may not spend more runtime than its own
// ratchet showing ONLY a scene that is not being spoken.
const failed = results.filter((r) => r.off > r.maxOff + 0.005);
if (failed.length) {
  for (const f of failed) {
    console.error(`  ${f.label}: ${Math.round(f.off * 100)}% of the runtime shows a scene that is not being narrated (ceiling ${Math.round(f.maxOff * 100)}%)`);
  }
  console.error(`\n${failed.length} case(s) regressed.\n`);
  process.exit(1);
}
console.log(`the picture and the voiceover stay together (${results.length} cases)
`);
